import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ALLY_BASE_POSITION,
  ALLY_DEFENSE_LINE,
  ALLY_SIEGE_POSITION,
  ENEMY_BASE_POSITION,
  ENEMY_SIEGE_POSITION,
  EST_SECONDS_PER_SERVER_STEP,
  HOME_THREAT_RANGE,
  SERVER_COMBAT_RANGE,
  SERVER_MOVE_SCALE,
  type DefenseUnit,
  type UnitSide,
} from '../utils/veryusDefense/constants';

export type AnimatedUnit = DefenseUnit & {
  opacity?: number;
  fadingOut?: boolean;
  isMarching?: boolean;
  isVisuallyFighting?: boolean;
  isSiegingBase?: boolean;
  isDefendingBase?: boolean;
  isSpawning?: boolean;
};

const DEATH_MS = 750;
const DEATH_HP_DRAIN_MS = 650;
const SPAWN_FADE_MS = 350;
const HP_DROP_ANIM_MS = 520;
const SPAWN_WALKOUT_MS = 1_800;

type UnitState = {
  data: DefenseUnit;
  target: { position: number; hp: number };
  display: { position: number; hp: number };
  spawnBase: number;
  spawnedAt: number;
  targetUpdatedAt: number;
  dyingAt?: number;
  pendingDeath?: boolean;
  deathHpStartedAt?: number;
  deathHpStart?: number;
  hpDropFrom?: number;
  hpDropStartedAt?: number;
  hpDropDuration?: number;
  hpDropTarget?: number;
};

function spawnBaseForSide(side: UnitSide): number {
  return side === 'ally' ? ALLY_BASE_POSITION : ENEMY_BASE_POSITION;
}

function hashDelay(id: string, slots: number, ms: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) % slots;
  }
  return h * ms;
}

function marchSpeedPerSec(unit: DefenseUnit): number {
  return (unit.speed * SERVER_MOVE_SCALE) / EST_SECONDS_PER_SERVER_STEP;
}

function unitsNearPosition(
  self: UnitState,
  all: UnitState[],
  position: number,
  range: number
): boolean {
  if (self.dyingAt || self.pendingDeath || (self.data.siegeTicks ?? 0) > 0) return false;
  for (const other of all) {
    if (other.dyingAt || other.pendingDeath || other.data.side === self.data.side) continue;
    if ((other.data.siegeTicks ?? 0) > 0) continue;
    if (Math.abs(position - other.display.position) <= range) {
      return true;
    }
  }
  return false;
}

function isServerCombat(self: UnitState, all: UnitState[]): boolean {
  if (self.dyingAt || self.pendingDeath || (self.data.siegeTicks ?? 0) > 0) return false;
  for (const other of all) {
    if (other.dyingAt || other.pendingDeath || other.data.side === self.data.side) continue;
    if ((other.data.siegeTicks ?? 0) > 0) continue;
    if (Math.abs(self.target.position - other.target.position) <= SERVER_COMBAT_RANGE) {
      return true;
    }
  }
  return false;
}

function isAllyHomeThreatened(all: UnitState[]): boolean {
  return all.some(
    (u) =>
      u.data.side === 'enemy' &&
      !u.dyingAt &&
      !u.pendingDeath &&
      u.display.position <= ALLY_BASE_POSITION + HOME_THREAT_RANGE
  );
}

function findDisplayFoe(self: UnitState, all: UnitState[]): UnitState | null {
  let nearest: UnitState | null = null;
  let nearestDist = Infinity;
  for (const other of all) {
    if (other.dyingAt || other.pendingDeath || other.data.side === self.data.side) continue;
    if ((other.data.siegeTicks ?? 0) > 0) continue;
    const dist = Math.abs(self.display.position - other.display.position);
    if (dist <= SERVER_COMBAT_RANGE + 2 && dist < nearestDist) {
      nearest = other;
      nearestDist = dist;
    }
  }
  return nearest;
}

function estimateIncomingDps(foe: DefenseUnit): number {
  return Math.max(8, (foe.attack * 1.6) / EST_SECONDS_PER_SERVER_STEP);
}

function clearHpDrop(entry: UnitState) {
  entry.hpDropFrom = undefined;
  entry.hpDropStartedAt = undefined;
  entry.hpDropDuration = undefined;
  entry.hpDropTarget = undefined;
}

