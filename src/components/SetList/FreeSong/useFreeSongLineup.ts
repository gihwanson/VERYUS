import { useCallback, useEffect, useRef, useState } from 'react';
import {
  doc,
  deleteField,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { FreeSongLineupItem, FreeSongPerformerStats } from './types';
import { normalizeSubmissions } from './freeSongSubmissionUtils';
import type { FreeSongSubmission } from './types';
import {
  mutateSetlistFreeSong,
  normalizeLineup,
  removeSubmissionFromState,
  reorderPendingLineup,
  selfWithdrawFromState,
} from './freeSongSetlistMutations';

export { normalizeLineup } from './freeSongSetlistMutations';

export function useFreeSongLineup(setlistId: string | undefined) {
  const [actionLoading, setActionLoading] = useState(false);
  const loadingRef = useRef(false);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | false> => {
    if (!setlistId || loadingRef.current) return false;
    loadingRef.current = true;
    setActionLoading(true);
    try {
      return await fn();
    } catch (error) {
      console.error(error);
      return false as T | false;
    } finally {
      loadingRef.current = false;
      setActionLoading(false);
    }
  }, [setlistId]);

  const saveLineup = useCallback(
    async (lineup: FreeSongLineupItem[], extraFields?: Record<string, unknown>) => {
      if (!setlistId) return false;
      return withLoading(async () => {
        try {
          await updateDoc(doc(db, 'setlists', setlistId), {
            freeSongLineup: normalizeLineup(lineup),
            updatedAt: serverTimestamp(),
            ...extraFields,
          });
          return true;
        } catch (error) {
          console.error('자유곡 순서 저장 실패:', error);
          alert('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return false;
        }
      });
    },
    [setlistId, withLoading]
  );

  const addToLineup = useCallback(
    async (
      submission: {
        id: string;
        approvedSongId: string;
        title: string;
        members: string[];
        submittedBy: string;
      },
      _currentLineup: FreeSongLineupItem[]
    ) => {
      if (!setlistId) return false;
      return withLoading(async () => {
        const ok = await mutateSetlistFreeSong(setlistId, (state) => {
          if (state.lineup.some((item) => item.submissionId === submission.id)) return null;
          const next = [
            ...state.lineup,
            {
              submissionId: submission.id,
              approvedSongId: submission.approvedSongId,
              title: submission.title,
              members: submission.members,
              submittedBy: submission.submittedBy,
              order: state.lineup.length,
            },
          ];
          return { freeSongLineup: normalizeLineup(next) };
        });
        if (!ok) alert('이미 순서에 추가된 곡입니다.');
        return ok;
      });
    },
    [setlistId, withLoading]
  );

  const removeFromLineup = useCallback(
    async (
      submissionId: string,
      _currentLineup: FreeSongLineupItem[],
      _currentSubmissions?: FreeSongSubmission[]
    ) => {
      if (!setlistId) return false;
      return withLoading(async () => {
        return mutateSetlistFreeSong(setlistId, (state) => {
          const next = removeSubmissionFromState(state.submissions, state.lineup, submissionId);
          return {
            freeSongSubmissions: next.submissions,
            freeSongLineup: next.lineup,
          };
        });
      });
    },
    [setlistId, withLoading]
  );

  const selfWithdrawFromLineup = useCallback(
    async (submissionId: string, withdrawnBy: string) => {
      if (!setlistId) return false;
      return withLoading(async () => {
        const ok = await mutateSetlistFreeSong(setlistId, (state) => {
          const next = selfWithdrawFromState(
            state.submissions,
            state.lineup,
            state.selfWithdrawals,
            submissionId,
            withdrawnBy,
            Timestamp.now()
          );
          if (!next) return null;
          return {
            freeSongSubmissions: next.submissions,
            freeSongLineup: next.lineup,
            freeSongSelfWithdrawals: next.freeSongSelfWithdrawals,
          };
        });
        if (!ok) {
          alert('제거에 실패했습니다. 본인이 포함된 미완료 곡만 제거할 수 있습니다.');
        }
        return ok;
      });
    },
    [setlistId, withLoading]
  );

  const dismissWithdrawalNotice = useCallback(
    async (noticeId: string) => {
      if (!setlistId) return false;
      return withLoading(async () => {
        return mutateSetlistFreeSong(setlistId, (state) => {
          const index = state.selfWithdrawals.findIndex((n) => n.id === noticeId && !n.dismissedAt);
          if (index < 0) return null;
          const next = state.selfWithdrawals.map((n, i) =>
            i === index ? { ...n, dismissedAt: Timestamp.now() } : n
          );
          return { freeSongSelfWithdrawals: next };
        });
      });
    },
    [setlistId, withLoading]
  );

  const moveLineupItem = useCallback(
    async (submissionId: string, direction: 'up' | 'down', _currentLineup: FreeSongLineupItem[]) => {
      if (!setlistId) return false;
      return withLoading(async () => {
        const ok = await mutateSetlistFreeSong(setlistId, (state) => {
          const reordered = reorderPendingLineup(state.lineup, submissionId, direction);
          if (!reordered) return null;
          return { freeSongLineup: reordered };
        });
        return ok;
      });
    },
    [setlistId, withLoading]
  );

  const completeLineupItem = useCallback(
    async (
      submissionId: string,
      currentLineup: FreeSongLineupItem[],
      _completedBy: string,
      _currentSubmissions?: FreeSongSubmission[]
    ) => {
      if (!setlistId) return false;

      const items = normalizeLineup(currentLineup);
      const item = items.find((i) => i.submissionId === submissionId);
      if (!item) return false;
      if (item.completedAt) {
        alert('이미 완료 처리된 곡입니다.');
        return false;
      }

      const result = await withLoading(async () => {
        const setlistOk = await mutateSetlistFreeSong(setlistId, (state) => {
          const index = state.lineup.findIndex((i) => i.submissionId === submissionId);
          if (index < 0) return null;
          if (state.lineup[index].completedAt) return null;

          const nextItems = [...state.lineup];
          nextItems[index] = {
            ...nextItems[index],
            completedAt: Timestamp.now(),
            completedBy: _completedBy,
          };
          const nextSubmissions = state.submissions.filter((s) => s.id !== submissionId);

          return {
            freeSongLineup: nextItems,
            freeSongSubmissions: nextSubmissions,
          };
        });

        if (!setlistOk) return false;

        try {
          const globalPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
          (item.members ?? []).forEach((member) => {
            const nick = String(member).trim();
            if (nick) globalPatch[`performers.${nick}`] = increment(1);
          });
          await setDoc(doc(db, 'buskingStats', 'freeSong'), globalPatch, { merge: true });
        } catch (statsError) {
          console.error('자유곡 누적 통계 반영 실패:', statsError);
          alert('무대는 완료되었으나 누적 통계 반영에 실패했습니다. 관리자에게 알려주세요.');
        }

        return true;
      });

      if (result === false) {
        alert('완료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      return result;
    },
    [setlistId, withLoading]
  );

  const resetSessionStats = useCallback(
    async (currentLineup: FreeSongLineupItem[] | undefined) => {
      if (!setlistId) return false;
      if (
        !confirm(
          '이번 세션 통계를 초기화할까요?\n\n' +
            '· 완료된 곡 기록이 삭제됩니다\n' +
            '· 이번 세션 통계가 0으로 돌아갑니다\n' +
            '· 진행 대기 중인 곡은 유지됩니다\n' +
            '· 전체 누적 통계는 변경되지 않습니다'
        )
      ) {
        return false;
      }

      return withLoading(async () => {
        const pendingOnly = normalizeLineup(currentLineup).filter((item) => !item.completedAt);
        await updateDoc(doc(db, 'setlists', setlistId), {
          freeSongLineup: pendingOnly,
          freeSongMemberStats: deleteField(),
          updatedAt: serverTimestamp(),
        });
        return true;
      });
    },
    [setlistId, withLoading]
  );

  const removeSubmissionFromLineup = useCallback(
    async (submissionId: string, currentLineup: FreeSongLineupItem[] | undefined) => {
      if (!setlistId || !currentLineup?.some((item) => item.submissionId === submissionId)) {
        return true;
      }
      return removeFromLineup(submissionId, currentLineup);
    },
    [setlistId, removeFromLineup]
  );

  return {
    actionLoading,
    addToLineup,
    removeFromLineup,
    selfWithdrawFromLineup,
    dismissWithdrawalNotice,
    moveLineupItem,
    completeLineupItem,
    resetSessionStats,
    removeSubmissionFromLineup,
    normalizeLineup,
  };
}

export function useGlobalFreeSongStats() {
  const [globalStats, setGlobalStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'buskingStats', 'freeSong'),
      (snap) => {
        const data = snap.data() as FreeSongPerformerStats | undefined;
        setGlobalStats(data?.performers ?? {});
        setLoading(false);
      },
      (error) => {
        console.error('자유곡 전체 통계 로드 실패:', error);
        setGlobalStats({});
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { globalStats, loading };
}
