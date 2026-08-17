# MindBasic 前端（Web）

心理教练成长服务平台（MindBasic）的响应式 Web 前端：移动端优先、桌面可用，
覆盖用户端自助工具、教练端工作台、管理后台，以及内嵌的 **AI 实验室**
（实时表情识别、语音转文字、AI 心理教练对话）。

后端仓库：`MindBasic-backend`（FastAPI，开发地址 `http://127.0.0.1:8000`）。

## 技术栈

| 组件 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Vue 3（Composition API） | `<script setup>` |
| 构建 | Vite 6 | 开发服务器 + 产物构建 |
| 语言 | TypeScript | `vue-tsc --noEmit` 类型检查 |
| 样式 | Tailwind CSS v4 | `@theme` 设计令牌 + 少量全局工具类 |
| 状态 | Pinia | auth store（登录态/用户信息） |
| 路由 | Vue Router 4 | 鉴权守卫 + 页面级懒加载 |
| HTTP | axios | 统一封装、Token 注入、401 自动刷新 |
| 实时通信 | socket.io-client | AI 实验室实时表情识别（WebSocket） |
| 图标 | @phosphor-icons/vue | 单一图标体系 |
| 富文本 | html-to-image + 自研 markdown 渲染 | 行动卡导出图片、个案 Markdown 展示 |

## 环境要求

- Node.js 18+
- npm（或 pnpm/yarn）
- 后端服务运行在 `127.0.0.1:8000`，且必须通过 `app.main:socket_app` 启动
  （AI 实验室需要 SocketIO，见 `backend/README.md`）

## 快速开始

```bash
cd frontend
npm install
npm run dev        # http://127.0.0.1:5173，/api 与 /socket.io 自动代理到 8000
npm run build      # vue-tsc 类型检查 + vite 构建 → dist/
npm run preview    # 本地预览构建产物
```

Vite 代理配置（`vite.config.ts`）：

| 路径 | 目标 | 说明 |
| --- | --- | --- |
| `/api` | `http://127.0.0.1:8000` | REST 接口 |
| `/socket.io` | `http://127.0.0.1:8000` | SocketIO，`ws: true` 启用 WebSocket 升级 |

## 目录结构

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts      # axios 封装：Token 注入、401 自动刷新、统一错误
│   │   └── types.ts       # 接口类型（与后端契约对应）
│   ├── components/
│   │   ├── admin/         # 管理后台组件（ConfirmDialog、PaginationBar、StatusBadge…）
│   │   ├── ai-lab/        # AI 实验室组件
│   │   │   └── VideoCallPanel.vue      # 视频通话面板
│   │   └── …              # 通用组件（ErrorBanner、FieldInput、EmptyState、Reveal…）
│   ├── stores/auth.ts     # Pinia：token / user / 登录、注册、邮箱登录、登出
│   ├── router/index.ts    # 路由表 + 鉴权守卫
│   ├── styles/main.css    # Tailwind 主题令牌与全局工具类
│   ├── utils/
│   │   ├── markdown.ts    # 轻量 XSS 安全 Markdown 渲染
│   │   └── useCountdown.ts# 验证码倒计时组合式函数
│   └── views/
│       ├── VideoCallView.vue  # 自我教练页（/self-coaching，AI 视频通话 + 常驻 AI 标识）
│       ├── TermsView.vue      # 服务协议与免责声明（/terms）
│       ├── WalletView.vue     # 我的钱包（/wallet）
│       └── …                  # 业务页面（含 admin/ 管理后台）
├── vite.config.ts         # 别名 @、/api 与 /socket.io 代理
└── package.json
```

## 路由一览

| 路径 | 页面 | 权限 |
| --- | --- | --- |
| `/` | 首页（轮播、四宫格、推荐） | 公开 |
| `/login` / `/register` / `/forgot-password` | 登录 / 注册 / 找回密码 | 公开 |
| `/self-coaching` `/self-coaching/records/:id` | 自我教练（AI 视频通话）/ 记录详情 | 登录 |
| `/emotion-journal` | 情绪日记（表情选择 + 月度心情日历） | 登录 |
| `/coaches` `/coaches/:id` `/coaches/:id/book` | 找教练 / 详情 / 预约 | 列表详情公开，预约登录 |
| `/articles` `/articles/:id` | 科普中心 / 文章详情 | 公开 |
| `/my` `/profile` `/notifications` `/wallet` | 我的成长 / 个人资料 / 通知 / 我的钱包 | 登录 |
| `/terms` | 服务协议与免责声明 | 公开 |
| `/growth-assessment` | 成长测评 | 登录 |
| `/communities` `/communities/:id` `/communities/:id/posts/:postId` | 社群广场 / 详情 / 帖子详情 | 广场公开，其余登录 |
| `/coach` | 教练工作台 | 登录（教练） |
| `/video-call` | 跳转 `/self-coaching` | - |
| `/admin` | 管理后台 | 登录 + ADMIN |

路由守卫：`meta.auth` 未登录跳登录页（带回跳地址）；`meta.admin` 非管理员回首页。

## 设计系统（保持一致的视觉语言）

在 `src/styles/main.css` 定义，页面应沿用这些令牌而非硬编码颜色：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `paper` | `#f4f5f2` | 页面底色 |
| `card` | `#ffffff` | 卡片/表单 |
| `ink` / `ink-soft` / `ink-faint` | 深/中/浅灰 | 文字层级 |
| `hairline` | `#e2e3dd` | 分割线/描边 |
| `pine` / `pine-deep` / `pine-soft` | 品牌绿 | 主操作/选中/浅底 |

