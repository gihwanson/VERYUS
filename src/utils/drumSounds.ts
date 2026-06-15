import * as Tone from 'tone';

const VOLUME_KEY = 'veryus_piano_volume';
const MUTE_KEY = 'veryus_piano_mute';
const SAMPLE_KEY = 'veryus_drum_sample_ids';

const SAMPLES_BASE =
  'https://raw.githubusercontent.com/generative-music/samples-alex-bainter/master/samples';

/** 같은 패드 연타 시 겹쳐 재생 — 샘플은 동일 */
const PAD_POLYPHONY = 3;

export type DrumPadId =
  | 'kick'
  | 'snare'
  | 'hihat-closed'
  | 'hihat-open'
  | 'tom-high'
  | 'tom-mid'
  | 'tom-floor'
  | 'ride'
  | 'crash';

export interface DrumSampleOption {
  id: string;
  label: string;
  sample: string;
}

export interface DrumPadDef {
  id: DrumPadId;
  label: string;
  gain: number;
  defaultSample: string;
}

const numberedSamples = (
  folder: string,
  count: number,
  labelPrefix: string
): DrumSampleOption[] =>
  Array.from({ length: count }, (_, index) => {
    const file = `${folder}/${index + 1}.wav`;
    return { id: file, label: `${labelPrefix} ${index + 1}`, sample: file };
  });

const singleSample = (folder: string, file: string, label: string): DrumSampleOption => {
  const sample = `${folder}/${file}`;
  return { id: sample, label, sample };
};

export const DRUM_SAMPLE_CATALOG: Record<DrumPadId, DrumSampleOption[]> = {
  kick: [
    ...numberedSamples('itslucid-lofi-kick', 12, 'Lo-Fi 킥'),
    singleSample('vcsl-bassdrum-hit-ff', '1.wav', '오케스트라 킥'),
  ],
  snare: [
    ...numberedSamples('itslucid-lofi-snare', 19, 'Lo-Fi 스네어'),
    ...numberedSamples('snare-brush-hit-p', 10, '브러시 스네어'),
  ],
  'hihat-closed': numberedSamples('itslucid-lofi-hats', 10, '하이햇'),
  'hihat-open': numberedSamples('itslucid-lofi-hats', 10, '오픈 하이햇'),
  'tom-high': numberedSamples('vcsl-tom', 4, '탐'),
  'tom-mid': numberedSamples('vcsl-tom', 4, '탐'),
  'tom-floor': numberedSamples('vcsl-tom', 4, '탐'),
  ride: numberedSamples('ride-brush-p', 6, '라이드'),
  crash: [
    singleSample('vcsl-finger-cymbals', '1.wav', '핑거 심벌'),
    ...numberedSamples('ride-brush-p', 6, '라이드 브러시').map((opt, i) => ({
      ...opt,
      label: `크래시 (라이드 ${i + 1})`,
    })),
  ],
};

export const DRUM_PADS: DrumPadDef[] = [
  { id: 'crash', label: '크래시', gain: 0.9, defaultSample: 'vcsl-finger-cymbals/1.wav' },
  { id: 'ride', label: '라이드', gain: 0.85, defaultSample: 'ride-brush-p/1.wav' },
  { id: 'tom-high', label: '하이탐', gain: 0.88, defaultSample: 'vcsl-tom/1.wav' },
  { id: 'hihat-open', label: '오픈 하이햇', gain: 0.75, defaultSample: 'itslucid-lofi-hats/6.wav' },
  { id: 'hihat-closed', label: '하이햇', gain: 0.8, defaultSample: 'itslucid-lofi-hats/1.wav' },
  { id: 'snare', label: '스네어', gain: 0.92, defaultSample: 'itslucid-lofi-snare/1.wav' },
  { id: 'tom-mid', label: '미드탐', gain: 0.9, defaultSample: 'vcsl-tom/2.wav' },
  { id: 'tom-floor', label: '플로어탐', gain: 0.95, defaultSample: 'vcsl-tom/4.wav' },
  { id: 'kick', label: '킥', gain: 1, defaultSample: 'itslucid-lofi-kick/1.wav' },
];

interface PadPlayers {
  players: Tone.Player[];
  gain: number;
  nextIndex: number;
  sample: string;
}

let masterVolume = 0.75;
let muted = false;
const selectedSampleIds: Partial<Record<DrumPadId, string>> = {};

try {
  const savedVol = localStorage.getItem(VOLUME_KEY);
  if (savedVol !== null) masterVolume = Math.max(0, Math.min(1, Number(savedVol)));
  muted = localStorage.getItem(MUTE_KEY) === 'on';
  const savedSamples = localStorage.getItem(SAMPLE_KEY);
  if (savedSamples) {
    const parsed = JSON.parse(savedSamples) as Partial<Record<DrumPadId, string>>;
    Object.assign(selectedSampleIds, parsed);
  }
} catch {
  /* ignore */
}

let masterGain: Tone.Volume | null = null;
let initPromise: Promise<void> | null = null;
const padPlayers = new Map<DrumPadId, PadPlayers>();
const activePads = new Set<DrumPadId>();

