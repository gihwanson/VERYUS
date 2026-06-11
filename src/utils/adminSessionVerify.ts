import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { checkAdminAccess, checkLeaderAccess } from '../components/AdminTypes';
import {
  mergeVeryusUserFromAuth,
  readVeryusUserFromStorage,
  writeVeryusUserToStorage,
  type VeryusUser
} from './veryusUserStorage';

export type AdminVerifyResult = {
  ok: boolean;
  user: VeryusUser | null;
  authUser: FirebaseUser | null;
  /** Firestore/병합 실패 시 true — 클라이언트만 믿지 않고 접근 거부 권장 */
  verificationFailed?: boolean;
};

/**
 * Firebase Auth + users/{uid} 문서로 역할을 확인하고 veryus_user를 최신화합니다.
 * 관리자 라우트·패널은 이 결과의 ok만 신뢰해야 합니다.
 */
function subscribeRoleVerification(
  checkAccess: (user: VeryusUser) => boolean,
  callback: (result: AdminVerifyResult) => void,
  logLabel: string
): () => void {
  return onAuthStateChanged(auth, async (authUser) => {
    if (!authUser) {
      callback({ ok: false, user: null, authUser: null });
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', authUser.uid));
      const data = snap.exists() ? snap.data() : {};
      const previous = readVeryusUserFromStorage();
      const merged = mergeVeryusUserFromAuth(authUser, data as Record<string, unknown>, previous);
      writeVeryusUserToStorage(merged);
      callback({ ok: checkAccess(merged), user: merged, authUser });
    } catch (e) {
      console.error(`${logLabel} 세션 검증 실패:`, e);
      callback({ ok: false, user: null, authUser, verificationFailed: true });
    }
  });
}

export function subscribeAdminVerification(
  callback: (result: AdminVerifyResult) => void
): () => void {
  return subscribeRoleVerification(checkAdminAccess, callback, '관리자');
}

export function subscribeLeaderVerification(
  callback: (result: AdminVerifyResult) => void
): () => void {
  return subscribeRoleVerification(checkLeaderAccess, callback, '리더');
}
