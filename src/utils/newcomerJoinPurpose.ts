export const NEWCOMER_JOIN_PURPOSES = [
  {
    id: 'sing',
    label: '버스킹/노래에 관심이 있어요!',
    badge: '버스킹/노래에 관심이 있어요!',
  },
  {
    id: 'social',
    label: '친목에 관심이 있어요!',
    badge: '친목에 관심이 있어요!',
  },
] as const;

export type NewcomerJoinPurpose = (typeof NEWCOMER_JOIN_PURPOSES)[number]['id'];

export function isNewcomerJoinPurpose(value: unknown): value is NewcomerJoinPurpose {
  return value === 'sing' || value === 'social';
}

export function newcomerJoinPurposeBadge(value: unknown): string | null {
  const item = NEWCOMER_JOIN_PURPOSES.find((purpose) => purpose.id === value);
  return item ? item.badge : null;
}
