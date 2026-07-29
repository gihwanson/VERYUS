import React, { useEffect, useState } from 'react';
import { useCosmeticSkinsContext } from '../contexts/CosmeticSkinsContext';
import { useUserProfile } from '../contexts/UserProfileContext';
import {
  COSMETIC_CHANGE_EVENT,
  getCosmeticSkins,
  getEquippedCosmeticId,
  getEquippedCosmeticClassName,
  hasCosmeticFullAccess,
  isCosmeticUnlocked,
  setEquippedCosmeticId,
  type CosmeticCategory,
} from '../utils/cosmeticSkins';
import '../styles/cosmeticSkins.css';

interface CosmeticSkinPickerProps {
  category: CosmeticCategory;
  title?: string;
  description: string;
  previewLabel?: string;
}

const PREVIEW_CLASS: Record<CosmeticCategory, string> = {
  nickname: 'cosmetic-skin-picker__preview',
  badge: 'cosmetic-skin-picker__preview cosmetic-skin-picker__preview--badge role-badge',
  postTitle: 'cosmetic-skin-picker__preview cosmetic-skin-picker__preview--title',
  postBody: 'cosmetic-skin-picker__preview cosmetic-skin-picker__preview--body',
};

const CosmeticSkinPicker: React.FC<CosmeticSkinPickerProps> = ({
  category,
  description,
  previewLabel,
}) => {
  const { profile } = useUserProfile();
  const nickname = profile?.nickname;
  const fullAccess = hasCosmeticFullAccess(nickname);
  const skins = getCosmeticSkins(category);
  const sample =
    previewLabel ||
    (category === 'badge'
      ? '역할'
      : category === 'postTitle'
        ? '글 제목 미리보기'
        : category === 'postBody'
          ? '본문 미리보기'
          : nickname || '닉네임');

  const [equipped, setEquipped] = useState<string | null>(() => getEquippedCosmeticId(category));

  useEffect(() => {
    const sync = () => setEquipped(getEquippedCosmeticId(category));
    sync();
    window.addEventListener(COSMETIC_CHANGE_EVENT, sync);
    return () => window.removeEventListener(COSMETIC_CHANGE_EVENT, sync);
  }, [category]);

  const handleSelect = (skinId: string | null) => {
    if (skinId && !isCosmeticUnlocked(category, skinId, nickname)) return;
    setEquippedCosmeticId(category, skinId);
    setEquipped(skinId);
  };

  return (
    <div className="cosmetic-skin-picker">
      {fullAccess && (
        <p className="cosmetic-skin-picker__leader-note">
          리더 미리보기 — 모든 스킨을 확인하고 장착할 수 있어요
        </p>
      )}
      <p className="cosmetic-skin-picker__desc">{description}</p>
      <div className="cosmetic-skin-picker__grid" role="listbox" aria-label={description}>
        <button
          type="button"
          role="option"
          aria-selected={equipped === null}
          className={`cosmetic-skin-picker__card${equipped === null ? ' is-selected' : ''}`}
          onClick={() => handleSelect(null)}
        >
          <span className={PREVIEW_CLASS[category]}>{sample}</span>
          <span className="cosmetic-skin-picker__name">효과 없음</span>
          <span className="cosmetic-skin-picker__meta">기본</span>
        </button>

        {skins.map((skin) => {
          const unlocked = isCosmeticUnlocked(category, skin.id, nickname);
          const selected = equipped === skin.id;
          return (
            <button
              key={skin.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!unlocked}
              title={unlocked ? skin.description : '아직 획득하지 않은 스킨입니다'}
              className={`cosmetic-skin-picker__card${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`}
              onClick={() => handleSelect(skin.id)}
            >
              <span className={`${PREVIEW_CLASS[category]} ${skin.className}`}>{sample}</span>
              <span className="cosmetic-skin-picker__name">{skin.name}</span>
              <span className="cosmetic-skin-picker__meta">
                {unlocked ? (fullAccess ? '리더 해금' : '보유') : '미획득'}
              </span>
              <span className="cosmetic-skin-picker__condition">조건: {skin.unlockCondition}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export function useEquippedCosmeticClass(
  category: CosmeticCategory,
  options?: {
    writerUid?: string | null;
    writerNickname?: string | null;
    force?: boolean;
    suppress?: boolean;
  }
): string {
  const { profile } = useUserProfile();
  const { getWriterCosmeticClass, preloadWriterSkins } = useCosmeticSkinsContext();
  const writerUid = options?.writerUid?.trim() || '';
  const writerNickname = options?.writerNickname;
  const force = options?.force ?? false;
  const suppress = options?.suppress ?? false;

  const isSelfByNick =
    Boolean(writerNickname) &&
    Boolean(profile?.nickname) &&
    writerNickname!.trim().toLowerCase() === profile!.nickname!.trim().toLowerCase();

  const useRemote = !suppress && Boolean(writerUid) && !force;
  const shouldApplyLocal =
    !suppress && (force || (!writerUid && isSelfByNick));

  const [localClass, setLocalClass] = useState(() =>
    shouldApplyLocal ? getEquippedCosmeticClassName(category, profile?.nickname) : ''
  );

  useEffect(() => {
    if (writerUid) preloadWriterSkins([writerUid]);
  }, [writerUid, preloadWriterSkins]);

  useEffect(() => {
    if (!shouldApplyLocal) {
      setLocalClass('');
      return;
    }
    const sync = () => setLocalClass(getEquippedCosmeticClassName(category, profile?.nickname));
    sync();
    window.addEventListener(COSMETIC_CHANGE_EVENT, sync);
    return () => window.removeEventListener(COSMETIC_CHANGE_EVENT, sync);
  }, [shouldApplyLocal, category, profile?.nickname]);

  if (useRemote) {
    return getWriterCosmeticClass(category, writerUid);
  }
  return localClass;
}

export default CosmeticSkinPicker;
