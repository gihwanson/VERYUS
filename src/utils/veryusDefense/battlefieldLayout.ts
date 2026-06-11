import { lanePercentFromPosition, SERVER_COMBAT_RANGE, type DefenseUnit } from './constants';

export const BATTLEFIELD_ROWS = 5;

export type UnitBattleLayout = {
  laneLeft: number;
  bottomPct: number;
  zIndex: number;
  compact: boolean;
  showHp: boolean;
  showName: boolean;
  scale: number;
};

/** 유닛 id 기반 고정 행 — 버킷이 바뀌어도 세로 위치가 점프하지 않음 */
function stableRow(unitId: string): number {
  let hash = 0;
  for (let i = 0; i < unitId.length; i += 1) {
    hash = (hash * 31 + unitId.charCodeAt(i)) % BATTLEFIELD_ROWS;
  }
  return hash;
}

export const isUnitInCombatRange = (unit: DefenseUnit, all: DefenseUnit[]): boolean =>
  all.some(
    (other) =>
      other.id !== unit.id &&
      other.side !== unit.side &&
      other.hp > 0 &&
      Math.abs(other.position - unit.position) <= SERVER_COMBAT_RANGE
  );

export function computeUnitLayouts(
  units: DefenseUnit[],
  myUid?: string
): Map<string, UnitBattleLayout> {
  const layouts = new Map<string, UnitBattleLayout>();

  const allyAtPos = new Map<number, number>();
  const enemyAtPos = new Map<number, number>();

  for (const unit of units) {
    const rounded = Math.round(unit.position);
    const countMap = unit.side === 'ally' ? allyAtPos : enemyAtPos;
    const crowded = (countMap.get(rounded) ?? 0) >= 2;
    countMap.set(rounded, (countMap.get(rounded) ?? 0) + 1);

    const row = stableRow(unit.id);
    const inCombat = isUnitInCombatRange(unit, units);
    const isMine = unit.uid === myUid;
    const compact = crowded && !inCombat && !isMine;

    layouts.set(unit.id, {
      laneLeft: lanePercentFromPosition(unit.position),
      bottomPct: 12 + row * 11,
      zIndex: Math.round(unit.position) * 20 + row + (inCombat ? 100 : 0),
      compact,
      showHp: inCombat || isMine || !crowded,
      showName: inCombat || isMine || !crowded,
      scale: compact ? 0.72 : 1,
    });
  }

  return layouts;
}

type LayoutUnit = DefenseUnit & { fadingOut?: boolean };

export function findCombatZones(units: LayoutUnit[]): number[] {
  const zones = new Set<number>();
  for (const unit of units) {
    if (unit.hp <= 0 || unit.fadingOut) continue;
    for (const other of units) {
      if (
        other.id === unit.id ||
        other.side === unit.side ||
        other.hp <= 0 ||
        other.fadingOut
      ) {
        continue;
      }
      if (Math.abs(other.position - unit.position) <= SERVER_COMBAT_RANGE) {
        zones.add(lanePercentFromPosition((unit.position + other.position) / 2));
      }
    }
  }
  return [...zones];
}
