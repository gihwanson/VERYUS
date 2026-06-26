import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import {
  formatAudioDuration,
  probeAudioElementDuration,
  readFiniteAudioDuration,
} from '../utils/chorusAudioRecorder';
import { configureChorusPlaybackAudio } from '../utils/chorusAudioPlayback';
import '../styles/ChorusAudioPlayer.css';

interface Props {
  src: string;
  className?: string;
  durationHint?: number;
}

const ChorusAudioPlayer: React.FC<Props> = ({ src, className, durationHint }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const durationHintRef = useRef(durationHint);
  durationHintRef.current = durationHint;

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(() => Math.max(0, durationHint ?? 0));

  const applyDuration = useCallback((next: number) => {
    const finite = readFiniteAudioDuration(next);
    if (finite) setDuration(finite);
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const el = audioRef.current;
    if (!el || el.paused) return;
    setCurrent(el.currentTime);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startRaf = useCallback(() => {
    stopRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf, tick]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) configureChorusPlaybackAudio(el);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    setPlaying(false);
    setCurrent(0);
    setDuration(Math.max(0, durationHintRef.current ?? 0));
    el.pause();
    el.currentTime = 0;
    el.load();
  }, [src]);

  useEffect(() => {
    if (durationHint && durationHint > 0) {
      applyDuration(durationHint);
    }
  }, [durationHint, applyDuration]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const resolveDuration = async () => {
      const direct = readFiniteAudioDuration(el.duration);
      if (direct) {
        applyDuration(direct);
        return;
      }
      const probed = await probeAudioElementDuration(el);
      if (probed > 0) applyDuration(probed);
    };

    const onPlay = () => {
      setPlaying(true);
      startRaf();
    };
    const onPause = () => {
      setPlaying(false);
      stopRaf();
      setCurrent(el.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      stopRaf();
      const end = readFiniteAudioDuration(el.duration) ?? el.currentTime;
      setCurrent(end);
    };
    const onTimeUpdate = () => {
      if (el.paused) setCurrent(el.currentTime);
    };
    const onMeta = () => void resolveDuration();
    const onSeeked = () => setCurrent(el.currentTime);

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('seeked', onSeeked);

    return () => {
      stopRaf();
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('seeked', onSeeked);
    };
  }, [src, applyDuration, startRaf, stopRaf]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    void el.play().catch(() => {});
  };

  const handleSeek = (next: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = next;
    setCurrent(next);
  };

  const trackDuration =
    duration > 0 ? duration : durationHint && durationHint > 0 ? durationHint : 0;
  const max = trackDuration > 0 ? trackDuration : 1;
  const progress = trackDuration > 0 ? Math.min(Math.max(current, 0), trackDuration) : 0;

  const timeLabel =
    trackDuration > 0
      ? `${formatAudioDuration(progress)} / ${formatAudioDuration(trackDuration)}`
      : formatAudioDuration(progress);

  return (
    <div className={`chorus-audio-player${className ? ` ${className}` : ''}`}>
      <audio ref={audioRef} src={src} preload="auto" />
      <button
        type="button"
        className="chorus-audio-player__play"
        onClick={togglePlay}
        aria-label={playing ? '일시정지' : '재생'}
      >
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </button>
      <div className="chorus-audio-player__track">
        <input
          type="range"
          className="chorus-audio-player__range"
          min={0}
          max={max}
          step={0.01}
          value={progress}
          onChange={(e) => handleSeek(Number(e.target.value))}
          onInput={(e) => handleSeek(Number((e.target as HTMLInputElement).value))}
          aria-label="재생 위치"
          aria-valuemin={0}
          aria-valuemax={trackDuration > 0 ? trackDuration : undefined}
          aria-valuenow={progress}
        />
      </div>
      <span className="chorus-audio-player__time">{timeLabel}</span>
    </div>
  );
};

export default ChorusAudioPlayer;
