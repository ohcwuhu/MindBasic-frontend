/* 知心同行 · 演示站的开发服务器（只为「前后端联调」用）

   演示站是一堆静态 .html，本来 `python -m http.server` 就够；但接真后端时，
   页面里的请求走的是**同源相对路径**（原前端那套：`/api/v1/...` 与 `/socket.io`），
   所以需要一个把这两条转发到后端（默认 127.0.0.1:8000）的服务器 ——
   和原前端 `MindBasic-frontend/vite.config.ts` 里的 `server.proxy` 是同一件事。

   启动：  cd frontend_hand/demo
           node node_modules/vite/bin/vite.js --config vite.config.mjs
           → http://127.0.0.1:5178/

   不接后端时（只想看演示数据），照旧用 `python -m http.server 5178` 或直接双击 .html。 */

import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

const BACKEND = process.env.FEISI_BACKEND || 'http://127.0.0.1:8000'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      /* socket.io 握手时后端会校验 Origin（后端 `.env` 的 CORS_ORIGINS 里是前端原来的 5173）。
         演示站跑在 5178，所以这里把握手的 Origin 重写成后端认的值 —— 只动代理转发出去的那个头，
         不用改后端配置，浏览器侧仍然是同源。 */
      '/socket.io': {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          const rewriteOrigin = (proxyReq) => {
            try {
              proxyReq.setHeader('origin', 'http://127.0.0.1:5173')
            } catch {
              /* 头已经发出去了就当没这回事 */
            }
          }
          proxy.on('proxyReq', rewriteOrigin)
          proxy.on('proxyReqWs', rewriteOrigin)
        },
      },
    },
  },
  // 演示站里那些 .js 是普通脚本（不是 ESM 模块），别让 Vite 去改写它们
  optimizeDeps: { noDiscovery: true },
})
