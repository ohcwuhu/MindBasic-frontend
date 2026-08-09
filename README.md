# MindBasic-frontend

心理教练成长服务平台（MindBasic）前端，真实响应式 Web（移动端优先，桌面可用）。

## 技术栈

- Vue 3 + TypeScript + Vite
- Tailwind CSS v4 + Pinia + Vue Router + Axios
- 图标：@phosphor-icons/vue

## 快速开始

```bash
npm install
npm run dev       # 开发，/api 代理到 http://127.0.0.1:8000
npm run build     # 类型检查 + 生产构建
```

需要先启动后端（`uvicorn app.main:app --reload`）。

## 页面

- 首页（轮播、四宫格、精选文章、推荐教练）
- 自我教练（5 套模板、四步流程、成长行动卡）
- 情绪日记（快速记录、资源导向反馈、时间轴）
- 找教练（筛选、详情、预约）
- 科普中心（分类、文章列表、详情、收藏）
- 我的成长（预约、自我教练记录、收藏）
