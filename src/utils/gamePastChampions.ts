import type { GamePlatform } from './gamePlatform';

export type GameId = 'typingSpeed' | 'reactionTime' | 'rhythmBeat' | 'flappyBird' | 'nunSalMi';

export interface GamePastChampion {
  id: string;
  uid: string;
  nickname: string;
  platform: GamePlatform;
  durationMs: number;
  cpm?: number;
  sentence?: string;
  accuracy?: number;
  bpm?: number;
  weekKey: string;
  weekLabel: string;
  gameId: GameId;
}

export type PastChampionKind = 'allTimeBest' | 'latest';

export type PastChampionDisplay = GamePastChampion & {
  kind: PastChampionKind;
};

/** a가 b보다 더 좋은 기록이면 true */
export const isBetterPastChampion = (
  gameId: GameId,
  a: GamePastChampion,
  b: GamePastChampion
): boolean => {
  if (gameId === 'typingSpeed') {
    const aCpm = Number(a.cpm) || 0;
    const bCpm = Number(b.cpm) || 0;
    if (aCpm !== bCpm) return aCpm > bCpm;
    return a.durationMs < b.durationMs;
  }
  if (gameId === 'rhythmBeat') {
    const aAcc = Number(a.accuracy) || 0;
    const bAcc = Number(b.accuracy) || 0;
    if (aAcc !== bAcc) return aAcc > bAcc;
    return a.durationMs < b.durationMs;
  }
  if (gameId === 'flappyBird') {
    return a.durationMs > b.durationMs;
  }
  // reactionTime, nunSalMi — 짧을수록 우수
  return a.durationMs < b.durationMs;
};

/**
 * 화면에는 역대 최고 1건 + 가장 최근(직전 주) 1건만 노출.
 * 둘이 같으면 1건만 반환.
 */
export const selectPastChampionsForDisplay = (
  champions: GamePastChampion[],
  platform: GamePlatform,
  gameId?: GameId
): PastChampionDisplay[] => {
  const list = champions.filter((c) => c.platform === platform);
  if (list.length === 0) return [];

  const gid = gameId ?? list[0].gameId ?? 'reactionTime';
  const latest = [...list].sort((a, b) => b.weekKey.localeCompare(a.weekKey))[0];

  let best = list[0];
  for (const c of list) {
    if (isBetterPastChampion(gid, c, best)) best = c;
  }

  if (best.id === latest.id) {
    return [{ ...best, kind: 'allTimeBest' }];
  }

  return [
    { ...best, kind: 'allTimeBest' },
    { ...latest, kind: 'latest' },
  ];
};

/** @deprecated selectPastChampionsForDisplay 사용 */
export const sortPastChampions = (
  champions: GamePastChampion[],
  platform: GamePlatform
): GamePastChampion[] =>
  selectPastChampionsForDisplay(champions, platform).map(({ kind: _kind, ...rest }) => rest);
