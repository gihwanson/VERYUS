import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { SUPER_ADMIN_NICKNAMES } from '../components/AdminTypes';
import { getKstParts, kstToUtcDate } from './gameWeek';
import { formatDateYmdKst, getBookableWeekRangeOnOpenSunday } from './practiceRoomTicketing';

/** 연습실 티켓팅에서 무조건 1순위(관리자) */
export function isPracticeRoomAdminPriorityUser(
  user: { nickname?: string; role?: string } | null | undefined
): boolean {
  if (!user) return false;
  if (user.nickname && SUPER_ADMIN_NICKNAMES.includes(user.nickname)) return true;
  const role = (user.role || '').trim();
  return role === '리더' || role === '운영진';
}

export type PriorityRankEntry = {
  uid: string;
  nickname: string;
  voteCount: number;
  /** 1부터 시작. 동점이면 같은 순위 */
  rank: number;
};

export type VoteTallyWindow = {
  /** 집계 시작(월 00:00 KST) */
  startMs: number;
  /** 집계 종료(토 24:00 = 다음 일 00:00 KST, exclusive) */
  endMs: number;
  startYmd: string;
  endYmd: string;
  /** 이 집계가 쓰이는 티켓팅 일요일 */
  bookingSundayYmd: string;
  /** 예약 대상 이용 주(월~일) */
  bookableWeekStart: string;
  bookableWeekEnd: string;
};

/** 티켓팅 일요일 기준: 직전 월~토 1차 투표 집계 구간 */
export function getVoteTallyWindowForBookingSunday(bookingSundayYmd: string): VoteTallyWindow {
  const [y, m, d] = bookingSundayYmd.split('-').map(Number);
  const saturday = kstToUtcDate(y, m, d - 1);
  const monday = kstToUtcDate(y, m, d - 6);
  const startYmd = formatDateYmdKst(monday);
  const endYmd = formatDateYmdKst(saturday);
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const startMs = kstToUtcDate(sy, sm, sd, 0, 0).getTime();
  const endMs = kstToUtcDate(ey, em, ed + 1, 0, 0).getTime(); // exclusive
  const bookableWeekStart = formatDateYmdKst(kstToUtcDate(y, m, d + 1));
  const bookableWeekEnd = formatDateYmdKst(kstToUtcDate(y, m, d + 7));
  return {
    startMs,
    endMs,
    startYmd,
    endYmd,
    bookingSundayYmd,
    bookableWeekStart,
    bookableWeekEnd,
  };
}

/**
 * 현재 시각 기준 우선권에 쓰이는 집계 창.
 * - 일요일: 오늘 티켓팅용 (직전 월~토 집계)
 * - 그 외: 다가올 일요일용 (이번 주 월~토 집계 중)
 */
export function getActivePriorityWindow(now = new Date()): VoteTallyWindow {
  const kst = getKstParts(now);
  if (kst.dayOfWeek === 0) {
    const sundayYmd = formatDateYmdKst(now);
    return getVoteTallyWindowForBookingSunday(sundayYmd);
  }
  // 다음 일요일
  const daysUntilSunday = (7 - kst.dayOfWeek) % 7 || 7;
  const nextSunday = formatDateYmdKst(kstToUtcDate(kst.year, kst.month, kst.day + daysUntilSunday));
  return getVoteTallyWindowForBookingSunday(nextSunday);
}

export function isSundayPendingBookingWindow(now = new Date()): boolean {
  return getKstParts(now).dayOfWeek === 0;
}

/** 이용 주 월 00:00 KST 이후면 pending → confirmed 대상 */
export function shouldConfirmPendingForDate(dateYmd: string, now = new Date()): boolean {
  const [y, m, d] = dateYmd.split('-').map(Number);
  // 해당 날짜가 속한 주의 월요일 00:00
  const kst = getKstParts(kstToUtcDate(y, m, d));
  const daysFromMonday = (kst.dayOfWeek + 6) % 7;
  const mondayMs = kstToUtcDate(kst.year, kst.month, kst.day - daysFromMonday, 0, 0).getTime();
  return now.getTime() >= mondayMs;
}

export function tallyMemberVotesInWindow(
  posts: Array<{ data: () => Record<string, unknown> }>,
  window: VoteTallyWindow
): Map<string, { voteCount: number; nickname: string }> {
  const counter = new Map<string, { voteCount: number; nickname: string }>();

  for (const post of posts) {
    const data = post.data();
    if (String(data.type || '').trim() !== 'evaluation') continue;
    if (String(data.category || '').trim() !== 'busking') continue;
    const votes = data.memberVotes;
    if (!votes || typeof votes !== 'object') continue;

    for (const [uid, entry] of Object.entries(votes as Record<string, any>)) {
      if (!uid || !entry || (entry.choice !== 'pass' && entry.choice !== 'fail')) continue;
      const votedAt = Number(entry.votedAt);
      if (!Number.isFinite(votedAt)) continue;
      if (votedAt < window.startMs || votedAt >= window.endMs) continue;
      const nickname = String(entry.nickname || '').trim() || '익명';
      const prev = counter.get(uid);
      if (prev) {
        prev.voteCount += 1;
        if (nickname !== '익명') prev.nickname = nickname;
      } else {
        counter.set(uid, { voteCount: 1, nickname });
      }
    }
  }

  return counter;
}

