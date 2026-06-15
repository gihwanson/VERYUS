import * as Tone from 'tone';

const VOLUME_KEY = 'veryus_piano_volume';
const MUTE_KEY = 'veryus_piano_mute';
const INSTRUMENT_KEY = 'veryus_piano_instrument';
const OCTAVE_KEY = 'veryus_piano_octave';

const SALAMANDER_LOCAL = '/audio/salamander/';
const SALAMANDER_CDN = 'https://tonejs.github.io/audio/salamander/';
const TONEJS_INSTRUMENTS_CDN =
  'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples';

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

const TONEJS_SAMPLE_FILES: Record<Exclude<InstrumentId, 'piano'>, string[]> = {
  violin: [
    'A3.mp3', 'A4.mp3', 'A5.mp3', 'A6.mp3',
    'C4.mp3', 'C5.mp3', 'C6.mp3', 'C7.mp3',
    'E4.mp3', 'E5.mp3', 'E6.mp3',
    'G3.mp3', 'G4.mp3', 'G5.mp3', 'G6.mp3',
  ],
  cello: [
    'A2.mp3', 'A3.mp3', 'A4.mp3', 'As2.mp3', 'As3.mp3',
    'B2.mp3', 'B3.mp3', 'B4.mp3', 'C2.mp3', 'C3.mp3', 'C4.mp3', 'C5.mp3',
    'Cs3.mp3', 'Cs4.mp3', 'D2.mp3', 'D3.mp3', 'D4.mp3', 'Ds2.mp3', 'Ds3.mp3', 'Ds4.mp3',
    'E2.mp3', 'E3.mp3', 'E4.mp3', 'F2.mp3', 'F3.mp3', 'F4.mp3', 'Fs3.mp3', 'Fs4.mp3',
    'G2.mp3', 'G3.mp3', 'G4.mp3', 'Gs2.mp3', 'Gs3.mp3', 'Gs4.mp3',
  ],
  saxophone: [
    'A4.mp3', 'A5.mp3', 'As3.mp3', 'As4.mp3', 'B3.mp3', 'B4.mp3',
    'C4.mp3', 'C5.mp3', 'Cs3.mp3', 'Cs4.mp3', 'Cs5.mp3',
    'D3.mp3', 'D4.mp3', 'D5.mp3', 'Ds3.mp3', 'Ds4.mp3', 'Ds5.mp3',
    'E3.mp3', 'E4.mp3', 'E5.mp3', 'F3.mp3', 'F4.mp3', 'F5.mp3',
    'Fs3.mp3', 'Fs4.mp3', 'Fs5.mp3', 'G3.mp3', 'G4.mp3', 'G5.mp3',
    'Gs3.mp3', 'Gs4.mp3', 'Gs5.mp3',
  ],
  flute: [
    'A4.mp3', 'A5.mp3', 'A6.mp3',
    'C4.mp3', 'C5.mp3', 'C6.mp3', 'C7.mp3',
    'E4.mp3', 'E5.mp3', 'E6.mp3',
  ],
  trumpet: [
    'A3.mp3', 'A5.mp3', 'As4.mp3', 'C4.mp3', 'C6.mp3', 'D5.mp3', 'Ds4.mp3',
    'F3.mp3', 'F4.mp3', 'F5.mp3', 'G4.mp3',
  ],
};

export type InstrumentId = 'piano' | 'violin' | 'cello' | 'saxophone' | 'flute' | 'trumpet';

export interface InstrumentOption {
  id: InstrumentId;
  label: string;
  emoji: string;
}

export const INSTRUMENT_OPTIONS: InstrumentOption[] = [
  { id: 'piano', label: '피아노', emoji: '🎹' },
  { id: 'violin', label: '바이올린', emoji: '🎻' },
  { id: 'cello', label: '첼로', emoji: '🎻' },
  { id: 'saxophone', label: '색소폰', emoji: '🎷' },
  { id: 'flute', label: '플루트', emoji: '🪈' },
  { id: 'trumpet', label: '트럼펫', emoji: '🎺' },
];

