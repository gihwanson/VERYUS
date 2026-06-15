import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Volume2, VolumeX, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { isTouchPrimaryDevice } from '../utils/pianoOrientation';
import {
  DRUM_PADS,
  DRUM_SAMPLE_CATALOG,
  disposeDrumAudio,
  getDrumVolume,
  getPadSampleSelections,
  isDrumMuted,
  preloadDrumAudio,
  releaseDrumPad,
  setDrumMuted,
  setDrumVolume,
  setPadSampleSource,
  triggerDrumPad,
  type DrumPadId,
} from '../utils/drumSounds';
import { DrumPadArt } from './drum/DrumPadArt';
import '../styles/variables.css';
import '../styles/piano.css';
import '../styles/drum.css';

const PAD_LAYOUT: Record<DrumPadId, { className: string; shortLabel?: string }> = {
  crash: { className: 'drum-pad--crash' },
  ride: { className: 'drum-pad--ride' },
  'tom-high': { className: 'drum-pad--tom-high' },
  'hihat-open': { className: 'drum-pad--hihat-open', shortLabel: '오픈 HH' },
  'hihat-closed': { className: 'drum-pad--hihat-closed' },
  snare: { className: 'drum-pad--snare' },
  'tom-mid': { className: 'drum-pad--tom-mid' },
  'tom-floor': { className: 'drum-pad--tom-floor' },
  kick: { className: 'drum-pad--kick' },
};

const pointerVelocity = (e: React.PointerEvent | PointerEvent): number => {
  if (e.pressure > 0) return 0.65 + e.pressure * 0.35;
  return 0.82 + Math.random() * 0.12;
};

const DrumKit: React.FC = () => {
  const navigate = useNavigate();
  const sourcePickerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(getDrumVolume);
  const [muted, setMuted] = useState(isDrumMuted);
  const [activePads, setActivePads] = useState<Set<DrumPadId>>(new Set());
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [sampleSelections, setSampleSelections] = useState(getPadSampleSelections);
  const [sampleLoading, setSampleLoading] = useState<DrumPadId | null>(null);

  const handleClose = useCallback(() => {
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    void preloadDrumAudio();
    return () => {
      disposeDrumAudio();
    };
  }, []);

  useEffect(() => {
    if (!showSourcePanel) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!sourcePickerRef.current?.contains(e.target as Node)) {
        setShowSourcePanel(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [showSourcePanel]);

  const setPadActive = useCallback((padId: DrumPadId, active: boolean) => {
    setActivePads((prev) => {
      const next = new Set(prev);
      if (active) next.add(padId);
      else next.delete(padId);
      return next;
    });
  }, []);

  const handlePadDown = useCallback(
    (padId: DrumPadId, e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setPadActive(padId, true);
      triggerDrumPad(padId, pointerVelocity(e));
    },
    [setPadActive]
  );

  const handlePadUp = useCallback(
    (padId: DrumPadId, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setPadActive(padId, false);
      releaseDrumPad(padId);
    },
    [setPadActive]
  );

  const handleSampleChange = useCallback(async (padId: DrumPadId, optionId: string) => {
    setSampleLoading(padId);
    try {
      await setPadSampleSource(padId, optionId);
      setSampleSelections(getPadSampleSelections());
      triggerDrumPad(padId, 0.88);
    } catch {
      /* ignore */
    } finally {
      setSampleLoading(null);
    }
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setVolume(next);
    setDrumVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
      setDrumMuted(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setDrumMuted(next);
  };

  const isMobile = isTouchPrimaryDevice();
  const pageClass = ['drum-page', isMobile ? 'drum-page--immersive' : ''].filter(Boolean).join(' ');

  return (
    <div className={pageClass}>
      <div className="drum-stage">
        <div className="piano-toolbar">
          <button type="button" className="piano-tool-btn" onClick={handleClose}>
            <X size={16} />
            <span>나가기</span>
          </button>

          <div className="piano-range-display">
            <span className="piano-range-label">드럼 키트</span>
            <span className="piano-mapping-label">패드를 눌러 연주하세요</span>
          </div>

          <div className="piano-volume-controls">
            <div className="drum-source-picker" ref={sourcePickerRef}>
              <button
                type="button"
                className={`piano-tool-btn${showSourcePanel ? ' is-open' : ''}`}
                onClick={() => setShowSourcePanel((open) => !open)}
                aria-expanded={showSourcePanel}
                aria-haspopup="dialog"
              >
                <SlidersHorizontal size={16} aria-hidden />
                <span>소스</span>
                <ChevronDown size={14} aria-hidden />
              </button>
              {showSourcePanel && (
                <div className="drum-source-panel" role="dialog" aria-label="드럼 소스 선택">
                  <p className="drum-source-panel-title">드럼 소스</p>
                  <p className="drum-source-panel-hint">
                    패드마다 샘플을 고를 수 있습니다. 변경 시 미리듣기가 재생됩니다.
                  </p>
                  {DRUM_PADS.map((pad) => (
                    <div key={pad.id} className="drum-source-row">
                      <label htmlFor={`drum-source-${pad.id}`}>{pad.label}</label>
                      <select
                        id={`drum-source-${pad.id}`}
                        className="drum-source-select"
                        value={sampleSelections[pad.id]}
                        disabled={sampleLoading === pad.id}
                        onChange={(e) => void handleSampleChange(pad.id, e.target.value)}
                      >
                        {DRUM_SAMPLE_CATALOG[pad.id].map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="piano-tool-btn"
              onClick={() => navigate('/instruments/piano')}
            >
              <span aria-hidden>🎹</span>
              <span>피아노</span>
            </button>
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
        </div>

        <p className="drum-title">드럼을 터치해 연주하세요</p>

        <div className="drum-kit-wrap">
          <div className="drum-kit" role="group" aria-label="드럼 키트">
            <div className="drum-kit-backdrop" aria-hidden />
            <div className="drum-kit-rug" aria-hidden />
            <div className="drum-kit-floor" aria-hidden />
            {DRUM_PADS.map((pad) => {
              const layout = PAD_LAYOUT[pad.id];
              const displayLabel = layout.shortLabel ?? pad.label;
              return (
                <button
                  key={pad.id}
                  type="button"
                  className={`drum-pad ${layout.className}${activePads.has(pad.id) ? ' is-active' : ''}`}
                  aria-label={pad.label}
                  onPointerDown={(e) => handlePadDown(pad.id, e)}
                  onPointerUp={(e) => handlePadUp(pad.id, e)}
                  onPointerCancel={(e) => handlePadUp(pad.id, e)}
                  onPointerLeave={(e) => {
                    if (activePads.has(pad.id)) handlePadUp(pad.id, e);
                  }}
                >
                  <DrumPadArt padId={pad.id} label={displayLabel} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrumKit;
