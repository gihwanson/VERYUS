import * as Tone from 'tone';

const VOLUME_KEY = 'veryus_piano_volume';
const MUTE_KEY = 'veryus_piano_mute';
const OCTAVE_KEY = 'veryus_piano_octave';
/** 로컬 호스팅 (오프라인·CDN 장애 대비), 실패 시 CDN 폴백 */
const SALAMANDER_LOCAL = '/audio/salamander/';
const SALAMANDER_CDN = 'https://tonejs.github.io/audio/salamander/';

/** Salamander Grand Piano — 3도 간격 멀티샘플 */
const SALAMANDER_URLS: Record<string, string> = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3',
};

export type PianoAudioState = 'idle' | 'loading' | 'ready' | 'error';

let masterVolume = 0.75;
let muted = false;

try {
  const savedVol = localStorage.getItem(VOLUME_KEY);
  if (savedVol !== null) masterVolume = Math.max(0, Math.min(1, Number(savedVol)));
  muted = localStorage.getItem(MUTE_KEY) === 'on';
} catch {
  /* ignore */
}

interface Voice {
  id: number;
  midi: number;
  note: string;
}

let sampler: Tone.Sampler | null = null;
let reverb: Tone.Reverb | null = null;
let masterGain: Tone.Volume | null = null;
let audioState: PianoAudioState = 'idle';
let initPromise: Promise<void> | null = null;

let voiceCounter = 0;
const voicesById = new Map<number, Voice>();
const activeMidiCounts = new Map<number, number>();

let loadProgress = 0;

const midiToNote = (midi: number): string => Tone.Frequency(midi, 'midi').toNote();

export const getPianoLoadProgress = (): number => loadProgress;

const syncMasterGain = (): void => {
  if (!masterGain) return;
  masterGain.volume.value = Tone.gainToDb(muted ? 0 : masterVolume);
};

const createSampler = (baseUrl: string): Tone.Sampler =>
  new Tone.Sampler({
    urls: SALAMANDER_URLS,
    baseUrl,
    attack: 0,
    release: 1.4,
    onerror: (err) => {
      console.error('Piano sample load error:', err);
    },
  });

const resolveSampleBaseUrl = async (): Promise<string> => {
  try {
    const res = await fetch(`${SALAMANDER_LOCAL}C4.mp3`, { method: 'HEAD' });
    if (res.ok) return SALAMANDER_LOCAL;
  } catch {
    /* fall through */
  }
  return SALAMANDER_CDN;
};

const initEngine = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (audioState === 'ready' && sampler) return;

  audioState = 'loading';
  loadProgress = 0;

  await Tone.start();
  loadProgress = 0.15;

  reverb = new Tone.Reverb({
    decay: 3.2,
    wet: 0.25,
    preDelay: 0.02,
  });
  await reverb.generate();
  loadProgress = 0.3;

  masterGain = new Tone.Volume(Tone.gainToDb(muted ? 0 : masterVolume));
  masterGain.chain(reverb, Tone.getDestination());

  const baseUrl = await resolveSampleBaseUrl();
  loadProgress = 0.4;

  sampler = createSampler(baseUrl).connect(masterGain);
  await Tone.loaded();
  loadProgress = 1;
  audioState = 'ready';
};

const disposeEngine = (): void => {
  stopAllPianoNotes();
  sampler?.dispose();
  reverb?.dispose();
  masterGain?.dispose();
  sampler = null;
  reverb = null;
  masterGain = null;
  audioState = 'idle';
  initPromise = null;
  loadProgress = 0;
};

export const disposePianoAudio = (): void => {
  if (typeof window === 'undefined') return;
  disposeEngine();
};

const ensureEngine = (): Promise<void> => {
  if (audioState === 'ready') return Promise.resolve();
  if (!initPromise) {
    initPromise = initEngine().catch((err) => {
      audioState = 'error';
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
};

export const getPianoAudioState = (): PianoAudioState => audioState;

export const preloadPianoAudio = (): Promise<void> => ensureEngine();

export const unlockPianoAudio = (): void => {
  void ensureEngine();
};

export const getPianoVolume = (): number => masterVolume;
export const isPianoMuted = (): boolean => muted;

export const getSavedOctaveShift = (fallback = 0): number => {
  try {
    const saved = localStorage.getItem(OCTAVE_KEY);
    if (saved === null) return fallback;
    const n = Number(saved);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

export const saveOctaveShift = (shift: number): void => {
  try {
    localStorage.setItem(OCTAVE_KEY, String(shift));
  } catch {
    /* ignore */
  }
};

export const setPianoVolume = (value: number): void => {
  masterVolume = Math.max(0, Math.min(1, value));
  try {
    localStorage.setItem(VOLUME_KEY, String(masterVolume));
  } catch {
    /* ignore */
  }
  syncMasterGain();
};

export const setPianoMuted = (on: boolean): void => {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  syncMasterGain();
};

export const midiToLabel = (midi: number): string => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
};

const clampVelocity = (v: number): number => Math.max(0.35, Math.min(1, v));

const triggerAttack = (midi: number, velocity = 0.88): void => {
  if (!sampler) return;
  const note = midiToNote(midi);
  const prev = activeMidiCounts.get(midi) ?? 0;
  activeMidiCounts.set(midi, prev + 1);
  if (prev === 0) {
    sampler.triggerAttack(note, Tone.now(), clampVelocity(velocity));
  }
};

/** 건반 누름 — voice id 반환 */
export const startPianoNote = (midi: number, velocity = 0.88): number | null => {
  if (typeof window === 'undefined') return null;

  const id = ++voiceCounter;
  const note = midiToNote(midi);
  voicesById.set(id, { id, midi, note });

  const playIfActive = () => {
    if (!voicesById.has(id)) return;
    triggerAttack(midi, velocity);
  };

  if (audioState === 'ready' && sampler) {
    playIfActive();
  } else {
    void ensureEngine()
      .then(playIfActive)
      .catch(() => {
        voicesById.delete(id);
      });
  }

  return id;
};

/** 건반 뗌 */
export const stopPianoNote = (voiceId: number): void => {
  const voice = voicesById.get(voiceId);
  if (!voice) return;
  voicesById.delete(voiceId);

  if (!sampler || audioState !== 'ready') return;

  const prev = activeMidiCounts.get(voice.midi) ?? 1;
  const next = prev - 1;
  if (next <= 0) {
    activeMidiCounts.delete(voice.midi);
    sampler.triggerRelease(voice.note, Tone.now());
  } else {
    activeMidiCounts.set(voice.midi, next);
  }
};

export const stopAllPianoNotes = (): void => {
  if (sampler && audioState === 'ready') {
    const now = Tone.now();
    activeMidiCounts.forEach((_, midi) => {
      sampler!.triggerRelease(midiToNote(midi), now);
    });
  }
  voicesById.clear();
  activeMidiCounts.clear();
};
