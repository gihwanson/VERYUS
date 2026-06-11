import React, { useMemo } from 'react';

import { getGradeEmoji } from '../../utils/gradeDisplay';

import { useBattlefieldUnits } from '../../hooks/useBattlefieldUnits';
import { useSmoothedRound } from '../../hooks/useSmoothedRound';

import {

  ENEMY_BASE,

  getEnemyInstrumentVisual,

} from '../../utils/veryusDefense/enemyTheme';

import { type DefenseRound, type DefenseUnit } from '../../utils/veryusDefense/constants';
import {
  computeUnitLayouts as layoutUnits,
  findCombatZones as getCombatZones,
} from '../../utils/veryusDefense/battlefieldLayout';

import {

  AllyBaseGraphic,

  EnemyBaseGraphic,

} from './VeryusDefenseInstruments';

import VeryusDefenseUnitChar from './VeryusDefenseUnitChar';

import './VeryusDefenseBattlefield.css';



const HpBar: React.FC<{

  current: number;

  max: number;

  variant: 'ally' | 'enemy';

  compact?: boolean;

}> = ({ current, max, variant, compact }) => {

  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;

  return (

    <div className={`vd-hp-bar vd-hp-bar--${variant}${compact ? ' vd-hp-bar--compact' : ''}`}>

      <div className="vd-hp-bar-fill" style={{ width: `${pct}%` }} />

      <span className="vd-hp-bar-label">

        {compact ? `${Math.round(pct)}%` : `${current.toLocaleString()} / ${max.toLocaleString()}`}

      </span>

    </div>

  );

};



type Props = {

  round: DefenseRound;

  units: DefenseUnit[];

  myUid: string;

  isPreview?: boolean;

  allyUnderSiege?: boolean;

  enemyUnderSiege?: boolean;

  focusMyUnit?: boolean;

};



