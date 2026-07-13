import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../../../firebase';
import { useNavigate } from 'react-router-dom';
import GameSoundToggle from '../GameSoundToggle';
import GameConfetti from '../GameConfetti';
import {
  canConnectSichuan,
  comboBonusForMatch,
  countRemainingTiles,
  createSichuanBoard,
  findSichuanHint,
  getSichuanFace,
  hasAnySichuanMatch,
  removeSichuanPair,
  reshuffleSichuanBoard,
  SICHUAN_CLEAR_BONUS,
  SICHUAN_COLS,
  SICHUAN_FACES,
  SICHUAN_MATCH_POINTS,
  SICHUAN_MAX_SHUFFLES,
  SICHUAN_ROWS,
  SICHUAN_TILE_SLOTS,
  sichuanScoreFor,
  type SichuanBoard,
  type SichuanMatchPath,
  type SichuanPos,
} from '../../../utils/sichuanLogic';
import {
  formatSichuanTime,
  loadSichuanSoloPb,
  saveSichuanSoloPbIfBetter,
  type SichuanSoloPersonalBest,
} from '../../../utils/sichuanPersonalBest';
import {
  applySichuanMatchResult,
  emptySichuanRecord,
  formatSichuanRecord,
  getSichuanRecordsByUids,
  subscribeSichuanRecords,
  sichuanWinRate,
  type SichuanRecord,
} from '../../../utils/sichuanRecords';
import {
  createSichuanRoom,
  dissolveSichuanRoom,
  finishSichuanRoom,
  joinSichuanRoom,
  leaveSichuanRoom,
  pruneClosedSichuanRooms,
  pruneStaleSichuanLobbies,
  roomTitle,
  setSichuanPlayerReady,
  sichuanMaxPlayers,
  startSichuanGame,
  subscribeSichuanLobbies,
  subscribeSichuanPlayers,
  subscribeSichuanRoom,
  teamLabel,
  teamScore,
  touchSichuanLobbyPresence,
  updateSichuanProgress,
  type SichuanMode,
  type SichuanPlayer,
  type SichuanRoom,
} from '../../../utils/sichuanRooms';
import {
  playGameComplete,
  playSichuanMatch,
  playSichuanMiss,
  playSichuanSelect,
  playSichuanShuffle,
  unlockGameAudio,
} from '../../../utils/gameSounds';
import { setLastPlayedGame } from '../../../utils/lastPlayedGame';
import './SichuanGame.css';

type Screen = 'menu' | 'lobby' | 'play' | 'result';

interface MatchResultSnapshot {
  mode: SichuanMode;
  players: SichuanPlayer[];
  myScore: number;
  myPairs: number;
  myRemaining: number;
  elapsedSec: number;
}

const PROGRESS_SYNC_MS = 700;
const MATCH_PATH_MS = 100;
const AUTO_SHUFFLE_MS = 180;

const posKey = (p: SichuanPos) => `${p.r},${p.c}`;

const pathToSvgPoints = (points: SichuanPos[]): string =>
  points
    .map((p) => {
      const c = Math.max(-0.5, Math.min(SICHUAN_COLS - 0.5, p.c + 0.5));
      const r = Math.max(-0.5, Math.min(SICHUAN_ROWS - 0.5, p.r + 0.5));
      const x = (c / SICHUAN_COLS) * 100;
      const y = (r / SICHUAN_ROWS) * 100;
      return `${x},${y}`;
    })
    .join(' ');

