import type { SetListData } from '../types';

export function normalizeBuskingNickname(value: unknown): string {
  return String(value ?? '').trim();
}

export function getBuskingParticipants(list: SetListData | null | undefined): string[] {
  return (list?.participants ?? [])
    .map((p) => normalizeBuskingNickname(p))
    .filter(Boolean);
}

export function isBuskingParticipant(
  list: SetListData | null | undefined,
  nickname: string
): boolean {
  const nick = normalizeBuskingNickname(nickname);
  if (!nick) return false;
  const participants = getBuskingParticipants(list);
  if (participants.length === 0) return false;
  return participants.includes(nick);
}

export function isUserInApprovedSong(song: { members: string[] }, nickname: string): boolean {
  const nick = normalizeBuskingNickname(nickname);
  if (!nick) return false;
  return (song.members ?? []).some((m) => normalizeBuskingNickname(m) === nick);
}

/** 합격곡 멤버 전원이 버스킹 참가 편성에 포함된 경우만 전송 대상 */
export function isApprovedSongEligibleForBusking(
  song: { members: string[] },
  participants: string[]
): boolean {
  const participantSet = new Set(participants.map((p) => normalizeBuskingNickname(p)).filter(Boolean));
  const members = (song.members ?? []).map((m) => normalizeBuskingNickname(m)).filter(Boolean);
  if (members.length === 0) return false;
  return members.every((m) => participantSet.has(m));
}
