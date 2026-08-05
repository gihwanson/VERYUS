import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getBookableWeekRangeForDate } from './practiceRoomTicketing';

export const MAX_WEEKLY_PARTICIPATIONS = 1;

export interface WeeklyParticipationReservation {
  userDisplayName?: string;
  members?: string[];
  date?: string;
  status?: string;
  reservationGroup?: string;
  startTime?: string;
}

function normalizeNickname(name: string): string {
  return name.trim();
}

function collectParticipantsFromReservation(data: WeeklyParticipationReservation): string[] {
  const names: string[] = [];
  const booker = normalizeNickname(String(data.userDisplayName || ''));
  if (booker) names.push(booker);
  if (Array.isArray(data.members)) {
    for (const member of data.members) {
      const nickname = normalizeNickname(String(member));
      if (nickname) names.push(nickname);
    }
  }
  return names;
}

function getUniqueGroupKey(data: WeeklyParticipationReservation): string {
  if (typeof data.reservationGroup === 'string' && data.reservationGroup.trim()) {
    return data.reservationGroup.trim();
  }
  return `${String(data.date || '')}_${String(data.startTime || '')}`;
}

export function getParticipationWeekRange(
  targetDateStr: string,
  useTicketingWeek: boolean
): { start: string; end: string } {
  if (useTicketingWeek) {
    return getBookableWeekRangeForDate(targetDateStr);
  }

  const [year, month, day] = targetDateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const format = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return { start: format(weekStart), end: format(weekEnd) };
}

export async function fetchConfirmedReservationsInWeek(
  weekStartStr: string,
  weekEndStr: string
): Promise<Array<{ id: string; data: WeeklyParticipationReservation }>> {
  const snapshot = await getDocs(
    query(collection(db, 'practiceRoomReservations'), where('status', '==', 'confirmed'))
  );

  return snapshot.docs
    .map((item) => ({ id: item.id, data: item.data() as WeeklyParticipationReservation }))
    .filter(({ data }) => {
      const dateStr = String(data.date || '');
      return dateStr >= weekStartStr && dateStr <= weekEndStr;
    });
}

export function countWeeklyParticipationsByNickname(
  reservations: Array<{ data: WeeklyParticipationReservation }>,
  nickname: string
): number {
  const normalized = normalizeNickname(nickname);
  if (!normalized) return 0;

  const matchedGroups = new Set<string>();
  for (const { data } of reservations) {
    const participants = collectParticipantsFromReservation(data);
    if (participants.some((participant) => participant === normalized)) {
      matchedGroups.add(getUniqueGroupKey(data));
    }
  }

  return matchedGroups.size;
}

export function validateTicketingParticipationBooking(params: {
  bookerNickname: string;
  memberNicknames: string[];
  reservations: Array<{ data: WeeklyParticipationReservation }>;
}): { allowed: boolean; reason?: string } {
  const bookerNickname = normalizeNickname(params.bookerNickname);
  const memberNicknames = params.memberNicknames.map(normalizeNickname).filter(Boolean);
  const participants = [...new Set([bookerNickname, ...memberNicknames].filter(Boolean))];

  if (participants.length < 2) {
    return {
      allowed: false,
      reason: '함께 사용할 멤버를 1명 이상 추가해주세요.\n(2인 이상부터 예약 가능합니다)',
    };
  }

  const getCount = (nickname: string) =>
    countWeeklyParticipationsByNickname(params.reservations, nickname);

  const bookerCount = getCount(bookerNickname);
  if (bookerCount >= MAX_WEEKLY_PARTICIPATIONS) {
    return {
      allowed: false,
      reason: '이번 주 이미 예약하거나 참여한 기록이 있어 예약할 수 없습니다.',
    };
  }

  // 이미 이번 주 1회를 사용한 멤버는 최소 인원(2명)에 포함되지 않음
  const freshParticipantCount = participants.filter(
    (participant) => getCount(participant) < MAX_WEEKLY_PARTICIPATIONS
  ).length;

  if (freshParticipantCount < 2) {
    return {
      allowed: false,
      reason:
        '이번 주 아직 예약/참여하지 않은 멤버가 2명 이상 필요합니다.\n' +
        '(이미 이번 주 사용한 멤버는 함께하는 멤버로 추가할 수 있으나, 최소 인원에는 포함되지 않습니다)',
    };
  }

  return { allowed: true };
}

export function shouldUseTicketingParticipationRules(
  targetDateStr: string,
  enabledFrom: string | undefined,
  ticketingActive: boolean
): boolean {
  return ticketingActive && targetDateStr >= (enabledFrom ?? '');
}
