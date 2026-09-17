import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import {
  Check,
  Eye,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Shuffle,
  Users,
  X,
} from 'lucide-react';
import { canManageAnonymousNotes, ROLE_SYSTEM, SUPER_ADMIN_NICKNAMES } from './AdminTypes';
import NicknameSuggestInput, {
  findInvalidMemberNicknames,
  normalizeMemberNicknames,
} from './NicknameSuggestInput';
import {
  fetchAllMemberWorldCupVotesForQuestion,
  fetchMemberWorldCupQuestionStats,
  fetchMyMemberWorldCupVotes,
  fetchPastMemberWorldCupQuestionResults,
  fetchWorldCupMemberOptions,
  createCustomMemberWorldCupQuestion,
  fetchCustomMemberWorldCupQuestions,
  groupVotesBySelectedMember,
  MAX_WORLD_CUP_SELECTIONS,
  submitMemberWorldCupVote,
  syncMemberWorldCupQuestionStatsFromVotes,
  type MemberWorldCupQuestionStats,
  type MemberWorldCupVote,
  type WorldCupMemberOption,
} from '../utils/memberWorldCupService';
import {
  MEMBER_WORLD_CUP_DAILY_MEMBER_NOTICE,
  MEMBER_WORLD_CUP_DAILY_RESET_NOTICE,
  formatDayKeyLabel,
  formatQuestionScheduleLabel,
  getScheduledDayKeyForOrder,
  getUpcomingScheduledQuestions,
  resolveActiveMemberWorldCupQuestions,
  sortScheduledQuestions,
  type MemberWorldCupQuestionDefinition,
} from '../utils/memberWorldCupQuestions';
import {
  getCurrentDayKey,
  getNextDayResetAtKst,
  formatNextDayResetLabel,
} from '../utils/gameWeek';
import { auth } from '../firebase';
import { isTestNickname, TEST_NICKNAME_VOTE_BLOCKED_MESSAGE } from '../utils/testNickname';
import './MemberWorldCup.css';

const MWC_TOAST_STYLE = { zIndex: 10002 };

function showMwcToast(type: 'success' | 'error' | 'info', message: string) {
  const options = { style: MWC_TOAST_STYLE };
  if (type === 'success') toast.success(message, options);
  else if (type === 'error') toast.error(message, options);
  else toast.info(message, options);
}

interface MemberWorldCupBubbleProps {
  user: {
    uid?: string;
    nickname?: string;
    role?: string;
  } | null;
}

const RANDOM_PICK_COUNT = 4;

