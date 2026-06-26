import { createChorusPlaybackAudio } from './chorusAudioPlayback';

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

export function playBoardAudio(
  url: string,
  ownerId: string,
  onEnded?: () => void
): HTMLAudioElement {
  stopBoardAudio();

  const audio = createChorusPlaybackAudio(url);
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
  void audio.play().catch(() => cleanup());

  return audio;
}

export function toggleBoardAudio(
  url: string,
  ownerId: string,
  onEnded?: () => void
): 'playing' | 'paused' {
  if (isBoardAudioPlaying(ownerId)) {
    stopBoardAudio(ownerId);
    return 'paused';
  }
  playBoardAudio(url, ownerId, onEnded);
  return 'playing';
}
