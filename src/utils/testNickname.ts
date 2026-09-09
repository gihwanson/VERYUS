/** 익명 투표 등 실제 집계에서 제외할 테스트/더미 닉네임 */
export function isTestNickname(nickname: string | null | undefined): boolean {
  const trimmed = (nickname || '').trim();
  if (!trimmed) return false;
  if (trimmed === '평가자') return true;
  if (trimmed.startsWith('테스트')) return true;
  if (/^test/i.test(trimmed)) return true;
  return false;
}

export const TEST_NICKNAME_VOTE_BLOCKED_MESSAGE =
  '테스트 닉네임 계정은 익명 투표에 참여할 수 없습니다.';
