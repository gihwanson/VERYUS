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

export interface CompletedMemberSong {
  key: string;
  title: string;
  members: string[];
  sessionLabel?: string;
  completedAtMs: number;
}

function memberMatchesStatsName(member: string, nickname: string): boolean {
  const nick = nickname.trim();
  const memberNick = String(member).trim();
  if (!nick || !memberNick) return false;
  if (memberNick === nick) return true;
  return memberNick.replace(/[./[\]#*$]/g, '_') === nick;
}

function completedAtMillis(item: FreeSongLineupItem): number {
  const value = item.completedAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

/** 완료된 라인업에서 해당 멤버가 참여한 곡. 최신 완료순 */
export function collectCompletedSongsForMember(
  sources: { sessionId?: string; sessionLabel?: string; lineup?: FreeSongLineupItem[] }[],
  nickname: string
): CompletedMemberSong[] {
  const songs: CompletedMemberSong[] = [];
  sources.forEach((source) => {
    (source.lineup ?? []).forEach((item) => {
      if (!item.completedAt) return;
      const members = (item.members ?? []).map((member) => String(member).trim()).filter(Boolean);
      if (!members.some((member) => memberMatchesStatsName(member, nickname))) return;
      const sessionId = source.sessionId || 'session';
      songs.push({
        key: `${sessionId}:${item.submissionId}`,
        title: item.title?.trim() || '제목 없음',
        members,
        sessionLabel: source.sessionLabel?.trim() || undefined,
        completedAtMs: completedAtMillis(item),
      });
    });
  });
  return songs.sort((a, b) => {
    if (b.completedAtMs !== a.completedAtMs) return b.completedAtMs - a.completedAtMs;
    return a.title.localeCompare(b.title, 'ko');
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
  const nick = userNickname.trim();
  if (!nick) return false;
  const members = (item.members ?? []).map((m) => String(m).trim());
  return members.includes(nick);
}
