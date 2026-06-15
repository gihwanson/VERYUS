import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  disablePianoLandscapeMode,
  enablePianoLandscapeMode,
  lockPianoLandscape,
  shouldEmulatePianoLandscape,
  syncPianoOrientationClasses,
  unlockPianoLandscape,
} from '../utils/pianoOrientation';

export interface PianoLandscapeState {
  /** 실제 기기는 세로지만 CSS로 가로 UI를 보여주는 상태 */
  isEmulatedLandscape: boolean;
  refresh: () => void;
}

export const usePianoLandscape = (): PianoLandscapeState => {
  const [isEmulatedLandscape, setIsEmulatedLandscape] = useState(shouldEmulatePianoLandscape);

  const refresh = useCallback(() => {
    syncPianoOrientationClasses();
    setIsEmulatedLandscape(shouldEmulatePianoLandscape());
  }, []);

  useLayoutEffect(() => {
    enablePianoLandscapeMode();
    syncPianoOrientationClasses();
    setIsEmulatedLandscape(shouldEmulatePianoLandscape());
    // 메뉴 탭 직후 마운트 구간에서 방향 고정 시도 (Android 등)
    void lockPianoLandscape().then(() => refresh());
  }, [refresh]);

  useEffect(() => {
    const sync = () => refresh();

    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    document.addEventListener('fullscreenchange', sync);

    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      document.removeEventListener('fullscreenchange', sync);
      unlockPianoLandscape();
      disablePianoLandscapeMode();
    };
  }, [refresh]);

  return { isEmulatedLandscape, refresh };
};
