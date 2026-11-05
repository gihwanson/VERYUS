import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { fetchMemberPassRateForNickname } from './memberEvaluationPassRate';
import { shouldShowPublicPosition } from './publicRoleBadge';

export type SkinUnlockMetrics = {
  uid: string;
  nickname: string;
  postsTotal: number;
  postsFree: number;
  postsRecording: number;
  postsChorus: number;
  postsPartner: number;
  postsRecordingPlusChorus: number;
  /** 명예의전당과 동일: 평가자 별칭 댓글 제외 */
  comments: number;
  guestbookWritten: number;
  guestbookGiven: number;
  guestbookReceived: number;
  contestParticipations: number;
  evaluationPasses: number;
  /** 기능 도입 이후, 앱을 연 서로 다른 한국 날짜 수 */
  activeDays: number;
  /** 연습장에 직접 추가한 곡 수 */
  practiceSongs: number;
  /** 연습실 예약 횟수. 한 예약의 시간 슬롯은 1회로 묶음 */
  practiceRoomBookings: number;
  /** 나를 뺀 멤버가 들어 있는 연습 곡 */
  sharedPracticeSongs: number;
  /** 내 글 likesCount 합 */
  likesReceived: number;
  /** 내 글 commentCount 합 */
  commentsOnMyPosts: number;
  /** 방명록을 남긴 서로 다른 멤버 수 */
  guestbookUniqueRecipients: number;
  /** 익명투표에 참여한 서로 다른 날짜 */
  worldCupVoteDays: number;
  /** 너래가 채택(내일 반영)한 익명 질문 */
  adoptedAnonymousQuestions: number;
  /** 내가 등록한 익명 쪽지 */
  anonymousNotes: number;
  /** 참가한 마니또 시즌 수 */
  manittoSeasons: number;
  /** 등급전에서 제출한 채점 */
  gradeBattleScores: number;
  /** 콘테스트에서 남긴 심사 */
  contestGradesGiven: number;
  setlistParticipations: number;
  /** 한 번 열리면 빼지 않기 위해 계정에 저장해 둔 해금 목록 */
  storedUnlocks: StoredSkinUnlocks;
  role: string;
  position: string;
  isLeaderOrAdmin: boolean;
  hasPublicPosition: boolean;
};

export type StoredSkinUnlocks = {
  gradeFx: string[];
  nickname: string[];
  badge: string[];
  postTitle: string[];
  postBody: string[];
};

export const EMPTY_SKIN_UNLOCKS: StoredSkinUnlocks = {
  gradeFx: [],
  nickname: [],
  badge: [],
  postTitle: [],
  postBody: [],
};

export function parseStoredSkinUnlocks(raw: unknown): StoredSkinUnlocks {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = (key: keyof StoredSkinUnlocks) => {
    const value = src[key];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  };
  return {
    gradeFx: list('gradeFx'),
    nickname: list('nickname'),
    badge: list('badge'),
    postTitle: list('postTitle'),
    postBody: list('postBody'),
  };
}

function todayKeyKST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export interface ActiveLoginDayResult {
  days: number;
  /** 이번 호출에서 오늘(한국 날짜)이 새로 1일 추가됐는지 */
  newlyCounted: boolean;
}

const activeDayInflight = new Map<string, Promise<ActiveLoginDayResult>>();

/**
 * 한국 날짜가 바뀌면 users.skinUnlockActiveDays 를 1 올린다.
 * 같은 날 여러 번 열어도 1일만 센다. 이 칸이 생기기 전의 접속은 소급하지 않는다.
 */
export function touchActiveLoginDay(uid: string): Promise<ActiveLoginDayResult> {
  if (!uid) return Promise.resolve({ days: 0, newlyCounted: false });
  const inflight = activeDayInflight.get(uid);
  if (inflight) return inflight;
  const task = writeActiveLoginDay(uid).finally(() => {
    if (activeDayInflight.get(uid) === task) activeDayInflight.delete(uid);
  });
  activeDayInflight.set(uid, task);
  return task;
}

async function writeActiveLoginDay(uid: string): Promise<ActiveLoginDayResult> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { days: 0, newlyCounted: false };
  const data = snap.data();
  const today = todayKeyKST();
  const last = String(data?.skinUnlockLastActiveDay || '');
  let days = Number(data?.skinUnlockActiveDays);
  if (!Number.isFinite(days) || days < 0) days = 0;
  if (last === today) return { days, newlyCounted: false };
  const next = days + 1;
  try {
    await updateDoc(ref, {
      skinUnlockActiveDays: next,
      skinUnlockLastActiveDay: today,
    });
  } catch (error) {
    console.error('접속일 갱신 실패:', error);
    return { days, newlyCounted: false };
  }
  return { days: next, newlyCounted: true };
}

/** 다음 한국 자정까지 남은 밀리초 */
export function msUntilNextKstMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const elapsed = ((num('hour') * 60 + num('minute')) * 60 + num('second')) * 1000;
  const day = 24 * 60 * 60 * 1000;
  const remain = day - elapsed;
  return remain > 1000 ? remain : day;
}