const SichuanGame: React.FC = () => {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem('veryus_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const myUid =
    (user?.uid as string | undefined) || auth.currentUser?.uid || undefined;
  const nickname =
    (user?.nickname as string) ||
    auth.currentUser?.displayName ||
    '익명';

  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<SichuanMode | 'solo'>('solo');
  const [room, setRoom] = useState<SichuanRoom | null>(null);
  const [players, setPlayers] = useState<SichuanPlayer[]>([]);
  const [openRooms, setOpenRooms] = useState<SichuanRoom[]>([]);
  const [lobbyFilter, setLobbyFilter] = useState<'all' | SichuanMode>('all');
  const [rankings, setRankings] = useState<SichuanRecord[]>([]);
  const [lobbyRecords, setLobbyRecords] = useState<Record<string, SichuanRecord>>({});
  const [myRecord, setMyRecord] = useState<SichuanRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<SichuanMode | null>(null);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [board, setBoard] = useState<SichuanBoard>(() => createSichuanBoard(Date.now()));
  const [selected, setSelected] = useState<SichuanPos | null>(null);
  const [path, setPath] = useState<SichuanMatchPath | null>(null);
  const [hintPair, setHintPair] = useState<{ a: SichuanPos; b: SichuanPos } | null>(null);
  const [score, setScore] = useState(0);
  const [pairs, setPairs] = useState(0);
  const [shuffleLeft, setShuffleLeft] = useState(SICHUAN_MAX_SHUFFLES);
  const [seed, setSeed] = useState(1);
  const [finished, setFinished] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [resultTitle, setResultTitle] = useState('');
  const [resultSnapshot, setResultSnapshot] = useState<MatchResultSnapshot | null>(null);
  const [hintFlash, setHintFlash] = useState(false);
  const [floatScore, setFloatScore] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const [firstClearBanner, setFirstClearBanner] = useState<string | null>(null);
  const [soloPb, setSoloPb] = useState<SichuanSoloPersonalBest | null>(() => loadSichuanSoloPb());
  const [resultMeta, setResultMeta] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);
  const [playArmed, setPlayArmed] = useState(true);
  const [showTip, setShowTip] = useState(() => {
    try {
      return localStorage.getItem('veryus_sichuan_tip') !== '1';
    } catch {
      return true;
    }
  });

  const boardRef = useRef(board);
  const scoreRef = useRef(score);
  const pairsRef = useRef(pairs);
  const finishedRef = useRef(finished);
  const shuffleLeftRef = useRef(shuffleLeft);
  const seedRef = useRef(seed);
  const syncTimerRef = useRef<number | null>(null);
  const pathTimerRef = useRef<number | null>(null);
  const autoShuffleTimerRef = useRef<number | null>(null);
  const playersThrottleRef = useRef<number | null>(null);
  const pendingPlayersRef = useRef<SichuanPlayer[] | null>(null);
  const playersRef = useRef<SichuanPlayer[]>([]);
  const countdownTimersRef = useRef<number[]>([]);
  const finishLockRef = useRef(false);
  const matchingLockRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  const lastMatchAtRef = useRef(0);
  const comboRef = useRef(0);
  const comboBonusRef = useRef(0);
  const floatTimerRef = useRef<number | null>(null);
  const playScrollRef = useRef({ x: 0, y: 0 });
  const elapsedSecRef = useRef(0);
  const myTeamRef = useRef<0 | 1 | null>(null);
  const roomRef = useRef<SichuanRoom | null>(null);
  const myUidRef = useRef<string | undefined>(undefined);
  const modeRef = useRef<SichuanMode | 'solo'>('solo');
  const screenRef = useRef<Screen>('menu');

  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    myUidRef.current = myUid;
  }, [myUid]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const lockScrollDuringMatch = () => {
    playScrollRef.current = { x: window.scrollX, y: window.scrollY };
  };

  const restoreScrollIfJumped = () => {
    const { x, y } = playScrollRef.current;
    if (window.scrollX !== x || window.scrollY !== y) {
      window.scrollTo(x, y);
    }
  };

  useEffect(() => {
    setLastPlayedGame('sichuan');
  }, []);

  useEffect(() => {
    if (screen !== 'menu' || !myUid) {
      setOpenRooms([]);
      return;
    }
    const pruneAll = () => {
      void pruneStaleSichuanLobbies().catch(() => undefined);
      void pruneClosedSichuanRooms().catch(() => undefined);
    };
    pruneAll();
    const pruneTimer = window.setInterval(pruneAll, 12_000);
    const unsub = subscribeSichuanLobbies(
      setOpenRooms,
      () => setError('방 목록을 불러오지 못했습니다. 규칙을 배포했는지 확인해 주세요.')
    );
    return () => {
      unsub();
      window.clearInterval(pruneTimer);
    };
  }, [screen, myUid]);

  // 로비 대기 중 생존 신호 (유령 참가자 정리용)
  useEffect(() => {
    if (screen !== 'lobby' || !room?.id || !myUid) return;
    void touchSichuanLobbyPresence(room.id, myUid);
    const t = window.setInterval(() => {
      void touchSichuanLobbyPresence(room.id, myUid);
    }, 20_000);
    return () => window.clearInterval(t);
  }, [screen, room?.id, myUid]);

  // 탭 닫기/새로고침 시 로비·게임 잔여 참가 정리 (유령 방 방지)
  useEffect(() => {
    const leaveOnUnload = () => {
      const currentRoom = roomRef.current;
      const uid = myUidRef.current;
      if (!currentRoom || !uid || modeRef.current === 'solo') return;
      if (screenRef.current === 'menu') return;
      const isHost = currentRoom.hostUid === uid;
      if (
        screenRef.current === 'result' ||
        currentRoom.status === 'finished' ||
        ((screenRef.current === 'lobby' || currentRoom.status === 'lobby') && isHost)
      ) {
        void dissolveSichuanRoom(currentRoom.id);
        return;
      }
      void leaveSichuanRoom(currentRoom.id, uid);
    };
    window.addEventListener('pagehide', leaveOnUnload);
    window.addEventListener('beforeunload', leaveOnUnload);
    return () => {
      window.removeEventListener('pagehide', leaveOnUnload);
      window.removeEventListener('beforeunload', leaveOnUnload);
    };
  }, []);

  useEffect(() => {
    if (screen !== 'menu' || !myUid) {
      setRankings([]);
      return;
    }
    const unsub = subscribeSichuanRecords(
      (list) => {
        setRankings(list);
        const mine = list.find((r) => r.uid === myUid);
        setMyRecord(mine ?? emptySichuanRecord(myUid, nickname));
      },
      () => {
        /* 전적 규칙은 배포 전이면 조용히 비움 */
      }
    );
    return () => unsub();
  }, [screen, myUid, nickname]);

  useEffect(() => {
    if (screen !== 'lobby' || !room) {
      setLobbyRecords({});
      return;
    }
    const uids = players.map((p) => p.uid);
    if (uids.length === 0) return;
    let cancelled = false;
    void getSichuanRecordsByUids(uids)
      .then((map) => {
        if (!cancelled) setLobbyRecords(map);
      })
      .catch(() => {
        if (!cancelled) setLobbyRecords({});
      });
    return () => {
      cancelled = true;
    };
  }, [screen, room, players]);

  useEffect(() => {
    if (!error) return;
    const ms = /권한|배포|로그인/i.test(error) ? 8000 : 4200;
    const t = window.setTimeout(() => setError(null), ms);
    return () => window.clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (screen !== 'play' || finished || !playArmed) return;
    setElapsedSec(0);
    elapsedSecRef.current = 0;
    const t = window.setInterval(() => {
      setElapsedSec((s) => {
        const next = s + 1;
        elapsedSecRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [screen, finished, seed, playArmed]);

  const clearCountdownTimers = useCallback(() => {
    countdownTimersRef.current.forEach((id) => window.clearTimeout(id));
    countdownTimersRef.current = [];
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdownTimers();
    setPlayArmed(false);
    matchingLockRef.current = true;
    const steps = ['3', '2', '1', '시작!'];
    const delays = [0, 700, 1400, 2100];
    steps.forEach((label, i) => {
      const id = window.setTimeout(() => setCountdownLabel(label), delays[i]);
      countdownTimersRef.current.push(id);
    });
    const doneId = window.setTimeout(() => {
      setCountdownLabel(null);
      setPlayArmed(true);
      matchingLockRef.current = false;
    }, 3200);
    countdownTimersRef.current.push(doneId);
  }, [clearCountdownTimers]);

  useEffect(() => () => clearCountdownTimers(), [clearCountdownTimers]);

  useEffect(
    () => () => {
      if (autoShuffleTimerRef.current !== null) {
        window.clearTimeout(autoShuffleTimerRef.current);
      }
      if (pathTimerRef.current !== null) window.clearTimeout(pathTimerRef.current);
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && screen === 'play') {
        setSelected(null);
        setHintPair(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    pairsRef.current = pairs;
  }, [pairs]);
  useEffect(() => {
    finishedRef.current = finished;
  }, [finished]);
  useEffect(() => {
    shuffleLeftRef.current = shuffleLeft;
  }, [shuffleLeft]);

  const isHost = !!(room && myUid && room.hostUid === myUid);
  const myPlayer = players.find((p) => p.uid === myUid);
  const visibleOpenRooms = openRooms.filter((r) => {
    if (r.status !== 'lobby') return false;
    if ((Number(r.playerCount) || 0) < 1) return false;
    if (lobbyFilter !== 'all' && r.mode !== lobbyFilter) return false;
    return true;
  });
  const lobbyNeed = room ? sichuanMaxPlayers(room.mode) : 0;
  const lobbyCanStart =
    !!room &&
    players.length >= lobbyNeed &&
    players.filter((p) => p.uid !== room.hostUid).every((p) => p.ready);

  useEffect(() => {
    if (myPlayer) myTeamRef.current = myPlayer.team;
  }, [myPlayer]);

  const flushProgress = useCallback(
    async (override?: {
      finished?: boolean;
      remaining?: number;
      pairs?: number;
      comboBonus?: number;
    }) => {
      if (!room || !myUid || mode === 'solo') return;
      const nextPairs = override?.pairs ?? pairsRef.current;
      const remaining =
        override?.remaining ?? countRemainingTiles(boardRef.current);
      const comboBonus = override?.comboBonus ?? comboBonusRef.current;
      await updateSichuanProgress({
        roomId: room.id,
        uid: myUid,
        score: sichuanScoreFor(nextPairs, remaining, comboBonus),
        pairs: nextPairs,
        remaining,
        finished: override?.finished ?? finishedRef.current,
        shuffleCount: SICHUAN_MAX_SHUFFLES - shuffleLeftRef.current,
        comboBonus,
      });
    },
    [mode, myUid, room]
  );

  const scheduleProgressSync = useCallback(() => {
    if (!room || mode === 'solo') return;
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      void flushProgress();
    }, PROGRESS_SYNC_MS);
  }, [flushProgress, mode, room]);

  const scheduleProgressSyncRef = useRef(scheduleProgressSync);
  useEffect(() => {
    scheduleProgressSyncRef.current = scheduleProgressSync;
  }, [scheduleProgressSync]);

  const ensureAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    unlockGameAudio();
  }, []);

  const applyShuffleBoard = useCallback((sourceBoard: SichuanBoard, consumeCount: number): SichuanBoard => {
    let current = sourceBoard;
    let left = shuffleLeftRef.current;
    let used = 0;
    while (used < consumeCount && left > 0) {
      const nextSeed = (seedRef.current + Date.now() + used * 9973) >>> 0;
      current = reshuffleSichuanBoard(current, nextSeed);
      seedRef.current = nextSeed;
      left -= 1;
      used += 1;
      if (hasAnySichuanMatch(current)) break;
    }
    if (used > 0) {
      boardRef.current = current;
      shuffleLeftRef.current = left;
      setBoard(current);
      setSeed(seedRef.current);
      setShuffleLeft(left);
      setSelected(null);
      setPath(null);
      setHintPair(null);
      comboRef.current = 0;
      setCombo(0);
      playSichuanShuffle();
      if (modeRef.current !== 'solo') scheduleProgressSyncRef.current();
    }
    const stillStuck =
      countRemainingTiles(current) > 0 && !hasAnySichuanMatch(current);
    setStuck(stillStuck);
    return current;
  }, []);

  const scheduleAutoShuffleIfNeeded = useCallback(
    (nextBoard: SichuanBoard) => {
      if (autoShuffleTimerRef.current !== null) {
        window.clearTimeout(autoShuffleTimerRef.current);
        autoShuffleTimerRef.current = null;
      }
      const remaining = countRemainingTiles(nextBoard);
      if (remaining <= 0 || finishedRef.current) {
        setStuck(false);
        return;
      }
      if (hasAnySichuanMatch(nextBoard)) {
        setStuck(false);
        return;
      }
      setStuck(true);
      if (shuffleLeftRef.current <= 0) return;

      autoShuffleTimerRef.current = window.setTimeout(() => {
        autoShuffleTimerRef.current = null;
        if (finishedRef.current || matchingLockRef.current) return;
        if (shuffleLeftRef.current <= 0) return;
        if (hasAnySichuanMatch(boardRef.current)) {
          setStuck(false);
          return;
        }
        applyShuffleBoard(boardRef.current, shuffleLeftRef.current);
      }, AUTO_SHUFFLE_MS);
    },
    [applyShuffleBoard]
  );

  useEffect(() => {
    if (!playArmed || finished || screen !== 'play') return;
    scheduleAutoShuffleIfNeeded(boardRef.current);
  }, [playArmed, finished, screen, seed, scheduleAutoShuffleIfNeeded]);

  useEffect(() => {
    if (!room?.id) return;
    let startedForSeed: number | null = null;
    let finishedAnnounced = false;

    const unsubRoom = subscribeSichuanRoom(room.id, (next) => {
      if (!next) {
        // 종료 후 방 삭제는 정상 — 결과 화면 유지
        if (
          finishedAnnounced ||
          finishedRef.current ||
          screenRef.current === 'result'
        ) {
          setRoom(null);
          return;
        }
        setError('방이 닫혔습니다.');
        setRoom(null);
        setPlayers([]);
        setScreen('menu');
        return;
      }
      setRoom(next);

      if (next.status === 'playing' && startedForSeed !== next.seed) {
        startedForSeed = next.seed;
        finishLockRef.current = false;
        matchingLockRef.current = true;
        setSeed(next.seed || 1);
        setBoard(createSichuanBoard(next.seed || 1));
        setSelected(null);
        setPath(null);
        setHintPair(null);
        setScore(0);
        setPairs(0);
        setShuffleLeft(SICHUAN_MAX_SHUFFLES);
        setFinished(false);
        setStuck(false);
        setShowConfetti(false);
        setCombo(0);
        comboRef.current = 0;
        comboBonusRef.current = 0;
        lastMatchAtRef.current = 0;
        setFloatScore(null);
        setFirstClearBanner(null);
        setResultMeta(null);
        setResultSnapshot(null);
        setScreen('play');
        startCountdown();
        if (myUid) {
          void updateSichuanProgress({
            roomId: next.id,
            uid: myUid,
            score: 0,
            pairs: 0,
            remaining: SICHUAN_TILE_SLOTS,
            finished: false,
            shuffleCount: 0,
            comboBonus: 0,
          });
        }
      }

      if (next.status === 'finished' && !finishedAnnounced) {
        finishedAnnounced = true;
        matchingLockRef.current = false;
        clearCountdownTimers();
        setCountdownLabel(null);
        setPlayArmed(true);
        setFinished(true);
        finishedRef.current = true;

        // 스로틀 중이던 최신 참가자 상태를 결과 화면에 고정
        if (playersThrottleRef.current !== null) {
          window.clearTimeout(playersThrottleRef.current);
          playersThrottleRef.current = null;
        }
        const finalPlayers = pendingPlayersRef.current ?? playersRef.current;
        setPlayers(finalPlayers);
        setResultSnapshot({
          mode: next.mode,
          players: finalPlayers.map((p) => ({ ...p })),
          myScore: scoreRef.current,
          myPairs: pairsRef.current,
          myRemaining: countRemainingTiles(boardRef.current),
          elapsedSec: elapsedSecRef.current,
        });

        const myTeam = myTeamRef.current;
        let title = next.winnerLabel || '경기 종료';
        const isDraw = next.winnerTeam === null;
        const iWon =
          !isDraw && myTeam !== null && next.winnerTeam === myTeam;
        if (!isDraw && !iWon) {
          if (/이탈/.test(title)) title = '이탈로 패배';
          else if (/기권/.test(title)) title = '기권패';
          else title = '패배';
        }
        setResultTitle(title);
        setShowConfetti(iWon);
        setScreen('result');
        playGameComplete();

        if (myUid) {
          const outcome = isDraw
            ? 'draw'
            : myTeam === null
              ? null
              : iWon
                ? 'win'
                : 'loss';
          if (outcome) {
            void applySichuanMatchResult({
              uid: myUid,
              nickname,
              outcome,
              matchKey: `${next.id}_${next.seed}`,
            })
              .then((rec) => setMyRecord(rec))
              .catch((e) => console.warn('사천성 전적 저장 실패:', e));
          }
        }
      }
    });
    const unsubPlayers = subscribeSichuanPlayers(room.id, (list) => {
      // 플레이 중 HUD 갱신은 짧게 모아 보드 입력 렉을 줄임
      if (screenRef.current === 'play') {
        pendingPlayersRef.current = list;
        if (playersThrottleRef.current !== null) return;
        playersThrottleRef.current = window.setTimeout(() => {
          playersThrottleRef.current = null;
          if (pendingPlayersRef.current) setPlayers(pendingPlayersRef.current);
        }, 160);
        return;
      }
      setPlayers(list);
    });
    return () => {
      unsubRoom();
      unsubPlayers();
      if (playersThrottleRef.current !== null) {
        window.clearTimeout(playersThrottleRef.current);
        playersThrottleRef.current = null;
      }
    };
  }, [myUid, room?.id, startCountdown, clearCountdownTimers, nickname]);

  const beginLocalMatch = (nextSeed: number) => {
    finishLockRef.current = false;
    matchingLockRef.current = true;
    setSeed(nextSeed);
    setBoard(createSichuanBoard(nextSeed));
    setSelected(null);
    setPath(null);
    setHintPair(null);
    setScore(0);
    setPairs(0);
    setShuffleLeft(SICHUAN_MAX_SHUFFLES);
    setFinished(false);
    setStuck(false);
    setShowConfetti(false);
    setHintFlash(false);
    setCombo(0);
    comboRef.current = 0;
    comboBonusRef.current = 0;
    lastMatchAtRef.current = 0;
    setFloatScore(null);
    setFirstClearBanner(null);
    setResultMeta(null);
    startCountdown();
  };

  const endSoloOrLocal = useCallback((title: string, cleared: boolean) => {
    if (finishLockRef.current) return;
    finishLockRef.current = true;
    matchingLockRef.current = false;
    setFinished(true);
    setResultTitle(title);
    setShowConfetti(cleared);

    if (mode === 'solo' && cleared) {
      const saved = saveSichuanSoloPbIfBetter({
        timeSec: elapsedSecRef.current,
        score: scoreRef.current,
        cleared: true,
      });
      if (saved) {
        setSoloPb(saved.pb);
        const bits: string[] = [];
        if (saved.isNewTime) bits.push('최고 기록 갱신!');
        if (saved.isNewScore) bits.push('최고 점수 갱신!');
        setResultMeta(
          bits.length
            ? bits.join(' · ')
            : `내 최고 ${formatSichuanTime(saved.pb.bestTimeSec)} · ${saved.pb.bestScore}점`
        );
      }
    }

    setScreen('result');
    playGameComplete();
  }, [mode]);

  useEffect(() => {
    if (!room || !isHost || room.status !== 'playing' || mode === 'solo') return;
    if (players.length === 0) return;
    if (finishLockRef.current) return;
    if (!players.some((p) => p.uid === myUid)) return;

    const need = room.maxPlayers || sichuanMaxPlayers(room.mode);

    // 상대(또는 팀원) 이탈 → 남은 쪽 승리
    if (players.length < need) {
      finishLockRef.current = true;
      const t0count = players.filter((p) => p.team === 0).length;
      const t1count = players.filter((p) => p.team === 1).length;
      let winnerTeam: 0 | 1 =
        (players.find((p) => p.uid === myUid)?.team ?? 0) as 0 | 1;
      if (room.mode === '2v2') {
        if (t0count < t1count) winnerTeam = 1;
        else if (t1count < t0count) winnerTeam = 0;
      }
      void finishSichuanRoom({
        roomId: room.id,
        winnerTeam,
        winnerLabel: '상대 이탈 · 승리!',
      });
      return;
    }

    // 기권(클리어 없이 finished)
    const forfeiter = players.find((p) => p.finished && p.remaining > 0);
    if (forfeiter) {
      finishLockRef.current = true;
      const winnerTeam = (forfeiter.team === 0 ? 1 : 0) as 0 | 1;
      void finishSichuanRoom({
        roomId: room.id,
        winnerTeam,
        winnerLabel: '상대 기권 · 승리!',
      });
    }
  }, [isHost, mode, myUid, players, room]);

  useEffect(() => {
    if (!room || !isHost || room.status !== 'playing' || mode === 'solo') return;
    if (players.length === 0) return;
    if (players.length < (room.maxPlayers || sichuanMaxPlayers(room.mode))) return;

    const anyoneCleared = players.some((p) => p.remaining === 0);
    const allFinished = players.every((p) => p.finished || p.remaining === 0);
    if (!anyoneCleared && !allFinished) return;
    if (players.some((p) => p.finished && p.remaining > 0)) return;
    if (finishLockRef.current) return;

    finishLockRef.current = true;
    const t0 = teamScore(players, 0);
    const t1 = teamScore(players, 1);
    let winnerTeam: 0 | 1 | null = null;
    let label = '무승부';
    if (t0 > t1) {
      winnerTeam = 0;
      label = `${teamLabel(room.mode, 0)} 승리!`;
    } else if (t1 > t0) {
      winnerTeam = 1;
      label = `${teamLabel(room.mode, 1)} 승리!`;
    }

    const firstClearer = players
      .filter((p) => p.remaining === 0)
      .sort((a, b) => (a.updatedAtMs || 0) - (b.updatedAtMs || 0))[0];
    if (firstClearer) {
      label = `${firstClearer.nickname} 선클리어! · ${label}`;
    }

    void finishSichuanRoom({
      roomId: room.id,
      winnerTeam,
      winnerLabel: label,
    }).catch((e) => {
      finishLockRef.current = false;
      console.error('사천성 종료 처리 실패:', e);
    });
  }, [isHost, mode, players, room]);

  // 상대가 먼저 클리어했는지 배너
  useEffect(() => {
    if (mode === 'solo' || !room || room.status !== 'playing') return;
    const clearer = players
      .filter((p) => p.remaining === 0)
      .sort((a, b) => (a.updatedAtMs || 0) - (b.updatedAtMs || 0))[0];
    if (!clearer) return;
    if (clearer.uid === myUid) {
      setFirstClearBanner('선클리어!');
    } else {
      setFirstClearBanner(`${clearer.nickname} 선클리어!`);
    }
  }, [mode, myUid, players, room]);

  const handleMatch = (a: SichuanPos, b: SichuanPos, matchPath: SichuanMatchPath) => {
    matchingLockRef.current = true;
    lockScrollDuringMatch();
    setHintPair(null);
    setPath(matchPath);
    playSichuanMatch();

    const now = Date.now();
    const nextCombo = now - lastMatchAtRef.current < 2800 ? comboRef.current + 1 : 1;
    comboRef.current = nextCombo;
    lastMatchAtRef.current = now;
    setCombo(nextCombo);
    const matchComboBonus = comboBonusForMatch(nextCombo);
    const nextComboBonusTotal = comboBonusRef.current + matchComboBonus;
    comboBonusRef.current = nextComboBonusTotal;

    if (pathTimerRef.current !== null) window.clearTimeout(pathTimerRef.current);
    pathTimerRef.current = window.setTimeout(() => {
      const nextBoard = removeSichuanPair(boardRef.current, a, b);
      const remaining = countRemainingTiles(nextBoard);
      const nextPairs = pairsRef.current + 1;
      const nextScore = sichuanScoreFor(nextPairs, remaining, nextComboBonusTotal);

      const gained =
        SICHUAN_MATCH_POINTS +
        matchComboBonus +
        (remaining === 0 ? SICHUAN_CLEAR_BONUS : 0);
      const floatLabel =
        nextCombo >= 2
          ? `+${gained}  COMBO x${nextCombo}`
          : `+${gained}`;
      setFloatScore(floatLabel);
      if (floatTimerRef.current !== null) window.clearTimeout(floatTimerRef.current);
      floatTimerRef.current = window.setTimeout(() => setFloatScore(null), 650);

      setBoard(nextBoard);
      setSelected(null);
      setPath(null);
      setPairs(nextPairs);
      setScore(nextScore);
      pairsRef.current = nextPairs;
      scoreRef.current = nextScore;
      boardRef.current = nextBoard;
      matchingLockRef.current = false;

      requestAnimationFrame(restoreScrollIfJumped);

      if (remaining === 0) {
        finishedRef.current = true;
        setFinished(true);
        setStuck(false);
        if (mode === 'solo') {
          endSoloOrLocal(
            nextCombo >= 3 ? `보드 클리어! COMBO x${nextCombo}` : '보드 클리어!',
            true
          );
        } else {
          setFirstClearBanner((prev) => prev || '선클리어!');
          void flushProgress({
            finished: true,
            remaining: 0,
            pairs: nextPairs,
            comboBonus: nextComboBonusTotal,
          });
        }
        return;
      }

      if (mode !== 'solo') scheduleProgressSync();
      // 연결 가능한 패가 없으면 자동 셔플
      scheduleAutoShuffleIfNeeded(nextBoard);
    }, MATCH_PATH_MS);
  };

  const onTileClick = (r: number, c: number) => {
    if (finished || screen !== 'play' || matchingLockRef.current || !playArmed) return;
    ensureAudio();
    const cell = boardRef.current[r]?.[c];
    if (!cell) return;

    const pos = { r, c };
    if (!selected) {
      setSelected(pos);
      setHintPair(null);
      playSichuanSelect();
      return;
    }

    if (selected.r === r && selected.c === c) {
      setSelected(null);
      return;
    }

    const matchPath = canConnectSichuan(boardRef.current, selected, pos);
    if (matchPath) {
      handleMatch(selected, pos, matchPath);
      return;
    }

    playSichuanMiss();
    comboRef.current = 0;
    setCombo(0);
    setHintFlash(true);
    window.setTimeout(() => setHintFlash(false), 220);
    if (boardRef.current[selected.r]?.[selected.c] !== cell) {
      setSelected(pos);
    }
  };

  const onShuffle = () => {
    if (finished || shuffleLeftRef.current <= 0 || matchingLockRef.current || !playArmed) return;
    ensureAudio();
    applyShuffleBoard(boardRef.current, 1);
  };

  const onHint = () => {
    if (finished || matchingLockRef.current || !playArmed) return;
    ensureAudio();
    const hint = findSichuanHint(boardRef.current);
    if (!hint) {
      scheduleAutoShuffleIfNeeded(boardRef.current);
      if (shuffleLeftRef.current <= 0) {
        setError('연결 가능한 패가 없고 셔플도 남아 있지 않습니다.');
      }
      return;
    }
    setError(null);
    setHintPair({ a: hint.a, b: hint.b });
    setSelected(hint.a);
    playSichuanSelect();
  };

  const startSolo = () => {
    unlockGameAudio();
    setMode('solo');
    setRoom(null);
    setPlayers([]);
    setError(null);
    beginLocalMatch((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    setScreen('play');
  };

  const createRoom = async (nextMode: SichuanMode) => {
    if (!myUid) {
      const msg = '로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.';
      setError(msg);
      window.alert(msg);
      return;
    }
    setBusy(true);
    setBusyMode(nextMode);
    setError(null);
    try {
      unlockGameAudio();
      const created = await createSichuanRoom({
        mode: nextMode,
        hostUid: myUid,
        hostNickname: nickname,
      });
      setMode(nextMode);
      setRoom(created);
      setScreen('lobby');
    } catch (e) {
      console.error('사천성 방 생성 실패:', e);
      const raw = e instanceof Error ? e.message : String(e);
      const msg = /permission|insufficient|Missing or insufficient/i.test(raw)
        ? '방 생성 권한이 없습니다. Firestore 규칙을 배포했는지 확인해 주세요.'
        : raw || '방 생성에 실패했습니다.';
      setError(msg);
      window.alert(msg);
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  };

  const joinRoom = async (roomId: string) => {
    if (!myUid) {
      const msg = '로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.';
      setError(msg);
      window.alert(msg);
      return;
    }
    setBusy(true);
    setJoiningRoomId(roomId);
    setError(null);
    try {
      unlockGameAudio();
      const joined = await joinSichuanRoom({
        roomId,
        uid: myUid,
        nickname,
      });
      setMode(joined.mode);
      setRoom(joined);
      setScreen('lobby');
    } catch (e) {
      console.error('사천성 방 입장 실패:', e);
      const raw = e instanceof Error ? e.message : String(e);
      const msg = /permission|insufficient|Missing or insufficient/i.test(raw)
        ? '방 입장 권한이 없습니다. Firestore 규칙 배포 여부를 확인해 주세요.'
        : raw || '입장에 실패했습니다.';
      setError(msg);
      window.alert(msg);
    } finally {
      setBusy(false);
      setJoiningRoomId(null);
    }
  };

  const toggleReady = async () => {
    if (!room || !myUid || !myPlayer) return;
    setBusy(true);
    try {
      await setSichuanPlayerReady(room.id, myUid, !myPlayer.ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : '준비 상태 변경 실패');
    } finally {
      setBusy(false);
    }
  };

  const startMatch = async () => {
    if (!room || !myUid) return;
    const need = sichuanMaxPlayers(room.mode);
    if (players.length < need) {
      setError(`${need}명이 모여야 시작할 수 있습니다.`);
      return;
    }
    const othersReady = players.filter((p) => p.uid !== room.hostUid).every((p) => p.ready);
    if (!othersReady) {
      setError('다른 참가자가 모두 준비되어야 합니다.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (myPlayer && !myPlayer.ready) {
        await setSichuanPlayerReady(room.id, myUid, true);
      }
      await startSichuanGame(room.id, myUid);
    } catch (e) {
      setError(e instanceof Error ? e.message : '시작에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const leaveAndMenu = async () => {
    const current = room;
    const uid = myUid;
    if (current && uid) {
      // 게임 중 이탈이면 패배 전적 먼저 기록 (결과 스냅샷을 못 받는 경우 대비)
      if (
        mode !== 'solo' &&
        current.status === 'playing' &&
        !finishedRef.current
      ) {
        finishedRef.current = true;
        try {
          const rec = await applySichuanMatchResult({
            uid,
            nickname,
            outcome: 'loss',
            matchKey: `${current.id}_${current.seed || seed}`,
          });
          setMyRecord(rec);
        } catch (e) {
          console.warn('사천성 이탈 패배 기록 실패:', e);
        }
      }
      try {
        const isHost = current.hostUid === uid;
        if (screen === 'result' || current.status === 'finished') {
          // 경기 종료 후: 방 무조건 제거
          await dissolveSichuanRoom(current.id);
        } else if (
          (screen === 'lobby' || current.status === 'lobby') &&
          isHost
        ) {
          // 방장이 로비에서 나가면 방 해산
          await dissolveSichuanRoom(current.id);
        } else {
          await leaveSichuanRoom(current.id, uid);
        }
      } catch {
        try {
          await dissolveSichuanRoom(current.id);
        } catch {
          /* ignore */
        }
      }
    }
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    matchingLockRef.current = false;
    setRoom(null);
    setPlayers([]);
    setResultSnapshot(null);
    setScreen('menu');
    setError(null);
  };

  const requestLeave = () => {
    if (screen === 'menu') {
      navigate('/games');
      return;
    }
    if (screen === 'play' && !finished) {
      const ok = window.confirm(
        mode === 'solo'
          ? '연습을 종료하고 나갈까요?'
          : '나가면 상대가 승리합니다. 나갈까요?'
      );
      if (!ok) return;
    }
    void leaveAndMenu();
  };

  const requestForfeit = () => {
    if (mode === 'solo') {
      endSoloOrLocal('연습 종료', false);
      return;
    }
    if (!room || !myUid || !myPlayer) return;
    if (!window.confirm('기권하면 상대가 승리합니다. 기권할까요?')) return;

    finishedRef.current = true;
    setFinished(true);
    clearCountdownTimers();
    setCountdownLabel(null);

    const winnerTeam = (myPlayer.team === 0 ? 1 : 0) as 0 | 1;
    const matchKey = `${room.id}_${room.seed || seed}`;

    void applySichuanMatchResult({
      uid: myUid,
      nickname,
      outcome: 'loss',
      matchKey,
    })
      .then((rec) => setMyRecord(rec))
      .catch((e) => console.warn('사천성 기권 패배 기록 실패:', e));

    if (isHost) {
      if (finishLockRef.current) return;
      finishLockRef.current = true;
      void finishSichuanRoom({
        roomId: room.id,
        winnerTeam,
        winnerLabel: '상대 기권 · 승리!',
      }).catch((e) => {
        finishLockRef.current = false;
        setError(e instanceof Error ? e.message : '기권 처리 실패');
      });
    } else {
      void flushProgress({ finished: true });
    }
  };

  const remaining = countRemainingTiles(board);
  const clearedPairs = pairs;
  const totalPairs = SICHUAN_TILE_SLOTS / 2;
  const progressPct = Math.round((clearedPairs / totalPairs) * 100);
  const isClimax = remaining > 0 && remaining <= 8;

  const pathSet = useMemo(() => {
    if (!path) return new Set<string>();
    return new Set(path.points.map(posKey));
  }, [path]);

  const hintSet = useMemo(() => {
    if (!hintPair) return new Set<string>();
    return new Set([posKey(hintPair.a), posKey(hintPair.b)]);
  }, [hintPair]);

  const renderBoard = () => (
    <div
      className={`sichuan-table${hintFlash ? ' sichuan-table--miss' : ''}${
        isClimax ? ' sichuan-table--climax' : ''
      }`}
    >
      <div className="sichuan-table__rail sichuan-table__rail--top" aria-hidden />
      <div className="sichuan-board-wrap">
        <div
          className="sichuan-board"
          style={{ gridTemplateColumns: `repeat(${SICHUAN_COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: SICHUAN_ROWS }).map((_, r) =>
            Array.from({ length: SICHUAN_COLS }).map((__, c) => {
              const id = board[r][c];
              const face = id ? getSichuanFace(id) : null;
              const isSel = selected?.r === r && selected?.c === c;
              const onPath = pathSet.has(`${r},${c}`);
              const onHint = hintSet.has(`${r},${c}`);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  tabIndex={-1}
                  className={`sichuan-tile${id ? '' : ' sichuan-tile--empty'}${
                    isSel ? ' sichuan-tile--selected' : ''
                  }${onPath ? ' sichuan-tile--path' : ''}${onHint ? ' sichuan-tile--hint' : ''}`}
                  style={
                    face
                      ? ({
                          '--tile-hue': String(face.hue),
                        } as React.CSSProperties)
                      : undefined
                  }
                  disabled={!id || finished || !playArmed}
                  aria-hidden={!id}
                  aria-label={face ? `${face.name} ${face.label}` : undefined}
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    e.preventDefault();
                    onTileClick(r, c);
                  }}
                >
                  {face ? (
                    <>
                      <span className="sichuan-tile__edge" aria-hidden />
                      <span className="sichuan-tile__face">
                        <span className="sichuan-tile__emoji" aria-hidden>
                          {face.label}
                        </span>
                      </span>
                    </>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        {path && path.points.length >= 2 && (
          <svg className="sichuan-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline
              points={pathToSvgPoints(path.points)}
              fill="none"
              stroke="rgba(250, 204, 21, 0.95)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        <div className="sichuan-float-slot" aria-live="polite">
          {floatScore && <span className="sichuan-float-score">{floatScore}</span>}
        </div>
      </div>
      <div className="sichuan-table__rail sichuan-table__rail--bottom" aria-hidden />
    </div>
  );

  const renderRivalPanel = (
    compact = false,
    opts?: { mode: SichuanMode; players: SichuanPlayer[] }
  ) => {
    const panelMode = opts?.mode ?? (mode === 'solo' ? null : room?.mode ?? null);
    const panelPlayers = opts?.players ?? players;
    if (!panelMode) return null;
    if (!opts && (mode === 'solo' || !room)) return null;

    const t0 = teamScore(panelPlayers, 0);
    const t1 = teamScore(panelPlayers, 1);
    const myTeam = opts
      ? panelPlayers.find((p) => p.uid === myUid)?.team ?? myTeamRef.current
      : myPlayer?.team ?? myTeamRef.current;

    if (compact) {
      return (
        <div className="sichuan-rivals sichuan-rivals--strip" aria-label="상대 점수">
          <div className={myTeam === 0 ? 'is-mine' : undefined}>
            <span>{teamLabel(panelMode, 0)}</span>
            <strong>{t0}</strong>
          </div>
          <div className={myTeam === 1 ? 'is-mine' : undefined}>
            <span>{teamLabel(panelMode, 1)}</span>
            <strong>{t1}</strong>
          </div>
        </div>
      );
    }
    return (
      <div className="sichuan-rivals sichuan-rivals--result" aria-label="경기 결과 상세">
        <div className={`sichuan-team-card${myTeam === 0 ? ' is-mine' : ''}`}>
          <strong>{teamLabel(panelMode, 0)}</strong>
          <span>{t0}점</span>
          <ul>
            {panelPlayers
              .filter((p) => p.team === 0)
              .map((p) => (
                <li key={p.uid}>
                  {p.nickname}
                  {p.uid === myUid ? ' (나)' : ''} · {p.pairs}쌍 · 남음 {p.remaining}
                  {p.finished || p.remaining === 0 ? ' ✓' : ''}
                </li>
              ))}
          </ul>
        </div>
        <div className={`sichuan-team-card sichuan-team-card--b${myTeam === 1 ? ' is-mine' : ''}`}>
          <strong>{teamLabel(panelMode, 1)}</strong>
          <span>{t1}점</span>
          <ul>
            {panelPlayers
              .filter((p) => p.team === 1)
              .map((p) => (
                <li key={p.uid}>
                  {p.nickname}
                  {p.uid === myUid ? ' (나)' : ''} · {p.pairs}쌍 · 남음 {p.remaining}
                  {p.finished || p.remaining === 0 ? ' ✓' : ''}
                </li>
              ))}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className={`games-page sichuan-page sichuan-page--${screen}`}>
      <div className="sichuan-ambient" aria-hidden>
        <div className="sichuan-ambient__wash" />
        <div className="sichuan-ambient__lattice" />
        <div className="sichuan-ambient__glow" />
      </div>
      <GameConfetti show={showConfetti} />
      <div className="games-content sichuan-content">
        <header className="games-header sichuan-header">
          <button type="button" className="games-back-btn sichuan-pressable" onClick={requestLeave}>
            ←
          </button>
          <div className="sichuan-header-text">
            <p className="sichuan-kicker">VERYUS MATCH</p>
            <h1 className="games-title sichuan-title">사천성</h1>
            <p className="games-subtitle sichuan-subtitle">
              {screen === 'menu' && '같은 등급 패를 연결하세요'}
              {screen === 'lobby' && '대기실'}
              {screen === 'play' &&
                (mode === 'solo' ? '솔로' : room?.mode === '2v2' ? '2대2' : '1대1')}
              {screen === 'result' && resultTitle}
            </p>
          </div>
          <div className="sichuan-header-tools">
            <GameSoundToggle />
          </div>
        </header>

        {error && (
          <p className="sichuan-error" role="alert">
            {error}
          </p>
        )}

        {screen === 'menu' && (
          <div className="sichuan-menu">
            <div className="sichuan-hero-panel">
              <div className="sichuan-hero-panel__marks" aria-hidden>
                {SICHUAN_FACES.slice(0, 5).map((f) => (
                  <span key={f.id}>{f.label}</span>
                ))}
              </div>
              <h2>사천성</h2>
              {soloPb && (
                <p className="sichuan-hero-pb">
                  솔로 최고 {formatSichuanTime(soloPb.bestTimeSec)} · {soloPb.bestScore}점
                </p>
              )}
              {myRecord && myRecord.gamesPlayed > 0 && (
                <p className="sichuan-hero-pb">
                  대전 {formatSichuanRecord(myRecord)} · 승률 {sichuanWinRate(myRecord)}%
                </p>
              )}
            </div>

            <button
              type="button"
              className="sichuan-menu-btn sichuan-pressable sichuan-menu-btn--solo"
              onClick={startSolo}
            >
              <span className="sichuan-menu-icon" aria-hidden>
                <span className="sichuan-menu-icon__glyph">獨</span>
              </span>
              <span className="sichuan-menu-copy">
                <strong>솔로 연습</strong>
                <small>혼자 익히기</small>
              </span>
              <span className="sichuan-menu-chevron" aria-hidden>
                →
              </span>
            </button>
            <button
              type="button"
              className="sichuan-menu-btn sichuan-pressable sichuan-menu-btn--duel"
              disabled={busy}
              onClick={() => void createRoom('1v1')}
            >
              <span className="sichuan-menu-icon" aria-hidden>
                <span className="sichuan-menu-icon__glyph">對</span>
              </span>
              <span className="sichuan-menu-copy">
                <strong>{busyMode === '1v1' ? '만드는 중…' : '1대1 대전'}</strong>
                <small>{!myUid ? '로그인 필요' : '방 만들기'}</small>
              </span>
              <span className="sichuan-menu-chevron" aria-hidden>
                →
              </span>
            </button>
            <button
              type="button"
              className="sichuan-menu-btn sichuan-pressable sichuan-menu-btn--team"
              disabled={busy}
              onClick={() => void createRoom('2v2')}
            >
              <span className="sichuan-menu-icon" aria-hidden>
                <span className="sichuan-menu-icon__glyph">協</span>
              </span>
              <span className="sichuan-menu-copy">
                <strong>{busyMode === '2v2' ? '만드는 중…' : '2대2 팀전'}</strong>
                <small>{!myUid ? '로그인 필요' : '방 만들기'}</small>
              </span>
              <span className="sichuan-menu-chevron" aria-hidden>
                →
              </span>
            </button>

            <div className="sichuan-lobby-board">
              <div className="sichuan-lobby-board__head">
                <h3>열린 방</h3>
                <div className="sichuan-lobby-filters" role="tablist" aria-label="방 필터">
                  {(
                    [
                      ['all', '전체'],
                      ['1v1', '1대1'],
                      ['2v2', '2대2'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={lobbyFilter === key}
                      className={`sichuan-pressable${lobbyFilter === key ? ' is-active' : ''}`}
                      onClick={() => setLobbyFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {!myUid ? (
                <p className="sichuan-lobby-empty">로그인 후 참가할 수 있습니다</p>
              ) : visibleOpenRooms.length === 0 ? (
                <p className="sichuan-lobby-empty">대기 중인 방이 없습니다</p>
              ) : (
                <ul className="sichuan-open-rooms">
                  {visibleOpenRooms.map((r) => {
                    const full = r.playerCount >= r.maxPlayers;
                    const joining = joiningRoomId === r.id;
                    const hostRec = rankings.find((x) => x.uid === r.hostUid);
                    return (
                      <li key={r.id}>
                        <div className="sichuan-open-room__info">
                          <strong>{roomTitle(r)}</strong>
                          <span className="sichuan-open-room__meta">
                            <span className="sichuan-mode-chip sichuan-mode-chip--sm">
                              {r.mode === '1v1' ? '1대1' : '2대2'}
                            </span>
                            <span className="sichuan-seat-dots" aria-hidden>
                              {Array.from({ length: r.maxPlayers }, (_, i) => (
                                <i
                                  key={i}
                                  className={i < r.playerCount ? 'is-filled' : undefined}
                                />
                              ))}
                            </span>
                            {hostRec && hostRec.gamesPlayed > 0 && (
                              <span className="sichuan-record-chip">
                                {formatSichuanRecord(hostRec)}
                              </span>
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="sichuan-pressable sichuan-primary"
                          disabled={busy || full || !myUid}
                          onClick={() => void joinRoom(r.id)}
                        >
                          {joining ? '…' : full ? '만원' : '입장'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="sichuan-rank-board">
              <div className="sichuan-lobby-board__head">
                <h3>승패 순위</h3>
                {myRecord && myRecord.gamesPlayed > 0 && (
                  <span className="sichuan-my-record">
                    나 {formatSichuanRecord(myRecord)} · {sichuanWinRate(myRecord)}%
                  </span>
                )}
              </div>
              {rankings.filter((r) => r.gamesPlayed > 0).length === 0 ? (
                <p className="sichuan-lobby-empty">아직 전적이 없습니다</p>
              ) : (
                <ol className="sichuan-rank-list">
                  {rankings
                    .filter((r) => r.gamesPlayed > 0)
                    .slice(0, 10)
                    .map((r, idx) => (
                      <li key={r.uid} className={r.uid === myUid ? 'is-me' : undefined}>
                        <span className="sichuan-rank-list__pos">{idx + 1}</span>
                        <span className="sichuan-rank-list__name">
                          {r.nickname || '익명'}
                          {r.uid === myUid ? ' · 나' : ''}
                        </span>
                        <span className="sichuan-rank-list__record">
                          {formatSichuanRecord(r)}
                        </span>
                        <span className="sichuan-rank-list__rate">{sichuanWinRate(r)}%</span>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          </div>
        )}

        {screen === 'lobby' && room && (
          <div className="sichuan-lobby">
            <div className="sichuan-lobby-top">
              <span className="sichuan-mode-chip">
                {room.mode === '1v1' ? '1대1' : '2대2'}
              </span>
              <strong className="sichuan-lobby-host">{room.hostNickname || '방장'}</strong>
              <span
                className="sichuan-seat-dots"
                aria-label={`${players.length} / ${lobbyNeed}`}
              >
                {Array.from({ length: lobbyNeed }, (_, i) => (
                  <i key={i} className={i < players.length ? 'is-filled' : undefined} />
                ))}
              </span>
            </div>

            {(myRecord || players.length > 0) && (
              <div className="sichuan-lobby-records">
                {players.map((p) => {
                  const rec = lobbyRecords[p.uid] ?? (p.uid === myUid ? myRecord : null);
                  const text =
                    rec && rec.gamesPlayed > 0
                      ? formatSichuanRecord(rec)
                      : '전적 없음';
                  return (
                    <div
                      key={p.uid}
                      className={`sichuan-lobby-records__item${
                        p.uid === myUid ? ' is-me' : ''
                      }`}
                    >
                      <span>
                        {p.nickname}
                        {p.uid === myUid ? ' · 나' : ''}
                        {p.uid === room.hostUid ? ' · 방장' : ''}
                      </span>
                      <strong>{text}</strong>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className={`sichuan-seats ${
                room.mode === '1v1' ? 'sichuan-seats--duel' : 'sichuan-seats--team'
              }`}
            >
              {room.mode === '1v1' ? (
                <>
                  {[0, 1].map((team) => {
                    const p = players.find((x) => x.team === team) ?? null;
                    return (
                      <div
                        key={team}
                        className={`sichuan-seat${p ? '' : ' is-empty'}${
                          p?.ready ? ' is-ready' : ''
                        }${p?.uid === myUid ? ' is-me' : ''}`}
                      >
                        <div className="sichuan-seat__avatar" aria-hidden>
                          {p ? p.nickname.slice(0, 1) : '?'}
                        </div>
                        <strong>{p ? p.nickname : '빈 자리'}</strong>
                        <div className="sichuan-seat__tags">
                          {p?.uid === room.hostUid && <span>방장</span>}
                          {p?.uid === myUid && <span>나</span>}
                        </div>
                        <em className={`sichuan-seat__ready${p?.ready ? ' on' : ''}`}>
                          {p ? (p.ready ? '준비' : '대기') : '…'}
                        </em>
                        {p && (
                          <span className="sichuan-seat__record">
                            {(() => {
                              const rec =
                                lobbyRecords[p.uid] ??
                                (p.uid === myUid ? myRecord : null);
                              return rec && rec.gamesPlayed > 0
                                ? formatSichuanRecord(rec)
                                : '신입';
                            })()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <span className="sichuan-vs" aria-hidden>
                    VS
                  </span>
                </>
              ) : (
                ([0, 1] as const).map((team) => {
                  const teamPlayers = players.filter((p) => p.team === team);
                  const slots: (SichuanPlayer | null)[] = [
                    teamPlayers[0] ?? null,
                    teamPlayers[1] ?? null,
                  ];
                  return (
                    <div key={team} className={`sichuan-team-col sichuan-team-col--${team}`}>
                      <span className="sichuan-team-col__label">
                        {teamLabel(room.mode, team)}
                      </span>
                      {slots.map((p, idx) => (
                        <div
                          key={`${team}-${idx}`}
                          className={`sichuan-seat${p ? '' : ' is-empty'}${
                            p?.ready ? ' is-ready' : ''
                          }${p?.uid === myUid ? ' is-me' : ''}`}
                        >
                          <div className="sichuan-seat__avatar" aria-hidden>
                            {p ? p.nickname.slice(0, 1) : '?'}
                          </div>
                          <strong>{p ? p.nickname : '빈 자리'}</strong>
                          <div className="sichuan-seat__tags">
                            {p?.uid === room.hostUid && <span>방장</span>}
                            {p?.uid === myUid && <span>나</span>}
                          </div>
                          <em className={`sichuan-seat__ready${p?.ready ? ' on' : ''}`}>
                            {p ? (p.ready ? '준비' : '대기') : '…'}
                          </em>
                          {p && (
                            <span className="sichuan-seat__record">
                              {(() => {
                                const rec =
                                  lobbyRecords[p.uid] ??
                                  (p.uid === myUid ? myRecord : null);
                                return rec && rec.gamesPlayed > 0
                                  ? formatSichuanRecord(rec)
                                  : '신입';
                              })()}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>

            <div className="sichuan-lobby-actions">
              {isHost ? (
                <>
                  <button
                    type="button"
                    className="sichuan-primary sichuan-pressable sichuan-lobby-start"
                    disabled={busy || !lobbyCanStart}
                    onClick={() => void startMatch()}
                  >
                    {lobbyCanStart ? '시작' : `${players.length}/${lobbyNeed}`}
                  </button>
                  <div className="sichuan-lobby-actions__row">
                    {myPlayer && (
                      <button
                        type="button"
                        className={`sichuan-pressable${myPlayer.ready ? ' is-ready-btn' : ''}`}
                        disabled={busy}
                        onClick={() => void toggleReady()}
                      >
                        {myPlayer.ready ? '준비됨' : '준비'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="sichuan-ghost sichuan-pressable"
                      onClick={() => void leaveAndMenu()}
                    >
                      나가기
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {myPlayer && (
                    <button
                      type="button"
                      className={`sichuan-pressable sichuan-lobby-start${
                        myPlayer.ready ? ' is-ready-btn sichuan-lobby-start--ready' : ' sichuan-primary'
                      }`}
                      disabled={busy}
                      onClick={() => void toggleReady()}
                    >
                      {myPlayer.ready ? '준비 취소' : '준비'}
                    </button>
                  )}
                  {myPlayer?.ready && (
                    <p className="sichuan-lobby-wait" role="status">
                      {lobbyCanStart ? '방장이 시작하면 시작됩니다' : '인원 모으는 중'}
                    </p>
                  )}
                  <button
                    type="button"
                    className="sichuan-ghost sichuan-pressable"
                    onClick={() => void leaveAndMenu()}
                  >
                    나가기
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {screen === 'play' && (
          <div className={`sichuan-play${!playArmed ? ' is-countdown' : ''}`}>
            {countdownLabel && (
              <div className="sichuan-countdown" role="status" aria-live="assertive">
                <span key={countdownLabel}>{countdownLabel}</span>
              </div>
            )}
            {showTip && mode === 'solo' && playArmed && (
              <div className="sichuan-tip sichuan-tip--overlay">
                <p>같은 패를 고르세요. 최대 두 번까지 꺾여 연결됩니다.</p>
                <button
                  type="button"
                  className="sichuan-pressable"
                  onClick={() => {
                    setShowTip(false);
                    try {
                      localStorage.setItem('veryus_sichuan_tip', '1');
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  확인
                </button>
              </div>
            )}
            {firstClearBanner && (
              <div className="sichuan-finish-banner" role="status">
                {firstClearBanner}
              </div>
            )}
            {isClimax && !finished && (
              <p className="sichuan-climax-note" role="status">
                막판 · 남은 {remaining}
              </p>
            )}

            <div className="sichuan-hud" aria-label="게임 상태">
              <span>
                <em>점수</em>
                <strong>{score}</strong>
              </span>
              <span>
                <em>진행</em>
                <strong>
                  {clearedPairs}/{totalPairs}
                </strong>
              </span>
              <span>
                <em>시간</em>
                <strong>{formatSichuanTime(elapsedSec)}</strong>
              </span>
              <span>
                <em>{combo >= 2 ? '콤보' : '셔플'}</em>
                <strong className={combo >= 2 ? 'sichuan-combo-stat' : undefined}>
                  {combo >= 2 ? `x${combo}` : shuffleLeft}
                </strong>
              </span>
            </div>
            <div className="sichuan-progress" aria-hidden>
              <div className="sichuan-progress-bar" style={{ width: `${progressPct}%` }} />
            </div>

            {renderBoard()}

            {renderRivalPanel(true)}

            {stuck && (
              <div className="sichuan-stuck-slot is-on" role="status">
                {shuffleLeft > 0
                  ? '연결 불가 · 자동 셔플 중…'
                  : mode === 'solo'
                    ? '셔플 없음 · 다시 시작하세요'
                    : '셔플 없음 · 기권 또는 대기'}
              </div>
            )}

            <div className="sichuan-play-actions sichuan-play-actions--sticky">
              <button
                type="button"
                className="sichuan-pressable"
                disabled={finished || !playArmed}
                onClick={onHint}
              >
                힌트
              </button>
              <button
                type="button"
                className={`sichuan-pressable${stuck && shuffleLeft > 0 ? ' sichuan-primary' : ''}`}
                disabled={shuffleLeft <= 0 || finished || !playArmed}
                onClick={onShuffle}
              >
                셔플 ({shuffleLeft})
              </button>
              {mode === 'solo' && stuck && shuffleLeft <= 0 && (
                <button type="button" className="sichuan-primary sichuan-pressable" onClick={startSolo}>
                  새 보드
                </button>
              )}
              <button type="button" className="sichuan-ghost sichuan-pressable" onClick={requestForfeit}>
                {mode === 'solo' ? '그만하기' : '기권'}
              </button>
            </div>
          </div>
        )}

        {screen === 'result' && (
          <div className="sichuan-result">
            <h2>{resultTitle}</h2>
            <p>
              {resultSnapshot
                ? `내 점수 ${resultSnapshot.myScore} · ${resultSnapshot.myPairs}쌍 · ${formatSichuanTime(resultSnapshot.elapsedSec)} · 남은 타일 ${resultSnapshot.myRemaining}`
                : `점수 ${score} · ${pairs}쌍 · ${formatSichuanTime(elapsedSec)} · 남은 타일 ${remaining}`}
            </p>
            {resultMeta && <p className="sichuan-result-meta">{resultMeta}</p>}
            {soloPb && mode === 'solo' && (
              <p className="sichuan-result-pb">
                최고 기록 {formatSichuanTime(soloPb.bestTimeSec)} · {soloPb.bestScore}점
              </p>
            )}
            {mode !== 'solo' &&
              resultSnapshot &&
              renderRivalPanel(false, {
                mode: resultSnapshot.mode,
                players: resultSnapshot.players,
              })}
            {mode !== 'solo' && !resultSnapshot && room && renderRivalPanel()}
            {mode !== 'solo' && myRecord && myRecord.gamesPlayed > 0 && (
              <p className="sichuan-result-pb">
                내 전적 {formatSichuanRecord(myRecord)} · 승률 {sichuanWinRate(myRecord)}%
              </p>
            )}
            <div className="sichuan-lobby-actions">
              {mode === 'solo' ? (
                <button type="button" className="sichuan-primary sichuan-pressable" onClick={startSolo}>
                  다시 하기
                </button>
              ) : null}
              <button type="button" className="sichuan-primary sichuan-pressable" onClick={() => void leaveAndMenu()}>
                메뉴로
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SichuanGame;
