export const GAME_ID = 'veryusDefense';

export const LANE_MIN = 0;
export const LANE_MAX = 100;
export const ALLY_BASE_POSITION = 5;
export const ENEMY_BASE_POSITION = 95;
/** 기지 공격(포위) 시 유닛이 멈추는 좌표 */
export const ALLY_SIEGE_POSITION = ENEMY_BASE_POSITION - 3;
export const ENEMY_SIEGE_POSITION = ALLY_BASE_POSITION + 3;
/** 아군 기지 방어선 — 적이 근접하면 아군이 이 근처에서 맞섬 */
export const ALLY_DEFENSE_LINE = ALLY_BASE_POSITION + 10;
export const HOME_THREAT_RANGE = 18;
export const SIEGE_TICKS_DEFAULT = 4;

export const ALLY_BASE_MAX_HP = 10000;
export const ENEMY_BASE_MAX_HP = 10000;

export const MAX_UNITS_PER_SIDE = 24;
export const TICK_SECONDS = 10;
/** 서버 스케줄러: 1분마다 TICKS_PER_RUN(1)회 */
export const TICKS_PER_SCHEDULED_RUN = 1;
export const CLIENT_BOOST_INTERVAL_MS = 750;

/** 서버 simulateTick 이동·교전과 클라이언트 연출 동기화용 */
export const SERVER_MOVE_SCALE = 3;
export const SERVER_COMBAT_RANGE = 10;
/** 접속 중 boost(1틱/3초) 기준 서버 위치 갱신 간격 */
export const EST_SECONDS_PER_SERVER_STEP = CLIENT_BOOST_INTERVAL_MS / 1000;

export const MANUAL_SPAWN_BASE_COOLDOWN_MS = 30_000;
export const AUTO_SPAWN_INTERVAL_TICKS = 2;
export const ENEMY_SPAWN_INTERVAL_TICKS = 2;

export const PRESENCE_TTL_MS = 45_000;

/** 관리자 난이도 배율 (몬스터 체력·공격에 곱해짐) */
export const DEFENSE_DIFFICULTY_MIN = 0.5;
export const DEFENSE_DIFFICULTY_MAX = 3;
export const DEFENSE_DIFFICULTY_PRESETS = [
  { label: '쉬움', value: 0.7 },
  { label: '보통', value: 1 },
  { label: '어려움', value: 1.4 },
  { label: '극한', value: 2 },
] as const;

/** 게임 position(0~100) → 전장 경로 상 % 위치 (양 끝 기지 사이 긴 행군로) */
export const LANE_PATH_START_PCT = 7;
export const LANE_PATH_SPAN_PCT = 86;

export const lanePercentFromPosition = (position: number): number =>
  LANE_PATH_START_PCT +
  (Math.max(0, Math.min(100, position)) / 100) * LANE_PATH_SPAN_PCT;

export const UPGRADE_KEYS = [
  'attack',
  'hp',
  'spawnWeight',
  'spawnCooldown',
  'speed',
  'critChance',
  'critDamage',
  'armor',
  'lifesteal',
  'capitalBonus',
] as const;

export type UpgradeKey = (typeof UPGRADE_KEYS)[number];