async function countPostsByWriter(uid: string): Promise<{
  total: number;
  free: number;
  recording: number;
  chorus: number;
  partner: number;
  likesReceived: number;
  commentsOnMyPosts: number;
}> {
  const snap = await getDocs(query(collection(db, 'posts'), where('writerUid', '==', uid)));
  let free = 0;
  let recording = 0;
  let chorus = 0;
  let partner = 0;
  let likesReceived = 0;
  let commentsOnMyPosts = 0;
  snap.forEach((d) => {
    const data = d.data();
    const type = String(data.type || '').trim();
    if (type === 'free') free += 1;
    else if (type === 'recording') recording += 1;
    else if (type === 'chorus') chorus += 1;
    else if (type === 'partner') partner += 1;
    likesReceived += Number(data.likesCount) || 0;
    commentsOnMyPosts += Number(data.commentCount) || 0;
  });
  return { total: snap.size, free, recording, chorus, partner, likesReceived, commentsOnMyPosts };
}

/** 명예의전당 댓글 집계와 동일 필터 */
export async function countUserCommentsForUnlock(uid: string): Promise<number> {
  if (!uid) return 0;
  const snap = await getDocs(query(collection(db, 'comments'), where('writerUid', '==', uid)));
  let count = 0;
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (data.isEvaluatorAliasComment === true) return;
    const wNick = String(data.writerNickname || '').trim();
    if (wNick === '평가자') return;
    count += 1;
  });
  return count;
}

async function countGuestbook(nickname: string): Promise<{
  written: number;
  given: number;
  received: number;
  uniqueRecipients: number;
}> {
  const nick = nickname.trim();
  if (!nick) return { written: 0, given: 0, received: 0, uniqueRecipients: 0 };
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(query(collection(db, 'guestbook'), where('fromNickname', '==', nick))),
    getDocs(query(collection(db, 'guestbook'), where('toNickname', '==', nick))),
  ]);
  let received = 0;
  const recipients = new Set<string>();
  toSnap.forEach((d) => {
    const from = String(d.data().fromNickname || '').trim();
    if (from && from !== nick) received += 1;
  });
  fromSnap.forEach((d) => {
    const to = String(d.data().toNickname || '').trim();
    if (to && to !== nick) recipients.add(to);
  });
  return {
    written: fromSnap.size,
    given: fromSnap.size,
    received,
    uniqueRecipients: recipients.size,
  };
}

async function countPracticeSongs(uid: string): Promise<{ total: number; shared: number }> {
  if (!uid) return { total: 0, shared: 0 };
  const snap = await getDocs(
    query(collection(db, 'songWorkspaces'), where('createdByUid', '==', uid))
  );
  let total = 0;
  let shared = 0;
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (String(data.category || '') !== 'practice') return;
    total += 1;
    const owner = String(data.createdByNickname || '').trim();
    const members = Array.isArray(data.members)
      ? data.members.map((member) => String(member).trim()).filter(Boolean)
      : [];
    const others = owner ? members.filter((member) => member !== owner) : members.slice(1);
    if (others.length > 0) shared += 1;
  });
  return { total, shared };
}

async function countPracticeRoomBookings(uid: string): Promise<number> {
  if (!uid) return 0;
  const snap = await getDocs(
    query(collection(db, 'practiceRoomReservations'), where('userId', '==', uid))
  );
  const groups = new Set<string>();
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    groups.add(String(data.reservationGroup || d.id));
  });
  return groups.size;
}

async function countContestParticipations(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    const snap = await getDocs(
      query(collectionGroup(db, 'participants'), where('uid', '==', uid))
    );
    let count = 0;
    snap.forEach((d) => {
      if (d.ref.path.startsWith('contests/')) count += 1;
    });
    return count;
  } catch (error) {
    console.warn('콘테스트 참가 수 collectionGroup 실패, contests 순회로 대체:', error);
    const contests = await getDocs(collection(db, 'contests'));
    let count = 0;
    await Promise.all(
      contests.docs.map(async (c) => {
        const p = await getDoc(doc(db, 'contests', c.id, 'participants', uid));
        if (p.exists()) count += 1;
      })
    );
    return count;
  }
}

async function countWorldCupVoteDays(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'memberWorldCupVotes'), where('voterUid', '==', uid))
    );
    const days = new Set<string>();
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const day = String(data.dayKey || '').trim();
      if (day) days.add(day);
    });
    return days.size;
  } catch (error) {
    console.error('익명투표 참여일 집계 실패:', error);
    return 0;
  }
}

async function countAdoptedAnonymousQuestions(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'memberWorldCupQuestionProposals'), where('createdBy', '==', uid))
    );
    let count = 0;
    snap.forEach((d) => {
      if (String(d.data()?.status || '') === 'scheduled') count += 1;
    });
    return count;
  } catch (error) {
    console.error('채택된 익명 질문 집계 실패:', error);
    return 0;
  }
}

async function countAnonymousNotes(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'anonymousNotes'), where('authorUid', '==', uid))
    );
    return snap.size;
  } catch (error) {
    console.error('익명 쪽지 집계 실패:', error);
    return 0;
  }
}

