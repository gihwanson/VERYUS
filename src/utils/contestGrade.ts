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

/** 적용 점수: 전체평균·중심평균 중 더 낮은 값. 등급을 보수적으로 잡기 위함. */
export function pickApplyContestMean(
  overallMean: number | null | undefined,
  clusterMean: number | null | undefined
): number | null {
  const values = [overallMean, clusterMean].filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n)
  );
  if (values.length === 0) return null;
  return Math.min(...values);
}

/** 표·좁은 칸용 — 이모지만 (한글명은 title/aria-label에) */
export function getContestGradeEmojiFromScore(score: number): string {
  const full = getContestGradeFromScore(score);
  if (!full) return '';
  const [emoji] = full.split(' ');
  return emoji ?? '';
}
