import type { SetListData } from '../types';

export function normalizeBuskingNickname(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeParticipantList(values: unknown[] | undefined): string[] {
  return (values ?? []).map((p) => normalizeBuskingNickname(p)).filter(Boolean);
}

/** 셋리스트 카테고리 참가 멤버 */
export function getSetlistParticipants(list: SetListData | null | undefined): string[] {
  return normalizeParticipantList(list?.participants);
}

/**
 * 자유곡 카테고리 참가 멤버 (셋리스트 participants와 별도 필드만 사용).
 */
export function getFreeSongParticipants(list: SetListData | null | undefined): string[] {
  if (!list) return [];
  return normalizeParticipantList(list.freeSongParticipants);
}

/** @deprecated getSetlistParticipants 또는 getFreeSongParticipants 사용 */
export function getBuskingParticipants(list: SetListData | null | undefined): string[] {
  return getSetlistParticipants(list);
}

export function isSetlistParticipant(
  list: SetListData | null | undefined,
  nickname: string
): boolean {
  const nick = normalizeBuskingNickname(nickname);
  if (!nick) return false;
  return getSetlistParticipants(list).includes(nick);
}

export function isFreeSongParticipant(
  list: SetListData | null | undefined,
  nickname: string
): boolean {
  const nick = normalizeBuskingNickname(nickname);
  if (!nick) return false;
  return getFreeSongParticipants(list).includes(nick);
}

/** @deprecated isFreeSongParticipant 또는 isSetlistParticipant 사용 */
export function isBuskingParticipant(
  list: SetListData | null | undefined,
  nickname: string
): boolean {
  return isSetlistParticipant(list, nickname);
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
