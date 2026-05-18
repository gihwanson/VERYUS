/** 게시판 목록 스크롤 복원 (sessionStorage 키) */
export const BOARD_LIST_SCROLL_KEYS: Record<string, string> = {
  '/free': 'veryus_free_list_state_v1',
  '/recording': 'veryus_recording_list_state_v1',
  '/evaluation': 'veryus_evaluation_list_state_v1',
  '/boards/partner': 'veryus_partner_list_state_v1'
};

export function isBoardListPath(pathname: string): boolean {
  return (
    pathname === '/free' ||
    pathname === '/recording' ||
    pathname === '/evaluation' ||
    pathname === '/boards/partner'
  );
}

export function getBoardListScrollKey(pathname: string): string | null {
  if (pathname === '/free') return BOARD_LIST_SCROLL_KEYS['/free'];
  if (pathname === '/recording') return BOARD_LIST_SCROLL_KEYS['/recording'];
  if (pathname === '/evaluation') return BOARD_LIST_SCROLL_KEYS['/evaluation'];
  if (pathname === '/boards/partner') return BOARD_LIST_SCROLL_KEYS['/boards/partner'];
  return null;
}

export function readSavedListScrollY(pathname: string): number | null {
  const key = getBoardListScrollKey(pathname);
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scrollY?: number };
    return typeof parsed.scrollY === 'number' && parsed.scrollY > 0 ? parsed.scrollY : null;
  } catch {
    return null;
  }
}

export function shouldSkipRouteScrollReset(
  pathname: string,
  navigationType: 'POP' | 'PUSH' | 'REPLACE',
  locationState: unknown
): boolean {
  if (Boolean((locationState as { preserveScroll?: boolean } | null)?.preserveScroll)) {
    return true;
  }
  // 모바일 제스처/브라우저 뒤로가기(POP) — 목록 스크롤 유지
  if (navigationType === 'POP' && isBoardListPath(pathname)) {
    return true;
  }
  return false;
}

/** 모바일에서 레이아웃·이미지 로드 후 스크롤 위치 재시도 */
export function scheduleScrollRestore(
  targetY: number,
  onComplete: () => void,
  attempt = 0
): void {
  const maxAttempts = 16;
  window.scrollTo({ top: targetY, behavior: 'auto' });

  requestAnimationFrame(() => {
    const currentY = window.scrollY || window.pageYOffset || 0;
    const reached = currentY >= targetY - 32 || targetY <= 32;
    if (reached || attempt >= maxAttempts) {
      onComplete();
      return;
    }
    window.setTimeout(() => scheduleScrollRestore(targetY, onComplete, attempt + 1), 60);
  });
}
