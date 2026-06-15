const ROOT_CLASS = 'piano-landscape-active';
const PORTRAIT_EMULATE_CLASS = 'piano-portrait-emulated';

type OrientationLockType = 'landscape' | 'landscape-primary' | 'landscape-secondary';

const lockTypes: OrientationLockType[] = ['landscape-primary', 'landscape', 'landscape-secondary'];

type FullscreenCapable = HTMLElement & {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

type LegacyScreen = Screen & {
  lockOrientation?: (orientation: string) => boolean;
  mozLockOrientation?: (orientation: string) => boolean;
  msLockOrientation?: (orientation: string) => boolean;
  unlockOrientation?: () => void;
  mozUnlockOrientation?: () => void;
  msUnlockOrientation?: () => void;
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isFullscreenActive = (): boolean => {
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
};

/** Chrome/Android 등에서 orientation.lock 전에 필요한 전체화면 진입 */
export const requestPianoFullscreen = async (): Promise<boolean> => {
  if (typeof document === 'undefined') return false;
  if (isFullscreenActive()) return true;

  const el = document.documentElement as FullscreenCapable;
  const attempts: Array<() => Promise<void>> = [];
  if (el.requestFullscreen) attempts.push(() => el.requestFullscreen!());
  if (el.webkitRequestFullscreen) attempts.push(() => el.webkitRequestFullscreen!());

  for (const attempt of attempts) {
    try {
      await attempt();
      if (isFullscreenActive()) return true;
    } catch {
      /* try next */
    }
  }
  return false;
};

export const exitPianoFullscreen = (): void => {
  if (typeof document === 'undefined') return;
  try {
    const doc = document as FullscreenDocument;
    if (doc.fullscreenElement) {
      void doc.exitFullscreen();
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      void doc.webkitExitFullscreen();
    }
  } catch {
    /* ignore */
  }
};

const lockOrientationLegacy = (): boolean => {
  const legacy = screen as LegacyScreen;
  return (
    legacy.lockOrientation?.('landscape') ||
    legacy.mozLockOrientation?.('landscape') ||
    legacy.msLockOrientation?.('landscape') ||
    false
  );
};

const unlockOrientationLegacy = (): void => {
  const legacy = screen as LegacyScreen;
  legacy.unlockOrientation?.();
  legacy.mozUnlockOrientation?.();
  legacy.msUnlockOrientation?.();
};

export const lockPianoLandscape = async (): Promise<boolean> => {
  // PC(마우스·키보드)에서는 전체화면·방향 고정을 시도하지 않음
  if (!isTouchPrimaryDevice()) return false;

  await requestPianoFullscreen();
  await delay(80);

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (type: OrientationLockType) => Promise<void>;
  };

  if (orientation?.lock) {
    for (const type of lockTypes) {
      try {
        await orientation.lock(type);
        return true;
      } catch {
        /* try next */
      }
    }
  }

  return lockOrientationLegacy();
};

export const unlockPianoLandscape = (): void => {
  try {
    screen.orientation?.unlock();
  } catch {
    /* ignore */
  }
  unlockOrientationLegacy();
  exitPianoFullscreen();
};

export const isLandscapeViewport = (): boolean =>
  window.matchMedia('(orientation: landscape)').matches ||
  window.innerWidth > window.innerHeight;

/** 세로 뷰포트일 때 CSS로 가로 레이아웃을 강제할지 */
export const shouldEmulatePianoLandscape = (): boolean => {
  if (isLandscapeViewport()) return false;
  // 터치 기기 또는 좁은 화면(모바일 폭)에서는 가로 UI 강제
  if (isTouchPrimaryDevice()) return true;
  return window.innerWidth < 900;
};

export const isCoarsePointerDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
};

export const isTouchPrimaryDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return isCoarsePointerDevice() || navigator.maxTouchPoints > 1;
};

let savedScrollY = 0;

export const syncPianoOrientationClasses = (): void => {
  if (!document.documentElement.classList.contains(ROOT_CLASS)) return;
  document.documentElement.classList.toggle(PORTRAIT_EMULATE_CLASS, shouldEmulatePianoLandscape());
};

export const enablePianoLandscapeMode = (): void => {
  savedScrollY = window.scrollY;
  document.documentElement.classList.add(ROOT_CLASS);
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  syncPianoOrientationClasses();
};

export const disablePianoLandscapeMode = (): void => {
  document.documentElement.classList.remove(ROOT_CLASS, PORTRAIT_EMULATE_CLASS);
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, savedScrollY);
  exitPianoFullscreen();
};
