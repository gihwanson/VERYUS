import { normalizeBuskingNickname } from '../BuskingMember/buskingParticipantsUtils';

export function normalizeBuskingLyrics(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trimEnd() : '';
}

export function hasBuskingLyrics(value: string | null | undefined): boolean {
  return normalizeBuskingLyrics(value).trim().length > 0;
}

/** 곡 멤버·전송자·세션 관리자가 버스킹 가사 편집 가능 */
export function canEditBuskingLyrics(
  item: { members?: string[]; submittedBy?: string },
  nickname: string | null | undefined,
  options?: { canManage?: boolean }
): boolean {
  if (options?.canManage) return true;
  const nick = normalizeBuskingNickname(nickname ?? '');
  if (!nick) return false;
  if (normalizeBuskingNickname(item.submittedBy ?? '') === nick) return true;
  return (item.members ?? []).some((m) => normalizeBuskingNickname(m) === nick);
}
