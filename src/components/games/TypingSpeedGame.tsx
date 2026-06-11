import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { pickRandomTypingSentence } from '../../utils/gameSentences';
import {
  detectGamePlatform,
  isTouchPrimaryDevice,
  type GamePlatform,
} from '../../utils/gamePlatform';
import {
  migrateLegacyTypingScoresIfNeeded,
  saveTypingBestScore,
  type TypingBestScore,
} from '../../utils/typingSpeedScores';
import '../../styles/variables.css';
import '../../styles/games.css';

type GamePhase = 'idle' | 'playing' | 'finished';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'skipped' | 'error';

interface LeaderboardEntry {
  uid: string;
  nickname: string;
  bestDurationMs: number;
  bestCpm: number;
  attemptCount: number;
}

const formatDuration = (ms: number): string => {
  const sec = ms / 1000;
  return sec < 10 ? `${sec.toFixed(2)}초` : `${sec.toFixed(1)}초`;
};

const buildLeaderboard = (
  scores: TypingBestScore[],
  platform: GamePlatform
): LeaderboardEntry[] =>
  scores
    .filter((s) => s.platform === platform)
    .sort((a, b) => a.durationMs - b.durationMs)
    .map((s) => ({
      uid: s.uid,
      nickname: s.nickname,
      bestDurationMs: s.durationMs,
      bestCpm: s.cpm,
      attemptCount: s.attemptCount,
    }));

