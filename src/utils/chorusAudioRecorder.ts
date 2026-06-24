export type RecordingState = 'idle' | 'recording' | 'stopped';

export interface ChorusRecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export interface HarmonyRecordingOptions {
  /** 녹음 시작 전 준비 시간(초). 기본 3초 */
  prepSeconds?: number;
  /** 카운트다운 틱 (1~prepSeconds, 0=곧 시작) */
  onPrepTick?: (secondsLeft: number) => void;
  /** 원곡 재생이 시작될 때 */
  onReferenceStart?: () => void;
}

const PREFERRED_MIME = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

const DEFAULT_HARMONY_PREP_SECONDS = 3;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED_MIME.find((t) => MediaRecorder.isTypeSupported(t));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForAudioReady(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve();
      return;
    }
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('원곡을 불러올 수 없습니다.'));
    };
    const cleanup = () => {
      audio.removeEventListener('canplaythrough', onReady);
      audio.removeEventListener('error', onError);
    };
    audio.addEventListener('canplaythrough', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    audio.load();
  });
}

async function unlockAudioPlayback(): Promise<void> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  await ctx.close();
}

/**
 * 녹음 중 상대 녹음(원곡)을 스피커로 재생.
 * Web Audio API(createMediaElementSource)는 Firebase 등 cross-origin URL에서
 * CORS 없이 무음이 되므로 HTMLAudioElement 재생만 사용한다.
 */
class ReferencePlayback {
  private audio: HTMLAudioElement;
  private primed = false;

  constructor(url: string) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', 'true');
    this.audio.src = url;
  }

  async prepare(): Promise<void> {
    await waitForAudioReady(this.audio);
  }

  /** 사용자 제스처 직후 호출 — 카운트다운 후에도 autoplay가 유지되도록 무음 재생 */
  async primeMuted(): Promise<void> {
    await unlockAudioPlayback();
    this.audio.volume = 0;
    this.audio.currentTime = 0;
    try {
      await this.audio.play();
      this.primed = true;
    } catch {
      this.primed = false;
      this.audio.volume = 1;
    }
  }

  async start(): Promise<void> {
    await unlockAudioPlayback();
    if (this.primed) {
      this.audio.pause();
      this.primed = false;
    }
    this.audio.volume = 1;
    this.audio.currentTime = 0;
    try {
      await this.audio.play();
    } catch {
      throw new Error('원곡 재생에 실패했습니다. 소리를 켜고 다시 시도해 주세요.');
    }
  }

  stop(): void {
    this.primed = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.volume = 1;
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  onEnded(handler: () => void): void {
    this.audio.addEventListener('ended', handler, { once: true });
  }
}

export async function startChorusRecording(): Promise<ChorusRecorderHandle> {
  return startMicRecording();
}

/** 원곡을 들으며 마이크만 녹음 (화음 레이어용) */
export async function startChorusHarmonyRecording(
  referenceUrl: string,
  options: HarmonyRecordingOptions = {}
): Promise<ChorusRecorderHandle> {
  const prepSeconds = options.prepSeconds ?? DEFAULT_HARMONY_PREP_SECONDS;
  const ref = new ReferencePlayback(referenceUrl);
  await ref.prepare();
  await ref.primeMuted();

  const micPromise = startMicRecording();

  for (let left = prepSeconds; left >= 1; left--) {
    options.onPrepTick?.(left);
    await delay(1000);
  }
  options.onPrepTick?.(0);

  const micHandle = await micPromise;
  try {
    await ref.start();
    options.onReferenceStart?.();
  } catch (error) {
    micHandle.cancel();
    ref.stop();
    throw error;
  }

  return {
    stop: async () => {
      ref.stop();
      return micHandle.stop();
    },
    cancel: () => {
      ref.stop();
      micHandle.cancel();
    },
  };
}

/** 레이어 녹음 전 원곡만 미리 듣기 */
export async function previewChorusReference(
  referenceUrl: string,
  onEnded?: () => void
): Promise<() => void> {
  const ref = new ReferencePlayback(referenceUrl);
  await ref.prepare();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    ref.stop();
    onEnded?.();
  };
  ref.onEnded(stop);
  await ref.start();
  return stop;
}

