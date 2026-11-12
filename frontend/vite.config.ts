import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 开发服务器把 /api 与 /uploads 代理到本地 FastAPI（127.0.0.1:8000），
 * 这样前端不需要填写后端地址，也不会有跨域问题。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
})
