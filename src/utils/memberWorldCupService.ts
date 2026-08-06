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
  getActiveMemberWorldCupQuestions,
  MEMBER_WORLD_CUP_COLLECTION,
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

function voteDocId(weekKey: string, questionId: string, voterUid: string): string {
  return `${weekKey}_${questionId}_${voterUid}`;
}

function questionStatsDocId(weekKey: string, questionId: string): string {
  return `${weekKey}_${questionId}`;
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
  const activeQuestions = getActiveMemberWorldCupQuestions();

  const statsList = await Promise.all(
    activeQuestions.map(async (question) => {
      const snap = await getDoc(
        doc(db, MEMBER_WORLD_CUP_COLLECTION, questionStatsDocId(currentWeekKey, question.id))
      );

      if (!snap.exists()) {
        return {
          id: question.id,
          text: question.text,
          order: question.order,
          counts: {},
          totalVotes: 0,
          totalPicks: 0,
          weekKey: currentWeekKey,
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
        weekKey: currentWeekKey,
      };
    })
  );

  return statsList.sort((a, b) => a.order - b.order);
}

/** 너래 전용 — 투표 문서 기준으로 집계 문서를 재동기화 */
export async function syncMemberWorldCupQuestionStatsFromVotes(
  questionId: string
): Promise<MemberWorldCupQuestionStats> {
  const currentWeekKey = getCurrentWeekMondayKey();
  const activeQuestion = getActiveMemberWorldCupQuestions().find(
    (item) => item.id === questionId
  );
  if (!activeQuestion) {
    throw new Error('이번 주 질문이 아닙니다.');
  }

  const votes = await fetchAllMemberWorldCupVotesForQuestion(questionId);
  const stats = buildQuestionStatsFromVotes(activeQuestion, votes, currentWeekKey);

  await setDoc(
    doc(db, MEMBER_WORLD_CUP_COLLECTION, questionStatsDocId(currentWeekKey, questionId)),
    {
      questionId,
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
  const activeQuestionIds = new Set(getActiveMemberWorldCupQuestions().map((q) => q.id));
  const snap = await getDocs(
    query(
      collection(db, MEMBER_WORLD_CUP_VOTES_COLLECTION),
      where('voterUid', '==', voterUid),
      where('weekKey', '==', currentWeekKey)
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

export async function fetchAllMemberWorldCupVotesForQuestion(
  questionId: string
): Promise<MemberWorldCupVote[]> {
  const currentWeekKey = getCurrentWeekMondayKey();
  const snap = await getDocs(
    query(
      collection(db, MEMBER_WORLD_CUP_VOTES_COLLECTION),
      where('questionId', '==', questionId),
      where('weekKey', '==', currentWeekKey)
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

  const activeQuestion = getActiveMemberWorldCupQuestions().find(
    (item) => item.id === input.questionId
  );
  if (!activeQuestion) {
    throw new Error('이번 주 질문이 아닙니다.');
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
    voteDocId(currentWeekKey, input.questionId, resolvedUid)
  );

  const existingVoteSnap = await getDoc(voteRef);
  if (existingVoteSnap.exists()) {
    throw new Error('이미 투표한 질문은 수정할 수 없습니다.');
  }

  const questionRef = doc(
    db,
    MEMBER_WORLD_CUP_COLLECTION,
    questionStatsDocId(currentWeekKey, input.questionId)
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
      weekKey: currentWeekKey,
      submittedAt: serverTimestamp(),
    });

    transaction.set(questionRef, {
      questionId: input.questionId,
      text: activeQuestion.text,
      order: activeQuestion.order,
      counts,
      totalVotes,
      totalPicks,
      weekKey: currentWeekKey,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function hasMemberWorldCupVote(
  questionId: string,
  voterUid: string
): Promise<boolean> {
  const currentWeekKey = getCurrentWeekMondayKey();
  const snap = await getDoc(
    doc(
      db,
      MEMBER_WORLD_CUP_VOTES_COLLECTION,
      voteDocId(currentWeekKey, questionId, voterUid)
    )
  );
  return snap.exists();
}
