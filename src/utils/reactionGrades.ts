export type ReactionGrade = {
  label: string;
  emoji: string;
  tone: 'legend' | 'great' | 'good' | 'ok' | 'slow';
};

export const getReactionGrade = (ms: number): ReactionGrade => {
  if (ms < 180) return { label: '초고속', emoji: '⚡', tone: 'legend' };
  if (ms < 250) return { label: '매우 빠름', emoji: '🚀', tone: 'great' };
  if (ms < 350) return { label: '양호', emoji: '👍', tone: 'good' };
  if (ms < 500) return { label: '보통', emoji: '🙂', tone: 'ok' };
  return { label: '연습 필요', emoji: '🐢', tone: 'slow' };
};
