export type RecordingState = 'idle' | 'recording' | 'stopped';

export interface ChorusRecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

const PREFERRED_MIME = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED_MIME.find((t) => MediaRecorder.isTypeSupported(t));
}

export async function startChorusRecording(): Promise<ChorusRecorderHandle> {
  return startMicRecording();
}

/** 원곡을 들으며 마이크만 녹음 (화음 레이어용) */
export async function startChorusHarmonyRecording(referenceUrl: string): Promise<ChorusRecorderHandle> {
  const refAudio = new Audio(referenceUrl);
  refAudio.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('원곡을 불러올 수 없습니다.'));
    };
    const cleanup = () => {
      refAudio.removeEventListener('canplaythrough', onReady);
      refAudio.removeEventListener('error', onError);
    };
    refAudio.addEventListener('canplaythrough', onReady, { once: true });
    refAudio.addEventListener('error', onError, { once: true });
    refAudio.load();
  });

  refAudio.currentTime = 0;
  void refAudio.play().catch(() => {
    /* 일부 환경에서 사용자 제스처 없이 재생 실패 — 녹음은 계속 */
  });

  const micHandle = await startMicRecording();

  return {
    stop: async () => {
      refAudio.pause();
      refAudio.src = '';
      return micHandle.stop();
    },
    cancel: () => {
      refAudio.pause();
      refAudio.src = '';
      micHandle.cancel();
    },
  };
}

async function startMicRecording(): Promise<ChorusRecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

export function extractAudioDuration(url: string, tryCount = 0): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        resolve(audio.duration);
      } else if (tryCount < 5) {
        setTimeout(() => {
          extractAudioDuration(url, tryCount + 1).then(resolve);
        }, 200);
      } else {
        resolve(0);
      }
    });
    audio.addEventListener('error', () => resolve(0));
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
