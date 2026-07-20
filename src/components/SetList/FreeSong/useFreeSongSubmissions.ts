import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
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
  getFreeSongParticipants,
  isApprovedSongEligibleForBusking,
  isFreeSongParticipant,
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
import {
  mutateSetlistFreeSong,
  readSetlistFreeSongState,
  removeSubmissionFromState,
} from './freeSongSetlistMutations';
import {
  canManageBuskingSession,
} from '../buskingSessionPermissions';
import { ROLE_SYSTEM } from '../../AdminTypes';

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

function sortApprovedSongs(songs: ApprovedSong[]): ApprovedSong[] {
  return songs.slice().sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
}

function filterMyApprovedSongs(songs: ApprovedSong[], userNickname: string): ApprovedSong[] {
  const nick = normalizeBuskingNickname(userNickname);
  if (!nick) return [];
  return sortApprovedSongs(songs.filter((song) => isUserInApprovedSong(song, nick)));
}

export function useFreeSongSubmissions(
  activeSetList: SetListData | null,
  userNickname: string,
  userUid: string,
  setlistLoading: boolean,
  userRole?: string | null
) {
  const [approvedSongs, setApprovedSongs] = useState<ApprovedSong[]>([]);
  const [approvedSongsLoading, setApprovedSongsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const loadingRef = useRef(false);

  const setlistId = activeSetList?.id;
  const normalizedNickname = normalizeBuskingNickname(userNickname);
  const isLeader = userRole === ROLE_SYSTEM.LEADER;
  const participantsKey = JSON.stringify(getFreeSongParticipants(activeSetList));

  const submissions = useMemo(
    () => sortSubmissions(normalizeSubmissions(activeSetList?.freeSongSubmissions)),
    [activeSetList]
  );

  const lineupSubmissionIds = useMemo(() => {
    const ids = new Set<string>();
    (activeSetList?.freeSongLineup ?? []).forEach((item) => {
      if (!item.completedAt) ids.add(item.submissionId);
    });
    return ids;
  }, [activeSetList]);

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
        let songs: ApprovedSong[];

        if (isLeader) {
          const allSnap = await getDocs(collection(db, 'approvedSongs'));
          songs = sortApprovedSongs(allSnap.docs.map(mapApprovedSongDoc));
        } else {
          const byQuerySnap = await getDocs(
            query(collection(db, 'approvedSongs'), where('members', 'array-contains', normalizedNickname))
          );
          const byQuery = byQuerySnap.docs.map(mapApprovedSongDoc);

          let loaded = byQuery;
          if (byQuery.length === 0) {
            const allSnap = await getDocs(collection(db, 'approvedSongs'));
            loaded = allSnap.docs.map(mapApprovedSongDoc);
          }
          songs = filterMyApprovedSongs(loaded, normalizedNickname);
        }

        if (!cancelled) {
          setApprovedSongs(songs);
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
  }, [normalizedNickname, isLeader]);

  const participants = useMemo(
    () => getFreeSongParticipants(activeSetList),
    [activeSetList?.id, participantsKey]
  );
  const eligibleApprovedSongs = useMemo(
    () => approvedSongs.filter((song) => isApprovedSongEligibleForBusking(song, participants)),
    [approvedSongs, participants]
  );

  const isParticipant = isFreeSongParticipant(activeSetList, normalizedNickname);
  const canAccessSubmit = isParticipant || isLeader;
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
  const canSubmitMore = isLeader || quotaSubmissionCount < FREE_SONG_SUBMISSION_LIMIT;
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

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | false | 'busy'> => {
    if (!setlistId) return false;
    if (loadingRef.current) return 'busy';
    loadingRef.current = true;
    setActionLoading(true);
    try {
      return await fn();
    } finally {
      loadingRef.current = false;
      setActionLoading(false);
    }
  }, [setlistId]);

  const readFreshSubmissions = useCallback(async (): Promise<FreeSongSubmission[]> => {
    if (!setlistId) return [];
    const snap = await getDoc(doc(db, 'setlists', setlistId));
    if (!snap.exists()) return [];
    return readSetlistFreeSongState(snap.data()).submissions;
  }, [setlistId]);

  const submitSong = useCallback(
    async (song: ApprovedSong, submittedByUid: string) => {
      if (!setlistId || !activeSetList) return false;
      if (!isLeader && !isFreeSongParticipant(activeSetList, normalizedNickname)) {
        alert('버스킹 참가 멤버만 합격곡을 전송할 수 있습니다. 멤버 편성을 확인해 주세요.');
        return false;
      }
      if (!isApprovedSongEligibleForBusking(song, participants)) {
        alert('합격곡 멤버 전원이 참가 멤버에 포함되어야 전송할 수 있습니다.');
        return false;
      }
      if (!isLeader && !isUserInApprovedSong(song, normalizedNickname)) {
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
        ...(isLeader ? { quotaExempt: true } : {}),
      };

      const result = await withLoading(async () => {
        try {
          const ok = await mutateSetlistFreeSong(setlistId, (state) => {
            const existing = findSubmissionBySongId(state.submissions, song.id);
            if (existing) return null;

            if (
              !isLeader &&
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
            const freshSubmissions = await readFreshSubmissions();
            const freshExisting = findSubmissionBySongId(freshSubmissions, song.id);
            if (freshExisting) {
              if (
                freshExisting.submittedByUid === submittedByUid ||
                normalizeBuskingNickname(freshExisting.submittedBy) === normalizedNickname
              ) {
                return true;
              }
              if (isPartnerSubmitted(freshExisting, normalizedNickname)) {
                alert('파트너가 이미 전송을 했습니다.');
              } else {
                alert('이미 전송된 곡입니다.');
              }
              return false;
            }

            if (!isLeader) {
              const overQuotaMember = findMemberOverSubmissionQuota(
                freshSubmissions,
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
                return false;
              }
            }
            alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
            return false;
          }
          return true;
        } catch (error) {
          console.error('자유곡 전송 실패:', error);
          try {
            const freshSubmissions = await readFreshSubmissions();
            if (findSubmissionBySongId(freshSubmissions, song.id)) return true;
          } catch (recheckError) {
            console.error('자유곡 전송 재확인 실패:', recheckError);
          }
          alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return false;
        }
      });

      if (result === 'busy') return false;
      return result;
    },
    [setlistId, activeSetList, normalizedNickname, participants, withLoading, readFreshSubmissions, isLeader]
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

      const result = await withLoading(async () => {
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
      if (result === 'busy') return false;
      return result;
    },
    [setlistId, activeSetList, withLoading]
  );

  const rejectSubmission = useCallback(
    async (submission: FreeSongSubmission, rejectedBy: string) => {
      if (!setlistId || !activeSetList) return false;
      if (!canManageBuskingSession(activeSetList, { uid: userUid, nickname: normalizedNickname, role: userRole })) {
        alert('본인이 연 버스킹 세션만 수정할 수 있습니다. 리더·너래만 다른 세션을 관리할 수 있습니다.');
        return false;
      }
      const rejectedByName = normalizeBuskingNickname(rejectedBy) || '관리자';

      const result = await withLoading(async () => {
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
      if (result === 'busy') return false;
      return result;
    },
    [setlistId, activeSetList, withLoading, userUid, normalizedNickname, userRole]
  );

  const dismissRejectedSubmission = useCallback(
    async (submissionId: string, actorUid: string) => {
      if (!setlistId || !activeSetList) return false;
      const result = await withLoading(async () => {
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
      if (result === 'busy') return false;
      return result;
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
    isLeader,
    partnerSubmittedSongs,
    availableSongs,
    eligibleApprovedSongs,
    approvedSongs,
    lineupSubmissionIds,
    isParticipant,
    canAccessSubmit,
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
