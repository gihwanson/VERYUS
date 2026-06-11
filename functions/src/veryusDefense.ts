import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const GAME_ID = 'veryusDefense';
const KST = 'Asia/Seoul';

const LANE_MIN = 0;
const LANE_MAX = 100;
const ALLY_BASE_POSITION = 5;
const ENEMY_BASE_POSITION = 95;
const ALLY_BASE_MAX_HP = 10000;
const ENEMY_BASE_MAX_HP = 10000;
const MAX_UNITS_PER_SIDE = 24;
const TICK_SECONDS = 10;
const TICKS_PER_RUN = 1;
const BOOST_TICK_COOLDOWN_MS = 750;
const COMBAT_RANGE = 10;
const MOVE_SCALE = 3;
const COMBAT_EXCHANGES = 1;
const DAILY_ATTENDANCE_REWARD = 80;
const VICTORY_BONUS_BASE = 120;
const BOSS_KILL_BONUS = 65;
const MVP_ROUND_BONUS = 200;
const MANUAL_SPAWN_BASE_COOLDOWN_MS = 30_000;
const AUTO_SPAWN_INTERVAL_TICKS = 2;
const ENEMY_SPAWN_INTERVAL_TICKS = 2;
const PRESENCE_TTL_MS = 45_000;

const UPGRADE_KEYS = [
  'attack', 'hp', 'spawnWeight', 'spawnCooldown', 'speed',
  'critChance', 'critDamage', 'armor', 'lifesteal', 'capitalBonus',
] as const;

type UpgradeKey = (typeof UPGRADE_KEYS)[number];
type PlayerUpgrades = Record<UpgradeKey, number>;

type UnitSide = 'ally' | 'enemy';

type SimUnit = {
  id: string;
  side: UnitSide;
  uid?: string;
  nickname: string;
  grade?: string;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  position: number;
  armor: number;
  critChance: number;
  critDamage: number;
  lifesteal: number;
  capitalBonus: number;
  isBoss?: boolean;
  siegeTicks?: number;
};

const SIEGE_DURATION_TICKS = 4;
const ALLY_SIEGE_POS = ENEMY_BASE_POSITION - 3;
const ENEMY_SIEGE_POS = ALLY_BASE_POSITION + 3;
/** 아군 기지 위협 시 방어선 (적 기지 포위 지점 근처) */
const ALLY_DEFENSE_LINE = ALLY_BASE_POSITION + 10;
const HOME_THREAT_RANGE = 18;

type MemberPower = {
  uid: string;
  nickname: string;
  grade?: string;
  activityScore: number;
  rank: number;
  baseAttack: number;
  baseHp: number;
  baseSpeed: number;
};

type ScoreWeights = { post: number; comment: number; lurking: number };

const DEFAULT_WEIGHTS: ScoreWeights = { post: 10, comment: 5, lurking: 0.1 };

const UPGRADE_COSTS: Record<UpgradeKey, { base: number; growth: number; max: number }> = {
  attack: { base: 80, growth: 1.22, max: 50 },
  hp: { base: 70, growth: 1.2, max: 50 },
  spawnWeight: { base: 60, growth: 1.18, max: 40 },
  spawnCooldown: { base: 90, growth: 1.25, max: 30 },
  speed: { base: 75, growth: 1.21, max: 40 },
  critChance: { base: 100, growth: 1.28, max: 30 },
  critDamage: { base: 110, growth: 1.3, max: 30 },
  armor: { base: 85, growth: 1.23, max: 40 },
  lifesteal: { base: 120, growth: 1.32, max: 25 },
  capitalBonus: { base: 95, growth: 1.26, max: 30 },
};

const createDefaultUpgrades = (): PlayerUpgrades =>
  UPGRADE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as PlayerUpgrades);

const calcBaseStats = (activityScore: number, rank: number, total: number) => {
  const rankRatio = total > 1 ? 1 - (rank - 1) / (total - 1) : 1;
  const rankBonus = 0.65 + rankRatio * 0.35;
  return {
    attack: Math.round(12 + Math.sqrt(activityScore + 1) * 2.8 * rankBonus),
    hp: Math.round(70 + activityScore * 0.75 * rankBonus),
    speed: 1.6 + rankBonus * 0.55,
  };
};

const applyUpgrades = (base: { attack: number; hp: number; speed: number }, upgrades: PlayerUpgrades) => ({
  attack: Math.round(base.attack * (1 + upgrades.attack * 0.06)),
  hp: Math.round(base.hp * (1 + upgrades.hp * 0.08)),
  speed: Number((base.speed * (1 + upgrades.speed * 0.04)).toFixed(2)),
  armor: upgrades.armor * 0.02,
  critChance: Math.min(0.45, upgrades.critChance * 0.012),
  critDamage: 1.5 + upgrades.critDamage * 0.08,
  lifesteal: upgrades.lifesteal * 0.015,
  capitalBonus: upgrades.capitalBonus * 0.05,
});

const getUpgradeCost = (key: UpgradeKey, level: number) => {
  const def = UPGRADE_COSTS[key];
  return Math.round(def.base * Math.pow(def.growth, level));
};

const calcKillReward = (unit: SimUnit) => {
  const base = unit.isBoss ? 140 : 22 + Math.round(unit.maxHp / 10);
  return Math.round(base);
};

const getKstDateKey = (date = new Date()): string => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
};

const calcManualCooldown = (level: number) =>
  Math.max(8000, Math.round(MANUAL_SPAWN_BASE_COOLDOWN_MS * (1 - level * 0.03)));

const gameRef = () => admin.firestore().doc(`games/${GAME_ID}`);
const roundRef = (roundId: string) => admin.firestore().doc(`games/${GAME_ID}/rounds/${roundId}`);
const unitsCol = (roundId: string) => admin.firestore().collection(`games/${GAME_ID}/rounds/${roundId}/units`);
const feedCol = (roundId: string) => admin.firestore().collection(`games/${GAME_ID}/rounds/${roundId}/feed`);
const playerRef = (uid: string) => admin.firestore().doc(`games/${GAME_ID}/players/${uid}`);
const memberPowerRef = (uid: string) => admin.firestore().doc(`games/${GAME_ID}/memberPower/${uid}`);
const presenceCol = () => admin.firestore().collection(`games/${GAME_ID}/presence`);

