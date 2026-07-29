import React from 'react';

/** 위에서 떨어지는 반짝 가루 파티클 */
const SPARKLE_BITS = [
  { left: '6%', delay: '0s', duration: '1.35s', size: 2.4, drift: -4 },
  { left: '18%', delay: '0.35s', duration: '1.55s', size: 2, drift: 3 },
  { left: '30%', delay: '0.7s', duration: '1.25s', size: 2.6, drift: -2 },
  { left: '42%', delay: '0.15s', duration: '1.45s', size: 1.8, drift: 5 },
  { left: '54%', delay: '0.9s', duration: '1.6s', size: 2.2, drift: -3 },
  { left: '66%', delay: '0.45s', duration: '1.3s', size: 2.5, drift: 2 },
  { left: '78%', delay: '0.2s', duration: '1.5s', size: 2, drift: -5 },
  { left: '90%', delay: '0.8s', duration: '1.4s', size: 2.3, drift: 4 },
  { left: '12%', delay: '1.05s', duration: '1.7s', size: 1.7, drift: 1 },
  { left: '48%', delay: '1.2s', duration: '1.35s', size: 2.1, drift: -1 },
  { left: '72%', delay: '0.55s', duration: '1.65s', size: 1.9, drift: 3 },
  { left: '84%', delay: '1.1s', duration: '1.4s', size: 2.4, drift: -2 },
] as const;

const GradeFxSparkleDust: React.FC = () => (
  <span className="grade-fx-sparkle-dust" aria-hidden>
    {SPARKLE_BITS.map((bit, index) => (
      <span
        key={index}
        className="grade-fx-sparkle-dust__bit"
        style={
          {
            left: bit.left,
            width: bit.size,
            height: bit.size,
            animationDelay: bit.delay,
            animationDuration: bit.duration,
            '--sparkle-drift': `${bit.drift}px`,
          } as React.CSSProperties
        }
      />
    ))}
  </span>
);

export default GradeFxSparkleDust;
