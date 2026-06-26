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
