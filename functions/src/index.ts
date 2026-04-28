import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

admin.initializeApp();
const WEB_APP_ORIGIN = 'https://veryusduet.web.app';

const getRouteByPostType = (postType: string, postId: string): string => {
  const routes: Record<string, string> = {
    free: `/free/${postId}`,
    recording: `/recording/${postId}`,
    evaluation: `/evaluation/${postId}`,
    balance: `/balance/${postId}`,
    partner: `/boards/partner/${postId}`
  };
  return routes[postType] || '/notifications';
};

const getNotificationRoute = (data: FirebaseFirestore.DocumentData): string => {
  const roomId = (data.roomId as string | undefined) || '';
  const directRoute = (data.route as string | undefined) || '';
  if (directRoute) {
    if (directRoute === '/anonymous-chat' && roomId) {
      return `/anonymous-chat?roomId=${encodeURIComponent(roomId)}`;
    }
    return directRoute;
  }

  const postId = (data.postId as string | undefined) || '';
  const postType = (data.postType as string | undefined) || '';
  const notificationType = (data.type as string | undefined) || '';

  if (notificationType === 'grade_request_pending') {
    return '/admin?tab=approvals';
  }

  if (notificationType === 'guestbook' || notificationType === 'guestbook_reply') {
    const ownerUid = (data.guestbookOwnerUid as string | undefined) || '';
    return ownerUid ? `/mypage/${ownerUid}` : '/mypage';
  }

  if (
    notificationType === 'partnership' ||
    notificationType === 'partnership_closed' ||
    notificationType === 'partnership_confirmed'
  ) {
    return postId ? `/boards/partner/${postId}` : '/boards/partner';
  }

  if (notificationType === 'anonymous_chat') {
    return roomId ? `/anonymous-chat?roomId=${encodeURIComponent(roomId)}` : '/anonymous-chat';
  }

  if (postId) {
    return getRouteByPostType(postType, postId);
  }

  return '/notifications';
};

export const sendPushOnNotificationCreated = onDocumentCreated(
  {
    document: 'notifications/{notificationId}',
    region: 'asia-northeast3'
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const toUid = data.toUid as string | undefined;
    if (!toUid) return;
    logger.info('푸시 처리 시작', {
      notificationId: snapshot.id,
      eventId: event.id,
      toUid
    });
    const notificationRef = admin.firestore().collection('notifications').doc(snapshot.id);
    const userRef = admin.firestore().collection('users').doc(toUid);

    const userSnap = await userRef.get();
    const notificationsEnabled = userSnap.exists ? userSnap.data()?.notificationsEnabled : undefined;
    if (notificationsEnabled === false) {
      logger.info('사용자 알림 비활성 상태로 푸시 스킵', { toUid });
      await notificationRef.set(
        {
          pushDispatchEventId: admin.firestore.FieldValue.delete(),
          pushDispatchLockUntil: admin.firestore.FieldValue.delete()
        },
        { merge: true }
      );
      return;
    }

    // Firestore 트리거는 at-least-once 전달이라 중복 실행을 잠금으로 방지한다.
    const lockAcquired = await admin.firestore().runTransaction(async (tx) => {
      const freshDoc = await tx.get(notificationRef);
      if (!freshDoc.exists) return false;

      const freshData = freshDoc.data() || {};
      const now = Date.now();
      const lockUntil = freshData.pushDispatchLockUntil?.toMillis?.() || 0;

      if (freshData.lastPushEventId === event.id || freshData.pushDelivered === true) {
        return false;
      }
      if (lockUntil > now && freshData.pushDispatchEventId !== event.id) {
        return false;
      }

      tx.set(
        notificationRef,
        {
          pushDispatchEventId: event.id,
          pushDispatchLockUntil: admin.firestore.Timestamp.fromMillis(now + 60_000),
          pushDispatchUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      return true;
    });

    if (!lockAcquired) {
      logger.info('중복 푸시 전송 스킵', { notificationId: snapshot.id, eventId: event.id });
      return;
    }

    const releasePushDispatchLock = async () => {
      await notificationRef.set(
        {
          pushDispatchEventId: admin.firestore.FieldValue.delete(),
          pushDispatchLockUntil: admin.firestore.FieldValue.delete()
        },
        { merge: true }
      );
    };

    const tokenSnap = await admin
      .firestore()
      .collection('users')
      .doc(toUid)
      .collection('pushTokens')
      .get();

    if (tokenSnap.empty) {
      logger.info('푸시 토큰 없음', { toUid });
      await releasePushDispatchLock();
      return;
    }

    const tokens = Array.from(
      new Set(
        tokenSnap.docs
          .map((doc) => doc.data().token as string | undefined)
          .filter((token): token is string => !!token)
      )
    );

    if (tokens.length === 0) {
      await releasePushDispatchLock();
      return;
    }

    const postId = (data.postId as string | undefined) || '';
    const postType = (data.postType as string | undefined) || '';
    const notificationType = (data.type as string | undefined) || '';
    const roomId = (data.roomId as string | undefined) || '';
    const route = getNotificationRoute(data);
    const absoluteRoute = `${WEB_APP_ORIGIN}${route}`;
    const chatRoomTag = roomId ? `anonymous-chat-${roomId}` : '';

    const payload: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: data.postTitle ? `VERYUS - ${data.postTitle}` : 'VERYUS',
        body: (data.message as string) || '새 알림이 도착했습니다.'
      },
      data: {
        postId,
        postType,
        type: notificationType,
        roomId,
        route,
        notificationId: snapshot.id
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'veryus-notifications',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          tag: notificationType === 'anonymous_chat' ? chatRoomTag : undefined
        }
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        fcmOptions: {
          link: absoluteRoute
        },
        notification: {
          icon: '/apple-touch-icon.png',
          badge: '/apple-touch-icon.png',
          tag: notificationType === 'anonymous_chat' ? chatRoomTag : undefined,
          renotify: notificationType === 'anonymous_chat'
        }
      }
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(payload);
      logger.info('푸시 전송 결과', {
        notificationId: snapshot.id,
        toUid,
        tokenCount: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount
      });

      if (response.failureCount > 0) {
        const invalidTokenDocIds: string[] = [];
        response.responses.forEach((result, index) => {
          if (result.success) return;
          const code = result.error?.code || '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            const token = tokens[index];
            invalidTokenDocIds.push(encodeURIComponent(token));
          }
        });

        await Promise.all(
          invalidTokenDocIds.map((tokenDocId) =>
            admin
              .firestore()
              .collection('users')
              .doc(toUid)
              .collection('pushTokens')
              .doc(tokenDocId)
              .delete()
              .catch(() => undefined)
          )
        );
      }

      // 전부 실패면 delivered로 찍지 않고 잠금만 해제해 재시도 가능하게 한다.
      if (response.successCount === 0) {
        await notificationRef.set(
          {
            lastPushError: `all-failed failureCount=${response.failureCount}`,
            lastPushAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
            pushDispatchEventId: admin.firestore.FieldValue.delete(),
            pushDispatchLockUntil: admin.firestore.FieldValue.delete()
          },
          { merge: true }
        );
        return;
      }

      await notificationRef.set(
        {
          pushDelivered: true,
          pushDeliveredAt: admin.firestore.FieldValue.serverTimestamp(),
          lastPushEventId: event.id,
          pushDispatchEventId: admin.firestore.FieldValue.delete(),
          pushDispatchLockUntil: admin.firestore.FieldValue.delete()
        },
        { merge: true }
      );
    } catch (err) {
      logger.error('푸시 전송 중 예외', err as Error);
      await releasePushDispatchLock();
    }
  }
);