/** 원곡 + 화음 녹음을 함께 재생. 정지 함수 반환 */
export function playChorusMix(
  referenceUrl: string,
  overlayUrl: string,
  onEnded?: () => void
): () => void {
  const parent = new Audio(referenceUrl);
  const overlay = new Audio(overlayUrl);
  parent.preload = 'auto';
  overlay.preload = 'auto';
  parent.setAttribute('playsinline', 'true');
  overlay.setAttribute('playsinline', 'true');
  parent.currentTime = 0;
  overlay.currentTime = 0;

  void unlockAudioPlayback().then(() => {
    void parent.play().catch(() => {});
    void overlay.play().catch(() => {});
  });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    parent.pause();
    overlay.pause();
    parent.removeAttribute('src');
    overlay.removeAttribute('src');
    parent.load();
    overlay.load();
    onEnded?.();
  };

  parent.addEventListener('ended', stop, { once: true });
  overlay.addEventListener('ended', () => {
    if (parent.paused || parent.ended) stop();
  });

  return stop;
}

async function startMicRecording(): Promise<ChorusRecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  const mimeType = pickMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  recorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });

  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());

  return new Promise((resolve, reject) => {
    recorder.addEventListener('error', () => {
      stopTracks();
      reject(new Error('녹음 중 오류가 발생했습니다.'));
    });

    recorder.start(250);

    resolve({
      stop: () =>
        new Promise<Blob>((res, rej) => {
          recorder.addEventListener(
            'stop',
            () => {
              stopTracks();
              const type = recorder.mimeType || mimeType || 'audio/webm';
              res(new Blob(chunks, { type }));
            },
            { once: true }
          );
          if (recorder.state === 'inactive') {
            rej(new Error('녹음이 이미 종료되었습니다.'));
            return;
          }
          recorder.stop();
        }),
      cancel: () => {
        if (recorder.state !== 'inactive') recorder.stop();
        stopTracks();
        chunks.length = 0;
      },
    });
  });
}

export function readFiniteAudioDuration(seconds: number): number | null {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** WebM 등 duration 메타데이터가 비어 있을 때 실제 길이 추정 */
export function probeAudioElementDuration(audio: HTMLAudioElement): Promise<number> {
  const direct = readFiniteAudioDuration(audio.duration);
  if (direct) return Promise.resolve(direct);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    const onError = () => finish(0);
    const onTimeUpdate = () => {
      const probed = readFiniteAudioDuration(audio.duration);
      if (probed) finish(probed);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('error', onError, { once: true });

    try {
      audio.currentTime = 1e101;
    } catch {
      finish(0);
      return;
    }

    window.setTimeout(() => finish(readFiniteAudioDuration(audio.duration) ?? 0), 3000);
  });
}

export function extractAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = url;

    const done = (value: number) => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      resolve(value);
    };

    audio.addEventListener('error', () => done(0), { once: true });
    audio.addEventListener(
      'loadedmetadata',
      () => {
        void probeAudioElementDuration(audio).then(done);
      },
      { once: true }
    );
  });
}

export function formatAudioDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const AUDIO_MIME_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/wave',
  'audio/x-wav', 'audio/aac', 'audio/x-aac', 'audio/flac', 'audio/x-flac',
  'audio/ogg', 'audio/x-ogg', 'audio/webm', 'audio/x-ms-wma', 'audio/caf',
  'audio/amr', 'audio/x-amr', 'audio/3gpp', 'audio/x-3gpp',
];
const VIDEO_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv',
  'video/webm', 'video/ogg', 'video/3gpp', 'video/x-flv', 'video/x-matroska',
];
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.aac', '.caf', '.amr', '.flac', '.ogg', '.wma', '.webm', '.3gp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.webm', '.3gp'];

export function validateAudioFile(file: File): string | null {
  const fileType = file.type.toLowerCase();
  const lowerName = file.name.toLowerCase();
  const isVideo =
    VIDEO_MIME_TYPES.some((t) => fileType.includes(t)) ||
    VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (isVideo) return '영상 파일은 업로드할 수 없습니다. 오디오 파일만 업로드 가능합니다.';

  const isAudio =
    AUDIO_MIME_TYPES.some((t) => fileType.includes(t)) ||
    AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!isAudio) return '오디오 파일만 업로드 가능합니다. (mp3, m4a, wav, aac 등)';

  return null;
}
