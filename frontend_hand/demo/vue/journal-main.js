/* 情绪日记页的入口 —— 原前端的 EmotionJournalView 原样挂到页面上的 #app 里。 */

import { createApp } from 'vue'

import EmotionJournalView from '@/views/EmotionJournalView.vue'

import RouterStandIn from './shims/vue-router.js'

createApp(EmotionJournalView).use(RouterStandIn).mount('#app')

window.addEventListener('mb:logout', function () {
  if (window.FeisiAPI && window.FeisiAPI.expireSession) window.FeisiAPI.expireSession()
})
