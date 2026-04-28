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

const hasPushRoutingHints = (data?: Record<string, string | undefined> | null): boolean => {
  if (!data) return false;
  return Boolean(
    (data.route && String(data.route).trim()) ||
      (data.type && String(data.type).trim()) ||
      (data.roomId && String(data.roomId).trim()) ||
      (data.postId && String(data.postId).trim()) ||
      (data.postType && String(data.postType).trim()) ||
      (data.guestbookOwnerUid && String(data.guestbookOwnerUid).trim())
  );
};

/** 네이티브/웹 푸시 data — route 필드가 OS에서 비어도 type·roomId 등으로 복구 */
const navigateFromPushData = (data?: Record<string, string | undefined> | null) => {
  if (!hasPushRoutingHints(data)) return;

  const target = NotificationService.resolveNotificationRoute({
    type: data?.type,
    postId: data?.postId,
    postType: data?.postType,
    route: data?.route,
    roomId: data?.roomId,
    guestbookOwnerUid: data?.guestbookOwnerUid
  });

  if (!target) return;

  if (target.startsWith('http://') || target.startsWith('https://')) {
    try {
      const next = new URL(target);
      if (next.origin === window.location.origin) {
        window.location.assign(`${next.pathname}${next.search}${next.hash}`);
        return;
      }
    } catch {
      return;
    }
  }

  window.location.assign(target);
};

const showForegroundPushToast = (params: {
  title?: string;
  body?: string;
  data?: Record<string, string | undefined> | null;
  route?: string;
  postType?: string;
  postId?: string;
}) => {
  const legacyRoute =
    (params.route && String(params.route).trim() ? String(params.route) : undefined) ||
    (params.postType && params.postId
      ? NotificationService.getRouteByPostType(params.postType, params.postId)
      : undefined);
  const message = params.body?.trim() || '새 알림이 도착했습니다.';
  const title = params.title?.trim() || 'VERYUS';
  toast.info(`${title}\n${message}`, {
    autoClose: 4500,
    onClick: () => {
      if (params.data && hasPushRoutingHints(params.data)) {
        navigateFromPushData(params.data);
        return;
      }
      if (legacyRoute) window.location.assign(legacyRoute);
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
    const d = (notification.data || {}) as Record<string, string | undefined>;
    showForegroundPushToast({
      title: notification.title,
      body: notification.body,
      data: d,
      route: d?.route,
      postType: d?.postType,
      postId: d?.postId
    });
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const d = (action.notification.data || {}) as Record<string, string | undefined>;
    navigateFromPushData(d);
  });
};

const registerWebPush = async (uid: string, forcePermissionRequest: boolean): Promise<boolean> => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  if (!window.isSecureContext) return false;

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
  const tokenOptions: { vapidKey?: string; serviceWorkerRegistration: ServiceWorkerRegistration } = {
    serviceWorkerRegistration: registration
  };
  if (WEB_PUSH_VAPID_KEY?.trim()) {
    tokenOptions.vapidKey = WEB_PUSH_VAPID_KEY.trim();
  } else {
    // 환경변수 누락 시에도 Firebase 프로젝트 기본 Web Push 인증서로 등록을 시도한다.
    console.warn('VITE_FIREBASE_VAPID_KEY가 없어 기본 Web Push 키로 토큰 등록을 시도합니다.');
  }
  const token = await getToken(messaging, tokenOptions);

  if (!token) return false;
  await savePushToken(uid, token, getWebPlatform());

  if (!webForegroundListenerAttached) {
    onMessage(messaging, (payload) => {
      console.log('웹 포그라운드 푸시 수신:', payload);
      const d = (payload.data || {}) as Record<string, string | undefined>;
      showForegroundPushToast({
        title: payload.notification?.title || payload.data?.title,
        body: payload.notification?.body || payload.data?.body,
        data: d,
        route: d?.route,
        postType: d?.postType,
        postId: d?.postId
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
