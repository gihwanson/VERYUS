import type { DefensePlayer } from './constants';
import type { UpgradeKey } from './constants';
import { UPGRADE_DEFINITIONS, getUpgradeCost } from './constants';

export type AchievementProgress = {
  current: number;
  target: number;
};

export type AchievementDef = {
  id: string;
  emoji: string;
  label: string;
  description: string;
  check: (player: DefensePlayer) => boolean;
  progress?: (player: DefensePlayer) => AchievementProgress | null;
};

export const DEFENSE_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_deploy',
    emoji: '⚔️',
    label: '첫 출격',
    description: '캐릭터를 처음 출격시키기',
    check: (p) => p.totalDeploys >= 1,
    progress: (p) => ({ current: Math.min(p.totalDeploys, 1), target: 1 }),
  },
  {
    id: 'kills_10',
    emoji: '🎯',
    label: '사냥꾼',
    description: '누적 처치 10마리',
    check: (p) => p.totalKills >= 10,
    progress: (p) => ({ current: Math.min(p.totalKills, 10), target: 10 }),
  },
  {
    id: 'kills_50',
    emoji: '💀',
    label: '학살자',
    description: '누적 처치 50마리',
    check: (p) => p.totalKills >= 50,
    progress: (p) => ({ current: Math.min(p.totalKills, 50), target: 50 }),
  },
  {
    id: 'boss_1',
    emoji: '👹',
    label: '보스 킬러',
    description: '보스 1마리 처치',
    check: (p) => p.bossKills >= 1,
    progress: (p) => ({ current: Math.min(p.bossKills, 1), target: 1 }),
  },
  {
    id: 'capital_1k',
    emoji: '💰',
    label: '부자',
    description: '누적 자본 1,000 돌파',
    check: (p) => p.totalCapitalEarned >= 1000,
    progress: (p) => ({
      current: Math.min(p.totalCapitalEarned, 1000),
      target: 1000,
    }),
  },
  {
    id: 'capital_10k',
    emoji: '🏦',
    label: '재벌',
    description: '누적 자본 10,000 돌파',
    check: (p) => p.totalCapitalEarned >= 10000,
    progress: (p) => ({
      current: Math.min(p.totalCapitalEarned, 10000),
      target: 10000,
    }),
  },
  {
    id: 'round_win_1',
    emoji: '🏆',
    label: '승리자',
    description: '라운드 승리 1회',
    check: (p) => p.roundWins >= 1,
    progress: (p) => ({ current: Math.min(p.roundWins, 1), target: 1 }),
  },
  {
    id: 'round_win_5',
    emoji: '🔥',
    label: '연전연승',
    description: '라운드 승리 5회',
    check: (p) => p.roundWins >= 5,
    progress: (p) => ({ current: Math.min(p.roundWins, 5), target: 5 }),
  },
  {
    id: 'upgrade_10',
    emoji: '⬆️',
    label: '성장형',
    description: '총 강화 레벨 합 10 이상',
    check: (p) =>
      Object.values(p.upgrades).reduce((sum, lv) => sum + (Number(lv) || 0), 0) >= 10,
    progress: (p) => {
      const total = Object.values(p.upgrades).reduce((sum, lv) => sum + (Number(lv) || 0), 0);
      return { current: Math.min(total, 10), target: 10 };
    },
  },
  {
    id: 'upgrade_50',
    emoji: '🌟',
    label: '전설의 성장',
    description: '총 강화 레벨 합 50 이상',
    check: (p) =>
      Object.values(p.upgrades).reduce((sum, lv) => sum + (Number(lv) || 0), 0) >= 50,
    progress: (p) => {
      const total = Object.values(p.upgrades).reduce((sum, lv) => sum + (Number(lv) || 0), 0);
      return { current: Math.min(total, 50), target: 50 };
    },
  },
];

export const getUnlockedAchievements = (player: DefensePlayer | null): AchievementDef[] => {
  if (!player) return [];
  return DEFENSE_ACHIEVEMENTS.filter((a) => a.check(player));
};

/** 달성 직전(75% 이상) 업적 수 — 탭 뱃지용 */
export const countNearCompleteAchievements = (player: DefensePlayer | null): number => {
  if (!player) return 0;
  return DEFENSE_ACHIEVEMENTS.filter((a) => {
    if (a.check(player)) return false;
    const prog = a.progress?.(player);
    if (!prog || prog.target <= 0) return false;
    return prog.current / prog.target >= 0.75;
  }).length;
};

/** 가성비 좋은 다음 강화 추천 (구매 가능한 것 중) */
export const recommendUpgrade = (
  upgrades: DefensePlayer['upgrades'],
  capital: number
): UpgradeKey | null => {
  let best: { key: UpgradeKey; score: number } | null = null;
  for (const def of UPGRADE_DEFINITIONS) {
    const level = upgrades[def.key] || 0;
    if (level >= def.maxLevel) continue;
    const cost = getUpgradeCost(def.key, level);
    if (capital < cost) continue;
    const priority: Record<UpgradeKey, number> = {
      attack: 1.2,
      hp: 1.15,
      speed: 1.05,
      spawnWeight: 0.9,
      spawnCooldown: 0.85,
      critChance: 1.0,
      critDamage: 0.95,
      armor: 0.9,
      lifesteal: 0.8,
      capitalBonus: 1.1,
    };
    const score = (priority[def.key] ?? 1) / Math.sqrt(cost);
    if (!best || score > best.score) best = { key: def.key, score };
  }
  return best?.key ?? null;
};