interface InstrumentConfig {
  useSalamander?: boolean;
  release: number;
  reverbWet: number;
}

const INSTRUMENT_CONFIG: Record<InstrumentId, InstrumentConfig> = {
  piano: { useSalamander: true, release: 1.4, reverbWet: 0.25 },
  violin: { release: 1.8, reverbWet: 0.32 },
  cello: { release: 2.0, reverbWet: 0.28 },
  saxophone: { release: 1.2, reverbWet: 0.22 },
  flute: { release: 1.0, reverbWet: 0.18 },
  trumpet: { release: 0.9, reverbWet: 0.2 },
};

const ALL_INSTRUMENT_IDS = INSTRUMENT_OPTIONS.map((item) => item.id);

const isInstrumentId = (value: string): value is InstrumentId =>
  INSTRUMENT_OPTIONS.some((item) => item.id === value);

export type PianoAudioState = 'idle' | 'loading' | 'ready' | 'error';

let masterVolume = 0.75;
let muted = false;
let activeInstrument: InstrumentId = 'piano';

try {
  const savedVol = localStorage.getItem(VOLUME_KEY);
  if (savedVol !== null) masterVolume = Math.max(0, Math.min(1, Number(savedVol)));
  muted = localStorage.getItem(MUTE_KEY) === 'on';
  const savedInstrument = localStorage.getItem(INSTRUMENT_KEY);
  if (savedInstrument && isInstrumentId(savedInstrument)) activeInstrument = savedInstrument;
} catch {
  /* ignore */
}

interface Voice {
  id: number;
  midi: number;
  note: string;
  instrument: InstrumentId;
}

interface PendingAttack {
  voiceId: number;
  midi: number;
  velocity: number;
  instrument: InstrumentId;
}

const samplerCache = new Map<InstrumentId, Tone.Sampler>();
const samplerReady = new Map<InstrumentId, boolean>();
const loadPromises = new Map<InstrumentId, Promise<void>>();

let reverb: Tone.Reverb | null = null;
let masterGain: Tone.Volume | null = null;
let audioState: PianoAudioState = 'idle';
let coreInitPromise: Promise<void> | null = null;
let preloadPromise: Promise<void> | null = null;

let voiceCounter = 0;
const voicesById = new Map<number, Voice>();
const activeMidiCounts = new Map<InstrumentId, Map<number, number>>();
const pendingAttacks: PendingAttack[] = [];

let loadProgress = 0;

const midiToNote = (midi: number): string => Tone.Frequency(midi, 'midi').toNote();

const soundfontFileToToneNote = (filename: string): string | null => {
  const base = filename.replace('.mp3', '');
  if (base.includes(' v2')) return null;
  const match = base.match(/^([A-G])(s)?(\d+)$/);
  if (!match) return null;
  return `${match[1]}${match[2] ? '#' : ''}${match[3]}`;
};

const buildTonejsUrls = (files: string[]): Record<string, string> => {
  const urls: Record<string, string> = {};
  files.forEach((file) => {
    const note = soundfontFileToToneNote(file);
    if (note) urls[note] = file;
  });
  return urls;
};

const getMidiCounts = (instrument: InstrumentId): Map<number, number> => {
  let counts = activeMidiCounts.get(instrument);
  if (!counts) {
    counts = new Map();
    activeMidiCounts.set(instrument, counts);
  }
  return counts;
};

const getSampler = (instrument: InstrumentId): Tone.Sampler | null =>
  samplerCache.get(instrument) ?? null;

export const getActiveInstrument = (): InstrumentId => activeInstrument;

export const isInstrumentReady = (instrument: InstrumentId = activeInstrument): boolean =>
  samplerReady.get(instrument) === true;

export const getPianoLoadProgress = (): number => loadProgress;

const syncMasterGain = (): void => {
  if (!masterGain) return;
  masterGain.volume.value = Tone.gainToDb(muted ? 0 : masterVolume);
};