/** 투표 수 내림차순, 동점 동일 순위(competition rank) */
export function buildPriorityRanking(
  tallies: Map<string, { voteCount: number; nickname: string }>
): PriorityRankEntry[] {
  const sorted = Array.from(tallies.entries())
    .map(([uid, v]) => ({ uid, nickname: v.nickname, voteCount: v.voteCount }))
    .sort(
      (a, b) =>
        b.voteCount - a.voteCount || a.nickname.localeCompare(b.nickname, 'ko')
    );

  const result: PriorityRankEntry[] = [];
  let lastCount = -1;
  let lastRank = 0;
  sorted.forEach((entry, index) => {
    const rank = entry.voteCount === lastCount ? lastRank : index + 1;
    lastCount = entry.voteCount;
    lastRank = rank;
    result.push({ ...entry, rank });
  });
  return result;
}

export function getPriorityRankNumber(
  ranking: PriorityRankEntry[],
  uid: string | null | undefined,
  options?: { isAdminPriority?: boolean }
): number {
  if (options?.isAdminPriority) return 0;
  if (!uid) return Number.POSITIVE_INFINITY;
  const found = ranking.find((r) => r.uid === uid);
  return found ? found.rank : Number.POSITIVE_INFINITY;
}

/**
 * 공격자가 수비자의 pending 슬롯을 뺏을 수 있는지.
 * 관리자 예약은 무조건 1순위. 동순위면 먼저 예약한 쪽 유지.
 */
export function canStealPendingReservation(params: {
  attackerUid: string;
  defenderUid: string;
  ranking: PriorityRankEntry[];
  attackerIsAdminPriority?: boolean;
  defenderIsAdminPriority?: boolean;
}): boolean {
  if (params.attackerUid === params.defenderUid) return false;
  if (params.defenderIsAdminPriority) return false;
  if (params.attackerIsAdminPriority) return true;
  const a = getPriorityRankNumber(params.ranking, params.attackerUid);
  const d = getPriorityRankNumber(params.ranking, params.defenderUid);
  return a < d;
}

export function getCreatedAtMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') return maybe.toMillis();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  return 0;
}

/** 관리자 예약 여부 (구데이터: purpose/닉네임으로도 판별) */
export function reservationHasAdminPriority(r: {
  adminPriority?: boolean;
  purpose?: string;
  userDisplayName?: string;
}): boolean {
  if (r.adminPriority === true) return true;
  const purpose = String(r.purpose || '').replace(/\s+/g, '');
  if (purpose.includes('관리자')) return true;
  const nickname = String(r.userDisplayName || '').trim();
  if (nickname && SUPER_ADMIN_NICKNAMES.includes(nickname)) return true;
  return false;
}

/** 같은 슬롯 후보 중 현재 선두(관리자 > 투표순위 > 먼저 예약) */
export function pickLeadingReservation<T extends {
  userId: string;
  status?: string;
  createdAt?: unknown;
  adminPriority?: boolean;
  purpose?: string;
  userDisplayName?: string;
}>(
  candidates: T[],
  ranking: PriorityRankEntry[]
): T | null {
  const active = candidates.filter((c) => c.status === 'pending' || c.status === 'confirmed');
  if (active.length === 0) return null;
  return [...active].sort((a, b) => compareReservationPriority(a, b, ranking))[0];
}

function compareReservationPriority<T extends {
  userId: string;
  createdAt?: unknown;
  adminPriority?: boolean;
  purpose?: string;
  userDisplayName?: string;
}>(a: T, b: T, ranking: PriorityRankEntry[]): number {
  const aAdmin = reservationHasAdminPriority(a);
  const bAdmin = reservationHasAdminPriority(b);
  if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;
  const ra = getPriorityRankNumber(ranking, a.userId, { isAdminPriority: aAdmin });
  const rb = getPriorityRankNumber(ranking, b.userId, { isAdminPriority: bAdmin });
  if (ra !== rb) return ra - rb;
  return getCreatedAtMs(a.createdAt) - getCreatedAtMs(b.createdAt);
}

