import React, { useEffect, useState } from 'react';

type Props = {
  status: 'won' | 'lost' | null;
  roundNumber?: number;
};

const VeryusDefenseRoundFlash: React.FC<Props> = ({ status, roundNumber }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!status) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 4200);
    return () => window.clearTimeout(t);
  }, [status, roundNumber]);

  if (!visible || !status) return null;

  const won = status === 'won';

  return (
    <div
      className={`vd-round-flash vd-round-flash--${status}`}
      role="status"
      aria-live="assertive"
    >
      <div className="vd-round-flash-inner">
        <span className="vd-round-flash-emoji" aria-hidden>
          {won ? '🏆' : '💥'}
        </span>
        <strong>{won ? '라운드 승리!' : '기지 함락'}</strong>
        <p>
          {won
            ? `라운드 ${roundNumber ?? ''} 클리어 · 협동 보너스 지급`
            : '잠시 후 새 라운드가 시작됩니다'}
        </p>
      </div>
    </div>
  );
};

export default VeryusDefenseRoundFlash;
