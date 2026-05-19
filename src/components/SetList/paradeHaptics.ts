const canVibrate = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** 이전/다음·캐릭터 탭 */
export function paradeHapticNav(): void {
  if (!canVibrate()) return;
  navigator.vibrate(14);
}

/** 내 차례 진입 */
export function paradeHapticMyTurn(): void {
  if (!canVibrate()) return;
  navigator.vibrate([18, 36, 22]);
}

/** 곡 완료·축하 */
export function paradeHapticCelebrate(): void {
  if (!canVibrate()) return;
  navigator.vibrate([12, 28, 16, 28, 36]);
}

/** 원격 순서 변경 */
export function paradeHapticRemoteSync(): void {
  if (!canVibrate()) return;
  navigator.vibrate([8, 24, 8]);
}
