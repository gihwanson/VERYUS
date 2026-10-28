import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  addDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { auth } from '../firebase';
import { getCurrentDayKey } from './gameWeek';
import { isTestNickname, TEST_NICKNAME_VOTE_BLOCKED_MESSAGE } from './testNickname';
import {
  MEMBER_WORLD_CUP_COLLECTION,
  MEMBER_WORLD_CUP_VOTES_COLLECTION,
  MEMBER_WORLD_CUP_PROPOSED_QUESTION_PREFIX,
  resolveActiveMemberWorldCupQuestions,
  sortScheduledQuestions,
  getMemberWorldCupDayIndex,
  getScheduledDayKeyForOrder,
  formatQuestionScheduleLabel,
  type MemberWorldCupQuestion,
  type MemberWorldCupQuestionDefinition,
} from './memberWorldCupQuestions';

export const MEMBER_WORLD_CUP_CUSTOM_QUESTIONS_COLLECTION = 'memberWorldCupCustomQuestions';
export const MEMBER_WORLD_CUP_PROPOSALS_COLLECTION = 'memberWorldCupQuestionProposals';

export const MAX_WORLD_CUP_SELECTIONS = 10;

export interface WorldCupMemberOption {
  uid: string;
  nickname: string;
  profileImageUrl?: string;
}

export interface MemberWorldCupSelection {
  uid: string;
  nickname: string;
}

export interface MemberWorldCupVote {
  id: string;
  questionId: string;
  voterUid: string;
  voterNickname: string;
  selectedMembers: MemberWorldCupSelection[];
  customText: string | null;
  submittedAt: unknown;
  dayKey: string | null;
  /** @deprecated 일일 전환 이전 문서 호환 */
  weekKey?: string | null;
  /** @deprecated 단일 선택 구버전 호환 */
  selectedMemberUid?: string | null;
  selectedMemberNickname?: string | null;
}

export interface MemberWorldCupQuestionStats {
  id: string;
  text: string;
  order: number;
  counts: Record<string, number>;
  /** 오늘 참여자 수 (1인 1표) */
  totalVotes: number;
  /** 오늘 선택 합계 (복수 선택 포함) */
  totalPicks: number;
  dayKey: string | null;
}

export interface SubmitMemberWorldCupVoteInput {
  questionId: string;
  voterUid: string;
  voterNickname: string;
  selectedMembers: MemberWorldCupSelection[];
  customText: string;
}

function getFirestoreErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes('permission-denied') || error.message.includes('Missing or insufficient permissions')) {
      return '저장 권한이 없습니다. 리더 계정인지 확인하고, Firestore 규칙 배포가 필요할 수 있어요.';
    }
    return error.message;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: string }).code);
    if (code === 'permission-denied') {
      return '저장 권한이 없습니다. 리더 계정인지 확인하고, Firestore 규칙 배포가 필요할 수 있어요.';
    }
  }
  return '저장에 실패했습니다.';
}

function parseScheduleOrder(data: DocumentData, fallback: number): number {
  const raw = data.scheduleOrder;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return fallback;
}

export async function fetchCustomMemberWorldCupQuestions(): Promise<MemberWorldCupQuestionDefinition[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, MEMBER_WORLD_CUP_CUSTOM_QUESTIONS_COLLECTION),
        where('isActive', '==', true)
      )
    );

    type RawCustomQuestion = MemberWorldCupQuestionDefinition & { createdAtMs: number };

    const items: RawCustomQuestion[] = [];
    snap.docs.forEach((docSnap, index) => {
      const data = docSnap.data();
      const text = String(data.text || '').trim();
      if (!text) return;

      const createdAtMs =
        data.createdAt && typeof (data.createdAt as { toMillis?: () => number }).toMillis === 'function'
          ? (data.createdAt as { toMillis: () => number }).toMillis()
          : index;

      const sourceProposalId = data.sourceProposalId ? String(data.sourceProposalId) : null;

      items.push({
        id: docSnap.id,
        text,
        scheduleOrder: parseScheduleOrder(data, 0) || undefined,
        sourceProposalId,
        createdAtMs,
      });
    });

    const withoutOrder = items.filter((item) => !item.scheduleOrder);
    const withOrder = items.filter((item) => item.scheduleOrder && item.scheduleOrder > 0);

    withoutOrder.sort((a, b) => a.createdAtMs - b.createdAtMs);
    withOrder.sort((a, b) => (a.scheduleOrder ?? 0) - (b.scheduleOrder ?? 0));

    let nextOrder =
      withOrder.reduce((max, item) => Math.max(max, item.scheduleOrder ?? 0), 0) + 1;
    const normalizedWithoutOrder = withoutOrder.map((item) => ({
      id: item.id,
      text: item.text,
      scheduleOrder: nextOrder++,
      sourceProposalId: item.sourceProposalId ?? null,
    }));

    return sortScheduledQuestions([
      ...withOrder.map(({ id, text, scheduleOrder, sourceProposalId }) => ({
        id,
        text,
        scheduleOrder,
        sourceProposalId: sourceProposalId ?? null,
      })),
      ...normalizedWithoutOrder,
    ]);
  } catch (error) {
    console.error('커스텀 질문 로드 실패:', error);
    return [];
  }
}

