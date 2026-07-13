import React from 'react';
import type { PastChampionDisplay } from '../../utils/gamePastChampions';

interface GamePastChampionsProps {
  champions: PastChampionDisplay[];
  userUid?: string;
  formatScore: (champion: PastChampionDisplay) => string;
  formatMeta?: (champion: PastChampionDisplay) => string;
  platformLabel: string;
}

const kindLabel = (kind: PastChampionDisplay['kind'], alone: boolean): string => {
  if (alone && kind === 'allTimeBest') return '역대 최고';
  if (kind === 'allTimeBest') return '역대 최고';
  return '최근 기록';
};

const GamePastChampions: React.FC<GamePastChampionsProps> = ({
  champions,
  userUid,
  formatScore,
  formatMeta,
  platformLabel,
}) => {
  if (champions.length === 0) return null;

  const alone = champions.length === 1;

  return (
    <section className="game-past-champions">
      <h4 className="game-past-champions-title">과거최고기록</h4>
      <p className="game-past-champions-desc">
        {platformLabel} 기준 역대 최고 기록과 바로 직전(최근) 주간 1위만 표시합니다.
      </p>
      <ul className="typing-rank-list">
        {champions.map((champion) => {
          const isMe = userUid === champion.uid;
          const badge = kindLabel(champion.kind, alone);
          return (
            <li
              key={`${champion.kind}-${champion.id}`}
              className={`typing-rank-item game-past-champion-item${isMe ? ' is-me' : ''}`}
            >
              <span className="game-past-champion-badge" aria-label={badge}>
                {badge}
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
