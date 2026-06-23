import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { formatAudioDuration } from '../utils/chorusAudioRecorder';
import '../styles/ChorusAudioPlayer.css';

interface Props {
  src: string;
  className?: string;
  durationHint?: number;
}

const ChorusAudioPlayer: React.FC<Props> = ({ src, className, durationHint }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationHint ?? 0);

  const syncDuration = useCallback((el: HTMLAudioElement) => {
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    setPlaying(false);
    setCurrent(0);
    setDuration(durationHint ?? 0);
    el.pause();
    el.currentTime = 0;
    el.load();
  }, [src, durationHint]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onTimeUpdate = () => setCurrent(el.currentTime);
    const onMeta = () => syncDuration(el);

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);

    return () => {
      el.pause();
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
    };
  }, [src, syncDuration]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    void el.play().catch(() => {});
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const next = Number(e.target.value);
    el.currentTime = next;
    setCurrent(next);
  };

  const max = duration > 0 ? duration : Math.max(current, 1);
  const timeLabel =
    duration > 0
      ? `${formatAudioDuration(current)} / ${formatAudioDuration(duration)}`
      : formatAudioDuration(current);

  return (
    <div className={`chorus-audio-player${className ? ` ${className}` : ''}`}>
      <audio ref={audioRef} src={src} preload="metadata" playsInline />
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
          step={0.05}
          value={current}
          onChange={handleSeek}
          aria-label="재생 위치"
        />
      </div>
      <span className="chorus-audio-player__time">{timeLabel}</span>
    </div>
  );
};

export default ChorusAudioPlayer;