function pickRandomMembers(
  all: WorldCupMemberOption[],
  count: number,
  exclude: Set<string> = new Set()
): WorldCupMemberOption[] {
  let pool = all.filter((member) => !exclude.has(member.uid));
  if (pool.length < count) {
    pool = [...all];
  }
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function buildRandomMemberSet(
  all: WorldCupMemberOption[],
  previousUids: string[],
  ensureUids: string[] = []
): WorldCupMemberOption[] {
  const exclude = new Set(previousUids);
  let picked = pickRandomMembers(all, RANDOM_PICK_COUNT, exclude);

  if (picked.length < RANDOM_PICK_COUNT && all.length >= RANDOM_PICK_COUNT) {
    picked = pickRandomMembers(all, RANDOM_PICK_COUNT);
  }

  for (const ensureUid of ensureUids) {
    if (!ensureUid || picked.some((member) => member.uid === ensureUid)) continue;
    const ensured = all.find((member) => member.uid === ensureUid);
    if (ensured) {
      picked = [ensured, ...picked.filter((member) => member.uid !== ensureUid)].slice(
        0,
        RANDOM_PICK_COUNT
      );
    }
  }

  return picked;
}

function memberInitial(nickname: string): string {
  return nickname.trim().charAt(0) || '?';
}

function resultRankLabel(index: number): string {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return String(index + 1);
}

function memberNicknameFromUid(uid: string, memberByUid: Map<string, WorldCupMemberOption>): string {
  if (uid.startsWith('legacy:')) return uid.slice('legacy:'.length);
  return memberByUid.get(uid)?.nickname || '알 수 없음';
}

const MemberWorldCupBubble: React.FC<MemberWorldCupBubbleProps> = ({ user }) => {
  const canViewVoters = canManageAnonymousNotes(user);
  const canManageQuestions =
    user?.role === ROLE_SYSTEM.LEADER ||
    Boolean(user?.nickname && SUPER_ADMIN_NICKNAMES.includes(user.nickname));
  const canWriteCustomQuestions = Boolean(
    user?.nickname && SUPER_ADMIN_NICKNAMES.includes(user.nickname)
  );
  const isTestVoter = Boolean(user?.nickname && isTestNickname(user.nickname));

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<WorldCupMemberOption[]>([]);
  const [stats, setStats] = useState<MemberWorldCupQuestionStats[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, MemberWorldCupVote>>({});
  const [customNicknames, setCustomNicknames] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealVotes, setRevealVotes] = useState<MemberWorldCupVote[]>([]);
  const [revealLoading, setRevealLoading] = useState(false);
  const [randomMembers, setRandomMembers] = useState<WorldCupMemberOption[]>([]);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);
  const [customQuestions, setCustomQuestions] = useState<MemberWorldCupQuestionDefinition[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [showPastResultModal, setShowPastResultModal] = useState(false);
  const [pastResultLoading, setPastResultLoading] = useState(false);
  const [pastResultQuestion, setPastResultQuestion] = useState<{
    id: string;
    text: string;
    scheduleLabel: string;
    scheduleDayKey: string;
  } | null>(null);
  const [pastResultStats, setPastResultStats] = useState<MemberWorldCupQuestionStats | null>(null);
  const [pastResultVotes, setPastResultVotes] = useState<MemberWorldCupVote[]>([]);
  const [queueTab, setQueueTab] = useState<'today' | 'upcoming' | 'past'>('today');

  const currentDayKey = getCurrentDayKey();
  const activeQuestions = useMemo(
    () => resolveActiveMemberWorldCupQuestions(customQuestions),
    [customQuestions, currentDayKey]
  );
  const scheduledQueue = useMemo(
    () =>
      sortScheduledQuestions(customQuestions).map((question, index) => {
        const scheduleOrder = question.scheduleOrder ?? index + 1;
        return {
          ...question,
          scheduleOrder,
          scheduleLabel: formatQuestionScheduleLabel(scheduleOrder),
          scheduleDayKey: getScheduledDayKeyForOrder(scheduleOrder),
        };
      }),
    [customQuestions]
  );
  const upcomingQuestions = useMemo(
    () => getUpcomingScheduledQuestions(customQuestions),
    [customQuestions, currentDayKey]
  );
  const currentQuestion = activeQuestions[0];
  const queueGroups = useMemo(() => {
    const todayItem = currentQuestion
      ? scheduledQueue.find((question) => question.id === currentQuestion.id)
      : undefined;
    const upcomingItems = scheduledQueue.filter(
      (question) =>
        question.id !== todayItem?.id &&
        upcomingQuestions.some((upcoming) => upcoming.id === question.id)
    );
    const pastItems = scheduledQueue.filter(
      (question) =>
        question.id !== todayItem?.id &&
        !upcomingQuestions.some((upcoming) => upcoming.id === question.id)
    );
    return { todayItem, upcomingItems, pastItems };
  }, [scheduledQueue, currentQuestion, upcomingQuestions]);
  const revealQuestion = currentQuestion;
  const revealVotesByPick = useMemo(() => groupVotesBySelectedMember(revealVotes), [revealVotes]);
  const pastResultVotesByPick = useMemo(
    () => groupVotesBySelectedMember(pastResultVotes),
    [pastResultVotes]
  );
  const myVote = currentQuestion ? myVotes[currentQuestion.id] : undefined;
  const hasVotedCurrent = Boolean(myVote);

  const memberByUid = useMemo(() => {
    const map = new Map<string, WorldCupMemberOption>();
    members.forEach((member) => map.set(member.uid, member));
    return map;
  }, [members]);

  const pastFullResults = useMemo(() => {
    if (!pastResultStats) return [];
    return Object.entries(pastResultStats.counts)
      .map(([uid, count]) => ({
        uid,
        nickname: memberNicknameFromUid(uid, memberByUid),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [pastResultStats, memberByUid]);
  const pastMaxResultCount = pastFullResults[0]?.count ?? 1;
  const pastResultsPickDenominator =
    (pastResultStats?.totalPicks ?? 0) > 0 ? pastResultStats!.totalPicks : 1;

  const votableMembers = useMemo(
    () => (user?.uid ? members.filter((member) => member.uid !== user.uid) : members),
    [members, user?.uid]
  );
  const memberCandidates = useMemo(
    () => votableMembers.map((member) => ({ uid: member.uid, nickname: member.nickname })),
    [votableMembers]
  );
  const dayLabel = useMemo(() => formatDayKeyLabel(currentDayKey), [currentDayKey]);
  const nextResetLabel = useMemo(
    () => formatNextDayResetLabel(getNextDayResetAtKst()),
    []
  );

  const maxCustomFields = Math.max(0, MAX_WORLD_CUP_SELECTIONS - selectedUids.length);
  const filledCustomCount = useMemo(
    () => customNicknames.filter((nickname) => nickname.trim()).length,
    [customNicknames]
  );
  const totalSelectionCount = selectedUids.length + filledCustomCount;

  const customNicknameInvalid = useMemo(
    () =>
      customNicknames.some(
        (nickname) =>
          nickname.trim().length > 0 &&
          findInvalidMemberNicknames([nickname], memberCandidates).length > 0
      ),
    [customNicknames, memberCandidates]
  );

  const answeredCount = useMemo(
    () => activeQuestions.filter((q) => myVotes[q.id]).length,
    [activeQuestions, myVotes]
  );

  const questionStats = useMemo(
    () => stats.find((item) => item.id === currentQuestion?.id),
    [stats, currentQuestion?.id]
  );

  const fullResults = useMemo(() => {
    if (!questionStats) return [];
    return Object.entries(questionStats.counts)
      .map(([uid, count]) => ({
        uid,
        nickname: memberNicknameFromUid(uid, memberByUid),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [questionStats, memberByUid]);

  const totalPicksDisplay = questionStats?.totalPicks ?? 0;

  const bubblePreview = useMemo(() => {
    if (!currentQuestion) return '오늘 질문 준비 중…';
    const text = currentQuestion.text.replace(/^베리어스 내\s?/, '');
    return text.length > 28 ? `${text.slice(0, 28)}…` : text;
  }, [currentQuestion]);

  const loadData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [memberOptions, customQuestionResult] = await Promise.all([
        fetchWorldCupMemberOptions(),
        fetchCustomMemberWorldCupQuestions(),
      ]);
      setMembers(memberOptions);
      setCustomQuestions(customQuestionResult);

      const questions = resolveActiveMemberWorldCupQuestions(customQuestionResult);
      const [statsResult, votesResult] = await Promise.allSettled([
        fetchMemberWorldCupQuestionStats(),
        fetchMyMemberWorldCupVotes(user.uid),
      ]);

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else {
        console.error('질문 집계 로딩 실패:', statsResult.reason);
      }

      const myVoteMap =
        votesResult.status === 'fulfilled' ? votesResult.value : ({} as Record<string, MemberWorldCupVote>);
      if (votesResult.status === 'rejected') {
        console.error('내 투표 로딩 실패:', votesResult.reason);
      }

      setMyVotes(myVoteMap);
      setShowResultsPanel(Boolean(questions[0] && myVoteMap[questions[0].id]));

      const ensureUids =
        myVoteMap[questions[0]?.id]?.selectedMembers.map((m) => m.uid) ?? [];
      const votable = user.uid
        ? memberOptions.filter((member) => member.uid !== user.uid)
        : memberOptions;
      setRandomMembers(buildRandomMemberSet(votable, [], ensureUids));
    } catch (error) {
      console.error('멤버 월드컵 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, currentDayKey]);

  useEffect(() => {
    setShowResultsPanel(false);
  }, [currentDayKey]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadRevealVotes = useCallback(async (questionId: string) => {
    setRevealLoading(true);
    try {
      const [votes, syncedStats] = await Promise.all([
        fetchAllMemberWorldCupVotesForQuestion(questionId),
        syncMemberWorldCupQuestionStatsFromVotes(questionId),
      ]);
      setRevealVotes(votes);
      setStats((prev) => prev.map((item) => (item.id === questionId ? syncedStats : item)));
    } catch (error) {
      console.error('투표자 목록 로딩 실패:', error);
      toast.error('투표자 목록을 불러오지 못했습니다.');
    } finally {
      setRevealLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentQuestion) return;
    const existing = myVotes[currentQuestion.id];
    setCustomNicknames(['']);
    setSelectedUids(existing?.selectedMembers.map((member) => member.uid) ?? []);
    setShowResultsPanel(Boolean(existing));
  }, [currentQuestion?.id, myVotes]);

  useEffect(() => {
    if (!showRevealModal || !canViewVoters || !revealQuestion) return;
    void loadRevealVotes(revealQuestion.id);
  }, [showRevealModal, revealQuestion?.id, canViewVoters, loadRevealVotes]);

  useEffect(() => {
    if (votableMembers.length === 0) return;
    const ensureUids = myVote?.selectedMembers.map((member) => member.uid) ?? [];
    setRandomMembers(buildRandomMemberSet(votableMembers, [], ensureUids));
  }, [currentQuestion?.id, votableMembers, myVote?.selectedMembers]);

  useEffect(() => {
    if (maxCustomFields <= 0) return;
    setCustomNicknames((prev) => {
      if (prev.length === 0) return [''];
      if (prev.length <= maxCustomFields) return prev;
      return prev.slice(0, maxCustomFields);
    });
  }, [maxCustomFields]);

  const handleShuffleMembers = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const previousUids = randomMembers.map((member) => member.uid);
    setRandomMembers(buildRandomMemberSet(votableMembers, previousUids, selectedUids));
  };

  const toggleMemberSelection = (memberUid: string) => {
    if (submitting) return;
    if (user?.uid && memberUid === user.uid) {
      toast.info('본인에게는 투표할 수 없어요.');
      return;
    }
    setSelectedUids((prev) => {
      if (prev.includes(memberUid)) {
        return prev.filter((uid) => uid !== memberUid);
      }
      if (totalSelectionCount >= MAX_WORLD_CUP_SELECTIONS) {
        toast.info(`최대 ${MAX_WORLD_CUP_SELECTIONS}명까지 선택할 수 있어요.`);
        return prev;
      }
      return [...prev, memberUid];
    });
  };

  const showResultsAfterVote = async (questionId: string) => {
    try {
      const latestStats = await fetchMemberWorldCupQuestionStats();
      setStats(latestStats);
      setShowResultsPanel(true);
    } catch (error) {
      console.warn('결과 표시용 갱신 실패:', error);
      setShowResultsPanel(true);
    }
    try {
      await refreshAfterVote(questionId);
    } catch (refreshError) {
      console.warn('투표 후 갱신 실패:', refreshError);
    }
  };

  const handleSubmitVote = async () => {
    if (!user?.uid || !user?.nickname || !currentQuestion || submitting) return;

    if (isTestVoter) {
      toast.error(TEST_NICKNAME_VOTE_BLOCKED_MESSAGE);
      return;
    }

    if (hasVotedCurrent) {
      toast.info('이미 투표한 질문은 수정할 수 없습니다.');
      setShowResultsPanel(true);
      return;
    }

    let selectedMembers = selectedUids
      .map((uid) => memberByUid.get(uid))
      .filter((member): member is WorldCupMemberOption => Boolean(member))
      .map((member) => ({ uid: member.uid, nickname: member.nickname }));

    const customFilled = customNicknames.map((nickname) => nickname.trim()).filter(Boolean);
    if (customFilled.length > 0) {
      if (memberCandidates.length === 0) {
        toast.info('회원 목록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const invalidNicknames = findInvalidMemberNicknames(customFilled, memberCandidates);
      if (invalidNicknames.length > 0) {
        toast.error(
          `앱에 없는 닉네임이 있습니다.\n드롭다운에서 정확한 회원 닉네임을 선택해 주세요.\n\n잘못된 닉네임: ${invalidNicknames.join(', ')}`
        );
        return;
      }
      const normalized = normalizeMemberNicknames(customFilled, memberCandidates);
      for (const resolvedNickname of normalized) {
        const customMember = memberCandidates.find((member) => member.nickname === resolvedNickname);
        if (!customMember) continue;
        if (selectedMembers.some((member) => member.uid === customMember.uid)) continue;
        if (selectedMembers.length >= MAX_WORLD_CUP_SELECTIONS) {
          toast.info(`최대 ${MAX_WORLD_CUP_SELECTIONS}명까지 선택할 수 있어요.`);
          return;
        }
        selectedMembers = [
          ...selectedMembers,
          { uid: customMember.uid, nickname: customMember.nickname },
        ];
      }
    }

    if (selectedMembers.length === 0) {
      toast.info('멤버를 1명 이상 선택하거나 등록된 닉네임을 입력해 주세요.');
      return;
    }
    if (user.uid && selectedMembers.some((member) => member.uid === user.uid)) {
      toast.error('본인에게는 투표할 수 없습니다.');
      return;
    }

    setSubmitting(true);
    try {
      await submitMemberWorldCupVote({
        questionId: currentQuestion.id,
        voterUid: user.uid,
        voterNickname: user.nickname,
        selectedMembers,
        customText: '',
      });
      toast.success('익명으로 반영됐어요', { autoClose: 1200, hideProgressBar: true });
      await showResultsAfterVote(currentQuestion.id);
    } catch (error) {
      console.error('멤버 월드컵 투표 실패:', error);
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: string }).code)
          : '';
      if (code === 'permission-denied') {
        toast.error('투표 권한이 없습니다. 로그아웃 후 다시 로그인하거나 잠시 후 다시 시도해 주세요.');
      } else {
        toast.error(error instanceof Error ? error.message : '투표에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAfterVote = async (questionId: string) => {
    if (!user?.uid) return null;
    const [questionStatsNext, myVoteMap] = await Promise.all([
      fetchMemberWorldCupQuestionStats(),
      fetchMyMemberWorldCupVotes(user.uid),
    ]);
    setStats(questionStatsNext);
    setMyVotes(myVoteMap);

    if (canViewVoters && showRevealModal && revealQuestion?.id === questionId) {
      await loadRevealVotes(questionId);
    }
    return myVoteMap;
  };

  const openRevealModal = () => {
    if (!canViewVoters || !currentQuestion) return;
    setShowRevealModal(true);
  };

  const maxResultCount = fullResults[0]?.count ?? 1;
  const totalVotesDisplay = questionStats?.totalVotes ?? 0;
  const resultsPickDenominator = totalPicksDisplay > 0 ? totalPicksDisplay : 1;

  const closeRevealModal = () => {
    setShowRevealModal(false);
    setRevealVotes([]);
  };

  const openModal = async () => {
    if (!user?.uid) return;

    let memberList = members;
    if (memberList.length === 0) {
      try {
        memberList = await fetchWorldCupMemberOptions();
        setMembers(memberList);
      } catch (error) {
        console.error('멤버 목록 로딩 실패:', error);
        toast.error('멤버 목록을 불러오지 못했습니다.');
        return;
      }
    }

    const votable = user.uid
      ? memberList.filter((member) => member.uid !== user.uid)
      : memberList;
    const ensureUids = myVote?.selectedMembers.map((member) => member.uid) ?? [];
    setRandomMembers(buildRandomMemberSet(votable, [], ensureUids));
    setShowResultsPanel(Boolean(myVote));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setShowRevealModal(false);
    setRevealVotes([]);
    setShowResultsPanel(false);
  };

  const openQuestionPicker = () => {
    setNewQuestionText('');
    if (queueGroups.todayItem) {
      setQueueTab('today');
    } else if (queueGroups.upcomingItems.length > 0) {
      setQueueTab('upcoming');
    } else {
      setQueueTab('past');
    }
    setShowQuestionPicker(true);
  };

  const closeQuestionPicker = () => {
    if (creatingQuestion) return;
    setShowQuestionPicker(false);
  };

  const closePastResultModal = () => {
    setShowPastResultModal(false);
    setPastResultQuestion(null);
    setPastResultStats(null);
    setPastResultVotes([]);
  };

  const openPastQuestionResults = async (question: {
    id: string;
    text: string;
    scheduleLabel: string;
    scheduleDayKey: string;
  }) => {
    if (!canViewVoters) return;
    setPastResultQuestion(question);
    setShowPastResultModal(true);
    setPastResultLoading(true);
    setPastResultStats(null);
    setPastResultVotes([]);
    try {
      const { stats, votes } = await fetchPastMemberWorldCupQuestionResults(
        question.id,
        question.scheduleDayKey,
        question.text
      );
      setPastResultStats(stats);
      setPastResultVotes(votes);
    } catch (error) {
      console.error('종료 질문 결과 로딩 실패:', error);
      toast.error('투표 결과를 불러오지 못했습니다.');
      closePastResultModal();
    } finally {
      setPastResultLoading(false);
    }
  };

  const handleCreateCustomQuestion = async () => {
    const authUid = auth.currentUser?.uid;
    const nickname = user?.nickname?.trim();
    const trimmed = newQuestionText.trim();

    if (!authUid || !nickname) {
      showMwcToast('error', '로그인 정보를 확인할 수 없습니다.');
      return;
    }
    if (!trimmed) {
      showMwcToast('error', '질문 내용을 입력해 주세요.');
      return;
    }
    if (trimmed.length > 200) {
      showMwcToast('error', '질문은 200자 이내로 입력해 주세요.');
      return;
    }

    setCreatingQuestion(true);
    try {
      const created = await createCustomMemberWorldCupQuestion({
        text: trimmed,
        createdBy: authUid,
        createdByNickname: nickname,
      });
      const refreshed = await fetchCustomMemberWorldCupQuestions();
      setCustomQuestions(refreshed.length > 0 ? refreshed : [created]);
      setNewQuestionText('');
      const scheduleLabel = formatQuestionScheduleLabel(created.scheduleOrder ?? refreshed.length);
      showMwcToast(
        'success',
        `질문을 등록했습니다. ${scheduleLabel}에 멤버들에게 공개됩니다.`
      );
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : '질문 등록에 실패했습니다.';
      showMwcToast('error', message);
    } finally {
      setCreatingQuestion(false);
    }
  };

  if (!user?.uid) return null;

  const modalContent = showModal && (
    <div className="mwc-modal-overlay" onClick={closeModal} role="presentation">
      <div
        className="mwc-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mwc-modal-title"
      >
        <div className="mwc-modal__hero">
          <div className="mwc-modal__hero-top">
            <div className="mwc-modal__hero-text">
              <span className="mwc-modal__badge">
                <Lock size={11} aria-hidden />
                100% 익명
              </span>
              <h3 id="mwc-modal-title">심심할 때 한 표</h3>
              <p className="mwc-modal__hero-sub">누가 누구를 골랐는지는 절대 공개되지 않아요</p>
              <p className="mwc-modal__hero-note">{MEMBER_WORLD_CUP_DAILY_MEMBER_NOTICE}</p>
              <p className="mwc-modal__hero-note mwc-modal__hero-note--daily">
                {MEMBER_WORLD_CUP_DAILY_RESET_NOTICE}
              </p>
            </div>
            <button type="button" className="mwc-modal__close" onClick={closeModal} aria-label="닫기">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mwc-modal__body">
          {!currentQuestion ? (
            <div className="mwc-modal__empty-day">
              <p className="mwc-modal__empty-day-title">오늘 질문 준비 중</p>
              <p className="mwc-modal__empty-day-text">
                매일 하나씩 새 질문이 공개됩니다.
                <br />
                다음 질문은 {nextResetLabel}에 올라와요.
              </p>
            </div>
          ) : (
            <>
          <div className="mwc-modal__nav">
            <span className="mwc-modal__nav-label mwc-modal__nav-label--daily">
              오늘의 질문 · {dayLabel}
              {hasVotedCurrent && ' · 완료'}
            </span>
          </div>

          <div className="mwc-modal__question-card">
            <span className="mwc-modal__question-num">오늘</span>
            <p className="mwc-modal__question">{currentQuestion.text}</p>
            {hasVotedCurrent && showResultsPanel && (
              <span className="mwc-modal__status-pill">
                <Check size={11} aria-hidden />
                투표 완료
              </span>
            )}
          </div>

          {hasVotedCurrent || showResultsPanel ? (
            <div className="mwc-modal__results-panel">
              <div className="mwc-modal__results-summary">
                <div>
                  <strong>이번 질문 결과</strong>
                  <span>익명 집계 · 실시간 반영</span>
                </div>
                <span className="mwc-modal__results-badge">
                  <Users size={13} aria-hidden />
                  {totalVotesDisplay}명 참여
                  {totalPicksDisplay > totalVotesDisplay ? ` · ${totalPicksDisplay}표` : ''}
                </span>
              </div>

              {questionStats && questionStats.totalVotes > 0 ? (
                fullResults.length > 0 ? (
                  <ol className="mwc-modal__results-list">
                    {fullResults.map((item, index) => {
                      const voteRatio = Math.round((item.count / resultsPickDenominator) * 100);
                      const barWidth = Math.round((item.count / maxResultCount) * 100);
                      return (
                        <li
                          key={item.uid}
                          className={`mwc-modal__result-row${index < 3 ? ' is-top' : ''}`}
                        >
                          <div className="mwc-modal__result-row-head">
                            <span
                              className={`mwc-modal__results-rank${
                                index >= 3 ? ' is-num' : ''
                              }`}
                            >
                              {resultRankLabel(index)}
                            </span>
                            <span className="mwc-modal__results-name">{item.nickname}</span>
                            <span className="mwc-modal__results-count">
                              {item.count}표 · {voteRatio}%
                            </span>
                          </div>
                          <div className="mwc-modal__result-bar-wrap">
                            <div
                              className="mwc-modal__result-bar"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mwc-modal__results-note">
                    {questionStats.totalVotes}명 참여 · 멤버 선택 없이 제출된 응답만 있어요
                  </p>
                )
              ) : (
                <p className="mwc-modal__results-note">아직 집계할 투표가 없습니다</p>
              )}

              <p className="mwc-modal__week-notice">
                {MEMBER_WORLD_CUP_DAILY_RESET_NOTICE}
                <br />
                오늘 {dayLabel} · 다음 질문 {nextResetLabel}
              </p>
            </div>
          ) : (
            <>
              <div className="mwc-modal__section-head">
                <p className="mwc-modal__section-title">멤버 선택</p>
                <span
                  className={`mwc-modal__selection-chip${
                    totalSelectionCount >= MAX_WORLD_CUP_SELECTIONS ? ' is-full' : ''
                  }`}
                >
                  {totalSelectionCount}/{MAX_WORLD_CUP_SELECTIONS}명
                </span>
              </div>

              <div className="mwc-modal__pick-grid">
                {randomMembers.length === 0 ? (
                  <p className="mwc-modal__empty">멤버를 불러오는 중이거나 목록이 비어 있습니다</p>
                ) : (
                  randomMembers.map((member) => {
                    const isSelected = selectedUids.includes(member.uid);
                    return (
                      <button
                        key={member.uid}
                        type="button"
                        className={`mwc-modal__pick-card ${isSelected ? 'is-selected' : ''}`}
                        disabled={submitting}
                        onClick={() => toggleMemberSelection(member.uid)}
                      >
                        {isSelected && (
                          <span className="mwc-modal__pick-check">
                            <Check size={11} aria-hidden />
                          </span>
                        )}
                        <span className="mwc-modal__pick-initial">{memberInitial(member.nickname)}</span>
                        <span>{member.nickname}</span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mwc-modal__shuffle-row">
                <button
                  type="button"
                  className="mwc-modal__shuffle"
                  disabled={submitting || votableMembers.length <= RANDOM_PICK_COUNT}
                  onClick={handleShuffleMembers}
                  title="다른 멤버 4명 보기"
                >
                  <Shuffle size={13} aria-hidden />
                  다른 멤버 보기
                </button>
              </div>

              {maxCustomFields > 0 && (
                <>
                  <div className="mwc-modal__divider">또는 닉네임 직접 입력</div>
                  <div className="mwc-modal__custom">
                    {customNicknames.map((nickname, idx) => (
                      <div key={idx} className="mwc-modal__custom-row">
                        <NicknameSuggestInput
                          value={nickname}
                          onChange={(next) =>
                            setCustomNicknames((prev) =>
                              prev.map((item, itemIdx) => (itemIdx === idx ? next : item))
                            )
                          }
                          candidates={memberCandidates}
                          excludeNicknames={[
                            ...(user?.nickname ? [user.nickname] : []),
                            ...selectedUids
                              .map((uid) => memberByUid.get(uid)?.nickname)
                              .filter((name): name is string => Boolean(name)),
                            ...customNicknames.filter((_, itemIdx) => itemIdx !== idx),
                          ]}
                          placeholder={`멤버 닉네임 ${idx + 1}`}
                          disabled={submitting}
                          className="mwc-modal__nickname-input"
                        />
                        {customNicknames.length > 1 && (
                          <button
                            type="button"
                            className="mwc-modal__custom-btn mwc-modal__custom-btn--remove"
                            disabled={submitting}
                            onClick={() =>
                              setCustomNicknames((prev) => {
                                const next = prev.filter((_, itemIdx) => itemIdx !== idx);
                                return next.length > 0 ? next : [''];
                              })
                            }
                          >
                            삭제
                          </button>
                        )}
                        {idx === customNicknames.length - 1 &&
                          customNicknames.length < maxCustomFields && (
                            <button
                              type="button"
                              className="mwc-modal__custom-btn mwc-modal__custom-btn--add"
                              disabled={submitting}
                              onClick={() => setCustomNicknames((prev) => [...prev, ''])}
                            >
                              추가
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="mwc-modal__submit-bar">
                {isTestVoter ? (
                  <p className="mwc-modal__test-blocked" role="status">
                    {TEST_NICKNAME_VOTE_BLOCKED_MESSAGE}
                  </p>
                ) : (
                  <>
                <button
                  type="button"
                  className="mwc-modal__submit-vote"
                  disabled={
                    submitting ||
                    customNicknameInvalid ||
                    (selectedUids.length === 0 && filledCustomCount === 0)
                  }
                  onClick={() => void handleSubmitVote()}
                >
                  {submitting ? '제출 중…' : '🔒 익명 제출하기'}
                </button>
                <span className="mwc-modal__result-hint">
                  1~{MAX_WORLD_CUP_SELECTIONS}명 선택 · 제출 후 오늘은 수정 불가
                </span>
                  </>
                )}
              </div>
            </>
          )}
            </>
          )}
        </div>

        <div className="mwc-modal__foot">
          <span className="mwc-modal__foot-progress">
            오늘 {hasVotedCurrent ? '투표 완료' : '투표 전'}
          </span>
          <div className="mwc-modal__foot-actions">
            {canManageQuestions && (
              <button type="button" className="mwc-modal__manage" onClick={openQuestionPicker}>
                <ListChecks size={14} aria-hidden />
                질문 설정
              </button>
            )}
            {canViewVoters && currentQuestion && (
              <button type="button" className="mwc-modal__reveal" onClick={openRevealModal}>
                <Eye size={14} />
                너래 보기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const revealModalContent = showRevealModal && revealQuestion && (
    <div className="mwc-reveal-overlay" onClick={closeRevealModal} role="presentation">
      <div
        className="mwc-reveal-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mwc-reveal-title"
      >
        <div className="mwc-reveal-modal__head">
          <div className="mwc-reveal-modal__head-text">
            <span className="mwc-modal__reveal-label">너래 전용</span>
            <h3 id="mwc-reveal-title" className="mwc-reveal-modal__title">
              멤버별 투표자
            </h3>
            <p className="mwc-reveal-modal__sub">선택받은 멤버 기준으로 누가 골랐는지 확인할 수 있어요</p>
          </div>
          <button
            type="button"
            className="mwc-reveal-modal__close"
            onClick={closeRevealModal}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mwc-reveal-modal__question-bar">
          <div className="mwc-reveal-modal__question-text">
            <span className="mwc-modal__question-num">오늘 · {dayLabel}</span>
            <p>{revealQuestion.text}</p>
          </div>
        </div>

        <div className="mwc-reveal-modal__toolbar">
          <span className="mwc-modal__reveal-count">
            {revealVotes.length}명 참여 · {revealVotesByPick.reduce((sum, group) => sum + group.pickCount, 0)}표
          </span>
          <button
            type="button"
            className="mwc-modal__reveal-refresh"
            disabled={revealLoading}
            onClick={() => void loadRevealVotes(revealQuestion.id)}
          >
            <RefreshCw size={14} className={revealLoading ? 'is-spinning' : undefined} />
            새로고침
          </button>
        </div>

        <div className="mwc-reveal-modal__body">
          {revealLoading ? (
            <p className="mwc-modal__reveal-empty">불러오는 중…</p>
          ) : revealVotes.length === 0 ? (
            <p className="mwc-modal__reveal-empty">오늘 아직 투표가 없어요</p>
          ) : revealVotesByPick.length === 0 ? (
            <p className="mwc-modal__reveal-empty">멤버 선택 없이 제출된 투표만 있어요</p>
          ) : (
            <ul className="mwc-reveal-groups">
              {revealVotesByPick.map((group, index) => (
                <li key={group.key} className="mwc-reveal-group">
                  <div className="mwc-reveal-group__head">
                    <span className="mwc-reveal-group__rank">{index + 1}</span>
                    <strong className="mwc-reveal-group__name">{group.nickname}</strong>
                    <span className="mwc-reveal-group__count">{group.pickCount}표</span>
                  </div>
                  <div className="mwc-reveal-group__voters">
                    {group.voters.map((voter) => (
                      <span key={`${group.key}-${voter}`} className="mwc-modal__reveal-chip mwc-modal__reveal-chip--voter">
                        {voter}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const questionPickerContent = showQuestionPicker && (
    <div className="mwc-modal-overlay mwc-modal-overlay--picker" onClick={closeQuestionPicker} role="presentation">
      <div
        className="mwc-modal mwc-modal--picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mwc-picker-title"
      >
        <div className="mwc-modal__hero">
          <div className="mwc-modal__hero-top">
            <div className="mwc-modal__hero-text">
              <div className="mwc-picker__title-row">
                <h3 id="mwc-picker-title">질문 설정 · 매일 1개씩</h3>
                <span className="mwc-picker__count-badge" aria-live="polite">
                  예약 {scheduledQueue.length}개
                </span>
              </div>
              <p className="mwc-modal__hero-sub">
                입력한 순서대로 매일 00시(KST)에 질문 1개가 멤버들에게 공개됩니다.
                {canWriteCustomQuestions && ' 아래에서 질문을 추가해 주세요.'}
              </p>
            </div>
            <button
              type="button"
              className="mwc-modal__close"
              onClick={closeQuestionPicker}
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mwc-modal__body">
          {canWriteCustomQuestions && (
            <div className="mwc-picker__compose">
              <div className="mwc-picker__compose-head">
                <Pencil size={15} aria-hidden />
                <strong>질문 작성</strong>
              </div>
              <textarea
                className="mwc-picker__compose-input"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                placeholder="예: 버스킹에서 제일 눈에 띄는 사람은?"
                maxLength={200}
                rows={3}
                disabled={creatingQuestion}
              />
              <div className="mwc-picker__compose-actions">
                <span className="mwc-picker__compose-count">{newQuestionText.trim().length}/200</span>
                <button
                  type="button"
                  className="mwc-picker__compose-submit"
                  disabled={creatingQuestion || !newQuestionText.trim()}
                  onClick={() => void handleCreateCustomQuestion()}
                >
                  <Plus size={14} aria-hidden />
                  {creatingQuestion ? '등록 중…' : '질문 올리기'}
                </button>
              </div>
            </div>
          )}

          <div className="mwc-picker__queue-head">
            <strong>예약 큐</strong>
            <span>총 {scheduledQueue.length}개</span>
          </div>

          {scheduledQueue.length === 0 ? (
            <p className="mwc-picker__queue-empty">아직 등록된 질문이 없습니다. 질문을 작성해 주세요.</p>
          ) : (
            <>
              <div className="mwc-picker__queue-tabs" role="tablist" aria-label="예약 큐 구분">
                {queueGroups.todayItem && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={queueTab === 'today'}
                    className={`mwc-picker__queue-tab${queueTab === 'today' ? ' is-active' : ''}`}
                    onClick={() => setQueueTab('today')}
                  >
                    오늘
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={queueTab === 'upcoming'}
                  className={`mwc-picker__queue-tab${queueTab === 'upcoming' ? ' is-active' : ''}`}
                  onClick={() => setQueueTab('upcoming')}
                >
                  예정 {queueGroups.upcomingItems.length}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={queueTab === 'past'}
                  className={`mwc-picker__queue-tab${queueTab === 'past' ? ' is-active' : ''}`}
                  onClick={() => setQueueTab('past')}
                >
                  종료 {queueGroups.pastItems.length}
                </button>
              </div>

              {queueTab === 'past' && canViewVoters && (
                <p className="mwc-picker__queue-hint">종료 질문을 클릭하면 투표 결과를 볼 수 있어요.</p>
              )}

              <div className="mwc-picker__list mwc-picker__list--queue">
                {queueTab === 'today' && queueGroups.todayItem && (
                  <div className="mwc-picker__queue-item is-today">
                    <span className="mwc-picker__queue-order">{queueGroups.todayItem.scheduleOrder}</span>
                    <div className="mwc-picker__queue-body">
                      <span className="mwc-picker__queue-label">
                        {queueGroups.todayItem.scheduleLabel} ·{' '}
                        {formatDayKeyLabel(queueGroups.todayItem.scheduleDayKey)}
                      </span>
                      <p className="mwc-picker__queue-text">{queueGroups.todayItem.text}</p>
                    </div>
                    <span className="mwc-picker__queue-badge">오늘 노출</span>
                  </div>
                )}

                {queueTab === 'today' && !queueGroups.todayItem && (
                  <p className="mwc-picker__queue-empty">오늘 노출할 질문이 없습니다.</p>
                )}

                {queueTab === 'upcoming' &&
                  (queueGroups.upcomingItems.length === 0 ? (
                    <p className="mwc-picker__queue-empty">예정된 질문이 없습니다.</p>
                  ) : (
                    queueGroups.upcomingItems.map((question) => (
                      <div key={question.id} className="mwc-picker__queue-item is-upcoming">
                        <span className="mwc-picker__queue-order">{question.scheduleOrder}</span>
                        <div className="mwc-picker__queue-body">
                          <span className="mwc-picker__queue-label">
                            {question.scheduleLabel} · {formatDayKeyLabel(question.scheduleDayKey)}
                          </span>
                          <p className="mwc-picker__queue-text" title={question.text}>
                            {question.text}
                          </p>
                        </div>
                      </div>
                    ))
                  ))}

                {queueTab === 'past' &&
                  (queueGroups.pastItems.length === 0 ? (
                    <p className="mwc-picker__queue-empty">종료된 질문이 없습니다.</p>
                  ) : (
                    queueGroups.pastItems.map((question) => {
                      const canOpenPastResult = canViewVoters;
                      const queueItemClassName = `mwc-picker__queue-item is-past is-compact${
                        canOpenPastResult ? ' is-clickable' : ''
                      }`;
                      const queueContent = (
                        <>
                          <div className="mwc-picker__queue-meta">
                            <span className="mwc-picker__queue-order">{question.scheduleOrder}</span>
                            <span className="mwc-picker__queue-date">
                              {formatDayKeyLabel(question.scheduleDayKey)}
                            </span>
                          </div>
                          <p className="mwc-picker__queue-text mwc-picker__queue-text--compact" title={question.text}>
                            {question.text}
                          </p>
                          {canOpenPastResult && (
                            <span className="mwc-picker__queue-badge mwc-picker__queue-badge--past">
                              <Eye size={11} aria-hidden />
                              결과
                            </span>
                          )}
                        </>
                      );

                      if (canOpenPastResult) {
                        return (
                          <button
                            key={question.id}
                            type="button"
                            className={queueItemClassName}
                            onClick={() => void openPastQuestionResults(question)}
                          >
                            {queueContent}
                          </button>
                        );
                      }

                      return (
                        <div key={question.id} className={queueItemClassName}>
                          {queueContent}
                        </div>
                      );
                    })
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const pastResultModalContent = showPastResultModal && pastResultQuestion && (
    <div className="mwc-reveal-overlay" onClick={closePastResultModal} role="presentation">
      <div
        className="mwc-reveal-modal mwc-reveal-modal--past"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mwc-past-result-title"
      >
        <div className="mwc-reveal-modal__head">
          <div className="mwc-reveal-modal__head-text">
            <span className="mwc-modal__reveal-label">너래 전용</span>
            <h3 id="mwc-past-result-title" className="mwc-reveal-modal__title">
              종료 질문 결과
            </h3>
            <p className="mwc-reveal-modal__sub">
              {pastResultQuestion.scheduleLabel} ·{' '}
              {formatDayKeyLabel(pastResultQuestion.scheduleDayKey)}
            </p>
          </div>
          <button
            type="button"
            className="mwc-reveal-modal__close"
            onClick={closePastResultModal}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mwc-reveal-modal__question-bar">
          <div className="mwc-reveal-modal__question-text">
            <p>{pastResultQuestion.text}</p>
          </div>
        </div>

        <div className="mwc-reveal-modal__toolbar">
          <span className="mwc-modal__reveal-count">
            {pastResultLoading
              ? '불러오는 중…'
              : `${pastResultStats?.totalVotes ?? 0}명 참여 · ${pastResultStats?.totalPicks ?? 0}표`}
          </span>
        </div>

        <div className="mwc-reveal-modal__body mwc-reveal-modal__body--past">
          {pastResultLoading ? (
            <p className="mwc-modal__reveal-empty">불러오는 중…</p>
          ) : !pastResultStats || pastResultStats.totalVotes === 0 ? (
            <p className="mwc-modal__reveal-empty">이 날 투표가 없었어요</p>
          ) : (
            <>
              <div className="mwc-past-result__section">
                <strong className="mwc-past-result__section-title">집계 결과</strong>
                {pastFullResults.length > 0 ? (
                  <ol className="mwc-modal__results-list">
                    {pastFullResults.map((item, index) => {
                      const voteRatio = Math.round((item.count / pastResultsPickDenominator) * 100);
                      const barWidth = Math.round((item.count / pastMaxResultCount) * 100);
                      return (
                        <li
                          key={item.uid}
                          className={`mwc-modal__result-row${index < 3 ? ' is-top' : ''}`}
                        >
                          <div className="mwc-modal__result-row-head">
                            <span
                              className={`mwc-modal__results-rank${
                                index >= 3 ? ' is-num' : ''
                              }`}
                            >
                              {resultRankLabel(index)}
                            </span>
                            <span className="mwc-modal__results-name">{item.nickname}</span>
                            <span className="mwc-modal__results-count">
                              {item.count}표 · {voteRatio}%
                            </span>
                          </div>
                          <div className="mwc-modal__result-bar-wrap">
                            <div
                              className="mwc-modal__result-bar"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mwc-modal__results-note">멤버 선택 없이 제출된 응답만 있어요</p>
                )}
              </div>

              <div className="mwc-past-result__section">
                <strong className="mwc-past-result__section-title">멤버별 투표자</strong>
                {pastResultVotesByPick.length === 0 ? (
                  <p className="mwc-modal__reveal-empty">멤버 선택 없이 제출된 투표만 있어요</p>
                ) : (
                  <ul className="mwc-reveal-groups">
                    {pastResultVotesByPick.map((group, index) => (
                      <li key={group.key} className="mwc-reveal-group">
                        <div className="mwc-reveal-group__head">
                          <span className="mwc-reveal-group__rank">{index + 1}</span>
                          <strong className="mwc-reveal-group__name">{group.nickname}</strong>
                          <span className="mwc-reveal-group__count">{group.pickCount}표</span>
                        </div>
                        <div className="mwc-reveal-group__voters">
                          {group.voters.map((voter) => (
                            <span
                              key={`${group.key}-${voter}`}
                              className="mwc-modal__reveal-chip mwc-modal__reveal-chip--voter"
                            >
                              {voter}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        className="mwc-bubble"
        onClick={() => void openModal()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void openModal();
          }
        }}
        title="심심할 때 한 표 (익명)"
      >
        <div className="mwc-bubble__content">
          {loading ? (
            <span className="mwc-bubble__loading">…</span>
          ) : (
            <>
              <span className="mwc-bubble__label mwc-bubble__label--anon">
                🔒 100% 익명 · 매일 1문항
                {answeredCount > 0 && ' · 완료'}
              </span>
              <span className="mwc-bubble__text">{bubblePreview}</span>
              <span className="mwc-bubble__hint">매일 질문 1개 · 클릭!</span>
            </>
          )}
        </div>
        <div className="mwc-bubble__tail" aria-hidden />
      </div>

      {typeof document !== 'undefined' && showModal && createPortal(modalContent, document.body)}
      {typeof document !== 'undefined' &&
        showQuestionPicker &&
        createPortal(questionPickerContent, document.body)}
      {typeof document !== 'undefined' &&
        showRevealModal &&
        createPortal(revealModalContent, document.body)}
      {typeof document !== 'undefined' &&
        showPastResultModal &&
        createPortal(pastResultModalContent, document.body)}
    </>
  );
};

export default MemberWorldCupBubble;
