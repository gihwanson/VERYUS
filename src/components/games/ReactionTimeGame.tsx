import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { detectGamePlatform, type GamePlatform } from '../../utils/gamePlatform';
import {
  MAX_REACTION_MS,
  saveReactionBestScore,
  type ReactionBestScore,
} from '../../utils/reactionTimeScores';
import {
  sortPastChampions,
  type GamePastChampion,
} from '../../utils/gamePastChampions';
import GamePastChampions from './GamePastChampions';
import '../../styles/variables.css';
import '../../styles/games.css';

type GamePhase = 'idle' | 'waiting' | 'go' | 'false_start' | 'timeout' | 'finished';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'skipped' | 'error';

interface LeaderboardEntry {
  uid: string;
  nickname: string;
  bestDurationMs: number;
  attemptCount: number;
}

const WAIT_MIN_MS = 1500;
const WAIT_MAX_MS = 5000;
const GO_TIMEOUT_MS = MAX_REACTION_MS;

const formatReactionMs = (ms: number): string => `${Math.round(ms)}ms`;

const randomWaitMs = (): number =>
  WAIT_MIN_MS + Math.floor(Math.random() * (WAIT_MAX_MS - WAIT_MIN_MS + 1));

const buildLeaderboard = (
  scores: ReactionBestScore[],
  platform: GamePlatform
): LeaderboardEntry[] =>
  scores
    .filter((s) => s.platform === platform)
    .sort((a, b) => a.durationMs - b.durationMs)
    .map((s) => ({
      uid: s.uid,
      nickname: s.nickname,
      bestDurationMs: s.durationMs,
      attemptCount: s.attemptCount,
    }));