常用工具类：`.card`（圆角卡片）、`.catalog-tab`（等宽角标）、`.pressable`（按压反馈）。
交互规范：主按钮全圆角 pine、卡片圆角 14px、分隔用 hairline、避免装饰性渐变/玻璃拟态；
AI 页面同样遵守该体系（松绿强调 + Phosphor 图标 + 对比度 AA）。

## API 调用约定

```ts
import { get, post, patch, del, uploadFile, ApiError } from '@/api/client'

const data = await get<SomeType>('/users/me')
await post('/appointments', { ... })
```

- 基础路径 `/api/v1`（vite 代理到后端），统一响应 `{ code, message, data, traceId }`；
- `client.ts` 自动注入 `mb_access_token`，401/TOKEN_EXPIRED 时自动刷新并重放，失败触发登出事件；
- 业务错误统一抛 `ApiError`（含 `code/status/errors`），页面用 `ErrorBanner` 展示；
- 文件上传用 `uploadFile(file, usage)`（usage：`general/credential/idcard`）。

## AI 实验室接入说明

### 页面

- **`/self-coaching`（自我教练，AI 视频通话）**：实时视频通话 + 语音输入，AI 以语音回复
  （edge-tts，免费）；配置 VLM Key 后 AI 还能理解摄像头画面。
  页面常驻「AI 生成」标识，首次进入弹免责确认，每条 AI 回复带“AI 生成”角标。

### 组件与数据流

| 组件 | 职责 |
| --- | --- |
| `components/ai-lab/VideoCallPanel.vue` | 视频通话面板（TTS 播放、打断、音量可视化） |

AI 实验室接口（与业务接口不同，返回自有 JSON 结构）：

| 接口 | 说明 |
| --- | --- |
| `POST /api/analyze_audio` | 上传音频 → 转写 + 文本/语调/面部/融合情绪 |
| `GET /api/analyze_audio/config_check` | 查看四个模型加载状态 |
| `POST /api/analyze_audio/warmup` | 手动触发模型预热 |
| `POST /api/ai_coach/chat` | AI 心理教练对话（携带识别上下文） |
| `POST /api/vc_audio_upload` | 视频通话音频上传（返回 `file_id` 交 `vc_audio_end` 处理） |

SocketIO 事件：

