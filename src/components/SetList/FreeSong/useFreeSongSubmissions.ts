import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { SetListData } from '../types';
import type { ApprovedSong } from '../../ApprovedSongsUtils';
import type { FreeSongSubmission } from './types';
import { isBuskingParticipant, getBuskingParticipants, isApprovedSongEligibleForBusking } from '../BuskingMember/buskingParticipantsUtils';
import {
  findSubmissionBySongId,
  isPartnerSubmitted,
  canCancelAsPartner,
  normalizeSubmissions,
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

function countUserSubmissions(submissions: FreeSongSubmission[], userUid: string, userNickname: string): number {
  return submissions.filter(
    (s) => s.submittedByUid === userUid || (!s.submittedByUid && s.submittedBy === userNickname)
  ).length;
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
    if (!userNickname) {
      setApprovedSongs([]);
      return;
    }
    setApprovedSongsLoading(true);
    getDocs(collection(db, 'approvedSongs'))
      .then((snap) => {
        const songs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          members: Array.isArray(d.data().members) ? d.data().members : [],
        })) as ApprovedSong[];
        setApprovedSongs(
          songs
            .filter((song) => song.members.some((m) => String(m).trim() === userNickname))
            .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'))
        );
      })
      .catch((error) => {
        console.error('합격곡 로드 실패:', error);
      })
      .finally(() => setApprovedSongsLoading(false));
  }, [userNickname]);

  const participants = useMemo(
    () => getBuskingParticipants(activeSetList),
    [activeSetList?.participants]
  );
  const eligibleApprovedSongs = useMemo(
    () => approvedSongs.filter((song) => isApprovedSongEligibleForBusking(song, participants)),
    [approvedSongs, participants]
  );

  const submittedSongIds = new Set(submissions.map((s) => s.approvedSongId));
  const isParticipant = isBuskingParticipant(activeSetList, userNickname);
  const mySubmissions = submissions.filter(
    (s) => s.submittedByUid === userUid || (!s.submittedByUid && s.submittedBy === userNickname)
  );
  const mySubmissionCount = mySubmissions.length;
  const canSubmitMore = mySubmissionCount < FREE_SONG_SUBMISSION_LIMIT;
  const partnerSubmittedSongs = eligibleApprovedSongs
    .map((song) => {
      const submission = findSubmissionBySongId(submissions, song.id);
      if (!submission || submission.submittedByUid === userUid || submission.submittedBy === userNickname) {
        return null;
      }
      if (!isPartnerSubmitted(submission, userNickname)) return null;
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
      if (!isBuskingParticipant(activeSetList, userNickname)) {
        alert('버스킹 참가 멤버만 합격곡을 전송할 수 있습니다. 멤버 편성을 확인해 주세요.');
        return false;
      }
      if (!isApprovedSongEligibleForBusking(song, participants)) {
        alert('버스킹 참가 멤버 전원이 포함된 합격곡만 전송할 수 있습니다.');
        return false;
      }
      if (!song.members.some((m) => String(m).trim() === userNickname)) {
        alert('본인이 멤버로 포함된 합격곡만 전송할 수 있습니다.');
        return false;
      }

      const newSubmission: FreeSongSubmission = {
        id: doc(collection(db, 'setlists')).id,
        approvedSongId: song.id,
        title: song.title,
        members: song.members,
        submittedBy: userNickname,
        submittedByUid,
        createdAt: Timestamp.now(),
      };

      return withLoading(async () => {
        try {
          const ok = await mutateSetlistFreeSong(setlistId, (state) => {
            const existing = findSubmissionBySongId(state.submissions, song.id);
            if (existing) return null;

            if (countUserSubmissions(state.submissions, submittedByUid, userNickname) >= FREE_SONG_SUBMISSION_LIMIT) {
              return null;
            }

            return { freeSongSubmissions: [...state.submissions, newSubmission] };
          });

          if (!ok) {
            const freshExisting = findSubmissionBySongId(submissions, song.id);
            if (freshExisting) {
              if (isPartnerSubmitted(freshExisting, userNickname)) {
                alert('파트너가 이미 전송을 했습니다.');
              } else {
                alert('이미 전송된 곡입니다.');
              }
            } else if (mySubmissionCount >= FREE_SONG_SUBMISSION_LIMIT) {
              alert(
                `최대 ${FREE_SONG_SUBMISSION_LIMIT}곡까지 전송할 수 있습니다. 진행 완료 또는 관리자 제거 후 추가 전송이 가능합니다.`
              );
            } else {
              alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
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
    [setlistId, activeSetList, userNickname, userUid, participants, submissions, mySubmissionCount, withLoading]
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

  return {
    submissions,
    mySubmissions,
    mySubmissionCount,
    submissionLimit: FREE_SONG_SUBMISSION_LIMIT,
    canSubmitMore,
    partnerSubmittedSongs,
    availableSongs,
    eligibleApprovedSongs,
    approvedSongs,
    lineupSubmissionIds,
    isParticipant,
    loading,
    actionLoading,
    submitSong,
    cancelSubmission,
  };
}

export type FreeSongSubmissionsState = ReturnType<typeof useFreeSongSubmissions>;
