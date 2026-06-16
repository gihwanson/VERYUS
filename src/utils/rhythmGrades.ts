export type RhythmGrade = {
  label: string;
  emoji: string;
  tone: 'legend' | 'great' | 'good' | 'ok' | 'slow';
};

export const getRhythmGrade = (accuracy: number): RhythmGrade => {
  if (accuracy >= 95) return { label: '완벽에 가까움', emoji: '🎵', tone: 'legend' };
  if (accuracy >= 85) return { label: '리듬감 좋음', emoji: '🥁', tone: 'great' };
  if (accuracy >= 70) return { label: '양호', emoji: '👍', tone: 'good' };
  if (accuracy >= 50) return { label: '보통', emoji: '🙂', tone: 'ok' };
  return { label: '연습 필요', emoji: '🎼', tone: 'slow' };
};