/** 표시용: pending/confirmed/outbid 모두, 선두 → 나머지(순위순). 같은 userId는 1건만. */
export function sortReservationsForDisplay<T extends {
  userId: string;
  status?: string;
  createdAt?: unknown;
  adminPriority?: boolean;
  purpose?: string;
  userDisplayName?: string;
}>(
  candidates: T[],
  ranking: PriorityRankEntry[]
): T[] {
  const visible = candidates.filter(
    (c) => c.status === 'pending' || c.status === 'confirmed' || c.status === 'outbid'
  );
  // 슬롯당 유저 1팀만 표시 (연속 예약 문서 중복 제거)
  const byUid = new Map<string, T>();
  for (const item of visible) {
    const prev = byUid.get(item.userId);
    if (!prev) {
      byUid.set(item.userId, item);
      continue;
    }
    // 활성(pending/confirmed)을 outbid보다 우선, 그다음 우선순위 비교
    const prevActive = prev.status === 'pending' || prev.status === 'confirmed';
    const itemActive = item.status === 'pending' || item.status === 'confirmed';
    if (itemActive && !prevActive) {
      byUid.set(item.userId, item);
    } else if (itemActive === prevActive && compareReservationPriority(item, prev, ranking) < 0) {
      byUid.set(item.userId, item);
    }
  }
  const unique = Array.from(byUid.values());
  const leader = pickLeadingReservation(unique, ranking);
  const rest = unique
    .filter((c) => c !== leader)
    .sort((a, b) => compareReservationPriority(a, b, ranking));
  return leader ? [leader, ...rest] : rest;
}

/** 이용 주 월 00:00 KST 기준 표시용 상태 (DB status와 무관하게 시각으로 판별) */
export function getReservationPhaseLabel(
  r: { date?: string; status?: string },
  now = new Date()
): '대기' | '확정' | '밀림' | '' {
  if (r.status === 'outbid') return '밀림';
  if (r.status === 'cancelled') return '';
  const dateYmd = String(r.date || '').trim();
  if (!dateYmd) {
    if (r.status === 'pending') return '대기';
    if (r.status === 'confirmed') return '확정';
    return '';
  }
  // 해당 이용 주의 월요일 00시 전이면 티켓팅 대기, 이후면 확정
  return shouldConfirmPendingForDate(dateYmd, now) ? '확정' : '대기';
}

/** 슬롯 라벨: 닉네임+(대기|확정). 2팀 이상이면 너래(1순위·대기), 민주(2순위·확정) */
export function formatSlotReservationSummary<T extends {
  userId: string;
  userDisplayName?: string;
  date?: string;
  status?: string;
  adminPriority?: boolean;
  purpose?: string;
  createdAt?: unknown;
}>(
  candidates: T[],
  ranking: PriorityRankEntry[],
  now = new Date()
): string {
  const sorted = sortReservationsForDisplay(candidates, ranking);
  if (sorted.length === 0) return '';

  return sorted
    .map((r, index) => {
      const name = String(r.userDisplayName || '예약').trim() || '예약';
      const status = getReservationPhaseLabel(r, now);
      if (sorted.length === 1) {
        return status ? `${name}(${status})` : name;
      }
      return status ? `${name}(${index + 1}순위·${status})` : `${name}(${index + 1}순위)`;
    })
    .join(', ');
}

export async function loadPriorityRankingForWindow(
  window: VoteTallyWindow
): Promise<PriorityRankEntry[]> {
  const postsSnap = await getDocs(collection(db, 'posts'));
  const tallies = tallyMemberVotesInWindow(postsSnap.docs, window);
  return buildPriorityRanking(tallies);
}

/** pending 예약을 월 00시 이후 confirmed로 일괄 전환 */
export async function confirmDuePendingReservations(now = new Date()): Promise<number> {
  const snap = await getDocs(
    query(collection(db, 'practiceRoomReservations'), where('status', '==', 'pending'))
  );
  if (snap.empty) return 0;

  let batch = writeBatch(db);
  let ops = 0;
  let confirmed = 0;

  for (const item of snap.docs) {
    const dateStr = String(item.data()?.date || '');
    if (!dateStr || !shouldConfirmPendingForDate(dateStr, now)) continue;
    batch.update(doc(db, 'practiceRoomReservations', item.id), {
      status: 'confirmed',
      confirmedAt: now,
    });
    ops += 1;
    confirmed += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return confirmed;
}

export function getSundayPendingBannerText(window: VoteTallyWindow): string {
  return (
    `일요일 예약은 확정 대기가며, 월요일 00시에 확정됩니다. ` +
    `1차 투표(좋아요/아쉬워요) 참여 순위가 높을수록 같은 시간대를 우선 확보할 수 있습니다. ` +
    `(집계: ${window.startYmd}~${window.endYmd} · 이용주: ${window.bookableWeekStart}~${window.bookableWeekEnd})`
  );
}

export function describeBookableWeekOnSunday(now = new Date()): { start: string; end: string } {
  return getBookableWeekRangeOnOpenSunday(now);
}