const DIFFICULTY_MIN = 0.5;
const DIFFICULTY_MAX = 3;

const clampDifficulty = (value: number): number =>
  Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, value));

const calcRoundEnemyScale = (roundNumber: number, difficultyMultiplier: number): number =>
  (1 + (roundNumber - 1) * 0.08) * difficultyMultiplier;

const getDifficultyMultiplier = async (): Promise<number> => {
  const meta = (await gameRef().get()).data() || {};
  const raw = Number(meta.difficultyMultiplier);
  if (!Number.isFinite(raw)) return 1;
  return clampDifficulty(raw);
};

const assertLeader = async (uid: string): Promise<void> => {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const role = String(snap.data()?.role || '');
  if (role === '리더') return;
  throw new HttpsError('permission-denied', '리더만 접근할 수 있습니다.');
};

const getUserIdentity = async (
  uid: string
): Promise<{ uid: string; nickname: string; grade: string }> => {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const data = snap.data() || {};
  return {
    uid,
    nickname: String(data.nickname || '').trim() || '알 수 없음',
    grade: String(data.grade || ''),
  };
};

const ensurePlayerProfile = async (uid: string): Promise<void> => {
  const identity = await getUserIdentity(uid);
  await playerRef(uid).set(identity, { merge: true });
};

const syncAllPlayerNicknames = async (): Promise<number> => {
  const db = admin.firestore();
  const [playersSnap, usersSnap] = await Promise.all([
    db.collection(`games/${GAME_ID}/players`).get(),
    db.collection('users').get(),
  ]);
  const userMap = new Map<string, { nickname: string; grade: string }>();
  usersSnap.forEach((docSnap) => {
    const data = docSnap.data();
    userMap.set(docSnap.id, {
      nickname: String(data.nickname || '').trim() || '알 수 없음',
      grade: String(data.grade || ''),
    });
  });

  const batch = db.batch();
  let count = 0;
  playersSnap.forEach((docSnap) => {
    const profile = userMap.get(docSnap.id);
    if (!profile) return;
    batch.set(
      docSnap.ref,
      { uid: docSnap.id, nickname: profile.nickname, grade: profile.grade },
      { merge: true }
    );
    count += 1;
  });
  if (count > 0) await batch.commit();
  return count;
};

const addFeed = async (roundId: string, type: string, message: string) => {
  await feedCol(roundId).add({
    type,
    message,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

const loadActivityRanking = async (): Promise<MemberPower[]> => {
  const db = admin.firestore();
  const [usersSnap, postsSnap, commentsSnap, visitsSnap, settingsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('posts').get(),
    db.collection('comments').get(),
    db.collection('boardVisits').get(),
    db.doc('appSettings/hallOfFame').get(),
  ]);

  const settingData = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const weights: ScoreWeights = {
    post: Number.isFinite(Number(settingData.postWeight)) ? Number(settingData.postWeight) : DEFAULT_WEIGHTS.post,
    comment: Number.isFinite(Number(settingData.commentWeight)) ? Number(settingData.commentWeight) : DEFAULT_WEIGHTS.comment,
    lurking: Number.isFinite(Number(settingData.lurkingWeight)) ? Number(settingData.lurkingWeight) : DEFAULT_WEIGHTS.lurking,
  };

  const userMap = new Map<string, { nickname: string; grade?: string }>();
  usersSnap.forEach((docSnap) => {
    const data = docSnap.data();
    userMap.set(docSnap.id, {
      nickname: String(data.nickname || '').trim() || '알 수 없음',
      grade: data.grade as string | undefined,
    });
  });

  const postCounter = new Map<string, number>();
  const commentCounter = new Map<string, number>();
  const visitCounter = new Map<string, number>();

  postsSnap.forEach((docSnap) => {
    const uid = String(docSnap.data().writerUid || '').trim();
    if (!uid || !userMap.has(uid)) return;
    postCounter.set(uid, (postCounter.get(uid) || 0) + 1);
  });

  commentsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.isEvaluatorAliasComment === true) return;
    if (String(data.writerNickname || '').trim() === '평가자') return;
    const uid = String(data.writerUid || '').trim();
    if (!uid || !userMap.has(uid)) return;
    commentCounter.set(uid, (commentCounter.get(uid) || 0) + 1);
  });

  visitsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = String(data.userId || docSnap.id || '').trim();
    if (!uid || !userMap.has(uid)) return;
    const lurkingScore = Number(data.lurkingScore);
    if (Number.isFinite(lurkingScore) && lurkingScore > 0) {
      visitCounter.set(uid, Math.round(lurkingScore * 10) / 10);
      return;
    }
    const legacy = Number(data.totalVisitCount);
    if (Number.isFinite(legacy) && legacy > 0) visitCounter.set(uid, Math.round(legacy * 10) / 10);
  });

  const allUids = new Set<string>([...postCounter.keys(), ...commentCounter.keys(), ...visitCounter.keys()]);
  const activityList: Array<{ uid: string; score: number }> = [];
  allUids.forEach((uid) => {
    const score =
      (postCounter.get(uid) || 0) * weights.post +
      (commentCounter.get(uid) || 0) * weights.comment +
      (visitCounter.get(uid) || 0) * weights.lurking;
    activityList.push({ uid, score });
  });

  userMap.forEach((_user, uid) => {
    if (!allUids.has(uid)) activityList.push({ uid, score: 0 });
  });

  activityList.sort((a, b) => b.score - a.score);
  const total = activityList.length;

  return activityList.map((entry, index) => {
    const user = userMap.get(entry.uid)!;
    const rank = index + 1;
    const base = calcBaseStats(entry.score, rank, total);
    return {
      uid: entry.uid,
      nickname: user.nickname,
      grade: user.grade,
      activityScore: entry.score,
      rank,
      baseAttack: base.attack,
      baseHp: base.hp,
      baseSpeed: base.speed,
    };
  });
};

