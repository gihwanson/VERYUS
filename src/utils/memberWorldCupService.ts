import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { auth } from '../firebase';
import { getCurrentWeekMondayKey } from './gameWeek';
import {
  MEMBER_WORLD_CUP_COLLECTION,
  MEMBER_WORLD_CUP_QUESTIONS,
  MEMBER_WORLD_CUP_VOTES_COLLECTION,
} from './memberWorldCupQuestions';

export const MAX_WORLD_CUP_SELECTIONS = 3;

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
  weekKey: string | null;
  /** @deprecated 단일 선택 구버전 호환 */
  selectedMemberUid?: string | null;
  selectedMemberNickname?: string | null;
}

export interface MemberWorldCupQuestionStats {
  id: string;
  text: string;
  order: number;
  counts: Record<string, number>;
  totalVotes: number;
  weekKey: string | null;
}

export interface SubmitMemberWorldCupVoteInput {
  questionId: string;
  voterUid: string;
  voterNickname: string;
  selectedMembers: MemberWorldCupSelection[];
  customText: string;
}

function voteDocId(questionId: string, voterUid: string): string {
  return `${questionId}_${voterUid}`;
}

function isVoteInCurrentWeek(weekKey: string | null | undefined, currentWeekKey: string): boolean {
  return Boolean(weekKey && weekKey === currentWeekKey);
}

function normalizeQuestionStatsForWeek(
  stats: Omit<MemberWorldCupQuestionStats, 'weekKey'> & { weekKey?: string | null },
  currentWeekKey: string
): MemberWorldCupQuestionStats {
  if (!stats.weekKey || stats.weekKey !== currentWeekKey) {
    return {
      ...stats,
      counts: {},
      totalVotes: 0,
      weekKey: currentWeekKey,
    };
  }
  return {
    ...stats,
    weekKey: stats.weekKey,
  };
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
  return {
    id: docSnap.id,
    questionId: String(data.questionId || ''),
    voterUid: String(data.voterUid || ''),
    voterNickname: String(data.voterNickname || ''),
    selectedMembers,
    customText: data.customText ? String(data.customText) : null,
    submittedAt: data.submittedAt,
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
    if (!nickname || nickname === '평가자') return;
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
  const currentWeekKey = getCurrentWeekMondayKey();
  const snap = await getDocs(collection(db, MEMBER_WORLD_CUP_COLLECTION));
  const statsById = new Map<string, MemberWorldCupQuestionStats>();

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const raw = {
      id: docSnap.id,
      text: String(data.text || ''),
      order: Number(data.order) || 0,
      counts: (data.counts as Record<string, number>) || {},
      totalVotes: Number(data.totalVotes) || 0,
      weekKey: data.weekKey ? String(data.weekKey) : null,
    };
    statsById.set(docSnap.id, normalizeQuestionStatsForWeek(raw, currentWeekKey));
  });

  return MEMBER_WORLD_CUP_QUESTIONS.map((question) => {
    const existing = statsById.get(question.id);
    if (existing) return existing;
    return {
      id: question.id,
      text: question.text,
      order: question.order,
      counts: {},
      totalVotes: 0,
      weekKey: currentWeekKey,
    };
  }).sort((a, b) => a.order - b.order);
}

export async function fetchMyMemberWorldCupVotes(
  voterUid: string
): Promise<Record<string, MemberWorldCupVote>> {
  const currentWeekKey = getCurrentWeekMondayKey();
  const snap = await getDocs(
    query(collection(db, MEMBER_WORLD_CUP_VOTES_COLLECTION), where('voterUid', '==', voterUid))
  );

  const result: Record<string, MemberWorldCupVote> = {};
  snap.docs.forEach((docSnap) => {
    const vote = parseVoteDoc(docSnap);
    if (!vote.questionId) return;
    if (!isVoteInCurrentWeek(vote.weekKey, currentWeekKey)) return;
    result[vote.questionId] = vote;
  });

  return result;
}

