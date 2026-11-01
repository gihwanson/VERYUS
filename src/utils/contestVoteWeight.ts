import { GRADE_SYSTEM } from '../components/AdminTypes';
import { getGradeEmoji } from './gradeDisplay';

/** 콘테스트 평가 1표당 가중치 (체리·딸기·초승달 = 1 기준, 고등급일수록 귀의 힘을 크게) */
export const CONTEST_EVALUATOR_VOTE_WEIGHT: Record<string, number> = {
  [GRADE_SYSTEM.CHERRY]: 1,
  [GRADE_SYSTEM.STRAWBERRY]: 1,
  [GRADE_SYSTEM.CRESCENT]: 1,
  [GRADE_SYSTEM.APPLE]: 2,
  [GRADE_SYSTEM.MELON]: 3,
  [GRADE_SYSTEM.WATERMELON]: 4,
  [GRADE_SYSTEM.EARTH]: 5,
  [GRADE_SYSTEM.SATURN]: 6,
  [GRADE_SYSTEM.SUN]: 7,
  [GRADE_SYSTEM.GALAXY]: 7,
};

const DEFAULT_VOTE_WEIGHT = 1;

export function getContestEvaluatorVoteWeight(grade: string | undefined | null): number {
  const emoji = getGradeEmoji(grade);
  return CONTEST_EVALUATOR_VOTE_WEIGHT[emoji] ?? DEFAULT_VOTE_WEIGHT;
}

export function formatContestWeight(weight: number): string {
  const rounded = Math.round(weight * 100) / 100;
  return String(rounded);
}

export function formatContestVoteWeightLabel(grade: string | undefined | null): string {
  const w = getContestEvaluatorVoteWeight(grade);
  return `가중치 ${formatContestWeight(w)}`;
}
