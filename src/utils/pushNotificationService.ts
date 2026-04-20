import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type { Token, ActionPerformed, PermissionStatus } from '@capacitor/push-notifications';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { toast } from 'react-toastify';
import app, { db } from '../firebase';
import { NotificationService } from './notificationService';

let initialized = false;
let initializedForUid: string | null = null;
let activeUid: string | null = null;
let currentTokenDocId: string | null = null;
let webForegroundListenerAttached = false;

const getTokenDocId = (token: string) => encodeURIComponent(token);
const WEB_PUSH_VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const DEVICE_KEY_STORAGE_KEY = 'veryus_push_device_key';
const NATIVE_CHANNEL_ID = 'veryus-notifications';

const getWebPlatform = (): string => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'web-ios';
  if (ua.includes('android')) return 'web-android';
  return 'web';
};

const getDeviceKey = (platform: string): string => {
  if (platform.startsWith('web-')) {
    let key = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
    if (!key) {
      key = `${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY_STORAGE_KEY, key);
    }
    return key;
  }
  return `native-${platform}`;
};

const savePushToken = async (uid: string, token: string, platform: string) => {
  const tokenDocId = getTokenDocId(token);
  const deviceKey = getDeviceKey(platform);
  currentTokenDocId = tokenDocId;
  await setDoc(
    doc(db, 'users', uid, 'pushTokens', tokenDocId),
    {
      token,
      platform,
      deviceKey,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    },
    { merge: true }
  );

  // 같은 기기에서 발급된 이전 토큰 정리 (중복 푸시 방지)
  const sameDeviceSnap = await getDocs(
    query(
      collection(db, 'users', uid, 'pushTokens'),
      where('deviceKey', '==', deviceKey)
    )
  );

  await Promise.all(
    sameDeviceSnap.docs
      .filter((tokenDoc) => tokenDoc.id !== tokenDocId)
      .map((tokenDoc) => deleteDoc(tokenDoc.ref).catch(() => undefined))
  );
};

export const removeCurrentPushToken = async () => {
  try {
    if (activeUid && currentTokenDocId) {
      await deleteDoc(doc(db, 'users', activeUid, 'pushTokens', currentTokenDocId));
    }
  } catch (error) {
    console.error('푸시 토큰 제거 실패:', error);
  } finally {
    activeUid = null;
    currentTokenDocId = null;
    initialized = false;
    initializedForUid = null;
  }
};

export const removeAllPushTokens = async (uid: string) => {
  if (!uid) return;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'pushTokens'));
    await Promise.all(snap.docs.map((tokenDoc) => deleteDoc(tokenDoc.ref).catch(() => undefined)));
  } catch (error) {
    console.error('전체 푸시 토큰 제거 실패:', error);
  } finally {
    if (activeUid === uid) {
      currentTokenDocId = null;
    }
  }
};

const handlePushRoute = (postType?: string, postId?: string, route?: string) => {
  if (route) {
    window.location.href = route;
    return;
  }
  if (!postType || !postId) return;
  const routes: Record<string, string> = {
    free: `/free/${postId}`,
    recording: `/recording/${postId}`,
    evaluation: `/evaluation/${postId}`,
    balance: `/balance/${postId}`,
    partner: `/boards/partner/${postId}`
  };
  const target = routes[postType];
  if (target) window.location.href = target;
};

const showForegroundPushToast = (params: {
  title?: string;
  body?: string;
  route?: string;
  postType?: string;
  postId?: string;
}) => {
  const route =
    params.route ||
    (params.postType && params.postId
      ? NotificationService.getRouteByPostType(params.postType, params.postId)
      : undefined);
  const message = params.body?.trim() || '새 알림이 도착했습니다.';
  const title = params.title?.trim() || 'VERYUS';
  toast.info(`${title}\n${message}`, {
    autoClose: 4500,
    onClick: () => {
      if (!route) return;
      window.location.href = route;
    }
  });
};

const registerNativePush = async (uid: string, permission?: PermissionStatus) => {
  let permStatus = permission ?? (await PushNotifications.checkPermissions());
  if (permStatus.receive !== 'granted') {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== 'granted') {
    throw new Error('native-permission-denied');
  }

  await PushNotifications.createChannel({
    id: NATIVE_CHANNEL_ID,
    name: 'VERYUS 알림',
    description: '댓글, 답글, 게시글 관련 알림',
    importance: 5,
    visibility: 1
  }).catch(() => undefined);

  await PushNotifications.register();

  PushNotifications.removeAllListeners();
  PushNotifications.addListener('registration', async (token: Token) => {
    if (!activeUid) return;
    await savePushToken(activeUid, token.value, Capacitor.getPlatform());
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('푸시 등록 실패:', error);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('푸시 수신:', notification);
    showForegroundPushToast({
      title: notification.title,
      body: notification.body,
      route: notification.data?.route,
      postType: notification.data?.postType,
      postId: notification.data?.postId
    });
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const postType = action.notification.data?.postType;
    const postId = action.notification.data?.postId;
    const route = action.notification.data?.route;
    handlePushRoute(postType, postId, route);
  });
};

const registerWebPush = async (uid: string, forcePermissionRequest: boolean): Promise<boolean> => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  if (!window.isSecureContext) return false;
  if (!WEB_PUSH_VAPID_KEY) {
    throw new Error('missing-web-vapid-key');
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return false;

  let permission = Notification.permission;
  if (permission !== 'granted' && forcePermissionRequest) {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    if (forcePermissionRequest) throw new Error('web-permission-denied');
    return false;
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: WEB_PUSH_VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  if (!token) return false;
  await savePushToken(uid, token, getWebPlatform());

  if (!webForegroundListenerAttached) {
    onMessage(messaging, (payload) => {
      console.log('웹 포그라운드 푸시 수신:', payload);
      showForegroundPushToast({
        title: payload.notification?.title || payload.data?.title,
        body: payload.notification?.body || payload.data?.body,
        route: payload.data?.route,
        postType: payload.data?.postType,
        postId: payload.data?.postId
      });
    });
    webForegroundListenerAttached = true;
  }
  return true;
};

export const initPushNotifications = async (uid: string) => {
  if (!uid) return;

  activeUid = uid;
  if (initializedForUid === uid) return;

  try {
    if (Capacitor.isNativePlatform()) {
      await registerNativePush(uid);
      initialized = true;
      initializedForUid = uid;
    } else {
      const registered = await registerWebPush(uid, false);
      if (registered) {
        initialized = true;
        initializedForUid = uid;
      }
    }
  } catch (error) {
    console.error('푸시 초기화 실패:', error);
  }
};

export const enablePushNotifications = async (uid: string) => {
  if (!uid) return false;
  activeUid = uid;
  try {
    if (Capacitor.isNativePlatform()) {
      await registerNativePush(uid);
    } else {
      // iOS/Android PWA에서 권한 허용 체감 속도를 위해
      // 권한 승인 직후 true를 반환하고 토큰 등록은 비동기로 이어간다.
      if (!('Notification' in window)) return false;
      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return false;

      const registered = await registerWebPush(uid, false);
      if (!registered) return false;
    }
    initialized = true;
    initializedForUid = uid;
    return true;
  } catch (error) {
    console.error('푸시 권한 활성화 실패:', error);
    return false;
  }
};
