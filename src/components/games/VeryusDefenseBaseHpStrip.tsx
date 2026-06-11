import React from 'react';
import { useSmoothedRound } from '../../hooks/useSmoothedRound';
import type { DefenseRound } from '../../utils/veryusDefense/constants';

type Props = {
  round: DefenseRound;
  allySieged?: boolean;
  enemySieged?: boolean;
};

const VeryusDefenseBaseHpStrip: React.FC<Props> = ({ round, allySieged, enemySieged }) => {
  const smooth = useSmoothedRound(round);
  const view = smooth ?? round;

  const allyPct =
    view.allyBaseMaxHp > 0
      ? Math.max(0, Math.min(100, (view.allyBaseHp / view.allyBaseMaxHp) * 100))
      : 0;
  const enemyPct =
    view.enemyBaseMaxHp > 0
      ? Math.max(0, Math.min(100, (view.enemyBaseHp / view.enemyBaseMaxHp) * 100))
      : 0;

  return (
    <div className="vd-base-hp-strip" aria-label="기지 체력">
      <div
        className={`vd-base-hp-col${allySieged || smooth?.allyBaseHit ? ' vd-base-hp-col--danger' : ''}`}
      >
        <div className="vd-base-hp-col-head">
          <span>베리어스 기지</span>
          <strong>{Math.round(allyPct)}%</strong>
        </div>
        <div className="vd-base-hp-track">
          <div className="vd-base-hp-fill vd-base-hp-fill--ally" style={{ width: `${allyPct}%` }} />
        </div>
      </div>
      <div className="vd-base-hp-vs">VS</div>
      <div
        className={`vd-base-hp-col${enemySieged || smooth?.enemyBaseHit ? ' vd-base-hp-col--siege' : ''}`}
      >
        <div className="vd-base-hp-col-head">
          <span>몬스터 기지</span>
          <strong>{Math.round(enemyPct)}%</strong>
        </div>
        <div className="vd-base-hp-track">
          <div
            className="vd-base-hp-fill vd-base-hp-fill--enemy"
            style={{ width: `${enemyPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default VeryusDefenseBaseHpStrip;
