import { signOut } from 'firebase/auth';
import { toast } from 'react-toastify';
import { auth } from '../firebase';
import { removeCurrentPushToken } from './pushNotificationService';

const STORAGE_KEY = 'veryus_user';

/**
 * Firestore users 문서가 없거나 세션 검증에 실패한 계정을 로그아웃 처리합니다.
 * @param showMessage 삭제/만료 안내 토스트 표시 여부 (기본 true)
 */
export async function signOutDeletedAccount(showMessage = true): Promise<void> {
  try {
    await removeCurrentPushToken().catch((err) =>
      console.error('푸시 토큰 정리 실패:', err)
    );
  } catch (error) {
    console.error('푸시 토큰 정리 중 오류:', error);
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('veryus_user 제거 실패:', error);
  }

  try {
    if (auth.currentUser) {
      await signOut(auth);
    }
  } catch (error) {
    console.error('삭제된 계정 로그아웃 실패:', error);
  }

  if (showMessage) {
    toast.info('계정 정보를 찾을 수 없어 로그아웃되었습니다. 다시 로그인해 주세요.');
  }
}
