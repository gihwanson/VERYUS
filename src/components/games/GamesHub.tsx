import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  formatNextResetLabel,
  GAME_WEEKLY_RESET_NOTICE,
  getNextMondayResetAtKst,
} from '../../utils/gameWeek';
import { detectGamePlatform } from '../../utils/gamePlatform';
import { getReactionBestScoreDocId } from '../../utils/reactionTimeScores';
import { getTypingBestScoreDocId } from '../../utils/typingSpeedScores';
import { checkAdminAccess } from '../AdminTypes';
import { GAME_ID, PRESENCE_TTL_MS } from '../../utils/veryusDefense/constants';
import { getLastPlayedGame } from '../../utils/lastPlayedGame';
import '../../styles/variables.css';
import '../../styles/games.css';

interface GameItem {
  id: string;
  title: string;
  description: string;
  emoji: string;
  path?: string;
  available: boolean;
  category: 'solo' | 'coop';
  /** true면 운영진·리더·지정 관리자만 목록에 표시 */
  adminOnly?: boolean;
}

interface GameCategory {
  id: string;
  title: string;
  subtitle: string;
  games: GameItem[];
}

const GAME_ITEMS: GameItem[] = [
  {
    id: 'typing-speed',
    title: '타자 빨리치기',
    description: '랜덤 문장을 가장 빠르게 입력해 순위에 도전하세요.',
    emoji: '⌨️',
    path: '/games/typing-speed',
    available: true,
    category: 'solo',
  },
  {
    id: 'reaction-time',
    title: '반응속도 테스트',
    description: '5회 측정 후 최고 기록으로 순위에 도전하세요.',
    emoji: '⚡',
    path: '/games/reaction-time',
    available: true,
    category: 'solo',
  },
  {
    id: 'veryus-defense',
    title: '베리어스 디펜스',
    description:
      '베리어스 기지를 지키며 멤버 유닛을 출격시켜 몬스터 기지를 파괴하세요. 활동 순위가 기본 스탯이 됩니다.',
    emoji: '🏰',
    path: '/games/veryus-defense',
    available: true,
    category: 'coop',
    adminOnly: true,
  },
];

const buildGameCategories = (isAdmin: boolean): GameCategory[] => {
  const visibleGames = GAME_ITEMS.filter((g) => !g.adminOnly || isAdmin);
  return [
    {
      id: 'solo',
      title: '개인전',
      subtitle: '각자 실력으로 순위에 도전하는 미니게임',
      games: visibleGames.filter((g) => g.category === 'solo'),
    },
    {
      id: 'coop',
      title: '협동전',
      subtitle: '전 멤버가 함께 싸우는 상시 진행 게임',
      games: visibleGames.filter((g) => g.category === 'coop'),
    },
  ].filter((category) => category.games.length > 0);
};