export const scheduledVeryusDefenseMemberSync = onSchedule(
  { schedule: 'every 6 hours', timeZone: KST, region: 'asia-northeast3' },
  async () => {
    try {
      const ranking = await loadActivityRanking();
      const batch = admin.firestore().batch();
      ranking.forEach((member) => {
        batch.set(memberPowerRef(member.uid), {
          ...member,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      batch.set(gameRef(), {
        memberPowerCount: ranking.length,
        memberPowerSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      const syncedPlayers = await syncAllPlayerNicknames();
      logger.info('베리어스 디펜스 멤버 스탯 동기화 완료', {
        count: ranking.length,
        syncedPlayers,
      });
    } catch (error) {
      logger.error('베리어스 디펜스 멤버 스탯 동기화 실패', { error });
    }
  }
);

const ensureMemberPower = async (): Promise<MemberPower[]> => {
  const snap = await admin.firestore().collection(`games/${GAME_ID}/memberPower`).get();
  if (!snap.empty) {
    return snap.docs.map((d) => d.data() as MemberPower);
  }
  const ranking = await loadActivityRanking();
  const batch = admin.firestore().batch();
  ranking.forEach((m) => batch.set(memberPowerRef(m.uid), m, { merge: true }));
  await batch.commit();
  return ranking;
};

const ensureMemberForUid = async (uid: string): Promise<MemberPower> => {
  const snap = await memberPowerRef(uid).get();
  if (snap.exists) return snap.data() as MemberPower;

  const identity = await getUserIdentity(uid);
  const base = calcBaseStats(0, 9999, 1);
  const member: MemberPower = {
    uid,
    nickname: identity.nickname,
    grade: identity.grade || undefined,
    activityScore: 0,
    rank: 9999,
    baseAttack: base.attack,
    baseHp: base.hp,
    baseSpeed: base.speed,
  };
  await memberPowerRef(uid).set(member, { merge: true });
  return member;
};

const buildRoundPayload = (roundNumber: number, difficultyMultiplier: number) => ({
  roundNumber,
  status: 'active',
  allyBaseHp: ALLY_BASE_MAX_HP,
  allyBaseMaxHp: ALLY_BASE_MAX_HP,
  enemyBaseHp: ENEMY_BASE_MAX_HP,
  enemyBaseMaxHp: ENEMY_BASE_MAX_HP,
  enemyPowerScale: calcRoundEnemyScale(roundNumber, difficultyMultiplier),
  difficultyMultiplier,
  tickCount: 0,
  totalKills: 0,
  startedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const createRound = async (roundNumber: number) =>
  buildRoundPayload(roundNumber, await getDifficultyMultiplier());

const waitForRoundTransition = async (retries = 5): Promise<void> => {
  for (let i = 0; i < retries; i += 1) {
    const meta = (await gameRef().get()).data() || {};
    if (!meta.pendingRoundTransition || meta.activeRoundId) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

const ensureActiveRound = async (): Promise<string> => {
  const db = admin.firestore();
  const gRef = gameRef();

  const metaSnap = await gRef.get();
  const meta = metaSnap.data() || {};
  const existingId = String(meta.activeRoundId || '');
  if (existingId) {
    const rSnap = await roundRef(existingId).get();
    if (rSnap.exists && rSnap.data()?.status === 'active') return existingId;
  }

  if (meta.pendingRoundTransition && !meta.activeRoundId) {
    await waitForRoundTransition();
    const afterWait = (await gRef.get()).data() || {};
    const waitedId = String(afterWait.activeRoundId || '');
    if (waitedId) {
      const rSnap = await roundRef(waitedId).get();
      if (rSnap.exists && rSnap.data()?.status === 'active') return waitedId;
    }
  }

  const difficultyMultiplier = await getDifficultyMultiplier();

  const result = await db.runTransaction(async (tx) => {
    const mSnap = await tx.get(gRef);
    const m = mSnap.data() || {};
    let roundId = String(m.activeRoundId || '');
    if (roundId) {
      const rSnap = await tx.get(roundRef(roundId));
      if (rSnap.exists && rSnap.data()?.status === 'active') {
        return { roundId, roundNumber: Number(rSnap.data()?.roundNumber) || 1, created: false };
      }
    }
    if (m.pendingRoundTransition) {
      return { roundId: '', roundNumber: 0, created: false, pending: true };
    }
    const roundNumber = Number(m.lastRoundNumber || 0) + 1;
    roundId = `R${roundNumber}`;
    tx.set(roundRef(roundId), buildRoundPayload(roundNumber, difficultyMultiplier));
    tx.set(
      gRef,
      {
        activeRoundId: roundId,
        lastRoundNumber: roundNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { roundId, roundNumber, created: true, pending: false };
  });

  if (result.pending) {
    await waitForRoundTransition();
    const retryMeta = (await gRef.get()).data() || {};
    const retryId = String(retryMeta.activeRoundId || '');
    if (retryId) return retryId;
    return ensureActiveRound();
  }

  if (result.created && result.roundId) {
    await addFeed(
      result.roundId,
      'round',
      `라운드 ${result.roundNumber} 시작! 몬스터 기지를 파괴하세요.`
    );
  }
  return result.roundId;
};

const getInGameUids = async (): Promise<Set<string>> => {
  const now = Date.now();
  const snap = await presenceCol().get();
  const set = new Set<string>();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.inGame !== true) return;
    const lastSeen = data.lastSeenAt?.toMillis?.() || 0;
    if (now - lastSeen <= PRESENCE_TTL_MS) set.add(docSnap.id);
  });
  return set;
};

const pickWeightedMember = (
  members: MemberPower[],
  inGameUids: Set<string>,
  playerUpgrades: Map<string, PlayerUpgrades>
): MemberPower | null => {
  let pool = members.filter((m) => !inGameUids.has(m.uid));
  if (pool.length === 0) pool = [...members];
  if (pool.length === 0) return null;
  const weights = pool.map((m) => {
    const upgrades = playerUpgrades.get(m.uid) || createDefaultUpgrades();
    return 1 + upgrades.spawnWeight * 0.15 + Math.max(0, 30 - m.rank) * 0.05;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
};

const resolveAllySpawnPosition = (units: SimUnit[]): number => {
  const allyPos = units
    .filter((u) => u.side === 'ally')
    .map((u) => u.position);
  if (allyPos.length === 0) return ALLY_BASE_POSITION;
  return Math.max(ALLY_BASE_POSITION - 2, Math.min(...allyPos) - 1.8);
};

const resolveEnemySpawnPosition = (units: SimUnit[]): number => {
  const enemyPos = units
    .filter((u) => u.side === 'enemy')
    .map((u) => u.position);
  if (enemyPos.length === 0) return ENEMY_BASE_POSITION;
  return Math.min(ENEMY_BASE_POSITION + 2, Math.max(...enemyPos) + 1.8);
};

const buildAllyUnit = (
  member: MemberPower,
  upgrades: PlayerUpgrades,
  unitId: string,
  position = ALLY_BASE_POSITION
): SimUnit => {
  const stats = applyUpgrades(
    { attack: member.baseAttack, hp: member.baseHp, speed: member.baseSpeed },
    upgrades
  );
  return {
    id: unitId,
    side: 'ally',
    uid: member.uid,
    nickname: member.nickname,
    grade: member.grade,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    speed: stats.speed,
    position,
    armor: stats.armor,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    lifesteal: stats.lifesteal,
    capitalBonus: stats.capitalBonus,
  };
};

const buildEnemyUnit = (
  scale: number,
  tickCount: number,
  unitId: string,
  position = ENEMY_BASE_POSITION
): SimUnit => {
  const isBoss = tickCount > 0 && tickCount % 15 === 0;
  const tier = 1 + Math.floor(tickCount / 10);
  const hp = Math.round((isBoss ? 220 : 65 + tier * 14) * scale);
  const attack = Math.round((isBoss ? 45 : 14 + tier * 3) * scale);
  const names = ['미니 탬버린', '캐스터네츠', '트라이앵글', '마라카스', '클라베스', '징'];
  return {
    id: unitId,
    side: 'enemy',
    nickname: isBoss ? `대형 ${names[0]}` : names[tier % names.length],
    hp,
    maxHp: hp,
    attack,
    speed: isBoss ? 1.1 : 1.4 + tier * 0.05,
    position,
    armor: Math.min(0.35, tier * 0.02),
    critChance: isBoss ? 0.08 : 0.02,
    critDamage: 1.6,
    lifesteal: 0,
    capitalBonus: 0,
    isBoss,
  };
};

const dealDamage = (attacker: SimUnit, defender: SimUnit): { damage: number; crit: boolean } => {
  let damage = attacker.attack;
  const crit = Math.random() < attacker.critChance;
  if (crit) damage = Math.round(damage * attacker.critDamage);
  damage = Math.round(damage * (1 - defender.armor));
  return { damage: Math.max(1, damage), crit };
};

const simulateTick = async (
  roundId: string,
  members: MemberPower[],
  inGameUids: Set<string>
): Promise<void> => {
  const db = admin.firestore();
  const rRef = roundRef(roundId);
  const tickFeed: Array<{ type: string; message: string }> = [];

  await db.runTransaction(async (tx) => {
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists) return;
    const round = rSnap.data() || {};
    if (round.status !== 'active') return;

    const unitsSnap = await tx.get(unitsCol(roundId));
    const units: SimUnit[] = unitsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<SimUnit, 'id'>) }))
      .filter((u) => u.hp > 0);

    const capitalDeltas = new Map<string, number>();
    const killDeltas = new Map<string, number>();
    const bossKillDeltas = new Map<string, number>();
    const contributorDeltas = new Map<string, number>();
    const unitsToDelete: string[] = [];
    const unitsToWrite = new Map<string, SimUnit>();
    const freshlySpawned = new Set<string>();

    const allyCount = units.filter((u) => u.side === 'ally').length;
    const enemyCount = units.filter((u) => u.side === 'enemy').length;

    let tickCount = Number(round.tickCount) || 0;
    tickCount += 1;

    const scale = Number(round.enemyPowerScale) || 1;
    let allyBaseHp = Number(round.allyBaseHp) || ALLY_BASE_MAX_HP;
    let enemyBaseHp = Number(round.enemyBaseHp) || ENEMY_BASE_MAX_HP;

    // 적 스폰
    if (enemyCount < MAX_UNITS_PER_SIDE && tickCount % ENEMY_SPAWN_INTERVAL_TICKS === 0) {
      const id = `e_${tickCount}_${Date.now()}`;
      const enemy = buildEnemyUnit(scale, tickCount, id, ENEMY_BASE_POSITION);
      units.push(enemy);
      unitsToWrite.set(id, enemy);
      freshlySpawned.add(id);
      if (enemy.isBoss && tickFeed.length < 8) {
        tickFeed.push({ type: 'event', message: '⚠️ 대형 보스 몬스터가 나타났습니다!' });
      }
    }

    // 아군 자동 스폰
    if (allyCount < MAX_UNITS_PER_SIDE && tickCount % AUTO_SPAWN_INTERVAL_TICKS === 0) {
      const playerSnaps = await tx.get(admin.firestore().collection(`games/${GAME_ID}/players`));
      const upgradeMap = new Map<string, PlayerUpgrades>();
      playerSnaps.forEach((p) => {
        upgradeMap.set(p.id, { ...createDefaultUpgrades(), ...(p.data().upgrades || {}) });
      });
      const picked = pickWeightedMember(members, inGameUids, upgradeMap);
      if (picked) {
        const upgrades = upgradeMap.get(picked.uid) || createDefaultUpgrades();
        const id = `a_auto_${tickCount}_${picked.uid.slice(0, 6)}`;
        const ally = buildAllyUnit(picked, upgrades, id, ALLY_BASE_POSITION);
        units.push(ally);
        unitsToWrite.set(id, ally);
        freshlySpawned.add(id);
      }
    }

    const getLiveUnit = (id: string, fallback?: SimUnit): SimUnit | null => {
      if (unitsToDelete.includes(id)) return null;
      const u = unitsToWrite.get(id) ?? fallback;
      if (!u || u.hp <= 0) return null;
      return u;
    };

    const findClashOpponent = (live: SimUnit): SimUnit | null => {
      let closest: SimUnit | null = null;
      let closestDist = Infinity;
      for (const opp of units) {
        if (opp.side === live.side) continue;
        const o = getLiveUnit(opp.id, opp);
        const l = getLiveUnit(live.id, live);
        if (!o || !l) continue;
        const dist = Math.abs(o.position - l.position);
        if (dist <= COMBAT_RANGE && dist < closestDist) {
          closest = o;
          closestDist = dist;
        }
      }
      return closest;
    };

    const isAllyHomeThreatened = (): boolean =>
      units.some(
        (u) =>
          u.side === 'enemy' &&
          u.hp > 0 &&
          !unitsToDelete.includes(u.id) &&
          u.position <= ALLY_BASE_POSITION + HOME_THREAT_RANGE
      );

    const nearestThreatToAllyBase = (): number | null => {
      let nearest: number | null = null;
      for (const u of units) {
        if (u.side !== 'enemy' || u.hp <= 0 || unitsToDelete.includes(u.id)) continue;
        if (u.position > ALLY_BASE_POSITION + HOME_THREAT_RANGE) continue;
        if (nearest === null || u.position < nearest) nearest = u.position;
      }
      return nearest;
    };

    /** 적 앞에서 교전 범위 밖으로 이동해 서로 스쳐 지나가는 현상 방지 */
    const computeBlockedPosition = (live: SimUnit): number => {
      const moveDir = live.side === 'ally' ? 1 : -1;
      const maxStep = live.speed * MOVE_SCALE;

      let nearestAhead: SimUnit | null = null;
      let nearestDist = Infinity;

      for (const opp of units) {
        if (opp.side === live.side || unitsToDelete.includes(opp.id)) continue;
        const o = getLiveUnit(opp.id, opp);
        if (!o) continue;
        const delta = o.position - live.position;
        const ahead = live.side === 'ally' ? delta > 0 : delta < 0;
        if (!ahead) continue;
        const dist = Math.abs(delta);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestAhead = o;
        }
      }

      if (!nearestAhead) {
        return Math.max(
          LANE_MIN,
          Math.min(LANE_MAX, live.position + moveDir * maxStep)
        );
      }

      if (nearestDist <= COMBAT_RANGE) {
        return live.position;
      }

      const allowedStep = Math.max(0, nearestDist - COMBAT_RANGE);
      const step = Math.min(maxStep, allowedStep);
      return Math.max(
        LANE_MIN,
        Math.min(LANE_MAX, live.position + moveDir * step)
      );
    };

    /** 기지 위협 시 아군이 돌아와 방어선에서 적과 맞붙도록 */
    const computeAllyPosition = (live: SimUnit): number => {
      const maxStep = live.speed * MOVE_SCALE;
      if (!isAllyHomeThreatened()) {
        return computeBlockedPosition(live);
      }

      const threatPos = nearestThreatToAllyBase();
      if (threatPos === null) return computeBlockedPosition(live);

      const engagePos = Math.min(
        ALLY_DEFENSE_LINE,
        threatPos + COMBAT_RANGE - 1.5
      );

      if (live.position > engagePos + 0.5) {
        return Math.max(engagePos, live.position - maxStep);
      }

      if (live.position < engagePos - 2) {
        return Math.min(engagePos, live.position + maxStep);
      }

      return live.position;
    };

    const creditEnemyKill = (killer: SimUnit, victim: SimUnit) => {
      if (victim.side !== 'enemy' || killer.side !== 'ally' || !killer.uid) return;
      let reward = Math.round(calcKillReward(victim) * (1 + killer.capitalBonus));
      if (victim.isBoss) {
        reward += Math.round(BOSS_KILL_BONUS * (1 + killer.capitalBonus * 0.5));
        bossKillDeltas.set(killer.uid, (bossKillDeltas.get(killer.uid) || 0) + 1);
      }
      capitalDeltas.set(killer.uid, (capitalDeltas.get(killer.uid) || 0) + reward);
      killDeltas.set(killer.uid, (killDeltas.get(killer.uid) || 0) + 1);
      contributorDeltas.set(killer.uid, (contributorDeltas.get(killer.uid) || 0) + 1);
      if (tickFeed.length < 8) {
        tickFeed.push({
          type: 'kill',
          message: victim.isBoss
            ? `${killer.nickname}님이 보스 ${victim.nickname} 격파! (+${reward} 자본)`
            : `${killer.nickname}님이 ${victim.nickname} 처치 (+${reward})`,
        });
      }
    };

    // 이동 및 전투
    const sorted = [...units].sort((a, b) =>
      a.side === 'ally' ? b.position - a.position : a.position - b.position
    );

    const applySiege = (live: SimUnit): boolean => {
      const atEnemyBase = live.side === 'ally' && live.position >= ENEMY_BASE_POSITION - 3;
      const atAllyBase = live.side === 'enemy' && live.position <= ALLY_BASE_POSITION + 3;
      const sieging = (live.siegeTicks ?? 0) > 0;

      if (!atEnemyBase && !atAllyBase && !sieging) return false;

      // 우리 기지 앞 적은 방어 아군이 있으면 먼저 교전 (포위만 하고 안 싸우는 현상 방지)
      if (live.side === 'enemy' && (atAllyBase || sieging)) {
        const l = getLiveUnit(live.id, live);
        if (l && findClashOpponent(l)) return false;
      }

      if (live.side === 'ally') {
        live.position = ALLY_SIEGE_POS;
        if (!live.siegeTicks || live.siegeTicks <= 0) {
          live.siegeTicks = SIEGE_DURATION_TICKS;
        }
        const baseDmg = Math.round(live.attack * 0.3);
        enemyBaseHp = Math.max(0, enemyBaseHp - baseDmg);
      } else {
        live.position = ENEMY_SIEGE_POS;
        if (!live.siegeTicks || live.siegeTicks <= 0) {
          live.siegeTicks = SIEGE_DURATION_TICKS;
        }
        const baseDmg = Math.round(live.attack * 0.28);
        allyBaseHp = Math.max(0, allyBaseHp - baseDmg);
      }

      live.siegeTicks = (live.siegeTicks ?? SIEGE_DURATION_TICKS) - 1;
      if (live.siegeTicks <= 0) {
        unitsToDelete.push(live.id);
      } else {
        unitsToWrite.set(live.id, live);
      }
      return true;
    };

    const resolveCombat = (live: SimUnit): boolean => {
      const clash = findClashOpponent(live);
      if (!clash) return false;

      let attacker = getLiveUnit(live.id, live)!;
      let defender = getLiveUnit(clash.id, clash)!;

      for (let exchange = 0; exchange < COMBAT_EXCHANGES; exchange += 1) {
        if (attacker.hp <= 0 || defender.hp <= 0) break;

        const { damage: dmgToDef } = dealDamage(attacker, defender);
        defender.hp = Math.max(0, defender.hp - dmgToDef);
        const { damage: dmgToAtk } = dealDamage(defender, attacker);
        attacker.hp = Math.max(0, attacker.hp - dmgToAtk);

        if (attacker.lifesteal > 0 && dmgToDef > 0) {
          attacker.hp = Math.min(
            attacker.maxHp,
            attacker.hp + Math.round(dmgToDef * attacker.lifesteal)
          );
        }

        unitsToWrite.set(attacker.id, attacker);
        unitsToWrite.set(defender.id, defender);

        if (defender.hp <= 0) {
          creditEnemyKill(attacker, defender);
          unitsToDelete.push(defender.id);
          break;
        }
        if (attacker.hp <= 0) {
          unitsToDelete.push(attacker.id);
          break;
        }
      }
      return true;
    };

    for (const unit of sorted) {
      if (unitsToDelete.includes(unit.id)) continue;
      const live = getLiveUnit(unit.id, unit);
      if (!live) continue;

      if (freshlySpawned.has(live.id)) {
        unitsToWrite.set(live.id, live);
        continue;
      }

      if (resolveCombat(live)) continue;

      live.position =
        live.side === 'ally' ? computeAllyPosition(live) : computeBlockedPosition(live);

      if (applySiege(live)) continue;

      unitsToWrite.set(live.id, live);
    }

  unitsToDelete.forEach((id) => {
      unitsToWrite.delete(id);
      tx.delete(unitsCol(roundId).doc(id));
    });

    unitsToWrite.forEach((u, id) => {
      if (!unitsToDelete.includes(id)) {
        tx.set(unitsCol(roundId).doc(id), u, { merge: true });
      }
    });

    const killCount = unitsToDelete.filter((id) => {
      const u = units.find((x) => x.id === id);
      return u?.side === 'enemy';
    }).length;

    let status = 'active';
    let roundEnded = false;
    let endReason = '';

    if (enemyBaseHp <= 0) {
      status = 'won';
      roundEnded = true;
      endReason = 'victory';
      enemyBaseHp = 0;
    } else if (allyBaseHp <= 0) {
      status = 'lost';
      roundEnded = true;
      endReason = 'defeat';
      allyBaseHp = 0;
    }

    const roundUpdate: Record<string, unknown> = {
      tickCount,
      allyBaseHp,
      enemyBaseHp,
      totalKills: admin.firestore.FieldValue.increment(killCount),
      ...(roundEnded ? { status, endReason, endedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    };
    contributorDeltas.forEach((count, contributorUid) => {
      roundUpdate[`contributors.${contributorUid}`] = admin.firestore.FieldValue.increment(count);
    });
    tx.update(rRef, roundUpdate);

    capitalDeltas.forEach((amount, capitalUid) => {
      tx.set(playerRef(capitalUid), {
        capital: admin.firestore.FieldValue.increment(amount),
        totalKills: admin.firestore.FieldValue.increment(killDeltas.get(capitalUid) || 0),
        totalCapitalEarned: admin.firestore.FieldValue.increment(amount),
        bossKills: admin.firestore.FieldValue.increment(bossKillDeltas.get(capitalUid) || 0),
      }, { merge: true });
    });

    if (roundEnded) {
      tx.set(gameRef(), {
        activeRoundId: admin.firestore.FieldValue.delete(),
        pendingRoundTransition: roundId,
        lastRoundResult: endReason,
        lastRoundEndedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  for (const item of tickFeed) {
    await addFeed(roundId, item.type, item.message);
  }

  const rAfter = await roundRef(roundId).get();
  const data = rAfter.data() || {};
  if (data.status === 'won') {
    await addFeed(roundId, 'round', `라운드 ${data.roundNumber} 승리! 몬스터 기지를 파괴했습니다.`);
    await startNextRound(roundId, Number(data.roundNumber) || 1, 'bonus');
  } else if (data.status === 'lost') {
    await addFeed(roundId, 'round', `라운드 ${data.roundNumber} 패배… 베리어스 기지가 함락했습니다.`);
    await startNextRound(roundId, Number(data.roundNumber) || 1, 'retry');
  }
};

const pickMvpUid = (contributors: Record<string, number> | undefined): string | null => {
  if (!contributors) return null;
  let bestUid: string | null = null;
  let bestScore = 0;
  Object.entries(contributors).forEach(([uid, count]) => {
    const score = Number(count) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestUid = uid;
    }
  });
  return bestScore > 0 ? bestUid : null;
};

const startNextRound = async (
  finishedRoundId: string,
  prevRound: number,
  mode: 'bonus' | 'retry'
) => {
  const db = admin.firestore();
  const gRef = gameRef();
  const difficultyMultiplier = await getDifficultyMultiplier();

  const transition = await db.runTransaction(async (tx) => {
    const meta = (await tx.get(gRef)).data() || {};
    if (meta.lastProcessedRoundEndId === finishedRoundId) return null;

    const lastNum = Number(meta.lastRoundNumber) || 0;
    const activeId = String(meta.activeRoundId || '');
    if (lastNum > prevRound && activeId) {
      tx.set(gRef, { lastProcessedRoundEndId: finishedRoundId }, { merge: true });
      return null;
    }

    const roundNumber = prevRound + 1;
    const roundId = `R${roundNumber}`;
    const prevStreak = Number(meta.communityWinStreak) || 0;
    const communityWinStreak = mode === 'bonus' ? prevStreak + 1 : 0;

    tx.set(roundRef(roundId), buildRoundPayload(roundNumber, difficultyMultiplier));
    tx.set(
      gRef,
      {
        activeRoundId: roundId,
        lastRoundNumber: roundNumber,
        communityWinStreak,
        lastProcessedRoundEndId: finishedRoundId,
        pendingRoundTransition: admin.firestore.FieldValue.delete(),
        lastRoundResult: mode === 'bonus' ? 'victory' : 'defeat',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { roundId, roundNumber, communityWinStreak };
  });

  if (!transition) return;

  const { roundId, roundNumber, communityWinStreak } = transition;
  const finishedSnap = await roundRef(finishedRoundId).get();
  const finishedData = finishedSnap.data() || {};
  const contributors = finishedData.contributors as Record<string, number> | undefined;
  const mvpUid = mode === 'bonus' ? pickMvpUid(contributors) : null;

  if (mode === 'bonus') {
    const streakBonus = communityWinStreak * 30;
    const roundBonus = prevRound * 5;
    const inGame = await getInGameUids();
    const contributorUids = contributors
      ? Object.entries(contributors)
          .filter(([, count]) => Number(count) > 0)
          .map(([id]) => id)
      : [];
    const bonusRecipients = new Set([...inGame, ...contributorUids]);
    const batch = admin.firestore().batch();
    const victoryReward = VICTORY_BONUS_BASE + streakBonus + roundBonus;

    bonusRecipients.forEach((uid) => {
      batch.set(
        playerRef(uid),
        {
          capital: admin.firestore.FieldValue.increment(victoryReward),
          totalCapitalEarned: admin.firestore.FieldValue.increment(victoryReward),
          roundWins: admin.firestore.FieldValue.increment(1),
          winStreak: admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      );
    });

    if (mvpUid) {
      batch.set(
        playerRef(mvpUid),
        {
          capital: admin.firestore.FieldValue.increment(MVP_ROUND_BONUS),
          totalCapitalEarned: admin.firestore.FieldValue.increment(MVP_ROUND_BONUS),
        },
        { merge: true }
      );
    }

    await batch.commit();

    const mvpNick = mvpUid
      ? String((await playerRef(mvpUid).get()).data()?.nickname || 'MVP')
      : null;

    await addFeed(
      roundId,
      'event',
      `라운드 ${roundNumber} 시작! 승리 보너스 ${victoryReward} 자본` +
        (communityWinStreak > 1 ? ` (연승 ${communityWinStreak})` : '') +
        (mvpNick ? ` · MVP ${mvpNick} +${MVP_ROUND_BONUS}` : '')
    );
  } else {
    await addFeed(roundId, 'round', `라운드 ${roundNumber} 시작! 다시 몬스터를 막아주세요.`);
  }
};

export const scheduledVeryusDefenseTick = onSchedule(
  { schedule: 'every 1 minutes', timeZone: KST, region: 'asia-northeast3' },
  async () => {
    try {
      const members = await ensureMemberPower();
      const inGameUids = await getInGameUids();
      let roundId = await ensureActiveRound();

      for (let i = 0; i < TICKS_PER_RUN; i++) {
        const rSnap = await roundRef(roundId).get();
        if (!rSnap.exists || rSnap.data()?.status !== 'active') {
          const meta = (await gameRef().get()).data() || {};
          roundId = String(meta.activeRoundId || '') || (await ensureActiveRound());
          continue;
        }
        await simulateTick(roundId, members, inGameUids);
        const metaAfter = (await gameRef().get()).data() || {};
        const nextActive = String(metaAfter.activeRoundId || '');
        if (nextActive) {
          roundId = nextActive;
        } else if (metaAfter.pendingRoundTransition) {
          await waitForRoundTransition();
          roundId = String((await gameRef().get()).data()?.activeRoundId || '') || (await ensureActiveRound());
        }
      }

      await gameRef().set({ lastTickAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      logger.error('베리어스 디펜스 틱 실패', { error });
    }
  }
);

export const veryusDefenseManualSpawn = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    const uid = request.auth.uid;
    await assertLeader(uid);

    const member = await ensureMemberForUid(uid);
    const roundId = await ensureActiveRound();
    const now = Date.now();
    const unitId = `a_manual_${uid.slice(0, 8)}_${now}`;

    const spawnResult = await admin.firestore().runTransaction(async (tx) => {
      const [playerSnap, rSnap, unitsSnap] = await Promise.all([
        tx.get(playerRef(uid)),
        tx.get(roundRef(roundId)),
        tx.get(unitsCol(roundId).where('side', '==', 'ally')),
      ]);

      if (!rSnap.exists || rSnap.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', '진행 중인 라운드가 없습니다.');
      }
      if (unitsSnap.size >= MAX_UNITS_PER_SIDE) {
        throw new HttpsError('resource-exhausted', '아군 유닛이 가득 찼습니다.');
      }

      const playerData = playerSnap.data() || {};
      const upgrades: PlayerUpgrades = { ...createDefaultUpgrades(), ...(playerData.upgrades || {}) };
      for (const key of UPGRADE_KEYS) {
        upgrades[key] = Number(upgrades[key]) || 0;
      }
      const lastSpawn = Number(playerData.lastManualSpawnAt) || 0;
      const cooldown = calcManualCooldown(upgrades.spawnCooldown);
      if (now - lastSpawn < cooldown) {
        const remain = Math.ceil((cooldown - (now - lastSpawn)) / 1000);
        throw new HttpsError('failed-precondition', `출격 쿨다운 ${remain}초 남음`);
      }

      const unit = buildAllyUnit(member, upgrades, unitId);
      tx.set(unitsCol(roundId).doc(unitId), unit);
      tx.set(
        playerRef(uid),
        {
          uid,
          nickname: member.nickname,
          grade: member.grade,
          lastManualSpawnAt: now,
          totalDeploys: admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      );
      return { nickname: member.nickname };
    });

    await addFeed(roundId, 'spawn', `${spawnResult.nickname}님이 직접 출격했습니다!`);

    return { ok: true, message: '출격 완료!' };
  }
);

export const veryusDefensePurchaseUpgrade = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    const uid = request.auth.uid;
    await assertLeader(uid);
    const upgradeKey = String(request.data?.upgradeKey || '') as UpgradeKey;
    if (!UPGRADE_KEYS.includes(upgradeKey)) {
      throw new HttpsError('invalid-argument', '잘못된 강화 항목입니다.');
    }

    const def = UPGRADE_COSTS[upgradeKey];
    const ref = playerRef(uid);

    const result = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      const upgrades: PlayerUpgrades = { ...createDefaultUpgrades(), ...(data.upgrades || {}) };
      for (const key of UPGRADE_KEYS) {
        upgrades[key] = Number(upgrades[key]) || 0;
      }
      const currentLevel = upgrades[upgradeKey] || 0;

      if (currentLevel >= def.max) {
        throw new HttpsError('failed-precondition', '이미 최대 레벨입니다.');
      }

      const cost = getUpgradeCost(upgradeKey, currentLevel);
      const capital = Number(data.capital) || 0;
      if (capital < cost) {
        throw new HttpsError(
          'failed-precondition',
          `자본이 부족합니다. (필요: ${cost}, 보유: ${capital})`
        );
      }

      const newLevel = currentLevel + 1;
      upgrades[upgradeKey] = newLevel;

      tx.set(
        ref,
        {
          capital: admin.firestore.FieldValue.increment(-cost),
          upgrades,
          uid,
          nickname: String(data.nickname || '').trim() || undefined,
        },
        { merge: true }
      );

      return { newLevel, capital: capital - cost };
    });

    return {
      ok: true,
      message: '강화 완료!',
      newLevel: result.newLevel,
      capital: result.capital,
    };
  }
);

export const veryusDefenseClaimDaily = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    const uid = request.auth.uid;
    await assertLeader(uid);
    const dayKey = getKstDateKey();

    const claimResult = await admin.firestore().runTransaction(async (tx) => {
      const playerSnap = await tx.get(playerRef(uid));
      const data = playerSnap.data() || {};
      if (data.lastDailyClaimKey === dayKey) {
        return { ok: false as const, message: '오늘은 이미 출석 보상을 받았습니다.' };
      }

      const memberSnap = await tx.get(memberPowerRef(uid));
      const nickname = String(
        data.nickname || memberSnap.data()?.nickname || '플레이어'
      );
      const grade = memberSnap.data()?.grade as string | undefined;
      const capital = Number(data.capital) || 0;

      tx.set(
        playerRef(uid),
        {
          uid,
          nickname,
          grade,
          lastDailyClaimKey: dayKey,
          capital: admin.firestore.FieldValue.increment(DAILY_ATTENDANCE_REWARD),
          totalCapitalEarned: admin.firestore.FieldValue.increment(DAILY_ATTENDANCE_REWARD),
        },
        { merge: true }
      );

      return {
        ok: true as const,
        message: `일일 출석 보상 ${DAILY_ATTENDANCE_REWARD} 자본을 받았습니다!`,
        capital: capital + DAILY_ATTENDANCE_REWARD,
        nickname,
      };
    });

    if (!claimResult.ok) return claimResult;

    const roundId = await ensureActiveRound();
    await addFeed(
      roundId,
      'event',
      `${claimResult.nickname}님 일일 출석 보상 +${DAILY_ATTENDANCE_REWARD} 자본`
    );

    return {
      ok: true,
      message: claimResult.message,
      capital: claimResult.capital,
    };
  }
);

/** 게임 진입 시 전장·멤버 스탯·첫 웨이브를 즉시 준비 */
export const veryusDefenseConnect = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

    const uid = request.auth.uid;
    await assertLeader(uid);
    await ensurePlayerProfile(uid);
    await ensureMemberForUid(uid);
    const members = await ensureMemberPower();
    let roundId = await ensureActiveRound();
    const inGameUids = await getInGameUids();

    const rSnap = await roundRef(roundId).get();
    const tickCount = Number(rSnap.data()?.tickCount) || 0;
    const unitsSnap = await unitsCol(roundId).limit(1).get();

    if (tickCount < 3 || unitsSnap.empty) {
      for (let i = 0; i < 3; i++) {
        const current = await roundRef(roundId).get();
        if (!current.exists || current.data()?.status !== 'active') {
          roundId = await ensureActiveRound();
        }
        await simulateTick(roundId, members, inGameUids);
      }
    }

    await gameRef().set(
      {
        lastConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
        battlefieldReady: true,
      },
      { merge: true }
    );

    const finalSnap = await roundRef(roundId).get();
    const roundNumber = Number(finalSnap.data()?.roundNumber) || 1;

    return {
      ok: true,
      roundId,
      roundNumber,
      message: '전장에 연결되었습니다!',
    };
  }
);

export const veryusDefenseBoostTick = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    await assertLeader(request.auth.uid);

    const inGameUids = await getInGameUids();
    if (inGameUids.size === 0) {
      return { ok: false, message: '게임에 접속 중인 멤버가 있을 때만 가속됩니다.' };
    }

    const boostClaimed = await admin.firestore().runTransaction(async (tx) => {
      const meta = (await tx.get(gameRef())).data() || {};
      const lastBoost = meta.lastBoostTickAt?.toMillis?.() || 0;
      const elapsed = Date.now() - lastBoost;
      if (elapsed < BOOST_TICK_COOLDOWN_MS) {
        return { ok: false as const, remain: Math.ceil((BOOST_TICK_COOLDOWN_MS - elapsed) / 1000) };
      }
      tx.set(
        gameRef(),
        { lastBoostTickAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { ok: true as const };
    });

    if (!boostClaimed.ok) {
      return {
        ok: false,
        message: `${boostClaimed.remain}초 후에 다시 가속할 수 있습니다.`,
      };
    }

    const members = await ensureMemberPower();
    let roundId = await ensureActiveRound();
    const rSnap = await roundRef(roundId).get();
    if (!rSnap.exists || rSnap.data()?.status !== 'active') {
      const meta = (await gameRef().get()).data() || {};
      roundId = String(meta.activeRoundId || '') || (await ensureActiveRound());
    }

    await simulateTick(roundId, members, inGameUids);

    return { ok: true, message: '접속자 협력으로 전장이 진행되었습니다!' };
  }
);

/** 관리자: 몬스터 난이도 배율 (0.5~3.0, 라운드 진행 배율에 곱해짐) */
export const veryusDefenseSetDifficulty = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    await assertLeader(request.auth.uid);

    const multiplier = clampDifficulty(Number(request.data?.multiplier));
    if (!Number.isFinite(Number(request.data?.multiplier))) {
      throw new HttpsError('invalid-argument', '난이도 배율이 올바르지 않습니다.');
    }

    await gameRef().set(
      {
        difficultyMultiplier: multiplier,
        difficultyUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        difficultyUpdatedBy: request.auth.uid,
      },
      { merge: true }
    );

    const meta = (await gameRef().get()).data() || {};
    const roundId = String(meta.activeRoundId || '');
    if (roundId) {
      const rSnap = await roundRef(roundId).get();
      if (rSnap.exists && rSnap.data()?.status === 'active') {
        const roundNumber = Number(rSnap.data()?.roundNumber) || 1;
        await roundRef(roundId).update({
          enemyPowerScale: calcRoundEnemyScale(roundNumber, multiplier),
          difficultyMultiplier: multiplier,
        });
      }
    }

    return {
      ok: true,
      message: `몬스터 난이도 ${multiplier}x로 설정되었습니다.`,
      multiplier,
    };
  }
);
