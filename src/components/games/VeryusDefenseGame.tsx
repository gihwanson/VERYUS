import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import {
  GAME_ID,
  UPGRADE_KEYS,
  UPGRADE_DEFINITIONS,
  PREVIEW_ROUND,
  DAILY_ATTENDANCE_REWARD,
  CLIENT_BOOST_INTERVAL_MS,
  DEFENSE_DIFFICULTY_PRESETS,
  FEED_TYPE_LABELS,
  PRESENCE_TTL_MS,
  type DefenseFeedEvent,
  type DefensePlayer,
  type DefenseRound,
  type DefenseUnit,
  type MemberPower,
  type PlayerUpgrades,
  type UpgradeKey,
  applyUpgradesToStats,
  calcManualSpawnCooldownMs,
  createDefaultUpgrades,
  getUpgradeCost,
  getUpgradeNextHint,
  VICTORY_BONUS_HINT,
} from '../../utils/veryusDefense/constants';
import {
  claimDailyAttendance,
  clearPresence,
  connectBattlefield,
  manualSpawnUnit,
  purchaseUpgrade,
  requestBattleBoost,
  setDefenseDifficulty,
  subscribeRound,
  subscribeUnits,
  updatePresence,
} from '../../utils/veryusDefense/clientApi';
import { checkAdminAccess } from '../AdminTypes';
import {
  countNearCompleteAchievements,
  recommendUpgrade,
} from '../../utils/veryusDefense/achievements';
import { setLastPlayedGame } from '../../utils/lastPlayedGame';
import {
  isDefenseSoundEnabled,
  setDefenseSoundEnabled,
  unlockDefenseAudio,
} from '../../utils/veryusDefense/sounds';
import { useDefenseJuice } from '../../hooks/useDefenseJuice';
import VeryusDefenseAchievements from './VeryusDefenseAchievements';
import VeryusDefenseBaseHpStrip from './VeryusDefenseBaseHpStrip';
import VeryusDefenseBattlefield from './VeryusDefenseBattlefield';
import VeryusDefenseJuiceOverlay from './VeryusDefenseJuiceOverlay';
import VeryusDefenseLeaderboard from './VeryusDefenseLeaderboard';
import VeryusDefenseRoundFlash from './VeryusDefenseRoundFlash';
import '../../styles/variables.css';
import '../../styles/games.css';

const parseRound = (data: Record<string, unknown> | null): DefenseRound | null => {
  if (!data) return null;
  return {
    roundNumber: Number(data.roundNumber) || 1,
    status: (data.status as DefenseRound['status']) || 'active',
    allyBaseHp: Number(data.allyBaseHp) || 0,
    allyBaseMaxHp: Number(data.allyBaseMaxHp) || 10000,
    enemyBaseHp: Number(data.enemyBaseHp) || 0,
    enemyBaseMaxHp: Number(data.enemyBaseMaxHp) || 10000,
    enemyPowerScale: Number(data.enemyPowerScale) || 1,
    tickCount: Number(data.tickCount) || 0,
    totalKills: Number(data.totalKills) || 0,
  };
};

const parseUnit = (id: string, data: Record<string, unknown>): DefenseUnit => ({
  id,
  side: data.side as DefenseUnit['side'],
  uid: data.uid as string | undefined,
  nickname: String(data.nickname || '유닛'),
  grade: data.grade as string | undefined,
  hp: Number(data.hp) || 0,
  maxHp: Number(data.maxHp) || 1,
  attack: Number(data.attack) || 0,
  speed: Number(data.speed) || 1,
  position: Number(data.position) || 0,
  armor: Number(data.armor) || 0,
  critChance: Number(data.critChance) || 0,
  critDamage: Number(data.critDamage) || 1.5,
  lifesteal: Number(data.lifesteal) || 0,
  capitalBonus: Number(data.capitalBonus) || 0,
  isBoss: data.isBoss === true,
  siegeTicks:
    data.siegeTicks != null && Number(data.siegeTicks) > 0
      ? Number(data.siegeTicks)
      : undefined,
});

const extractCallableMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: string }).message);
    if (msg && !msg.includes('internal')) return msg;
  }
  return fallback;
};

type GameTab = 'battle' | 'upgrade' | 'feed' | 'ranking' | 'achievements';

const TUTORIAL_KEY = 'veryus_defense_tutorial_seen';
const TAB_STORAGE_KEY = 'veryus_defense_tab';

const formatFeedAge = (createdAt: unknown): string => {
  if (!createdAt) return '';
  const ms =
    typeof createdAt === 'object' &&
    createdAt !== null &&
    'toMillis' in createdAt &&
    typeof (createdAt as { toMillis: () => number }).toMillis === 'function'
      ? (createdAt as { toMillis: () => number }).toMillis()
      : Number(createdAt);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diff = Date.now() - ms;
  if (diff < 45_000) return '방금';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
};

