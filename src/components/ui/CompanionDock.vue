<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCompanion } from '@/composables/useCompanion'

// ================================================================
//  CompanionDock — 右下角悬浮陪伴坞
//  · 整个小方块就是交互区：点击展开快捷操作
//  · 显示当前性别的小人卡通形象（透明背景 PNG）
//  · 快捷入口：AI 对话 / 视频通话 / 性别切换
//  · 玻璃拟态 + 呼吸微动 + hover 光晕放大
// ================================================================

const router = useRouter()
const { gender } = useCompanion()
const open = ref(false)

const avatarUrl = computed(() =>
  gender.value === 'girl' ? '/companion/girl.png' : '/companion/boy.png',
)

/** 点击头像切换菜单 */
function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}

function goChat() {
  router.push('/ai-chat')
  close()
}
function goVideo() {
  router.push('/video-call')
  close()
}

/** 点击外部关闭 */
function onBgClick(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('.dock-inner')) return
  close()
}
</script>

<template>
  <!-- 遮罩层（仅展开时显示，点击外部收起） -->
  <Teleport to="body">
    <div
      v-if="open"
      class="dock-backdrop"
      @click="onBgClick"
    />
  </Teleport>

  <aside class="companion-dock" :class="{ open }" aria-label="陪伴助手">
    <div class="dock-inner">
      <!-- 主按钮：卡通小人头像 -->
      <button
        class="dock-avatar"
        :aria-label="`陪伴助手 - ${gender === 'girl' ? '小女孩' : '小男孩'}`"
        @click="toggle"
      >
        <img :src="avatarUrl" alt="" class="avatar-img" draggable="false" />
        <!-- 呼吸光环 -->
        <span class="avatar-glow" />
      </button>

      <!-- 展开菜单 -->
      <Transition name="menu-slide">
        <div v-if="open" class="dock-menu">
          <button class="dock-btn chat-btn" @click="goChat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span>AI 对话</span>
          </button>
          <button class="dock-btn video-btn" @click="goVideo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            <span>视频通话</span>
          </button>

        </div>
      </Transition>
    </div>
  </aside>
</template>

<style scoped>
/* ===== 容器 ===== */
.companion-dock {
  position: fixed;
  right: 16px;
  bottom: 80px;           /* 移动端在底部导航上方 */
  z-index: 50;
}
@media (min-width: 768px) {
  .companion-dock {
    right: 24px;
    bottom: 24px;
  }
}

.dock-inner {
  position: relative;
}

/* ===== 头像主按钮 ===== */
.dock-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 68px;
  height: 68px;
  border-radius: 22px;
  border: 1.5px solid rgba(255,255,255,.55);
  background: rgba(250, 248, 255, .78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow:
    0 4px 18px rgba(107, 91, 149, .14),
    0 1px 4px rgba(0,0,0,.06);
  cursor: pointer;
  overflow: hidden;
  transition: transform .28s ease, box-shadow .28s ease;
}
.dock-avatar:hover {
  transform: scale(1.08) translateY(-2px);
  box-shadow:
    0 8px 28px rgba(107, 91, 149, .22),
    0 2px 8px rgba(0,0,0,.08);
}
.dock-avatar:active {
  transform: scale(.96);
}

.avatar-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  pointer-events: none;
  filter: drop-shadow(0 2px 6px rgba(107,91,149,.12));
}

/* 呼吸光环 */
.avatar-glow {
  position: absolute;
  inset: -4px;
  border-radius: 26px;
  background: radial-gradient(circle at 50% 45%, rgba(169,156,224,.35), transparent 70%);
  opacity: 0;
  animation: glow-pulse 3.2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes glow-pulse {
  0%, 100% { opacity: .35; transform: scale(1); }
  50% { opacity: .7; transform: scale(1.06); }
}

/* 整体轻微浮动 */
.dock-avatar {
  animation: dock-float 4.5s ease-in-out infinite;
}
@keyframes dock-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.dock-avatar:hover {
  animation: none; /* hover 时停止浮动 */
}

/* ===== 展开菜单 ===== */
.dock-menu {
  position: absolute;
  right: 0;
  bottom: 76px;             /* 在头像正上方 */
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
  padding: 10px;
  border-radius: 18px;
  border: 1.5px solid rgba(255,255,255,.5);
  background: rgba(252, 250, 255, .88);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 8px 32px rgba(107, 91, 149, .18), 0 2px 8px rgba(0,0,0,.06);
  transform-origin: bottom right;
}

.dock-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 11px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  color: #4a4063;
  background: transparent;
  transition: background .2s ease, transform .15s ease;
}
.dock-btn svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  opacity: .65;
}
.dock-btn:hover {
  background: rgba(107, 91, 149, .08);
  transform: translateX(2px);
}
.dock-btn:hover svg {
  opacity: 1;
}
.chat-btn:hover { color: #8b6bb5; }
.video-btn:hover { color: #6b9ac4; }

/* ===== 遮罩层 ===== */
.dock-backdrop {
  position: fixed;
  inset: 0;
  z-index: 49;
}

/* ===== 过渡动画 ===== */
.menu-slide-enter-active,
.menu-slide-leave-active {
  transition: all .25s cubic-bezier(.34, 1.56, .64, 1);
}
.menu-slide-enter-from,
.menu-slide-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(.92);
}
</style>
