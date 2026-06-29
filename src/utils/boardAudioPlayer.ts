import { createChorusPlaybackAudio, playChorusAudio } from './chorusAudioPlayback';

/** 게시판 목록·상세에서 하나의 오디오만 재생 (동시 재생 방지) */
let activeAudio: HTMLAudioElement | null = null;
let activeOwnerId = '';

export function getActiveBoardAudioOwner(): string {
  return activeOwnerId;
}

export function isBoardAudioPlaying(ownerId?: string): boolean {
  if (!activeAudio || activeAudio.paused) return false;
  if (ownerId) return activeOwnerId === ownerId;
  return true;
}

export function stopBoardAudio(ownerId?: string): void {
  if (!activeAudio) return;
  if (ownerId && activeOwnerId !== ownerId) return;

  try {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  } catch {
    /* ignore */
  }

  activeAudio = null;
  activeOwnerId = '';
}

export async function playBoardAudio(
  url: string,
  ownerId: string,
  onEnded?: () => void,
  onFail?: (message: string) => void
): Promise<HTMLAudioElement | null> {
  stopBoardAudio();

  const audio = createChorusPlaybackAudio();
  activeAudio = audio;
  activeOwnerId = ownerId;

  const cleanup = () => {
    if (activeAudio === audio) {
      activeAudio = null;
      activeOwnerId = '';
    }
    onEnded?.();
  };

  audio.addEventListener('ended', cleanup, { once: true });

  const ok = await playChorusAudio(audio, url, {
    onFail: (message) => {
      cleanup();
      onFail?.(message);
    },
  });

  if (!ok) return null;
  return audio;
}

export async function toggleBoardAudio(
  url: string,
  ownerId: string,
  onEnded?: () => void,
  onFail?: (message: string) => void
): Promise<'playing' | 'paused'> {
  if (isBoardAudioPlaying(ownerId)) {
    stopBoardAudio(ownerId);
    return 'paused';
  }
  const audio = await playBoardAudio(url, ownerId, onEnded, onFail);
  return audio ? 'playing' : 'paused';
}
