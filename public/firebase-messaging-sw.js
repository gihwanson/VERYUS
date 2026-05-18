/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAFnppMjf9K5Cv_ZrrC4PoE_sldORb_HGs',
  authDomain: 'veryusduet.firebaseapp.com',
  projectId: 'veryusduet',
  storageBucket: 'veryusduet.firebasestorage.app',
  messagingSenderId: '966196979262',
  appId: '1:966196979262:web:1d8a73f2d5af425bf7136f'
});

const messaging = firebase.messaging();

/** notificationService.resolveNotificationRoute 와 동일한 규칙 (SW는 TS import 불가) */
const resolvePushRoute = (data) => {
  const raw = data || {};
  const type = String(raw.type || '');
  const postId = String(raw.postId || '');
  const postType = String(raw.postType || '');
  const roomId = String(raw.roomId || '');
  const route = String(raw.route || '');
  const guestbookOwnerUid = String(raw.guestbookOwnerUid || '');

  if (route) {
    if (route === '/anonymous-chat' && roomId) {
      return `/anonymous-chat?roomId=${encodeURIComponent(roomId)}`;
    }
    return route.startsWith('/') ? route : `/${route}`;
  }

  if (type === 'anonymous_chat') {
    return roomId ? `/anonymous-chat?roomId=${encodeURIComponent(roomId)}` : '/anonymous-chat';
  }

  if (type === 'grade_request_pending') {
    return '/admin?tab=approvals';
  }

  if (type === 'approved_song_milestone') {
    return '/hall-of-fame';
  }

  if (type === 'guestbook' || type === 'guestbook_reply') {
    return guestbookOwnerUid ? `/mypage/${guestbookOwnerUid}` : '/mypage';
  }

  if (type === 'partnership' || type === 'partnership_closed' || type === 'partnership_confirmed') {
    return postId ? `/boards/partner/${postId}` : '/boards/partner';
  }

  const postRoutes = {
    free: `/free/${postId}`,
    recording: `/recording/${postId}`,
    evaluation: `/evaluation/${postId}`,
    balance: `/balance/${postId}`,
    partner: `/boards/partner/${postId}`
  };

  if (postId && postType && postRoutes[postType]) {
    return postRoutes[postType];
  }

  if (postId) {
    return `/free/${postId}`;
  }

  return '/notifications';
};

const toAbsoluteAppUrl = (path) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalized, self.location.origin).href;
};

const openAppAtPath = async (targetPath) => {
  const absoluteUrl = toAbsoluteAppUrl(targetPath);
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of clientList) {
    try {
      if (typeof client.navigate === 'function') {
        await client.navigate(absoluteUrl);
        return client.focus();
      }
    } catch (error) {
      console.warn('클라이언트 navigate 실패, openWindow로 대체:', error);
    }
  }

  if (clients.openWindow) {
    return clients.openWindow(absoluteUrl);
  }
};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  // notification 필드가 있으면 브라우저/FCM이 알림을 띄우고, 클릭은 webpush.fcmOptions.link 로 처리된다.
  if (payload.notification) {
    return;
  }
  const title = data.title || 'VERYUS';
  const body = data.body || '새 알림이 도착했습니다.';
  const targetPath = resolvePushRoute(data);
  const notificationType = String(data.type || '');
  const roomId = String(data.roomId || '');
  const tag =
    notificationType === 'anonymous_chat' && roomId
      ? `anonymous-chat-${roomId}`
      : String(data.notificationId || 'veryus');

  return self.registration.showNotification(title, {
    body,
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    data: { ...data, route: targetPath },
    tag,
    renotify: notificationType === 'anonymous_chat'
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetPath = resolvePushRoute(data);

  event.waitUntil(openAppAtPath(targetPath));
});
