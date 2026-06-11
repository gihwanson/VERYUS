import React from 'react';
import type { GamePastChampion } from '../../utils/gamePastChampions';

interface GamePastChampionsProps {
  champions: GamePastChampion[];
  userUid?: string;
  formatScore: (champion: GamePastChampion) => string;
  formatMeta?: (champion: GamePastChampion) => string;
  platformLabel: string;
}

const GamePastChampions: React.FC<GamePastChampionsProps> = ({
  champions,
  userUid,
  formatScore,
  formatMeta,
  platformLabel,
}) => {
  if (champions.length === 0) return null;

  return (
    <section className="game-past-champions">
      <h4 className="game-past-champions-title">과거최고기록</h4>
      <p className="game-past-champions-desc">
        매주 월요일 00시 초기화 시점의 {platformLabel} 1위 기록입니다.
      </p>
      <ul className="typing-rank-list">
        {champions.map((champion) => {
          const isMe = userUid === champion.uid;
          return (
            <li
              key={champion.id}
              className={`typing-rank-item game-past-champion-item${isMe ? ' is-me' : ''}`}
            >
              <span className="game-past-champion-badge" aria-label="과거최고기록">
                과거최고기록
              </span>
              <div className="typing-rank-info">
                <div className="typing-rank-name">
                  {champion.nickname}
                  {isMe ? ' (나)' : ''}
                </div>
                <div className="typing-rank-meta">
                  {champion.weekLabel}
                  {formatMeta ? ` · ${formatMeta(champion)}` : ''}
                </div>
              </div>
              <span className="typing-rank-score">{formatScore(champion)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default GamePastChampions;