export async function createCustomMemberWorldCupQuestion(input: {
  text: string;
  createdBy: string;
  createdByNickname: string;
}): Promise<MemberWorldCupQuestionDefinition> {
  if (!auth.currentUser?.uid) {
    await auth.authStateReady();
  }
  const authUid = auth.currentUser?.uid;
  if (!authUid) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (input.createdBy !== authUid) {
    throw new Error('계정 정보가 일치하지 않습니다. 다시 로그인해 주세요.');
  }

  const trimmed = input.text.trim();
  if (!trimmed) {
    throw new Error('질문 내용을 입력해 주세요.');
  }
  if (trimmed.length > 200) {
    throw new Error('질문은 200자 이내로 입력해 주세요.');
  }

  const existing = await fetchCustomMemberWorldCupQuestions();
  const nextScheduleOrder =
    existing.reduce((max, item) => Math.max(max, item.scheduleOrder ?? 0), 0) + 1;

  try {
    const ref = await addDoc(collection(db, MEMBER_WORLD_CUP_CUSTOM_QUESTIONS_COLLECTION), {
      text: trimmed,
      createdBy: input.createdBy,
      createdByNickname: input.createdByNickname.trim(),
      scheduleOrder: nextScheduleOrder,
      isActive: true,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id, text: trimmed, scheduleOrder: nextScheduleOrder };
  } catch (error) {
    throw new Error(getFirestoreErrorMessage(error));
  }
}

async function getResolvedActiveMemberWorldCupQuestions(
  at = new Date()
): Promise<MemberWorldCupQuestion[]> {
  const customQuestions = await fetchCustomMemberWorldCupQuestions();
  return resolveActiveMemberWorldCupQuestions(customQuestions, at);
}

function voteDocId(dayKey: string, questionId: string, voterUid: string): string {
  return `${dayKey}_${questionId}_${voterUid}`;
}

function questionStatsDocId(dayKey: string, questionId: string): string {
  return `${dayKey}_${questionId}`;
}

function resolveVoteDayKey(data: DocumentData): string | null {
  if (typeof data.dayKey === 'string' && data.dayKey) {
    return data.dayKey;
  }
  if (typeof data.weekKey === 'string' && data.weekKey) {
    return data.weekKey;
  }
  return null;
}

function sumPickCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/** 투표 문서에서 멤버 선택 목록 추출 (legacy customText는 selectedMembers 없을 때만) */
export function extractPicksFromVote(vote: MemberWorldCupVote): MemberWorldCupSelection[] {
  if (vote.selectedMembers.length > 0) {
    return vote.selectedMembers;
  }

  if (!vote.customText) return [];

  return vote.customText
    .split(/[,，、]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((nickname) => ({ uid: `legacy:${nickname}`, nickname }));
}

export function buildQuestionStatsFromVotes(
  question: { id: string; text: string; order: number },
  votes: MemberWorldCupVote[],
  dayKey: string
): MemberWorldCupQuestionStats {
  const counts: Record<string, number> = {};
  let totalPicks = 0;

  for (const vote of votes) {
    for (const pick of extractPicksFromVote(vote)) {
      counts[pick.uid] = (counts[pick.uid] || 0) + 1;
      totalPicks += 1;
    }
  }

  return {
    id: question.id,
    text: question.text,
    order: question.order,
    counts,
    totalVotes: votes.length,
    totalPicks,
    dayKey,
  };
}

export interface RevealPickGroup {
  key: string;
  uid: string | null;
  nickname: string;
  voters: string[];
  pickCount: number;
}

/** 선택받은 멤버 기준 투표자 그룹 (투표 문서가 단일 진실 소스) */
export function groupVotesBySelectedMember(votes: MemberWorldCupVote[]): RevealPickGroup[] {
  const map = new Map<
    string,
    { uid: string | null; nickname: string; voters: Set<string>; pickCount: number }
  >();

  for (const vote of votes) {
    for (const pick of extractPicksFromVote(vote)) {
      const voterNickname = vote.voterNickname.trim();
      if (!voterNickname) continue;

      const key = pick.uid.startsWith('legacy:') ? pick.nickname.trim() : pick.uid;
      if (!key) continue;

      const existing = map.get(key);
      if (existing) {
        existing.voters.add(voterNickname);
        existing.pickCount += 1;
      } else {
        map.set(key, {
          uid: pick.uid.startsWith('legacy:') ? null : pick.uid,
          nickname: pick.nickname,
          voters: new Set([voterNickname]),
          pickCount: 1,
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([key, group]) => ({
      key,
      uid: group.uid,
      nickname: group.nickname,
      voters: Array.from(group.voters).sort((a, b) => a.localeCompare(b, 'ko')),
      pickCount: group.pickCount,
    }))
    .sort((a, b) => {
      if (b.pickCount !== a.pickCount) return b.pickCount - a.pickCount;
      return a.nickname.localeCompare(b.nickname, 'ko');
    });
}

export function parseSelectedMembersFromVoteData(
  data: DocumentData
): MemberWorldCupSelection[] {
  if (Array.isArray(data.selectedMembers)) {
    return data.selectedMembers
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const uid = typeof row.uid === 'string' ? row.uid : '';
        const nickname = typeof row.nickname === 'string' ? row.nickname : '';
        if (!uid || !nickname) return null;
        return { uid, nickname };
      })
      .filter((item): item is MemberWorldCupSelection => item !== null)
      .slice(0, MAX_WORLD_CUP_SELECTIONS);
  }

  if (data.selectedMemberUid) {
    return [
      {
        uid: String(data.selectedMemberUid),
        nickname: String(data.selectedMemberNickname || '알 수 없음'),
      },
    ];
  }

  return [];
}

function parseVoteDoc(docSnap: { id: string; data: () => DocumentData }): MemberWorldCupVote {
  const data = docSnap.data();
  const selectedMembers = parseSelectedMembersFromVoteData(data);
  const dayKey = resolveVoteDayKey(data);
  return {
    id: docSnap.id,
    questionId: String(data.questionId || ''),
    voterUid: String(data.voterUid || ''),
    voterNickname: String(data.voterNickname || ''),
    selectedMembers,
    customText: data.customText ? String(data.customText) : null,
    submittedAt: data.submittedAt,
    dayKey,
    weekKey: data.weekKey ? String(data.weekKey) : null,
    selectedMemberUid: selectedMembers[0]?.uid ?? null,
    selectedMemberNickname: selectedMembers[0]?.nickname ?? null,
  };
}

export async function fetchWorldCupMemberOptions(): Promise<WorldCupMemberOption[]> {
  const snap = await getDocs(collection(db, 'users'));
  const members: WorldCupMemberOption[] = [];

  snap.docs.forEach((userDoc) => {
    const data = userDoc.data();
    const nickname = String(data.nickname || '').trim();
    if (!nickname || isTestNickname(nickname)) return;
    members.push({
      uid: userDoc.id,
      nickname,
      profileImageUrl: typeof data.profileImageUrl === 'string' ? data.profileImageUrl : undefined,
    });
  });

  members.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
  return members;
}

export async function fetchMemberWorldCupQuestionStats(): Promise<MemberWorldCupQuestionStats[]> {
  const currentDayKey = getCurrentDayKey();
  const activeQuestions = await getResolvedActiveMemberWorldCupQuestions();

  const statsList = await Promise.all(
    activeQuestions.map(async (question) => {
      const snap = await getDoc(
        doc(db, MEMBER_WORLD_CUP_COLLECTION, questionStatsDocId(currentDayKey, question.id))
      );

      if (!snap.exists()) {
        return {
          id: question.id,
          text: question.text,
          order: question.order,
          counts: {},
          totalVotes: 0,
          totalPicks: 0,
          dayKey: currentDayKey,
        };
      }

      const data = snap.data();
      const counts = (data.counts as Record<string, number>) || {};
      return {
        id: question.id,
        text: String(data.text || question.text),
        order: Number(data.order) || question.order,
        counts,
        totalVotes: Number(data.totalVotes) || 0,
        totalPicks: Number(data.totalPicks) || sumPickCounts(counts),
        dayKey: currentDayKey,
      };
    })
  );

  return statsList.sort((a, b) => a.order - b.order);
}

/** 너래 전용 — 투표 문서 기준으로 집계 문서를 재동기화 */
export async function syncMemberWorldCupQuestionStatsFromVotes(
  questionId: string
): Promise<MemberWorldCupQuestionStats> {
  const currentDayKey = getCurrentDayKey();
  const activeQuestions = await getResolvedActiveMemberWorldCupQuestions();
  const activeQuestion = activeQuestions.find((item) => item.id === questionId);
  if (!activeQuestion) {
    throw new Error('오늘의 질문이 아닙니다.');
  }

  const votes = await fetchAllMemberWorldCupVotesForQuestion(questionId);
  const stats = buildQuestionStatsFromVotes(activeQuestion, votes, currentDayKey);

  await setDoc(
    doc(db, MEMBER_WORLD_CUP_COLLECTION, questionStatsDocId(currentDayKey, questionId)),
    {
      questionId,
      text: stats.text,
      order: stats.order,
      counts: stats.counts,
      totalVotes: stats.totalVotes,
      totalPicks: stats.totalPicks,
      dayKey: currentDayKey,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return stats;
}

export async function fetchMyMemberWorldCupVotes(
  voterUid: string
): Promise<Record<string, MemberWorldCupVote>> {
  const currentDayKey = getCurrentDayKey();
  const activeQuestions = await getResolvedActiveMemberWorldCupQuestions();
  const activeQuestionIds = new Set(activeQuestions.map((q) => q.id));
  const snap = await getDocs(
    query(
      collection(db, MEMBER_WORLD_CUP_VOTES_COLLECTION),
      where('voterUid', '==', voterUid),
      where('dayKey', '==', currentDayKey)
    )
  );

  const result: Record<string, MemberWorldCupVote> = {};
  snap.docs.forEach((docSnap) => {
    const vote = parseVoteDoc(docSnap);
    if (!vote.questionId || !activeQuestionIds.has(vote.questionId)) return;
    result[vote.questionId] = vote;
  });

  return result;
}

/** 본인이 투표한 과거 질문 키 (`dayKey_questionId`) 집합 */
export function pastQuestionParticipationKey(dayKey: string, questionId: string): string {
  return `${dayKey}_${questionId}`;
}

export async function fetchMyMemberWorldCupVotedQuestionKeys(
  voterUid: string
): Promise<Set<string>> {
  const snap = await getDocs(
    query(collection(db, MEMBER_WORLD_CUP_VOTES_COLLECTION), where('voterUid', '==', voterUid))
  );
  const keys = new Set<string>();
  snap.docs.forEach((docSnap) => {
    const vote = parseVoteDoc(docSnap);
    if (!vote.questionId || !vote.dayKey) return;
    keys.add(pastQuestionParticipationKey(vote.dayKey, vote.questionId));
  });
  return keys;
}

export async function hasMyMemberWorldCupVoteForDay(
  voterUid: string,
  questionId: string,
  dayKey: string
): Promise<boolean> {
  const snap = await getDoc(
    doc(db, MEMBER_WORLD_CUP_VOTES_COLLECTION, voteDocId(dayKey, questionId, voterUid))
  );
  return snap.exists();
}

export async function fetchMemberWorldCupVotesForQuestionDay(
  questionId: string,
  dayKey: string
): Promise<MemberWorldCupVote[]> {
  const snap = await getDocs(
    query(
      collection(db, MEMBER_WORLD_CUP_VOTES_COLLECTION),
      where('questionId', '==', questionId),
      where('dayKey', '==', dayKey)
    )
  );

  return snap.docs
    .map((docSnap) => parseVoteDoc(docSnap))
    .sort((a, b) => {
      const aNick = a.voterNickname || '';
      const bNick = b.voterNickname || '';
      return aNick.localeCompare(bNick, 'ko');
    });
}

export async function fetchAllMemberWorldCupVotesForQuestion(
  questionId: string
): Promise<MemberWorldCupVote[]> {
  return fetchMemberWorldCupVotesForQuestionDay(questionId, getCurrentDayKey());
}

/** 멤버·너래 공통 — 특정 날짜 질문의 집계만 (개별 투표자 정보 없음) */
export async function fetchPastMemberWorldCupQuestionStats(
  questionId: string,
  dayKey: string,
  questionText: string
): Promise<MemberWorldCupQuestionStats> {
  const statsSnap = await getDoc(
    doc(db, MEMBER_WORLD_CUP_COLLECTION, questionStatsDocId(dayKey, questionId))
  );

  if (!statsSnap.exists()) {
    return {
      id: questionId,
      text: questionText,
      order: 1,
      counts: {},
      totalVotes: 0,
      totalPicks: 0,
      dayKey,
    };
  }

  const data = statsSnap.data();
  const counts = (data.counts as Record<string, number>) || {};
  return {
    id: questionId,
    text: String(data.text || questionText),
    order: Number(data.order) || 1,
    counts,
    totalVotes: Number(data.totalVotes) || 0,
    totalPicks: Number(data.totalPicks) || sumPickCounts(counts),
    dayKey,
  };
}

/** 너래 전용 — 특정 날짜 질문의 집계·투표 문서 */
export async function fetchPastMemberWorldCupQuestionResults(
  questionId: string,
  dayKey: string,
  questionText: string
): Promise<{ stats: MemberWorldCupQuestionStats; votes: MemberWorldCupVote[] }> {
  const [votes, stats] = await Promise.all([
    fetchMemberWorldCupVotesForQuestionDay(questionId, dayKey),
    fetchPastMemberWorldCupQuestionStats(questionId, dayKey, questionText),
  ]);

  if (stats.totalVotes > 0 || Object.keys(stats.counts).length > 0) {
    return {
      stats: {
        ...stats,
        totalVotes: stats.totalVotes || votes.length,
      },
      votes,
    };
  }

  return {
    stats: buildQuestionStatsFromVotes(
      { id: questionId, text: questionText, order: 1 },
      votes,
      dayKey
    ),
    votes,
  };
}

export async function submitMemberWorldCupVote(
  input: SubmitMemberWorldCupVoteInput
): Promise<void> {
  if (!auth.currentUser?.uid) {
    await auth.authStateReady();
  }
  const resolvedUid = auth.currentUser?.uid;
  if (!resolvedUid) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (input.voterUid !== resolvedUid) {
    throw new Error('계정 정보가 일치하지 않습니다. 다시 로그인해 주세요.');
  }
  if (isTestNickname(input.voterNickname)) {
    throw new Error(TEST_NICKNAME_VOTE_BLOCKED_MESSAGE);
  }

  const activeQuestions = await getResolvedActiveMemberWorldCupQuestions();
  const activeQuestion = activeQuestions.find((item) => item.id === input.questionId);
  if (!activeQuestion) {
    throw new Error('오늘의 질문이 아닙니다.');
  }

  const currentDayKey = getCurrentDayKey();
  const trimmedCustom = input.customText.trim();
  const selectedMembers = input.selectedMembers.slice(0, MAX_WORLD_CUP_SELECTIONS);

  if (selectedMembers.length === 0 && !trimmedCustom) {
    throw new Error('멤버를 1명 이상 선택하거나 직접 입력해 주세요.');
  }
  if (selectedMembers.length > MAX_WORLD_CUP_SELECTIONS) {
    throw new Error(`최대 ${MAX_WORLD_CUP_SELECTIONS}명까지 선택할 수 있습니다.`);
  }

  const uniqueUids = new Set(selectedMembers.map((member) => member.uid));
  if (uniqueUids.size !== selectedMembers.length) {
    throw new Error('같은 멤버는 중복 선택할 수 없습니다.');
  }
  if (selectedMembers.some((member) => isTestNickname(member.nickname))) {
    throw new Error('테스트 닉네임 멤버에는 투표할 수 없습니다.');
  }
  if (selectedMembers.some((member) => member.uid === resolvedUid)) {
    throw new Error('본인에게는 투표할 수 없습니다.');
  }

  const voteRef = doc(
    db,
    MEMBER_WORLD_CUP_VOTES_COLLECTION,
    voteDocId(currentDayKey, input.questionId, resolvedUid)
  );

  const existingVoteSnap = await getDoc(voteRef);
  if (existingVoteSnap.exists()) {
    throw new Error('이미 투표한 질문은 수정할 수 없습니다.');
  }

  const questionRef = doc(
    db,
    MEMBER_WORLD_CUP_COLLECTION,
    questionStatsDocId(currentDayKey, input.questionId)
  );

  await runTransaction(db, async (transaction) => {
    const [voteSnap, questionSnap] = await Promise.all([
      transaction.get(voteRef),
      transaction.get(questionRef),
    ]);

    if (voteSnap.exists()) {
      throw new Error('ALREADY_VOTED');
    }

    const newUids = selectedMembers.map((member) => member.uid);
    const questionData = questionSnap.exists() ? (questionSnap.data() as DocumentData) : null;
    const counts: Record<string, number> = {
      ...((questionData?.counts as Record<string, number>) || {}),
    };
    let totalVotes = Number(questionData?.totalVotes) || 0;
    let totalPicks = Number(questionData?.totalPicks) || 0;

    totalVotes += 1;

    newUids.forEach((uid) => {
      counts[uid] = (counts[uid] || 0) + 1;
      totalPicks += 1;
    });

    transaction.set(voteRef, {
      questionId: input.questionId,
      voterUid: resolvedUid,
      voterNickname: input.voterNickname,
      selectedMembers,
      selectedMemberUid: selectedMembers[0]?.uid ?? null,
      selectedMemberNickname: selectedMembers[0]?.nickname ?? null,
      customText: trimmedCustom || null,
      dayKey: currentDayKey,
      submittedAt: serverTimestamp(),
    });

    transaction.set(questionRef, {
      questionId: input.questionId,
      text: activeQuestion.text,
      order: activeQuestion.order,
      counts,
      totalVotes,
      totalPicks,
      dayKey: currentDayKey,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function hasMemberWorldCupVote(
  questionId: string,
  voterUid: string
): Promise<boolean> {
  const currentDayKey = getCurrentDayKey();
  const snap = await getDoc(
    doc(
      db,
      MEMBER_WORLD_CUP_VOTES_COLLECTION,
      voteDocId(currentDayKey, questionId, voterUid)
    )
  );
  return snap.exists();
}

export type MemberWorldCupQuestionProposal = {
  id: string;
  text: string;
  createdBy: string;
  createdByNickname: string;
  status: 'pending' | 'scheduled' | 'rejected';
  createdAt: unknown;
  scheduledForDayKey?: string | null;
  customQuestionId?: string | null;
};

export async function submitMemberWorldCupQuestionProposal(input: {
  text: string;
  createdBy: string;
  createdByNickname: string;
}): Promise<void> {
  if (!auth.currentUser?.uid) {
    await auth.authStateReady();
  }
  const authUid = auth.currentUser?.uid;
  if (!authUid) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (input.createdBy !== authUid) {
    throw new Error('계정 정보가 일치하지 않습니다. 다시 로그인해 주세요.');
  }
  if (isTestNickname(input.createdByNickname)) {
    throw new Error(TEST_NICKNAME_VOTE_BLOCKED_MESSAGE);
  }

  const trimmed = input.text.trim();
  if (!trimmed) {
    throw new Error('질문 내용을 입력해 주세요.');
  }
  if (trimmed.length > 200) {
    throw new Error('질문은 200자 이내로 입력해 주세요.');
  }

  try {
    await addDoc(collection(db, MEMBER_WORLD_CUP_PROPOSALS_COLLECTION), {
      text: trimmed,
      createdBy: authUid,
      createdByNickname: input.createdByNickname.trim(),
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(getFirestoreErrorMessage(error));
  }
}

export async function fetchPendingMemberWorldCupProposals(): Promise<
  MemberWorldCupQuestionProposal[]
> {
  const snap = await getDocs(
    query(
      collection(db, MEMBER_WORLD_CUP_PROPOSALS_COLLECTION),
      where('status', '==', 'pending')
    )
  );

  const items: MemberWorldCupQuestionProposal[] = snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      text: String(data.text || ''),
      createdBy: String(data.createdBy || ''),
      createdByNickname: String(data.createdByNickname || ''),
      status: 'pending',
      createdAt: data.createdAt,
      scheduledForDayKey: data.scheduledForDayKey ? String(data.scheduledForDayKey) : null,
      customQuestionId: data.customQuestionId ? String(data.customQuestionId) : null,
    };
  });

  items.sort((a, b) => {
    const aMs =
      a.createdAt && typeof (a.createdAt as { toMillis?: () => number }).toMillis === 'function'
        ? (a.createdAt as { toMillis: () => number }).toMillis()
        : 0;
    const bMs =
      b.createdAt && typeof (b.createdAt as { toMillis?: () => number }).toMillis === 'function'
        ? (b.createdAt as { toMillis: () => number }).toMillis()
        : 0;
    return bMs - aMs;
  });

  return items;
}

/** 너래 전용 — 제안 질문을 내일(다음 KST 0시) 노출 큐에 반영 */
export async function approveMemberWorldCupProposalForNextDay(
  proposalId: string
): Promise<{ scheduleLabel: string; scheduleOrder: number }> {
  if (!auth.currentUser?.uid) {
    await auth.authStateReady();
  }
  if (!auth.currentUser?.uid) {
    throw new Error('로그인 세션이 만료되었습니다.');
  }

  const proposalRef = doc(db, MEMBER_WORLD_CUP_PROPOSALS_COLLECTION, proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) {
    throw new Error('질문 제안을 찾을 수 없습니다.');
  }

  const proposal = proposalSnap.data();
  if (proposal.status !== 'pending') {
    throw new Error('이미 처리된 제안입니다.');
  }

  const rawText = String(proposal.text || '').trim();
  if (!rawText) {
    throw new Error('질문 내용이 비어 있습니다.');
  }
  const text = rawText.startsWith(MEMBER_WORLD_CUP_PROPOSED_QUESTION_PREFIX)
    ? rawText
    : `${MEMBER_WORLD_CUP_PROPOSED_QUESTION_PREFIX}${rawText}`;

  const activeSnap = await getDocs(
    query(
      collection(db, MEMBER_WORLD_CUP_CUSTOM_QUESTIONS_COLLECTION),
      where('isActive', '==', true)
    )
  );

  type QueueRow = { id: string; text: string; scheduleOrder: number };
  const queue: QueueRow[] = activeSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      text: String(data.text || ''),
      scheduleOrder: parseScheduleOrder(data, 0) || 0,
    };
  });

  queue.sort((a, b) => a.scheduleOrder - b.scheduleOrder || a.id.localeCompare(b.id));

  const tomorrowSlotIndex = getMemberWorldCupDayIndex() + 1;
  const insertIndex = Math.min(Math.max(0, tomorrowSlotIndex), queue.length);
  const targetScheduleOrder = insertIndex + 1;

  const batch = writeBatch(db);

  const newQuestionRef = doc(collection(db, MEMBER_WORLD_CUP_CUSTOM_QUESTIONS_COLLECTION));
  batch.set(newQuestionRef, {
    text,
    createdBy: proposal.createdBy,
    createdByNickname: proposal.createdByNickname,
    scheduleOrder: targetScheduleOrder,
    isActive: true,
    sourceProposalId: proposalId,
    createdAt: serverTimestamp(),
  });

  for (let i = insertIndex; i < queue.length; i += 1) {
    const row = queue[i];
    const nextOrder = i + 2;
    if (row.scheduleOrder !== nextOrder) {
      batch.update(doc(db, MEMBER_WORLD_CUP_CUSTOM_QUESTIONS_COLLECTION, row.id), {
        scheduleOrder: nextOrder,
      });
    }
  }

  const scheduledForDayKey = getScheduledDayKeyForOrder(targetScheduleOrder);
  batch.update(proposalRef, {
    status: 'scheduled',
    customQuestionId: newQuestionRef.id,
    scheduledForDayKey,
    scheduledAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    throw new Error(getFirestoreErrorMessage(error));
  }

  return {
    scheduleLabel: formatQuestionScheduleLabel(targetScheduleOrder),
    scheduleOrder: targetScheduleOrder,
  };
}

/** 너래 전용 — 제안 질문 거부 (큐에 넣지 않음) */
export async function rejectMemberWorldCupQuestionProposal(proposalId: string): Promise<void> {
  if (!auth.currentUser?.uid) {
    await auth.authStateReady();
  }
  if (!auth.currentUser?.uid) {
    throw new Error('로그인 세션이 만료되었습니다.');
  }

  const proposalRef = doc(db, MEMBER_WORLD_CUP_PROPOSALS_COLLECTION, proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) {
    throw new Error('질문 제안을 찾을 수 없습니다.');
  }

  const proposal = proposalSnap.data();
  if (proposal.status !== 'pending') {
    throw new Error('이미 처리된 제안입니다.');
  }

  try {
    await setDoc(
      proposalRef,
      {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    throw new Error(getFirestoreErrorMessage(error));
  }
}
