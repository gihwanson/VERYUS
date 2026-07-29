import React, { useEffect, useState } from 'react';
import { useUserProfile } from '../contexts/UserProfileContext';
import { getGradeEmoji } from '../utils/gradeDisplay';
import {
  GRADE_FX_CHANGE_EVENT,
  GRADE_FX_SKINS,
  getEquippedGradeFxId,
  getGradeFxClassNameForSkin,
  hasGradeFxFullAccess,
  isGradeFxUnlocked,
  setEquippedGradeFxId,
  type GradeFxSkinId,
} from '../utils/gradeFxSkins';
import GradeFxSparkleDust from './GradeFxSparkleDust';
import '../styles/gradeFx.css';

const GradeFxSkinPicker: React.FC = () => {
  const { profile } = useUserProfile();
  const nickname = profile?.nickname;
  const gradeEmoji = getGradeEmoji(profile?.grade);
  const fullAccess = hasGradeFxFullAccess(nickname);
  const [equipped, setEquipped] = useState<GradeFxSkinId | null>(getEquippedGradeFxId);

  useEffect(() => {
    const sync = () => setEquipped(getEquippedGradeFxId());
    window.addEventListener(GRADE_FX_CHANGE_EVENT, sync);
    return () => window.removeEventListener(GRADE_FX_CHANGE_EVENT, sync);
  }, []);

  const handleSelect = (skinId: GradeFxSkinId | null) => {
    if (skinId && !isGradeFxUnlocked(skinId, nickname)) return;
    setEquippedGradeFxId(skinId);
    setEquipped(skinId);
  };

  return (
    <div className="grade-fx-picker">
      {fullAccess && (
        <p className="grade-fx-picker__leader-note">리더 미리보기 — 모든 등급 스킨을 확인할 수 있어요</p>
      )}
      <p className="grade-fx-picker__desc">
        등급 이모지에 적용할 특수효과 스킨입니다. 해금한 스킨만 장착할 수 있어요.
      </p>
      <div className="grade-fx-picker__grid" role="listbox" aria-label="등급 특수효과 스킨">
        <button
          type="button"
          role="option"
          aria-selected={equipped === null}
          className={`grade-fx-picker__card${equipped === null ? ' is-selected' : ''}`}
          onClick={() => handleSelect(null)}
        >
          <span className="grade-fx-picker__preview">{gradeEmoji}</span>
          <span className="grade-fx-picker__name">효과 없음</span>
          <span className="grade-fx-picker__meta">기본</span>
        </button>

        {GRADE_FX_SKINS.map((skin) => {
          const unlocked = isGradeFxUnlocked(skin.id, nickname);
          const selected = equipped === skin.id;
          return (
            <button
              key={skin.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!unlocked}
              title={unlocked ? skin.description : '아직 획득하지 않은 스킨입니다'}
              className={`grade-fx-picker__card${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`}
              onClick={() => handleSelect(skin.id)}
            >
              <span className={`grade-fx-picker__preview ${getGradeFxClassNameForSkin(skin.id)}`}>
                {skin.id === 'sparkle' && <GradeFxSparkleDust />}
                {gradeEmoji}
              </span>
              <span className="grade-fx-picker__name">{skin.name}</span>
              <span className="grade-fx-picker__meta">
                {unlocked ? (fullAccess ? '리더 해금' : '보유') : '미획득'}
              </span>
              <span className="grade-fx-picker__condition">
                조건: {skin.unlockCondition}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default GradeFxSkinPicker;
