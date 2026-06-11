const STORAGE_KEY = 'veryus_defense_sound';

let audioCtx: AudioContext | null = null;

const enabled = (): boolean => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw !== 'off';
  } catch {
    return true;
  }
};

export const setDefenseSoundEnabled = (on: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
};

export const isDefenseSoundEnabled = (): boolean => enabled();

const ctx = (): AudioContext | null => {
  if (!enabled()) return null;
  if (!audioCtx && typeof window !== 'undefined') {
    audioCtx = new AudioContext();
  }
  return audioCtx;
};

const tone = (freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.08) => {
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

export const playSpawnSound = () => {
  tone(440, 0.12);
  window.setTimeout(() => tone(660, 0.1), 60);
};

export const playUpgradeSound = () => {
  tone(523, 0.1);
  window.setTimeout(() => tone(784, 0.12), 70);
  window.setTimeout(() => tone(1046, 0.14), 140);
};

export const playKillSound = () => {
  tone(320, 0.06, 'square', 0.05);
};

export const playWinSound = () => {
  [523, 659, 784, 1046].forEach((f, i) => {
    window.setTimeout(() => tone(f, 0.18, 'triangle', 0.07), i * 90);
  });
};

export const playWarnSound = () => {
  tone(180, 0.2, 'sawtooth', 0.06);
};

export const playBaseHitSound = () => {
  tone(120, 0.14, 'sawtooth', 0.07);
  window.setTimeout(() => tone(90, 0.18, 'square', 0.05), 80);
};

export const unlockDefenseAudio = (): void => {
  const c = ctx();
  if (c?.state === 'suspended') void c.resume();
};
