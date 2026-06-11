import React from 'react';
import type { EnemyInstrumentId } from '../../utils/veryusDefense/enemyTheme';

type TambourineProps = {
  size: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

export const TambourineGraphic: React.FC<TambourineProps> = ({ size, className = '' }) => (
  <div className={`vd-tambourine vd-tambourine--${size} ${className}`.trim()} aria-hidden>
    <div className="vd-tambourine-ring">
      <span className="vd-tambourine-zil vd-tambourine-zil--1" />
      <span className="vd-tambourine-zil vd-tambourine-zil--2" />
      <span className="vd-tambourine-zil vd-tambourine-zil--3" />
      <span className="vd-tambourine-zil vd-tambourine-zil--4" />
      <span className="vd-tambourine-zil vd-tambourine-zil--5" />
      <span className="vd-tambourine-zil vd-tambourine-zil--6" />
      <div className="vd-tambourine-head" />
    </div>
    <div className="vd-tambourine-handle" />
  </div>
);

type InstrumentSpriteProps = {
  instrumentId: EnemyInstrumentId;
  emoji: string;
  size: 'sm' | 'md' | 'lg';
};

export const EnemyInstrumentSprite: React.FC<InstrumentSpriteProps> = ({
  instrumentId,
  emoji,
  size,
}) => {
  if (instrumentId === 'tambourine') {
    return <TambourineGraphic size={size === 'lg' ? 'md' : 'sm'} />;
  }

  return (
    <span
      className={`vd-instrument-emoji vd-instrument-emoji--${instrumentId} vd-instrument-emoji--${size}`}
      aria-hidden
    >
      {emoji}
    </span>
  );
};

export const AllyBaseGraphic: React.FC = () => (
  <div className="vd-ally-base-graphic" aria-hidden>
    <div className="vd-ally-base-glow" />
    <div className="vd-ally-base-tower">
      <span className="vd-ally-base-emoji">🏰</span>
      <span className="vd-ally-base-note vd-ally-base-note--a">♪</span>
      <span className="vd-ally-base-note vd-ally-base-note--b">♫</span>
    </div>
    <div className="vd-ally-base-platform" />
  </div>
);

export const EnemyBaseGraphic: React.FC = () => (
  <div className="vd-enemy-base-graphic" aria-hidden>
    <div className="vd-enemy-base-glow" />
    <TambourineGraphic size="xl" className="vd-enemy-base-tambourine" />
    <div className="vd-enemy-base-platform" />
  </div>
);
