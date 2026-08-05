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
  /** 이번 주 참여자 수 (1인 1표) */
  totalVotes: number;
  /** 이번 주 선택 합계 (복수 선택 포함) */
  totalPicks: number;
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

function sumPickCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function normalizeQuestionStatsForWeek(
  stats: Omit<MemberWorldCupQuestionStats, 'weekKey' | 'totalPicks'> & {
    weekKey?: string | null;
    totalPicks?: number;
  },
  currentWeekKey: string
): MemberWorldCupQuestionStats {
  if (!stats.weekKey || stats.weekKey !== currentWeekKey) {
    return {
      ...stats,
      counts: {},
      totalVotes: 0,
      totalPicks: 0,
      weekKey: currentWeekKey,
    };
  }

  const totalPicks = stats.totalPicks ?? sumPickCounts(stats.counts);

  return {
    ...stats,
    totalPicks,
    weekKey: stats.weekKey,
  };
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
  weekKey: string
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
    weekKey,
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
    const counts = (data.counts as Record<string, number>) || {};
    const raw = {
      id: docSnap.id,
      text: String(data.text || ''),
      order: Number(data.order) || 0,
      counts,
      totalVotes: Number(data.totalVotes) || 0,
      totalPicks: Number(data.totalPicks) || sumPickCounts(counts),
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
      totalPicks: 0,
      weekKey: currentWeekKey,
    };
  }).sort((a, b) => a.order - b.order);
}

/** 너래 전용 — 투표 문서 기준으로 집계 문서를 재동기화 */
export async function syncMemberWorldCupQuestionStatsFromVotes(
  questionId: string
): Promise<MemberWorldCupQuestionStats> {
  const currentWeekKey = getCurrentWeekMondayKey();
  const questionMeta = MEMBER_WORLD_CUP_QUESTIONS.find((item) => item.id === questionId);
  if (!questionMeta) {
    throw new Error('유효하지 않은 질문입니다.');
  }

  const votes = await fetchAllMemberWorldCupVotesForQuestion(questionId);
  const stats = buildQuestionStatsFromVotes(questionMeta, votes, currentWeekKey);

  await setDoc(
    doc(db, MEMBER_WORLD_CUP_COLLECTION, questionId),
    {
      text: stats.text,
      order: stats.order,
      counts: stats.counts,
      totalVotes: stats.totalVotes,
      totalPicks: stats.totalPicks,
      weekKey: currentWeekKey,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return stats;
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

  const existingVoteSnap = await getDoc(voteRef);
  if (existingVoteSnap.exists()) {
    const existingVote = parseVoteDoc(existingVoteSnap);
    if (isVoteInCurrentWeek(existingVote.weekKey, currentWeekKey)) {
      throw new Error('이미 투표한 질문은 수정할 수 없습니다.');
    }
  }

  const questionRef = doc(db, MEMBER_WORLD_CUP_COLLECTION, input.questionId);

  await runTransaction(db, async (transaction) => {
    const [voteSnap, questionSnap] = await Promise.all([
      transaction.get(voteRef),
      transaction.get(questionRef),
    ]);

    const previousVote = voteSnap.exists() ? (voteSnap.data() as DocumentData) : null;
    const previousWeekKey = previousVote?.weekKey ? String(previousVote.weekKey) : null;
    const previousInCurrentWeek = isVoteInCurrentWeek(previousWeekKey, currentWeekKey);
    if (previousInCurrentWeek) {
      throw new Error('ALREADY_VOTED');
    }
    const previousUids: string[] = [];
    const newUids = selectedMembers.map((member) => member.uid);

    const questionData = questionSnap.exists() ? (questionSnap.data() as DocumentData) : null;
    const storedWeekKey = questionData?.weekKey ? String(questionData.weekKey) : null;
    const isNewStatsWeek = !storedWeekKey || storedWeekKey !== currentWeekKey;

    const counts: Record<string, number> = isNewStatsWeek
      ? {}
      : { ...((questionData?.counts as Record<string, number>) || {}) };
    let totalVotes = isNewStatsWeek ? 0 : Number(questionData?.totalVotes) || 0;
    let totalPicks = isNewStatsWeek ? 0 : Number(questionData?.totalPicks) || 0;

    previousUids.forEach((uid) => {
      counts[uid] = Math.max(0, (counts[uid] || 0) - 1);
      totalPicks = Math.max(0, totalPicks - 1);
      if (counts[uid] === 0) delete counts[uid];
    });

    if (!previousInCurrentWeek) {
      totalVotes += 1;
    }

    newUids.forEach((uid) => {
      counts[uid] = (counts[uid] || 0) + 1;
      totalPicks += 1;
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
        totalPicks,
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
