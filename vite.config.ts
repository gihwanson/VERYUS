import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 모든 네트워크 인터페이스에서 접근 허용
    port: 5173,
    strictPort: true, // 포트가 사용 중일 경우 실패
    hmr: {
      timeout: 5000 // WebSocket 연결 타임아웃 증가
    }
  },
  define: {
    'process.env.VITE_APP_TITLE': JSON.stringify('VERYUS')
  }
})
