import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { SetListData } from '../types';
import type { ApprovedSong } from '../../ApprovedSongsUtils';
import type { FreeSongSubmission } from './types';
import {
  getBuskingParticipants,
  isApprovedSongEligibleForBusking,
  isBuskingParticipant,
  isUserInApprovedSong,
  normalizeBuskingNickname,
} from '../BuskingMember/buskingParticipantsUtils';
import {
  findSubmissionBySongId,
  findMemberOverSubmissionQuota,
  isPartnerSubmitted,
  canCancelAsPartner,
  isRejectedSubmission,
  normalizeSubmissions,
  countUserQuotaSubmissions,
  FREE_SONG_SUBMISSION_LIMIT,
} from './freeSongSubmissionUtils';
import { mutateSetlistFreeSong, removeSubmissionFromState } from './freeSongSetlistMutations';

function sortSubmissions(submissions: FreeSongSubmission[]): FreeSongSubmission[] {
  return submissions.slice().sort((a, b) => {
    const aMs =
      a.createdAt?.toMillis?.() ??
      (typeof a.createdAt === 'number' ? a.createdAt : 0);
    const bMs =
      b.createdAt?.toMillis?.() ??
      (typeof b.createdAt === 'number' ? b.createdAt : 0);
    return bMs - aMs;
  });
}

function mapApprovedSongDoc(d: { id: string; data: () => Record<string, unknown> }): ApprovedSong {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    members: Array.isArray(data.members) ? data.members : [],
  } as ApprovedSong;
}

function filterMyApprovedSongs(songs: ApprovedSong[], userNickname: string): ApprovedSong[] {
  const nick = normalizeBuskingNickname(userNickname);
  if (!nick) return [];
  return songs
    .filter((song) => isUserInApprovedSong(song, nick))
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
}

