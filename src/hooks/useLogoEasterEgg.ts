import { useCallback, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  getGradeFxSkin,
  isGradeFxUnlocked,
  setEquippedGradeFxId,
  unlockGradeFxSkin,
} from '../utils/gradeFxSkins';

const TAP_TARGET = 7;
const TAP_WINDOW_MS = 2000;
const COOLDOWN_MS = 8000;
const EASTER_EGG_SKIN_ID = 'cherry-aura' as const;

export function useLogoEasterEgg(nickname?: string | null) {
  const [isRaining, setIsRaining] = useState(false);
  const tapCountRef = useRef(0);
  const windowStartRef = useRef(0);
  const cooldownUntilRef = useRef(0);

  const stopRain = useCallback(() => {
    setIsRaining(false);
  }, []);

  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    if (now < cooldownUntilRef.current || isRaining) return;

    if (now - windowStartRef.current > TAP_WINDOW_MS) {
      tapCountRef.current = 0;
      windowStartRef.current = now;
    }

    tapCountRef.current += 1;

    if (tapCountRef.current < TAP_TARGET) return;

    tapCountRef.current = 0;
    windowStartRef.current = 0;
    cooldownUntilRef.current = now + COOLDOWN_MS;
    setIsRaining(true);

    const skin = getGradeFxSkin(EASTER_EGG_SKIN_ID);
    const alreadyOwned = isGradeFxUnlocked(EASTER_EGG_SKIN_ID, nickname);
    const newlyUnlocked = unlockGradeFxSkin(EASTER_EGG_SKIN_ID);

    if (newlyUnlocked || !alreadyOwned) {
      setEquippedGradeFxId(EASTER_EGG_SKIN_ID);
      toast(`✨ ${skin?.acquireLabel ?? '스킨'}을 획득했어요!`, {
        autoClose: 2800,
        hideProgressBar: true,
      });
    } else {
      toast(`✨ ${skin?.acquireLabel ?? '스킨'} 보유 중`, {
        autoClose: 2200,
        hideProgressBar: true,
      });
    }
  }, [isRaining, nickname]);

  return { isRaining, handleLogoTap, stopRain };
}