const ReactionTimeGame: React.FC = () => {
  const navigate = useNavigate();
  const waitTimerRef = useRef<number | null>(null);
  const goTimerRef = useRef<number | null>(null);
  const goTimeRef = useRef<number | null>(null);
  const phaseRef = useRef<GamePhase>('idle');
  const finishedRef = useRef(false);

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem('veryus_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [platform] = useState<GamePlatform>(detectGamePlatform);
  const [leaderboardTab, setLeaderboardTab] = useState<GamePlatform>(platform);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [finalResult, setFinalResult] = useState<number | null>(null);
  const [bestScores, setBestScores] = useState<ReactionBestScore[]>([]);
  const [pastChampions, setPastChampions] = useState<GamePastChampion[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const setPhaseSafe = useCallback((next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (waitTimerRef.current !== null) {
      window.clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (goTimerRef.current !== null) {
      window.clearTimeout(goTimerRef.current);
      goTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'games', 'reactionTime', 'bestScores'),
      (snap) => {
        setLoadError(null);
        setBestScores(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ReactionBestScore, 'id'>),
          }))
        );
      },
      (err) => {
        console.error('순위표 불러오기 실패:', err);
        setLoadError('순위표를 불러오지 못했습니다. Firestore 규칙 배포 여부를 확인해주세요.');
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'games', 'reactionTime', 'pastChampions'),
      (snap) => {
        setPastChampions(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<GamePastChampion, 'id'>),
          }))
        );
      },
      (err) => {
        console.error('과거최고기록 불러오기 실패:', err);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const leaderboard = useMemo(
    () => buildLeaderboard(bestScores, leaderboardTab),
    [bestScores, leaderboardTab]
  );

  const pastChampionsForTab = useMemo(
    () => sortPastChampions(pastChampions, leaderboardTab),
    [pastChampions, leaderboardTab]
  );

  const myRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = leaderboard.findIndex((e) => e.uid === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, user?.uid]);

  const saveScore = useCallback(
    async (durationMs: number) => {
      if (!user?.uid || !user?.nickname) {
        setSaveStatus('skipped');
        setSaveDetail('로그인 정보가 없어 기록을 저장하지 못했습니다.');
        return;
      }

      setSaveStatus('saving');
      setSaveDetail(null);
      try {
        const result = await saveReactionBestScore({
          uid: user.uid,
          nickname: user.nickname,
          durationMs,
          platform,
        });
        setSaveStatus('saved');
        setLeaderboardTab(platform);
        setSaveDetail(
          result.isNewBest
            ? `${platform === 'pc' ? 'PC' : '모바일'} 신기록! (${result.attemptCount}회째 도전)`
            : `최고 기록 ${formatReactionMs(result.bestDurationMs)} 유지 (${result.attemptCount}회째 도전)`
        );
      } catch (e) {
        console.error('점수 저장 실패:', e);
        setSaveStatus('error');
        setSaveDetail(
          e instanceof Error
            ? e.message
            : '기록 저장에 실패했습니다. Firestore 규칙이 배포되었는지 확인해주세요.'
        );
      }
    },
    [platform, user]
  );

  const finishGame = useCallback(
    (durationMs: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      setFinalResult(durationMs);
      setPhaseSafe('finished');
      void saveScore(durationMs);
    },
    [clearTimers, saveScore, setPhaseSafe]
  );

  const beginWaiting = useCallback(() => {
    clearTimers();
    finishedRef.current = false;
    goTimeRef.current = null;
    setFinalResult(null);
    setSaveStatus('idle');
    setSaveDetail(null);
    setPhaseSafe('waiting');

    waitTimerRef.current = window.setTimeout(() => {
      const now = Date.now();
      goTimeRef.current = now;
      setPhaseSafe('go');

      goTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'go' || finishedRef.current) return;
        finishedRef.current = true;
        clearTimers();
        setPhaseSafe('timeout');
      }, GO_TIMEOUT_MS);
    }, randomWaitMs());
  }, [clearTimers, setPhaseSafe]);

  const startGame = useCallback(() => {
    beginWaiting();
  }, [beginWaiting]);

  const handleReactionTap = useCallback(() => {
    const current = phaseRef.current;

    if (current === 'idle') return;

    if (current === 'waiting') {
      clearTimers();
      finishedRef.current = true;
      setPhaseSafe('false_start');
      return;
    }

    if (current === 'go' && goTimeRef.current !== null && !finishedRef.current) {
      const durationMs = Date.now() - goTimeRef.current;
      finishGame(durationMs);
    }
  }, [clearTimers, finishGame, setPhaseSafe]);

  const phaseMessage = useMemo(() => {
    switch (phase) {
      case 'idle':
        return { title: '준비되셨나요?', hint: '시작 버튼을 누르면 테스트가 시작됩니다.' };
      case 'waiting':
        return { title: '기다리세요...', hint: '초록색이 될 때까지 누르지 마세요.' };
      case 'go':
        return { title: '지금!', hint: '최대한 빠르게 탭하세요.' };
      case 'false_start':
        return { title: '너무 빨라요!', hint: '초록색이 되기 전에 눌렀습니다. 다시 도전해 보세요.' };
      case 'timeout':
        return { title: '시간 초과', hint: '반응이 너무 늦었습니다. 다시 도전해 보세요.' };
      case 'finished':
        return finalResult !== null
          ? { title: formatReactionMs(finalResult), hint: '반응 속도' }
          : { title: '완료', hint: '' };
      default:
        return { title: '', hint: '' };
    }
  }, [finalResult, phase]);

  const saveStatusMessage = useMemo(() => {
    if (saveStatus === 'saving') return '저장 중...';
    if (saveStatus === 'saved') return saveDetail ?? '저장됨';
    if (saveStatus === 'skipped' || saveStatus === 'error') return saveDetail ?? '저장 실패';
    return '';
  }, [saveDetail, saveStatus]);

  return (
    <div className="games-page">
      <div className="games-content">
        <header className="games-header">
          <button type="button" className="games-back-btn" onClick={() => navigate('/games')}>
            ← 게임 목록
          </button>
        </header>

        <h1 className="games-title" style={{ marginBottom: 8 }}>
          반응속도 테스트
        </h1>
        <p className="games-subtitle" style={{ marginBottom: 20 }}>
          초록색이 되면 최대한 빠르게 탭하세요. 빠를수록 순위가 올라갑니다.
        </p>

        <div className="typing-game-panel">
          <div className="typing-platform-badge">
            {platform === 'pc' ? '🖥️ PC 모드' : '📱 모바일 모드'}
            <span style={{ opacity: 0.75, fontWeight: 400 }}>
              · 기록은 {platform === 'pc' ? 'PC' : '모바일'} 순위표에 저장됩니다
            </span>
          </div>

          {phase === 'idle' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ marginBottom: 20, opacity: 0.9 }}>
                빨간 화면에서는 기다렸다가, 초록색이 되면 바로 탭하세요.
                <br />
                빨간색일 때 누르면 실패 처리됩니다.
              </p>
              <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                시작하기
              </button>
            </div>
          )}

          {phase !== 'idle' && (
            <>
              <button
                type="button"
                className={`reaction-zone reaction-zone--${phase}`}
                onClick={handleReactionTap}
                disabled={phase === 'finished' || phase === 'false_start' || phase === 'timeout'}
                aria-label={phaseMessage.title}
              >
                <span className="reaction-zone-title">{phaseMessage.title}</span>
                <span className="reaction-zone-hint">{phaseMessage.hint}</span>
              </button>

              {phase === 'finished' && finalResult !== null && (
                <div
                  className={`typing-result${saveStatus === 'error' || saveStatus === 'skipped' ? ' typing-result--error' : ''}`}
                >
                  <h4>완료!</h4>
                  <p>
                    {formatReactionMs(finalResult)}
                    {saveStatusMessage ? ` (${saveStatusMessage})` : ''}
                  </p>
                  {saveStatus === 'saved' && myRank && leaderboardTab === platform && (
                    <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                      현재 {platform === 'pc' ? 'PC' : '모바일'} 순위: <strong>{myRank}위</strong>
                    </p>
                  )}
                  {(saveStatus === 'error' || saveStatus === 'skipped') && (
                    <button
                      type="button"
                      className="typing-btn typing-btn-secondary"
                      style={{ marginTop: 12 }}
                      onClick={() => void saveScore(finalResult)}
                    >
                      다시 저장 시도
                    </button>
                  )}
                </div>
              )}

              <div className="typing-actions">
                {(phase === 'finished' || phase === 'false_start' || phase === 'timeout') && (
                  <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                    다시 도전
                  </button>
                )}
                {(phase === 'waiting' || phase === 'go') && (
                  <button
                    type="button"
                    className="typing-btn typing-btn-secondary"
                    onClick={() => {
                      clearTimers();
                      finishedRef.current = false;
                      goTimeRef.current = null;
                      setFinalResult(null);
                      setSaveStatus('idle');
                      setSaveDetail(null);
                      setPhaseSafe('idle');
                    }}
                  >
                    포기
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <section className="typing-leaderboard">
          <h3>순위표</h3>
          <div className="typing-platform-tabs">
            <button
              type="button"
              className={`typing-platform-tab${leaderboardTab === 'pc' ? ' active' : ''}`}
              onClick={() => setLeaderboardTab('pc')}
            >
              🖥️ PC
            </button>
            <button
              type="button"
              className={`typing-platform-tab${leaderboardTab === 'mobile' ? ' active' : ''}`}
              onClick={() => setLeaderboardTab('mobile')}
            >
              📱 모바일
            </button>
          </div>

          {loadError && (
            <p className="typing-empty" style={{ color: '#fecaca' }}>
              {loadError}
            </p>
          )}

          {!loadError && leaderboard.length === 0 ? (
            <p className="typing-empty">
              아직 {leaderboardTab === 'pc' ? 'PC' : '모바일'} 기록이 없습니다.
            </p>
          ) : (
            !loadError && (
              <ul className="typing-rank-list">
                {leaderboard.slice(0, 20).map((entry, index) => {
                  const rank = index + 1;
                  const rankClass =
                    rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
                  const isMe = user?.uid === entry.uid;
                  return (
                    <li key={entry.uid} className={`typing-rank-item${isMe ? ' is-me' : ''}`}>
                      <span className={`typing-rank-num ${rankClass}`}>{rank}</span>
                      <div className="typing-rank-info">
                        <div className="typing-rank-name">
                          {entry.nickname}
                          {isMe ? ' (나)' : ''}
                        </div>
                        <div className="typing-rank-meta">
                          {entry.attemptCount}회 도전
                        </div>
                      </div>
                      <span className="typing-rank-score">
                        {formatReactionMs(entry.bestDurationMs)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
          )}

          <GamePastChampions
            champions={pastChampionsForTab}
            userUid={user?.uid}
            platformLabel={leaderboardTab === 'pc' ? 'PC' : '모바일'}
            formatScore={(champion) => formatReactionMs(champion.durationMs)}
          />
        </section>
      </div>
    </div>
  );
};

export default ReactionTimeGame;
