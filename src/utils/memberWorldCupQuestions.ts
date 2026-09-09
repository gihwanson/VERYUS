import {
  addDaysToDayKey,
  formatDayKeyLabel,
  formatScheduledDayLabel,
  getCurrentDayKey,
  getDaysBetweenDayKeys,
} from './gameWeek';

export interface MemberWorldCupQuestion {
  id: string;
  text: string;
  order: number;
}

export type MemberWorldCupQuestionDefinition = Omit<MemberWorldCupQuestion, 'order'> & {
  scheduleOrder?: number;
};

/** 일일 익명투표 시작일 (KST) — 이 날부터 1번째 질문 노출 */
export const MEMBER_WORLD_CUP_DAILY_ANCHOR_DAY_KEY = '2026-09-09';

export const MEMBER_WORLD_CUP_DAILY_RESET_NOTICE =
  '매일 00시(KST)에 새 질문 1개가 올라옵니다. 한 번 투표하면 그날에는 수정할 수 없어요.';

export const MEMBER_WORLD_CUP_DAILY_MEMBER_NOTICE =
  '매일 하나씩 새 질문이 공개됩니다. 말풍선을 눌러 오늘의 질문에 참여해 보세요!';

export const MEMBER_WORLD_CUP_COLLECTION = 'memberWorldCupQuestions';
export const MEMBER_WORLD_CUP_VOTES_COLLECTION = 'memberWorldCupVotes';

/** @deprecated 주간 설정 — 일일 큐로 대체됨 */
export const MEMBER_WORLD_CUP_WEEKLY_CONFIG_COLLECTION = 'memberWorldCupWeeklyConfig';

/** @deprecated */
export const MEMBER_WORLD_CUP_QUESTIONS_PER_WEEK = 1;

/** @deprecated */
export const MEMBER_WORLD_CUP_WEEKLY_RESET_NOTICE = MEMBER_WORLD_CUP_DAILY_RESET_NOTICE;

/** 앵커일(2026-09-09)부터 며칠째인지 (0 = 첫째 날) */
export function getMemberWorldCupDayIndex(at = new Date()): number {
  const currentDayKey = getCurrentDayKey(at);
  return Math.max(0, getDaysBetweenDayKeys(MEMBER_WORLD_CUP_DAILY_ANCHOR_DAY_KEY, currentDayKey));
}

/** scheduleOrder(1-based) → 노출 dayKey */
export function getScheduledDayKeyForOrder(scheduleOrder: number): string {
  return addDaysToDayKey(MEMBER_WORLD_CUP_DAILY_ANCHOR_DAY_KEY, scheduleOrder - 1);
}

/** scheduleOrder(1-based) → 노출일 라벨 (오늘/내일/9/11 …) */
export function formatQuestionScheduleLabel(scheduleOrder: number, at = new Date()): string {
  const dayOffset = scheduleOrder - 1;
  return formatScheduledDayLabel(MEMBER_WORLD_CUP_DAILY_ANCHOR_DAY_KEY, dayOffset, at);
}

/** 큐 순서대로 정렬된 질문 목록에서 오늘 노출할 질문 결정 */
export function resolveActiveMemberWorldCupQuestions(
  scheduledQuestions: MemberWorldCupQuestionDefinition[],
  at = new Date()
): MemberWorldCupQuestion[] {
  const dayIndex = getMemberWorldCupDayIndex(at);
  const sorted = sortScheduledQuestions(scheduledQuestions);
  const todayQuestion = sorted[dayIndex];
  if (!todayQuestion) return [];

  return [{ id: todayQuestion.id, text: todayQuestion.text, order: 1 }];
}

export function sortScheduledQuestions(
  questions: MemberWorldCupQuestionDefinition[]
): MemberWorldCupQuestionDefinition[] {
  return [...questions].sort((a, b) => {
    const orderA = a.scheduleOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.scheduleOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

/** @deprecated Firestore 설정 없이 호출 */
export function getActiveMemberWorldCupQuestions(
  scheduledQuestions: MemberWorldCupQuestionDefinition[] = [],
  at = new Date()
): MemberWorldCupQuestion[] {
  return resolveActiveMemberWorldCupQuestions(scheduledQuestions, at);
}

export function findMemberWorldCupQuestionById(
  id: string,
  scheduledQuestions: MemberWorldCupQuestionDefinition[] = []
): MemberWorldCupQuestion | undefined {
  const item = scheduledQuestions.find((question) => question.id === id);
  if (!item) return undefined;
  return { id: item.id, text: item.text, order: 0 };
}

export function isActiveMemberWorldCupQuestionId(
  id: string,
  scheduledQuestions: MemberWorldCupQuestionDefinition[] = [],
  at = new Date()
): boolean {
  return resolveActiveMemberWorldCupQuestions(scheduledQuestions, at).some(
    (question) => question.id === id
  );
}

/** 큐에 등록된 질문 중 아직 노출되지 않은 항목 */
export function getUpcomingScheduledQuestions(
  scheduledQuestions: MemberWorldCupQuestionDefinition[],
  at = new Date()
): Array<MemberWorldCupQuestionDefinition & { scheduleLabel: string; scheduleDayKey: string }> {
  const dayIndex = getMemberWorldCupDayIndex(at);
  return sortScheduledQuestions(scheduledQuestions)
    .map((question, index) => ({
      ...question,
      scheduleLabel: formatQuestionScheduleLabel(index + 1, at),
      scheduleDayKey: getScheduledDayKeyForOrder(index + 1),
    }))
    .filter((_, index) => index >= dayIndex);
}

export { formatDayKeyLabel, formatScheduledDayLabel };
