import type { FreeSongSubmission } from './types';
import { normalizeBuskingNickname } from '../BuskingMember/buskingParticipantsUtils';

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

/** 본인이 직접 전송한 곡 수 */
export function countOwnSubmissions(
  submissions: FreeSongSubmission[],
  userUid: string,
  userNickname: string
): number {
  const nick = normalizeBuskingNickname(userNickname);
  return submissions.filter(
    (submission) =>
      !isRejectedSubmission(submission) &&
      (submission.submittedByUid === userUid ||
        (!submission.submittedByUid && normalizeBuskingNickname(submission.submittedBy) === nick))
  ).length;
}

/** 본인 전송 + 파트너가 대신 전송한 곡 수 (전송 한도 집계용) */
export function countUserQuotaSubmissions(
  submissions: FreeSongSubmission[],
  userUid: string,
  userNickname: string
): number {
  const nick = normalizeBuskingNickname(userNickname);
  return submissions.filter((submission) => {
    if (isRejectedSubmission(submission)) return false;
    if (
      submission.submittedByUid === userUid ||
      (!submission.submittedByUid && normalizeBuskingNickname(submission.submittedBy) === nick)
    ) {
      return true;
    }
    return isPartnerSubmitted(submission, nick);
  }).length;
}

/** 전송 시 합격곡 멤버 중 한도를 초과하는 사람이 있으면 닉네임 반환 */
export function findMemberOverSubmissionQuota(
  submissions: FreeSongSubmission[],
  members: string[],
  submitterUid: string,
  submitterNickname: string
): string | null {
  const submitterNick = normalizeBuskingNickname(submitterNickname);
  for (const member of members) {
    const memberNick = normalizeBuskingNickname(member);
    if (!memberNick) continue;
    const memberUid = memberNick === submitterNick ? submitterUid : '';
    if (countUserQuotaSubmissions(submissions, memberUid, memberNick) >= FREE_SONG_SUBMISSION_LIMIT) {
      return memberNick;
    }
  }
  return null;
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
