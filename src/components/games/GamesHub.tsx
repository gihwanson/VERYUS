import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  formatNextResetLabel,
  GAME_WEEKLY_RESET_NOTICE,
  getNextMondayResetAtKst,
} from '../../utils/gameWeek';
import '../../styles/variables.css';
import '../../styles/games.css';

interface GameItem {
  id: string;
  title: string;
  description: string;
  emoji: string;
  path?: string;
  available: boolean;
}

const GAMES: GameItem[] = [
  {
    id: 'typing-speed',
    title: '타자 빨리치기',
    description: '랜덤 문장을 가장 빠르게 입력해 순위에 도전하세요.',
    emoji: '⌨️',
    path: '/games/typing-speed',
    available: true,
  },
  {
    id: 'reaction-time',
    title: '반응속도 테스트',
    description: '초록색이 되면 최대한 빠르게 탭해 순위에 도전하세요.',
    emoji: '⚡',
    path: '/games/reaction-time',
    available: true,
  },
  {
    id: 'coming-soon-2',
    title: '미니게임 3',
    description: '곧 추가될 예정입니다.',
    emoji: '🧩',
    available: false,
  },
];

const GamesHub: React.FC = () => {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem('veryus_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const nextResetLabel = useMemo(
    () => formatNextResetLabel(getNextMondayResetAtKst()),
    []
  );

  const handleGameClick = (game: GameItem) => {
    if (!game.available || !game.path) return;
    navigate(game.path);
  };

  return (
    <div className="games-page">
      <div className="games-content">
        <header className="games-header">
          <div>
            <h1 className="games-title">미니게임</h1>
            <p className="games-subtitle">
              {user?.nickname ? `${user.nickname}님, ` : ''}각 게임별 순위에 도전해 보세요.
            </p>
          </div>
        </header>

        <div className="games-reset-notice" role="note">
          <p>{GAME_WEEKLY_RESET_NOTICE}</p>
          <p className="games-reset-notice-sub">다음 초기화: {nextResetLabel}</p>
        </div>

        <div className="games-grid">
          {GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              className="games-card"
              disabled={!game.available}
              onClick={() => handleGameClick(game)}
            >
              <span className="games-card-icon" aria-hidden>{game.emoji}</span>
              <div className="games-card-body">
                <h3>{game.title}</h3>
                <p>{game.description}</p>
              </div>
              {game.available ? (
                <span className="games-card-arrow" aria-hidden>→</span>
              ) : (
                <span className="games-card-arrow" style={{ fontSize: 12, opacity: 0.6 }}>준비중</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GamesHub;
