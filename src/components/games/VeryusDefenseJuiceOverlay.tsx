import React, { useMemo } from 'react';
import type { JuiceToast } from '../../hooks/useDefenseJuice';

type Props = {
  toasts: JuiceToast[];
  showConfetti: boolean;
};

const CONFETTI_PIECES = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  left: `${(i * 17) % 100}%`,
  delay: `${(i % 7) * 0.08}s`,
  color: ['#fde68a', '#f472b6', '#4ade80', '#60a5fa', '#fb923c', '#c4b5fd'][i % 6],
  rotate: `${(i * 47) % 360}deg`,
}));

const VeryusDefenseJuiceOverlay: React.FC<Props> = ({ toasts, showConfetti }) => {
  const pieces = useMemo(() => CONFETTI_PIECES, []);

  return (
    <div className="vd-juice-layer" aria-live="polite">
      {showConfetti && (
        <div className="vd-confetti" aria-hidden>
          {pieces.map((p) => (
            <span
              key={p.id}
              className="vd-confetti-piece"
              style={{
                left: p.left,
                animationDelay: p.delay,
                background: p.color,
                ['--vd-rot' as string]: p.rotate,
              }}
            />
          ))}
        </div>
      )}
      <div className="vd-toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`vd-toast vd-toast--${toast.tone}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VeryusDefenseJuiceOverlay;
