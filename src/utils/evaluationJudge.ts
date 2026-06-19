export const EVALUATOR_ROLE = '평가자';

export interface EvaluationUserLike {
  nickname?: string;
  role?: string;
}

export const isEvaluationJudge = (user: EvaluationUserLike | null | undefined): boolean => {
  if (!user) return false;
  const normalizedRole = (user.role || '').trim();
  return user.nickname === '너래' || normalizedRole === EVALUATOR_ROLE;
};
