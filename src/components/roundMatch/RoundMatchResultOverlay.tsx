import React, { useEffect, useState } from 'react';
import type { RoundWinner } from '../../types/contest';

interface Props {
  winner: RoundWinner;
  winnerTeamName: string;
  onDismiss?: () => void;
}

const RoundMatchResultOverlay: React.FC<Props> = ({ winner, winnerTeamName, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const title =
    winner === 'draw'
      ? '무승부!'
      : `${winnerTeamName} 승리!`;

  const emoji = winner === 'draw' ? '🤝' : '🏆';
  const variant = winner === 'draw' ? 'draw' : winner === 'A' ? 'team-a' : 'team-b';

  return (
    <div className="rm-result-overlay" role="dialog" aria-live="polite">
      <div className={`rm-result-card ${variant} ${visible ? 'visible' : ''}`}>
        <div className="rm-result-rings" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="rm-result-confetti" aria-hidden />
        <div className="rm-result-emoji">{emoji}</div>
        <div className="rm-result-title">{title}</div>
        <div className="rm-result-team-name">
          {winner === 'draw' ? '두 팀 모두 멋진 승부였습니다' : winnerTeamName}
        </div>
        {winner !== 'draw' && (
          <div className="rm-result-sub">축하합니다!</div>
        )}
        {onDismiss && (
          <button type="button" className="rm-result-dismiss" onClick={onDismiss}>
            확인
          </button>
        )}
      </div>
    </div>
  );
};

export default RoundMatchResultOverlay;
