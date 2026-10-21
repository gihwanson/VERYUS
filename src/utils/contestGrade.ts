import { GRADE_NAMES, GRADE_SYSTEM } from '../components/AdminTypes';

/** 콘테스트·등급전 점수(0~100) → 등급. 범위 밖이면 빈 문자열 */
export function getContestGradeFromScore(score: number): string {
  if (!Number.isFinite(score) || score < 0 || score > 100) return '';
  const emoji =
    score <= 30
      ? GRADE_SYSTEM.APPLE
      : score <= 60
        ? GRADE_SYSTEM.MELON
        : score <= 70
          ? GRADE_SYSTEM.WATERMELON
          : score <= 80
            ? GRADE_SYSTEM.EARTH
            : score <= 90
              ? GRADE_SYSTEM.SATURN
              : GRADE_SYSTEM.SUN;
  return `${emoji} ${GRADE_NAMES[emoji]}`;
}
