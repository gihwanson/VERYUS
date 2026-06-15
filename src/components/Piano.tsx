import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, X, Volume2, VolumeX } from 'lucide-react';
import { usePianoLandscape } from '../hooks/usePianoLandscape';
import { isTouchPrimaryDevice, unlockPianoLandscape } from '../utils/pianoOrientation';
import {
  disposePianoAudio,
  getPianoVolume,
  isPianoMuted,
  midiToLabel,
  preloadPianoAudio,
  setPianoMuted,
  setPianoVolume,
  startPianoNote,
  stopAllPianoNotes,
  stopPianoNote,
} from '../utils/pianoSounds';
import '../styles/variables.css';
import '../styles/piano.css';

interface PianoKey {
  midi: number;
  label: string;
  isBlack: boolean;
  afterWhite?: number;
  keyboard?: string;
}

const MIN_MIDI = 21; // A0 — standard 88-key piano low
const MAX_MIDI = 108; // C8 — standard 88-key piano high
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);
const QWERTY_BY_SEMITONE: Record<number, string> = {
  0: 'z',
  1: 's',
  2: 'x',
  3: 'd',
  4: 'c',
  5: 'v',
  6: 'g',
  7: 'b',
  8: 'h',
  9: 'n',
  10: 'j',
  11: 'm',
};
const BLACK_KEY_WIDTH_RATIO = 0.46;
const SCROLL_KEY = 'veryus_piano_scroll_x_88';
const INERTIA_FRICTION = 0.92;
const INERTIA_MIN_VELOCITY = 0.2;
const BODY_PADDING_X = 20;

type PanMode = 'pan';

interface PanSession {
  pointerId: number;
  startClientX: number;
  startOffset: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  mode: PanMode;
}

const buildFullKeyboard = (): Omit<PianoKey, 'keyboard'>[] => {
  const keys: Omit<PianoKey, 'keyboard'>[] = [];
  let whiteCount = 0;

  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    const semitone = midi % 12;
    const isBlack = BLACK_SEMITONES.has(semitone);
    keys.push({
      midi,
      label: midiToLabel(midi),
      isBlack,
      afterWhite: isBlack ? whiteCount - 1 : undefined,
    });
    if (!isBlack) whiteCount += 1;
  }

  return keys;
};