- 情绪识别：前端 `upload_frame`（约 2.5fps 抽帧）→ 后端返回 `emotion_result`；
- 视频通话：`vc_start` / `vc_stop` / `vc_audio_chunk` / `vc_audio_end` / `vc_interrupt` /
  `vc_update_frame` / `vc_update_emotion` / `vc_clear_history` → 后端返回
  `vc_state_change`、`vc_llm_token/done`、`vc_tts_start/chunk/done`、`vc_vlm_result` 等。

### 使用前提

- 后端已通过 `app.main:socket_app` 启动（`/socket.io` 可用）；
- AI 模型已加载（后端 `config_check` 显示 loaded；未加载时先调 warmup）；
- AI 教练需要后端 `.env` 配置 `DEEPSEEK_API_KEY`，否则返回 503；
- 浏览器需允许摄像头/麦克风权限（HTTPS 或 localhost 环境）。

## 页面功能

- **用户端**：首页、自我教练（含行动卡分享/导出图片）、情绪日记（趋势 + 月历）、
  找教练/预约（付费锁定：余额/模拟支付 + 倒计时）/评价、科普（收藏/分享）、
  我的成长（预约/记录/打卡/收藏/日记）、成长测评、社群广场与帖子、我的钱包（余额/充值/流水）
- **教练端**（`/coach` 工作台）：预约、个案（Markdown + 导出）、服务/时段、
  客户（含待跟进）、收到的评价、话术库、社群管理、资料（含支付状态标记）
- **管理后台**（`/admin`）：概览、用户、教练审核、文章、内容（分类/轮播/标签/话术库）、社群、
  订单管理（筛选/退款）、余额发放、**危机处理**（接管/跟进/结案/时间线）、**审计日志**、平台配置
- **AI 实验室**：`/self-coaching` 视频通话（常驻 AI 标识 + 首启免责确认）
- **账号与合规**：密码/邮箱验证码双模式登录、找回密码、绑定邮箱、修改密码、
  服务协议确认（`/terms`）、数据导出（JSON 下载）、注销删除（密码确认）

## 构建与质量

```bash
npm run build     # 类型检查（vue-tsc）+ 构建，作为合并前的门禁
npm run dev       # 开发热更新
```

前端当前没有自动化单测；提交前保证 `npm run build` 通过（含 `vue-tsc`）。
新增依赖前确认 `package.json`；图标统一使用 `@phosphor-icons/vue`。

## 部署

1. `npm run build` 产出 `dist/`；
2. 将 `dist/` 交给任意静态托管（Nginx/CDN/OSS），SPA 需配置 history 回退（`try_files ... /index.html`）；
3. `/api` 与 `/socket.io` 请求同源反向代理到后端（WebSocket 需配置 `Upgrade`/`Connection` 转发头），
   或配置后端 `CORS_ORIGINS` 允许前端域名；
4. 生产环境登录 Cookie 依赖 HTTPS（后端 `COOKIE_SECURE=true`）；
5. AI 实验室页面依赖后端模型服务，部署时保证后端单进程运行（模型常驻）。

## 常见问题

- **接口 401/刷新失败**：后端未启动或 Token 已失效，会触发登出跳登录页；
- **页面白屏**：先 `npm run dev` 看终端报错；构建期错误通常是 TS 类型不匹配，按 `vue-tsc` 提示修；
- **图片上传失败**：检查后端 `/files` 与私有访问控制（证书/身份证仅本人与管理员可见）；
- **AI 对话页摄像头开不了**：检查浏览器权限；确认后端已 `socket_app` 启动且 `config_check` 正常；
- **语音转文字无结果**：后端 SenseVoice 未加载（看 `config_check`），内存不足时先释放内存再调 warmup；
- **AI 不回复**：后端 `.env` 未配置 `DEEPSEEK_API_KEY`，或 Key 失效。
- **AI 回复报 `[llm] Insufficient Balance`**：DeepSeek 账号余额不足，充值或更换 Key 即可。
