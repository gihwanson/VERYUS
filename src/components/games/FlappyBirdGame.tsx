import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { detectGamePlatform, type GamePlatform } from '../../utils/gamePlatform';
import {
  saveFlappyBirdBestScore,
  parseReplay,
  type FlappyBirdBestScore,
} from '../../utils/flappyBirdScores';
import {
  FlappyReplayRecorder,
  sampleReplay,
  type FlappyReplayPoint,
} from '../../utils/flappyBirdReplay';
import {
  clearFlappyActiveSession,
  isSessionFresh,
  upsertFlappyActiveSession,
  type FlappyActiveSession,
} from '../../utils/flappyBirdSessions';
import {
  sortPastChampions,
  type GamePastChampion,
} from '../../utils/gamePastChampions';
import { getFlappyGrade } from '../../utils/flappyGrades';
import GameConfetti from './GameConfetti';
import GamePastChampions from './GamePastChampions';
import GameSoundToggle from './GameSoundToggle';
import FlappyRaceTrack from './FlappyRaceTrack';
import {
  playFlappyFlap,
  playFlappyHit,
  playFlappyScore,
  playGameComplete,
  playNewRecord,
  unlockGameAudio,
} from '../../utils/gameSounds';
import { setLastPlayedGame } from '../../utils/lastPlayedGame';
import { getDeterministicPipeGapY } from '../../utils/flappyBirdPipes';

type GamePhase = 'idle' | 'playing' | 'paused' | 'gameover';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'skipped' | 'error';

interface LeaderboardEntry {
  uid: string;
  nickname: string;
  bestScore: number;
  attemptCount: number;
}

interface Pipe {
  x: number;
  gapY: number;
  scored: boolean;
}

const CANVAS_W = 360;
const CANVAS_H = 520;
const BIRD_X = 72;
const BIRD_R = 14;
const BIRD_HIT_R = 11;
const GRAVITY = 0.42;
const FLAP_VEL = -7.2;
const PIPE_W = 52;
const PIPE_GAP = 128;
const BASE_PIPE_SPEED = 2.6;
const PIPE_SPAWN_DISTANCE = 210;
const GROUND_H = 48;
const TARGET_FRAME_MS = 1000 / 60;
const MAX_DELTA_MS = 50;
const INVINCIBLE_MS = 900;
const RESTART_DELAY_MS = 900;
const SESSION_SYNC_MS = 450;
const GHOST_SELF_X = BIRD_X;
const LEADERBOARD_GHOST_LIMIT = 20;
const GHOST_PALETTE = [
  '#c4b5fd',
  '#fda4af',
  '#86efac',
  '#fcd34d',
  '#f9a8d4',
  '#93c5fd',
  '#fdba74',
  '#a5f3fc',
  '#d8b4fe',
  '#bef264',
  '#fca5a5',
  '#67e8f9',
] as const;

interface RankGhost {
  uid: string;
  nickname: string;
  points: FlappyReplayPoint[];
  color: string;
  isMe: boolean;
}

const truncateNickname = (name: string, max = 8): string =>
  name.length > max ? `${name.slice(0, max)}…` : name;

const drawGhostBird = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  stroke: string,
  alpha: number,
  nickname?: string,
  labelOffsetY = 0
) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_R, BIRD_R - 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (nickname) {
    const label = truncateNickname(nickname);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.fillStyle = '#fff';
    ctx.strokeText(label, 0, -BIRD_R - 6 + labelOffsetY);
    ctx.fillText(label, 0, -BIRD_R - 6 + labelOffsetY);
  }
  ctx.restore();
};

const buildLeaderboard = (
  scores: FlappyBirdBestScore[],
  platform: GamePlatform
): LeaderboardEntry[] =>
  scores
    .filter((s) => s.platform === platform)
    .sort((a, b) => b.durationMs - a.durationMs)
    .map((s) => ({
      uid: s.uid,
      nickname: s.nickname,
      bestScore: s.durationMs,
      attemptCount: s.attemptCount,
    }));

const formatScore = (score: number): string => `${score}점`;

