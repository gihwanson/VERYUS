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
  minigamePlays: number;
  contestParticipations: number;
  evaluationPasses: number;
  activeDays: number;
  setlistParticipations: number;
  role: string;
  position: string;
  isLeaderOrAdmin: boolean;
  hasPublicPosition: boolean;
};

function todayKeyKST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** 접속일 1일 1회 누적 (users.skinUnlockActiveDays) */
export async function touchActiveLoginDay(uid: string): Promise<number> {
  if (!uid) return 0;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const today = todayKeyKST();
  const last = String(data?.skinUnlockLastActiveDay || '');
  let days = Number(data?.skinUnlockActiveDays);
  if (!Number.isFinite(days) || days < 0) days = 0;

  if (last !== today) {
    days += 1;
    try {
      await updateDoc(ref, {
        skinUnlockActiveDays: days,
        skinUnlockLastActiveDay: today,
      });
    } catch (error) {
      console.error('접속일 갱신 실패:', error);
    }
  }
  return days;
}

async function countPostsByWriter(uid: string): Promise<{
  total: number;
  free: number;
  recording: number;
  chorus: number;
  partner: number;
}> {
  const snap = await getDocs(query(collection(db, 'posts'), where('writerUid', '==', uid)));
  let free = 0;
  let recording = 0;
  let chorus = 0;
  let partner = 0;
  snap.forEach((d) => {
    const type = String(d.data().type || '').trim();
    if (type === 'free') free += 1;
    else if (type === 'recording') recording += 1;
    else if (type === 'chorus') chorus += 1;
    else if (type === 'partner') partner += 1;
  });
  return { total: snap.size, free, recording, chorus, partner };
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
}> {
  const nick = nickname.trim();
  if (!nick) return { written: 0, given: 0, received: 0 };
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(query(collection(db, 'guestbook'), where('fromNickname', '==', nick))),
    getDocs(query(collection(db, 'guestbook'), where('toNickname', '==', nick))),
  ]);
  let received = 0;
  toSnap.forEach((d) => {
    const from = String(d.data().fromNickname || '').trim();
    if (from && from !== nick) received += 1;
  });
  return {
    written: fromSnap.size,
    given: fromSnap.size,
    received,
  };
}

async function countMinigamePlays(uid: string): Promise<number> {
  if (!uid) return 0;
  const scorePaths: Array<[string, string]> = [
    ['games/flappyBird/bestScores', `${uid}_pc`],
    ['games/flappyBird/bestScores', `${uid}_mobile`],
    ['games/typingSpeed/bestScores', `${uid}_pc`],
    ['games/typingSpeed/bestScores', `${uid}_mobile`],
    ['games/rhythmBeat/bestScores', `${uid}_pc`],
    ['games/rhythmBeat/bestScores', `${uid}_mobile`],
    ['games/reactionTime/bestScores', `${uid}_pc`],
    ['games/reactionTime/bestScores', `${uid}_mobile`],
    ['games/nunSalMi/bestScores', `${uid}_pc`],
    ['games/nunSalMi/bestScores', `${uid}_mobile`],
    ['games/escapeRoom/bestScores', `${uid}_pc`],
    ['games/escapeRoom/bestScores', `${uid}_mobile`],
  ];

  const docs = await Promise.all([
    ...scorePaths.map(([col, id]) => getDoc(doc(db, col, id))),
    getDoc(doc(db, 'games/sichuan/records', uid)),
  ]);

  let total = 0;
  for (let i = 0; i < scorePaths.length; i += 1) {
    const snap = docs[i];
    if (!snap.exists()) continue;
    total += Number(snap.data()?.attemptCount) || 0;
  }
  const sichuan = docs[docs.length - 1];
  if (sichuan.exists()) {
    total += Number(sichuan.data()?.gamesPlayed) || 0;
  }
  return total;
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

  const [posts, comments, guestbook, minigamePlays, contestParticipations, passStats, setlistParticipations, activeDays] =
    await Promise.all([
      countPostsByWriter(uid),
      countUserCommentsForUnlock(uid),
      countGuestbook(nick),
      countMinigamePlays(uid),
      countContestParticipations(uid),
      nick ? fetchMemberPassRateForNickname(nick) : Promise.resolve({ passes: 0 } as Awaited<ReturnType<typeof fetchMemberPassRateForNickname>>),
      countSetlistParticipations(nick),
      touchActiveLoginDay(uid),
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
    minigamePlays,
    contestParticipations,
    evaluationPasses: passStats.passes,
    activeDays,
    setlistParticipations,
    role,
    position,
    isLeaderOrAdmin,
    hasPublicPosition: shouldShowPublicPosition(position),
  };
}