const VeryusDefenseGame: React.FC = () => {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid || '';
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [subscribedRoundId, setSubscribedRoundId] = useState<string | null>(null);
  const [communityWinStreak, setCommunityWinStreak] = useState(0);
  const [round, setRound] = useState<DefenseRound | null>(null);
  const [units, setUnits] = useState<DefenseUnit[]>([]);
  const [feed, setFeed] = useState<DefenseFeedEvent[]>([]);
  const [player, setPlayer] = useState<DefensePlayer | null>(null);
  const [memberPower, setMemberPower] = useState<MemberPower | null>(null);
  const [spawnLoading, setSpawnLoading] = useState(false);
  const [upgradingKeys, setUpgradingKeys] = useState<UpgradeKey[]>([]);
  const upgradingRef = useRef(new Set<UpgradeKey>());
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<GameTab>(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      const allowed: GameTab[] = ['battle', 'upgrade', 'feed', 'ranking', 'achievements'];
      if (saved && allowed.includes(saved as GameTab)) return saved as GameTab;
    } catch {
      /* ignore */
    }
    return 'battle';
  });
  const [battlefieldCompact, setBattlefieldCompact] = useState(false);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const [cooldownRemain, setCooldownRemain] = useState(0);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [connectState, setConnectState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [difficultyMultiplier, setDifficultyMultiplier] = useState(1);
  const [difficultyLoading, setDifficultyLoading] = useState(false);
  const [roundBanner, setRoundBanner] = useState<string | null>(null);
  const [showConnectOk, setShowConnectOk] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [soundOn, setSoundOn] = useState(isDefenseSoundEnabled);
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [feedSeenIds, setFeedSeenIds] = useState<Set<string>>(new Set());
  const [feedFilter, setFeedFilter] = useState<DefenseFeedEvent['type'] | 'all'>('all');
  const [focusMyUnit, setFocusMyUnit] = useState(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capitalPulse, setCapitalPulse] = useState(false);
  const prevCapitalPulseRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boostRef = useRef(false);
  const connectAttemptedRef = useRef(false);
  const prevRoundStatusRef = useRef<DefenseRound['status'] | null>(null);
  const actionMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem('veryus_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const nickname = user?.nickname || '플레이어';
  const isAdmin = checkAdminAccess(user);

  useEffect(() => {
    if (!uid) return;
    void updatePresence(uid, nickname);
    const interval = setInterval(() => {
      void updatePresence(uid, nickname);
    }, 20_000);
    return () => {
      clearInterval(interval);
      void clearPresence(uid);
    };
  }, [uid, nickname]);

  const runConnect = useCallback(async () => {
    if (!uid) return;
    setConnectState('connecting');
    setConnectError(null);
    try {
      const result = await connectBattlefield();
      if (result.ok) {
        setConnectState('connected');
        setShowConnectOk(true);
      } else {
        setConnectState('error');
        setConnectError(result.message || '전장 연결에 실패했습니다.');
      }
    } catch (error) {
      setConnectState('error');
      setConnectError(extractCallableMessage(error, '전장 연결에 실패했습니다. Functions 배포를 확인해주세요.'));
    }
  }, [uid]);

  useEffect(() => {
    if (!uid || connectAttemptedRef.current) return;
    connectAttemptedRef.current = true;
    void runConnect();
  }, [uid, runConnect]);

  useEffect(() => {
    setLastPlayedGame('veryus-defense');
    setBattlefieldCompact(tab !== 'battle');
  }, []);

  const handleTabChange = useCallback((next: GameTab) => {
    setTab(next);
    setBattlefieldCompact(next !== 'battle');
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    window.requestAnimationFrame(() => {
      tabPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  useEffect(() => {
    if (!uid || connectState !== 'connected') return;
    void claimDailyAttendance()
      .then((result) => {
        if (result.ok) {
          setDailyClaimed(true);
          setActionMessage(result.message);
          if (result.capital !== undefined) {
            setPlayer((prev) => (prev ? { ...prev, capital: result.capital! } : prev));
          }
        } else if (result.message?.includes('이미')) {
          setDailyClaimed(true);
        }
      })
      .catch(() => undefined);
  }, [uid, connectState]);

  useEffect(() => {
    if (!uid || connectState !== 'connected') return;
    const interval = setInterval(() => {
      if (boostRef.current || document.visibilityState === 'hidden') return;
      boostRef.current = true;
      void requestBattleBoost()
        .then((result) => {
          if (!result.ok && result.message && !result.message.includes('초 후')) {
            setActionMessage(result.message);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          boostRef.current = false;
        });
    }, CLIENT_BOOST_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [uid, connectState]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'games', GAME_ID, 'presence'), (snap) => {
      const now = Date.now();
      let count = 0;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.inGame !== true) return;
        const lastSeen = data.lastSeenAt?.toMillis?.() ?? 0;
        if (now - lastSeen <= PRESENCE_TTL_MS) count += 1;
      });
      setOnlineCount(count);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'games', GAME_ID), (snap) => {
      const data = snap.data() as Record<string, unknown> | undefined;
      const nextRoundId = data?.activeRoundId ? String(data.activeRoundId) : null;
      setActiveRoundId(nextRoundId);
      if (nextRoundId) setSubscribedRoundId(nextRoundId);
      setCommunityWinStreak(Number(data?.communityWinStreak) || 0);
      const diff = Number(data?.difficultyMultiplier);
      if (Number.isFinite(diff) && diff > 0) setDifficultyMultiplier(diff);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!subscribedRoundId) {
      if (!activeRoundId) {
        setRound(null);
        setUnits([]);
      }
      return;
    }
    const unsubRound = subscribeRound(subscribedRoundId, (data) => {
      setRound(parseRound(data));
    });
    const unsubUnits = subscribeUnits(subscribedRoundId, (docs) => {
      setUnits(docs.map((d) => parseUnit(d.id, d.data)));
    });
    return () => {
      unsubRound();
      unsubUnits();
    };
  }, [subscribedRoundId, activeRoundId]);

  useEffect(() => {
    if (!subscribedRoundId) return;
    const q = query(
      collection(db, 'games', GAME_ID, 'rounds', subscribedRoundId, 'feed'),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const unsub = onSnapshot(q, (snap) => {
      setFeed(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DefenseFeedEvent, 'id'>),
        }))
      );
    });
    return () => unsub();
  }, [subscribedRoundId]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'games', GAME_ID, 'players', uid), (snap) => {
      if (!snap.exists()) {
        setPlayer({
          uid,
          nickname,
          capital: 0,
          upgrades: createDefaultUpgrades(),
          totalKills: 0,
          totalDeploys: 0,
          totalCapitalEarned: 0,
          roundWins: 0,
          bossKills: 0,
          winStreak: 0,
        });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const rawUpgrades = (data.upgrades || {}) as Record<string, unknown>;
      const upgrades = createDefaultUpgrades();
      for (const key of UPGRADE_KEYS) {
        upgrades[key] = Number(rawUpgrades[key]) || 0;
      }
      setPlayer({
        uid,
        nickname: String(data.nickname || nickname),
        capital: Number(data.capital) || 0,
        upgrades,
        totalKills: Number(data.totalKills) || 0,
        totalDeploys: Number(data.totalDeploys) || 0,
        totalCapitalEarned: Number(data.totalCapitalEarned) || 0,
        roundWins: Number(data.roundWins) || 0,
        bossKills: Number(data.bossKills) || 0,
        winStreak: Number(data.winStreak) || 0,
        lastManualSpawnAt: Number(data.lastManualSpawnAt) || undefined,
        lastDailyClaimKey: data.lastDailyClaimKey as string | undefined,
      });
      if (data.lastDailyClaimKey) setDailyClaimed(true);
    });
    return () => unsub();
  }, [uid, nickname]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'games', GAME_ID, 'memberPower', uid), (snap) => {
      if (!snap.exists()) {
        setMemberPower(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      setMemberPower({
        uid,
        nickname: String(data.nickname || nickname),
        grade: data.grade as string | undefined,
        activityScore: Number(data.activityScore) || 0,
        rank: Number(data.rank) || 999,
        baseAttack: Number(data.baseAttack) || 10,
        baseHp: Number(data.baseHp) || 50,
        baseSpeed: Number(data.baseSpeed) || 1.5,
      });
    });
    return () => unsub();
  }, [uid, nickname]);

  useEffect(() => {
    if (!showConnectOk) return;
    const timer = setTimeout(() => setShowConnectOk(false), 6000);
    return () => clearTimeout(timer);
  }, [showConnectOk]);

  useEffect(() => {
    if (!actionMessage) return;
    const isSticky =
      /실패|부족|오류|쿨다운|연결|불가|없습니다/.test(actionMessage);
    if (isSticky) return;
    if (actionMessageTimerRef.current) clearTimeout(actionMessageTimerRef.current);
    actionMessageTimerRef.current = setTimeout(() => setActionMessage(null), 5000);
    return () => {
      if (actionMessageTimerRef.current) clearTimeout(actionMessageTimerRef.current);
    };
  }, [actionMessage]);

  useEffect(() => {
    if (!round) return;
    const prev = prevRoundStatusRef.current;
    if (prev === 'active' && round.status === 'won') {
      setRoundBanner('라운드 승리! 승리 보너스가 지급되며 곧 다음 라운드가 시작됩니다.');
    } else if (prev === 'active' && round.status === 'lost') {
      setRoundBanner('베리어스 기지 함락… 잠시 후 새 라운드가 시작됩니다.');
    }
    prevRoundStatusRef.current = round.status;
  }, [round?.status, round?.roundNumber]);

  useEffect(() => {
    if (!roundBanner) return;
    const timer = setTimeout(() => setRoundBanner(null), 10000);
    return () => clearTimeout(timer);
  }, [roundBanner]);

  useEffect(() => {
    if (!player) return;
    const cooldownMs = calcManualSpawnCooldownMs(player.upgrades.spawnCooldown);
    const update = () => {
      const last = player.lastManualSpawnAt || 0;
      const remain = Math.max(0, cooldownMs - (Date.now() - last));
      setCooldownRemain(Math.ceil(remain / 1000));
    };
    update();
    tickRef.current = setInterval(update, 500);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [player]);

  const capital = player?.capital ?? 0;
  const totalKills = player?.totalKills ?? 0;

  const {
    toasts,
    showConfetti,
    sessionCapitalEarned,
    sessionKills,
    celebrateUpgrade,
    celebrateSpawn,
  } = useDefenseJuice({
    nickname,
    capital,
    totalKills,
    feed,
    round,
    player,
  });

  useEffect(() => {
    if (capital > prevCapitalPulseRef.current && prevCapitalPulseRef.current > 0) {
      setCapitalPulse(true);
      const t = window.setTimeout(() => setCapitalPulse(false), 700);
      prevCapitalPulseRef.current = capital;
      return () => window.clearTimeout(t);
    }
    prevCapitalPulseRef.current = capital;
  }, [capital]);

  useEffect(() => {
    if (tab === 'feed' && feed.length > 0) {
      setFeedSeenIds((prev) => {
        const next = new Set(prev);
        feed.forEach((f) => next.add(f.id));
        return next;
      });
    }
  }, [tab, feed]);

  const unseenFeedCount = useMemo(
    () => (tab === 'feed' ? 0 : feed.filter((f) => !feedSeenIds.has(f.id)).length),
    [feed, feedSeenIds, tab]
  );

  const myUnitOnField = useMemo(
    () => units.some((u) => u.uid === uid && u.side === 'ally' && u.hp > 0),
    [units, uid]
  );

  const allyUnderSiege = useMemo(
    () => units.some((u) => u.side === 'enemy' && (u.siegeTicks ?? 0) > 0),
    [units]
  );
  const enemyUnderSiege = useMemo(
    () => units.some((u) => u.side === 'ally' && (u.siegeTicks ?? 0) > 0),
    [units]
  );

  const recommendedKey = useMemo(
    () => recommendUpgrade(player?.upgrades ?? createDefaultUpgrades(), capital),
    [player?.upgrades, capital]
  );

  const filteredFeed = useMemo(
    () => (feedFilter === 'all' ? feed : feed.filter((f) => f.type === feedFilter)),
    [feed, feedFilter]
  );

  const nearAchievementCount = useMemo(
    () => countNearCompleteAchievements(player),
    [player]
  );

  const feedFilterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: feed.length };
    for (const item of feed) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
    return counts;
  }, [feed]);

  const allyUnitCount = useMemo(
    () => units.filter((u) => u.side === 'ally' && u.hp > 0).length,
    [units]
  );

  const spawnCooldownTotalSec = useMemo(() => {
    if (!player) return 30;
    return Math.ceil(calcManualSpawnCooldownMs(player.upgrades.spawnCooldown) / 1000);
  }, [player]);

  const spawnCooldownReadyPct = useMemo(() => {
    if (cooldownRemain <= 0 || spawnCooldownTotalSec <= 0) return 100;
    return Math.round(
      ((spawnCooldownTotalSec - cooldownRemain) / spawnCooldownTotalSec) * 100
    );
  }, [cooldownRemain, spawnCooldownTotalSec]);

  const dismissTutorial = () => {
    setShowTutorial(false);
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setDefenseSoundEnabled(next);
    if (next) unlockDefenseAudio();
  };

  const pulseFocusMyUnit = useCallback(() => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    setFocusMyUnit(true);
    focusTimerRef.current = setTimeout(() => setFocusMyUnit(false), 3200);
  }, []);

  const handleSpawn = useCallback(async () => {
    if (spawnLoading || cooldownRemain > 0) return;
    setSpawnLoading(true);
    setActionMessage(null);
    try {
      const result = await manualSpawnUnit();
      const now = Date.now();
      setPlayer((prev) => (prev ? { ...prev, lastManualSpawnAt: now } : prev));
      const spawnCd = player?.upgrades.spawnCooldown ?? 0;
      setCooldownRemain(Math.ceil(calcManualSpawnCooldownMs(spawnCd) / 1000));
      setActionMessage(result.message);
      celebrateSpawn();
    } catch (error) {
      setActionMessage(extractCallableMessage(error, '출격에 실패했습니다.'));
    } finally {
      setSpawnLoading(false);
    }
  }, [spawnLoading, cooldownRemain, player?.upgrades.spawnCooldown, celebrateSpawn]);

  const handleUpgrade = useCallback(async (key: UpgradeKey) => {
    if (upgradingRef.current.has(key)) return;
    upgradingRef.current.add(key);
    setUpgradingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setActionMessage(null);
    try {
      const result = await purchaseUpgrade(key);
      if (result.capital !== undefined && result.newLevel !== undefined) {
        setPlayer((prev) =>
          prev
            ? {
                ...prev,
                capital: result.capital!,
                upgrades: { ...prev.upgrades, [key]: result.newLevel! },
              }
            : prev
        );
      }
      const def = UPGRADE_DEFINITIONS.find((d) => d.key === key);
      if (def && result.newLevel !== undefined) {
        celebrateUpgrade(def.label, result.newLevel);
      }
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(extractCallableMessage(error, '강화에 실패했습니다.'));
    } finally {
      upgradingRef.current.delete(key);
      setUpgradingKeys((prev) => prev.filter((k) => k !== key));
    }
  }, [celebrateUpgrade]);

  const upgrades = player?.upgrades ?? createDefaultUpgrades();

  const effectiveStats = useMemo(() => {
    if (!memberPower) return null;
    return applyUpgradesToStats(
      {
        attack: memberPower.baseAttack,
        hp: memberPower.baseHp,
        speed: memberPower.baseSpeed,
      },
      upgrades
    );
  }, [memberPower, upgrades]);

  const sortedUpgradeDefs = useMemo(() => {
    return [...UPGRADE_DEFINITIONS].sort((a, b) => {
      if (a.key === recommendedKey) return -1;
      if (b.key === recommendedKey) return 1;
      const levelA = upgrades[a.key] || 0;
      const levelB = upgrades[b.key] || 0;
      if (levelA >= a.maxLevel && levelB < b.maxLevel) return 1;
      if (levelB >= b.maxLevel && levelA < a.maxLevel) return -1;
      const costA = getUpgradeCost(a.key, levelA);
      const costB = getUpgradeCost(b.key, levelB);
      const affordA = capital >= costA && levelA < a.maxLevel;
      const affordB = capital >= costB && levelB < b.maxLevel;
      if (affordA !== affordB) return affordA ? -1 : 1;
      return costA - costB;
    });
  }, [recommendedKey, upgrades, capital]);

  const isLive = Boolean(subscribedRoundId && round);
  const isPreview = !isLive;
  const displayRound = round ?? PREVIEW_ROUND;

  const roundFlashStatus = useMemo((): 'won' | 'lost' | null => {
    if (!round || isPreview) return null;
    if (round.status === 'won' || round.status === 'lost') return round.status;
    return null;
  }, [round, isPreview]);

  const spawnDisabled =
    spawnLoading ||
    cooldownRemain > 0 ||
    connectState !== 'connected' ||
    isPreview ||
    round?.status !== 'active';

  const spawnCooldownPct = useMemo(() => {
    if (cooldownRemain <= 0 || !player) return 0;
    const totalSec = Math.ceil(calcManualSpawnCooldownMs(player.upgrades.spawnCooldown) / 1000);
    if (totalSec <= 0) return 0;
    return Math.min(100, Math.round((cooldownRemain / totalSec) * 100));
  }, [cooldownRemain, player]);

  const spawnBlockReason = useMemo(() => {
    if (spawnLoading || cooldownRemain > 0) return null;
    if (connectState === 'connecting') return '전장 서버에 연결 중입니다. 잠시만 기다려 주세요.';
    if (connectState === 'error') return '전장 연결에 실패했습니다. 아래 「다시 연결」을 눌러 주세요.';
    if (connectState !== 'connected') return null;
    if (isPreview) return '라운드 정보를 불러오는 중입니다…';
    if (round?.status === 'won') return '라운드 승리 처리 중입니다. 곧 다음 라운드가 시작됩니다.';
    if (round?.status === 'lost') return '라운드 패배 처리 중입니다. 곧 다시 시작됩니다.';
    return null;
  }, [spawnLoading, cooldownRemain, connectState, isPreview, round?.status]);

  const statsRankLabel =
    memberPower && memberPower.rank > 0 && memberPower.rank < 9000
      ? `종합 활동 순위 ${memberPower.rank}위`
      : '스탯 동기화 중 (활동할수록 성장합니다)';

  return (
    <div className="games-page vd-page">
      <VeryusDefenseJuiceOverlay toasts={toasts} showConfetti={showConfetti} />
      <div className="games-content vd-content">
        <header className="games-header vd-header">
          <button type="button" className="games-back-btn" onClick={() => navigate('/games')}>
            ← 목록
          </button>
          <div>
            <h1 className="games-title">베리어스 디펜스</h1>
            <p className="games-subtitle">전 멤버 협동 · 몬스터 기지를 파괴하세요</p>
          </div>
        </header>

        <div className="vd-status-bar">
          <div className="vd-stat">
            <span className="vd-stat-label">라운드</span>
            <strong>{round?.roundNumber ?? '—'}</strong>
          </div>
          <div className={`vd-stat${capitalPulse ? ' vd-stat--pulse' : ''}`}>
            <span className="vd-stat-label">자본</span>
            <strong>{capital.toLocaleString()}</strong>
          </div>
          <div className="vd-stat">
            <span className="vd-stat-label">처치</span>
            <strong>{player?.totalKills ?? 0}</strong>
          </div>
          <div className="vd-stat">
            <span className="vd-stat-label">연승</span>
            <strong>{communityWinStreak > 0 ? `${communityWinStreak}연승` : '—'}</strong>
          </div>
          <div className="vd-stat">
            <span className="vd-stat-label">난이도</span>
            <strong>{difficultyMultiplier.toFixed(1)}x</strong>
          </div>
        </div>

        {(sessionCapitalEarned > 0 || sessionKills > 0 || onlineCount > 0) && (
          <div className="vd-session-strip" role="status">
            {onlineCount > 0 && (
              <span className="vd-session-pill vd-session-pill--online">
                접속 {onlineCount}명 · 협력 가속 중
              </span>
            )}
            {sessionKills > 0 && (
              <span className="vd-session-pill">이번 접속 처치 {sessionKills}</span>
            )}
            {sessionCapitalEarned > 0 && (
              <span className="vd-session-pill vd-session-pill--gold">
                이번 접속 +{sessionCapitalEarned.toLocaleString()} 자본
              </span>
            )}
          </div>
        )}

        {isAdmin && (
          <section className="vd-difficulty-admin" aria-label="관리자 난이도 설정">
            <h3>관리자 · 몬스터 난이도</h3>
            <p className="vd-action-desc">
              현재 배율 {difficultyMultiplier.toFixed(1)}x
              {round ? ` · 이번 라운드 적 스탯 ${round.enemyPowerScale.toFixed(2)}x` : ''}
            </p>
            <div className="vd-difficulty-presets">
              {DEFENSE_DIFFICULTY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={
                    Math.abs(difficultyMultiplier - preset.value) < 0.05 ? 'active' : ''
                  }
                  disabled={difficultyLoading}
                  onClick={() => {
                    setDifficultyLoading(true);
                    void setDefenseDifficulty(preset.value)
                      .then((result) => {
                        setActionMessage(result.message);
                        if (result.multiplier) setDifficultyMultiplier(result.multiplier);
                      })
                      .catch((error) => {
                        setActionMessage(extractCallableMessage(error, '난이도 설정에 실패했습니다.'));
                      })
                      .finally(() => setDifficultyLoading(false));
                  }}
                >
                  {preset.label} ({preset.value}x)
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="vd-events-banner" role="note">
          <div className="vd-events-banner-row">
            <strong>자본 획득</strong>
            <button type="button" className="vd-sound-toggle" onClick={toggleSound}>
              {soundOn ? '🔊 효과음' : '🔇 효과음 끔'}
            </button>
          </div>
          <span className="vd-events-banner-sub">
            {dailyClaimed ? '오늘 출석 완료' : `접속 시 출석 +${DAILY_ATTENDANCE_REWARD}`}
            {' · '}접속 중 협력 가속 (약 {(CLIENT_BOOST_INTERVAL_MS / 1000).toFixed(1)}초마다)
          </span>
        </div>

        {showTutorial && (
          <div className="vd-tutorial" role="region" aria-label="게임 안내">
            <h3>베리어스 디펜스 빠른 안내</h3>
            <ol>
              <li>접속만 해도 출석 자본 + 전장 가속에 기여합니다.</li>
              <li>「출격」으로 내 캐릭터를 보내고, 「강화」로 성장하세요.</li>
              <li>「전황」에서 처치·보스·승패 소식을 확인할 수 있습니다.</li>
              <li>라운드 승리 시 접속 중인 멤버에게 협동 보너스가 지급됩니다.</li>
            </ol>
            <button type="button" className="vd-tutorial-dismiss" onClick={dismissTutorial}>
              알겠어요
            </button>
          </div>
        )}

        {connectState === 'connecting' && (
          <p className="vd-connect-hint vd-connect-hint--loading" role="status">
            전장 서버에 연결하는 중…
          </p>
        )}
        {connectState === 'error' && (
          <div className="vd-connect-hint vd-connect-hint--error" role="alert">
            <p>{connectError}</p>
            <button type="button" className="vd-connect-retry" onClick={() => void runConnect()}>
              다시 연결
            </button>
          </div>
        )}
        {connectState === 'connected' && isPreview && (
          <p className="vd-connect-hint" role="status">
            서버 연결 완료. 라운드 데이터를 불러오는 중…
          </p>
        )}
        {showConnectOk && connectState === 'connected' && isLive && (
          <p className="vd-connect-hint vd-connect-hint--ok" role="status">
            실시간 전장 연결됨 · 라운드 {round?.roundNumber}
          </p>
        )}

        {roundBanner && (
          <p className="vd-round-banner" role="status">
            {roundBanner}
          </p>
        )}

        <section
          className={`vd-battle-hero${battlefieldCompact ? ' vd-battle-hero--compact' : ''}`}
          aria-label="실시간 전장"
        >
          {battlefieldCompact ? (
            <button
              type="button"
              className="vd-battle-compact-bar"
              onClick={() => {
                setBattlefieldCompact(false);
                handleTabChange('battle');
              }}
            >
              <span>전장 펼치기</span>
              <span className="vd-battle-compact-meta">
                라운드 {round?.roundNumber ?? '—'} · 아군 {allyUnitCount} · 자본 {capital.toLocaleString()}
              </span>
            </button>
          ) : (
            <>
              {!isPreview && round && (
                <VeryusDefenseBaseHpStrip
                  round={displayRound}
                  allySieged={allyUnderSiege}
                  enemySieged={enemyUnderSiege}
                />
              )}
              <div className="vd-battle-stage-wrap">
                <VeryusDefenseRoundFlash
                  status={roundFlashStatus}
                  roundNumber={round?.roundNumber}
                />
                <VeryusDefenseBattlefield
                  round={displayRound}
                  units={isPreview ? [] : units}
                  myUid={uid}
                  isPreview={isPreview}
                  allyUnderSiege={allyUnderSiege}
                  enemyUnderSiege={enemyUnderSiege}
                  focusMyUnit={focusMyUnit}
                />
                {!isPreview && connectState === 'connected' && round?.status === 'active' && (
                  <div className="vd-battle-quick" role="toolbar" aria-label="전장 빠른 조작">
                    <button
                      type="button"
                      className="vd-quick-btn"
                      title="내 유닛 위치 강조"
                      disabled={!myUnitOnField}
                      onClick={pulseFocusMyUnit}
                    >
                      📍
                    </button>
                    <button
                      type="button"
                      className="vd-quick-spawn"
                      disabled={spawnDisabled}
                      onClick={() => void handleSpawn()}
                      style={
                        cooldownRemain > 0
                          ? ({
                              ['--vd-cd-pct' as string]: `${spawnCooldownPct}%`,
                            } as React.CSSProperties)
                          : undefined
                      }
                    >
                      {spawnLoading
                        ? '출격…'
                        : cooldownRemain > 0
                          ? `${cooldownRemain}초`
                          : '⚔️ 출격'}
                    </button>
                    <button
                      type="button"
                      className="vd-quick-btn"
                      title="강화 탭으로 이동"
                      onClick={() => handleTabChange('upgrade')}
                    >
                      ⬆️
                    </button>
                  </div>
                )}
              </div>
              {tab !== 'battle' && (
                <button
                  type="button"
                  className="vd-battle-collapse-btn"
                  onClick={() => setBattlefieldCompact(true)}
                >
                  전장 접기
                </button>
              )}
            </>
          )}
        </section>

        <div className="vd-tabs" ref={tabPanelRef}>
          <button
            type="button"
            className={tab === 'battle' ? 'active' : ''}
            onClick={() => handleTabChange('battle')}
          >
            출격
          </button>
          <button
            type="button"
            className={tab === 'upgrade' ? 'active' : ''}
            onClick={() => handleTabChange('upgrade')}
          >
            강화
          </button>
          <button
            type="button"
            className={tab === 'ranking' ? 'active' : ''}
            onClick={() => handleTabChange('ranking')}
          >
            랭킹
          </button>
          <button
            type="button"
            className={tab === 'feed' ? 'active' : ''}
            onClick={() => handleTabChange('feed')}
          >
            전황
            {unseenFeedCount > 0 && (
              <span className="vd-tab-badge">{unseenFeedCount > 9 ? '9+' : unseenFeedCount}</span>
            )}
          </button>
          <button
            type="button"
            className={tab === 'achievements' ? 'active' : ''}
            onClick={() => handleTabChange('achievements')}
          >
            업적
            {nearAchievementCount > 0 && tab !== 'achievements' && (
              <span className="vd-tab-badge vd-tab-badge--gold">{nearAchievementCount}</span>
            )}
          </button>
        </div>

        {actionMessage && (
          <p className="vd-action-message" role="status" aria-live="polite">
            {actionMessage}
          </p>
        )}

        {tab === 'battle' && (
          <section className="vd-action-panel vd-action-panel--primary vd-tab-panel">
            <p className="vd-action-desc">
              접속 중에는 본인 캐릭터를 직접 출격할 수 있습니다. 전장 하단 ⚔️ 버튼으로도 출격할 수
              있어요. 비접속 멤버는 자동으로 기지에서 보냅니다.
            </p>
            {round?.status === 'active' && (
              <p className="vd-victory-hint">
                {VICTORY_BONUS_HINT(communityWinStreak, round.roundNumber)}
              </p>
            )}
            {effectiveStats && (
              <div className="vd-effective-stats">
                <span>출격 스탯</span>
                <strong>공격 {effectiveStats.attack}</strong>
                <strong>체력 {effectiveStats.hp}</strong>
                <strong>속도 {effectiveStats.speed.toFixed(1)}</strong>
                <strong>치명 {(effectiveStats.critChance * 100).toFixed(0)}%</strong>
              </div>
            )}
            <div className="vd-spawn-cooldown-bar" aria-hidden>
              <div
                className="vd-spawn-cooldown-fill"
                style={{ width: `${spawnCooldownReadyPct}%` }}
              />
            </div>
            <button
              type="button"
              className="vd-spawn-btn"
              disabled={spawnDisabled}
              onClick={() => void handleSpawn()}
            >
              {spawnLoading
                ? '출격 중…'
                : cooldownRemain > 0
                  ? `쿨다운 ${cooldownRemain}초`
                  : '내 캐릭터 출격'}
            </button>
            {spawnBlockReason && <p className="vd-spawn-hint">{spawnBlockReason}</p>}
            {myUnitOnField && (
              <p className="vd-spawn-active">내 캐릭터가 전장에서 싸우는 중입니다</p>
            )}
          </section>
        )}

        {tab === 'upgrade' && (
          <section className="vd-upgrade-panel vd-tab-panel">
            <div className="vd-upgrade-capital-bar">
              <span>보유 자본</span>
              <strong>{capital.toLocaleString()}</strong>
            </div>
            <p className="vd-action-desc">
              적 처치로 자본을 모아 캐릭터를 성장시키세요. 패배해도 자본과 강화는 유지됩니다.
              구매 가능한 항목이 위쪽에 정렬됩니다.
            </p>
            {recommendedKey && (
              <p className="vd-upgrade-recommend">
                추천 강화:{' '}
                <strong>
                  {UPGRADE_DEFINITIONS.find((d) => d.key === recommendedKey)?.label}
                </strong>
              </p>
            )}
            <div className="vd-upgrade-grid">
              {sortedUpgradeDefs.map((def) => {
                const level = upgrades[def.key] || 0;
                const cost = getUpgradeCost(def.key, level);
                const maxed = level >= def.maxLevel;
                const poor = !maxed && capital < cost;
                const recommended = def.key === recommendedKey && !maxed && !poor;
                return (
                  <button
                    key={def.key}
                    type="button"
                    className={`vd-upgrade-card${poor ? ' vd-upgrade-card--poor' : ''}${recommended ? ' vd-upgrade-card--recommended' : ''}`}
                    disabled={maxed || poor || upgradingKeys.includes(def.key)}
                    onClick={() => void handleUpgrade(def.key)}
                  >
                    <div className="vd-upgrade-card-head">
                      <strong>{def.label}</strong>
                      <span>Lv.{level}</span>
                    </div>
                    <p>{def.description} (최대 Lv.{def.maxLevel})</p>
                    {!maxed && <span className="vd-upgrade-hint">{getUpgradeNextHint(def.key)}</span>}
                    <span className="vd-upgrade-cost">
                      {maxed
                        ? 'MAX'
                        : poor
                          ? `자본 부족 (필요 ${cost.toLocaleString()})`
                          : `${cost.toLocaleString()} 자본`}
                    </span>
                    {upgradingKeys.includes(def.key) && (
                      <span className="vd-upgrade-loading">강화 중…</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'ranking' && (
          <div className="vd-tab-panel">
            <VeryusDefenseLeaderboard myUid={uid} player={player} />
          </div>
        )}

        {tab === 'achievements' && (
          <div className="vd-tab-panel">
            <VeryusDefenseAchievements player={player} />
          </div>
        )}

        {tab === 'feed' && (
          <section className="vd-feed-panel vd-tab-panel">
            <div className="vd-feed-filters" role="tablist" aria-label="전황 필터">
              {(['all', 'kill', 'event', 'round', 'spawn', 'base_hit', 'upgrade'] as const).map(
                (key) => {
                  const count = feedFilterCounts[key] || 0;
                  if (key !== 'all' && count === 0) return null;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={feedFilter === key}
                      className={feedFilter === key ? 'active' : ''}
                      onClick={() => setFeedFilter(key)}
                    >
                      {key === 'all' ? '전체' : FEED_TYPE_LABELS[key]}
                      {count > 0 && <span className="vd-feed-filter-count">{count}</span>}
                    </button>
                  );
                }
              )}
            </div>
            {filteredFeed.length === 0 ? (
              <p className="vd-feed-empty">
                {feed.length === 0
                  ? '아직 전황 기록이 없습니다.'
                  : '선택한 필터에 해당하는 전황이 없습니다.'}
              </p>
            ) : (
              <ul className="vd-feed-list">
                {filteredFeed.map((item) => (
                  <li
                    key={item.id}
                    className={
                      nickname && item.message.includes(nickname) ? 'vd-feed-item--mine' : ''
                    }
                  >
                    <div className="vd-feed-item-head">
                      <span className={`vd-feed-type vd-feed-type--${item.type}`}>
                        {FEED_TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      {formatFeedAge(item.createdAt) && (
                        <time className="vd-feed-time">{formatFeedAge(item.createdAt)}</time>
                      )}
                    </div>
                    <span className="vd-feed-message">{item.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'battle' && (
          <div className="vd-my-stats">
            <h3>내 기본 스탯 ({statsRankLabel})</h3>
            <div className="vd-my-stats-grid">
              <span>공격 {memberPower?.baseAttack ?? 12}</span>
              <span>체력 {memberPower?.baseHp ?? 70}</span>
              <span>속도 {(memberPower?.baseSpeed ?? 1.6).toFixed(1)}</span>
              <span>보스 처치 {player?.bossKills ?? 0}</span>
              <span>라운드 승리 {player?.roundWins ?? 0}</span>
              <span>누적 자본 {player?.totalCapitalEarned?.toLocaleString() ?? 0}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VeryusDefenseGame;
