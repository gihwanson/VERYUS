import type { FreeSongSubmission } from './types';

export const FREE_SONG_SUBMISSION_LIMIT = 3;

export function normalizeSubmissions(raw: unknown): FreeSongSubmission[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && 'id' in item)
    .map((item) => {
      const row = item as FreeSongSubmission;
      return {
        ...row,
        status: row.status === 'rejected' ? 'rejected' : 'pending',
      };
    });
}

export function isRejectedSubmission(submission: FreeSongSubmission): boolean {
  return submission.status === 'rejected';
}

export function findSubmissionBySongId(
  submissions: FreeSongSubmission[],
  approvedSongId: string,
  options?: { includeRejected?: boolean }
): FreeSongSubmission | undefined {
  const includeRejected = options?.includeRejected ?? false;
  return submissions.find((s) =>
    s.approvedSongId === approvedSongId && (includeRejected || !isRejectedSubmission(s))
  );
}

/** 파트너(같은 합격곡의 다른 멤버)가 이미 전송했는지 */
export function isPartnerSubmitted(
  submission: FreeSongSubmission,
  userNickname: string
): boolean {
  const nickname = userNickname.trim();
  if (!nickname || submission.submittedBy === nickname) return false;
  return submission.members.some((m) => String(m).trim() === nickname);
}

/** 파트너가 상대방 전송을 취소할 수 있는지 */
export function canCancelAsPartner(
  submission: FreeSongSubmission,
  userNickname: string
): boolean {
  return isPartnerSubmitted(submission, userNickname);
}
