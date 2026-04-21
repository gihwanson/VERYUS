import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
