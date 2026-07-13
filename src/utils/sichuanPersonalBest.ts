const PB_KEY = 'veryus_sichuan_solo_pb';

export interface SichuanSoloPersonalBest {
  bestTimeSec: number;
  bestScore: number;
  updatedAtMs: number;
}

export const loadSichuanSoloPb = (): SichuanSoloPersonalBest | null => {
  try {
    const raw = localStorage.getItem(PB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SichuanSoloPersonalBest;
    if (
      typeof parsed.bestTimeSec !== 'number' ||
      typeof parsed.bestScore !== 'number' ||
      parsed.bestTimeSec < 0 ||
      parsed.bestScore < 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const saveSichuanSoloPbIfBetter = (params: {
  timeSec: number;
  score: number;
  cleared: boolean;
}): { pb: SichuanSoloPersonalBest; isNewTime: boolean; isNewScore: boolean } | null => {
  if (!params.cleared || params.timeSec <= 0) return null;
  const prev = loadSichuanSoloPb();
  const isNewTime = !prev || params.timeSec < prev.bestTimeSec;
  const isNewScore = !prev || params.score > prev.bestScore;
  if (!isNewTime && !isNewScore && prev) {
    return { pb: prev, isNewTime: false, isNewScore: false };
  }
  const next: SichuanSoloPersonalBest = {
    bestTimeSec: isNewTime ? params.timeSec : (prev?.bestTimeSec ?? params.timeSec),
    bestScore: isNewScore ? params.score : (prev?.bestScore ?? params.score),
    updatedAtMs: Date.now(),
  };
  try {
    localStorage.setItem(PB_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return { pb: next, isNewTime, isNewScore };
};

export const formatSichuanTime = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
