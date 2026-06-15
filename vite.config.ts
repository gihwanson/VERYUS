import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // main.tsx에서 registerSW로 등록
      injectRegister: null,
      includeAssets: [
        'cherry-favicon.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'veryus_logo-01.png'
      ],
      manifest: {
        name: 'VERYUS',
        short_name: 'VERYUS',
        description:
          '음악인들을 위한 자유로운 소통, 파트너 구인, 녹음 공유, 콘테스트까지! VERYUS에서 함께하세요.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#9fb3c8',
        theme_color: '#9fb3c8',
        lang: 'ko',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,webp,woff2,webmanifest,mp3}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tonejs\.github\.io\/audio\/salamander\/.+\.mp3$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'piano-samples-cdn',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    })
  ],
  build: {
    // 모바일 Safari/PWA에서 CSS 청크 캐시 불일치로 preload 실패가 날 수 있어
    // CSS를 단일 번들로 묶어 진입 안정성을 높인다.
    cssCodeSplit: false
  },
  server: {
    host: true, // 모든 네트워크 인터페이스에서 접근 허용
    port: 5173,
    strictPort: true, // 포트가 사용 중일 경우 실패
    hmr: {
      timeout: 5000 // WebSocket 연결 타임아웃 증가
    }
  },
  define: {
    'process.env.VITE_APP_TITLE': JSON.stringify('VERYUS'),
    __APP_BUILD__: JSON.stringify(new Date().toISOString())
  }
})
