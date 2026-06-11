import { useCallback, useEffect, useRef, useState } from 'react';
import { getUnlockedAchievements } from '../utils/veryusDefense/achievements';
import {
  playBaseHitSound,
  playKillSound,
  playSpawnSound,
  playUpgradeSound,
  playWarnSound,
  playWinSound,
} from '../utils/veryusDefense/sounds';
import { gameVibrate } from '../utils/gameSounds';
import type { DefenseFeedEvent, DefensePlayer, DefenseRound } from '../utils/veryusDefense/constants';

export type JuiceToast = {
  id: string;
  text: string;
  tone: 'good' | 'excited' | 'info' | 'warn';
};

type Options = {
  nickname: string;
  capital: number;
  totalKills: number;
  feed: DefenseFeedEvent[];
  round: DefenseRound | null;
  player: DefensePlayer | null;
};

const MILESTONE_KILLS = [10, 25, 50, 100, 250, 500];
const MILESTONE_CAPITAL = [500, 1000, 2500, 5000, 10000, 25000];

export function useDefenseJuice({ nickname, capital, totalKills, feed, round, player }: Options) {
  const [toasts, setToasts] = useState<JuiceToast[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const sessionRef = useRef({ capitalStart: capital, killsStart: totalKills, ready: false });
  const prevRef = useRef({ capital, kills: totalKills });
  const milestoneKillsRef = useRef(new Set<number>());
  const milestoneCapitalRef = useRef(new Set<number>());
  const seenFeedRef = useRef(new Set<string>());
  const prevRoundStatusRef = useRef<DefenseRound['status'] | null>(null);
  const killBurstRef = useRef<{ count: number; timer: ReturnType<typeof setTimeout> | null }>({
    count: 0,
    timer: null,
  });
  const unlockedAchRef = useRef<Set<string>>(new Set());
  const achInitRef = useRef(false);
  const prevAllyBaseHpRef = useRef(round?.allyBaseHp ?? 0);
  const baseHitCooldownRef = useRef(0);

  const pushToast = useCallback((text: string, tone: JuiceToast['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    if (sessionRef.current.ready) return;
    sessionRef.current = { capitalStart: capital, killsStart: totalKills, ready: true };
    prevRef.current = { capital, kills: totalKills };
  }, [capital, totalKills]);

  useEffect(() => {
    const delta = capital - prevRef.current.capital;
    if (delta > 0 && prevRef.current.capital > 0) {
      if (delta >= 30) {
        pushToast(`+${delta.toLocaleString()} 자본 획득!`, 'good');
      }
      for (const m of MILESTONE_CAPITAL) {
        if (
          capital >= m &&
          prevRef.current.capital < m &&
          !milestoneCapitalRef.current.has(m)
        ) {
          milestoneCapitalRef.current.add(m);
          pushToast(`누적 보유 자본 ${m.toLocaleString()} 돌파!`, 'excited');
        }
      }
    }
    prevRef.current.capital = capital;
  }, [capital, pushToast]);

  useEffect(() => {
    const delta = totalKills - prevRef.current.kills;
    if (delta > 0) {
      killBurstRef.current.count += delta;
      if (killBurstRef.current.timer) clearTimeout(killBurstRef.current.timer);
      killBurstRef.current.timer = setTimeout(() => {
        const burst = killBurstRef.current.count;
        killBurstRef.current.count = 0;
        if (burst >= 3) {
          pushToast(`${burst}마리 연속 처치!`, 'excited');
        }
      }, 2500);

      for (const m of MILESTONE_KILLS) {
        if (
          totalKills >= m &&
          prevRef.current.kills < m &&
          !milestoneKillsRef.current.has(m)
        ) {
          milestoneKillsRef.current.add(m);
          pushToast(`누적 처치 ${m}마리 달성!`, 'excited');
        }
      }
    }
    prevRef.current.kills = totalKills;
  }, [totalKills, pushToast]);

  useEffect(() => {
    if (!feed.length) return;
    for (const item of feed.slice(0, 3)) {
      if (seenFeedRef.current.has(item.id)) continue;
      seenFeedRef.current.add(item.id);
      if (seenFeedRef.current.size > 80) {
        const arr = [...seenFeedRef.current];
        seenFeedRef.current = new Set(arr.slice(-40));
      }

      const mine = nickname && item.message.includes(nickname);
      if (item.type === 'kill' && mine) {
        pushToast(item.message, item.message.includes('보스') ? 'excited' : 'good');
        playKillSound();
      } else if (item.message.includes('보스') && item.message.includes('나타났')) {
        pushToast(item.message, 'warn');
        playWarnSound();
      } else if (item.type === 'round' && item.message.includes('승리') && mine) {
        pushToast(item.message, 'excited');
      }
    }
  }, [feed, nickname, pushToast]);

  useEffect(() => {
    if (!round) return;
    const prevHp = prevAllyBaseHpRef.current;
    if (round.allyBaseHp < prevHp && round.status === 'active') {
      const now = Date.now();
      if (now - baseHitCooldownRef.current > 2800) {
        baseHitCooldownRef.current = now;
        playBaseHitSound();
        gameVibrate([20, 30, 20]);
        pushToast('우리 기지가 공격받고 있습니다!', 'warn');
      }
    }
    prevAllyBaseHpRef.current = round.allyBaseHp;
  }, [round?.allyBaseHp, round?.status, pushToast, round]);

  useEffect(() => {
    if (!round) return;
    const prev = prevRoundStatusRef.current;
    if (prev === 'active' && round.status === 'won') {
      setShowConfetti(true);
      playWinSound();
      pushToast('라운드 승리! 협동 보너스가 지급됩니다', 'excited');
      const t = window.setTimeout(() => setShowConfetti(false), 5000);
      prevRoundStatusRef.current = round.status;
      return () => window.clearTimeout(t);
    }
    if (prev === 'active' && round.status === 'lost') {
      pushToast('기지 함락… 다음 라운드에서 재도전!', 'warn');
      playWarnSound();
    }
    prevRoundStatusRef.current = round.status;
  }, [round?.status, round?.roundNumber, pushToast, round]);

  useEffect(() => {
    if (!player) return;
    const unlocked = getUnlockedAchievements(player);
    if (!achInitRef.current) {
      unlocked.forEach((a) => unlockedAchRef.current.add(a.id));
      achInitRef.current = true;
      return;
    }
    for (const ach of unlocked) {
      if (unlockedAchRef.current.has(ach.id)) continue;
      unlockedAchRef.current.add(ach.id);
      pushToast(`업적 달성: ${ach.emoji} ${ach.label}`, 'excited');
    }
  }, [player, pushToast]);

  const sessionCapitalEarned = Math.max(0, capital - sessionRef.current.capitalStart);
  const sessionKills = Math.max(0, totalKills - sessionRef.current.killsStart);

  const celebrateUpgrade = useCallback(
    (label: string, level: number) => {
      playUpgradeSound();
      pushToast(`${label} Lv.${level} 달성!`, 'excited');
    },
    [pushToast]
  );

  const celebrateSpawn = useCallback(() => {
    playSpawnSound();
    pushToast('전장에 출격했습니다!', 'good');
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  }, [pushToast]);

  return {
    toasts,
    showConfetti,
    sessionCapitalEarned,
    sessionKills,
    celebrateUpgrade,
    celebrateSpawn,
  };
}
