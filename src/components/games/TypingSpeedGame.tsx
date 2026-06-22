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
import {
  sortPastChampions,
  type GamePastChampion,
} from '../../utils/gamePastChampions';
import GameConfetti from './GameConfetti';
import GamePastChampions from './GamePastChampions';
import GameSoundToggle from './GameSoundToggle';
import {
  playCountdownGo,
  playCountdownTick,
  playGameComplete,
  playNewRecord,
  playTypingError,
  unlockGameAudio,
} from '../../utils/gameSounds';
import { setLastPlayedGame } from '../../utils/lastPlayedGame';

type GamePhase = 'idle' | 'countdown' | 'playing' | 'finished';
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
    .sort((a, b) => {
      if (b.cpm !== a.cpm) return b.cpm - a.cpm;
      return a.durationMs - b.durationMs;
    })
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
  const [pastChampions, setPastChampions] = useState<GamePastChampion[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [previewSentence, setPreviewSentence] = useState('');
  const [inputShake, setInputShake] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const pendingSentenceRef = useRef('');

  useEffect(() => {
    void migrateLegacyTypingScoresIfNeeded();
    setLastPlayedGame('typing-speed');
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
    const unsub = onSnapshot(
      collection(db, 'games', 'typingSpeed', 'pastChampions'),
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
        if (result.isNewBest) {
          playNewRecord();
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 3200);
        } else {
          playGameComplete();
        }
        setSaveDetail(
          result.isNewBest
            ? `${platform === 'pc' ? 'PC' : '모바일'} 신기록! (${result.attemptCount}회째 도전)`
            : `최고 기록 ${result.bestCpm} 타/분 유지 (${result.attemptCount}회째 도전)`
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
      if (!user?.uid) playGameComplete();
      void saveScore(durationMs, sentence);
    },
    [saveScore, user?.uid]
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

      let nextValue = value;
      for (let i = 0; i < nextValue.length; i += 1) {
        if (nextValue[i] !== targetSentence[i]) {
          nextValue = nextValue.slice(0, i + 1);
          if (nextValue.length < value.length || value[i] !== targetSentence[i]) {
            playTypingError();
            setInputShake(true);
            window.setTimeout(() => setInputShake(false), 420);
          }
          break;
        }
      }

      setInputValue(nextValue);

      if (nextValue === targetSentence) {
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

  const startPlaying = useCallback(
    (sentence: string) => {
      finishedRef.current = false;
      startTimeRef.current = null;
      isComposingRef.current = false;
      setTargetSentence(sentence);
      setPreviewSentence('');
      setInputValue('');
      setStartTime(null);
      setElapsedMs(0);
      setFinalResult(null);
      setSaveStatus('idle');
      setSaveDetail(null);
      setShowConfetti(false);
      setPhase('playing');
      window.setTimeout(focusTypingInput, isTouchPrimaryDevice() ? 120 : 50);
    },
    [focusTypingInput]
  );

  const startGame = useCallback(() => {
    unlockGameAudio();
    const sentence = pickRandomTypingSentence();
    pendingSentenceRef.current = sentence;
    setPreviewSentence(sentence);
    setCountdown(3);
    setPhase('countdown');
    playCountdownTick();
  }, []);

  useEffect(() => {
    if (phase !== 'countdown' || countdown <= 0) return;
    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown((c) => c - 1);
        playCountdownTick();
      } else {
        playCountdownGo();
        startPlaying(pendingSentenceRef.current);
      }
    }, 850);
    return () => window.clearTimeout(timer);
  }, [countdown, phase, startPlaying]);

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

  const liveWpm = useMemo(() => Math.round(liveCpm / 5), [liveCpm]);

  const progressPct = useMemo(() => {
    if (!targetSentence.length) return 0;
    return Math.min(100, Math.round((inputValue.length / targetSentence.length) * 100));
  }, [inputValue.length, targetSentence.length]);

  const accuracyPct = useMemo(() => {
    if (inputValue.length === 0) return 100;
    let correct = 0;
    for (let i = 0; i < inputValue.length; i += 1) {
      if (inputValue[i] === targetSentence[i]) correct += 1;
    }
    return Math.round((correct / inputValue.length) * 100);
  }, [inputValue, targetSentence]);

  const myBestCpm = useMemo(() => {
    if (!user?.uid) return null;
    const me = leaderboard.find((e) => e.uid === user.uid);
    return me?.bestCpm ?? null;
  }, [leaderboard, user?.uid]);

  const myStickyRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = leaderboard.findIndex((e) => e.uid === user.uid);
    if (idx < 0 || idx < 20) return null;
    const me = leaderboard[idx];
    return { rank: idx + 1, entry: me };
  }, [leaderboard, user?.uid]);

  const saveStatusMessage = useMemo(() => {
    if (saveStatus === 'saving') return '저장 중...';
    if (saveStatus === 'saved') return saveDetail ?? '저장됨';
    if (saveStatus === 'skipped' || saveStatus === 'error') return saveDetail ?? '저장 실패';
    return '';
  }, [saveDetail, saveStatus]);

  return (
    <div className="games-page">
      <GameConfetti show={showConfetti} />
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
          아래 문장을 정확히 입력하세요. 타수(CPM)가 높을수록 순위가 올라갑니다.
        </p>

        <div className="typing-game-panel">
          <div className="typing-panel-top">
            <div className="typing-platform-badge">
              {platform === 'pc' ? '🖥️ PC 모드' : '📱 모바일 모드'}
              <span style={{ opacity: 0.75, fontWeight: 400 }}>
                · 기록은 {platform === 'pc' ? 'PC' : '모바일'} 순위표에 저장됩니다
              </span>
            </div>
            <GameSoundToggle />
          </div>
          {myBestCpm != null && phase === 'idle' && (
            <p className="typing-personal-best">내 최고 기록: {myBestCpm} 타/분</p>
          )}

          {phase === 'idle' && (
            <div className="typing-idle-panel">
              <p>
                시작 버튼을 누르면 랜덤 문장이 나타납니다.
                <br />
                첫 글자를 입력하는 순간 타이머가 시작됩니다.
              </p>
              <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                시작하기
              </button>
            </div>
          )}

          {phase === 'countdown' && (
            <div className="typing-countdown-panel">
              <p className="typing-countdown-preview">{previewSentence}</p>
              <div className="typing-countdown-num" key={countdown}>
                {countdown}
              </div>
              <p className="typing-countdown-hint">곧 시작합니다…</p>
            </div>
          )}

          {(phase === 'playing' || phase === 'finished') && (
            <>
              <div className="typing-progress-track" aria-hidden>
                <div className="typing-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>

              <div className="typing-target">{renderTargetChars()}</div>

              <input
                ref={inputRef}
                type="text"
                className={`typing-input${inputShake ? ' typing-input--shake' : ''}`}
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
                  <span className="typing-stat-label">약 WPM</span>
                  <span className="typing-stat-value">
                    {phase === 'finished' && finalResult
                      ? Math.round(finalResult.cpm / 5)
                      : liveWpm}
                  </span>
                </div>
                <div className="typing-stat">
                  <span className="typing-stat-label">진행률</span>
                  <span className="typing-stat-value">{progressPct}%</span>
                </div>
                <div className="typing-stat">
                  <span className="typing-stat-label">정확도</span>
                  <span
                    className={`typing-stat-value${accuracyPct < 95 ? ' typing-stat-value--warn' : ''}`}
                  >
                    {accuracyPct}%
                  </span>
                </div>
              </div>

              {phase === 'finished' && finalResult && (
                <div
                  className={`typing-result typing-result--pop${saveStatus === 'error' || saveStatus === 'skipped' ? ' typing-result--error' : ''}`}
                >
                  <h4>완료!</h4>
                  <p>
                    {formatDuration(finalResult.durationMs)} · {finalResult.cpm} 타/분
                    {saveStatusMessage ? ` (${saveStatusMessage})` : ''}
                  </p>
                  {myBestCpm != null && (
                    <p className="typing-result-compare">
                      {finalResult.cpm > myBestCpm
                        ? `이전 최고 ${myBestCpm} 타/분보다 +${finalResult.cpm - myBestCpm}!`
                        : finalResult.cpm === myBestCpm
                          ? '최고 기록과 동점입니다'
                          : `최고 기록 ${myBestCpm} 타/분 (차이 ${myBestCpm - finalResult.cpm})`}
                    </p>
                  )}
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
                {myStickyRank && (
                  <li className="typing-rank-item is-me typing-rank-item--sticky">
                    <span className="typing-rank-num">{myStickyRank.rank}</span>
                    <div className="typing-rank-info">
                      <div className="typing-rank-name">
                        {myStickyRank.entry.nickname} (나)
                      </div>
                      <div className="typing-rank-meta">
                        {formatDuration(myStickyRank.entry.bestDurationMs)} ·{' '}
                        {myStickyRank.entry.attemptCount}회 도전
                      </div>
                    </div>
                    <span className="typing-rank-score">{myStickyRank.entry.bestCpm} 타/분</span>
                  </li>
                )}
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
                          {formatDuration(entry.bestDurationMs)} · {entry.attemptCount}회 도전
                        </div>
                      </div>
                      <span className="typing-rank-score">
                        {entry.bestCpm} 타/분
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
            formatScore={(champion) => `${champion.cpm ?? 0} 타/분`}
            formatMeta={(champion) => formatDuration(champion.durationMs)}
          />
        </section>
      </div>
    </div>
  );
};

export default TypingSpeedGame;
