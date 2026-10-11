/* 斐思同行 · 自我教练页的构建

   这一页不再手抄原前端的 DOM：原项目
   `项目主体/项目代码/MindBasic-frontend/src` 里的 `VideoCallView.vue` +
   `components/ai-lab/VideoCallPanel.vue` + `CompanionSprite.vue` 被**直接**引进来编译，
   组件、模板、状态机、socket 协议、样式都是项目里跑的那一份 —— 这一页只做两件事：
   换画风（`../styles/self-coaching.css` 覆盖配色与纸面）和换背景图。

   两处「没有后端就没有的东西」用本地替身顶上（见 shims/，接后端时删掉 alias 即可）：
     · shims/api-client.js        —— `/platform/config`、对话总结、情绪日记那些调用的返回
     · shims/vue-router.js        —— RouterLink / router.push 映射到本站的 .html
   `socket.io-client`**不再有替身**：这一页始终用真的 socket.io-client（连不上后端时就如实显示
   「服务未连接」，不再有本地假服务端替它演戏）。
   另外 shims/audio-upload.js 把「上传录音」这个接口在页内接住。

   两个入口（IIFE 不支持多入口，所以跑两遍）：
     自我教练   node node_modules/vite/bin/vite.js build
                → ../scripts/self-coaching-app.js（IIFE，双击 file:// 也能跑）+ 同名 .css
     情绪日记   $env:FEISI_APP="journal"; node node_modules/vite/bin/vite.js build
                → ../scripts/emotion-journal-app.js + 同名 .css */

import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const ORIGINAL = fileURLToPath(new URL('../../../项目代码/MindBasic-frontend', import.meta.url))
const SHIMS = fileURLToPath(new URL('./shims', import.meta.url))

/** 两个页面各自一个入口，各自一份 IIFE 产物 */
const APPS = {
  coach: { entry: './main.js', file: 'self-coaching-app.js', name: 'FeisiSelfCoaching' },
  journal: { entry: './journal-main.js', file: 'emotion-journal-app.js', name: 'FeisiEmotionJournal' },
}
const app = APPS[process.env.FEISI_APP] ?? APPS.coach

export default defineConfig({
  plugins: [vue()],
  /* 页面侧没有 Node 的 process，把依赖里那几个环境判断钉成生产值 */
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: {
    alias: [
      { find: '@/api/client', replacement: `${SHIMS}/api-client.js` },
      { find: 'vue-router', replacement: `${SHIMS}/vue-router.js` },
      { find: '@/', replacement: `${ORIGINAL}/src/` },
    ],
  },
  build: {
    outDir: '../scripts',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL(app.entry, import.meta.url)),
      name: app.name,
      formats: ['iife'],
      fileName: () => app.file,
      cssFileName: app.file.replace(/\.js$/, ''),
    },
  },
})
