const STORAGE_KEY = 'veryus_game_sound';

let audioCtx: AudioContext | null = null;

export const setGameSoundEnabled = (on: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
};

export const isGameSoundEnabled = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const unlockGameAudio = (): void => {
  const c = ctx();
  if (c?.state === 'suspended') void c.resume();
};

const enabled = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

const ctx = (): AudioContext | null => {
  if (!enabled()) return null;
  if (!audioCtx && typeof window !== 'undefined') {
    audioCtx = new AudioContext();
  }
  return audioCtx;
};

const tone = (freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.07) => {
  const c = ctx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(c.destination);
  const t = c.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
};

export const gameVibrate = (pattern: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
};

export const playCountdownTick = () => tone(440, 0.08, 'sine', 0.06);

export const playCountdownGo = () => {
  tone(523, 0.1);
  window.setTimeout(() => tone(784, 0.14, 'triangle', 0.08), 80);
};

export const playReactionGo = () => {
  tone(880, 0.14, 'square', 0.06);
  gameVibrate(12);
};

export const playReactionFalseStart = () => {
  tone(160, 0.22, 'sawtooth', 0.07);
  gameVibrate([30, 40, 30]);
};

export const playReactionSuccess = (ms: number) => {
  const fast = ms < 250;
  tone(fast ? 784 : 523, 0.1, 'triangle', 0.07);
  window.setTimeout(() => tone(fast ? 1046 : 659, 0.12, 'triangle', 0.06), 70);
  gameVibrate(fast ? [8, 12, 8] : 10);
};

export const playGameComplete = () => {
  [523, 659, 784].forEach((f, i) => {
    window.setTimeout(() => tone(f, 0.16, 'triangle', 0.07), i * 85);
  });
  gameVibrate([10, 20, 10]);
};

export const playNewRecord = () => {
  [659, 784, 988, 1174].forEach((f, i) => {
    window.setTimeout(() => tone(f, 0.18, 'triangle', 0.08), i * 75);
  });
  gameVibrate([15, 30, 15, 30]);
};

export const playTypingError = () => {
  tone(200, 0.06, 'square', 0.04);
  gameVibrate(8);
};
