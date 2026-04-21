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

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

messaging.onBackgroundMessage((payload) => {
  // 서버 메시지에 notification 필드가 있으면 브라우저/FCM이 이미 알림을 띄우는 경우가 많아
  // 여기서 showNotification을 또 호출하면 동일 알림이 2번 뜰 수 있다.
  if (payload.notification) {
    return;
  }
  const title = payload.data?.title || 'VERYUS';
  const options = {
    body: payload.data?.body || '새 알림이 도착했습니다.',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification?.data?.route || '/notifications';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          const nextUrl = `${clientUrl.origin}${targetPath}`;
          if ('focus' in client) {
            client.navigate(nextUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetPath);
      })
  );
});
