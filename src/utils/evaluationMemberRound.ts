import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationService } from './notificationService';

export const MEMBER_ROUND_DAYS = 3;
export const MEMBER_FIRST_PASS_STATUS = '1차합격';

export type MemberVoteChoice = 'pass' | 'fail';

export interface MemberVoteEntry {
  choice: MemberVoteChoice;
  nickname: string;
  votedAt: number;
}

export type MemberVotesMap = Record<string, MemberVoteEntry>;

export type MemberRoundPostLike = {
  id?: string;
  category?: string;
  status?: string;
  createdAt?: unknown;
  /** 1차 심사 마감 시각. 없으면 기존 대기곡은 지금부터 3일로 부여 */
  memberRoundEndsAt?: unknown;
  memberVotes?: MemberVotesMap | null;
};

export function getEvaluationCreatedAtMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const d = (value as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  }
  if (typeof value === 'object' && value !== null && typeof (value as { seconds?: number }).seconds === 'number') {
    const seconds = (value as { seconds: number }).seconds;
    const nanos = typeof (value as { nanoseconds?: number }).nanoseconds === 'number'
      ? (value as { nanoseconds: number }).nanoseconds
      : 0;
    return seconds * 1000 + Math.floor(nanos / 1_000_000);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const parsed = new Date(value as string).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function computeMemberRoundEndsAt(fromMs = Date.now()): Date {
  return new Date(fromMs + MEMBER_ROUND_DAYS * 24 * 60 * 60 * 1000);
}

export function getMemberRoundDeadlineMs(post: MemberRoundPostLike, now = Date.now()): number {
  const ends = getEvaluationCreatedAtMs(post.memberRoundEndsAt);
  if (ends) return ends;
  // 마감 필드가 아직 없는 기존 대기곡 → 화면상 당장 D-3로 취급 (ensure 전)
  return now + MEMBER_ROUND_DAYS * 24 * 60 * 60 * 1000;
}

/** 1차 심사 마감까지 남은 일수(올림). 마감 지나면 0. */
export function getMemberRoundDaysLeft(post: MemberRoundPostLike, now = Date.now()): number | null {
  if (post.category !== 'busking') return null;
  if (post.status && post.status !== '대기') return null;
  const deadline = getMemberRoundDeadlineMs(post, now);
  if (!deadline) return null;
  const remainingMs = deadline - now;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/** 목록용 D-day 라벨. 버스킹·대기·심사 기간에만. */
export function formatMemberRoundDday(post: MemberRoundPostLike, now = Date.now()): string | null {
  const daysLeft = getMemberRoundDaysLeft(post, now);
  if (daysLeft === null) return null;
  if (daysLeft <= 0) return null;
  const clamped = Math.min(daysLeft, MEMBER_ROUND_DAYS);
  return `D-${clamped}`;
}

export function isBuskingMemberRoundOpen(post: MemberRoundPostLike, now = Date.now()): boolean {
  if (post.category !== 'busking') return false;
  if (post.status && post.status !== '대기') return false;
  const daysLeft = getMemberRoundDaysLeft(post, now);
  return daysLeft !== null && daysLeft > 0;
}

/**
 * 기존 대기 버스킹곡에 memberRoundEndsAt이 없으면 지금부터 3일로 부여.
 * (이미 올라온 곡들을 D-3부터 시작시키기 위함)
 */
export async function ensureMemberRoundEndsAt(
  post: MemberRoundPostLike & { id: string }
): Promise<Date | null> {
  if (post.category !== 'busking') return null;
  if (post.status && post.status !== '대기') return null;
  const existing = getEvaluationCreatedAtMs(post.memberRoundEndsAt);
  if (existing) return new Date(existing);

  const endsAt = computeMemberRoundEndsAt();
  await updateDoc(doc(db, 'posts', post.id), {
    memberRoundEndsAt: endsAt,
  });
  return endsAt;
}

export function countMemberVotes(votes?: MemberVotesMap | null): {
  pass: number;
  fail: number;
  total: number;
} {
  let pass = 0;
  let fail = 0;
  if (votes && typeof votes === 'object') {
    for (const entry of Object.values(votes)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.choice === 'pass') pass += 1;
      else if (entry.choice === 'fail') fail += 1;
    }
  }
  return { pass, fail, total: pass + fail };
}

export function listMemberVotes(votes?: MemberVotesMap | null): Array<{
  uid: string;
  nickname: string;
  choice: MemberVoteChoice;
  votedAt: number;
}> {
  if (!votes || typeof votes !== 'object') return [];
  return Object.entries(votes)
    .filter(([, entry]) => entry && (entry.choice === 'pass' || entry.choice === 'fail'))
    .map(([uid, entry]) => ({
      uid,
      nickname: entry.nickname || '익명',
      choice: entry.choice,
      votedAt: entry.votedAt || 0,
    }))
    .sort((a, b) => (b.votedAt || 0) - (a.votedAt || 0));
}

export type MemberRoundOutcome = 'pass' | 'fail' | 'tie' | 'empty';

export function getMemberRoundOutcome(votes?: MemberVotesMap | null): MemberRoundOutcome {
  const { pass, fail, total } = countMemberVotes(votes);
  if (total === 0) return 'empty';
  if (pass > fail) return 'pass';
  if (fail > pass) return 'fail';
  return 'tie';
}

export function buildMemberRoundResolution(
  post: MemberRoundPostLike,
  now = Date.now()
): { shouldResolve: boolean; nextStatus?: typeof MEMBER_FIRST_PASS_STATUS | '불합격' } {
  if (post.category !== 'busking') return { shouldResolve: false };
  if (post.status && post.status !== '대기') return { shouldResolve: false };
  // 마감 시각이 아직 없으면(기존 곡 ensure 전) 확정하지 않음
  if (!getEvaluationCreatedAtMs(post.memberRoundEndsAt)) return { shouldResolve: false };
  if (isBuskingMemberRoundOpen(post, now)) return { shouldResolve: false };

  const outcome = getMemberRoundOutcome(post.memberVotes);
  if (outcome === 'pass') {
    return { shouldResolve: true, nextStatus: MEMBER_FIRST_PASS_STATUS };
  }
  if (outcome === 'fail') {
    return { shouldResolve: true, nextStatus: '불합격' };
  }
  return { shouldResolve: false };
}

async function findUidByNickname(nickname: string): Promise<string | null> {
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const q = query(collection(db, 'users'), where('nickname', '==', nickname));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].id;
  } catch {
    return null;
  }
}

