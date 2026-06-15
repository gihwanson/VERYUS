import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  disablePianoLandscapeMode,
  enablePianoLandscapeMode,
  isFullscreenActive,
  isTouchPrimaryDevice,
  lockPianoLandscape,
  shouldEmulatePianoLandscape,
  shouldReverseEmulatedLandscape,
  syncPianoOrientationClasses,
  unlockPianoLandscape,
} from '../utils/pianoOrientation';

export interface PianoLandscapeState {
  isEmulatedLandscape: boolean;
  isReverseEmulation: boolean;
  refresh: () => void;
}

export const usePianoLandscape = (onExitFullscreen?: () => void): PianoLandscapeState => {
  const [isEmulatedLandscape, setIsEmulatedLandscape] = useState(shouldEmulatePianoLandscape);
  const [isReverseEmulation, setIsReverseEmulation] = useState(shouldReverseEmulatedLandscape);

  const refresh = useCallback(() => {
    syncPianoOrientationClasses();
    setIsEmulatedLandscape(shouldEmulatePianoLandscape());
    setIsReverseEmulation(shouldReverseEmulatedLandscape());
  }, []);

  useLayoutEffect(() => {
    enablePianoLandscapeMode();
    syncPianoOrientationClasses();
    setIsEmulatedLandscape(shouldEmulatePianoLandscape());
    setIsReverseEmulation(shouldReverseEmulatedLandscape());
    void lockPianoLandscape().then(() => refresh());
  }, [refresh]);

  useEffect(() => {
    const sync = () => refresh();

    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    let wasFullscreen = isFullscreenActive();
    const onFullscreenChange = () => {
      const now = isFullscreenActive();
      if (wasFullscreen && !now && isTouchPrimaryDevice()) {
        onExitFullscreen?.();
      }
      wasFullscreen = now;
      sync();
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      unlockPianoLandscape();
      disablePianoLandscapeMode();
    };
  }, [refresh, onExitFullscreen]);

  return { isEmulatedLandscape, isReverseEmulation, refresh };
};