const syncMasterGain = (): void => {
  if (!masterGain) return;
  masterGain.volume.value = Tone.gainToDb(muted ? 0 : masterVolume);
};

const saveSampleSelections = (): void => {
  try {
    localStorage.setItem(SAMPLE_KEY, JSON.stringify(selectedSampleIds));
  } catch {
    /* ignore */
  }
};

const findOption = (padId: DrumPadId, optionId: string): DrumSampleOption | undefined =>
  DRUM_SAMPLE_CATALOG[padId].find((opt) => opt.id === optionId);

export const getSelectedSampleId = (padId: DrumPadId): string => {
  const saved = selectedSampleIds[padId];
  if (saved && findOption(padId, saved)) return saved;
  const pad = DRUM_PADS.find((p) => p.id === padId);
  const fallback = pad?.defaultSample ?? DRUM_SAMPLE_CATALOG[padId][0]?.id;
  return fallback ?? '';
};

export const getSelectedSampleLabel = (padId: DrumPadId): string => {
  const id = getSelectedSampleId(padId);
  return findOption(padId, id)?.label ?? id;
};

export const getPadSampleSelections = (): Record<DrumPadId, string> => {
  const result = {} as Record<DrumPadId, string>;
  DRUM_PADS.forEach((pad) => {
    result[pad.id] = getSelectedSampleId(pad.id);
  });
  return result;
};

const ensureMasterGain = async (): Promise<Tone.Volume> => {
  await Tone.start();
  if (!masterGain) {
    masterGain = new Tone.Volume(Tone.gainToDb(muted ? 0 : masterVolume));
    masterGain.toDestination();
  }
  syncMasterGain();
  return masterGain;
};

const disposePadPlayers = (padId: DrumPadId): void => {
  const existing = padPlayers.get(padId);
  if (!existing) return;
  existing.players.forEach((player) => player.dispose());
  padPlayers.delete(padId);
};

const loadPadPlayers = async (padId: DrumPadId): Promise<void> => {
  const padDef = DRUM_PADS.find((p) => p.id === padId);
  if (!padDef) return;

  const sampleId = getSelectedSampleId(padId);
  const option = findOption(padId, sampleId);
  if (!option) return;

  disposePadPlayers(padId);

  const gain = await ensureMasterGain();
  const url = `${SAMPLES_BASE}/${option.sample}`;
  const players = Array.from({ length: PAD_POLYPHONY }, () =>
    new Tone.Player({
      url,
      onerror: (err) => {
        console.error(`Drum sample load error (${padId}):`, err);
      },
    }).connect(gain)
  );

  padPlayers.set(padId, {
    players,
    gain: padDef.gain,
    nextIndex: 0,
    sample: option.sample,
  });

  await Tone.loaded();
};

const initEngine = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await ensureMasterGain();
    await Promise.all(DRUM_PADS.map((pad) => loadPadPlayers(pad.id)));
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
};

export const preloadDrumAudio = (): Promise<void> => initEngine();

export const unlockDrumAudio = (): void => {
  void initEngine();
};

export const setPadSampleSource = async (padId: DrumPadId, optionId: string): Promise<void> => {
  if (!findOption(padId, optionId)) return;
  selectedSampleIds[padId] = optionId;
  saveSampleSelections();
  await loadPadPlayers(padId);
};

export const disposeDrumAudio = (): void => {
  if (typeof window === 'undefined') return;
  DRUM_PADS.forEach((pad) => disposePadPlayers(pad.id));
  masterGain?.dispose();
  masterGain = null;
  initPromise = null;
  activePads.clear();
};

export const getDrumVolume = (): number => masterVolume;
export const isDrumMuted = (): boolean => muted;

export const setDrumVolume = (value: number): void => {
  masterVolume = Math.max(0, Math.min(1, value));
  try {
    localStorage.setItem(VOLUME_KEY, String(masterVolume));
  } catch {
    /* ignore */
  }
  syncMasterGain();
};

export const setDrumMuted = (on: boolean): void => {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  syncMasterGain();
};

const clampVelocity = (v: number): number => Math.max(0.45, Math.min(1, v));

export const triggerDrumPad = (padId: DrumPadId, velocity = 0.9): void => {
  if (typeof window === 'undefined') return;

  const play = () => {
    const pad = padPlayers.get(padId);
    if (!pad || pad.players.length === 0) return;

    const player = pad.players[pad.nextIndex % pad.players.length];
    pad.nextIndex = (pad.nextIndex + 1) % pad.players.length;
    if (!player.loaded) return;

    const vol = clampVelocity(velocity) * pad.gain;
    player.volume.value = Tone.gainToDb(vol);
    player.start(Tone.now());
    activePads.add(padId);
  };

  if (padPlayers.has(padId)) {
    play();
  } else {
    void initEngine().then(play);
  }
};

export const releaseDrumPad = (padId: DrumPadId): void => {
  activePads.delete(padId);
};

export const isDrumPadActive = (padId: DrumPadId): boolean => activePads.has(padId);