async function countManittoSeasons(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    const seasons = await getDocs(collection(db, 'manittoSeasons'));
    const checks = await Promise.all(
      seasons.docs.map((season) =>
        getDoc(doc(db, 'manittoSeasons', season.id, 'participants', uid))
      )
    );
    return checks.filter((snap) => snap.exists()).length;
  } catch (error) {
    console.error('마니또 참여 집계 실패:', error);
    return 0;
  }
}

async function countContestGradesGiven(nickname: string): Promise<number> {
  const nick = nickname.trim();
  if (!nick) return 0;
  try {
    const contests = await getDocs(collection(db, 'contests'));
    const snaps = await Promise.all(
      contests.docs.map((contest) =>
        getDocs(
          query(collection(db, 'contests', contest.id, 'grades'), where('evaluator', '==', nick))
        )
      )
    );
    return snaps.reduce((sum, snap) => sum + snap.size, 0);
  } catch (error) {
    console.error('콘테스트 심사 집계 실패:', error);
    return 0;
  }
}

async function countGradeBattleScores(nickname: string): Promise<number> {
  const nick = nickname.trim();
  if (!nick) return 0;
  try {
    const posts = await getDocs(
      query(collection(db, 'posts'), where('category', '==', 'gradeBattle'))
    );
    const snaps = await Promise.all(
      posts.docs.map((post) =>
        getDocs(
          query(
            collection(db, 'posts', post.id, 'gradeBattleScores'),
            where('evaluator', '==', nick)
          )
        )
      )
    );
    return snaps.reduce((sum, snap) => sum + snap.size, 0);
  } catch (error) {
    console.error('등급전 채점 집계 실패:', error);
    return 0;
  }
}

async function countSetlistParticipations(nickname: string): Promise<number> {
  const nick = nickname.trim();
  if (!nick) return 0;
  try {
    const [a, b] = await Promise.all([
      getDocs(query(collection(db, 'setlists'), where('participants', 'array-contains', nick))),
      getDocs(
        query(collection(db, 'setlists'), where('freeSongParticipants', 'array-contains', nick))
      ),
    ]);
    const ids = new Set<string>();
    a.forEach((d) => ids.add(d.id));
    b.forEach((d) => ids.add(d.id));
    return ids.size;
  } catch (error) {
    console.error('셋리스트 참여 수 집계 실패:', error);
    return 0;
  }
}

export async function fetchSkinUnlockMetrics(
  uid: string,
  nickname: string
): Promise<SkinUnlockMetrics> {
  const nick = (nickname || '').trim();
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  const role = String(userData?.role || '').trim();
  const position = String(userData?.position || '').trim();

  const [
    posts,
    comments,
    guestbook,
    contestParticipations,
    passStats,
    setlistParticipations,
    activeDay,
    practiceSongs,
    practiceRoomBookings,
    worldCupVoteDays,
    adoptedAnonymousQuestions,
    anonymousNotes,
    manittoSeasons,
    gradeBattleScores,
    contestGradesGiven,
  ] = await Promise.all([
    countPostsByWriter(uid),
    countUserCommentsForUnlock(uid),
    countGuestbook(nick),
    countContestParticipations(uid),
    nick ? fetchMemberPassRateForNickname(nick) : Promise.resolve({ passes: 0 } as Awaited<ReturnType<typeof fetchMemberPassRateForNickname>>),
    countSetlistParticipations(nick),
    touchActiveLoginDay(uid),
    countPracticeSongs(uid),
    countPracticeRoomBookings(uid),
    countWorldCupVoteDays(uid),
    countAdoptedAnonymousQuestions(uid),
    countAnonymousNotes(uid),
    countManittoSeasons(uid),
    countGradeBattleScores(nick),
    countContestGradesGiven(nick),
  ]);

  const isLeaderOrAdmin = role === '리더' || role === '운영진';

  return {
    uid,
    nickname: nick,
    postsTotal: posts.total,
    postsFree: posts.free,
    postsRecording: posts.recording,
    postsChorus: posts.chorus,
    postsPartner: posts.partner,
    postsRecordingPlusChorus: posts.recording + posts.chorus,
    comments,
    guestbookWritten: guestbook.written,
    guestbookGiven: guestbook.given,
    guestbookReceived: guestbook.received,
    contestParticipations,
    evaluationPasses: passStats.passes,
    activeDays: activeDay.days,
    practiceSongs: practiceSongs.total,
    practiceRoomBookings,
    sharedPracticeSongs: practiceSongs.shared,
    likesReceived: posts.likesReceived,
    commentsOnMyPosts: posts.commentsOnMyPosts,
    guestbookUniqueRecipients: guestbook.uniqueRecipients,
    worldCupVoteDays,
    adoptedAnonymousQuestions,
    anonymousNotes,
    manittoSeasons,
    gradeBattleScores,
    contestGradesGiven,
    setlistParticipations,
    storedUnlocks: parseStoredSkinUnlocks(userData?.skinUnlocks),
    role,
    position,
    isLeaderOrAdmin,
    hasPublicPosition: shouldShowPublicPosition(position),
  };
}