const applyReverbForInstrument = (instrument: InstrumentId): void => {
  if (!reverb) return;
  reverb.wet.value = INSTRUMENT_CONFIG[instrument].reverbWet;
};

const createSampler = (
  urls: Record<string, string>,
  baseUrl: string,
  release: number
): Tone.Sampler =>
  new Tone.Sampler({
    urls,
    baseUrl,
    attack: 0,
    release,
    onerror: (err) => {
      console.error('Instrument sample load error:', err);
    },
  });

const resolveSalamanderBaseUrl = async (): Promise<string> => {
  try {
    const res = await fetch(`${SALAMANDER_LOCAL}C4.mp3`, { method: 'HEAD' });
    if (res.ok) return SALAMANDER_LOCAL;
  } catch {
    /* fall through */
  }
  return SALAMANDER_CDN;
};

const buildSamplerForInstrument = async (instrument: InstrumentId): Promise<Tone.Sampler> => {
  const config = INSTRUMENT_CONFIG[instrument];
  if (instrument === 'piano') {
    const baseUrl = await resolveSalamanderBaseUrl();
    return createSampler(SALAMANDER_URLS, baseUrl, config.release);
  }
  const files = TONEJS_SAMPLE_FILES[instrument];
  const urls = buildTonejsUrls(files);
  return createSampler(urls, `${TONEJS_INSTRUMENTS_CDN}/${instrument}/`, config.release);
};

const ensureCoreEngine = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (coreInitPromise) return coreInitPromise;

  coreInitPromise = (async () => {
    await Tone.start();

    if (!reverb) {
      reverb = new Tone.Reverb({
        decay: 3.2,
        wet: INSTRUMENT_CONFIG[activeInstrument].reverbWet,
        preDelay: 0.02,
      });
      await reverb.generate();
    }

    if (!masterGain) {
      masterGain = new Tone.Volume(Tone.gainToDb(muted ? 0 : masterVolume));
      masterGain.chain(reverb, Tone.getDestination());
    }

    syncMasterGain();
    applyReverbForInstrument(activeInstrument);
  })().catch((err) => {
    coreInitPromise = null;
    audioState = 'error';
    throw err;
  });

  return coreInitPromise;
};

const loadInstrumentSampler = (instrument: InstrumentId): Promise<void> => {
  if (samplerReady.get(instrument)) return Promise.resolve();

  const existing = loadPromises.get(instrument);
  if (existing) return existing;

  const promise = (async () => {
    await ensureCoreEngine();
    if (samplerCache.has(instrument)) {
      samplerReady.set(instrument, true);
      return;
    }

    const sampler = await buildSamplerForInstrument(instrument);
    sampler.connect(masterGain!);
    samplerCache.set(instrument, sampler);
    await Tone.loaded();
    samplerReady.set(instrument, true);
    flushPendingAttacks(instrument);
  })().catch((err) => {
    loadPromises.delete(instrument);
    samplerReady.delete(instrument);
    throw err;
  });

  loadPromises.set(instrument, promise);
  return promise;
};

const preloadRemainingInstruments = (): void => {
  ALL_INSTRUMENT_IDS.filter((id) => id !== activeInstrument).forEach((id) => {
    void loadInstrumentSampler(id).catch(() => {
      /* background preload — ignore individual failures */
    });
  });
};

const initActiveInstrument = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  audioState = 'loading';
  loadProgress = 0.1;

  await ensureCoreEngine();
  loadProgress = 0.25;

  await loadInstrumentSampler(activeInstrument);
  loadProgress = 1;
  audioState = 'ready';

  preloadRemainingInstruments();
};

const flushPendingAttacks = (instrument: InstrumentId): void => {
  const remaining: PendingAttack[] = [];
  pendingAttacks.forEach((pending) => {
    if (pending.instrument !== instrument) {
      remaining.push(pending);
      return;
    }
    if (!voicesById.has(pending.voiceId)) return;
    triggerAttack(pending.instrument, pending.midi, pending.velocity);
  });
  pendingAttacks.length = 0;
  pendingAttacks.push(...remaining);
};