function scheduleHpDrop(entry: UnitState, fromHp: number, toHp: number, now: number) {
  if (toHp >= fromHp - 2) {
    entry.display.hp = toHp;
    clearHpDrop(entry);
    return;
  }
  const dropRatio = fromHp > 0 ? (fromHp - toHp) / fromHp : 1;
  const duration =
    dropRatio > 0.35 ? HP_DROP_ANIM_MS : Math.max(180, HP_DROP_ANIM_MS * dropRatio * 1.4);
  entry.hpDropFrom = fromHp;
  entry.hpDropTarget = toHp;
  entry.hpDropStartedAt = now;
  entry.hpDropDuration = duration;
}

function startDeathFade(entry: UnitState, at: number, staggerMs: number) {
  if (!entry.pendingDeath && !entry.dyingAt) {
    entry.pendingDeath = true;
    entry.deathHpStart = entry.display.hp;
    entry.deathHpStartedAt = at + staggerMs;
    clearHpDrop(entry);
  }
}

function finishDeath(entry: UnitState, at: number) {
  entry.pendingDeath = false;
  entry.dyingAt = at;
  entry.target.hp = 0;
  entry.display.hp = 0;
}

function maxPositionFromBase(entry: UnitState, now: number): number {
  const speed = marchSpeedPerSec(entry.data);
  const walked = speed * Math.max(0, (now - entry.spawnedAt) / 1000);
  if (entry.data.side === 'ally') {
    return entry.spawnBase + walked;
  }
  return entry.spawnBase - walked;
}

/** 스폰 직후 너무 앞서 나가는 것만 막고, 뒤로 밀지는 않음 */
function clampSpawnWalkout(entry: UnitState, pos: number, now: number): number {
  if (now - entry.spawnedAt > SPAWN_WALKOUT_MS) return pos;
  const cap = maxPositionFromBase(entry, now);
  if (entry.data.side === 'ally') {
    if (pos > cap) return cap;
    return Math.max(entry.spawnBase, pos);
  }
  if (pos < cap) return cap;
  return Math.min(entry.spawnBase, pos);
}

function marchDir(side: UnitSide): number {
  return side === 'ally' ? 1 : -1;
}

/** 행군 중 서버보다 앞서 있을 때 뒤로 당기지 않고 앵커만 재설정 */
function acceptServerPosition(entry: UnitState, serverPos: number, now: number): void {
  const prev = entry.target.position;
  const dir = marchDir(entry.data.side);
  const isForward =
    dir > 0 ? serverPos >= prev - 0.05 : serverPos <= prev + 0.05;

  if (isForward) {
    entry.target.position = serverPos;
  } else {
    entry.target.position = entry.display.position;
  }
  entry.targetUpdatedAt = now;
}

function clampForwardOnly(side: UnitSide, prev: number, next: number): number {
  if (side === 'ally') return Math.max(prev, next);
  return Math.min(prev, next);
}

function extrapolatedMarchPosition(entry: UnitState, now: number): number {
  const unit = entry.data;
  const speed = marchSpeedPerSec(unit);
  const dir = unit.side === 'ally' ? 1 : -1;
  const elapsed = (now - entry.targetUpdatedAt) / 1000;
  let pos = entry.target.position + dir * speed * elapsed;
  if (unit.side === 'ally') {
    pos = Math.min(pos, ALLY_SIEGE_POSITION);
  } else {
    pos = Math.max(pos, ENEMY_SIEGE_POSITION);
  }
  return pos;
}

