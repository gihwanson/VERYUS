export type FlappyGrade = {
  label: string;
  emoji: string;
  tone: 'legend' | 'great' | 'good' | 'ok' | 'slow';
};

export const getFlappyGrade = (score: number): FlappyGrade => {
  if (score >= 30) return { label: '전설의 새', emoji: '🦅', tone: 'legend' };
  if (score >= 20) return { label: '하늘의 지배자', emoji: '🌟', tone: 'great' };
  if (score >= 10) return { label: '숙련 파일럿', emoji: '🐦', tone: 'good' };
  if (score >= 5) return { label: '견습 조종사', emoji: '🪶', tone: 'ok' };
  return { label: '연습 필요', emoji: '🥚', tone: 'slow' };
};
