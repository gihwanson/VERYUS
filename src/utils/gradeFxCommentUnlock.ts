import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { countUserCommentsForUnlock } from './skinUnlockMetrics';
import { syncSkinUnlocksByMetrics } from './skinUnlockService';

export const PULSE_GLOW_COMMENT_THRESHOLD = 150;

/** @deprecated 명예의전당과 동일한 필터를 쓰려면 countUserCommentsForUnlock 사용 */
export async function countUserComments(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    return await countUserCommentsForUnlock(uid);
  } catch {
    const snap = await getCountFromServer(
      query(collection(db, 'comments'), where('writerUid', '==', uid))
    );
    return snap.data().count;
  }
}

/**
 * 댓글 수 등 조건 기반 스킨 해금 동기화 (펄스 글로우 포함).
 * @returns 이번에 새로 해금한 항목이 있으면 true
 */
export async function maybeUnlockPulseGlowByCommentCount(params: {
  uid: string;
  nickname?: string | null;
}): Promise<boolean> {
  const { uid, nickname } = params;
  if (!uid) return false;
  try {
    const result = await syncSkinUnlocksByMetrics({ uid, nickname, notify: true });
    return result.unlocked.length > 0;
  } catch (error) {
    console.error('스킨 해금 체크 실패:', error);
    return false;
  }
}
