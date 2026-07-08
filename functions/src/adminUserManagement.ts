import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const SUPER_ADMIN_NICKNAMES = ['너래'];
const LEADER_ROLE = '리더';
const ADMIN_ROLE = '운영진';

const assertAdminAccess = async (callerUid: string): Promise<void> => {
  const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
  if (!callerDoc.exists) {
    throw new HttpsError('permission-denied', '관리자 권한이 없습니다.');
  }

  const data = callerDoc.data() || {};
  const nickname = String(data.nickname || '');
  const role = String(data.role || '');

  if (
    SUPER_ADMIN_NICKNAMES.includes(nickname) ||
    role === LEADER_ROLE ||
    role === ADMIN_ROLE
  ) {
    return;
  }

  throw new HttpsError('permission-denied', '관리자 권한이 없습니다.');
};

/** 관리자 패널에서 사용자 삭제 시 Firebase Auth 계정도 함께 제거 (동일 이메일 재가입 허용) */
export const deleteUserAuthAccount = onCall(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 60
  },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    await assertAdminAccess(callerUid);

    const targetUid = String(request.data?.uid || '').trim();
    if (!targetUid) {
      throw new HttpsError('invalid-argument', '삭제할 사용자 uid가 필요합니다.');
    }

    if (targetUid === callerUid) {
      throw new HttpsError('failed-precondition', '본인 계정은 이 기능으로 삭제할 수 없습니다.');
    }

    try {
      await admin.auth().deleteUser(targetUid);
      logger.info('Firebase Auth 사용자 삭제 완료', { targetUid, callerUid });
      return { ok: true };
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        logger.info('Firebase Auth 사용자 없음(이미 삭제됨)', { targetUid, callerUid });
        return { ok: true, alreadyDeleted: true };
      }

      logger.error('Firebase Auth 사용자 삭제 실패', { targetUid, callerUid, error });
      throw new HttpsError('internal', '로그인 계정 삭제에 실패했습니다.');
    }
  }
);

/**
 * Firestore users에 없는 이메일의 Firebase Auth 잔존 계정을 제거해 재가입을 허용합니다.
 * (관리자 삭제 후 Auth만 남은 경우 등)
 */
export const reclaimEmailForSignup = onCall(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 30
  },
  async (request) => {
    const email = String(request.data?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new HttpsError('invalid-argument', '유효한 이메일이 필요합니다.');
    }

    const usersSnap = await admin
      .firestore()
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!usersSnap.empty) {
      throw new HttpsError(
        'failed-precondition',
        '현재 사용 중인 이메일입니다.'
      );
    }

    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(userRecord.uid);
      logger.info('재가입용 Auth 계정 회수 완료', { email, uid: userRecord.uid });
      return { ok: true, reclaimed: true };
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        return { ok: true, reclaimed: false };
      }
      logger.error('재가입용 Auth 계정 회수 실패', { email, error });
      throw new HttpsError('internal', '이메일 재가입 준비에 실패했습니다.');
    }
  }
);
