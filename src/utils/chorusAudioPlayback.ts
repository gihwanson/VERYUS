/** 이어부르기 재생용 Audio 요소 공통 설정 */
export function configureChorusPlaybackAudio(audio: HTMLAudioElement): void {
  audio.preload = 'auto';
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');
}

export function createChorusPlaybackAudio(url?: string): HTMLAudioElement {
  const audio = new Audio();
  configureChorusPlaybackAudio(audio);
  if (url) audio.src = url;
  return audio;
}

const FORMAT_MIME: Record<string, string> = {
  webm: 'audio/webm',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
};

export function guessChorusAudioFormat(url: string): string {
  const path = decodeURIComponent(url.split('?')[0] || '').toLowerCase();
  const match = path.match(/\.([a-z0-9]+)$/);
  return match?.[1] || 'unknown';
}

/** Safari/iOS 등에서 WebM 재생 불가 여부 사전 확인 */
export function isChorusAudioFormatSupported(url: string): boolean {
  const fmt = guessChorusAudioFormat(url);
  if (fmt === 'unknown') return true;

  const mime = FORMAT_MIME[fmt];
  if (!mime) return true;

  const probe = document.createElement('audio');
  const result = probe.canPlayType(mime);
  return result === 'probably' || result === 'maybe';
}

export function describeChorusPlaybackError(error: unknown, url?: string): string {
  const name = error instanceof DOMException ? error.name : '';
  const fmt = url ? guessChorusAudioFormat(url) : 'unknown';

  if (fmt === 'webm' && !isChorusAudioFormatSupported(url || '')) {
    return '이 녹음(WebM)은 iPhone·Safari에서 재생할 수 없습니다. 녹음자에게 다시 올려 달라고 요청해 주세요.';
  }
  if (name === 'NotAllowedError') {
    return '재생이 차단되었습니다. 소리를 켜고 다시 눌러 주세요.';
  }
  if (name === 'NotSupportedError') {
    return '이 기기에서 지원하지 않는 녹음 형식입니다.';
  }
  return '녹음을 재생할 수 없습니다. 네트워크·소리 설정을 확인해 주세요.';
}

export function waitForChorusAudioReady(audio: HTMLAudioElement, timeoutMs = 12_000): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('AUDIO_LOAD_TIMEOUT'));
    }, timeoutMs);

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('AUDIO_LOAD_ERROR'));
    };

    const cleanup = () => {
      audio.removeEventListener('canplaythrough', finish);
      audio.removeEventListener('loadeddata', finish);
      audio.removeEventListener('error', fail);
    };

    audio.addEventListener('canplaythrough', finish, { once: true });
    audio.addEventListener('loadeddata', finish, { once: true });
    audio.addEventListener('error', fail, { once: true });
    audio.load();
  });
}

export interface PlayChorusAudioOptions {
  onFail?: (message: string) => void;
}

/** src 설정 → 로드 대기 → 재생. 성공 여부 반환 */
export async function playChorusAudio(
  audio: HTMLAudioElement,
  url: string,
  options: PlayChorusAudioOptions = {}
): Promise<boolean> {
  const trimmed = url?.trim();
  if (!trimmed) {
    options.onFail?.('재생할 녹음이 없습니다.');
    return false;
  }

  if (!isChorusAudioFormatSupported(trimmed)) {
    options.onFail?.(describeChorusPlaybackError(null, trimmed));
    return false;
  }

  try {
    audio.src = trimmed;
    audio.currentTime = 0;
    await waitForChorusAudioReady(audio);
    await audio.play();
    return true;
  } catch (error) {
    options.onFail?.(describeChorusPlaybackError(error, trimmed));
    audio.pause();
    return false;
  }
}