const VeryusDefenseBattlefield: React.FC<Props> = ({
  round,
  units,
  myUid,
  isPreview,
  allyUnderSiege,
  enemyUnderSiege,
  focusMyUnit,
}) => {

  const displayUnits = useBattlefieldUnits(units);
  const smoothRound = useSmoothedRound(round);
  const viewRound = smoothRound ?? round;



  const layouts = useMemo(

    () => layoutUnits(displayUnits, myUid),

    [displayUnits, myUid]

  );



  const combatZones = useMemo(() => getCombatZones(displayUnits), [displayUnits]);



  const allyCount = units.filter((u) => u.side === 'ally').length;

  const enemyCount = units.filter((u) => u.side === 'enemy').length;




  const sceneShaking = Boolean(smoothRound?.allyBaseHit || smoothRound?.enemyBaseHit);

  return (

    <section
      className={`vd-scene${isPreview ? ' vd-scene--preview' : ''}${sceneShaking ? ' vd-scene--shake' : ''}`}
      aria-label="베리어스 디펜스 전장"
    >

      <div className="vd-scene-sky">

        <div className="vd-scene-sun" aria-hidden />

        <div className="vd-scene-rays" aria-hidden />

        <div className="vd-cloud vd-cloud--a" aria-hidden />

        <div className="vd-cloud vd-cloud--b" aria-hidden />

        <div className="vd-cloud vd-cloud--c" aria-hidden />

        <div className="vd-scene-bird vd-scene-bird--a" aria-hidden>🕊️</div>

        <div className="vd-scene-bird vd-scene-bird--b" aria-hidden>🕊️</div>

      </div>



      <div className="vd-scene-backdrop" aria-hidden>

        <div className="vd-hill vd-hill--left" />

        <div className="vd-hill vd-hill--center" />

        <div className="vd-hill vd-hill--right" />

        <div className="vd-stage-lights vd-stage-lights--left" />

        <div className="vd-stage-lights vd-stage-lights--right" />

      </div>



      <div className="vd-scene-arena">

        <div className="vd-path vd-path--extended">

          <div className="vd-path-grass vd-path-grass--top" aria-hidden />

          <div className="vd-path-lane" aria-hidden>

            <div className="vd-path-lane-shine" />

          </div>

          <div className="vd-path-grass vd-path-grass--bottom" aria-hidden />

          <div className="vd-path-fence vd-path-fence--left" aria-hidden />

          <div className="vd-path-fence vd-path-fence--right" aria-hidden />

          <article
            className={`vd-castle vd-castle--ally vd-castle--path-end${smoothRound?.allyBaseHit ? ' vd-castle--hit' : ''}${allyUnderSiege ? ' vd-castle--sieged' : ''}`}
          >
            <div className="vd-castle-flag" aria-hidden>
              🚩
            </div>
            <AllyBaseGraphic />
            <p className="vd-castle-name">VERYUS</p>
            <p className="vd-castle-sub">합창 요새</p>
            <HpBar
              current={viewRound.allyBaseHp}
              max={viewRound.allyBaseMaxHp}
              variant="ally"
              compact
            />
          </article>

          <article
            className={`vd-castle vd-castle--enemy vd-castle--path-end${smoothRound?.enemyBaseHit ? ' vd-castle--hit' : ''}${enemyUnderSiege ? ' vd-castle--sieged' : ''}`}
          >
            <div className="vd-castle-flag vd-castle-flag--enemy" aria-hidden>
              🎶
            </div>
            <EnemyBaseGraphic />
            <p className="vd-castle-name">{ENEMY_BASE.label}</p>
            <p className="vd-castle-sub">{ENEMY_BASE.subtitle}</p>
            <HpBar
              current={viewRound.enemyBaseHp}
              max={viewRound.enemyBaseMaxHp}
              variant="enemy"
              compact
            />
          </article>

          {combatZones.map((left, i) => (

            <div

              key={`clash-${i}-${Math.round(left)}`}

              className="vd-combat-zone"

              style={{ left: `${left}%` }}

              aria-hidden

            />

          ))}



          {isPreview && units.length === 0 && (

            <div className="vd-path-overlay">

              <span className="vd-path-overlay-pulse" />

              <p>전장 연결 중…</p>

              <span className="vd-path-overlay-sub">탬버린 군단이 준비됩니다</span>

            </div>

          )}



          {!isPreview && units.length === 0 && (

            <div className="vd-path-idle">

              <span>🎵</span>

              <p>유닛 대기 중 — 출격하거나 자동 스폰을 기다려주세요</p>

            </div>

          )}



          {displayUnits.map((unit) => {

            const layout = layouts.get(unit.id);

            if (!layout) return null;



            if (unit.side === 'enemy') {

              const visual = getEnemyInstrumentVisual(unit);

              return (

                <VeryusDefenseUnitChar

                  key={unit.id}

                  unit={unit}

                  layout={layout}

                  enemyVisual={visual}

                  displayName={visual.label}

                  isMarching={unit.isMarching}

                  isVisuallyFighting={unit.isVisuallyFighting}

                  isSiegingBase={unit.isSiegingBase}

                  isSpawning={unit.isSpawning}

                  fadingOut={unit.fadingOut}

                />

              );

            }



            return (

              <VeryusDefenseUnitChar

                key={unit.id}

                unit={unit}

                layout={layout}

                isMine={unit.uid === myUid}

                focusHighlight={focusMyUnit && unit.uid === myUid}

                allyEmoji={getGradeEmoji(unit.grade) || '🐱'}

                displayName={unit.nickname}

                isMarching={unit.isMarching}

                isVisuallyFighting={unit.isVisuallyFighting}

                isSiegingBase={unit.isSiegingBase}

                isDefendingBase={unit.isDefendingBase}

                isSpawning={unit.isSpawning}

                fadingOut={unit.fadingOut}

              />

            );

          })}

        </div>

      </div>



      <footer className="vd-scene-footer">

        <span>라운드 {round.roundNumber}</span>

        <span>아군 {allyCount} · 악기군 {enemyCount}</span>

        <span>난이도 ×{round.enemyPowerScale.toFixed(2)}</span>

        <span>

          {isPreview

            ? '미리보기'

            : round.status === 'active'

              ? combatZones.length > 0

                ? '⚔️ 교전 중'

                : '⚔️ 전투 중'

              : round.status === 'won'

                ? '🎉 승리'

                : '💥 패배'}

        </span>

      </footer>

    </section>

  );

};



export default VeryusDefenseBattlefield;

