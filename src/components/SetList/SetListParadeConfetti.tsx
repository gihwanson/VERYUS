import React, { useEffect, useMemo, useState } from 'react';
import './styles.css';

const COLORS = ['#fde68a', '#f9a8d4', '#c4b5fd', '#7dd3fc', '#86efac', '#fda4af'];

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  drift: number;
  shape: 'dot' | 'star';
};

function buildParticles(seed: number, count: number): Particle[] {
  const rand = (i: number) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: 8 + rand(i) * 84,
    delay: rand(i + 1) * 0.12,
    duration: 1.1 + rand(i + 2) * 0.7,
    color: COLORS[Math.floor(rand(i + 3) * COLORS.length)],
    size: 5 + Math.floor(rand(i + 4) * 7),
    drift: -40 + rand(i + 5) * 80,
    shape: rand(i + 6) > 0.65 ? 'star' : 'dot'
  }));
}

interface SetListParadeConfettiProps {
  /** 값이 바뀔 때마다 한 번 터짐 */
  trigger: number;
}

const SetListParadeConfetti: React.FC<SetListParadeConfettiProps> = ({ trigger }) => {
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (trigger <= 0) return;
    setBurstKey(trigger);
  }, [trigger]);

  const particles = useMemo(
    () => (burstKey > 0 ? buildParticles(burstKey, 28) : []),
    [burstKey]
  );

  if (particles.length === 0) return null;

  return (
    <div className="setlist-parade-confetti" aria-hidden>
      {particles.map((p) => (
        <span
          key={`${burstKey}-${p.id}`}
          className={`setlist-parade-confetti-piece setlist-parade-confetti-piece--${p.shape}`}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: p.size,
            height: p.size,
            background: p.shape === 'dot' ? p.color : undefined,
            color: p.shape === 'star' ? p.color : undefined,
            ['--confetti-drift' as string]: `${p.drift}px`
          }}
        />
      ))}
    </div>
  );
};

export default SetListParadeConfetti;