export async function fetchAllMemberWorldCupVotesForQuestion(
  questionId: string
): Promise<MemberWorldCupVote[]> {
  const currentWeekKey = getCurrentWeekMondayKey();
  const snap = await getDocs(
    query(
      collection(db, MEMBER_WORLD_CUP_VOTES_COLLECTION),
      where('questionId', '==', questionId)
    )
  );

  return snap.docs
    .map((docSnap) => parseVoteDoc(docSnap))
    .filter((vote) => isVoteInCurrentWeek(vote.weekKey, currentWeekKey))
    .sort((a, b) => {
      const aNick = a.voterNickname || '';
      const bNick = b.voterNickname || '';
      return aNick.localeCompare(bNick, 'ko');
    });
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

  const questionMeta = MEMBER_WORLD_CUP_QUESTIONS.find((item) => item.id === input.questionId);
  if (!questionMeta) {
    throw new Error('유효하지 않은 질문입니다.');
  }

  const currentWeekKey = getCurrentWeekMondayKey();
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

  const voteRef = doc(
    db,
    MEMBER_WORLD_CUP_VOTES_COLLECTION,
    voteDocId(input.questionId, resolvedUid)
  );
  const questionRef = doc(db, MEMBER_WORLD_CUP_COLLECTION, input.questionId);

  await runTransaction(db, async (transaction) => {
    const [voteSnap, questionSnap] = await Promise.all([
      transaction.get(voteRef),
      transaction.get(questionRef),
    ]);

    const previousVote = voteSnap.exists() ? (voteSnap.data() as DocumentData) : null;
    const previousWeekKey = previousVote?.weekKey ? String(previousVote.weekKey) : null;
    const previousInCurrentWeek = isVoteInCurrentWeek(previousWeekKey, currentWeekKey);
    const previousUids = previousInCurrentWeek
      ? parseSelectedMembersFromVoteData(previousVote!).map((member) => member.uid)
      : [];
    const newUids = selectedMembers.map((member) => member.uid);

    const questionData = questionSnap.exists() ? (questionSnap.data() as DocumentData) : null;
    const storedWeekKey = questionData?.weekKey ? String(questionData.weekKey) : null;
    const isNewStatsWeek = !storedWeekKey || storedWeekKey !== currentWeekKey;

    const counts: Record<string, number> = isNewStatsWeek
      ? {}
      : { ...((questionData?.counts as Record<string, number>) || {}) };
    let totalVotes = isNewStatsWeek ? 0 : Number(questionData?.totalVotes) || 0;

    previousUids.forEach((uid) => {
      counts[uid] = Math.max(0, (counts[uid] || 0) - 1);
      if (counts[uid] === 0) delete counts[uid];
    });

    if (!previousInCurrentWeek) {
      totalVotes += 1;
    }

    newUids.forEach((uid) => {
      counts[uid] = (counts[uid] || 0) + 1;
    });

    transaction.set(
      voteRef,
      {
        questionId: input.questionId,
        voterUid: resolvedUid,
        voterNickname: input.voterNickname,
        selectedMembers,
        selectedMemberUid: selectedMembers[0]?.uid ?? null,
        selectedMemberNickname: selectedMembers[0]?.nickname ?? null,
        customText: trimmedCustom || null,
        weekKey: currentWeekKey,
        submittedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(
      questionRef,
      {
        text: questionMeta.text,
        order: questionMeta.order,
        counts,
        totalVotes,
        weekKey: currentWeekKey,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function hasMemberWorldCupVote(
  questionId: string,
  voterUid: string
): Promise<boolean> {
  const currentWeekKey = getCurrentWeekMondayKey();
  const snap = await getDoc(
    doc(db, MEMBER_WORLD_CUP_VOTES_COLLECTION, voteDocId(questionId, voterUid))
  );
  if (!snap.exists()) return false;
  const vote = parseVoteDoc(snap);
  return isVoteInCurrentWeek(vote.weekKey, currentWeekKey);
}
