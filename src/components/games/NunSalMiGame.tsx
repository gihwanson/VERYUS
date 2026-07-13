import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { detectGamePlatform, type GamePlatform } from '../../utils/gamePlatform';
import {
  createNunSalMiSession,
  SESSION_ROUNDS,
  type NunSalMiRound,
} from '../../utils/nunSalMiLogic';
import {
  saveNunSalMiBestScore,
  type NunSalMiBestScore,
} from '../../utils/nunSalMiScores';
import {
  selectPastChampionsForDisplay,
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
  playReactionFalseStart,
  playReactionSuccess,
  unlockGameAudio,
} from '../../utils/gameSounds';
import { setLastPlayedGame } from '../../utils/lastPlayedGame';

type GamePhase = 'idle' | 'countdown' | 'playing' | 'between' | 'finished';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'skipped' | 'error';

interface LeaderboardEntry {
  uid: string;
  nickname: string;
  bestDurationMs: number;
  attemptCount: number;
}

const WRONG_PENALTY_MS = 500;
const BETWEEN_MS = 900;
const COUNTDOWN_FROM = 3;

/** 눈썰미 기록은 전부 초 단위로 통일 표시 */
const formatMs = (ms: number): string => {
  const sec = Math.max(0, ms) / 1000;
  if (sec < 10) return `${sec.toFixed(2)}초`;
  return `${sec.toFixed(1)}초`;
};

const formatDeltaMs = (ms: number): string => {
  const abs = Math.abs(ms);
  if (abs < 1000) return `${Math.round(abs)}ms`;
  return formatMs(abs);
};