const disposeAllSamplers = (): void => {
  stopAllPianoNotes();
  samplerCache.forEach((sampler) => sampler.dispose());
  samplerCache.clear();
  samplerReady.clear();
  loadPromises.clear();
  pendingAttacks.length = 0;
};

const disposeEngine = (): void => {
  disposeAllSamplers();
  reverb?.dispose();
  masterGain?.dispose();
  reverb = null;
  masterGain = null;
  coreInitPromise = null;
  preloadPromise = null;
  audioState = 'idle';
  loadProgress = 0;
};

export const disposePianoAudio = (): void => {
  if (typeof window === 'undefined') return;
  disposeEngine();
};

const ensureEngine = (): Promise<void> => {
  if (audioState === 'ready' && isInstrumentReady(activeInstrument)) {
    return Promise.resolve();
  }
  if (!preloadPromise) {
    preloadPromise = initActiveInstrument().catch((err) => {
      preloadPromise = null;
      throw err;
    });
  }
  return preloadPromise.then(() => loadInstrumentSampler(activeInstrument));
};

export const setActiveInstrument = (instrument: InstrumentId): void => {
  if (instrument === activeInstrument) return;

  stopAllPianoNotes();
  activeInstrument = instrument;
  applyReverbForInstrument(instrument);

  try {
    localStorage.setItem(INSTRUMENT_KEY, instrument);
  } catch {
    /* ignore */
  }

  void ensureEngine();
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

const triggerAttack = (instrument: InstrumentId, midi: number, velocity = 0.88): void => {
  const sampler = getSampler(instrument);
  if (!sampler || !samplerReady.get(instrument)) return;

  const note = midiToNote(midi);
  const counts = getMidiCounts(instrument);
  const prev = counts.get(midi) ?? 0;
  counts.set(midi, prev + 1);
  if (prev === 0) {
    sampler.triggerAttack(note, Tone.now(), clampVelocity(velocity));
  }
};

/** 건반 누름 — voice id 반환 */
export const startPianoNote = (midi: number, velocity = 0.88): number | null => {
  if (typeof window === 'undefined') return null;

  const instrument = activeInstrument;
  const id = ++voiceCounter;
  const note = midiToNote(midi);
  voicesById.set(id, { id, midi, note, instrument });

  const playIfActive = () => {
    if (!voicesById.has(id)) return;
    if (samplerReady.get(instrument)) {
      triggerAttack(instrument, midi, velocity);
    } else {
      pendingAttacks.push({ voiceId: id, midi, velocity, instrument });
    }
  };

  if (audioState === 'ready' && samplerReady.get(instrument)) {
    playIfActive();
  } else {
    void ensureEngine().then(playIfActive);
  }

  return id;
};

/** 건반 뗌 */
export const stopPianoNote = (voiceId: number): void => {
  const voice = voicesById.get(voiceId);
  if (!voice) return;
  voicesById.delete(voiceId);

  const pendingIndex = pendingAttacks.findIndex((p) => p.voiceId === voiceId);
  if (pendingIndex >= 0) {
    pendingAttacks.splice(pendingIndex, 1);
    return;
  }

  const sampler = getSampler(voice.instrument);
  if (!sampler || !samplerReady.get(voice.instrument)) return;

  const counts = getMidiCounts(voice.instrument);
  const prev = counts.get(voice.midi) ?? 1;
  const next = prev - 1;
  if (next <= 0) {
    counts.delete(voice.midi);
    sampler.triggerRelease(voice.note, Tone.now());
  } else {
    counts.set(voice.midi, next);
  }
};

export const stopAllPianoNotes = (): void => {
  const now = Tone.now();
  activeMidiCounts.forEach((counts, instrument) => {
    const sampler = getSampler(instrument);
    if (!sampler || !samplerReady.get(instrument)) return;
    counts.forEach((_, midi) => {
      sampler.triggerRelease(midiToNote(midi), now);
    });
  });
  voicesById.clear();
  pendingAttacks.length = 0;
  activeMidiCounts.clear();
};