export type UpgradeDefinition = {
  key: UpgradeKey;
  label: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
};

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  {
    key: 'attack',
    label: '공격력',
    description: '유닛 공격력 증가',
    maxLevel: 50,
    baseCost: 80,
    costGrowth: 1.22,
  },
  {
    key: 'hp',
    label: '체력',
    description: '유닛 최대 체력 증가',
    maxLevel: 50,
    baseCost: 70,
    costGrowth: 1.2,
  },
  {
    key: 'spawnWeight',
    label: '스폰 확률',
    description: '자동 스폰 시 본인 유닛이 나올 확률 증가',
    maxLevel: 40,
    baseCost: 60,
    costGrowth: 1.18,
  },
  {
    key: 'spawnCooldown',
    label: '스폰 쿨다운',
    description: '수동 출격 대기 시간 감소',
    maxLevel: 30,
    baseCost: 90,
    costGrowth: 1.25,
  },
  {
    key: 'speed',
    label: '이동 속도',
    description: '유닛 전진 속도 증가',
    maxLevel: 40,
    baseCost: 75,
    costGrowth: 1.21,
  },
  {
    key: 'critChance',
    label: '치명타 확률',
    description: '공격 시 치명타 확률 증가',
    maxLevel: 30,
    baseCost: 100,
    costGrowth: 1.28,
  },
  {
    key: 'critDamage',
    label: '치명타 피해',
    description: '치명타 시 추가 피해 증가',
    maxLevel: 30,
    baseCost: 110,
    costGrowth: 1.3,
  },
  {
    key: 'armor',
    label: '방어력',
    description: '받는 피해 감소',
    maxLevel: 40,
    baseCost: 85,
    costGrowth: 1.23,
  },
  {
    key: 'lifesteal',
    label: '흡혈',
    description: '공격 시 체력 회복',
    maxLevel: 25,
    baseCost: 120,
    costGrowth: 1.32,
  },
  {
    key: 'capitalBonus',
    label: '자본 보너스',
    description: '적 처치 시 획득 자본 증가',
    maxLevel: 30,
    baseCost: 95,
    costGrowth: 1.26,
  },
];

export const getUpgradeCost = (key: UpgradeKey, currentLevel: number): number => {
  const def = UPGRADE_DEFINITIONS.find((d) => d.key === key);
  if (!def) return 999999;
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
};

/** 강화 카드에 표시할 다음 레벨 효과 요약 */
export const getUpgradeNextHint = (key: UpgradeKey): string => {
  const hints: Record<UpgradeKey, string> = {
    attack: '다음 레벨: 공격력 +6%',
    hp: '다음 레벨: 체력 +8%',
    spawnWeight: '다음 레벨: 자동 출격 확률 ↑',
    spawnCooldown: '다음 레벨: 출격 쿨다운 -3%',
    speed: '다음 레벨: 이동 속도 +4%',
    critChance: '다음 레벨: 치명타 +1.2%p',
    critDamage: '다음 레벨: 치명타 피해 +8%',
    armor: '다음 레벨: 피해 감소 +2%p',
    lifesteal: '다음 레벨: 흡혈 +1.5%p',
    capitalBonus: '다음 레벨: 처치 자본 +5%',
  };
  return hints[key];
};

export const VICTORY_BONUS_HINT = (streak: number, roundNumber: number): string => {
  const streakBonus = streak * 30;
  const roundBonus = roundNumber * 5;
  const total = VICTORY_BONUS_BASE + streakBonus + roundBonus;
  return `승리 시 접속·전투 기여 멤버에게 약 ${total} 자본 (연승·라운드 보너스 포함)`;
};

export type PlayerUpgrades = Record<UpgradeKey, number>;

export const createDefaultUpgrades = (): PlayerUpgrades =>
  UPGRADE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as PlayerUpgrades);

export type UnitSide = 'ally' | 'enemy';

export type DefenseUnit = {
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
  updatedAt?: number;
};

export type DefenseRound = {
  roundNumber: number;
  status: 'active' | 'won' | 'lost';
  allyBaseHp: number;
  allyBaseMaxHp: number;
  enemyBaseHp: number;
  enemyBaseMaxHp: number;
  enemyPowerScale: number;
  tickCount: number;
  totalKills: number;
};

/** 서버 라운드 없을 때 전장 미리보기용 */
export const PREVIEW_ROUND: DefenseRound = {
  roundNumber: 1,
  status: 'active',
  allyBaseHp: ALLY_BASE_MAX_HP,
  allyBaseMaxHp: ALLY_BASE_MAX_HP,
  enemyBaseHp: ENEMY_BASE_MAX_HP,
  enemyBaseMaxHp: ENEMY_BASE_MAX_HP,
  enemyPowerScale: 1,
  tickCount: 0,
  totalKills: 0,
};