const buildLeaderboard = (
  scores: NunSalMiBestScore[],
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

const NunSalMiGame: React.FC = () => {
  const navigate = useNavigate();
  const phaseRef = useRef<GamePhase>('idle');
  const roundStartRef = useRef<number | null>(null);
  const betweenTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const attemptResultsRef = useRef<number[]>([]);
  const wrongFlashTimerRef = useRef<number | null>(null);

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
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [rounds, setRounds] = useState<NunSalMiRound[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [attemptResults, setAttemptResults] = useState<number[]>([]);
  const [lastAttemptMs, setLastAttemptMs] = useState<number | null>(null);
  const [finalResult, setFinalResult] = useState<number | null>(null);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [bestScores, setBestScores] = useState<NunSalMiBestScore[]>([]);
  const [pastChampions, setPastChampions] = useState<GamePastChampion[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const setPhaseSafe = useCallback((next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (betweenTimerRef.current !== null) {
      window.clearTimeout(betweenTimerRef.current);
      betweenTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (wrongFlashTimerRef.current !== null) {
      window.clearTimeout(wrongFlashTimerRef.current);
      wrongFlashTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLastPlayedGame('nun-sal-mi');
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'games', 'nunSalMi', 'bestScores'),
      (snap) => {
        setLoadError(null);
        setBestScores(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NunSalMiBestScore, 'id'>),
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
      collection(db, 'games', 'nunSalMi', 'pastChampions'),
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

  useEffect(
    () => () => {
      clearTimers();
    },
    [clearTimers]
  );

  useEffect(() => {
    if (phase !== 'playing') return;
    const tick = window.setInterval(() => {
      if (roundStartRef.current == null) return;
      setElapsedMs(Date.now() - roundStartRef.current);
    }, 50);
    return () => window.clearInterval(tick);
  }, [phase]);

  const leaderboard = useMemo(
    () => buildLeaderboard(bestScores, leaderboardTab),
    [bestScores, leaderboardTab]
  );

  const pastChampionsForTab = useMemo(
    () => selectPastChampionsForDisplay(pastChampions, leaderboardTab, 'nunSalMi'),
    [pastChampions, leaderboardTab]
  );

  const myRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = leaderboard.findIndex((e) => e.uid === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, user?.uid]);

  const myStickyRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = leaderboard.findIndex((e) => e.uid === user.uid);
    if (idx < 0 || idx < 20) return null;
    return { rank: idx + 1, entry: leaderboard[idx] };
  }, [leaderboard, user?.uid]);

  const myBestMs = useMemo(() => {
    if (!user?.uid) return null;
    const me = leaderboard.find((e) => e.uid === user.uid);
    return me?.bestDurationMs ?? null;
  }, [leaderboard, user?.uid]);

  const currentRound = rounds[roundIndex] ?? null;

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
        const result = await saveNunSalMiBestScore({
          uid: user.uid,
          nickname: user.nickname,
          durationMs,
          platform,
        });
        setSaveStatus('saved');
        setLeaderboardTab(platform);
        if (result.isNewBest) {
          playNewRecord();
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 3200);
        }
        setSaveDetail(
          result.isNewBest
            ? `${platform === 'pc' ? 'PC' : '모바일'} 신기록! (${result.attemptCount}회째 도전)`
            : `최고 기록 ${formatMs(result.bestDurationMs)} 유지 (${result.attemptCount}회째 도전)`
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

  const beginRound = useCallback(
    (index: number) => {
      setRoundIndex(index);
      setWrongFlash(false);
      setElapsedMs(0);
      roundStartRef.current = Date.now();
      setPhaseSafe('playing');
    },
    [setPhaseSafe]
  );

  const finishRound = useCallback(
    (durationMs: number) => {
      playReactionSuccess(Math.min(durationMs, 800));
      setLastAttemptMs(durationMs);

      const nextTimes = [...attemptResultsRef.current, durationMs];
      attemptResultsRef.current = nextTimes;
      setAttemptResults(nextTimes);

      if (nextTimes.length < SESSION_ROUNDS) {
        setPhaseSafe('between');
        betweenTimerRef.current = window.setTimeout(() => {
          beginRound(nextTimes.length);
        }, BETWEEN_MS);
      } else {
        const total = nextTimes.reduce((sum, ms) => sum + ms, 0);
        setFinalResult(total);
        setPhaseSafe('finished');
        playGameComplete();
        void saveScore(total);
      }
    },
    [beginRound, saveScore, setPhaseSafe]
  );

  const startCountdown = useCallback(() => {
    clearTimers();
    unlockGameAudio();
    const session = createNunSalMiSession();
    setRounds(session);
    attemptResultsRef.current = [];
    setAttemptResults([]);
    setLastAttemptMs(null);
    setFinalResult(null);
    setSaveStatus('idle');
    setSaveDetail(null);
    setShowConfetti(false);
    setWrongFlash(false);
    setRoundIndex(0);
    setCountdown(COUNTDOWN_FROM);
    setPhaseSafe('countdown');
    playCountdownTick();

    let remaining = COUNTDOWN_FROM;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
        playCountdownTick();
        return;
      }
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      playCountdownGo();
      beginRound(0);
    }, 1000);
  }, [beginRound, clearTimers, setPhaseSafe]);

  const handleCellClick = useCallback(
    (index: number) => {
      if (phaseRef.current !== 'playing' || !currentRound || roundStartRef.current == null) {
        return;
      }

      if (index === currentRound.oddIndex) {
        const durationMs = Date.now() - roundStartRef.current;
        roundStartRef.current = null;
        finishRound(durationMs);
        return;
      }

      playReactionFalseStart();
      roundStartRef.current -= WRONG_PENALTY_MS;
      setElapsedMs(Date.now() - roundStartRef.current);
      setWrongFlash(true);
      if (wrongFlashTimerRef.current !== null) {
        window.clearTimeout(wrongFlashTimerRef.current);
      }
      wrongFlashTimerRef.current = window.setTimeout(() => setWrongFlash(false), 220);
    },
    [currentRound, finishRound]
  );

  const saveStatusMessage = useMemo(() => {
    if (saveStatus === 'saving') return '저장 중...';
    if (saveStatus === 'saved') return saveDetail ?? '저장됨';
    if (saveStatus === 'skipped' || saveStatus === 'error') return saveDetail ?? '저장 실패';
    return '';
  }, [saveDetail, saveStatus]);

  const abortToIdle = useCallback(() => {
    clearTimers();
    roundStartRef.current = null;
    setPhaseSafe('idle');
    setFinalResult(null);
    setSaveStatus('idle');
    setSaveDetail(null);
  }, [clearTimers, setPhaseSafe]);

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
          눈썰미
        </h1>
        <p className="games-subtitle" style={{ marginBottom: 20 }}>
          비슷한 글자 속에서 다른 하나를 찾아보세요. 5라운드 총 시간이 순위에 반영됩니다.
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

          {myBestMs != null && phase === 'idle' && (
            <p className="typing-personal-best">내 최고 기록: {formatMs(myBestMs)}</p>
          )}

          {phase === 'idle' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ marginBottom: 12, opacity: 0.9, lineHeight: 1.6 }}>
                예: 가 가 가 가 가 가 <strong>거</strong> 가 가 가
                <br />
                수많은 같은 음절 중 다른 하나를 클릭하세요.
                <br />
                틀리면 +{WRONG_PENALTY_MS}ms 페널티가 붙습니다.
              </p>
              <button type="button" className="typing-btn typing-btn-primary" onClick={startCountdown}>
                시작하기
              </button>
            </div>
          )}

          {phase === 'countdown' && (
            <div className="nunsarmi-countdown" aria-live="polite">
              <span className="nunsarmi-countdown-num">{countdown}</span>
              <p>곧 시작합니다</p>
            </div>
          )}

          {(phase === 'playing' || phase === 'between') && currentRound && (
            <>
              <div className="nunsarmi-hud">
                <span>
                  {phase === 'between' ? attemptResults.length : roundIndex + 1}/{SESSION_ROUNDS}{' '}
                  라운드
                </span>
                <span className="nunsarmi-prompt">{currentRound.prompt}</span>
                <span>
                  {phase === 'playing'
                    ? formatMs(elapsedMs)
                    : lastAttemptMs != null
                      ? formatMs(lastAttemptMs)
                      : '—'}
                </span>
              </div>

              {attemptResults.length > 0 && (
                <div className="reaction-session-strip" aria-label="이번 세션 기록">
                  {attemptResults.map((ms, i) => (
                    <span key={`${i}-${ms}`} className="reaction-session-pill">
                      {i + 1}R {formatMs(ms)}
                    </span>
                  ))}
                </div>
              )}

              {phase === 'between' ? (
                <div className="nunsarmi-between">
                  <p className="nunsarmi-between-title">{formatMs(lastAttemptMs ?? 0)}</p>
                  <p>다음 라운드 준비 중…</p>
                </div>
              ) : (
                <div
                  className={`nunsarmi-grid${wrongFlash ? ' nunsarmi-grid--wrong' : ''}`}
                  style={{ gridTemplateColumns: `repeat(${currentRound.cols}, minmax(0, 1fr))` }}
                  role="grid"
                  aria-label={currentRound.prompt}
                >
                  {currentRound.cells.map((syllable, index) => (
                    <button
                      key={`${roundIndex}-${index}`}
                      type="button"
                      className="nunsarmi-cell"
                      onClick={() => handleCellClick(index)}
                    >
                      {syllable}
                    </button>
                  ))}
                </div>
              )}

              <div className="typing-actions">
                <button type="button" className="typing-btn typing-btn-secondary" onClick={abortToIdle}>
                  포기
                </button>
              </div>
            </>
          )}

          {phase === 'finished' && finalResult !== null && (
            <>
              <div
                className={`typing-result${saveStatus === 'error' || saveStatus === 'skipped' ? ' typing-result--error' : ''}`}
              >
                <h4>5라운드 완료!</h4>
                <p>
                  총 {formatMs(finalResult)}
                  {saveStatusMessage ? ` (${saveStatusMessage})` : ''}
                </p>
                {myBestMs != null && (
                  <p className="typing-result-compare">
                    {finalResult < myBestMs
                      ? `이전 최고 ${formatMs(myBestMs)}보다 ${formatDeltaMs(myBestMs - finalResult)} 빨라요!`
                      : finalResult === myBestMs
                        ? '최고 기록과 동일합니다'
                        : `최고 기록 ${formatMs(myBestMs)} (차이 +${formatDeltaMs(finalResult - myBestMs)})`}
                  </p>
                )}
                {attemptResults.length > 0 && (
                  <div className="reaction-session-strip reaction-session-strip--result">
                    {attemptResults.map((ms, i) => (
                      <span key={`done-${i}-${ms}`} className="reaction-session-pill">
                        {i + 1}R {formatMs(ms)}
                      </span>
                    ))}
                  </div>
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
                    onClick={() => void saveScore(finalResult)}
                  >
                    다시 저장 시도
                  </button>
                )}
              </div>
              <div className="typing-actions">
                <button type="button" className="typing-btn typing-btn-primary" onClick={startCountdown}>
                  새 5라운드 도전
                </button>
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
                        {myStickyRank.entry.attemptCount}회 도전
                      </div>
                    </div>
                    <span className="typing-rank-score">
                      {formatMs(myStickyRank.entry.bestDurationMs)}
                    </span>
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
                        <div className="typing-rank-meta">{entry.attemptCount}회 도전</div>
                      </div>
                      <span className="typing-rank-score">{formatMs(entry.bestDurationMs)}</span>
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
            formatScore={(champion) => formatMs(champion.durationMs)}
          />
        </section>
      </div>
    </div>
  );
};

export default NunSalMiGame;
