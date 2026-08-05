import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Eye,
  Lock,
  RefreshCw,
  Shuffle,
  Users,
  X,
} from 'lucide-react';
import { canManageAnonymousNotes } from './AdminTypes';
import NicknameSuggestInput, {
  findInvalidMemberNicknames,
  normalizeMemberNicknames,
} from './NicknameSuggestInput';
import {
  fetchAllMemberWorldCupVotesForQuestion,
  fetchMemberWorldCupQuestionStats,
  fetchMyMemberWorldCupVotes,
  fetchWorldCupMemberOptions,
  groupVotesBySelectedMember,
  MAX_WORLD_CUP_SELECTIONS,
  submitMemberWorldCupVote,
  syncMemberWorldCupQuestionStatsFromVotes,
  type MemberWorldCupQuestionStats,
  type MemberWorldCupVote,
  type WorldCupMemberOption,
} from '../utils/memberWorldCupService';
import {
  MEMBER_WORLD_CUP_QUESTIONS,
  MEMBER_WORLD_CUP_WEEKLY_RESET_NOTICE,
} from '../utils/memberWorldCupQuestions';
import {
  formatNextResetLabel,
  formatWeekRangeLabel,
  getCurrentWeekMondayKey,
  getNextMondayResetAtKst,
} from '../utils/gameWeek';
import './MemberWorldCup.css';

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

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<WorldCupMemberOption[]>([]);
  const [stats, setStats] = useState<MemberWorldCupQuestionStats[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, MemberWorldCupVote>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [customNicknames, setCustomNicknames] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealQuestionIndex, setRevealQuestionIndex] = useState(0);
  const [revealVotes, setRevealVotes] = useState<MemberWorldCupVote[]>([]);
  const [revealLoading, setRevealLoading] = useState(false);
  const [randomMembers, setRandomMembers] = useState<WorldCupMemberOption[]>([]);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);

  const currentQuestion = MEMBER_WORLD_CUP_QUESTIONS[questionIndex];
  const revealQuestion = MEMBER_WORLD_CUP_QUESTIONS[revealQuestionIndex];
  const revealVotesByPick = useMemo(() => groupVotesBySelectedMember(revealVotes), [revealVotes]);
  const myVote = currentQuestion ? myVotes[currentQuestion.id] : undefined;
  const hasVotedCurrent = Boolean(myVote);

  const memberByUid = useMemo(() => {
    const map = new Map<string, WorldCupMemberOption>();
    members.forEach((member) => map.set(member.uid, member));
    return map;
  }, [members]);

  const memberCandidates = useMemo(
    () => members.map((member) => ({ uid: member.uid, nickname: member.nickname })),
    [members]
  );

  const currentWeekKey = useMemo(() => getCurrentWeekMondayKey(), []);
  const weekRangeLabel = useMemo(() => formatWeekRangeLabel(currentWeekKey), [currentWeekKey]);
  const nextResetLabel = useMemo(
    () => formatNextResetLabel(getNextMondayResetAtKst()),
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
    () => MEMBER_WORLD_CUP_QUESTIONS.filter((q) => myVotes[q.id]).length,
    [myVotes]
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
    if (!currentQuestion) return '한 표 던져줘 🎯';
    const text = currentQuestion.text.replace(/^베리어스 내\s?/, '');
    return text.length > 28 ? `${text.slice(0, 28)}…` : text;
  }, [currentQuestion]);

  const loadData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const memberOptions = await fetchWorldCupMemberOptions();
      setMembers(memberOptions);

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
      const firstUnanswered = MEMBER_WORLD_CUP_QUESTIONS.findIndex((q) => !myVoteMap[q.id]);
      const firstIdx = firstUnanswered >= 0 ? firstUnanswered : 0;
      setQuestionIndex(firstIdx);

      const ensureUids =
        myVoteMap[MEMBER_WORLD_CUP_QUESTIONS[firstIdx]?.id]?.selectedMembers.map((m) => m.uid) ??
        [];
      setRandomMembers(buildRandomMemberSet(memberOptions, [], ensureUids));
    } catch (error) {
      console.error('멤버 월드컵 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

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
  }, [showRevealModal, revealQuestionIndex, revealQuestion?.id, canViewVoters, loadRevealVotes]);

  useEffect(() => {
    if (members.length === 0) return;
    const ensureUids = myVote?.selectedMembers.map((member) => member.uid) ?? [];
    setRandomMembers(buildRandomMemberSet(members, [], ensureUids));
  }, [currentQuestion?.id, members, myVote?.selectedMembers]);

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
    setRandomMembers(buildRandomMemberSet(members, previousUids, selectedUids));
  };

  const toggleMemberSelection = (memberUid: string) => {
    if (submitting) return;
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

  const goPrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setQuestionIndex((idx) => (idx <= 0 ? MEMBER_WORLD_CUP_QUESTIONS.length - 1 : idx - 1));
  };

  const goNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setQuestionIndex((idx) => (idx >= MEMBER_WORLD_CUP_QUESTIONS.length - 1 ? 0 : idx + 1));
  };

  const handleGoNextQuestion = () => {
    setQuestionIndex((idx) => (idx >= MEMBER_WORLD_CUP_QUESTIONS.length - 1 ? 0 : idx + 1));
  };

  const maxResultCount = fullResults[0]?.count ?? 1;
  const totalVotesDisplay = questionStats?.totalVotes ?? 0;
  const resultsPickDenominator = totalPicksDisplay > 0 ? totalPicksDisplay : 1;

  const openRevealModal = () => {
    if (!canViewVoters) return;
    setRevealQuestionIndex(questionIndex);
    setShowRevealModal(true);
  };

  const closeRevealModal = () => {
    setShowRevealModal(false);
    setRevealVotes([]);
  };

  const goRevealPrev = () => {
    setRevealQuestionIndex((idx) =>
      idx <= 0 ? MEMBER_WORLD_CUP_QUESTIONS.length - 1 : idx - 1
    );
  };

  const goRevealNext = () => {
    setRevealQuestionIndex((idx) =>
      idx >= MEMBER_WORLD_CUP_QUESTIONS.length - 1 ? 0 : idx + 1
    );
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

    const ensureUids = myVote?.selectedMembers.map((member) => member.uid) ?? [];
    setRandomMembers(buildRandomMemberSet(memberList, [], ensureUids));
    setShowResultsPanel(Boolean(myVote));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setShowRevealModal(false);
    setRevealVotes([]);
    setShowResultsPanel(false);
  };

  if (!user?.uid) return null;

  const modalContent = showModal && currentQuestion && (
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
            </div>
            <button type="button" className="mwc-modal__close" onClick={closeModal} aria-label="닫기">
              <X size={18} />
            </button>
          </div>
          <div className="mwc-modal__progress" aria-hidden>
            {MEMBER_WORLD_CUP_QUESTIONS.map((question, idx) => (
              <span
                key={question.id}
                className={`mwc-modal__progress-dot${
                  idx === questionIndex ? ' is-active' : myVotes[question.id] ? ' is-done' : ''
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mwc-modal__body">
          <div className="mwc-modal__nav">
            <button type="button" className="mwc-modal__nav-btn" onClick={goPrev} aria-label="이전 질문">
              <ChevronLeft size={18} />
            </button>
            <span className="mwc-modal__nav-label">
              <span>{questionIndex + 1}</span> / {MEMBER_WORLD_CUP_QUESTIONS.length}
              {hasVotedCurrent && ' · 완료'}
            </span>
            <button type="button" className="mwc-modal__nav-btn" onClick={goNext} aria-label="다음 질문">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mwc-modal__question-card">
            <span className="mwc-modal__question-num">Q{questionIndex + 1}</span>
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
                {MEMBER_WORLD_CUP_WEEKLY_RESET_NOTICE}
                <br />
                이번 주 {weekRangeLabel} · 다음 초기화 {nextResetLabel}
                <br />
                한 번 투표하면 이번 주에는 수정할 수 없어요
              </p>

              <div className="mwc-modal__results-actions">
                <button type="button" className="mwc-modal__next-btn" onClick={handleGoNextQuestion}>
                  다음 질문으로
                  <ChevronRight size={16} />
                </button>
              </div>
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
                  disabled={submitting || members.length <= RANDOM_PICK_COUNT}
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
                  1~{MAX_WORLD_CUP_SELECTIONS}명 선택 · 제출 후 이번 주 수정 불가
                </span>
              </div>
            </>
          )}
        </div>

        <div className="mwc-modal__foot">
          <span className="mwc-modal__foot-progress">
            이번 주 진행 <strong>{answeredCount}</strong>/{MEMBER_WORLD_CUP_QUESTIONS.length}
          </span>
          {canViewVoters && (
            <button type="button" className="mwc-modal__reveal" onClick={openRevealModal}>
              <Eye size={14} />
              너래 보기
            </button>
          )}
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

        <div className="mwc-reveal-modal__tabs">
          {MEMBER_WORLD_CUP_QUESTIONS.map((question, idx) => (
            <button
              key={question.id}
              type="button"
              className={`mwc-reveal-modal__tab${
                idx === revealQuestionIndex ? ' is-active' : ''
              }`}
              onClick={() => setRevealQuestionIndex(idx)}
            >
              Q{idx + 1}
            </button>
          ))}
        </div>

        <div className="mwc-reveal-modal__question-bar">
          <button type="button" className="mwc-modal__nav-btn" onClick={goRevealPrev} aria-label="이전 질문">
            <ChevronLeft size={18} />
          </button>
          <div className="mwc-reveal-modal__question-text">
            <span className="mwc-modal__question-num">Q{revealQuestionIndex + 1}</span>
            <p>{revealQuestion.text}</p>
          </div>
          <button type="button" className="mwc-modal__nav-btn" onClick={goRevealNext} aria-label="다음 질문">
            <ChevronRight size={18} />
          </button>
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
            <p className="mwc-modal__reveal-empty">이번 주 아직 투표가 없어요</p>
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
                🔒 100% 익명 투표
                {answeredCount > 0 && ` · ${answeredCount}/${MEMBER_WORLD_CUP_QUESTIONS.length}`}
              </span>
              <span className="mwc-bubble__text">{bubblePreview}</span>
              <span className="mwc-bubble__hint">&lt;말풍선을 클릭하세요&gt;</span>
            </>
          )}
        </div>
        <div className="mwc-bubble__tail" aria-hidden />
      </div>

      {typeof document !== 'undefined' && showModal && createPortal(modalContent, document.body)}
      {typeof document !== 'undefined' &&
        showRevealModal &&
        createPortal(revealModalContent, document.body)}
    </>
  );
};

export default MemberWorldCupBubble;
