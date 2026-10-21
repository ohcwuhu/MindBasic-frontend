/* 自我教练页的入口 —— 原前端的 VideoCallView 原样挂到页面上的 #app 里。 */

import { createApp } from 'vue'

import VideoCallView from '@/views/VideoCallView.vue'

import { installAudioUploadStandIn } from './shims/audio-upload.js'
import RouterStandIn from './shims/vue-router.js'

/* 浏览器里没有 Node 的 process；依赖里零星的 process.env.X 读取兜一下 */
window.process = window.process || { env: { NODE_ENV: 'production' } }

/* 本地演示没有后端，录音上传那一步在页内接住（见 shims/audio-upload.js） */
installAudioUploadStandIn()

createApp(VideoCallView).use(RouterStandIn).mount('#app')

window.addEventListener('mb:logout', function () {
  if (window.FeisiAPI && window.FeisiAPI.expireSession) window.FeisiAPI.expireSession()
})