const ALL_KEYS = buildFullKeyboard();

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const getSavedScrollX = (): number | null => {
  try {
    const saved = localStorage.getItem(SCROLL_KEY);
    if (saved === null) return null;
    const n = Number(saved);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const saveScrollX = (offset: number): void => {
  try {
    localStorage.setItem(SCROLL_KEY, String(offset));
  } catch {
    /* ignore */
  }
};

const getBlackKeyStyle = (afterWhite: number): React.CSSProperties =>
  ({ '--aw': afterWhite } as React.CSSProperties);

interface ScrollTrackSession {
  pointerId: number;
  startClientX: number;
  startOffset: number;
}

const Piano: React.FC = () => {
  const navigate = useNavigate();

  const handleClose = useCallback(() => {
    stopAllPianoNotes();
    unlockPianoLandscape();
    navigate('/instruments');
  }, [navigate]);

  const handleExitFullscreen = useCallback(() => {
    stopAllPianoNotes();
    navigate('/instruments');
  }, [navigate]);

  const { isEmulatedLandscape, isReverseEmulation } = usePianoLandscape(handleExitFullscreen);

  const [offsetX, setOffsetX] = useState(0);
  const [bounds, setBounds] = useState({ min: 0, max: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [activeMidis, setActiveMidis] = useState<Set<number>>(new Set());
  const [volume, setVolume] = useState(getPianoVolume);
  const [muted, setMuted] = useState(isPianoMuted);
  const [showGuides, setShowGuides] = useState(true);
  const [layoutTick, setLayoutTick] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const keysAreaRef = useRef<HTMLDivElement>(null);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const offsetXRef = useRef(0);
  const boundsRef = useRef({ min: 0, max: 0 });
  const panSessionRef = useRef<PanSession | null>(null);
  const scrollTrackSessionRef = useRef<ScrollTrackSession | null>(null);
  const playingPointersRef = useRef<Set<number>>(new Set());
  const inertiaFrameRef = useRef<number | null>(null);
  const pointerVoicesRef = useRef<Map<number, { midi: number; voiceId: number }>>(new Map());
  const keyboardVoicesRef = useRef<Map<string, { midi: number; voiceId: number }>>(new Map());
  const activeCountRef = useRef<Map<number, number>>(new Map());
  const hasInitializedScrollRef = useRef(false);

  const whiteKeys = useMemo(() => ALL_KEYS.filter((k) => !k.isBlack), []);
  const blackKeys = useMemo(() => ALL_KEYS.filter((k) => k.isBlack), []);

  const keyWidth = useMemo(() => {
    void layoutTick;
    const body = bodyRef.current;
    if (!body) return 50;
    const raw = getComputedStyle(body).getPropertyValue('--key-width').trim();
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 50;
  }, [layoutTick]);

  const measureBounds = useCallback(() => {
    const viewport = viewportRef.current;
    const scroll = scrollRef.current;
    const body = bodyRef.current;
    if (!viewport || !scroll || !body) return;

    const viewportWidth = viewport.clientWidth;
    const contentWidth = body.offsetWidth || body.scrollWidth;
    const min = Math.min(0, viewportWidth - contentWidth);
    const nextBounds = { min, max: 0 };
    boundsRef.current = nextBounds;
    setBounds(nextBounds);
    setOffsetX((prev) => clamp(prev, min, 0));
  }, []);

  useEffect(() => {
    measureBounds();
    const viewport = viewportRef.current;
    const scroll = scrollRef.current;
    const body = bodyRef.current;
    if (!viewport || !scroll || !body) return;

    const observer = new ResizeObserver(() => {
      measureBounds();
      setLayoutTick((v) => v + 1);
    });
    observer.observe(viewport);
    observer.observe(scroll);
    observer.observe(body);

    const id = requestAnimationFrame(() => measureBounds());
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
    };
  }, [measureBounds, whiteKeys.length]);

  useEffect(() => {
    if (hasInitializedScrollRef.current) return;
    if (!viewportRef.current || !bodyRef.current) return;
    if (bounds.min === 0 && bounds.max === 0 && scrollRef.current && viewportRef.current) {
      if (scrollRef.current.scrollWidth <= viewportRef.current.clientWidth) return;
    }

    const saved = getSavedScrollX();
    if (saved !== null) {
      setOffsetX(clamp(saved, bounds.min, bounds.max));
      hasInitializedScrollRef.current = true;
      return;
    }

    const c4Index = whiteKeys.findIndex((k) => k.midi === 60);
    if (c4Index >= 0) {
      const viewportWidth = viewportRef.current.clientWidth;
      const c4Center = BODY_PADDING_X + c4Index * keyWidth + keyWidth / 2;
      const centered = viewportWidth / 2 - c4Center;
      setOffsetX(clamp(centered, bounds.min, bounds.max));
    }
    hasInitializedScrollRef.current = true;
  }, [bounds, keyWidth, whiteKeys]);

  useEffect(() => {
    offsetXRef.current = offsetX;
    saveScrollX(offsetX);
  }, [offsetX]);

  const mappingStart = useMemo(() => {
    const viewport = viewportRef.current;
    if (!viewport) return 60;
    const centerContentX = -offsetX + viewport.clientWidth / 2;
    const relativeX = centerContentX - BODY_PADDING_X;
    const whiteIndex = clamp(Math.floor(relativeX / keyWidth), 0, whiteKeys.length - 1);
    const anchorMidi = whiteKeys[whiteIndex]?.midi ?? 60;
    return anchorMidi - (anchorMidi % 12);
  }, [offsetX, keyWidth, whiteKeys, layoutTick]);

  const keys = useMemo(
    () =>
      ALL_KEYS.map((key) => ({
        ...key,
        keyboard:
          key.midi >= mappingStart && key.midi < mappingStart + 12
            ? QWERTY_BY_SEMITONE[key.midi - mappingStart]
            : undefined,
      })),
    [mappingStart]
  );

  const keyboardMap = useMemo(
    () => new Map(keys.filter((k) => k.keyboard).map((k) => [k.keyboard!, k.midi])),
    [keys]
  );

  const visibleRangeLabel = useMemo(() => {
    const viewport = viewportRef.current;
    if (!viewport || !whiteKeys.length) return '';
    const leftContentX = -offsetX;
    const rightContentX = -offsetX + viewport.clientWidth;
    const firstIndex = clamp(
      Math.floor((leftContentX - BODY_PADDING_X) / keyWidth),
      0,
      whiteKeys.length - 1
    );
    const lastIndex = clamp(
      Math.ceil((rightContentX - BODY_PADDING_X) / keyWidth) - 1,
      0,
      whiteKeys.length - 1
    );
    return `${whiteKeys[firstIndex].label} – ${whiteKeys[lastIndex].label}`;
  }, [offsetX, keyWidth, whiteKeys, keys, layoutTick]);

  const mappedRangeLabel = useMemo(() => {
    const start = mappingStart;
    const end = Math.min(mappingStart + 11, MAX_MIDI);
    return `${midiToLabel(start)} – ${midiToLabel(end)}`;
  }, [mappingStart]);

  const scrollThumb = useMemo(() => {
    void layoutTick;
    const viewport = viewportRef.current;
    const body = bodyRef.current;
    if (!viewport || !body) return { left: 0, width: 100, canScroll: false };
    const viewportWidth = viewport.clientWidth;
    const contentWidth = body.offsetWidth || body.scrollWidth;
    if (contentWidth <= viewportWidth) return { left: 0, width: 100, canScroll: false };
    const width = (viewportWidth / contentWidth) * 100;
    const maxLeft = 100 - width;
    const scrollRange = bounds.min;
    const progress = scrollRange === 0 ? 0 : clamp(offsetX / scrollRange, 0, 1);
    return { left: progress * maxLeft, width, canScroll: true };
  }, [offsetX, bounds, layoutTick]);

  useEffect(() => {
    void preloadPianoAudio();
  }, []);

  const setMidiActive = useCallback((midi: number, active: boolean) => {
    const counts = activeCountRef.current;
    const prev = counts.get(midi) ?? 0;
    const next = active ? prev + 1 : Math.max(0, prev - 1);
    if (next <= 0) counts.delete(midi);
    else counts.set(midi, next);

    setActiveMidis((prevSet) => {
      const nextSet = new Set(prevSet);
      if (next > 0) nextSet.add(midi);
      else nextSet.delete(midi);
      return nextSet;
    });
  }, []);

  const noteOn = useCallback(
    (midi: number, velocity = 0.88): number | null => {
      const voiceId = startPianoNote(midi, velocity);
      if (voiceId !== null) setMidiActive(midi, true);
      return voiceId;
    },
    [setMidiActive]
  );

  const noteOff = useCallback(
    (voiceId: number, midi: number) => {
      stopPianoNote(voiceId);
      setMidiActive(midi, false);
    },
    [setMidiActive]
  );


  const pointerVelocity = (e: React.PointerEvent | PointerEvent): number => {
    if (e.pressure > 0) return 0.7 + e.pressure * 0.3;
    return 0.82 + Math.random() * 0.12;
  };

  const releasePointerNote = useCallback(
    (pointerId: number) => {
      const held = pointerVoicesRef.current.get(pointerId);
      if (!held) return;
      noteOff(held.voiceId, held.midi);
      pointerVoicesRef.current.delete(pointerId);
    },
    [noteOff]
  );

  const beginPointerNote = useCallback(
    (pointerId: number, midi: number, velocity = 0.88) => {
      const held = pointerVoicesRef.current.get(pointerId);
      if (held?.midi === midi) return;

      if (held) {
        noteOff(held.voiceId, held.midi);
        pointerVoicesRef.current.delete(pointerId);
      }

      const voiceId = noteOn(midi, velocity);
      if (voiceId !== null) {
        pointerVoicesRef.current.set(pointerId, { midi, voiceId });
      }
    },
    [noteOn, noteOff]
  );

  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  const startInertia = useCallback(
    (velocityPxPerMs: number) => {
      stopInertia();
      let velocity = velocityPxPerMs * 16;

      const tick = () => {
        if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) {
          inertiaFrameRef.current = null;
          return;
        }

        let hitEdge = false;
        setOffsetX((prev) => {
          const next = clamp(prev + velocity, boundsRef.current.min, boundsRef.current.max);
          if (next !== prev + velocity) hitEdge = true;
          return next;
        });

        velocity *= INERTIA_FRICTION;
        if (hitEdge) velocity = 0;
        inertiaFrameRef.current = requestAnimationFrame(tick);
      };

      inertiaFrameRef.current = requestAnimationFrame(tick);
    },
    [stopInertia]
  );

  const resolveKeyMidi = (target: EventTarget | null): number | undefined => {
    const el = (target as HTMLElement | null)?.closest?.('.piano-white-key, .piano-black-key');
    if (!el) return undefined;
    const midi = Number((el as HTMLElement).dataset.midi);
    return Number.isFinite(midi) ? midi : undefined;
  };

  const isPanSurfaceTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.closest('.piano-white-key, .piano-black-key, .piano-keys-area, .piano-scroll-track')) {
      return false;
    }
    return Boolean(el.closest('.piano-pan-rail, .piano-pan-surface'));
  };

  const handleKeysPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const midi = resolveKeyMidi(e.target);
      if (midi === undefined) return;

      e.stopPropagation();
      e.preventDefault();
      keysAreaRef.current?.setPointerCapture(e.pointerId);
      playingPointersRef.current.add(e.pointerId);
      beginPointerNote(e.pointerId, midi, pointerVelocity(e));
    },
    [beginPointerNote]
  );

  const handleKeysPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!playingPointersRef.current.has(e.pointerId)) return;

      const midi = resolveKeyMidi(document.elementFromPoint(e.clientX, e.clientY));
      if (midi !== undefined) {
        beginPointerNote(e.pointerId, midi, pointerVelocity(e));
      }
    },
    [beginPointerNote]
  );

  const handlePanPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (!isPanSurfaceTarget(e.target)) return;

      e.stopPropagation();
      stopInertia();
      bodyRef.current?.setPointerCapture(e.pointerId);

      panSessionRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startOffset: offsetXRef.current,
        lastX: e.clientX,
        lastTime: performance.now(),
        velocity: 0,
        mode: 'pan',
      };
      setIsPanning(true);
    },
    [stopInertia]
  );

  const handlePanPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== e.pointerId || session.mode !== 'pan') return;

    const now = performance.now();
    const dt = now - session.lastTime;
    if (dt > 0) session.velocity = (e.clientX - session.lastX) / dt;
    session.lastX = e.clientX;
    session.lastTime = now;

    e.preventDefault();
    const panDx = e.clientX - session.startClientX;
    const { min, max } = boundsRef.current;
    setOffsetX(clamp(session.startOffset + panDx, min, max));
  }, []);

  const endPanSession = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = panSessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;

      startInertia(session.velocity);
      panSessionRef.current = null;
      setIsPanning(false);

      try {
        bodyRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [startInertia]
  );

  const offsetFromTrackProgress = useCallback((progress: number): number => {
    const { min, max } = boundsRef.current;
    if (min === max) return 0;
    return clamp(progress * min, min, max);
  }, []);

  const handleScrollTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !scrollThumb.canScroll) return;
      e.stopPropagation();
      stopInertia();

      const track = scrollTrackRef.current;
      if (!track) return;
      track.setPointerCapture(e.pointerId);

      const rect = track.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const thumbCenter = (scrollThumb.left + scrollThumb.width / 2) / 100;
      const onThumb = Math.abs(ratio - thumbCenter) <= scrollThumb.width / 200;

      if (!onThumb) {
        const maxLeft = 100 - scrollThumb.width;
        const targetLeft = clamp(ratio * 100 - scrollThumb.width / 2, 0, maxLeft);
        const progress = maxLeft > 0 ? targetLeft / maxLeft : 0;
        setOffsetX(offsetFromTrackProgress(progress));
      }

      scrollTrackSessionRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startOffset: offsetXRef.current,
      };
    },
    [offsetFromTrackProgress, scrollThumb, stopInertia]
  );

  const handleScrollTrackPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = scrollTrackSessionRef.current;
      if (!session || session.pointerId !== e.pointerId || !scrollThumb.canScroll) return;

      const track = scrollTrackRef.current;
      if (!track) return;

      e.preventDefault();
      const rect = track.getBoundingClientRect();
      const maxLeft = 100 - scrollThumb.width;
      const startProgress = session.startOffset / boundsRef.current.min || 0;
      const startLeft = startProgress * maxLeft;
      const deltaPct = ((e.clientX - session.startClientX) / rect.width) * 100;
      const nextLeft = clamp(startLeft + deltaPct, 0, maxLeft);
      const progress = maxLeft > 0 ? nextLeft / maxLeft : 0;
      setOffsetX(offsetFromTrackProgress(progress));
    },
    [offsetFromTrackProgress, scrollThumb]
  );

  const endScrollTrackSession = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = scrollTrackSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    scrollTrackSessionRef.current = null;
    try {
      scrollTrackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      playingPointersRef.current.delete(e.pointerId);
      releasePointerNote(e.pointerId);
      try {
        keysAreaRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [releasePointerNote]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const midi = keyboardMap.get(key);
      if (midi === undefined) return;
      if (keyboardVoicesRef.current.has(key)) return;
      e.preventDefault();
      const voiceId = noteOn(midi);
      if (voiceId !== null) keyboardVoicesRef.current.set(key, { midi, voiceId });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const held = keyboardVoicesRef.current.get(key);
      if (!held) return;
      e.preventDefault();
      noteOff(held.voiceId, held.midi);
      keyboardVoicesRef.current.delete(key);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [keyboardMap, noteOn, noteOff, handleClose]);

  useEffect(
    () => () => {
      stopInertia();
      stopAllPianoNotes();
      disposePianoAudio();
    },
    [stopInertia]
  );

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setVolume(next);
    setPianoVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
      setPianoMuted(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setPianoMuted(next);
  };

  const guideClass = (black?: boolean) =>
    `piano-key-guides${black ? ' piano-key-guides--black' : ''}${showGuides ? '' : ' is-hidden'}`;

  const whiteKeysRendered = keys.filter((k) => !k.isBlack);
  const blackKeysRendered = keys.filter((k) => k.isBlack);

  const isMobilePiano = isTouchPrimaryDevice();
  const pageClass = [
    'piano-page',
    isEmulatedLandscape
      ? 'piano-page--emulated'
      : isMobilePiano
        ? 'piano-page--immersive'
        : '',
    isEmulatedLandscape && isReverseEmulation ? 'piano-page--reverse' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={pageClass} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      <div className="piano-stage">
        <div className="piano-toolbar">
          <button type="button" className="piano-tool-btn" onClick={handleClose}>
            <X size={16} />
            <span>나가기</span>
          </button>

          <div className="piano-range-display">
            <span className="piano-range-label">{visibleRangeLabel}</span>
            <span className="piano-mapping-label">키보드 {mappedRangeLabel}</span>
          </div>

          <div className="piano-volume-controls">
            <button
              type="button"
              className="piano-tool-btn"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? '음소거 해제' : '음소거'}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              className="piano-volume-slider"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="음량"
            />
          </div>

          <button
            type="button"
            className={`piano-tool-btn piano-hint-toggle${showGuides ? ' is-on' : ''}`}
            onClick={() => setShowGuides((v) => !v)}
            aria-pressed={showGuides}
          >
            <Keyboard size={16} />
            <span>가이드</span>
          </button>
        </div>

        <div className="piano-content">
          <div
            ref={viewportRef}
            className={`piano-viewport${isPanning ? ' is-panning' : ''}`}
          >
            <div
              ref={scrollRef}
              className="piano-keys-scroll"
              style={{ transform: `translate3d(${offsetX}px, 0, 0)` }}
            >
              <div
                ref={bodyRef}
                className="piano-body piano-pan-surface"
                onPointerDown={handlePanPointerDown}
                onPointerMove={handlePanPointerMove}
                onPointerUp={endPanSession}
                onPointerCancel={endPanSession}
                style={
                  {
                    '--white-count': whiteKeys.length,
                    '--black-ratio': BLACK_KEY_WIDTH_RATIO,
                  } as React.CSSProperties
                }
              >
                <div className="piano-pan-rail piano-pan-rail--top" aria-hidden="true" />
                <div
                  ref={keysAreaRef}
                  className="piano-keys-area"
                  onPointerDown={handleKeysPointerDown}
                  onPointerMove={handleKeysPointerMove}
                >
                  <div className="piano-white-keys">
                    {whiteKeysRendered.map((key) => (
                      <button
                        key={`w-${key.midi}`}
                        type="button"
                        data-midi={key.midi}
                        className={`piano-white-key${activeMidis.has(key.midi) ? ' is-active' : ''}`}
                        aria-label={key.label}
                      >
                        <span className={guideClass()}>
                          <span className="piano-key-note">{key.label}</span>
                          {key.keyboard && (
                            <span className="piano-key-letter">{key.keyboard.toUpperCase()}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="piano-black-keys">
                    {blackKeysRendered.map((key) => (
                      <button
                        key={`b-${key.midi}`}
                        type="button"
                        data-midi={key.midi}
                        className={`piano-black-key${activeMidis.has(key.midi) ? ' is-active' : ''}`}
                        style={getBlackKeyStyle(key.afterWhite ?? 0)}
                        aria-label={key.label}
                      >
                        {key.keyboard && (
                          <span className={guideClass(true)}>
                            <span className="piano-key-letter">{key.keyboard.toUpperCase()}</span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="piano-pan-rail piano-pan-rail--bottom" aria-hidden="true" />
              </div>
            </div>
            {scrollThumb.canScroll && (
              <div
                ref={scrollTrackRef}
                className="piano-scroll-track"
                onPointerDown={handleScrollTrackPointerDown}
                onPointerMove={handleScrollTrackPointerMove}
                onPointerUp={endScrollTrackSession}
                onPointerCancel={endScrollTrackSession}
                aria-label="건반 위치"
              >
                <div
                  className="piano-scroll-thumb"
                  style={{
                    left: `${scrollThumb.left}%`,
                    width: `${scrollThumb.width}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Piano;
