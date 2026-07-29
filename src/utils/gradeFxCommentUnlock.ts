import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../firebase';
import { NotificationService } from './notificationService';
import {
  getGradeFxSkin,
  isGradeFxUnlockedInStorage,
  setEquippedGradeFxId,
  unlockGradeFxSkin,
  type GradeFxSkinId,
} from './gradeFxSkins';

export const PULSE_GLOW_COMMENT_THRESHOLD = 150;
const PULSE_SKIN_ID: GradeFxSkinId = 'pulse';

const UNLOCK_GUIDE =
  '마이페이지 → 설정 → 등급 특수효과 스킨에서 적용할 수 있어요.';

export async function countUserComments(uid: string): Promise<number> {
  if (!uid) return 0;
  const snap = await getCountFromServer(
    query(collection(db, 'comments'), where('writerUid', '==', uid))
  );
  return snap.data().count;
}

function showPulseGlowUnlockPopup(skinLabel: string) {
  window.alert(
    `✨ ${skinLabel}을 획득했어요!\n\n댓글 ${PULSE_GLOW_COMMENT_THRESHOLD}개 달성을 축하해요.\n${UNLOCK_GUIDE}`
  );
}

/**
 * 댓글 수가 기준 이상이면 펄스 글로우 스킨을 해금하고 팝업·토스트·알림을 보낸다.
 * @returns 이번에 새로 해금했으면 true
 */
export async function maybeUnlockPulseGlowByCommentCount(params: {
  uid: string;
  nickname?: string | null;
}): Promise<boolean> {
  const { uid, nickname } = params;
  if (!uid) return false;
  if (isGradeFxUnlockedInStorage(PULSE_SKIN_ID)) return false;

  try {
    const count = await countUserComments(uid);
    if (count < PULSE_GLOW_COMMENT_THRESHOLD) return false;

    const newlyUnlocked = unlockGradeFxSkin(PULSE_SKIN_ID);
    if (!newlyUnlocked && isGradeFxUnlockedInStorage(PULSE_SKIN_ID)) {
      return false;
    }

    setEquippedGradeFxId(PULSE_SKIN_ID);

    const skin = getGradeFxSkin(PULSE_SKIN_ID);
    const skinLabel = skin?.acquireLabel ?? '펄스 글로우 스킨';
    const message = `✨ ${skinLabel}을 획득했어요! 댓글 ${PULSE_GLOW_COMMENT_THRESHOLD}개 달성. ${UNLOCK_GUIDE}`;

    toast.success(message, {
      autoClose: 5000,
      hideProgressBar: true,
    });
    showPulseGlowUnlockPopup(skinLabel);

    await NotificationService.createNotification({
      type: 'grade_fx_unlock',
      toUid: uid,
      fromNickname: 'VERYUS',
      message,
      route: '/settings',
      postId: `grade-fx-unlock-${PULSE_SKIN_ID}-${uid}`,
      postTitle: skinLabel,
    });

    return true;
  } catch (error) {
    console.error('펄스 글로우 댓글 해금 체크 실패:', error);
    return false;
  }
}
