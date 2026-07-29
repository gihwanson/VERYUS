import React, { useEffect, useState } from 'react';
import { useCosmeticSkinsContext } from '../contexts/CosmeticSkinsContext';
import { useUserProfile } from '../contexts/UserProfileContext';
import { getGradeEmoji, getGradeName } from '../utils/gradeDisplay';
import {
  GRADE_FX_CHANGE_EVENT,
  getEquippedGradeFxClassName,
} from '../utils/gradeFxSkins';
import GradeFxSparkleDust from './GradeFxSparkleDust';
import '../styles/gradeFx.css';

function nicknamesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface GradeFxEmojiProps {
  grade: string | null | undefined;
  /** 작성자 uid — 있으면 모든 열람자에게 해당 유저 장착 FX 표시 */
  writerUid?: string | null;
  /** 작성자 닉네임 — uid 없을 때 본인 매칭용 */
  writerNickname?: string | null;
  /** true면 작성자 비교 없이 장착 FX 강제 적용 (마이페이지 본인 등) */
  applyEquippedFx?: boolean;
  /** 익명 등 FX를 숨길 때 */
  suppressFx?: boolean;
  variant?: 'default' | 'balance';
  className?: string;
}

const GradeFxEmoji: React.FC<GradeFxEmojiProps> = ({
  grade,
  writerUid,
  writerNickname,
  applyEquippedFx = false,
  suppressFx = false,
  variant = 'default',
  className,
}) => {
  const { profile } = useUserProfile();
  const { getWriterGradeFxClass, preloadWriterSkins } = useCosmeticSkinsContext();
  const uid = writerUid?.trim() || '';
  const baseClass =
    className ?? (variant === 'balance' ? 'balance-post-author-grade' : 'author-grade-emoji');

  const useRemote = !suppressFx && Boolean(uid) && !applyEquippedFx;
  const shouldApplyLocal =
    !suppressFx &&
    (applyEquippedFx || (!uid && nicknamesMatch(writerNickname, profile?.nickname)));

  const [localFxClass, setLocalFxClass] = useState(() =>
    shouldApplyLocal ? getEquippedGradeFxClassName(profile?.nickname) : ''
  );

  useEffect(() => {
    if (uid) preloadWriterSkins([uid]);
  }, [uid, preloadWriterSkins]);

  useEffect(() => {
    if (!shouldApplyLocal) {
      setLocalFxClass('');
      return;
    }
    const sync = () => setLocalFxClass(getEquippedGradeFxClassName(profile?.nickname));
    sync();
    window.addEventListener(GRADE_FX_CHANGE_EVENT, sync);
    return () => window.removeEventListener(GRADE_FX_CHANGE_EVENT, sync);
  }, [shouldApplyLocal, profile?.nickname]);

  const fxClass = useRemote ? getWriterGradeFxClass(uid) : localFxClass;
  const emoji = getGradeEmoji(grade);
  const title = getGradeName(grade);
  const classes = [baseClass, fxClass].filter(Boolean).join(' ');
  const showSparkleDust = fxClass.includes('grade-fx--sparkle');

  return (
    <span className={classes} title={title}>
      {showSparkleDust && <GradeFxSparkleDust />}
      {emoji}
    </span>
  );
};

export default GradeFxEmoji;
