import React, { useMemo } from 'react';

const PIECES = Array.from({ length: 32 }, (_, i) => ({
  id: i,
  left: `${(i * 19) % 100}%`,
  delay: `${(i % 6) * 0.07}s`,
  color: ['#fde68a', '#f472b6', '#4ade80', '#60a5fa', '#fb923c', '#c4b5fd'][i % 6],
  rotate: `${(i * 41) % 360}deg`,
}));

const GameConfetti: React.FC<{ show: boolean }> = ({ show }) => {
  const pieces = useMemo(() => PIECES, []);
  if (!show) return null;

  return (
    <div className="game-confetti" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="game-confetti-piece"
          style={{
            left: p.left,
            animationDelay: p.delay,
            background: p.color,
            ['--game-confetti-rot' as string]: p.rotate,
          }}
        />
      ))}
    </div>
  );
};

export default GameConfetti;
