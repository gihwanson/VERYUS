import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { detectGamePlatform, type GamePlatform } from '../../utils/gamePlatform';
import {
  MAX_RHYTHM_ERROR_MS,
  calcRhythmAccuracy,
  saveRhythmBeatBestScore,
  type RhythmBeatBestScore,
} from '../../utils/rhythmBeatScores';
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
  playRhythmBeatClick,
  playRhythmMiss,
  playRhythmTap,
  unlockGameAudio,
} from '../../utils/gameSounds';
import { getRhythmGrade } from '../../utils/rhythmGrades';
import { setLastPlayedGame } from '../../utils/lastPlayedGame';

type GamePhase = 'idle' | 'countdown' | 'playing' | 'finished';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'skipped' | 'error';
type BeatPulse = 'downbeat' | 'beat' | null;

interface LeaderboardEntry {
  uid: string;
  nickname: string;
  bestAccuracy: number;
  avgErrorMs: number;
  bpm: number;
  attemptCount: number;
}

interface BeatResult {
  beatIndex: number;
  errorMs: number;
  hit: boolean;
}

interface ResultCompare {
  sessionAccuracy: number;
  sessionAvgErrorMs: number;
  previousBest: number | null;
  previousBestErrorMs: number | null;
  savedBest: number;
  savedBestErrorMs: number;
  isNewBest: boolean;
}

const SCORED_BEAT_COUNT = 16;
const PREP_BEAT_COUNT = 2;
const TOTAL_BEAT_COUNT = PREP_BEAT_COUNT + SCORED_BEAT_COUNT;
const BPM_MIN = 85;
const BPM_MAX = 115;
const BPM_STEP = 5;

const pickRandomBpm = (): number => {
  const stepCount = (BPM_MAX - BPM_MIN) / BPM_STEP + 1;
  return BPM_MIN + Math.floor(Math.random() * stepCount) * BPM_STEP;
};

const SCORING_WINDOW_MS = 250;
const EARLY_TAP_WINDOW_MS = 80;
const TAP_LATENCY_COMPENSATION_MS = 50;
const COUNTDOWN_SEC = 3;
const POST_BEAT_GRACE_MS = 600;

const formatAccuracy = (accuracy: number): string => `${accuracy}%`;

const buildLeaderboard = (
  scores: RhythmBeatBestScore[],
  platform: GamePlatform
): LeaderboardEntry[] =>
  scores
    .filter((s) => s.platform === platform)
    .sort((a, b) => {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return a.durationMs - b.durationMs;
    })
    .map((s) => ({
      uid: s.uid,
      nickname: s.nickname,
      bestAccuracy: s.accuracy,
      avgErrorMs: s.durationMs,
      bpm: s.bpm,
      attemptCount: s.attemptCount,
    }));