const getPipeSpeed = (score: number): number =>
  BASE_PIPE_SPEED + Math.min(Math.floor(score / 5) * 0.25, 1.5);

const FlappyBirdGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<GamePhase>('idle');
  const birdYRef = useRef(CANVAS_H / 2);
  const birdVelRef = useRef(0);
  const pipesRef = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const groundOffsetRef = useRef(0);
  const lastFrameRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const pipeIndexRef = useRef(0);
  const endedRef = useRef(false);
  const canRestartRef = useRef(true);
  const idleAnimRef = useRef<number | null>(null);
  const myBestScoreRef = useRef<number | null>(null);
  const gameElapsedRef = useRef(0);
  const replayRecorderRef = useRef(new FlappyReplayRecorder());
  const lastSessionSyncRef = useRef(0);
  const pendingReplayRef = useRef<FlappyReplayPoint[]>([]);
  const ghostDataRef = useRef<{ my: FlappyReplayPoint[]; ranked: RankGhost[] }>({
    my: [],
    ranked: [],
  });

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
  const [displayScore, setDisplayScore] = useState(0);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [bestScores, setBestScores] = useState<FlappyBirdBestScore[]>([]);
  const [pastChampions, setPastChampions] = useState<GamePastChampion[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [sessionPreviousBest, setSessionPreviousBest] = useState<number | null>(null);
  const [canRestart, setCanRestart] = useState(true);
  const [activeSessions, setActiveSessions] = useState<FlappyActiveSession[]>([]);
  const [ghostLiveScore, setGhostLiveScore] = useState<number | null>(null);

  const setPhaseSafe = useCallback((next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = 0;
  }, []);

  const stopIdleAnim = useCallback(() => {
    if (idleAnimRef.current !== null) {
      cancelAnimationFrame(idleAnimRef.current);
      idleAnimRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLastPlayedGame('flappy-bird');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(CANVAS_W * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'games', 'flappyBird', 'bestScores'),
      (snap) => {
        setLoadError(null);
        setBestScores(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...(data as Omit<FlappyBirdBestScore, 'id' | 'replay'>),
              replay: data.replay ? parseReplay(data.replay) : undefined,
            };
          })
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
      collection(db, 'games', 'flappyBird', 'pastChampions'),
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
    const unsub = onSnapshot(
      collection(db, 'games', 'flappyBird', 'activeSessions'),
      (snap) => {
        setActiveSessions(
          snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<FlappyActiveSession, 'id'>),
            }))
            .filter(
              (s) =>
                s.platform === platform &&
                isSessionFresh(s.updatedAt) &&
                s.uid !== user?.uid
            )
        );
      },
      (err) => {
        console.error('실시간 세션 불러오기 실패:', err);
      }
    );
    return () => unsub();
  }, [platform, user?.uid]);

  useEffect(() => {
    return () => {
      if (user?.uid) void clearFlappyActiveSession(user.uid, platform);
    };
  }, [platform, user?.uid]);

  useEffect(() => () => {
    stopLoop();
    stopIdleAnim();
  }, [stopIdleAnim, stopLoop]);

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

  const myBestScore = useMemo(() => {
    if (!user?.uid) return null;
    const me = leaderboard.find((e) => e.uid === user.uid);
    return me?.bestScore ?? null;
  }, [leaderboard, user?.uid]);

  useEffect(() => {
    myBestScoreRef.current = myBestScore;
  }, [myBestScore]);

  const myReplayPoints = useMemo(() => {
    if (!user?.uid) return [];
    const me = bestScores.find((s) => s.uid === user.uid && s.platform === platform);
    return me?.replay && me.replay.length > 0 ? me.replay : [];
  }, [bestScores, platform, user?.uid]);

  const rankedGhosts = useMemo((): RankGhost[] => {
    const ranked = buildLeaderboard(bestScores, platform).slice(0, LEADERBOARD_GHOST_LIMIT);
    const ghosts: RankGhost[] = [];
    let colorIdx = 0;

    for (const entry of ranked) {
      const doc = bestScores.find((s) => s.uid === entry.uid && s.platform === platform);
      if (!doc?.replay || doc.replay.length < 2) continue;

      const isMe = entry.uid === user?.uid;
      ghosts.push({
        uid: entry.uid,
        nickname: entry.nickname,
        points: doc.replay,
        color: isMe ? '#7dd3fc' : GHOST_PALETTE[colorIdx % GHOST_PALETTE.length],
        isMe,
      });
      if (!isMe) colorIdx += 1;
    }
    return ghosts;
  }, [bestScores, platform, user?.uid]);

  const rivalGhosts = useMemo(
    () => rankedGhosts.filter((g) => !g.isMe),
    [rankedGhosts]
  );

  useEffect(() => {
    ghostDataRef.current = {
      my: myReplayPoints,
      ranked: rankedGhosts,
    };
  }, [myReplayPoints, rankedGhosts]);

  const platformSessions = useMemo(
    () => activeSessions.filter((s) => s.platform === platform),
    [activeSessions, platform]
  );

  const raceMilestones = useMemo(() => {
    return bestScores
      .filter((s) => s.platform === platform && s.durationMs > 0)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
      .map((s) => ({
        uid: s.uid,
        nickname: s.nickname,
        score: s.durationMs,
        isMe: s.uid === user?.uid,
      }));
  }, [bestScores, platform, user?.uid]);

  const trackMax = useMemo(() => {
    const scores = [
      myBestScore ?? 0,
      displayScore,
      ghostLiveScore ?? 0,
      ...raceMilestones.map((m) => m.score),
      ...platformSessions.map((s) => s.score),
    ];
    return Math.max(10, ...scores) + 2;
  }, [displayScore, ghostLiveScore, myBestScore, platformSessions, raceMilestones]);

  const syncActiveSession = useCallback(
    async (elapsedMs: number) => {
      if (!user?.uid || !user?.nickname) return;
      try {
        await upsertFlappyActiveSession({
          uid: user.uid,
          nickname: user.nickname,
          platform,
          score: scoreRef.current,
          birdY: birdYRef.current,
          elapsedMs,
          personalBest: myBestScoreRef.current ?? 0,
        });
      } catch (e) {
        console.warn('실시간 세션 동기화 실패:', e);
      }
    },
    [platform, user]
  );

  const saveScore = useCallback(
    async (score: number, replay?: FlappyReplayPoint[]) => {
      if (!user?.uid || !user?.nickname) {
        setSaveStatus('skipped');
        setSaveDetail('로그인 정보가 없어 기록을 저장하지 못했습니다.');
        return;
      }

      setSaveStatus('saving');
      setSaveDetail(null);
      try {
        const result = await saveFlappyBirdBestScore({
          uid: user.uid,
          nickname: user.nickname,
          score,
          platform,
          replay,
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
            ? `이번 ${formatScore(score)} · ${platform === 'pc' ? 'PC' : '모바일'} 신기록! (${result.attemptCount}회째 도전)`
            : `이번 ${formatScore(score)} 저장 · 최고 ${formatScore(result.bestScore)} 유지 (${result.attemptCount}회째 도전)`
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

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, birdRot: number) => {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    skyGrad.addColorStop(0, '#4ec0ca');
    skyGrad.addColorStop(0.55, '#87ceeb');
    skyGrad.addColorStop(1, '#ded895');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H - GROUND_H);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(80, 90, 36, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(260, 140, 44, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const pipe of pipesRef.current) {
      const topH = pipe.gapY - PIPE_GAP / 2;
      const bottomY = pipe.gapY + PIPE_GAP / 2;
      ctx.fillStyle = '#73bf2e';
      ctx.strokeStyle = '#558c22';
      ctx.lineWidth = 2;
      ctx.fillRect(pipe.x, 0, PIPE_W, topH);
      ctx.strokeRect(pipe.x, 0, PIPE_W, topH);
      ctx.fillRect(pipe.x, bottomY, PIPE_W, CANVAS_H - GROUND_H - bottomY);
      ctx.strokeRect(pipe.x, bottomY, PIPE_W, CANVAS_H - GROUND_H - bottomY);
      ctx.fillStyle = '#8ed636';
      ctx.fillRect(pipe.x - 4, topH - 24, PIPE_W + 8, 24);
      ctx.fillRect(pipe.x - 4, bottomY, PIPE_W + 8, 24);
    }

    const elapsed = gameElapsedRef.current;
    const { ranked } = ghostDataRef.current;

    if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
      ranked.forEach((ghost, index) => {
        const sample = sampleReplay(ghost.points, elapsed);
        if (!sample || sample.finished) return;

        const alpha = ghost.isMe ? 0.55 : 0.4;
        const stroke = ghost.isMe ? '#0ea5e9' : 'rgba(255,255,255,0.55)';
        const labelOffsetY = -((index % 4) * 11);
        drawGhostBird(
          ctx,
          GHOST_SELF_X,
          sample.y,
          ghost.color,
          stroke,
          alpha,
          ghost.nickname,
          labelOffsetY
        );
      });
    }

    const by = birdYRef.current;
    ctx.save();
    ctx.translate(BIRD_X, by);
    ctx.rotate(birdRot);
    ctx.fillStyle = '#f7d308';
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R + 2, BIRD_R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(8, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e65c00';
    ctx.beginPath();
    ctx.moveTo(12, 2);
    ctx.lineTo(22, 6);
    ctx.lineTo(12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const groundY = CANVAS_H - GROUND_H;
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, groundY, CANVAS_W, GROUND_H);
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(0, groundY, CANVAS_W, 12);

    const tileW = 24;
    const offset = groundOffsetRef.current % tileW;
    ctx.strokeStyle = '#5a9a24';
    ctx.lineWidth = 2;
    for (let x = -offset; x < CANVAS_W + tileW; x += tileW) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 12);
      ctx.lineTo(x + tileW / 2, groundY + GROUND_H);
      ctx.stroke();
    }

    if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 4;
      const scoreText = String(scoreRef.current);
      ctx.strokeText(scoreText, CANVAS_W / 2, 52);
      ctx.fillText(scoreText, CANVAS_W / 2, 52);
    }
  }, []);

  const endGame = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    stopLoop();
    const score = scoreRef.current;
    setFinalScore(score);
    setPhaseSafe('gameover');
    canRestartRef.current = false;
    setCanRestart(false);
    window.setTimeout(() => {
      canRestartRef.current = true;
      setCanRestart(true);
    }, RESTART_DELAY_MS);
    if (score > 0) playGameComplete();
    pendingReplayRef.current = replayRecorderRef.current.getPoints();
    if (user?.uid) void clearFlappyActiveSession(user.uid, platform);
    void saveScore(score, pendingReplayRef.current);
  }, [platform, saveScore, setPhaseSafe, stopLoop, user?.uid]);

  const checkCollision = useCallback((now: number): boolean => {
    if (now < invincibleUntilRef.current) return false;

    const by = birdYRef.current;
    if (by - BIRD_HIT_R <= 0 || by + BIRD_HIT_R >= CANVAS_H - GROUND_H) return true;

    for (const pipe of pipesRef.current) {
      const inPipeX = BIRD_X + BIRD_HIT_R > pipe.x && BIRD_X - BIRD_HIT_R < pipe.x + PIPE_W;
      if (!inPipeX) continue;
      const gapTop = pipe.gapY - PIPE_GAP / 2;
      const gapBottom = pipe.gapY + PIPE_GAP / 2;
      if (by - BIRD_HIT_R < gapTop || by + BIRD_HIT_R > gapBottom) return true;
    }
    return false;
  }, []);

  const spawnPipe = useCallback(() => {
    const gapY = getDeterministicPipeGapY(pipeIndexRef.current);
    pipeIndexRef.current += 1;
    pipesRef.current.push({ x: CANVAS_W + 10, gapY, scored: false });
  }, []);

  const shouldSpawnPipe = useCallback((): boolean => {
    const pipes = pipesRef.current;
    if (pipes.length === 0) return false;
    const rightmost = Math.max(...pipes.map((p) => p.x));
    return rightmost < CANVAS_W - PIPE_SPAWN_DISTANCE;
  }, []);

  const resetRoundState = useCallback(() => {
    endedRef.current = false;
    birdYRef.current = CANVAS_H / 2;
    birdVelRef.current = 0;
    pipesRef.current = [];
    scoreRef.current = 0;
    groundOffsetRef.current = 0;
    lastFrameRef.current = 0;
    pipeIndexRef.current = 0;
    invincibleUntilRef.current = performance.now() + INVINCIBLE_MS;
    setSessionPreviousBest(myBestScoreRef.current);
    setDisplayScore(0);
    setFinalScore(null);
    setSaveStatus('idle');
    setSaveDetail(null);
    setShowConfetti(false);
    canRestartRef.current = true;
    setCanRestart(true);
    gameElapsedRef.current = 0;
    lastSessionSyncRef.current = 0;
    replayRecorderRef.current.reset();
    setGhostLiveScore(null);
    spawnPipe();
  }, [spawnPipe]);

  const gameLoop = useCallback(
    (timestamp: number) => {
      if (phaseRef.current !== 'playing') return;

      if (lastFrameRef.current === 0) {
        lastFrameRef.current = timestamp;
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const deltaMs = Math.min(timestamp - lastFrameRef.current, MAX_DELTA_MS);
      lastFrameRef.current = timestamp;
      const scale = deltaMs / TARGET_FRAME_MS;
      const pipeSpeed = getPipeSpeed(scoreRef.current);

      birdVelRef.current += GRAVITY * scale;
      birdYRef.current += birdVelRef.current * scale;
      gameElapsedRef.current += deltaMs;

      replayRecorderRef.current.sample(
        gameElapsedRef.current,
        birdYRef.current,
        scoreRef.current
      );

      const selfGhostSample = sampleReplay(ghostDataRef.current.my, gameElapsedRef.current);
      if (selfGhostSample && !selfGhostSample.finished) {
        const nextGhostScore = Math.floor(selfGhostSample.score);
        setGhostLiveScore((prev) => (prev === nextGhostScore ? prev : nextGhostScore));
      }

      if (
        user?.uid &&
        gameElapsedRef.current - lastSessionSyncRef.current >= SESSION_SYNC_MS
      ) {
        lastSessionSyncRef.current = gameElapsedRef.current;
        void syncActiveSession(gameElapsedRef.current);
      }

      if (shouldSpawnPipe()) spawnPipe();

      groundOffsetRef.current += pipeSpeed * scale;

      for (const pipe of pipesRef.current) {
        pipe.x -= pipeSpeed * scale;
        if (!pipe.scored && pipe.x + PIPE_W < BIRD_X) {
          pipe.scored = true;
          scoreRef.current += 1;
          setDisplayScore(scoreRef.current);
          playFlappyScore();
        }
      }
      pipesRef.current = pipesRef.current.filter((p) => p.x + PIPE_W > -20);

      if (checkCollision(timestamp)) {
        playFlappyHit();
        endGame();
        return;
      }

      const birdRot = Math.min(Math.max(birdVelRef.current * 0.06, -0.5), 0.9);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) drawScene(ctx, birdRot);

      rafRef.current = requestAnimationFrame(gameLoop);
    },
    [checkCollision, drawScene, endGame, shouldSpawnPipe, spawnPipe, syncActiveSession, user?.uid]
  );

  const startPlaying = useCallback(() => {
    stopIdleAnim();
    resetRoundState();
    setPhaseSafe('playing');
    playFlappyFlap();
    birdVelRef.current = FLAP_VEL;
    void syncActiveSession(0);
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, resetRoundState, setPhaseSafe, stopIdleAnim, syncActiveSession]);

  const resumePlaying = useCallback(() => {
    setPhaseSafe('playing');
    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, setPhaseSafe]);

  const flap = useCallback(() => {
    unlockGameAudio();
    const current = phaseRef.current;

    if (current === 'idle' || current === 'gameover') {
      if (current === 'gameover' && !canRestartRef.current) return;
      startPlaying();
      return;
    }

    if (current === 'paused') {
      resumePlaying();
      birdVelRef.current = FLAP_VEL;
      playFlappyFlap();
      return;
    }

    if (current === 'playing') {
      birdVelRef.current = FLAP_VEL;
      playFlappyFlap();
    }
  }, [resumePlaying, startPlaying]);

  const pauseGame = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    stopLoop();
    setPhaseSafe('paused');
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      const birdRot = Math.min(Math.max(birdVelRef.current * 0.06, -0.5), 0.9);
      drawScene(ctx, birdRot);
    }
  }, [drawScene, setPhaseSafe, stopLoop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flap]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      pauseGame();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [pauseGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    if (phase === 'gameover' || phase === 'paused') {
      drawScene(ctx, 0);
    }
  }, [drawScene, phase]);

  useEffect(() => {
    if (phase !== 'idle') {
      stopIdleAnim();
      return;
    }

    const tick = (timestamp: number) => {
      if (phaseRef.current !== 'idle') return;
      birdYRef.current = CANVAS_H / 2 + Math.sin(timestamp / 380) * 8;
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawScene(ctx, Math.sin(timestamp / 380) * 0.08);
      idleAnimRef.current = requestAnimationFrame(tick);
    };

    idleAnimRef.current = requestAnimationFrame(tick);
    return () => stopIdleAnim();
  }, [drawScene, phase, stopIdleAnim]);

  const finishGrade = useMemo(
    () => (finalScore !== null ? getFlappyGrade(finalScore) : null),
    [finalScore]
  );

  const saveStatusMessage = useMemo(() => {
    if (saveStatus === 'saving') return '저장 중...';
    if (saveStatus === 'saved') return saveDetail ?? '저장됨';
    if (saveStatus === 'skipped' || saveStatus === 'error') return saveDetail ?? '저장 실패';
    return '';
  }, [saveDetail, saveStatus]);

  const handleBack = useCallback(() => {
    stopLoop();
    stopIdleAnim();
    if (user?.uid) void clearFlappyActiveSession(user.uid, platform);
    navigate('/games');
  }, [navigate, platform, stopIdleAnim, stopLoop, user?.uid]);

  return (
    <div className="games-page">
      <GameConfetti show={showConfetti} />
      <div className="games-content">
        <header className="games-header">
          <button type="button" className="games-back-btn" onClick={handleBack}>
            ← 게임 목록
          </button>
        </header>

        <h1 className="games-title" style={{ marginBottom: 8 }}>
          플래피 버드
        </h1>
        <p className="games-subtitle" style={{ marginBottom: 20 }}>
          탭하거나 스페이스바로 날개짓! 나의 분신과 다른 플레이어 진행 현황을 보며 도전하세요.
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

          {myBestScore != null && phase === 'idle' && (
            <p className="typing-personal-best">내 최고 기록: {formatScore(myBestScore)}</p>
          )}

          <FlappyRaceTrack
            trackMax={trackMax}
            myScore={displayScore}
            ghostScore={ghostLiveScore}
            ghostLabel="나의 분신"
            activeSessions={platformSessions}
            milestones={raceMilestones}
            myUid={user?.uid}
            showLive={phase === 'playing' || phase === 'paused'}
          />

          {(myReplayPoints.length > 0 || rivalGhosts.length > 0) && (
            <div className="flappy-ghost-legend">
              {myReplayPoints.length > 0 && (
                <span>
                  <span style={{ color: '#7dd3fc' }}>●</span> 하늘색 = 나의 분신 (최고 기록)
                </span>
              )}
              {rivalGhosts.length > 0 && (
                <span>
                  <span style={{ color: GHOST_PALETTE[0] }}>●</span> 순위권 분신 {rivalGhosts.length}명
                  {rivalGhosts.length <= 4
                    ? ` (${rivalGhosts.map((g) => g.nickname).join(', ')})`
                    : ''}
                </span>
              )}
              <span>🐦 = 지금 플레이 중 · 사망 시 분신 사라짐</span>
            </div>
          )}

          <div
            className="flappy-game-area"
            onPointerDown={(e) => {
              e.preventDefault();
              flap();
            }}
          >
            <canvas
              ref={canvasRef}
              className="flappy-canvas"
              width={CANVAS_W}
              height={CANVAS_H}
              aria-label="플래피 버드 게임"
            />
            {phase === 'idle' && (
              <div className="flappy-overlay">
                <p className="flappy-overlay-title">탭해서 시작</p>
                <p className="flappy-overlay-hint">
                  PC: 스페이스바
                  {myReplayPoints.length > 0 ? ' · 나의 분신이 함께 납니다' : ''}
                </p>
              </div>
            )}
            {phase === 'paused' && (
              <div className="flappy-overlay flappy-overlay--paused">
                <p className="flappy-overlay-title">일시정지</p>
                <p className="flappy-overlay-hint">탭해서 계속하기</p>
              </div>
            )}
            {phase === 'gameover' && finalScore !== null && (
              <div className="flappy-overlay flappy-overlay--result">
                <p className="flappy-overlay-title">게임 오버</p>
                <p className="flappy-overlay-score">{formatScore(finalScore)}</p>
                <p className="flappy-overlay-hint">
                  {canRestart ? '탭해서 다시 도전' : '잠시 후 다시 도전할 수 있어요'}
                </p>
              </div>
            )}
          </div>

          {phase === 'gameover' && finalScore !== null && (
            <div
              className={`typing-result${saveStatus === 'error' || saveStatus === 'skipped' ? ' typing-result--error' : ''}`}
            >
              <h4>이번 기록: {formatScore(finalScore)}</h4>
              {finishGrade && (
                <p className={`reaction-grade reaction-grade--${finishGrade.tone}`}>
                  {finishGrade.emoji} {finishGrade.label}
                </p>
              )}
              {saveStatusMessage && <p>{saveStatusMessage}</p>}
              {sessionPreviousBest != null && (
                <p className="typing-result-compare">
                  {finalScore > sessionPreviousBest
                    ? `이전 최고 ${formatScore(sessionPreviousBest)}보다 +${finalScore - sessionPreviousBest}점!`
                    : finalScore === sessionPreviousBest
                      ? '최고 기록과 동일합니다'
                      : `최고 기록 ${formatScore(sessionPreviousBest)} (차이 -${sessionPreviousBest - finalScore}점)`}
                </p>
              )}
              {sessionPreviousBest == null && finalScore >= 0 && saveStatus === 'saved' && (
                <p className="typing-result-compare">첫 플레이 기록이 저장되었습니다!</p>
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
                  onClick={() => void saveScore(finalScore, pendingReplayRef.current)}
                >
                  다시 저장 시도
                </button>
              )}
            </div>
          )}

          {phase === 'playing' && (
            <p className="flappy-live-score" aria-live="polite">
              현재 {displayScore}점
              {displayScore >= 5 && (
                <span className="flappy-speed-hint"> · 속도 증가 중</span>
              )}
            </p>
          )}

          <div className="typing-actions">
            {phase === 'gameover' && (
              <button
                type="button"
                className="typing-btn typing-btn-primary"
                onClick={flap}
                disabled={!canRestart}
              >
                {canRestart ? '다시 도전' : '잠시만요…'}
              </button>
            )}
            {phase === 'playing' && (
              <button
                type="button"
                className="typing-btn typing-btn-secondary"
                onClick={() => {
                  stopLoop();
                  endGame();
                }}
              >
                포기
              </button>
            )}
            {phase === 'paused' && (
              <button type="button" className="typing-btn typing-btn-primary" onClick={flap}>
                계속하기
              </button>
            )}
          </div>
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
                      {formatScore(myStickyRank.entry.bestScore)}
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
                        {formatScore(entry.bestScore)}
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
            formatScore={(champion) => formatScore(champion.durationMs)}
          />
        </section>
      </div>
    </div>
  );
};

export default FlappyBirdGame;
