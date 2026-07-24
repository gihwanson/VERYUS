/** 본인 포함 예약 인원에 따른 최대 연습 시간(시간) */
export function getMaxHoursByParticipantCount(participantCount: number): number {
  // 2~3명 → 최대 2시간, 4명 이상 → 최대 3시간
  if (participantCount >= 4) return 3;
  return 2;
}
