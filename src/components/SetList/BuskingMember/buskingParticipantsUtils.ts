import type { SetListData } from '../types';

export function getBuskingParticipants(list: SetListData | null | undefined): string[] {
  return (list?.participants ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean);
}

export function isBuskingParticipant(
  list: SetListData | null | undefined,
  nickname: string
): boolean {
  const nick = nickname.trim();
  if (!nick) return false;
  const participants = getBuskingParticipants(list);
  if (participants.length === 0) return false;
  return participants.includes(nick);
}

/** 합격곡 멤버 전원이 버스킹 참가 편성에 포함된 경우만 전송 대상 */
export function isApprovedSongEligibleForBusking(
  song: { members: string[] },
  participants: string[]
): boolean {
  const participantSet = new Set(participants.map((p) => String(p).trim()).filter(Boolean));
  const members = (song.members ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (members.length === 0) return false;
  return members.every((m) => participantSet.has(m));
}