async function notifyBuskingRejection(post: {
  id: string;
  title: string;
  writerUid: string;
  writerNickname?: string;
  members?: string[];
}): Promise<void> {
  await NotificationService.createRejectionNotification(
    post.writerUid,
    post.id,
    post.title,
    'evaluation'
  );
  if (!Array.isArray(post.members)) return;
  for (const memberNickname of post.members) {
    if (!memberNickname?.trim() || memberNickname === post.writerNickname) continue;
    const memberUid = await findUidByNickname(memberNickname);
    if (memberUid) {
      await NotificationService.createRejectionNotification(
        memberUid,
        post.id,
        post.title,
        'evaluation'
      );
    }
  }
}

/** 1차 심사 기간이 끝난 대기 글을 과반수에 따라 확정. 이미 처리됐으면 null. */
export async function tryResolveExpiredMemberRound(post: {
  id: string;
  title: string;
  writerUid: string;
  writerNickname?: string;
  members?: string[];
  category?: string;
  status?: string;
  createdAt?: unknown;
  memberRoundEndsAt?: unknown;
  memberVotes?: MemberVotesMap | null;
}): Promise<string | null> {
  const resolution = buildMemberRoundResolution(post);
  if (!resolution.shouldResolve || !resolution.nextStatus) return null;

  const nextStatus = resolution.nextStatus;
  await updateDoc(doc(db, 'posts', post.id), {
    status: nextStatus,
    statusUpdatedAt: new Date(),
    memberRoundResolvedAt: new Date(),
    memberRoundOutcome: nextStatus === '불합격' ? 'fail' : 'pass',
  });

  if (nextStatus === '불합격') {
    try {
      const { collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore');
      const approvedQuery = query(
        collection(db, 'approvedSongs'),
        where('approvedPostId', '==', post.id)
      );
      const approvedSnap = await getDocs(approvedQuery);
      for (const approvedDoc of approvedSnap.docs) {
        await deleteDoc(doc(db, 'approvedSongs', approvedDoc.id));
      }
      await notifyBuskingRejection(post);
    } catch (error) {
      console.error('1차 심사 불합격 후처리 실패:', error);
    }
  }

  return nextStatus;
}
