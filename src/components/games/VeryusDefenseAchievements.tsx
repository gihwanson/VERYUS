import React from 'react';
import {
  DEFENSE_ACHIEVEMENTS,
  getUnlockedAchievements,
} from '../../utils/veryusDefense/achievements';
import type { DefensePlayer } from '../../utils/veryusDefense/constants';

const VeryusDefenseAchievements: React.FC<{ player: DefensePlayer | null }> = ({ player }) => {
  const unlocked = getUnlockedAchievements(player);
  const unlockedIds = new Set(unlocked.map((a) => a.id));
  const total = DEFENSE_ACHIEVEMENTS.length;
  const pct = total > 0 ? Math.round((unlocked.length / total) * 100) : 0;

  return (
    <section className="vd-achievements-panel">
      <div className="vd-achievements-summary">
        <div className="vd-achievements-summary-head">
          <strong>달성 {unlocked.length} / {total}</strong>
          <span>{pct}%</span>
        </div>
        <div className="vd-achievements-summary-track">
          <div className="vd-achievements-summary-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="vd-action-desc">
        {unlocked.length < total
          ? '플레이하면서 업적을 모아 보세요!'
          : '모든 업적을 달성했습니다! 🎉'}
      </p>
      <ul className="vd-achievements-grid">
        {DEFENSE_ACHIEVEMENTS.map((ach) => {
          const done = unlockedIds.has(ach.id);
          const prog = !done && player && ach.progress ? ach.progress(player) : null;
          const progPct =
            prog && prog.target > 0 ? Math.round((prog.current / prog.target) * 100) : 0;
          return (
            <li
              key={ach.id}
              className={`vd-achievement-card${done ? ' vd-achievement-card--done' : ''}`}
            >
              <span className="vd-achievement-emoji" aria-hidden>
                {done ? ach.emoji : '🔒'}
              </span>
              <div className="vd-achievement-body">
                <strong>{ach.label}</strong>
                <p>{ach.description}</p>
                {prog && (
                  <div className="vd-achievement-progress">
                    <div className="vd-achievement-progress-track">
                      <div
                        className="vd-achievement-progress-fill"
                        style={{ width: `${progPct}%` }}
                      />
                    </div>
                    <span>
                      {prog.current.toLocaleString()} / {prog.target.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default VeryusDefenseAchievements;
