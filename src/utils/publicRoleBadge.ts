const EVALUATOR_LABEL = '평가자';
const ADMIN_LABEL = '운영진';
const MEMBER_LABEL = '일반';

const normalize = (value?: string): string => (value || '').trim();

const isEvaluator = (role?: string, position?: string): boolean => {
  return normalize(role) === EVALUATOR_LABEL || normalize(position) === EVALUATOR_LABEL;
};

export const getPublicRoleBadge = (role?: string, position?: string): string => {
  const normalizedRole = normalize(role);
  const normalizedPosition = normalize(position);
  if (isEvaluator(role, position)) {
    return normalizedRole === ADMIN_LABEL || normalizedPosition === ADMIN_LABEL ? ADMIN_LABEL : MEMBER_LABEL;
  }
  return normalizedRole || MEMBER_LABEL;
};

export const shouldShowPublicPosition = (position?: string): boolean => {
  const normalizedPosition = normalize(position);
  return Boolean(normalizedPosition) && normalizedPosition !== EVALUATOR_LABEL;
};
