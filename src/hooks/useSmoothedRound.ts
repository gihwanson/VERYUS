import { useEffect, useRef, useState } from 'react';
import type { DefenseRound } from '../utils/veryusDefense/constants';

export type SmoothedRound = DefenseRound & {
  allyBaseHit: boolean;
  enemyBaseHit: boolean;
};

const HP_LERP_SPEED = 2200;

export function useSmoothedRound(round: DefenseRound | null): SmoothedRound | null {
  const displayRef = useRef({
    allyBaseHp: round?.allyBaseHp ?? 0,
    enemyBaseHp: round?.enemyBaseHp ?? 0,
  });
  const [frame, setFrame] = useState(0);
  const [allyBaseHit, setAllyBaseHit] = useState(false);
  const [enemyBaseHit, setEnemyBaseHit] = useState(false);
  const prevRef = useRef({ ally: round?.allyBaseHp ?? 0, enemy: round?.enemyBaseHp ?? 0 });

  useEffect(() => {
    if (!round) return;
    if (round.enemyBaseHp < prevRef.current.enemy) {
      setEnemyBaseHit(true);
      const t = window.setTimeout(() => setEnemyBaseHit(false), 520);
      prevRef.current.enemy = round.enemyBaseHp;
      return () => window.clearTimeout(t);
    }
    prevRef.current.enemy = round.enemyBaseHp;
  }, [round?.enemyBaseHp, round]);

  useEffect(() => {
    if (!round) return;
    if (round.allyBaseHp < prevRef.current.ally) {
      setAllyBaseHit(true);
      const t = window.setTimeout(() => setAllyBaseHit(false), 520);
      prevRef.current.ally = round.allyBaseHp;
      return () => window.clearTimeout(t);
    }
    prevRef.current.ally = round.allyBaseHp;
  }, [round?.allyBaseHp, round]);

  useEffect(() => {
    if (!round) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const d = displayRef.current;

      const allyGap = round.allyBaseHp - d.allyBaseHp;
      if (Math.abs(allyGap) > 0.5) {
        d.allyBaseHp += Math.sign(allyGap) * Math.min(Math.abs(allyGap), HP_LERP_SPEED * dt);
      } else {
        d.allyBaseHp = round.allyBaseHp;
      }

      const enemyGap = round.enemyBaseHp - d.enemyBaseHp;
      if (Math.abs(enemyGap) > 0.5) {
        d.enemyBaseHp += Math.sign(enemyGap) * Math.min(Math.abs(enemyGap), HP_LERP_SPEED * dt);
      } else {
        d.enemyBaseHp = round.enemyBaseHp;
      }

      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round?.allyBaseHp, round?.enemyBaseHp, round]);

  if (!round) return null;

  void frame;

  return {
    ...round,
    allyBaseHp: Math.round(displayRef.current.allyBaseHp),
    enemyBaseHp: Math.round(displayRef.current.enemyBaseHp),
    allyBaseHit,
    enemyBaseHit,
  };
}
