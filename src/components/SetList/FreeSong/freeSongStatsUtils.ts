import type { FreeSongLineupItem } from './types';

/** 진행·선정 화면에 표시할 미완료 라인업 */
export function filterIncompleteLineup(lineup: FreeSongLineupItem[] | undefined): FreeSongLineupItem[] {
  if (!lineup?.length) return [];
  return lineup.filter((item) => !item.completedAt);
}

/** 완료된 라인업 항목에서 멤버별 곡 수 집계 */
export function computeStatsFromLineup(lineup: FreeSongLineupItem[] | undefined): Record<string, number> {
  const stats: Record<string, number> = {};
  if (!lineup?.length) return stats;

  lineup
    .filter((item) => item.completedAt)
    .forEach((item) => {
      (item.members ?? []).forEach((member) => {
        const nick = String(member).trim();
        if (!nick) return;
        stats[nick] = (stats[nick] || 0) + 1;
      });
    });

  return stats;
}

export function mergeStatsMaps(...maps: (Record<string, number> | undefined)[]): Record<string, number> {
  const merged: Record<string, number> = {};
  maps.forEach((map) => {
    if (!map) return;
    Object.entries(map).forEach(([nick, count]) => {
      if (!nick) return;
      merged[nick] = (merged[nick] || 0) + (count || 0);
    });
  });
  return merged;
}

export function sortStatsEntries(stats: Record<string, number>): [string, number][] {
  return Object.entries(stats).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], 'ko');
  });
}

/** 편성 멤버 전원을 포함한 세션 통계 (미완료 멤버는 0곡) */
export function buildRosterSessionStats(
  participants: string[],
  completedStats: Record<string, number>
): [string, number][] {
  return participants
    .map((nickname) => [nickname, completedStats[nickname] ?? 0] as [string, number])
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'ko');
    });
}

export function canSelfWithdrawLineupItem(item: FreeSongLineupItem, userNickname: string): boolean {
  if (item.completedAt) return false;
  const nick = userNickname.trim();
  if (!nick) return false;
  const members = (item.members ?? []).map((m) => String(m).trim());
  return members.includes(nick);
}

export function canCompleteLineupItem(
  item: FreeSongLineupItem,
  userNickname: string,
  canManage: boolean
): boolean {
  if (item.completedAt) return false;
  if (canManage) return true;
  const members = (item.members ?? []).map((m) => String(m).trim());
  return members.includes(userNickname);
}
