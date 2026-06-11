export type GamePlatform = 'pc' | 'mobile';

/**
 * PC/모바일 구분.
 * - 터치 전용 기기(휴대폰·태블릿)는 가로 모드여도 모바일
 * - 터치스크린 노트북은 (pointer: fine)이 있으면 PC로 처리
 */
export const detectGamePlatform = (): GamePlatform => {
  const narrow = window.innerWidth <= 768;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const touchOnly = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (touchOnly) return 'mobile';
  if (hasFinePointer && !narrow) return 'pc';
  if (narrow && hasCoarsePointer && !hasFinePointer) return 'mobile';
  if (narrow && !hasFinePointer) return 'mobile';
  return 'pc';
};

export const isTouchPrimaryDevice = (): boolean =>
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;