const TypingSpeedGame: React.FC = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
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
  const [targetSentence, setTargetSentence] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalResult, setFinalResult] = useState<{ durationMs: number; cpm: number } | null>(null);
  const [bestScores, setBestScores] = useState<TypingBestScore[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void migrateLegacyTypingScoresIfNeeded();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'games', 'typingSpeed', 'bestScores'),
      (snap) => {
        setLoadError(null);
        setBestScores(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TypingBestScore, 'id'>),
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
    if (phase !== 'playing' || startTime === null) return;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 50);
    return () => window.clearInterval(timer);
  }, [phase, startTime]);

  const leaderboard = useMemo(
    () => buildLeaderboard(bestScores, leaderboardTab),
    [bestScores, leaderboardTab]
  );

  const myRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = leaderboard.findIndex((e) => e.uid === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, user?.uid]);

  const saveScore = useCallback(
    async (durationMs: number, sentence: string) => {
      if (!user?.uid || !user?.nickname) {
        setSaveStatus('skipped');
        setSaveDetail('로그인 정보가 없어 기록을 저장하지 못했습니다.');
        return;
      }

      setSaveStatus('saving');
      setSaveDetail(null);
      try {
        const result = await saveTypingBestScore({
          uid: user.uid,
          nickname: user.nickname,
          durationMs,
          platform,
          sentence,
        });
        setSaveStatus('saved');
        setLeaderboardTab(platform);
        setSaveDetail(
          result.isNewBest
            ? `${platform === 'pc' ? 'PC' : '모바일'} 신기록! (${result.attemptCount}회째 도전)`
            : `최고 기록 ${formatDuration(result.bestDurationMs)} 유지 (${result.attemptCount}회째 도전)`
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
    (durationMs: number, sentence: string) => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      const cpm =
        sentence.length > 0 ? Math.round((sentence.length / durationMs) * 60000) : 0;

      setFinalResult({ durationMs, cpm });
      setPhase('finished');
      setElapsedMs(durationMs);
      void saveScore(durationMs, sentence);
    },
    [saveScore]
  );

  const ensureTimerStarted = useCallback(() => {
    if (startTimeRef.current !== null) return;
    const now = Date.now();
    startTimeRef.current = now;
    setStartTime(now);
  }, []);

  const processInput = useCallback(
    (value: string) => {
      if (phase !== 'playing' || finishedRef.current) return;

      if (value.length > 0) {
        ensureTimerStarted();
      }

      setInputValue(value);

      if (value === targetSentence) {
        const end = Date.now();
        const durationMs = startTimeRef.current ? end - startTimeRef.current : 1;
        finishGame(durationMs > 0 ? durationMs : 1, targetSentence);
      }
    },
    [ensureTimerStarted, finishGame, phase, targetSentence]
  );

  const focusTypingInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;

    try {
      el.focus({ preventScroll: false });
    } catch {
      el.focus();
    }

    // 모바일 가상 키보드가 입력창을 가리지 않도록
    if (isTouchPrimaryDevice()) {
      window.setTimeout(() => {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 320);
    }
  }, []);

  const startGame = useCallback(() => {
    finishedRef.current = false;
    startTimeRef.current = null;
    isComposingRef.current = false;
    setTargetSentence(pickRandomTypingSentence());
    setInputValue('');
    setStartTime(null);
    setElapsedMs(0);
    setFinalResult(null);
    setSaveStatus('idle');
    setSaveDetail(null);
    setPhase('playing');
    window.setTimeout(focusTypingInput, isTouchPrimaryDevice() ? 120 : 50);
  }, [focusTypingInput]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (isComposingRef.current) {
      // 모바일 한글: 조합 중에도 첫 입력 시점부터 타이머 시작
      if (value.length > 0) {
        ensureTimerStarted();
      }
      setInputValue(value);
      return;
    }

    processInput(value);
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    processInput(e.currentTarget.value);
  };

  const renderTargetChars = () =>
    targetSentence.split('').map((char, i) => {
      const typed = inputValue[i];
      let className = 'typing-target-char pending';
      if (typed !== undefined) {
        className =
          typed === char ? 'typing-target-char correct' : 'typing-target-char incorrect';
      } else if (i === inputValue.length) {
        className = 'typing-target-char current';
      }
      return (
        <span key={`${i}-${char}`} className={className}>
          {char}
        </span>
      );
    });

  const liveCpm = useMemo(() => {
    if (!startTime || elapsedMs <= 0 || inputValue.length === 0) return 0;
    return Math.round((inputValue.length / elapsedMs) * 60000);
  }, [startTime, elapsedMs, inputValue.length]);

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
          타자 빨리치기
        </h1>
        <p className="games-subtitle" style={{ marginBottom: 20 }}>
          아래 문장을 정확히 입력하세요. 가장 빠른 기록이 순위에 올라갑니다.
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
                시작 버튼을 누르면 랜덤 문장이 나타납니다.
                <br />
                첫 글자를 입력하는 순간 타이머가 시작됩니다.
              </p>
              <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                시작하기
              </button>
            </div>
          )}

          {(phase === 'playing' || phase === 'finished') && (
            <>
              <div className="typing-target">{renderTargetChars()}</div>

              <input
                ref={inputRef}
                type="text"
                className="typing-input"
                value={inputValue}
                onChange={handleInputChange}
                onFocus={focusTypingInput}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={handleCompositionEnd}
                disabled={phase === 'finished'}
                placeholder="여기에 입력하세요..."
                lang="ko"
                name="typing-speed-input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="done"
                onPaste={(e) => e.preventDefault()}
              />

              <div className="typing-stats">
                <div className="typing-stat">
                  <span className="typing-stat-label">경과 시간</span>
                  <span className="typing-stat-value">
                    {phase === 'finished' && finalResult
                      ? formatDuration(finalResult.durationMs)
                      : formatDuration(elapsedMs)}
                  </span>
                </div>
                <div className="typing-stat">
                  <span className="typing-stat-label">타수 (CPM)</span>
                  <span className="typing-stat-value">
                    {phase === 'finished' && finalResult ? finalResult.cpm : liveCpm}
                  </span>
                </div>
                <div className="typing-stat">
                  <span className="typing-stat-label">진행률</span>
                  <span className="typing-stat-value">
                    {targetSentence.length > 0
                      ? `${Math.min(100, Math.round((inputValue.length / targetSentence.length) * 100))}%`
                      : '0%'}
                  </span>
                </div>
              </div>

              {phase === 'finished' && finalResult && (
                <div
                  className={`typing-result${saveStatus === 'error' || saveStatus === 'skipped' ? ' typing-result--error' : ''}`}
                >
                  <h4>완료!</h4>
                  <p>
                    {formatDuration(finalResult.durationMs)} · {finalResult.cpm} 타/분
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
                      onClick={() => void saveScore(finalResult.durationMs, targetSentence)}
                    >
                      다시 저장 시도
                    </button>
                  )}
                </div>
              )}

              <div className="typing-actions">
                {phase === 'finished' && (
                  <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                    다시 도전
                  </button>
                )}
                {phase === 'playing' && (
                  <button
                    type="button"
                    className="typing-btn typing-btn-secondary"
                    onClick={() => {
                      finishedRef.current = false;
                      startTimeRef.current = null;
                      setPhase('idle');
                      setInputValue('');
                      setStartTime(null);
                      setElapsedMs(0);
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
                          {entry.bestCpm} 타/분 · {entry.attemptCount}회 도전
                        </div>
                      </div>
                      <span className="typing-rank-score">
                        {formatDuration(entry.bestDurationMs)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </section>
      </div>
    </div>
  );
};

export default TypingSpeedGame;