export function useFreeSongSubmissions(
  activeSetList: SetListData | null,
  userNickname: string,
  userUid: string,
  setlistLoading: boolean
) {
  const [approvedSongs, setApprovedSongs] = useState<ApprovedSong[]>([]);
  const [approvedSongsLoading, setApprovedSongsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const loadingRef = useRef(false);

  const setlistId = activeSetList?.id;
  const normalizedNickname = normalizeBuskingNickname(userNickname);
  const participantsKey = JSON.stringify(getBuskingParticipants(activeSetList));

  const submissions = useMemo(
    () => sortSubmissions(normalizeSubmissions(activeSetList?.freeSongSubmissions)),
    [activeSetList?.freeSongSubmissions]
  );

  const lineupSubmissionIds = useMemo(() => {
    const ids = new Set<string>();
    (activeSetList?.freeSongLineup ?? []).forEach((item) => {
      if (!item.completedAt) ids.add(item.submissionId);
    });
    return ids;
  }, [activeSetList?.freeSongLineup]);

  const loading = setlistLoading || approvedSongsLoading;

  useEffect(() => {
    if (!normalizedNickname) {
      setApprovedSongs([]);
      return;
    }

    let cancelled = false;
    setApprovedSongsLoading(true);

    const loadApprovedSongs = async () => {
      try {
        const byQuerySnap = await getDocs(
          query(collection(db, 'approvedSongs'), where('members', 'array-contains', normalizedNickname))
        );
        const byQuery = byQuerySnap.docs.map(mapApprovedSongDoc);

        let songs = byQuery;
        if (byQuery.length === 0) {
          const allSnap = await getDocs(collection(db, 'approvedSongs'));
          songs = allSnap.docs.map(mapApprovedSongDoc);
        }

        if (!cancelled) {
          setApprovedSongs(filterMyApprovedSongs(songs, normalizedNickname));
        }
      } catch (error) {
        console.error('합격곡 로드 실패:', error);
        if (!cancelled) setApprovedSongs([]);
      } finally {
        if (!cancelled) setApprovedSongsLoading(false);
      }
    };

    void loadApprovedSongs();
    return () => {
      cancelled = true;
    };
  }, [normalizedNickname]);

  const participants = useMemo(
    () => getBuskingParticipants(activeSetList),
    [activeSetList?.id, participantsKey]
  );
  const eligibleApprovedSongs = useMemo(
    () => approvedSongs.filter((song) => isApprovedSongEligibleForBusking(song, participants)),
    [approvedSongs, participants]
  );

  const isParticipant = isBuskingParticipant(activeSetList, normalizedNickname);
  const activeSubmissions = submissions.filter((s) => !isRejectedSubmission(s));
  const submittedSongIds = new Set(activeSubmissions.map((s) => s.approvedSongId));
  const mySubmissions = activeSubmissions.filter(
    (s) =>
      s.submittedByUid === userUid ||
      (!s.submittedByUid && normalizeBuskingNickname(s.submittedBy) === normalizedNickname)
  );
  const myRejectedSubmissions = submissions.filter(
    (s) =>
      isRejectedSubmission(s) &&
      (s.submittedByUid === userUid ||
        (!s.submittedByUid && normalizeBuskingNickname(s.submittedBy) === normalizedNickname))
  );
  const mySubmissionCount = mySubmissions.length;
  const quotaSubmissionCount = countUserQuotaSubmissions(activeSubmissions, userUid, normalizedNickname);
  const canSubmitMore = quotaSubmissionCount < FREE_SONG_SUBMISSION_LIMIT;
  const partnerSubmittedSongs = eligibleApprovedSongs
    .map((song) => {
      const submission = findSubmissionBySongId(activeSubmissions, song.id);
      if (
        !submission ||
        submission.submittedByUid === userUid ||
        normalizeBuskingNickname(submission.submittedBy) === normalizedNickname
      ) {
        return null;
      }
      if (!isPartnerSubmitted(submission, normalizedNickname)) return null;
      return { song, submission };
    })
    .filter((item): item is { song: ApprovedSong; submission: FreeSongSubmission } => item != null);
  const availableSongs = eligibleApprovedSongs.filter((song) => !submittedSongIds.has(song.id));

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | false> => {
    if (!setlistId || loadingRef.current) return false;
    loadingRef.current = true;
    setActionLoading(true);
    try {
      return await fn();
    } finally {
      loadingRef.current = false;
      setActionLoading(false);
    }
  }, [setlistId]);

  const submitSong = useCallback(
    async (song: ApprovedSong, submittedByUid: string) => {
      if (!setlistId || !activeSetList) return false;
      if (!isBuskingParticipant(activeSetList, normalizedNickname)) {
        alert('버스킹 참가 멤버만 합격곡을 전송할 수 있습니다. 멤버 편성을 확인해 주세요.');
        return false;
      }
      if (!isApprovedSongEligibleForBusking(song, participants)) {
        alert('합격곡 멤버 전원이 참가 멤버에 포함되어야 전송할 수 있습니다.');
        return false;
      }
      if (!isUserInApprovedSong(song, normalizedNickname)) {
        alert('본인이 멤버로 포함된 합격곡만 전송할 수 있습니다.');
        return false;
      }

      const newSubmission: FreeSongSubmission = {
        id: doc(collection(db, 'setlists')).id,
        approvedSongId: song.id,
        title: song.title,
        members: song.members,
        submittedBy: normalizedNickname,
        submittedByUid,
        createdAt: Timestamp.now(),
      };

      return withLoading(async () => {
        try {
          const ok = await mutateSetlistFreeSong(setlistId, (state) => {
            const existing = findSubmissionBySongId(state.submissions, song.id);
            if (existing) return null;

            if (
              findMemberOverSubmissionQuota(
                state.submissions,
                song.members,
                submittedByUid,
                normalizedNickname
              )
            ) {
              return null;
            }

            return { freeSongSubmissions: [...state.submissions, newSubmission] };
          });

          if (!ok) {
            const freshExisting = findSubmissionBySongId(submissions, song.id);
            if (freshExisting) {
              if (isPartnerSubmitted(freshExisting, normalizedNickname)) {
                alert('파트너가 이미 전송을 했습니다.');
              } else {
                alert('이미 전송된 곡입니다.');
              }
            } else {
              const overQuotaMember = findMemberOverSubmissionQuota(
                submissions,
                song.members,
                submittedByUid,
                normalizedNickname
              );
              if (overQuotaMember) {
                if (overQuotaMember === normalizedNickname) {
                  alert(
                    `최대 ${FREE_SONG_SUBMISSION_LIMIT}곡까지 전송할 수 있습니다. 본인 전송·파트너 전송 곡을 합쳐 집계됩니다.`
                  );
                } else {
                  alert(
                    `파트너 ${overQuotaMember}님은 이미 최대 ${FREE_SONG_SUBMISSION_LIMIT}곡 한도에 도달했습니다.`
                  );
                }
              } else if (quotaSubmissionCount >= FREE_SONG_SUBMISSION_LIMIT) {
                alert(
                  `최대 ${FREE_SONG_SUBMISSION_LIMIT}곡까지 전송할 수 있습니다. 본인 전송·파트너 전송 곡을 합쳐 집계됩니다.`
                );
              } else {
                alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
              }
            }
            return false;
          }
          return true;
        } catch (error) {
          console.error('자유곡 전송 실패:', error);
          alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return false;
        }
      });
    },
    [setlistId, activeSetList, normalizedNickname, userUid, participants, submissions, quotaSubmissionCount, withLoading]
  );

  const cancelSubmission = useCallback(
    async (
      submission: FreeSongSubmission,
      actorUid: string,
      options?: { asManager?: boolean; actorNickname?: string }
    ) => {
      if (!setlistId || !activeSetList) return false;

      const isOwner = submission.submittedByUid === actorUid;
      const isPartnerCancel =
        options?.actorNickname != null &&
        canCancelAsPartner(submission, options.actorNickname);
      const canCancel = isOwner || options?.asManager || isPartnerCancel;

      if (!canCancel) {
        alert('본인이 전송한 곡만 취소할 수 있습니다.');
        return false;
      }

      let confirmMessage: string;
      if (options?.asManager && !isOwner) {
        confirmMessage =
          `${submission.submittedBy}님이 전송한 "${submission.title}"을(를) 취소하시겠습니까?\n` +
          '취소 시 해당 멤버가 다시 곡을 전송할 수 있습니다.';
      } else if (isPartnerCancel) {
        confirmMessage =
          `파트너 ${submission.submittedBy}님이 전송한 "${submission.title}"을(를) 취소하시겠습니까?`;
      } else {
        confirmMessage = `"${submission.title}" 전송을 취소하시겠습니까?`;
      }

      if (!confirm(confirmMessage)) return false;

      return withLoading(async () => {
        try {
          const ok = await mutateSetlistFreeSong(setlistId, (state) => {
            if (!state.submissions.some((s) => s.id === submission.id)) return null;
            const next = removeSubmissionFromState(state.submissions, state.lineup, submission.id);
            return {
              freeSongSubmissions: next.submissions,
              freeSongLineup: next.lineup,
            };
          });
          if (!ok) {
            alert('취소에 실패했습니다. 이미 처리된 전송일 수 있습니다.');
            return false;
          }
          return true;
        } catch (error) {
          console.error('자유곡 전송 취소 실패:', error);
          alert('취소에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return false;
        }
      });
    },
    [setlistId, activeSetList, withLoading]
  );

  const rejectSubmission = useCallback(
    async (submission: FreeSongSubmission, rejectedBy: string) => {
      if (!setlistId || !activeSetList) return false;
      const rejectedByName = normalizeBuskingNickname(rejectedBy) || '관리자';
      if (
        !confirm(
          `${submission.submittedBy}님이 전송한 "${submission.title}"을(를) 거부하시겠습니까?\n` +
            '거부된 곡은 전송 내역에 남고, 해당 멤버는 같은 곡을 다시 전송할 수 있습니다.'
        )
      ) {
        return false;
      }

      return withLoading(async () => {
        try {
          const ok = await mutateSetlistFreeSong(setlistId, (state) => {
            const index = state.submissions.findIndex((s) => s.id === submission.id);
            if (index < 0) return null;
            if (state.submissions[index].status === 'rejected') return null;

            const nextSubmissions = [...state.submissions];
            nextSubmissions[index] = {
              ...nextSubmissions[index],
              status: 'rejected',
              rejectedBy: rejectedByName,
              rejectedAt: Timestamp.now(),
            };

            return {
              freeSongSubmissions: nextSubmissions,
              freeSongLineup: state.lineup.filter((row) => row.submissionId !== submission.id),
            };
          });
          if (!ok) {
            alert('거부 처리에 실패했습니다. 이미 처리된 전송일 수 있습니다.');
            return false;
          }
          return true;
        } catch (error) {
          console.error('자유곡 거부 처리 실패:', error);
          alert('거부 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return false;
        }
      });
    },
    [setlistId, activeSetList, withLoading]
  );

  const dismissRejectedSubmission = useCallback(
    async (submissionId: string, actorUid: string) => {
      if (!setlistId || !activeSetList) return false;
      return withLoading(async () => {
        try {
          const ok = await mutateSetlistFreeSong(setlistId, (state) => {
            const target = state.submissions.find((s) => s.id === submissionId);
            if (!target) return null;
            if (target.status !== 'rejected') return null;
            if (target.submittedByUid !== actorUid) return null;
            return {
              freeSongSubmissions: state.submissions.filter((s) => s.id !== submissionId),
            };
          });
          if (!ok) {
            alert('삭제에 실패했습니다. 이미 처리되었거나 권한이 없습니다.');
            return false;
          }
          return true;
        } catch (error) {
          console.error('거부 전송 삭제 실패:', error);
          alert('삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return false;
        }
      });
    },
    [setlistId, activeSetList, withLoading]
  );

  return {
    submissions,
    activeSubmissions,
    mySubmissions,
    myRejectedSubmissions,
    mySubmissionCount,
    quotaSubmissionCount,
    submissionLimit: FREE_SONG_SUBMISSION_LIMIT,
    canSubmitMore,
    partnerSubmittedSongs,
    availableSongs,
    eligibleApprovedSongs,
    approvedSongs,
    lineupSubmissionIds,
    isParticipant,
    participants,
    loading,
    actionLoading,
    submitSong,
    cancelSubmission,
    rejectSubmission,
    dismissRejectedSubmission,
  };
}

export type FreeSongSubmissionsState = ReturnType<typeof useFreeSongSubmissions>;
