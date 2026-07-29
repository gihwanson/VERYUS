import React, { useEffect, useMemo } from 'react';
import './LogoCherryRain.css';

interface LogoCherryRainProps {
  active: boolean;
  onDone: () => void;
}

interface CherrySpec {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
  spin: number;
}

function buildCherries(): CherrySpec[] {
  return Array.from({ length: 28 }, (_, id) => ({
    id,
    left: Math.random() * 100,
    delay: Math.random() * 0.9,
    duration: 2.1 + Math.random() * 1.6,
    size: 18 + Math.random() * 20,
    drift: (Math.random() - 0.5) * 120,
    spin: 180 + Math.random() * 360,
  }));
}

const LogoCherryRain: React.FC<LogoCherryRainProps> = ({ active, onDone }) => {
  const cherries = useMemo(() => (active ? buildCherries() : []), [active]);

  useEffect(() => {
    if (!active) return;
    const maxMs =
      Math.max(...cherries.map((c) => (c.delay + c.duration) * 1000), 2500) + 200;
    const timer = window.setTimeout(onDone, maxMs);
    return () => window.clearTimeout(timer);
  }, [active, cherries, onDone]);

  if (!active) return null;

  return (
    <div className="logo-cherry-rain" aria-hidden>
      {cherries.map((cherry) => (
        <span
          key={cherry.id}
          className="logo-cherry-rain__item"
          style={
            {
              left: `${cherry.left}%`,
              fontSize: `${cherry.size}px`,
              animationDelay: `${cherry.delay}s`,
              animationDuration: `${cherry.duration}s`,
              '--cherry-drift': `${cherry.drift}px`,
              '--cherry-spin': `${cherry.spin}deg`,
            } as React.CSSProperties
          }
        >
          🍒
        </span>
      ))}
    </div>
  );
};

export default LogoCherryRain;
