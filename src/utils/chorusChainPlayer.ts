export class ChorusChainPlayer {
  private audio = new Audio();
  private urls: string[] = [];
  private index = 0;
  private playing = false;
  private onIndexChange: ((index: number) => void) | null = null;
  private onStateChange: ((playing: boolean) => void) | null = null;

  constructor() {
    this.audio.preload = 'auto';
  }

  setUrls(urls: string[]) {
    this.urls = urls.filter(Boolean);
    if (this.index >= this.urls.length) {
      this.index = 0;
    }
  }

  onIndex(cb: (index: number) => void) {
    this.onIndexChange = cb;
  }

  onPlayingChange(cb: (playing: boolean) => void) {
    this.onStateChange = cb;
  }

  get isPlaying() {
    return this.playing;
  }

  get currentIndex() {
    return this.index;
  }

  async play(fromIndex = 0): Promise<void> {
    if (this.urls.length === 0) return;
    this.index = Math.max(0, Math.min(fromIndex, this.urls.length - 1));
    this.playing = true;
    this.onStateChange?.(true);
    await this.playCurrent();
  }

  private async playCurrent(): Promise<void> {
    const url = this.urls[this.index];
    if (!url) {
      this.stop();
      return;
    }
    this.onIndexChange?.(this.index);
    this.audio.src = url;
    this.audio.onended = () => {
      if (this.index + 1 < this.urls.length) {
        this.index += 1;
        void this.playCurrent();
      } else {
        this.playing = false;
        this.onStateChange?.(false);
        this.onIndexChange?.(-1);
      }
    };
    try {
      await this.audio.play();
    } catch {
      this.stop();
    }
  }

  pause() {
    this.audio.pause();
    this.playing = false;
    this.onStateChange?.(false);
  }

  stop() {
    this.audio.pause();
    this.audio.onended = null;
    this.playing = false;
    this.index = 0;
    this.onStateChange?.(false);
    this.onIndexChange?.(-1);
  }

  dispose() {
    this.stop();
    this.audio.src = '';
    this.urls = [];
  }
}
