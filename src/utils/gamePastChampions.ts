import type { GamePlatform } from './gamePlatform';

export type GameId = 'typingSpeed' | 'reactionTime' | 'rhythmBeat' | 'flappyBird';

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

export const sortPastChampions = (
  champions: GamePastChampion[],
  platform: GamePlatform
): GamePastChampion[] =>
  champions
    .filter((c) => c.platform === platform)
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