export type DefensePlayer = {
  uid: string;
  nickname: string;
  capital: number;
  upgrades: PlayerUpgrades;
  totalKills: number;
  totalDeploys: number;
  totalCapitalEarned: number;
  roundWins: number;
  bossKills: number;
  winStreak: number;
  lastManualSpawnAt?: number;
  lastDailyClaimKey?: string;
};

export type DefenseLeaderboardEntry = {
  uid: string;
  nickname: string;
  grade?: string;
  totalKills: number;
  totalCapitalEarned: number;
  roundWins: number;
  bossKills: number;
  totalDeploys: number;
  rank: number;
};

export const DAILY_ATTENDANCE_REWARD = 80;
export const VICTORY_BONUS_BASE = 120;
export const BOSS_KILL_BONUS = 65;
export const MVP_ROUND_BONUS = 200;

export type DefenseFeedEvent = {
  id: string;
  type: 'spawn' | 'kill' | 'base_hit' | 'round' | 'event' | 'upgrade';
  message: string;
  createdAt?: unknown;
};

export const FEED_TYPE_LABELS: Record<DefenseFeedEvent['type'], string> = {
  spawn: '출격',
  kill: '처치',
  base_hit: '기지',
  round: '라운드',
  event: '이벤트',
  upgrade: '강화',
};

export type MemberPower = {
  uid: string;
  nickname: string;
  grade?: string;
  activityScore: number;
  rank: number;
  baseAttack: number;
  baseHp: number;
  baseSpeed: number;
};

export const calcBaseStatsFromActivity = (
  activityScore: number,
  rank: number,
  totalMembers: number
): { attack: number; hp: number; speed: number } => {
  const rankRatio = totalMembers > 1 ? 1 - (rank - 1) / (totalMembers - 1) : 1;
  const rankBonus = 0.65 + rankRatio * 0.35;
  const attack = Math.round(12 + Math.sqrt(activityScore + 1) * 2.8 * rankBonus);
  const hp = Math.round(70 + activityScore * 0.75 * rankBonus);
  const speed = 1.6 + rankBonus * 0.55;
  return { attack, hp, speed };
};

export const applyUpgradesToStats = (
  base: { attack: number; hp: number; speed: number },
  upgrades: PlayerUpgrades
): {
  attack: number;
  hp: number;
  speed: number;
  armor: number;
  critChance: number;
  critDamage: number;
  lifesteal: number;
  capitalBonus: number;
} => {
  const attackMul = 1 + upgrades.attack * 0.06;
  const hpMul = 1 + upgrades.hp * 0.08;
  const speedMul = 1 + upgrades.speed * 0.04;
  return {
    attack: Math.round(base.attack * attackMul),
    hp: Math.round(base.hp * hpMul),
    speed: Number((base.speed * speedMul).toFixed(2)),
    armor: upgrades.armor * 0.02,
    critChance: Math.min(0.45, upgrades.critChance * 0.012),
    critDamage: 1.5 + upgrades.critDamage * 0.08,
    lifesteal: upgrades.lifesteal * 0.015,
    capitalBonus: upgrades.capitalBonus * 0.05,
  };
};

/** 서버 calcKillReward와 동일 공식 (표시용) */
export const calcKillReward = (enemyUnit: DefenseUnit, killerCapitalBonus = 0): number => {
  const base = enemyUnit.isBoss ? 140 : 22 + Math.round(enemyUnit.maxHp / 10);
  return Math.round(base * (1 + killerCapitalBonus));
};

export const calcManualSpawnCooldownMs = (spawnCooldownLevel: number): number =>
  Math.max(8000, Math.round(MANUAL_SPAWN_BASE_COOLDOWN_MS * (1 - spawnCooldownLevel * 0.03)));