const RhythmBeatGame: React.FC = () => {
  const navigate = useNavigate();
  const timersRef = useRef<number[]>([]);
  const phaseRef = useRef<GamePhase>('idle');
  const beatTimesRef = useRef<number[]>([]);
  const tapResultsRef = useRef<Map<number, number>>(new Map());
  const isScoringRef = useRef(false);
  const activeBeatIndexRef = useRef(-1);
  const bpmRef = useRef(100);

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
  const [bpm, setBpm] = useState(100);
  const [countdownNum, setCountdownNum] = useState(COUNTDOWN_SEC);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isPrepPhase, setIsPrepPhase] = useState(false);
  const [beatPulse, setBeatPulse] = useState<BeatPulse>(null);
  const [beatPulseKey, setBeatPulseKey] = useState(0);
  const [beatResults, setBeatResults] = useState<BeatResult[]>([]);
  const [finalAccuracy, setFinalAccuracy] = useState<number | null>(null);
  const [finalAvgError, setFinalAvgError] = useState<number | null>(null);
  const [lastTapError, setLastTapError] = useState<number | null>(null);
  const [resultCompare, setResultCompare] = useState<ResultCompare | null>(null);
  const [bestScores, setBestScores] = useState<RhythmBeatBestScore[]>([]);
  const [pastChampions, setPastChampions] = useState<GamePastChampion[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [idleNotice, setIdleNotice] = useState<string | null>(null);
  const [lastTapMiss, setLastTapMiss] = useState(false);

  const setPhaseSafe = useCallback((next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  const abortToIdle = useCallback((notice?: string) => {
    clearTimers();
    isScoringRef.current = false;
    activeBeatIndexRef.current = -1;
    setBeatPulse(null);
    setIsPrepPhase(false);
    setLastTapMiss(false);
    if (notice) setIdleNotice(notice);
    setPhaseSafe('idle');
  }, [clearTimers, setPhaseSafe]);

  const abortDueToBackground = useCallback(() => {
    abortToIdle('다른 탭/앱으로 전환되어 라운드가 중단되었습니다.');
  }, [abortToIdle]);

  const triggerBeatPulse = useCallback((downbeat: boolean) => {
    setBeatPulse(downbeat ? 'downbeat' : 'beat');
    setBeatPulseKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setLastPlayedGame('rhythm-beat');
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'games', 'rhythmBeat', 'bestScores'),
      (snap) => {
        setLoadError(null);
        setBestScores(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<RhythmBeatBestScore, 'id'>),
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
      collection(db, 'games', 'rhythmBeat', 'pastChampions'),
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

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      if (phaseRef.current === 'countdown' || phaseRef.current === 'playing') {
        abortDueToBackground();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [abortDueToBackground]);

  const leaderboard = useMemo(
    () => buildLeaderboard(bestScores, leaderboardTab),
    [bestScores, leaderboardTab]
  );

  const pastChampionsForTab = useMemo(
    () => selectPastChampionsForDisplay(pastChampions, leaderboardTab, 'rhythmBeat'),
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

  const myBestAccuracy = useMemo(() => {
    if (!user?.uid) return null;
    const me = leaderboard.find((e) => e.uid === user.uid);
    return me?.bestAccuracy ?? null;
  }, [leaderboard, user?.uid]);

  const finishGrade = useMemo(
    () => (finalAccuracy !== null ? getRhythmGrade(finalAccuracy) : null),
    [finalAccuracy]
  );

  const compareMessage = useMemo(() => {
    if (!resultCompare) return null;
    const {
      sessionAccuracy,
      sessionAvgErrorMs,
      previousBest,
      previousBestErrorMs,
      savedBest,
      isNewBest,
    } = resultCompare;
    if (previousBest === null) return '첫 기록이 저장되었습니다!';
    if (isNewBest) {
      if (sessionAccuracy > previousBest) {
        return `이전 최고 ${formatAccuracy(previousBest)}보다 ${(sessionAccuracy - previousBest).toFixed(1)}%p 향상!`;
      }
      if (
        sessionAccuracy === previousBest &&
        previousBestErrorMs != null &&
        sessionAvgErrorMs < previousBestErrorMs
      ) {
        return `정확도 ${formatAccuracy(sessionAccuracy)} 동률, 평균 오차 ${previousBestErrorMs}ms → ${sessionAvgErrorMs}ms로 갱신!`;
      }
      return `신기록! ${formatAccuracy(savedBest)}`;
    }
    return `최고 기록 ${formatAccuracy(savedBest)} (차이 -${(savedBest - sessionAccuracy).toFixed(1)}%p)`;
  }, [resultCompare]);

  const saveScore = useCallback(
    async (accuracy: number, avgErrorMs: number, sessionBpm: number) => {
      if (!user?.uid || !user?.nickname) {
        setSaveStatus('skipped');
        setSaveDetail('로그인 정보가 없어 기록을 저장하지 못했습니다.');
        return;
      }

      const previousEntry = buildLeaderboard(bestScores, platform).find((e) => e.uid === user.uid);
      const previousBest = previousEntry?.bestAccuracy ?? null;
      const previousBestErrorMs = previousEntry?.avgErrorMs ?? null;

      setSaveStatus('saving');
      setSaveDetail(null);
      try {
        const result = await saveRhythmBeatBestScore({
          uid: user.uid,
          nickname: user.nickname,
          accuracy,
          avgErrorMs,
          bpm: sessionBpm,
          platform,
        });
        setSaveStatus('saved');
        setLeaderboardTab(platform);
        setResultCompare({
          sessionAccuracy: accuracy,
          sessionAvgErrorMs: avgErrorMs,
          previousBest,
          previousBestErrorMs,
          savedBest: result.bestAccuracy,
          savedBestErrorMs: result.bestAvgErrorMs,
          isNewBest: result.isNewBest,
        });
        if (result.isNewBest) {
          playNewRecord();
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 3200);
        }
        setSaveDetail(
          result.isNewBest
            ? `${platform === 'pc' ? 'PC' : '모바일'} 신기록! (${result.attemptCount}회째 도전)`
            : `최고 기록 ${formatAccuracy(result.bestAccuracy)} 유지 (${result.attemptCount}회째 도전)`
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
    [bestScores, platform, user]
  );

  const finishGame = useCallback(() => {
    if (phaseRef.current !== 'playing') return;

    const results: BeatResult[] = [];
    let totalError = 0;

    for (let i = 0; i < SCORED_BEAT_COUNT; i++) {
      const tapError = tapResultsRef.current.get(i);
      if (tapError !== undefined) {
        results.push({ beatIndex: i, errorMs: tapError, hit: true });
        totalError += tapError;
      } else {
        results.push({ beatIndex: i, errorMs: MAX_RHYTHM_ERROR_MS, hit: false });
        totalError += MAX_RHYTHM_ERROR_MS;
      }
    }

    const avgError = Math.round(totalError / SCORED_BEAT_COUNT);
    const accuracy = calcRhythmAccuracy(avgError);

    setBeatResults(results);
    setFinalAccuracy(accuracy);
    setFinalAvgError(avgError);
    setBeatPulse(null);
    setIsPrepPhase(false);
    isScoringRef.current = false;
    activeBeatIndexRef.current = -1;
    setPhaseSafe('finished');
    playGameComplete();
    void saveScore(accuracy, avgError, bpmRef.current);
  }, [saveScore, setPhaseSafe]);

  const registerMissFeedback = useCallback(() => {
    setLastTapMiss(true);
    setLastTapError(null);
    playRhythmMiss();
  }, []);

  const getActiveBeatIndex = useCallback((): number => {
    const beatTimes = beatTimesRef.current;
    for (let i = 0; i < SCORED_BEAT_COUNT; i++) {
      if (tapResultsRef.current.has(i)) continue;
      if (beatTimes[i] !== undefined) return i;
    }
    return -1;
  }, []);

  const startPlaying = useCallback(
    (sessionBpm: number) => {
      const beatInterval = 60000 / sessionBpm;
      beatTimesRef.current = [];
      tapResultsRef.current = new Map();
      isScoringRef.current = false;
      activeBeatIndexRef.current = -1;
      setCurrentBeat(0);
      setBeatResults([]);
      setLastTapError(null);
      setLastTapMiss(false);
      setIsPrepPhase(true);
      setBeatPulse(null);
      setPhaseSafe('playing');

      for (let i = 0; i < TOTAL_BEAT_COUNT; i++) {
        addTimer(() => {
          const downbeat = i % 4 === 0;
          playRhythmBeatClick(downbeat);
          triggerBeatPulse(downbeat);

          if (i < PREP_BEAT_COUNT) {
            setIsPrepPhase(true);
            return;
          }

          const scoredIndex = i - PREP_BEAT_COUNT;
          if (scoredIndex > 0 && !tapResultsRef.current.has(scoredIndex - 1)) {
            playRhythmMiss();
          }

          isScoringRef.current = true;
          setIsPrepPhase(false);
          beatTimesRef.current[scoredIndex] = performance.now();
          activeBeatIndexRef.current = scoredIndex;
          setCurrentBeat(scoredIndex + 1);
          setLastTapMiss(false);
        }, i * beatInterval);
      }

      addTimer(() => finishGame(), TOTAL_BEAT_COUNT * beatInterval + POST_BEAT_GRACE_MS);
    },
    [addTimer, finishGame, setPhaseSafe, triggerBeatPulse]
  );

  const startCountdown = useCallback(
    (sessionBpm: number) => {
      clearTimers();
      setCountdownNum(COUNTDOWN_SEC);
      setPhaseSafe('countdown');
      playCountdownTick();

      for (let i = 1; i < COUNTDOWN_SEC; i++) {
        addTimer(() => {
          setCountdownNum(COUNTDOWN_SEC - i);
          playCountdownTick();
        }, i * 1000);
      }

      addTimer(() => {
        playCountdownGo();
        startPlaying(sessionBpm);
      }, COUNTDOWN_SEC * 1000);
    },
    [addTimer, clearTimers, setPhaseSafe, startPlaying]
  );

  const startGame = useCallback(() => {
    unlockGameAudio();
    setIdleNotice(null);
    const sessionBpm = pickRandomBpm();
    bpmRef.current = sessionBpm;
    setBpm(sessionBpm);
    setFinalAccuracy(null);
    setFinalAvgError(null);
    setResultCompare(null);
    setSaveStatus('idle');
    setSaveDetail(null);
    setShowConfetti(false);
    startCountdown(sessionBpm);
  }, [startCountdown]);

  const handleTap = useCallback(() => {
    if (phaseRef.current !== 'playing') return;

    if (!isScoringRef.current) {
      registerMissFeedback();
      return;
    }

    const now = performance.now();
    const activeIdx = getActiveBeatIndex();
    if (activeIdx < 0) {
      registerMissFeedback();
      return;
    }

    const beatTime = beatTimesRef.current[activeIdx];
    if (beatTime === undefined) {
      registerMissFeedback();
      return;
    }

    if (now < beatTime - EARLY_TAP_WINDOW_MS) {
      registerMissFeedback();
      return;
    }

    const rawError = Math.abs(now - beatTime);
    const error = Math.max(0, rawError - TAP_LATENCY_COMPENSATION_MS);
    if (error > SCORING_WINDOW_MS) {
      registerMissFeedback();
      return;
    }

    const rounded = Math.round(error);
    tapResultsRef.current.set(activeIdx, rounded);
    setLastTapError(rounded);
    setLastTapMiss(false);
    playRhythmTap(rounded);
  }, [getActiveBeatIndex, registerMissFeedback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (phaseRef.current !== 'playing') return;
      e.preventDefault();
      handleTap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTap]);

  const saveStatusMessage = useMemo(() => {
    if (saveStatus === 'saving') return '저장 중...';
    if (saveStatus === 'saved') return saveDetail ?? '저장됨';
    if (saveStatus === 'skipped' || saveStatus === 'error') return saveDetail ?? '저장 실패';
    return '';
  }, [saveDetail, saveStatus]);

  const beatProgress =
    phase === 'playing' ? (currentBeat / SCORED_BEAT_COUNT) * 100 : 0;

  const tapZoneClass = [
    'rhythm-tap-zone',
    beatPulse ? `rhythm-tap-zone--pulse-${beatPulse}` : '',
  ]
    .filter(Boolean)
    .join(' ');

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
          박자 맞추기
        </h1>
        <p className="games-subtitle" style={{ marginBottom: 20 }}>
          BPM {BPM_MIN}~{BPM_MAX} 메트로놈에 맞춰 {SCORED_BEAT_COUNT}번 탭하세요. 정확도가 순위에 반영됩니다.
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

          {myBestAccuracy != null && phase === 'idle' && (
            <p className="typing-personal-best">내 최고 기록: {formatAccuracy(myBestAccuracy)}</p>
          )}

          {idleNotice && phase === 'idle' && (
            <p className="typing-empty" style={{ color: '#fde68a', marginBottom: 12 }}>
              {idleNotice}
            </p>
          )}

          {phase === 'idle' && (
            <div className="typing-idle-panel">
              <p>
                매 판 BPM {BPM_MIN}~{BPM_MAX} 중 무작위 · 시작 후 {PREP_BEAT_COUNT}박 준비 구간이 있습니다.
                <br />
                박자에 맞춰 화면을 탭하세요. 소리가 꺼져 있어도 화면이 박자에 맞춰 깜빡입니다.
                <br />
                PC에서는 스페이스바도 사용할 수 있어요. 다른 탭으로 나가면 라운드가 중단됩니다.
              </p>
              <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                시작하기
              </button>
            </div>
          )}

          {phase === 'countdown' && (
            <>
              <div className="typing-countdown-panel">
                <p className="typing-countdown-preview">
                  BPM {bpm} · {SCORED_BEAT_COUNT}박자
                </p>
                <div className="typing-countdown-num">{countdownNum}</div>
                <p className="typing-countdown-hint">곧 박자가 시작됩니다</p>
              </div>
              <div className="typing-actions">
                <button type="button" className="typing-btn typing-btn-secondary" onClick={() => abortToIdle()}>
                  취소
                </button>
              </div>
            </>
          )}

          {phase === 'playing' && (
            <>
              <div className="rhythm-meta-row">
                <span className="rhythm-meta-pill">BPM {bpm}</span>
                <span className="rhythm-meta-pill">
                  {isPrepPhase ? '준비 박자' : `${currentBeat}/${SCORED_BEAT_COUNT}박`}
                </span>
                {lastTapMiss && (
                  <span className="rhythm-meta-pill rhythm-meta-pill--miss">미스</span>
                )}
                {!lastTapMiss && lastTapError !== null && (
                  <span className="rhythm-meta-pill rhythm-meta-pill--tap">
                    ±{lastTapError}ms
                  </span>
                )}
              </div>
              <div className="typing-progress-track" aria-hidden>
                <div
                  className="typing-progress-fill rhythm-progress-fill"
                  style={{ width: `${beatProgress}%` }}
                />
              </div>
              <button
                type="button"
                className={tapZoneClass}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleTap();
                }}
                aria-label="박자에 맞춰 탭"
              >
                {beatPulse && (
                  <span
                    key={beatPulseKey}
                    className={`rhythm-tap-flash rhythm-tap-flash--${beatPulse}`}
                    aria-hidden
                  />
                )}
                <span className="rhythm-tap-icon" aria-hidden>
                  🥁
                </span>
                <span className="rhythm-tap-title">
                  {isPrepPhase ? '준비…' : '탭!'}
                </span>
                <span className="rhythm-tap-hint">
                  {isPrepPhase
                    ? '준비 박자입니다. 곧 채점이 시작됩니다'
                    : '박자에 맞춰 누르세요 (소리·화면 깜빡임)'}
                </span>
              </button>
              <div className="typing-actions">
                <button type="button" className="typing-btn typing-btn-secondary" onClick={() => abortToIdle()}>
                  포기
                </button>
              </div>
            </>
          )}

          {phase === 'finished' && finalAccuracy !== null && finalAvgError !== null && (
            <>
              <div
                className={`typing-result${saveStatus === 'error' || saveStatus === 'skipped' ? ' typing-result--error' : ''} typing-result--pop`}
              >
                <h4>라운드 완료!</h4>
                {finishGrade && (
                  <p className={`reaction-grade reaction-grade--${finishGrade.tone}`}>
                    {finishGrade.emoji} {finishGrade.label}
                  </p>
                )}
                <p style={{ fontSize: 28, fontWeight: 800, margin: '8px 0' }}>
                  {formatAccuracy(finalAccuracy)}
                </p>
                <p>
                  평균 오차 {finalAvgError}ms · BPM {bpm}
                  {saveStatusMessage ? ` (${saveStatusMessage})` : ''}
                </p>
                {compareMessage && <p className="typing-result-compare">{compareMessage}</p>}
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
                    onClick={() => void saveScore(finalAccuracy, finalAvgError, bpm)}
                  >
                    다시 저장 시도
                  </button>
                )}
              </div>

              {beatResults.length > 0 && (
                <div className="rhythm-beat-grid" aria-label="박자별 결과">
                  {beatResults.map((r) => (
                    <span
                      key={r.beatIndex}
                      className={`rhythm-beat-cell${r.hit ? (r.errorMs <= 50 ? ' rhythm-beat-cell--perfect' : r.errorMs <= 120 ? ' rhythm-beat-cell--good' : ' rhythm-beat-cell--ok') : ' rhythm-beat-cell--miss'}`}
                      title={r.hit ? `±${r.errorMs}ms` : '미스'}
                    >
                      {r.beatIndex + 1}
                    </span>
                  ))}
                </div>
              )}

              <div className="typing-actions">
                <button type="button" className="typing-btn typing-btn-primary" onClick={startGame}>
                  다시 도전
                </button>
                <button
                  type="button"
                  className="typing-btn typing-btn-secondary"
                  onClick={() => setPhaseSafe('idle')}
                >
                  처음으로
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
                        {myStickyRank.entry.attemptCount}회 도전 · BPM {myStickyRank.entry.bpm}
                      </div>
                    </div>
                    <span className="typing-rank-score">
                      {formatAccuracy(myStickyRank.entry.bestAccuracy)}
                    </span>
                  </li>
                )}
                {leaderboard.slice(0, 20).map((entry, idx) => {
                  const isMe = user?.uid === entry.uid;
                  const rankClass =
                    idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : '';
                  return (
                    <li key={entry.uid} className={`typing-rank-item${isMe ? ' is-me' : ''}`}>
                      <span className={`typing-rank-num ${rankClass}`}>{idx + 1}</span>
                      <div className="typing-rank-info">
                        <div className="typing-rank-name">
                          {entry.nickname}
                          {isMe ? ' (나)' : ''}
                        </div>
                        <div className="typing-rank-meta">
                          {entry.attemptCount}회 도전 · BPM {entry.bpm} · 평균 오차 {entry.avgErrorMs}ms
                        </div>
                      </div>
                      <span className="typing-rank-score">{formatAccuracy(entry.bestAccuracy)}</span>
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
            formatScore={(c) =>
              c.accuracy != null ? formatAccuracy(Number(c.accuracy)) : formatAccuracy(0)
            }
            formatMeta={(c) => (c.bpm ? `BPM ${c.bpm}` : '')}
          />
        </section>
      </div>
    </div>
  );
};

export default RhythmBeatGame;
