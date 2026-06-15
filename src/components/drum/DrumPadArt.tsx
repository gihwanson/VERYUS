import React, { useId } from 'react';
import type { DrumPadId } from '../../utils/drumSounds';

interface DrumArtProps {
  className?: string;
}

/** 탐 — 나무 쉘 + 크롬 림 + 드럼 헤드 */
export const TomArt: React.FC<DrumArtProps & { size?: 'sm' | 'md' | 'lg' }> = ({
  className,
  size = 'md',
}) => {
  const id = useId().replace(/:/g, '');
  const shell =
    size === 'lg' ? '#6b3f28' : size === 'sm' ? '#5a3522' : '#624028';
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`${id}-shell`} cx="50%" cy="50%" r="50%">
          <stop offset="72%" stopColor={shell} />
          <stop offset="88%" stopColor="#8b5a3c" />
          <stop offset="100%" stopColor="#c8a882" />
        </radialGradient>
        <radialGradient id={`${id}-head`} cx="42%" cy="38%" r="58%">
          <stop offset="0%" stopColor="#f8f4ec" />
          <stop offset="55%" stopColor="#e8e0d4" />
          <stop offset="100%" stopColor="#c8beb0" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0f0f4" />
          <stop offset="50%" stopColor="#a8a8b0" />
          <stop offset="100%" stopColor="#e8e8ec" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-shell)`} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <circle
          key={deg}
          cx={50 + 44 * Math.cos((deg * Math.PI) / 180)}
          cy={50 + 44 * Math.sin((deg * Math.PI) / 180)}
          r="2.8"
          fill="#b0b0b8"
          stroke="#707078"
          strokeWidth="0.5"
        />
      ))}
      <circle cx="50" cy="50" r="40" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="3.5" />
      <circle cx="50" cy="50" r="36" fill={`url(#${id}-head)`} />
      <circle cx="50" cy="50" r="4" fill="rgba(0,0,0,0.06)" />
      <ellipse cx="38" cy="36" rx="12" ry="8" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
};

/** 스네어 — 밝은 헤드 + 스네어 와이어 힌트 */
export const SnareArt: React.FC<DrumArtProps> = ({ className }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`${id}-shell`} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#4a4a52" />
          <stop offset="88%" stopColor="#707078" />
          <stop offset="100%" stopColor="#b0b0b8" />
        </radialGradient>
        <radialGradient id={`${id}-head`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f0ece4" />
          <stop offset="100%" stopColor="#d8d0c4" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-shell)`} />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
        <circle
          key={deg}
          cx={50 + 44 * Math.cos((deg * Math.PI) / 180)}
          cy={50 + 44 * Math.sin((deg * Math.PI) / 180)}
          r="2.2"
          fill="#c8c8d0"
          stroke="#888890"
          strokeWidth="0.4"
        />
      ))}
      <circle cx="50" cy="50" r="40" fill="none" stroke="#d0d0d8" strokeWidth="3" />
      <circle cx="50" cy="50" r="36" fill={`url(#${id}-head)`} />
      {[-18, -6, 6, 18].map((y) => (
        <line
          key={y}
          x1="22"
          y1={50 + y}
          x2="78"
          y2={50 + y}
          stroke="rgba(160,150,140,0.35)"
          strokeWidth="0.8"
        />
      ))}
      <ellipse cx="36" cy="34" rx="14" ry="9" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
};

/** 킥 — 베이스 드럼, 포트홀 + 두꺼운 쉘 */
export const KickArt: React.FC<DrumArtProps> = ({ className }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`${id}-shell`} cx="50%" cy="50%" r="50%">
          <stop offset="65%" stopColor="#1a1a20" />
          <stop offset="82%" stopColor="#3a3a44" />
          <stop offset="100%" stopColor="#888890" />
        </radialGradient>
        <radialGradient id={`${id}-head`} cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#3a3a42" />
          <stop offset="70%" stopColor="#222228" />
          <stop offset="100%" stopColor="#121218" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-shell)`} />
      {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((deg) => (
        <rect
          key={deg}
          x="48"
          y="6"
          width="4"
          height="7"
          rx="1"
          fill="#a0a0a8"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="41" fill="none" stroke="#c0c0c8" strokeWidth="4" />
      <circle cx="50" cy="50" r="37" fill={`url(#${id}-head)`} />
      <circle cx="62" cy="58" r="9" fill="#0a0a0e" stroke="#505058" strokeWidth="1.5" />
      <circle cx="62" cy="58" r="6" fill="#181820" />
      <ellipse cx="38" cy="36" rx="16" ry="10" fill="rgba(255,255,255,0.08)" />
    </svg>
  );
};

