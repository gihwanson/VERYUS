import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  formatNextResetLabel,
  GAME_WEEKLY_RESET_NOTICE,
  getNextMondayResetAtKst,
} from '../../utils/gameWeek';
import { detectGamePlatform } from '../../utils/gamePlatform';
import { getEscapeRoomBestScoreDocId } from '../../utils/escapeRoomScores';
import { getReactionBestScoreDocId } from '../../utils/reactionTimeScores';
import { getRhythmBeatBestScoreDocId } from '../../utils/rhythmBeatScores';
import { getTypingBestScoreDocId } from '../../utils/typingSpeedScores';
import { getLastPlayedGame } from '../../utils/lastPlayedGame';
import { LOCKED_PRACTICE_ROOM_AVAILABLE } from '../../data/lockedPracticeRoom';

interface GameItem {
  id: string;
  title: string;
  description: string;
  emoji: string;
  path?: string;
  available: boolean;
}

const COOP_GAME_ITEMS: GameItem[] = [
  {
    id: 'locked-practice-room',
    title: '잠긴 연습실',
    description: LOCKED_PRACTICE_ROOM_AVAILABLE
      ? '단서를 모아 문을 열어라. 시간 제한 없는 방탈출.'
      : '아직 개발 중인 협동전입니다. 조금만 기다려 주세요.',
    emoji: '🔐',
    path: '/games/locked-practice-room',
    available: LOCKED_PRACTICE_ROOM_AVAILABLE,
  },
];

const GAME_ITEMS: GameItem[] = [
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
    description: '5회 측정 후 평균으로 순위에 도전하세요.',
    emoji: '⚡',
    path: '/games/reaction-time',
    available: true,
  },
  {
    id: 'rhythm-beat',
    title: '박자 맞추기',
    description: 'BPM 85~115 메트로놈에 맞춰 탭하고 정확도로 순위에 도전하세요.',
    emoji: '🥁',
    path: '/games/rhythm-beat',
    available: true,
  },
];

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

  const [myTypingCpm, setMyTypingCpm] = useState<number | null>(null);
  const [myReactionMs, setMyReactionMs] = useState<number | null>(null);
  const [myRhythmAccuracy, setMyRhythmAccuracy] = useState<number | null>(null);
  const [myEscapeScore, setMyEscapeScore] = useState<number | null>(null);

  const nextResetLabel = useMemo(
    () => formatNextResetLabel(getNextMondayResetAtKst()),
    []
  );

  const lastPlayedId = useMemo(() => getLastPlayedGame(), []);

  useEffect(() => {
    if (!user?.uid) return;
    const typingId = getTypingBestScoreDocId(user.uid, platform);
    const reactionId = getReactionBestScoreDocId(user.uid, platform);
    const rhythmId = getRhythmBeatBestScoreDocId(user.uid, platform);
    const escapeId = getEscapeRoomBestScoreDocId(user.uid, platform);

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
    const unsubRhythm = onSnapshot(
      doc(db, 'games', 'rhythmBeat', 'bestScores', rhythmId),
      (snap) => {
        setMyRhythmAccuracy(
          snap.exists() && snap.data()?.accuracy !== undefined
            ? Number(snap.data()?.accuracy)
            : null
        );
      }
    );
    const unsubEscape = onSnapshot(
      doc(db, 'games', 'escapeRoom', 'bestScores', escapeId),
      (snap) => {
        setMyEscapeScore(
          snap.exists() && snap.data()?.rankScore !== undefined
            ? Number(snap.data()?.rankScore)
            : null
        );
      }
    );

    return () => {
      unsubTyping();
      unsubReaction();
      unsubRhythm();
      unsubEscape();
    };
  }, [platform, user?.uid]);

  const handleGameClick = (game: GameItem) => {
    if (!game.available || !game.path) return;
    navigate(game.path);
  };

  const cardTeaser = (game: GameItem): string | null => {
    if (game.id === 'typing-speed' && myTypingCpm) {
      return `내 최고 ${myTypingCpm} 타/분`;
    }
    if (game.id === 'reaction-time' && myReactionMs) {
      return `내 최고 ${Math.round(myReactionMs)}ms`;
    }
    if (game.id === 'rhythm-beat' && myRhythmAccuracy != null) {
      return `내 최고 ${myRhythmAccuracy}%`;
    }
    if (game.id === 'locked-practice-room' && myEscapeScore != null) {
      return `내 최고 ${myEscapeScore}점`;
    }
    return null;
  };

  const renderCard = (game: GameItem, variant: 'solo' | 'coop') => {
    const teaser = cardTeaser(game);
    return (
      <button
        key={game.id}
        type="button"
        className={`games-card games-card--${variant}${lastPlayedId === game.id ? ' games-card--recent' : ''}`}
        disabled={!game.available}
        onClick={() => handleGameClick(game)}
      >
        <span className={`games-card-art games-card-art--${game.id}`} aria-hidden>
          {game.emoji}
        </span>
        <div className="games-card-body">
          <h3>{game.title}</h3>
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
  };

  return (
    <div className="games-page">
      <div className="games-content">
        <header className="games-header">
          <div>
            <h1 className="games-title">미니게임</h1>
            <p className="games-subtitle">
              {user?.nickname ? `${user.nickname}님, ` : ''}개인전·협동전에 도전해 보세요.
            </p>
          </div>
        </header>

        <div className="games-reset-notice" role="note">
          <p>{GAME_WEEKLY_RESET_NOTICE}</p>
          <p className="games-reset-notice-sub">다음 초기화: {nextResetLabel}</p>
        </div>

        <section className="games-category">
          <div className="games-category-head">
            <h2 className="games-category-title">개인전</h2>
            <p className="games-category-subtitle">각자 실력으로 순위에 도전하는 미니게임</p>
          </div>
          <div className="games-grid">
            {GAME_ITEMS.map((game) => renderCard(game, 'solo'))}
          </div>
        </section>

        <section className="games-category">
          <div className="games-category-head">
            <h2 className="games-category-title">협동전</h2>
            <p className="games-category-subtitle">함께 풀거나 팀으로 도전하는 미니게임</p>
          </div>
          <div className="games-grid">
            {COOP_GAME_ITEMS.map((game) => renderCard(game, 'coop'))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default GamesHub;
