import { GRADE_ORDER, GRADE_SYSTEM } from '../AdminTypes';
import { getGradeEmoji } from '../../utils/gradeDisplay';

const SATURN_INDEX = (GRADE_ORDER as readonly string[]).indexOf(GRADE_SYSTEM.SATURN);

const DUET_PROPOSER_GRADES = new Set<string>([
  GRADE_SYSTEM.EARTH,
  GRADE_SYSTEM.SATURN,
  GRADE_SYSTEM.SUN,
]);

const DUET_PARTNER_GRADES = new Set<string>([
  GRADE_SYSTEM.APPLE,
  GRADE_SYSTEM.MELON,
  GRADE_SYSTEM.WATERMELON,
]);

function hasGrade(grade: string | null | undefined): boolean {
  return Boolean(grade && String(grade).trim());
}

/** 토성·태양·초승달·은하 — 새 버스킹을 열 수 있는 등급 */
export function canHostBuskingByGrade(grade: string | null | undefined): boolean {
  if (!hasGrade(grade) || SATURN_INDEX < 0) return false;
  const index = (GRADE_ORDER as readonly string[]).indexOf(getGradeEmoji(grade));
  return index >= SATURN_INDEX;
}

/** 지구·토성·태양만 듀엣을 제안할 수 있다 */
export function canProposeBuskingDuet(grade: string | null | undefined): boolean {
  if (!hasGrade(grade)) return false;
  return DUET_PROPOSER_GRADES.has(getGradeEmoji(grade));
}

/** 듀엣 제안 상대 — 사과·멜론·수박 */
export function isDuetPartnerGrade(grade: string | null | undefined): boolean {
  if (!hasGrade(grade)) return false;
  return DUET_PARTNER_GRADES.has(getGradeEmoji(grade));
}