const GamesHub: React.FC = () => {
  const navigate = useNavigate();
  const platform = useMemo(() => detectGamePlatform(), []);

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem('veryus_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [defenseOnline, setDefenseOnline] = useState(0);
  const [defenseRound, setDefenseRound] = useState<number | null>(null);
  const [defenseWinStreak, setDefenseWinStreak] = useState(0);
  const [myTypingCpm, setMyTypingCpm] = useState<number | null>(null);
  const [myReactionMs, setMyReactionMs] = useState<number | null>(null);

  const nextResetLabel = useMemo(
    () => formatNextResetLabel(getNextMondayResetAtKst()),
    []
  );

  const lastPlayedId = useMemo(() => getLastPlayedGame(), []);
  const isAdmin = useMemo(() => checkAdminAccess(user), [user]);
  const gameCategories = useMemo(() => buildGameCategories(isAdmin), [isAdmin]);
  const showDefenseNotice = isAdmin;

  useEffect(() => {
    if (!isAdmin) return;

    const unsubPresence = onSnapshot(collection(db, 'games', GAME_ID, 'presence'), (snap) => {
      const now = Date.now();
      let count = 0;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.inGame !== true) return;
        const lastSeen = data.lastSeenAt?.toMillis?.() ?? 0;
        if (now - lastSeen <= PRESENCE_TTL_MS) count += 1;
      });
      setDefenseOnline(count);
    });

    let unsubRound: (() => void) | undefined;
    const unsubGame = onSnapshot(doc(db, 'games', GAME_ID), (snap) => {
      const data = snap.data();
      setDefenseWinStreak(Number(data?.communityWinStreak) || 0);
      const roundId = data?.activeRoundId ? String(data.activeRoundId) : null;
      unsubRound?.();
      if (!roundId) {
        setDefenseRound(null);
        return;
      }
      unsubRound = onSnapshot(doc(db, 'games', GAME_ID, 'rounds', roundId), (roundSnap) => {
        const roundData = roundSnap.data();
        setDefenseRound(Number(roundData?.roundNumber) || null);
      });
    });

    return () => {
      unsubPresence();
      unsubGame();
      unsubRound?.();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!user?.uid) return;
    const typingId = getTypingBestScoreDocId(user.uid, platform);
    const reactionId = getReactionBestScoreDocId(user.uid, platform);

    const unsubTyping = onSnapshot(
      doc(db, 'games', 'typingSpeed', 'bestScores', typingId),
      (snap) => {
        setMyTypingCpm(snap.exists() ? Number(snap.data()?.cpm) || null : null);
      }
    );
    const unsubReaction = onSnapshot(
      doc(db, 'games', 'reactionTime', 'bestScores', reactionId),
      (snap) => {
        setMyReactionMs(snap.exists() ? Number(snap.data()?.durationMs) || null : null);
      }
    );

    return () => {
      unsubTyping();
      unsubReaction();
    };
  }, [platform, user?.uid]);

  const handleGameClick = (game: GameItem) => {
    if (!game.available || !game.path) return;
    navigate(game.path);
  };

  const cardTeaser = (game: GameItem): string | null => {
    if (game.id === 'veryus-defense') {
      const parts: string[] = [];
      if (defenseOnline > 0) parts.push(`접속 ${defenseOnline}명`);
      if (defenseRound) parts.push(`라운드 ${defenseRound}`);
      if (defenseWinStreak > 0) parts.push(`${defenseWinStreak}연승`);
      return parts.length > 0 ? parts.join(' · ') : '실시간 협동 전장';
    }
    if (game.id === 'typing-speed' && myTypingCpm) {
      return `내 최고 ${myTypingCpm} 타/분`;
    }
    if (game.id === 'reaction-time' && myReactionMs) {
      return `내 최고 ${Math.round(myReactionMs)}ms`;
    }
    return null;
  };

  return (
    <div className="games-page">
      <div className="games-content">
        <header className="games-header">
          <div>
            <h1 className="games-title">미니게임</h1>
            <p className="games-subtitle">
              {user?.nickname ? `${user.nickname}님, ` : ''}개인전과 협동전에 도전해 보세요.
            </p>
          </div>
        </header>

        <div className="games-reset-notice" role="note">
          <p>{GAME_WEEKLY_RESET_NOTICE}</p>
          <p className="games-reset-notice-sub">다음 초기화: {nextResetLabel}</p>
          {showDefenseNotice && (
            <p className="games-reset-notice-sub">협동전(베리어스 디펜스)은 주간 초기화 대상이 아닙니다.</p>
          )}
        </div>

        {gameCategories.map((category) => (
          <section key={category.id} className="games-category">
            <div className="games-category-head">
              <h2 className="games-category-title">{category.title}</h2>
              <p className="games-category-subtitle">{category.subtitle}</p>
            </div>
            <div className="games-grid">
              {category.games.map((game) => {
                const teaser = cardTeaser(game);
                return (
                  <button
                    key={game.id}
                    type="button"
                    className={`games-card games-card--${game.category}${lastPlayedId === game.id ? ' games-card--recent' : ''}`}
                    disabled={!game.available}
                    onClick={() => handleGameClick(game)}
                  >
                    <span className={`games-card-art games-card-art--${game.id}`} aria-hidden>
                      {game.emoji}
                    </span>
                    <div className="games-card-body">
                      <h3>
                        {game.title}
                        {lastPlayedId === game.id && (
                          <span className="games-card-recent-badge">최근 플레이</span>
                        )}
                      </h3>
                      <p>{game.description}</p>
                      {teaser && <p className="games-card-teaser">{teaser}</p>}
                    </div>
                    {game.available ? (
                      <span className="games-card-arrow" aria-hidden>
                        →
                      </span>
                    ) : (
                      <span className="games-card-arrow games-card-arrow--muted">준비중</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default GamesHub;
