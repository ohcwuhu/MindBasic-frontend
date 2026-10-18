import { existsSync } from 'node:fs'

// 支持本地并列目录，以及 GitHub 分支中 frontend_hand 位于原前端内部的布局。
export const originalRoot = [
  new URL('../../../MindBasic-frontend/', import.meta.url),
  new URL('../../../', import.meta.url),
].find(root => existsSync(new URL('src/api/client.ts', root)))

if (!originalRoot) throw new Error('找不到共享的 MindBasic-frontend/src，请保留原前端源码。')
