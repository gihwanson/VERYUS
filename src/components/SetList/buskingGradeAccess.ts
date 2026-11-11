import { GRADE_ORDER, GRADE_SYSTEM } from '../AdminTypes';
import { getGradeEmoji } from '../../utils/gradeDisplay';

const SATURN_INDEX = (GRADE_ORDER as readonly string[]).indexOf(GRADE_SYSTEM.SATURN);

/** 순서 등급과 별개로 새 버스킹을 열 수 있는 등급. 은하는 토성 이상에도 포함된다. */
const HOST_GRADE_EXTRAS = new Set<string>([GRADE_SYSTEM.GALAXY, GRADE_SYSTEM.STAR]);

const DUET_PROPOSER_GRADES = new Set<string>([
  GRADE_SYSTEM.EARTH,
  GRADE_SYSTEM.SATURN,
  GRADE_SYSTEM.SUN,
]);

/** 활동기간 1년(365일) 이상 */
export const BUSKING_HOST_MIN_ACTIVITY_DAYS = 365;

/** 평가 합격곡 10곡 이상 */
export const BUSKING_HOST_MIN_APPROVED_SONGS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function hasGrade(grade: string | null | undefined): boolean {
  return Boolean(grade && String(grade).trim());
}

/** 토성·태양·초승달·은하·별 — 새 버스킹을 열 수 있는 등급 */
export function canHostBuskingByGrade(grade: string | null | undefined): boolean {
  if (!hasGrade(grade)) return false;
  const emoji = getGradeEmoji(grade);
  if (HOST_GRADE_EXTRAS.has(emoji)) return true;
  if (SATURN_INDEX < 0) return false;
  const index = (GRADE_ORDER as readonly string[]).indexOf(emoji);
  return index >= SATURN_INDEX;
}

/** 활동기간 1년 이상이고 평가 합격곡이 10곡 이상이면 새 버스킹을 열 수 있다 */
export function canHostBuskingByActivity(
  createdAtMs: number | null | undefined,
  approvedSongCount: number | null | undefined,
  nowMs = Date.now()
): boolean {
  if (createdAtMs == null || !Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  if (approvedSongCount == null || !Number.isFinite(approvedSongCount)) return false;
  const activityDays = Math.floor((nowMs - createdAtMs) / DAY_MS);
  return (
    activityDays >= BUSKING_HOST_MIN_ACTIVITY_DAYS &&
    approvedSongCount >= BUSKING_HOST_MIN_APPROVED_SONGS
  );
}

/** 지구·토성·태양만 듀엣을 제안할 수 있다 */
export function canProposeBuskingDuet(grade: string | null | undefined): boolean {
  if (!hasGrade(grade)) return false;
  return DUET_PROPOSER_GRADES.has(getGradeEmoji(grade));
}
