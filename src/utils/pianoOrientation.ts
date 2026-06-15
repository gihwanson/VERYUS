const ROOT_CLASS = 'piano-landscape-active';
const PORTRAIT_EMULATE_CLASS = 'piano-portrait-emulated';
const REVERSE_EMULATE_CLASS = 'piano-emulated-reverse';
const FLIP_PREF_KEY = 'piano_landscape_flip';

type OrientationLockType = 'landscape' | 'landscape-primary' | 'landscape-secondary';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

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

export const isFullscreenActive = (): boolean => {
  if (typeof document === 'undefined') return false;
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

/** landscape-primary / secondary 중 사용자가 뒤집은 방향 저장 */
const saveLandscapeFlipPreference = (): void => {
  try {
    const type = screen.orientation?.type;
    if (type === 'landscape-secondary') {
      sessionStorage.setItem(FLIP_PREF_KEY, 'secondary');
    } else if (type === 'landscape-primary') {
      sessionStorage.setItem(FLIP_PREF_KEY, 'primary');
    }
  } catch {
    /* ignore */
  }
};

const getStoredFlipPreference = (): 'primary' | 'secondary' | null => {
  try {
    const v = sessionStorage.getItem(FLIP_PREF_KEY);
    return v === 'secondary' || v === 'primary' ? v : null;
  } catch {
    return null;
  }
};

/** 세로 화면 CSS 가로 에뮬레이션 시 -90° 회전 여부 */
export const shouldReverseEmulatedLandscape = (): boolean => {
  const type = screen.orientation?.type;
  if (type === 'landscape-secondary') return true;
  if (type === 'landscape-primary') return false;
  return getStoredFlipPreference() === 'secondary';
};

export const lockPianoLandscape = async (): Promise<boolean> => {
  if (!isTouchPrimaryDevice()) return false;

  await requestPianoFullscreen();
  await delay(80);

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (type: OrientationLockType) => Promise<void>;
  };

  // landscape만 사용 — primary/secondary 고정 없이 뒤집기로 방향 선택
  if (orientation?.lock) {
    try {
      await orientation.lock('landscape');
      return true;
    } catch {
      /* fallback */
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

export const shouldEmulatePianoLandscape = (): boolean => {
  if (isLandscapeViewport()) return false;
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

  const emulate = shouldEmulatePianoLandscape();
  document.documentElement.classList.toggle(PORTRAIT_EMULATE_CLASS, emulate);

  if (emulate) {
    document.documentElement.classList.toggle(
      REVERSE_EMULATE_CLASS,
      shouldReverseEmulatedLandscape()
    );
  } else {
    document.documentElement.classList.remove(REVERSE_EMULATE_CLASS);
    saveLandscapeFlipPreference();
  }
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
  document.documentElement.classList.remove(ROOT_CLASS, PORTRAIT_EMULATE_CLASS, REVERSE_EMULATE_CLASS);
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, savedScrollY);
  exitPianoFullscreen();
};
