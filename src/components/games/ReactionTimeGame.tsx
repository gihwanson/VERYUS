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
import GameConfetti from './GameConfetti';
import GamePastChampions from './GamePastChampions';
import GameSoundToggle from './GameSoundToggle';
import {
  playGameComplete,
  playNewRecord,
  playReactionFalseStart,
  playReactionGo,
  playReactionSuccess,
  unlockGameAudio,
} from '../../utils/gameSounds';
import { getReactionGrade } from '../../utils/reactionGrades';
import { setLastPlayedGame } from '../../utils/lastPlayedGame';

type GamePhase =
  | 'idle'
  | 'waiting'
  | 'go'
  | 'false_start'
  | 'timeout'
  | 'between'
  | 'finished';
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
const SESSION_ROUNDS = 5;
const BETWEEN_MS = 1400;

const calcAverage = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

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
  const [attemptResults, setAttemptResults] = useState<number[]>([]);
  const [lastAttemptMs, setLastAttemptMs] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const betweenTimerRef = useRef<number | null>(null);
  const attemptResultsRef = useRef<number[]>([]);

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
    setLastPlayedGame('reaction-time');
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

  useEffect(
    () => () => {
      clearTimers();
      if (betweenTimerRef.current !== null) window.clearTimeout(betweenTimerRef.current);
    },
    [clearTimers]
  );

  useEffect(() => {
    if (phase !== 'go') return;
    playReactionGo();
  }, [phase]);

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

  const finishGrade = useMemo(
    () => (finalResult !== null ? getReactionGrade(finalResult) : null),
    [finalResult]
  );

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
        if (result.isNewBest) {
          playNewRecord();
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 3200);
        }
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

  const beginWaiting = useCallback(() => {
    clearTimers();
    if (betweenTimerRef.current !== null) {
      window.clearTimeout(betweenTimerRef.current);
      betweenTimerRef.current = null;
    }
    finishedRef.current = false;
    goTimeRef.current = null;
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

  const finishAttempt = useCallback(
    (durationMs: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      playReactionSuccess(durationMs);
      setLastAttemptMs(durationMs);

      const nextTimes = [...attemptResultsRef.current, durationMs];
      attemptResultsRef.current = nextTimes;
      setAttemptResults(nextTimes);

      if (nextTimes.length < SESSION_ROUNDS) {
        setPhaseSafe('between');
        betweenTimerRef.current = window.setTimeout(() => {
          finishedRef.current = false;
          beginWaiting();
        }, BETWEEN_MS);
      } else {
        const average = Math.round(calcAverage(nextTimes));
        setFinalResult(average);
        setPhaseSafe('finished');
        playGameComplete();
        void saveScore(average);
      }
    },
    [beginWaiting, clearTimers, saveScore, setPhaseSafe]
  );

  const startGame = useCallback(() => {
    unlockGameAudio();
    attemptResultsRef.current = [];
    setAttemptResults([]);
    setLastAttemptMs(null);
    setFinalResult(null);
    setSaveStatus('idle');
    setSaveDetail(null);
    setShowConfetti(false);
    beginWaiting();
  }, [beginWaiting]);

  const handleReactionTap = useCallback(() => {
    const current = phaseRef.current;

    if (current === 'idle' || current === 'between' || current === 'finished') return;

    if (current === 'waiting') {
      clearTimers();
      finishedRef.current = true;
      playReactionFalseStart();
      setPhaseSafe('false_start');
      return;
    }

    if (current === 'go' && goTimeRef.current !== null && !finishedRef.current) {
      const durationMs = Date.now() - goTimeRef.current;
      finishAttempt(durationMs);
    }
  }, [clearTimers, finishAttempt, setPhaseSafe]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (phaseRef.current !== 'waiting' && phaseRef.current !== 'go') return;
      e.preventDefault();
      handleReactionTap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleReactionTap]);

  const phaseMessage = useMemo(() => {
    switch (phase) {
      case 'idle':
        return { title: '준비되셨나요?', hint: '시작 버튼을 누르면 테스트가 시작됩니다.' };
      case 'waiting':
        return {
          title: '기다리세요...',
          hint: `초록색이 될 때까지 누르지 마세요 · ${attemptResults.length + 1}/${SESSION_ROUNDS}회`,
        };
      case 'go':
        return {
          title: '지금!',
          hint: `최대한 빠르게 탭하세요 · ${attemptResults.length + 1}/${SESSION_ROUNDS}회`,
        };
      case 'between':
        return lastAttemptMs !== null
          ? {
              title: formatReactionMs(lastAttemptMs),
              hint: `${attemptResults.length}/${SESSION_ROUNDS}회 완료 · 다음 시도 준비 중…`,
            }
          : { title: '다음 시도', hint: '' };
      case 'false_start':
        return { title: '너무 빨라요!', hint: '초록색이 되기 전에 눌렀습니다. 다시 도전해 보세요.' };
      case 'timeout':
        return { title: '시간 초과', hint: '반응이 너무 늦었습니다. 다시 도전해 보세요.' };
      case 'finished':
        return finalResult !== null
          ? {
              title: formatReactionMs(finalResult),
              hint: '5회 평균',
            }
          : { title: '완료', hint: '' };
      default:
        return { title: '', hint: '' };
    }
  }, [attemptResults.length, finalResult, lastAttemptMs, phase]);

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
          반응속도 테스트
        </h1>
        <p className="games-subtitle" style={{ marginBottom: 20 }}>
          5회 측정 후 평균이 순위에 반영됩니다. PC에서는 스페이스바도 사용할 수 있어요.
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
            <p className="typing-personal-best">내 최고 기록: {formatReactionMs(myBestMs)}</p>
          )}

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
              {attemptResults.length > 0 && phase !== 'finished' && (
                <div className="reaction-session-strip" aria-label="이번 세션 기록">
                  {attemptResults.map((ms, i) => (
                    <span key={`${i}-${ms}`} className="reaction-session-pill">
                      {i + 1}회 {formatReactionMs(ms)}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                className={`reaction-zone reaction-zone--${phase === 'between' ? 'finished' : phase}`}
                onClick={handleReactionTap}
                disabled={
                  phase === 'finished' ||
                  phase === 'false_start' ||
                  phase === 'timeout' ||
                  phase === 'between'
                }
                aria-label={phaseMessage.title}
              >
                <span
                  className={`reaction-zone-title${phase === 'finished' || phase === 'between' ? ' reaction-zone-title--pop' : ''}`}
                >
                  {phaseMessage.title}
                </span>
                <span className="reaction-zone-hint">{phaseMessage.hint}</span>
              </button>

              {phase === 'finished' && finalResult !== null && (
                <div
                  className={`typing-result${saveStatus === 'error' || saveStatus === 'skipped' ? ' typing-result--error' : ''}`}
                >
                  <h4>5회 측정 완료!</h4>
                  {finishGrade && (
                    <p className={`reaction-grade reaction-grade--${finishGrade.tone}`}>
                      {finishGrade.emoji} {finishGrade.label}
                    </p>
                  )}
                  <p>
                    평균 {formatReactionMs(finalResult)}
                    {saveStatusMessage ? ` (${saveStatusMessage})` : ''}
                  </p>
                  {myBestMs != null && (
                    <p className="typing-result-compare">
                      {finalResult < myBestMs
                        ? `이전 최고 ${formatReactionMs(myBestMs)}보다 ${Math.round(myBestMs - finalResult)}ms 빨라요!`
                        : finalResult === myBestMs
                          ? '최고 기록과 동일합니다'
                          : `최고 기록 ${formatReactionMs(myBestMs)} (차이 +${Math.round(finalResult - myBestMs)}ms)`}
                    </p>
                  )}
                  {attemptResults.length > 0 && (
                    <div className="reaction-session-strip reaction-session-strip--result">
                      {attemptResults.map((ms, i) => (
                        <span
                          key={`done-${i}-${ms}`}
                          className={`reaction-session-pill${ms === finalResult ? ' reaction-session-pill--best' : ''}`}
                        >
                          {i + 1}회 {formatReactionMs(ms)}
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
              )}

              <div className="typing-actions">
                {(phase === 'finished' || phase === 'false_start' || phase === 'timeout') && (
                  <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                    {phase === 'finished' ? '새 5회 도전' : '다시 도전'}
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
                      {formatReactionMs(myStickyRank.entry.bestDurationMs)}
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
