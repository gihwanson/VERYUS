import { createChorusPlaybackAudio, playChorusAudio } from './chorusAudioPlayback';

export interface MixerTrack {
  id: string;
  url: string;
  label?: string;
}

export class ChorusAudioMixer {
  private elements = new Map<string, HTMLAudioElement>();
  private muted = new Set<string>();
  private playing = false;

  setTracks(tracks: MixerTrack[]) {
    const nextIds = new Set(tracks.map((t) => t.id));
    for (const [id, el] of this.elements) {
      if (!nextIds.has(id)) {
        el.pause();
        el.src = '';
        this.elements.delete(id);
        this.muted.delete(id);
      }
    }
    for (const track of tracks) {
      let el = this.elements.get(track.id);
      if (!el) {
        el = createChorusPlaybackAudio();
        this.elements.set(track.id, el);
      }
      if (el.src !== track.url) {
        el.src = track.url;
      }
    }
  }

  isMuted(id: string): boolean {
    return this.muted.has(id);
  }

  setMuted(id: string, muted: boolean) {
    const el = this.elements.get(id);
    if (!el) return;
    if (muted) {
      this.muted.add(id);
      el.volume = 0;
    } else {
      this.muted.delete(id);
      el.volume = 1;
    }
  }

  toggleMute(id: string): boolean {
    const next = !this.isMuted(id);
    this.setMuted(id, next);
    return next;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  async playAll(onFail?: (message: string) => void): Promise<boolean> {
    const els = [...this.elements.values()];
    if (els.length === 0) return false;

    els.forEach((el) => {
      el.currentTime = 0;
    });

    const results = await Promise.all(
      els.map((el) =>
        playChorusAudio(el, el.src, {
          onFail: (message) => onFail?.(message),
        })
      )
    );

    const ok = results.some(Boolean);
    this.playing = ok;
    return ok;
  }

  pauseAll() {
    for (const el of this.elements.values()) {
      el.pause();
    }
    this.playing = false;
  }

  stopAll() {
    for (const el of this.elements.values()) {
      el.pause();
      el.currentTime = 0;
    }
    this.playing = false;
  }

  dispose() {
    this.stopAll();
    for (const el of this.elements.values()) {
      el.src = '';
    }
    this.elements.clear();
    this.muted.clear();
  }
}
