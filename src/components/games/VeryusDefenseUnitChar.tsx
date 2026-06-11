import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GRADE_ORDER } from '../AdminTypes';
import { getGradeEmoji } from '../../utils/gradeDisplay';
import type { DefenseUnit } from '../../utils/veryusDefense/constants';
import type { UnitBattleLayout } from '../../utils/veryusDefense/battlefieldLayout';
import type { EnemyInstrumentVisual } from '../../utils/veryusDefense/enemyTheme';
import { EnemyInstrumentSprite } from './VeryusDefenseInstruments';

type Props = {
  unit: DefenseUnit & { opacity?: number };
  layout: UnitBattleLayout;
  isMine?: boolean;
  focusHighlight?: boolean;
  allyEmoji?: string;
  enemyVisual?: EnemyInstrumentVisual;
  displayName: string;
  isMarching?: boolean;
  isVisuallyFighting?: boolean;
  isSiegingBase?: boolean;
  isDefendingBase?: boolean;
  isSpawning?: boolean;
  fadingOut?: boolean;
};

const VeryusDefenseUnitChar: React.FC<Props> = ({
  unit,
  layout,
  isMine,
  focusHighlight,
  allyEmoji,
  enemyVisual,
  displayName,
  isMarching,
  isVisuallyFighting,
  isSiegingBase,
  isDefendingBase,
  isSpawning,
  fadingOut,
}) => {
  const prevHpRef = useRef(unit.hp);
  const [hitFlash, setHitFlash] = useState(false);
  const [damagePopup, setDamagePopup] = useState<number | null>(null);
  const sieging = !fadingOut && isSiegingBase === true;
  const defending = !fadingOut && !sieging && isDefendingBase === true;
  const fighting =
    !fadingOut && !sieging && (isVisuallyFighting === true || defending || hitFlash);
  const marching = !fadingOut && !fighting && !sieging && isMarching;
  const hpPct = unit.maxHp > 0 ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0;

  const allyTierClass = useMemo(() => {
    if (unit.side !== 'ally') return '';
    const emoji = allyEmoji || getGradeEmoji(unit.grade);
    const idx = (GRADE_ORDER as readonly string[]).indexOf(emoji);
    if (idx < 0) return ' vd-ally-sprite--tier-0';
    return ` vd-ally-sprite--tier-${idx}`;
  }, [unit.side, unit.grade, allyEmoji]);

  useEffect(() => {
    if (fadingOut) return;
    if (unit.hp < prevHpRef.current) {
      const delta = prevHpRef.current - unit.hp;
      setDamagePopup(delta);
      setHitFlash(true);
      const t = setTimeout(() => {
        setHitFlash(false);
        setDamagePopup(null);
      }, 600);
      prevHpRef.current = unit.hp;
      return () => clearTimeout(t);
    }
    prevHpRef.current = unit.hp;
  }, [unit.hp, fadingOut]);

  return (
    <div
      className={`vd-char vd-char--${unit.side}${unit.isBoss ? ' vd-char--boss' : ''}${isMine ? ' vd-char--mine' : ''}${focusHighlight ? ' vd-char--focus' : ''}${sieging ? ' vd-char--sieging' : ''}${defending ? ' vd-char--defending' : ''}${fighting ? ' vd-char--fighting' : ''}${marching ? ' vd-char--marching' : ''}${isSpawning ? ' vd-char--spawning' : ''}${hitFlash ? ' vd-char--hit' : ''}${fadingOut ? ' vd-char--fading' : ''}${layout.compact ? ' vd-char--compact' : ''}`}
      style={{
        left: `${layout.laneLeft}%`,
        bottom: `${layout.bottomPct}%`,
        zIndex: layout.zIndex,
        opacity: unit.opacity ?? 1,
        transform: `translateX(-50%) scale(${layout.scale})`,
        ['--vd-scale' as string]: String(layout.scale),
      }}
      title={`${displayName} · HP ${unit.hp}/${unit.maxHp} · ATK ${unit.attack}`}
    >
      {isSpawning && <div className="vd-char-spawn-ring" aria-hidden />}
      {unit.isBoss && !fadingOut && <span className="vd-char-boss-badge" aria-hidden>BOSS</span>}
      {marching && <div className="vd-char-march-dust" aria-hidden />}

      {layout.showHp && (
        <div className="vd-char-hp-float">
          <div className="vd-char-hp-float-track">
            <div
              className={`vd-char-hp-float-fill vd-char-hp-float-fill--${unit.side}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
          {(fighting || isMine || !layout.compact) && (
            <span className="vd-char-hp-float-text">
              {unit.hp}/{unit.maxHp}
            </span>
          )}
        </div>
      )}

      {damagePopup !== null && (
        <span
          className={`vd-char-damage-popup${damagePopup >= 40 ? ' vd-char-damage-popup--crit' : ''}`}
          aria-hidden
        >
          -{damagePopup}
        </span>
      )}

      {sieging && (
        <>
          <div className="vd-char-siege-fx" aria-hidden>
            {unit.side === 'ally' ? '🎵' : '🥁'}
          </div>
          <div className="vd-char-siege-beam" aria-hidden />
        </>
      )}

      {fighting && <div className="vd-char-combat-fx" aria-hidden>💥</div>}

      <div className="vd-char-shadow" aria-hidden />
      <div className="vd-char-sprite-wrap">
        {unit.side === 'enemy' && enemyVisual ? (
          <EnemyInstrumentSprite
            instrumentId={enemyVisual.id}
            emoji={enemyVisual.emoji}
            size={enemyVisual.size}
          />
        ) : (
          <span className={`vd-ally-sprite${allyTierClass}`}>{allyEmoji}</span>
        )}
      </div>
      {layout.showName && (
        <div className="vd-char-plate">
          <span className="vd-char-name">{displayName}</span>
        </div>
      )}
    </div>
  );
};

export default VeryusDefenseUnitChar;