export function useBattlefieldUnits(liveUnits: DefenseUnit[]): AnimatedUnit[] {
  const stateRef = useRef<Map<string, UnitState>>(new Map());
  const [tick, setTick] = useState(0);

  const liveKey = liveUnits
    .map((u) => `${u.id}:${u.position}:${u.hp}:${u.siegeTicks ?? 0}`)
    .join('|');

  useEffect(() => {
    const state = stateRef.current;
    const liveIds = new Set(liveUnits.map((u) => u.id));
    const now = performance.now();
    let deathStagger = 0;

    for (const unit of liveUnits) {
      const existing = state.get(unit.id);

      if (unit.hp <= 0) {
        if (existing && !existing.dyingAt && !existing.pendingDeath) {
          existing.data = unit;
          existing.target = { position: unit.position, hp: 0 };
          startDeathFade(existing, now, hashDelay(unit.id, 5, 90));
        }
        continue;
      }

      if (existing) {
        if (existing.dyingAt || existing.pendingDeath) continue;
        const posChanged = existing.target.position !== unit.position;
        const hpChanged = existing.target.hp !== unit.hp;
        existing.data = unit;
        if (posChanged) {
          acceptServerPosition(existing, unit.position, now);
        }
        if (hpChanged) {
          const prevTargetHp = existing.target.hp;
          existing.target.hp = unit.hp;
          if (unit.hp < prevTargetHp) {
            scheduleHpDrop(existing, existing.display.hp, unit.hp, now);
          } else if (unit.hp > existing.display.hp) {
            existing.display.hp = unit.hp;
            clearHpDrop(existing);
          }
        }
      } else {
        const base = spawnBaseForSide(unit.side);
        const spawnDelay = hashDelay(unit.id, 6, 70);
        const spawnAt = now + spawnDelay;
        state.set(unit.id, {
          data: unit,
          target: { position: unit.position, hp: unit.hp },
          display: { position: base, hp: unit.hp },
          spawnBase: base,
          spawnedAt: spawnAt,
          targetUpdatedAt: now,
        });
      }
    }

    state.forEach((entry, id) => {
      if (!liveIds.has(id) && !entry.dyingAt && !entry.pendingDeath) {
        startDeathFade(entry, now, deathStagger * 120 + hashDelay(id, 4, 70));
        deathStagger += 1;
      }
    });
  }, [liveKey, liveUnits]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let paused = document.visibilityState === 'hidden';

    const onVisibility = () => {
      paused = document.visibilityState === 'hidden';
      if (!paused) last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const frame = (now: number) => {
      if (paused) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const state = stateRef.current;
      const active = [...state.values()].filter((s) => !s.dyingAt && !s.pendingDeath);
      const homeThreat = isAllyHomeThreatened(active);

      for (const [, entry] of state.entries()) {
        if (entry.pendingDeath && entry.deathHpStartedAt !== undefined) {
          if (now < entry.deathHpStartedAt) {
            continue;
          }
          const drainT = Math.min(1, (now - entry.deathHpStartedAt) / DEATH_HP_DRAIN_MS);
          const startHp = entry.deathHpStart ?? entry.display.hp;
          entry.display.hp = Math.max(0, startHp * (1 - drainT));
          if (drainT >= 1) {
            finishDeath(entry, now);
          }
          continue;
        }

        if (entry.dyingAt) {
          if (now - entry.dyingAt > DEATH_MS) {
            state.delete(entry.data.id);
          }
          continue;
        }

        if (entry.target.hp <= 0) {
          startDeathFade(entry, now, 0);
          continue;
        }

        const unit = entry.data;
        const sieging = (unit.siegeTicks ?? 0) > 0;
        const serverCombat = !sieging && isServerCombat(entry, active);
        const visualCombat =
          !sieging &&
          (serverCombat ||
            unitsNearPosition(entry, active, entry.display.position, SERVER_COMBAT_RANGE + 1.5));
        const prevPos = entry.display.position;
        let pos = prevPos;
        const speed = marchSpeedPerSec(unit);
        const dir = marchDir(unit.side);

        if (sieging) {
          const siegePos =
            unit.side === 'ally' ? ALLY_SIEGE_POSITION : ENEMY_SIEGE_POSITION;
          pos += (siegePos - pos) * Math.min(1, dt * 10);
        } else if (visualCombat) {
          const foe = findDisplayFoe(entry, active);
          if (foe) {
            const meet =
              unit.side === 'ally'
                ? Math.min(pos, foe.display.position - 1.2)
                : Math.max(pos, foe.display.position + 1.2);
            pos += (meet - pos) * Math.min(1, dt * 16);
          }
        } else if (
          homeThreat &&
          unit.side === 'ally' &&
          entry.display.position > ALLY_DEFENSE_LINE + 2
        ) {
          pos -= speed * dt;
          pos = Math.max(pos, ALLY_DEFENSE_LINE - 1);
        } else {
          pos += dir * speed * dt;
          const extrapolated = extrapolatedMarchPosition(entry, now);
          const serverAhead =
            unit.side === 'ally' ? extrapolated > pos : extrapolated < pos;
          if (serverAhead) {
            pos += (extrapolated - pos) * Math.min(1, dt * 8);
          }
          pos = clampForwardOnly(unit.side, prevPos, pos);
        }

        entry.display.position = clampSpawnWalkout(entry, pos, now);

        if (
          entry.hpDropStartedAt !== undefined &&
          entry.hpDropDuration !== undefined &&
          entry.hpDropFrom !== undefined &&
          entry.hpDropTarget !== undefined
        ) {
          const t = Math.min(
            1,
            Math.max(0, (now - entry.hpDropStartedAt) / entry.hpDropDuration)
          );
          entry.display.hp =
            entry.hpDropFrom + (entry.hpDropTarget - entry.hpDropFrom) * t;
          if (t >= 1) {
            entry.display.hp = entry.hpDropTarget;
            clearHpDrop(entry);
          }
        } else if (visualCombat) {
          const foe = findDisplayFoe(entry, active);
          if (foe) {
            const dps = estimateIncomingDps(foe.data);
            entry.display.hp = Math.max(entry.target.hp, entry.display.hp - dps * dt);
          }
        }

        const serverHp = entry.target.hp;
        if (entry.hpDropStartedAt === undefined) {
          if (entry.display.hp > serverHp + 1) {
            entry.display.hp = Math.max(
              serverHp,
              entry.display.hp - (visualCombat ? 320 : 160) * dt
            );
          } else if (entry.display.hp < serverHp - 1) {
            entry.display.hp = Math.min(serverHp, entry.display.hp + 100 * dt);
          }
        }
      }

      setTick((t) => t + 1);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(raf);
    };
  }, []);

  return useMemo(() => {
    void tick;
    const now = performance.now();
    const all = [...stateRef.current.values()];
    const homeThreat = isAllyHomeThreatened(all);

    return all
      .map((entry) => {
        const sieging = (entry.data.siegeTicks ?? 0) > 0;
        const serverCombat = !sieging && !entry.pendingDeath && isServerCombat(entry, all);
        const visualCombat =
          !sieging &&
          !entry.pendingDeath &&
          (serverCombat ||
            unitsNearPosition(entry, all, entry.display.position, SERVER_COMBAT_RANGE + 1.5));
        const defendingBase =
          entry.data.side === 'ally' &&
          homeThreat &&
          entry.display.position <= ALLY_DEFENSE_LINE + 4 &&
          visualCombat;
        const hp = Math.max(0, Math.round(entry.display.hp));
        const spawnT = Math.min(1, (now - entry.spawnedAt) / SPAWN_FADE_MS);
        const spawnOpacity = entry.spawnedAt > now ? 0 : spawnT;
        const walkoutDone = now - entry.spawnedAt > SPAWN_WALKOUT_MS;
        const spawning = !entry.dyingAt && !entry.pendingDeath && !walkoutDone;
        const marching =
          !entry.dyingAt &&
          !entry.pendingDeath &&
          !visualCombat &&
          !sieging &&
          walkoutDone &&
          (entry.data.side === 'ally'
            ? entry.display.position < ALLY_SIEGE_POSITION - 0.5
            : entry.display.position > ENEMY_SIEGE_POSITION + 0.5);

        return {
          ...entry.data,
          position: entry.display.position,
          hp,
          fadingOut: !!(entry.dyingAt || entry.pendingDeath),
          opacity: entry.dyingAt
            ? Math.max(0, 1 - (now - entry.dyingAt) / DEATH_MS)
            : spawnOpacity,
          isMarching: marching,
          isVisuallyFighting: visualCombat && !entry.dyingAt,
          isSiegingBase: sieging && !entry.dyingAt && !entry.pendingDeath,
          isDefendingBase: defendingBase && !entry.dyingAt,
          isSpawning: spawning,
        };
      })
      .filter((u) => !u.fadingOut || (u.opacity ?? 1) > 0.02);
  }, [tick, liveKey]);
}