/** 심벌 — 크래시 / 라이드 */
export const CymbalArt: React.FC<DrumArtProps & { variant?: 'crash' | 'ride' }> = ({
  className,
  variant = 'crash',
}) => {
  const id = useId().replace(/:/g, '');
  const rot = variant === 'crash' ? -12 : 8;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`${id}-cym`} cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor="#fff8d8" />
          <stop offset="25%" stopColor="#e8c878" />
          <stop offset="55%" stopColor="#c8a040" />
          <stop offset="85%" stopColor="#987828" />
          <stop offset="100%" stopColor="#604818" />
        </radialGradient>
      </defs>
      <ellipse
        cx="50"
        cy="52"
        rx="46"
        ry={variant === 'ride' ? 44 : 42}
        fill={`url(#${id}-cym)`}
        transform={`rotate(${rot} 50 50)`}
      />
      {[20, 35, 50, 65, 80].map((r) => (
        <ellipse
          key={r}
          cx="50"
          cy="52"
          rx={r * 0.46}
          ry={r * 0.42}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.5"
          transform={`rotate(${rot} 50 50)`}
        />
      ))}
      <circle
        cx="50"
        cy="52"
        r={variant === 'ride' ? 8 : 6}
        fill="#b89030"
        stroke="#806020"
        strokeWidth="1"
        transform={`rotate(${rot} 50 50)`}
      />
      <ellipse
        cx="38"
        cy="40"
        rx="14"
        ry="8"
        fill="rgba(255,255,255,0.25)"
        transform={`rotate(${rot} 50 50)`}
      />
    </svg>
  );
};

/** 하이햇 — 닫힘 / 열림 */
export const HiHatArt: React.FC<DrumArtProps & { open?: boolean }> = ({ className, open }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`${id}-hat`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fff0c0" />
          <stop offset="50%" stopColor="#d8b050" />
          <stop offset="100%" stopColor="#907020" />
        </radialGradient>
      </defs>
      {open && (
        <ellipse cx="46" cy="44" rx="38" ry="34" fill="#a08030" opacity="0.85" transform="rotate(-6 46 44)" />
      )}
      <ellipse
        cx="50"
        cy={open ? 56 : 52}
        rx="40"
        ry="36"
        fill={`url(#${id}-hat)`}
        transform={open ? 'rotate(4 50 56)' : 'rotate(-4 50 52)'}
      />
      {!open && (
        <ellipse cx="52" cy="50" rx="38" ry="34" fill="#c8a040" opacity="0.5" transform="rotate(2 52 50)" />
      )}
      <circle cx="50" cy="52" r="4" fill="#706018" />
      <ellipse cx="38" cy="42" rx="10" ry="6" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
};

const ART_MAP: Record<DrumPadId, React.FC<DrumArtProps>> = {
  kick: KickArt,
  snare: SnareArt,
  'tom-high': (p) => <TomArt {...p} size="sm" />,
  'tom-mid': (p) => <TomArt {...p} size="md" />,
  'tom-floor': (p) => <TomArt {...p} size="lg" />,
  'hihat-closed': (p) => <HiHatArt {...p} open={false} />,
  'hihat-open': (p) => <HiHatArt {...p} open />,
  crash: (p) => <CymbalArt {...p} variant="crash" />,
  ride: (p) => <CymbalArt {...p} variant="ride" />,
};

export const DrumPadArt: React.FC<{ padId: DrumPadId; label: string }> = ({ padId, label }) => {
  const Art = ART_MAP[padId];
  return (
    <>
      <div className="drum-pad-visual">
        <Art className="drum-pad-art" />
      </div>
      <span className="drum-pad-label">{label}</span>
    </>
  );
};
