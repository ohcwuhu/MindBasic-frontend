# 斐思同行 · 手绘风 web 前端

用 `项目主体/素材库2.0` 把整个用户端做成手绘风：**一个背景、一套画风、24 个页面**
（用户端 20 + 管理工作台 4）。
视觉世界沿用项目已经定稿的那一套（水彩纸感、墨线、手写字体、调色板），素材库 2.0 的六个分类
（吉祥物、徽章、文章分类、教练象征物、测评五维、手绘道具）都用成它们各自画的东西。

**这是 web 项目，只出桌面端的图**，产物在 `演示图/`：

| 文件 | 尺寸（逻辑像素） | 内容 |
| --- | --- | --- |
| `首页-手绘风-桌面端.png` | 1440 × 1005 | 首页整页 |
| `自我教练-手绘风-桌面端.png` | 1440 × 1008 | AI 语音/视频对话 |
| `情绪日记-手绘风-桌面端.png` | 1440 × 1794 | 情绪日记（手账） |
| `真人教练-手绘风-桌面端.png` | 1440 × 900 | 教练列表（本版新增，首屏） |

## 改动记录（按主题，最新的在最前）

### 退出登录挪进个人中心 —— 页头那颗按钮改成「个人中心」

- **页头**：登录后不再放昵称、也不再放退出登录，那一位换成**一枚按钮** —— 普通用户写
  「个人中心」指到 `my-growth.html`，管理员写「管理工作台」指到 `admin.html`。实测这一组
  普通用户 **188px**、管理员 246px（改之前是 301 / 314px），1100px 下加导航 436px 也不挤。
- **个人中心（`my-growth.html`）右栏多了一块「账号」面板**：先写清楚「现在是谁登录着」
  （昵称 + 手机号掩码，实测「小满 · 139****0002」；昵称本身就叫「管理员」时不重复写角色），
  下面两颗按钮：个人资料与隐私、**退出登录**。
- **退出这件事仍然只有一处实现**：`session-nav.js` 会接上页面上任何一颗 `[data-logout]`
  并把它从 `hidden` 里放出来（静态演示 / 没登录时保持隐藏），所以那颗按钮放哪一页都行。
- 顺手清掉两处随之作废的代码：`ui.css` 里给页头昵称做省略号的 `.who`、`session-nav.js` 里
  为它准备的 `esc()`（昵称不再进页头拼 HTML 了）。
- 实测：普通用户与管理员分别点「退出登录」→ 真的打 `POST /auth/logout`、本地 token 清空、
  回首页且页头回到「注册 / 开始登录」；`my-growth.html` 版式检查全过；
  `account-live-check.mjs`（注册 → 账号行显示昵称 → 退出 → 再登）退出码 0、控制台 0 报错。

### 注册页发不出请求 —— 已修

你报的：自己注册的账号登不上。查下来是**注册根本没发生**：库里最新的账号还是 10-07 的
（旧测试数据），你那次提交一个请求都没出去。一个崭新浏览器打开注册页提交，实测是这样：

```
注册页 localStorage 的 feisi_backend = null
表单 action = index.html · method = get
提交后 URL = /index.html?phone=13900001234&nickname=…&password=Demo123456&confirm=…&agreed=on
发出去的 /api 请求： （一个都没有）
```

- **根因**：`scripts/register.js` 拿 `api.live` 当闸门，可这个标记**只有在这台浏览器登录过**
  （或带 `?live=1`）时才为真 —— 而注册页恰恰是还没登录的人在用的页面，于是整段脚本不执行，
  表单退化成原生 GET 提交。登录页用的是「页面是不是 http(s) 打开」这个闸门，所以登录一直好使，
  只有注册是坏的。
- **顺带一个安全问题**：退化成原生提交时，**密码跟着 query string 进了地址栏与浏览器历史**。
  现在两个密码框去掉了 `name`（脚本没跑起来时也不会被带上），并且提交永远先 `preventDefault`。
- **修法**：闸门换成 http(s)（和登录页 / 找回密码页同一套）；注册成功把 `mb_access_token` /
  `feisi_backend=live` / `feisi_nickname` / `feisi_role` 一起存下（下一步页头立刻就是对的样子，
  不会先闪一下）；双击 `.html`（file://）看演示稿时不再假装跳首页，而是直说
  「演示稿里注册不会真的生效，起开发服务器就能注册」。
- **同类排查**：`terms.js` 用了同一个错的闸门 —— 协议页也是**不用登录**的公共页（注册页那个
  勾选框直接指过来），没登录时它显示的是页面里写死的示例文本，冒充正式协议。一并改成 http(s) 闸门。
  其余 17 个脚本用 `api.live` 是对的：那些页都在登录守卫后面，能进去就说明已经登录过。
- **实测**（`tools/account-live-check.mjs` 新增的第 0 段，每次跑都自己注册一个随机号再删掉）：
  注册 → `POST /api/v1/auth/register` 真的发出、落地 `/index.html`（不带 query）、凭证齐全、
  页头立刻是「自检小号 · 个人中心」→ 退出 → **用同一套手机号密码再登一次，成功** →
  `POST /users/me/delete` 200，再登 401（删干净了）。
- 你那次提交没有产生账号，**重新注册一次就好**。

### 切页那一下「颜色变化」—— 已修

你报的现象：切换页面时整屏像闪一下、不丝滑。用「限速 200KB/s + CDP 逐帧录屏」把冷启动的每一帧
都录下来看，找教练页的序列是这样的：

| | 改之前 | 改之后 |
| --- | --- | --- |
| 第一帧 | 白 `#FFFFFF` | 白 `#FFFFFF`（还在） |
| 平色帧（CSS 到了、图还没到） | **`#C3D0A5` 草绿** | **`#EFE7DC` 这张图的平均色** |
| 内容帧 | 面板出现 | 面板出现 |
| 背景图到位（整屏） | `#F3E9DF` —— **绿翻暖，最大差 Δ(48,25,58)** | `#F3E9DF` —— 只差 **Δ(4,2,3)**，看不出 |

根子在于：整页背景是 `cover` 大图，图到之前先铺的是 CSS 里那条 `background: #xxx url(…)` 的
颜色，而它被随手写成了草绿，跟图自己的颜色差得远 —— 图一落，整屏就换色。三处修法：

1. **平色改成每张图自己的平均色**（`pages.css` 三处、`emotion-journal.css` 一处）：
   水彩草地 `#E7EDC4` · 带树 `#F1EEDF` · 木屋 `#EFE7DB` · 纯草地 `#C0DA8D`（这条本来就对）。
   这样图到了只换纹理、不换颜色。
2. **每页 `<head>` 最前面加一块 `data-first-paint` 内联样式 + 背景图预取**：第一帧（哪怕别的
   都还没到）就是这一页的底色；图也不再等 `pages.css` 解析完才去取。
3. **`base.css` 里那三条 `@import` 拆成每页并列的 `<link>`**：`@import` 是串行发现的（浏览器得
   先下完 base.css 才知道还有 tokens / fonts / ui 三份）。拆完实测这几份 CSS 是**同一时刻**
   开始取的（限速下都是 2656ms）。层叠顺序没动：tokens → fonts → ui → base → pages。

- **第一帧那片白还在，而且去不掉**：浏览器要等 render-blocking 的样式表全部到齐才肯画第一帧，
  限速下这段 = 文档一个往返 + 样式表一个往返。真要去掉得把主题样式改成非阻塞加载
  （`media="print" onload="this.media='all'"`）再内联临界 CSS —— 代价是内容会先以「没样式」
  的样子闪一下；对一个整屏都是背景画的站点，我觉得不划算，没做。
- **页面最终的样子一个像素没变**：视口截图逐像素比 6 个页面，5 个 0 差异；wallet 那处差异是
  `fullPage` 截图对 `fixed` 背景的拼接假象（见下一条），视口截图连拍三次完全一致。
- **交付图重出了一次**：情绪日记那张在 y≈900 以下是**平色带**（`fullPage` 截图表达不了 `fixed`
  背景 —— 出图脚本的老问题，不是这次引入的），颜色随 CSS 从 `#B6D790` 变成 `#E7EDC4`；
  四张尺寸都没变。要不要我把出图改成「逐屏截再拼」，让整张图的背景都是真水彩？
- **新增 `tools/first-paint-check.py`**：检查「每处底色 ≈ 它那张图的平均色」（±12/255）——
  现在 24 页 + 5 处 CSS **全部差 0**，不合规时退出码非 0。
- 回归：24 页 `verify` / `collisions` 五宽度 **0 条问题**；`account-live-check` /
  `admin-live-check` / `stress-check` 退出码 0、控制台 0 报错。

### 字体子集修复 —— 573 个字掉回了系统字体

自检时发现的：自托管的手写字体子集是 **10-09 20:46** 切出来的，而**所有页面**的最后一次改动
都在 **10-10 22:44 之后** —— 于是页面上 **60.6%** 的中文字并不在那份子集里，掉回系统楷体，
一页字是两种字混着排；4 张已交付的图同样缺字。`verify.mjs` 查不出来：它只看标题「声明」的
字体族是不是 LXGW WenKai —— 声明对不代表字有。

- **扫描范围补上了 `scripts/*.js`**（含自我教练、情绪日记那两个编译包）：那两页的文案在包里、
  不在 HTML 里，此前永远进不了子集。
- **字符范围也放宽了**：`…`、`—`、`·`、`¥`、`（）`、`① ② ③` 这些原先被
  `ord(c) < 128 or 0x2E80..0x9FFF` 那条过滤挡掉了，现在按码位段收（拉丁补充 / 常用标点 /
  序号 / CJK 与 CJK 标点 / 全角形式）。
- **结果**：子集 487 → **1164 个字形**，页面用到的字符**一个不缺**（`tools/font-check.py` 报 0）；
  LXGW 那个文件 94 KB → **238 KB**（woff2），Noto 三档各 62 → 153 KB（本机不加载 ——
  字体栈里 PingFang / 雅黑 排在它前面）。
- **4 张交付图重出了**（`node tools/render.mjs`），**四张的像素尺寸都没变**
  （2880×2010 / 2880×1800 / 2880×3844 / 2880×1800）；逐像素比：首页 **0 个像素变化**，
  自我教练 9.62%、情绪日记 0.21%、真人教练 0.08% —— 差异都落在文字上。修复前的那 4 张留在
  `演示图/_字体修复前/`，确认没问题可以删。
- **新增 `tools/font-check.py`**：文案一改就跑一下，报「子集缺几个字、哪一页缺得最多」，
  缺字时退出码非 0。重跑 `python tools/build_font.py` 即可补齐。

### 自检清单修复 —— 版式 · 会话 · 通知页 · 占位链接

上一轮我把自己查出来的问题列了一份清单，这一轮按单子改完。每一条都有实测数字。

- **① 长昵称顶破页头（上一轮我加页头时带出来的回归）。** 20 个字符的昵称（后端上限）在
  1100px 下把那组撑到 563px，整页横向溢出 **101px**。现在昵称有 8em 上限 + 省略号
  （全名在个人中心里看得到），顺手补了转义（它此前是直接拼进 `innerHTML` 的）。复测 18 组
  （20 字拉丁 / 19 字中文 / 2 字 × 普通用户与管理员 × 1100 / 1280 / 1440）全部 0 溢出。
- **② 断不开的长串把纸面顶宽。** 一个 132 字符的邮箱会让 `profile.html` 横向溢出 **296px**、
  57 个元素越界。根因在设计系统层：flex 子项 `min-width: auto`、`.stack` 的隐式 auto 列、
  文字没有 `overflow-wrap`。所以修法放在最上面一层 —— `body { overflow-wrap: anywhere }`
  （它不只回行，还改 min-content，flex / grid 的下限因此不再被长串撑着），另外 `.stack`
  给一个 `minmax(0, 1fr)` 的列、`.panel__head--row > *` 给 `min-width: 0`。
  新增 `tools/stress-check.mjs` 专测这一类：把 120 字的 token / 160 字的网址 / 60 字的中文名
  塞进通知、钱包、社群、个人中心，**5 个页面全部 0 溢出 0 越界**（修前是 296px + 57 个越界元素）。
- **③ 会话中途过期没人管。** 之前页面开着而 token 失效，点任何动作只得到一句红字，坏 token
  还留在本地、页头还是登录态。现在 `api.js` 收到 401 就清凭证并送
  `login.html?next=…`（登录 / 注册 / 找回密码这三页不跳，免得绕圈）。实测：钱包页把 token
  换掉再点充值 → `/login.html?next=wallet.html`，本地 token 已清空。
- **④ 通知页读一条会重画整张表。** 现在就地改那一行（验证方式：给别的行打一个 DOM 记号，
  标完一条之后记号还在 → 证明没有重画），焦点不掉回 body；「全部标为已读」在没有未读时
  自己禁用；页码越界（把第 2 页最后一条读掉）会自动收回上一页，不再出现「第 2 / 1 页」。
- **⑤ 动态文字对屏幕阅读器沉默。** 条数、余额、保存结果、错误提示这些会自己变的地方补了
  `aria-live="polite"`（用户端 4 页 + 管理工作台 4 页）。
- **⑥ 三处占位链接。** 个人中心「更换」（自链接，本来也没有换手机号的流程）改成「登录账号」；
  「我的订单」不再指到教练档案，改成从 `GET /orders` 如实报数（「还没有订单」/「共 N 笔 ·
  M 笔待支付」）；「通知 → 设置」改成「通知 → 查看」指到真的通知页。社群列表里那 8 个
  `♡ / 评论` 从自链接改指到社群详情。
- **⑦ 面包屑不一致。** `notifications.html` / `wallet.html` 补上「首页 / 通知」「首页 / 钱包」
  （和我的成长 / 个人中心同一类；登录、注册、找回密码这三页按「门」处理，仍不留面包屑）。
- 校验：24 页 `verify.mjs` / `collisions.mjs` 五宽度全过；`admin-live-check.mjs` 与
  `account-live-check.mjs` 都是退出码 0、控制台 0 报错；`impeccable detect` 仍只报站点那条旧账。
- **还留着、要你定的两条**：`/auth/email-code` 不校验邮箱是否存在、而 `/auth/reset-password`
  会回「该邮箱未绑定账号」→ 可以拿邮箱枚举用户（后端的事，前端修不了）；演示账号没绑邮箱、
  钱包 0 元，演示「找回密码」和「钱包」时会看到报错 / 空态。

### 用户端补齐 —— 通知 · 钱包 · 找回密码 · 社群详情 · 个人中心

上一轮盘过一遍「手绘版和原前端差在哪」，这一轮把其中最挡路的几条断头路接上：页头多了一枚
真的未读角标，四个真接口的新页面（+ 登录页那两种方式补齐），个人中心里那四颗按钮也终于会动了。

- **通知中心（`notifications.html`）**：列表来自 `/notifications`，角标来自
  `/notifications/unread-count`，标一条已读 / 全部已读走 `POST /notifications/{id}/read` 与
  `/read-all`；「全部 / 只看未读」两档交给服务端 `unreadOnly` 筛。标完顺手把页头那枚角标
  也叫新 —— `session-nav.js` 把 `refreshUnread` 挂在 `window.FeisiNav` 上给别的页面用。
- **页头那组现在是三样**：「通知」（后面跟未读数的黄色小标签，0 条时不显示）、「钱包」、
  一枚按钮 —— 普通用户写「个人中心」，管理员写「管理工作台」。实测这组普通用户 **188px**、
  管理员 **246px**，加导航 436px，1100px 下没有横向溢出。
- **钱包（`wallet.html`）**：`GET /wallet` 余额、`/wallet/transactions` 流水（进出用正负号 +
  警示色分开）、`POST /wallet/topup` 充值（¥50 / ¥100 / ¥200 与自定义金额，元自动换算成分）。
  后端这一版是**模拟充值**（`wallet.py` 里写明「直接到账余额，后续接真支付后改为创建充值单」），
  页面上也照实这么写，不假装走了支付渠道。
- **找回密码（`forgot-password.html`）**：`POST /auth/email-code`（purpose=RESET）拿验证码，
  `POST /auth/reset-password` 重设。这一页**不要求登录**（忘了密码的人本来就登不上），
  所以加进了 `auth-guard.js` 的白名单；登录页那个「忘记密码？」也终于指到这一页了。
- **登录页两种方式都接上了**：密码登录照旧打 `/auth/login`；「邮箱验证码」那一栏现在会真的
  `POST /auth/email-code`（purpose=LOGIN，发出去才开始 60 秒倒数），再用
  `POST /auth/email-login` 换 token —— 两条路走的是同一段存凭证 + `?next=` 跳转的代码。
- **社群详情（`community-detail.html`）**：`GET /communities/{id}` 抬头 + 加入 / 退出 +
  帖子列表 + 发帖 + 点赞。帖子接口要成员身份（非成员 403），所以没加入时这一页把
  「加入之后才看得到组里的帖子」摆出来，而不是甩一条错。社群列表里那四张卡片现在都指到这里。
- **个人中心的四件事真的能用了**（`scripts/profile.js` 从 1.8 KB 长到 230 行）：邮箱绑定
  （验证码 + `POST /users/me/email`）、修改密码（`POST /users/me/password`，**后端顺手作废
  当前 accessToken**，所以改完清掉本地凭证回登录页并说清为什么）、导出数据
  （`POST /users/me/data-export` + 列表 + 下载）、停用 / 永久删除（删除要再输一次登录密码）。
  下载那个地址要带 Bearer，`<a href>` 送不出去，所以取回 Blob 再点一个临时 `<a>`。
- **共用层补了三件小东西**：`api.emptyItem()`（`.empty` 塞进 `ul` 之前要的壳）、`api.note()`、
  `api.money()`（分 →「¥99」）；`base.css` 加了一条 `[hidden] { display: none !important }`
  —— `.chip` 这类是 `inline-flex`，只有 UA 那一条压不住。
- **画风层只加第 11 节**（`.noti` 未读点 / `.wallet` 余额那一条 / `.cd` 社群抬头 / `.cpost` 帖子）。
  帖子的类名特意用 `cpost-` 前缀：`.post` 那一套是科普中心与社群列表页在用的，同名会互相改到。
- 校验：24 个页面 `verify.mjs` / `collisions.mjs` **五个宽度全过**；`impeccable detect`
  只报站点那条旧账（见「已知问题」）；联调见下面「自检结果」（`tools/account-live-check.mjs`）。

### 管理工作台 —— 用户 / 内容 / 教练审核

概览那一页原来只写了「管理模块 · 待建」两行占位。这一轮把**后面三个模块真做出来**，
四个模块共用一套壳：`admin.html`（概览）· `admin-users.html` · `admin-articles.html` ·
`admin-coach-audits.html`。全部走真接口，全部只给 ADMIN。

- **模块导航搬到顶上。** 原来那排 `.keys` 在页面最下面，写着「待建」—— 换成四个真页面之后
  它变成真正的导航，所以挪到 `.ground` 的第一行（就是站点自己那排 `.key` 药丸，当前模块
  用 `is-current` 标出来）。四个页面都有一份，概览页底下那截占位模块入口删掉了。
  `session-nav.js` 里那条（后来按你说的简化成只写「管理工作台」）照旧指到概览。
- **用户（`admin-users.html`）。** 列表 `/admin/users`，服务端筛（关键词 / 角色 / 状态）；
  停用与恢复走 `PATCH /admin/users/{id}/status`。停用是破坏性动作，**在这一格里就地确认**
  （按钮变成「确定 / 取消」），失败时把后端那句话（例如「不能修改自己的账号状态」）写在按钮
  旁边；自己那一行的开关**先就禁用掉**，并在昵称后面标一枚「你自己」。
- **内容（`admin-articles.html`）。** 文章列表 `/admin/articles`、写与改 `POST` / `PATCH`、
  上下线 `PATCH {status}`、删除 `DELETE`（就地确认）；分类一整块
  （`/admin/article-categories` 的增 / 改名 / 启停 / 删，分类下还有文章时后端 409，
  那句话说在面板底部）。**写文章用的是一块面板，不是弹窗** —— 写正文要的是地方，不是打断；
  编辑器空着标题或正文就在表单里说清楚哪一项没填。
- **教练审核（`admin-coach-audits.html`）。** 默认停在「待审」；点「查看」把那一份申请摊在
  页面上（真实姓名 / 从业年限 / 擅长方向 / 简介 / 受训 / 服务理念 / 证件链接 / 报的服务项目
  与价格）。擅长方向那些 id 用 `/admin/tags` 换成人话；通过是就地确认，驳回要写一句理由
  （`POST …/reject`，后端也校验 1–500 字）。看一下、审一份、再回到列表，地址栏里带
  `?status=&audit=`，刷新不丢。
- **列表页的三件事按操作面规矩来。** ① 过滤器**写回地址栏**（`?page=&keyword=&status=…`），
  刷新 / 后退 / 把链接发给另一个管理员都还在同一屏；② 正在取数时表格**保持自己的行高**
  （骨架行），不是页面中间转一个圈；③ 空态分档写清楚（「这组条件下没有用户」vs
  「还没有任何申请」），告诉人下一步能做什么。
- **共用的那层语言抽到 `scripts/admin-shared.js`**（`window.AdminKit`）：状态怎么叫、画成哪枚
  小标签、金额怎么写、骨架行怎么排、以及 401/403 就请回首页。三个页面脚本不再各写一遍。
- **画风层只加了两个小节**：`ui.css` 第 12 节（`filter · table · pager` —— `.filters` /
  `.pager` / `.act` 行内动作 / `.confirm` 就地确认 / `.skl` 骨架 / `.tnum`）与
  `pages.css` 第 10 节（工作台：`.atabs` / `.pairs` 标签值对 / `.svc` / `.aacts` /
  `.inline-add` / `.rename` / `.anote`）。**没有新素材**，用的还是那套纸、墨线和手写字。
  顺手把错误色收成一个令牌 `--danger-ink`（原来 `#a8503c` 只在 `.field__error` 里写死）。
- 校验：四个页面 `verify.mjs` / `collisions.mjs` **五个宽度全过**；`impeccable detect`
  每条页面只报同一条站点级旧账（见「已知问题」）；真后端联调见下面「自检结果」。

### 情绪日记页 —— 挂回原 Vue 组件

**情绪日记页也改成「把原前端的 Vue 组件真挂进来」**，只换画风（全用素材库 2.0）与背景。

- **页面本体是原项目那五个 SFC**：`views/EmotionJournalView.vue` +
  `MoodFace` / `QuoteBlock` / `EmptyState` / `ErrorBanner`，由同一个构建工程（`vue/` 的第二个入口）
  编成 `scripts/emotion-journal-app.js`（102 KB，IIFE）+ 同名 CSS。模板、状态机、文案、
  接口名、组件自带样式一个字没改。
- **画风层**（`styles/emotion-journal.css`）只做两件事：手账纸（方格纸 / 图钉 /
  对勾 / 圈注）与**六张表情贴纸** —— 原组件那张用 SVG 画的小脸在三处（心情选择器、记录卡、
  近 30 天分布）都换成素材库 2.0 的同一张贴纸；原版的两个装饰光晕拿掉。
- **背景换成你指定的那张**：`演示图/首页背景-纯水彩草地版.png`（2590×1619，一张纯草地）→
  `assets/field-watercolour.webp`，而且是**固定背景**（`cover + fixed`）—— 和真人教练那一页
  同一套：纸往下滑，画不动。
- **纸下面留了一段地**：这张纸的下沿原来离页脚只差 2px，页面收得太急，所以在纸和页脚之间
  留了 **80px** 的地（页高 1794 → 1874）。
- **「今日一句」也往下挪了一点**：原来它被上面那条 `margin: 0` 抹掉了外边距，几乎贴在
  「近 30 天分布」上；现在留 48px（原组件的值是 2.5rem），页高 1874 → 1922。
- **这一页现在真的能用**：选心情、写（**真的 textarea**，上一版那里是一行静态文本）、
  提交（新记录进列表 + 一句 AI 回应）、删记录、翻月份、点某天筛记录 —— 数据是本地替身，
  提交与删除在内存里生效。
- **参数链路变成原生的**：`EmotionJournalView` 自己 `onMounted` 读 `route.query.mood /
  content / conversationId`，所以上一版那个 `scripts/emotion-journal.js` 删掉了；
  同时把 router 替身的 `replace` 改成「同一页只换 URL、不重载」，于是
  「自我教练 → 结束通话 → 记录到日记 → 提交」这条链不会因为刷新丢状态。
- **顺手抽共用层**：两个挂载页共用的一层（原组件 `--color-*` 令牌映射 + Tailwind 工具类替身）
  抽到 `styles/vue-pages.css`。
- 校验：`verify.mjs` / `collisions.mjs`（`PAGE=emotion-journal.html`）五个宽度、六组元素对全过；
  `impeccable detect` 渲染整页 **0 条**；「自我教练→记录到日记→提交」整条链实测通过
  （心情选中「平静」、正文预填、提交后 URL 清掉 query、新记录带「自我教练」来源标签）。

### 自我教练页 —— 挂回原 Vue 组件

**自我教练页改成「把原前端的 Vue 组件真挂进来」**（你选的那条），只换画风、只换背景。

- **页面本体是原项目那三个 SFC。** `views/VideoCallView.vue`、
  `components/ai-lab/VideoCallPanel.vue`、`CompanionSprite.vue` 由 `demo/vue/` 里那份构建
  直接引进来编成 `scripts/self-coaching-app.js` + `scripts/self-coaching-app.css`
  （Vite + `@vitejs/plugin-vue`，IIFE，双击 `file://` 也能跑）。模板、状态机、文案、
  socket 协议、组件自带样式一个字没改。
- **画风层只有一份 CSS**：`styles/self-coaching.css` —— 把原组件的 `--color-*` 主题变量接到
  手绘世界的纸面与墨色上，再覆盖纸面那些地方（侧栏、控制条、两个弹窗）。
  **舞台与右下角的陪伴卡仍是深底**：3D 角色就是照着深底画、照着深底抠的（抠像阈值 30 也是
  为黑底定的），把它挪到亮纸上会发灰、没立体感；所以舞台是一块**深灰的视频面**、浮窗是一块
  暖黑的毛玻璃，舞台上的字照原版用浅色。尺寸、栅格、间距、字号仍是原组件的值。
- **背景换成你给的那张**：`演示图/情绪日记-背景图-更新版.png`（2730×1536）→
  `assets/emotion-journal-bg.webp`，原尺寸、`cover + fixed`，**只作用于这一页**。
  其余十五页仍是 `web-background`。（后来按你说的换成了 `纯水彩草地背景.png`，见下。）
- **背景再换一次**（后续修订）：`演示图/纯水彩草地背景.png`（2590×1619 的整幅草地）→
  `assets/field-grass.webp`，仍是固定背景。换回上一张只要改 `styles/self-coaching.css`
  `body` 那一行（那里留了注释）。
- **补齐了原来缺的东西**：通话前（三项分项授权 + 开始按钮）、设备启动中、舞台上那几种提示
  （摄像头关闭说明、AI 看画面的说明条、静音提醒→倒计时→自动结束、错误条）、侧栏的空态与
  「AI 正在回复…」、按钮按状态出现/改文案、以及两个弹窗（AI 说明、记录到情绪日记）。
- **数值上对得比之前更死**：舞台 : 侧栏 = 1024 : 372（1440 下），与控制台一样整幅铺开、
  左右各留 16px；页面在 1440×900 / 1600×1000 / 1920×1080 下都正好一屏（页头 + 通话台 + 页脚）。
- **页脚挪到折线以下**（后续修订）：通话台占满第一屏（页头 60 + 通话台 840），页脚顶正好落在
  折线上，往下滑一点才看到 —— 页高 900 → 965。
- **「记录到日记」真的接上了**：结束通话 → 弹窗 → 点「记录到日记」→ 跳到
  `emotion-journal.html?mood=…&content=…&conversationId=…`，情绪日记页现在读这三个参数
  （`scripts/emotion-journal.js`：心情选中、正文与字数跟着换、来源标记带上会话号）。
- **顺手清掉旧件**：`scripts/companion.js`、`scripts/self-coaching.js`、
  `styles/companion.css` 删了 —— 那套是上一版手写的同源实现，现在由组件本体接管；
  `base.css` 里的 `@import './companion.css'` 一并去掉。
- 校验：`verify.mjs` / `collisions.mjs`（`PAGE=self-coaching.html`）五个宽度全过；
  `impeccable detect` 现在只报 1 条（页面底色 cream，见下面「已知问题」）——
  原来那两条文字对比度、两条原组件的光晕，都在这一版收掉了。

### 首页 —— 只留一幅画 + 四个入口便签

**首页只留两块：你给的那幅画，和压在接缝上的「快速使用」。** 你定的口径是
「完整使用这张背景图，不要缩小比例、也不要放大比例」，同时把小节砍掉。

- **整幅画就是首屏。** `首页背景-双人聊天版.png`（2590×1619）不再缩到 2400 宽、也不再底边对齐
  裁掉顶部 —— 首屏的盒子直接按这幅画自己的比例 **2590 : 1619** 定高，背景照这个盒子铺。
  1440 宽的窗口下首屏就是 **1440 × 900**：画完整，没有裁切，也没有拉伸，只是跟着窗口宽度等比走。
  源图本身也不再重采样：`assets/hero-plate.webp` 就是 2590 宽的原始尺寸（524 KB），
  `prepare_assets.py` 的 `build_home_field()` 默认值已改成 2590。
- **砍掉下面五块。** 今天心情 + 行动卡 + 打卡、三层陪伴、科普 + 可约教练、五维自评 + 徽章墙、
  「不需要一个人扛」收尾，全部从页面上删掉，`home.css` 里只服务这几块的选择器也一并清掉
  （首页是唯一加载 `home.css` 的页面，删掉不影响其它十五页）。页面现在到「快速使用」就结束。
- **接缝与草皮保留。** 四张入口便签仍然骑在画与地的接缝上（下沿探到画外 34px），画外的草皮
  还是从这幅画自己的底边切出来的，所以画和地之间没有色阶。页脚照旧。
- **窄屏换一种站法。** 一行放不下四张便签时（≤1180）它们排成两列两行 —— 这么高的一摞骑在接缝上
  会盖住画里的人，所以整排落到画下面，站在草皮上（草皮按两行的高度留白）。
- 校验：`verify.mjs` 五个宽度全过（无横向溢出 / 越界 / 文字溢出，页面高 1095 而不是 3098）；
  `collisions.mjs` 六个宽度无重叠，包括「有没有元素压到画里的两个人」；逐像素比对首屏与源画，
  除了页头、文案、便签这三处 UI 之外，画面其余部分的平均色差 **1.5/255**（见自检表）。
- **后来按你给的「人物缩小版」又换了一次背景。** 现在用的是
  `演示图/首页背景-双人聊天版-人物缩小.png`（2730×1536，同一幅画、16:9、两位人物更小）→
  `assets/hero-plate.webp`（2730 宽原尺寸）+ 草皮 `assets/hero-ground.webp`（同一幅画底边重建）。
  首屏盒子按这幅画的比例 **2730 : 1536** 定高，1440 宽下首屏 **1440 × 810**（原来 900），
  页高 1095 → **1005**；人物实测落在横向 55%–66%、纵向 70%–82%（校验脚本里的框跟着收紧了）。

### 首页 —— 换「双人聊天版」整幅画

**首页首屏换成你给的「双人聊天版」整幅画。**

- 背景就是 `演示图/首页背景-双人聊天版.png`（2590×1619，比例 1.6）本身，缩到 2400 宽转成
  `assets/hero-plate.webp`，按**底边对齐**铺满首屏 —— 首屏最后一行像素就是这幅画的草地。
- **人物不再单独叠一层**：原先那张两人插画（`hero-scene.webp`）从页面上去掉了，人已经画在背景里。
- 首屏下面的草皮也从**同一幅画**的底边取（按行归一再上下镜像），所以画与地之间没有色阶：
  实测跨缝最大色差 9–10/255，与上一版 12/255 同一量级。
- 画里两个人落在横向 55%–64%、纵向 72%–83%（按画面的墨色量出来的）。文案落在左上那片留白，
  便签钉在右上，四张入口便签钉在画与地的接缝上 —— 校验脚本现在会按这幅画的几何反推出两人的
  矩形，逐个检查有没有元素压上去：**1060→1960 每 20px 扫一遍，46 个宽度全部不压人、无横向溢出**。
- 窄屏（≤1180）四张便签会排成两行、盒子往上长，所以那里改回文档流，不再压在画上。

### 首版 —— 十六页手绘风

前提变了：这套前端要接回你自己的后端，所以除首页外都保持原有页面的结构与行为，
手绘风只落在画风与背景上。四条改动：

1. **首页的两个小人放大一档。** 文案那一列收窄、插画那一列相应加宽（`1fr : 1.22fr`），
   插画再吃进一点页边距 —— 插画从 535×305 变成 629×358，**线性放大 17%**。
   这是纯版面放大，没有裁图；如果你要更明显，我可以把素材裁到两人附近再放大（代价是画面
   两侧的草地被裁掉）。
2. **自我教练端回到原有实现，只换画风与背景。** 中间那块视频面仍然是灰的（摄像头没开），
   站在上面的是**原来那套 3D 陪伴角色**：状态视频 → canvas 黑幕抠像 → 眨眼覆盖层 → 落地阴影，
   与 `MindBasic-frontend/src/components/ai-lab/CompanionSprite.vue` 同源（状态名、素材文件名
   都保持一致）。**对话不再是写死的**：由 `scripts/self-coaching.js` 里的 `TURNS` 数组渲染出
   原来的那套结构，接后端时把它换成 socket 推来的数组即可。
3. **除首页外都是同一张背景图，而且是固定背景。** 不再把图拉长铺满整页：`cover` 按视口算，
   页面在背景上滑过去，背景图不变形也不变样；十三页内层页面共用这一条规则
   （`styles/pages.css` 第 0 节）。情绪日记那一页保留跟随滚动 —— 它是「一整张摊在草地上的纸」，
   纸面占满整页，背景要跟着纸一起缩放（那张图登在上一版就是 approved 的，逐像素一致）。
4. **内容框整体上提。** 内层页面原来的「图片带 + 草皮」骨架撤掉了：页头不再是一块 540px 高的
   画面，而是页头字标下面直接接标题与正文。第一个框从距顶约 580px 提到 **227–269px**。

## 这一版做了什么

上一版只有首页、自我教练、情绪日记三页。这一版按你的三条总体要求补齐：

1. **`web-background.png` 是整站的背景。** 每个页面都是同一片草地：页面顶部是这张图本身的一条
   横切（底边对齐，所以那条带子的最后一行像素就是它的草地），再往下由同一张图的草皮无缝续下去，
   页头到页脚都站在同一片地上。自我教练与情绪日记两页整幅铺的就是这张原图。
2. **自我教练的视频区改成灰色，3D 小人与多模态线索一个字没动。** 舞台（中间那块视频区）现在是
   一块空的视频面 —— 摄像头的画面本来就是这里的内容，所以它是灰的，而不是一张插画。3D 陪伴角色
   仍按原比例（625×947 整帧不切边）站在上面；多模态线索面板、对话、控制条、提示行全部保持原样。
3. **其余页面只换画风与背景。** 找教练、教练档案、科普中心、文章、登录、注册、我的成长、成长测评、
   社群、个人资料、服务协议、预约、自我教练历史，共十三页，都是从
   `项目主体/项目代码/MindBasic-frontend` 的对应页面搬过来的结构、文案与顺序，只换成手绘风、
   换到这片草地上。

**首页、情绪日记两张图与上一版逐像素一致**（2× 渲染下最大色差 0）。只有自我教练那张按你的要求
变了视频区 —— 差异范围正好是那块视频面的矩形（CSS 16,216 → 1040,826），画面上其它元素一个
像素都没动。

## 目录

```
frontend_hand/
  演示图/                  产物（4 张；上一版的 3 张在 _上一版/）
  demo/                    页面源码
    vite.config.mjs        接后端时的开发服务器（/api 与 /socket.io 代理到 127.0.0.1:8000）
    index.html             首页
    self-coaching.html     自我教练（AI 语音/视频对话）
    self-coaching-history.html  自我教练历史
    emotion-journal.html   情绪日记（手账）
    coaches.html           找教练（列表）
    coach-detail.html      教练档案
    booking.html           预约咨询
    articles.html          科普中心
    article-detail.html    文章
    login.html             登录
    register.html          注册
    my-growth.html         我的成长
    assessment.html        成长测评（五维自评）
    communities.html       社群
    profile.html           个人资料 / 数据与隐私
    notifications.html     通知中心
    wallet.html            钱包（余额 · 充值 · 流水）
    forgot-password.html   找回密码（邮箱验证码）
    community-detail.html  社群详情（加入 / 发帖 / 点赞）
    terms.html             服务协议与免责声明
    admin.html             管理工作台 · 概览（只给 ADMIN）
    admin-users.html       管理工作台 · 用户
    admin-articles.html    管理工作台 · 内容（文章 + 分类）
    admin-coach-audits.html 管理工作台 · 教练审核
    styles/tokens.css      调色板、字体、字号、留白
    styles/base.css        重置、纸面、手绘下划线等共用件（**不再 @import**：每页 <head> 里
                           并列 tokens → fonts → ui → base → pages，见「切页那一下」一节）
    styles/ui.css          共用界面层：字标与导航、手绘按钮、纸面与便签、页脚、表单、表格、
                           空状态，以及内层页面的骨架 `.plate` / `.ground`；
                           第 12 节是密集列表那套 `filter · table · pager`（工作台在用）
    styles/pages.css       内层页面各自的版式（卡片、时段、时间轴、量表、订单…）
                           第 0 节是「除首页外的同一张固定背景」
                           第 10 节是管理工作台那四页
    styles/home.css        首页版式
    styles/vue-pages.css   两个挂载页共用的一层：原组件 --color-* 令牌映射 + Tailwind 工具类替身
    styles/self-coaching.css  自我教练页的画风层（原组件自带的样式在 scripts/self-coaching-app.css）
    styles/emotion-journal.css 情绪日记页的画风层（原组件自带的样式在 scripts/emotion-journal-app.css）
    styles/fonts.css       自动生成，勿手改
    vue/                   自我教练页的构建工程（Vite + @vitejs/plugin-vue）
      vite.config.mjs      把原项目 src 下的 SFC 直接引进来编译；两个入口各出一份 IIFE
      main.js              自我教练入口：createApp(VideoCallView).mount('#app')
      journal-main.js      情绪日记入口：createApp(EmotionJournalView).mount('#app')
      shims/               api / router / 录音上传 三个替身（socket.io 没有替身，始终连真后端）；
                           页面带 ?live=1 或在登录页登录过时，api 替身自动改成转真后端
      node_modules         指向 项目代码/MindBasic-frontend/node_modules 的目录联接
    scripts/self-coaching-app.js   构建产物：原组件编译出来的 IIFE（155 KB）
    scripts/self-coaching-app.css  构建产物：三个 SFC 的 <style scoped>
    scripts/emotion-journal-app.js   构建产物：情绪日记那五个 SFC 编出来的 IIFE（102 KB）
    scripts/emotion-journal-app.css  构建产物：它们的 <style scoped>
    scripts/api.js                 演示站的数据层：只在「接后端」模式下发请求
    scripts/auth-guard.js          登录守卫：真接后端时没登录就送登录页（file:// 不拦）
    scripts/session-nav.js         页头右上角跟着登录状态走：登录后换成「<昵称> · 个人中心」
    scripts/admin-shared.js        管理工作台共用的一层（window.AdminKit）：状态怎么叫、
                                   画成哪枚小标签、骨架行、401/403 请回首页
    scripts/admin.js               概览页的取数 + 重绘
    scripts/admin-users.js         用户页：查人、停用 / 恢复（就地确认）
    scripts/admin-articles.js      内容页：文章增删改上下线 + 分类那块面板
    scripts/admin-coach-audits.js  审核页：列表、那一份申请、通过 / 驳回
    scripts/notifications.js       通知：列表、标已读、全部已读、未读角标
    scripts/wallet.js              钱包：余额、充值（元→分）、流水分页
    scripts/forgot-password.js     找回密码：发验证码（purpose=RESET）+ 重设
    scripts/community-detail.js    社群详情：加入 / 退出、帖子、发帖、点赞
    scripts/profile.js             个人资料 + 邮箱绑定 + 改密码 + 导出 + 停用 / 删除
    scripts/<页面>.js              十二个内层页各自的取数 + 重绘（演示模式下整段不执行）
    companion/             指向 assets/companion 的联接 —— 原组件走站内绝对路径 /companion/…
    assets/                54 个素材（全部从素材库2.0 切出）
                           + 首页两件（hero-plate / hero-ground，从「双人聊天版」那幅画切出）
                           + 场地图（field-bg / field-ground / field-full，首页之外共用）
                           + emotion-journal-bg（自我教练页自己的背景，客户端给的更新版）
                           + field-watercolour（情绪日记页自己的背景，客户端给的纯水彩草地版）
                           + field-grass（自我教练页自己的背景，客户端给的纯水彩草地背景）
                           + field-tree / field-cabin（科普中心 / 真人教练的专用背景，同系列）
    assets/companion/      原来的 3D 角色素材（girl-breath/thinking/speaking.mp4、girl.png …）
    fonts/                 自托管字体子集（LXGW WenKai 1164 字形 238 KB；Noto Sans SC 三档各 153 KB）
    tools/                 素材、字体、截图、校验脚本
                           admin-live-check.mjs 是管理工作台那四页的联调自检，
                           account-live-check.mjs 是用户端那几页的（都会还原数据），
                           stress-check.mjs 专测「断不开的长串会不会顶破版式」，
                           font-check.py 查字体子集够不够，first-paint-check.py 查
                           「首帧底色 ≈ 背景图平均色」，coach-call-check.mjs 走一遍自我教练的
                           「开始 → 暂停 → 继续 → 结束」（假麦克风 + 真 socket）
  .gitignore
```

`node_modules` 是指到 `项目主体/手绘风前端/node_modules` 的目录联接，只为借用里面已装好的
Playwright，不重复占空间。

## 页面清单

### 首页（`index.html`）

| 位置 | 内容 | 用了什么素材 |
| --- | --- | --- |
| 页头 | 小苗 logo + 斐思同行；首页／自我教练／情绪日记／真人教练／科普中心；注册／开始登录 | 项目已有的 `logo-sprout.png` |
| 第一屏 | **就是那幅画本身**（整幅，按 2730:1536 铺满页宽）：大标题、副标题、两个按钮、三枚小标签（右上角那枚「说出来，就轻一点」便签按你说的去掉了） | `首页背景-双人聊天版-人物缩小.png` → `hero-plate.webp` |
| 快速使用 | 四张入口便签：自我教练／情绪日记／找教练／科普中心，骑在画与地的接缝上 | 小苗·倾听、表情·平静、一把椅子、一本书 |
| 页脚 | 热线 12356、AI 免责声明、服务条款／隐私政策 | 共用页脚（`ui.css`） |

页面到此结束 —— 主页下面不再有其它小节。

### 自我教练（`self-coaching.html`，复用 `VideoCallView.vue` + `VideoCallPanel.vue`）

| 位置 | 内容 |
| --- | --- |
| 页头 / 页脚 | 与首页同一套导航与合规页脚 |
| 历史记录 | 右上入口，指向 `self-coaching-history.html` |
| AI 条 | `AI 生成` 徽章 + 免责声明 |
| 整页 | **原前端的 `VideoCallView.vue` 本身**，挂在 `#app` 上（不是照抄的静态页）。页面上一共有四态： |
| ① 通话前 | 光球里的 3D 角色、「自我教练」、说明、**三项分项授权**（麦克风与转写＝必需 / 多模态线索开关 / 摄像头画面开关）、「开始自我教练」 |
| ② 设备启动中 | 转圈 +「设备启动中…」 |
| ③ 通话中 | 舞台是自己的摄像头画面；摄像头关着就是「摄像头已关闭 / 只用语音也能继续，AI 仍然听得见你」+ 开启按钮，右下角是**陪伴角色浮窗**（头像 + 状态点）；侧栏是对话标题 + 多模态线索（开关 + 融合/语调/文本/面部/ASR）+ 对话流；底栏是音量波形 + 清空 / 开启摄像头 / 暂停 / 说完了 / 打断 / 结束通话（按状态出现） |
| ④ 通话后 | 「记录到情绪日记？」弹窗（暂不记录 / 记录到日记）；另有首次进入的「AI 自我教练说明」弹窗（记住已读） |

舞台上的其它状态也都在：AI 看画面的说明条、摄像头提示、长时间没说话的「我在听，慢慢来，
不着急」→ N 秒倒计时 → 自动结束通话（含「继续通话」按钮）、以及错误条。

比例照原代码：控制台整幅铺开、左右各留 16px，侧栏固定 372px，舞台占其余宽度
（1440 下 1024 : 372）。**通话台占满第一屏，页脚被挤到折线以下**（往下滑一点才看到）。

两条与「以前那套代码」对齐的细节：

- **舞台尺寸是固定的。** 原版把整页钉在视口里（`position: fixed; top/bottom`），高度确定，
  所以舞台 / 侧栏填满一屏、**对话多了只在对话区里自己滚**。这一页的 `#main` 也必须给**确定高度**
  （`height: calc(100vh - 页头高)`；写成 `min-height` 会让对话区失去约束，消息一多整列被顶高、
  舞台跟着变大）。
- **本地假服务端已删。** 这一页**始终用真的 socket.io-client**：接上后端就是真会话；没后端
  （或 `file://`）就如实显示「服务未连接」，点「说完了」也不会再自己冒出一句话。
  代价是这一页的出图需要**后端 + 开发服务器都起着**（`tools/render.mjs` 会自己判断：
  都在就走开发服务器并登录演示账号，否则退回静态服务、图上就是「服务未连接」）。
- **socket 握手要登录**：后端对没有 token 的连接会「拒绝未登录连接」（它日志里的原话），
  页面只显示一句「后端连接失败」，看不出该干什么 —— 所以 `scripts/self-coaching-note.js`
  在**没登录时于通话台上方贴一张纸**（「还没登录 · 去登录」），登录过就什么都不显示。

**3D 陪伴角色就是 `CompanionSprite.vue` 本体**（状态视频 → canvas 黑幕抠像 → 眨眼覆盖层 →
落地阴影，眼位、时长、阈值都是项目里的原值），素材在 `assets/companion/`，
文件名与原项目 `public/companion/` 一致。

**这一页怎么「挂」起来的**：demo 是纯静态页、没有前端脚手架，所以 `demo/vue/` 下放了一个
只服务这一页的构建（Vite + `@vitejs/plugin-vue`），把原项目的
`views/VideoCallView.vue`、`components/ai-lab/VideoCallPanel.vue`、`CompanionSprite.vue`
**直接引进来**编译成 `scripts/self-coaching-app.js`（IIFE，双击 `file://` 也能跑）+ 同名 CSS
（就是三个 SFC 的 `<style scoped>`）。组件、模板、状态机、文案、socket 协议一个字没改，
这边只做两件事：换画风（`styles/self-coaching.css`）和换背景图。

三处「没有后端就没有的东西」用本地替身顶上，接后端时删掉 alias 即可：

| 替身 | 顶上的是什么 | 接后端时 |
| --- | --- | --- |
| ~~`vue/shims/socket-io-client.js`~~（**已删**） | 曾经是一个「只演这一页」的假服务端（接上就按剧本回话）。按你的要求整个删掉了 —— 这一页现在始终用真的 socket.io-client | 无需再删 alias |
| `vue/shims/api-client.js` | `/platform/config`（AI 横幅与热线）与 `/ai-conversations/{id}/summary`（总结成情绪日记草稿） | 删掉 `@/api/client` 这条 alias |
| `vue/shims/vue-router.js` | `RouterLink` / `router.push` → 本站对应的 `.html`（历史记录、情绪日记、服务协议…） | 页面接进真前端时用真的 vue-router |

另有一处小替身 `vue/shims/audio-upload.js`：录音上传 `/api/vc_audio_upload` 在页内接住，
于是「对着麦克风说话 → AI 回复」这条路在演示里也是通的。

> **这一页要看 3D 角色，请用本地服务打开**（`启动预览.cmd` 或
> `python -m http.server 5178 --bind 127.0.0.1`）：原组件的素材路径是站内绝对路径
> `/companion/…`，`file://` 下那是指向磁盘根目录。`node tools/render.mjs coach` 会自己起一个
> 小静态服务，所以出图不受影响；用 `file://` 打开时角色位置是空的（控制条、对话、状态都照常）。

### 情绪日记（`emotion-journal.html`，复用 `EmotionJournalView.vue`）

**整页是原前端的 `EmotionJournalView.vue` 本身**（连它带的 `MoodFace` / `QuoteBlock` /
`EmptyState` / `ErrorBanner` 一起），挂在 `#app` 上 —— 和自教学页同一套做法。内容照原组件：
页头「把此刻写下来」、来自自我教练的提示、此刻的感觉（六个心情）、写一句话 + 字数 +
「记录此刻」、AI 回应、月历 + 心情记录并排、近 30 天分布、「今日一句」。**能真的用**：
选心情、写、提交（新记录进列表并回一句 AI 回应）、删记录、翻月份、点某天筛记录。

画风（`styles/emotion-journal.css`）只做两件事 —— 全用素材库 2.0 的素材：

| 落点 | 用了素材库 2.0 的什么 |
| --- | --- |
| 整页 | **手账纸**：`方格纸` 做纸面（放大到只露纸面本身，不露素材自带的边框）、纸角一枚`图钉` |
| 书写区 | 就是一块纸，**上面不压任何东西**（素材库那两张「纸」实测都是透明底线稿，只留纸、不留线）；正在写时整块纸框一圈 2px 墨线 |
| **六个心情** | **六张表情贴纸**替掉原组件用 SVG 画的小脸 —— 心情选择器、记录卡、近 30 天分布三处用同一张 |
| 选中 / 今天 | `对勾` 贴纸、`圈注圆圈` 圈住今天那一格 |
| 今日一句 | `粉色图钉` 钉住的一张黄便签 |

原版那两个装饰光晕（`radial-gradient` + `blur`）在这套画风里拿掉了。背景换成
`首页背景-纯水彩草地版.png`，**固定不动**（`cover + fixed`，与真人教练那一页同一套）。
书写区拿到焦点时不再用全站那圈深绿（`--focus`），改成书写区整块纸自己框一圈 2px 墨线 ——
提示照样看得见，压在纸上也顺眼。

数据也是本地替身（`vue/shims/api-client.js` 里的 `/emotion-journals` 系列）：三条示例记录、
10 月那一片心情点、近 30 天分布（9/6/5/3/2/1）都照上一版演示稿；**提交和删除是真的**
（内存里生效，刷新回到示例）。接后端时删掉 alias 即可。

### 真人教练（`coaches.html`，复用 `CoachesView.vue`）

页头是「找到适合你的教练」；一个标签筛选条（考前焦虑／职场压力／亲子沟通／情绪低落／目标规划）
加一个昵称搜索框；六张教练卡（两位一列），每张是「象征物 + 昵称 + 从业年数 + 标签 + 服务理念 +
评分与最近可约」，象征物用的是素材库的八个教练物件（茶／椅子／猫／灯／植物／围巾／书／月亮）；
下面一节「预约怎么走」用三张便签说明下单前沟通、可约时段、评价与改期。

### 其余十三页（只换画风与背景）

| 页面 | 对应原页面 | 要点 |
| --- | --- | --- |
| `coach-detail.html` | `CoachDetailView.vue` | 教练档案、服务理念、服务项目与价格、未来 14 天可约时段（含「已约满」）、用户评价、右侧下单卡 |
| `booking.html` | `BookingView.vue` | 三步下单（选服务 → 选时段 → 写情况）+ 右侧订单摘要 |
| `articles.html` | `ArticlesView.vue` | 分类筛选 + 七条文章（置顶标记、摘要、日期） |
| `article-detail.html` | `ArticleDetailView.vue` | 单栏 720 正文、小标题、清单、引语块、文末「什么时候该找人聊」 |
| `login.html` | `LoginView.vue` | 密码登录 / 邮箱验证码 —— **一个框、两个标签切换**：选哪个只出现哪个方式的两格输入（`scripts/login.js`，标签按 ARIA tabs 接，左右方向键也能切；「获取验证码」走 60 秒倒数）。卡片下面那条协议提醒与页脚**都推到折线以下**（往下滑才看到，`pages.css` `.auth__aside` 的 `margin-top`） |
| `register.html` | `RegisterView.vue` | 手机号、昵称、密码、确认密码、协议勾选（「注册之后能做什么」那一块按你说的去掉了）。对应地，卡片底下的页脚也**推到折线以下**（往下滑才看到，`pages.css` 的 `body.page-register .auth`） |
| `my-growth.html` | `MyGrowthView.vue` | 连续记录 + 七天格 + 三个统计；情绪/对话/测评/打卡混排的时间轴；五维与徽章墙 |
| `assessment.html` | `GrowthAssessmentView.vue` | 十个五维题目 + 1–5 量表 + 上一次结果 |
| `communities.html` | `CommunitiesView.vue` | 我加入的社群（四张卡）、帖子流（置顶/教练标记）、发帖规则、危机渠道、空状态 |
| `profile.html` | `ProfileView.vue` | 基本资料表单、账号信息、数据与隐私（导出／停用／永久删除） |
| `terms.html` | `TermsView.vue` | 十节服务协议与免责声明，含 AI 边界、紧急情况、隐私与数据权利 |
| `self-coaching-history.html` | `SelfCoachingHistoryView.vue` | 会话记录列表（走到四步里的第几步、有没有行动卡、风险提示筛选） |

## 设计取向

- **首页：一幅画，一条接缝，四张便签。** 首页短了：第一屏就是客户端给的「双人聊天版」整幅画，
  首屏盒子按画自己的比例 2730 : 1536 定高，所以画既不被裁、也不被拉（1440 宽 → 1440 × 810）。
  画的下沿就是接缝，`.ground` 从这幅画自己的底边接着往下铺草皮，只留一小段给四张入口便签落地
  （实测跨缝最大色差 9–10/255）。文字落在画面左上的留白区，校验脚本按画面几何反推人物位置，
  确认没有任何元素压在人身上。再往下没有别的小节，只有页脚。
- **内层页面：默认同一张背景图，固定不动。** `body` 上是 `cover` + `fixed`：按视口算尺寸，
  所以页面多长都不会把图拉长变形，往下滚就是内容在背景上滑过去。默认用客户端给的
  `首页背景-纯水彩草地版.png`；**科普中心**换成同系列的「带树」、**真人教练**换成「木屋」
  （各加一个 body 类 `field-tree` / `field-cabin`，规则都在 `pages.css` 第 0 节）。
  首页用「双人聊天版」、自我教练页用「纯水彩草地背景」、情绪日记页用默认那张 —— 三页各自
  在自己的样式表里，互不影响。
- **每张图都用它画的那个东西。** 椅子就是教练的椅子，印章就是印章，草地就是草地；没有把插画
  当装饰凑数，也没用 CSS 去假装画面。
- **不重要的部分就只换画风与背景。** 内层十三页的结构、文案、字段、顺序都照原前端搬过来，没有
  重新设计；换的是纸、墨线、手写字和脚下的地。原前端的 `catalog-tab` 眉眼题（「CO 找教练」这类
  编号小标）没有搬过来 —— 标题自己就是标题。
- **字是真的字。** 标题、正文、按钮文案都是可选中的文本；插画里自带的字留在画面里。
- **示例数据都标了。** 教练、评分、时段、文章、分数、帖子都是占位内容，页面与页脚都写明
  「示例数据 / 设计演示稿」。

## 接后端（可选）

演示站平时是**纯静态**的（数据是页面里带的示例，两个挂载页走本地替身）；它也可以**接你自己的后端**：

```bash
# 1. 起后端（MySQL83 服务在跑、后端目录已有 .venv 与 .env）
cd 项目主体/项目代码/MindBasic-backend
.venv\Scripts\python.exe scripts\run_dev.py            # uvicorn app.main:socket_app → 127.0.0.1:8000

# 2. 用带代理的开发服务器打开演示站（把 /api 与 /socket.io 转给后端，和原前端 vite.config.ts 同一套）
cd 项目主体/frontend_hand/demo
node vue/node_modules/vite/bin/vite.js --config vite.config.mjs    # → http://127.0.0.1:5178
```

然后走**登录页**进去（演示账号：`13900000002 / Demo123456` 普通用户、`13900000001 / Demo123456` 教练）。
登录成功会把 accessToken 存进 `mb_access_token`（原前端约定的键），并记下 `feisi_backend=live`，
这台浏览器之后就走真数据。也可以单页临时切：地址后面加 `?live=1`（例如 `emotion-journal.html?live=1`）。
**想回演示数据**：清掉 localStorage 的 `feisi_backend` 即可（或者直接双击 .html 打开）。

### 只有登录才能使用（`scripts/auth-guard.js`）

每个用户页面最前面都引了这份守卫。它只在**真接后端**的时候拦人，判断顺序是：

1. `file://` 打开（双击 .html）→ **不拦**：那是看设计演示稿的用法，页面里写好的示例照旧能看，
   `演示图/` 出图与 `verify.mjs` / `collisions.mjs` 也都走这条路，不受影响；
2. http(s) 打开但后端不在（`/api/v1/platform/config` 取不到）→ **不拦**，同样当静态演示看；
3. http(s) 打开、后端在、**没有 token**（或 token 已 401 失效）→ 跳到
   `login.html?next=<原来那一页>`，登录完**回到原来那一页**（`scripts/login.js` 认 `?next=`，
   只接受本站 `xxx.html` 形式的相对地址）。

**`index.html` / `login.html` / `register.html` / `forgot-password.html` / `terms.html` 五页不禁**：
首页是门面，未登录也能看（四个入口点进去才要求登录）；登录与注册是进门的门，禁了会自己跳自己；
找回密码更不能禁 —— 忘了密码的人本来就登不上；协议页允许未登录阅读（登录与注册表单里都要点它）。

### 页头右上角跟着登录状态走（`scripts/session-nav.js`）

登录之后，页头右上角那组换成 **「通知」+「钱包」+ 一枚按钮**：普通用户那颗写「个人中心」、
指到 `my-growth.html`；**角色是 ADMIN 时写「管理工作台」、指到 `admin.html`**。
没登录时保持页面里原本写的样子（首页是「注册 / 开始登录」）。页头不放昵称、也不放退出登录
—— 两者都在个人中心页里（见下）。

「通知」后面跟着一枚黄色小标签，写没读过的条数（0 条时不显示，超过 99 就写 `99+`），数字来自
`GET /notifications/unread-count`；通知中心里标完已读会顺手把这枚角标也刷新（`window.FeisiNav.refreshUnread`）。

**「退出登录」在个人中心页里**（`my-growth.html` 底部那块「账号」面板：显示「现在是谁登录着」
—— 昵称 + 手机号掩码 —— 加一颗退出按钮）。这份脚本会接上**页面上任何一颗 `[data-logout]`**
并把它从 `hidden` 放出来，所以动作只有一处实现、放哪一页都行；静态演示（`file://`、没登录）
时那颗按钮保持隐藏。退出会真的打 `POST /auth/logout`（后端清掉 httpOnly 的 refresh Cookie），
再清掉本地的 `mb_access_token` / `feisi_backend` / `feisi_nickname` / `feisi_role`，
最后回首页 —— 首页不需要登录，所以不会绕回登录页；退出之后再打开需要登录的页面，
会被守卫送回 `login.html?next=…`。

**不会闪**：有 token 时，这段脚本在解析到页头之前就先注入一条
`.masthead__actions{visibility:hidden}`，然后用**登录时缓存下的昵称**（`feisi_nickname`）
立刻画出登录态、随即撤掉那条样式，最后才去 `/users/me` 校准昵称 —— 所以翻页时不会先闪一下
「注册 / 开始登录」那颗黄按钮（实测把 `/users/me` 拖慢 3 秒，页头在第一帧就已经是
「通知 钱包 个人中心」）。
和守卫一样只在**真接后端**时改：`file://` 打开或后端不在时一律不动，所以 `演示图/` 出图与
`verify.mjs` / `collisions.mjs` 记录的还是静态那份。

| 页面 | 接后端之后 |
| --- | --- |
| `login.html` | 「密码登录」真的打 `POST /api/v1/auth/login`；「邮箱验证码」那一栏打 `/auth/email-code`（LOGIN）+ `/auth/email-login`，两条路都存 `mb_access_token` / `feisi_backend` / `feisi_nickname` / `feisi_role` 并按 `?next=` 跳转 |
| `self-coaching.html` | 真 socket.io（带 token 握手）、AI 横幅与热线来自 `/platform/config`、点「开始自我教练」真的开一条会话（后端日志 `[VC] 视频通话开始 | 会话=494`，落库） |
| `emotion-journal.html` | 记录 / 近 30 天分布 / 月历都来自后端，提交与删除真的写库（这个演示账号目前 0 条，所以显示空态） |
| `register.html` | 表单真的打 `POST /api/v1/auth/register`（前端先校手机号 / 密码长度 / 两次一致 / 勾选），成功即登录并把昵称 / 角色一起缓存。**闸门是「页面是不是 http(s)」**——注册页是给还没登录的人用的，用 `api.live` 会整段不执行（这个坑踩过，见上面那节） |
| `coaches.html` | 标签换成后端 `/tags?type=FIELD`，卡片来自 `/coaches`（筛选走 `tagId`、搜索走 `keyword`，都由服务端筛） |
| `coach-detail.html` | 档案 / 服务项目 / 可预约时段 / 用户评价来自 `/coaches/{id}`、`/slots`、`/reviews`；`?id=` 选教练 |
| `articles.html` | 分类来自 `/article-categories`，列表来自 `/articles`（分类筛选服务端做）；接后端模式下**去掉列表下面那句说明**，并把正文撑到至少一屏，让页脚那条提醒落在折线以下（一进页面不再被说明挡住）；页脚那行改成「内容来自平台内容库」。演示模式（`file://`）保持原样 |
| `article-detail.html` | 标题与正文来自 `/articles/{id}`（正文是后端编排的 HTML）；`?id=` 选文章 |
| `booking.html` | 教练 / 服务项目 / 时段来自后端，「提交订单」真的打 `POST /appointments` |
| `my-growth.html` | 连续天数、三项统计、周格、时间轴、徽章来自 `/check-ins/stats`、`/emotion-journals`、`/self-coaching/records`、`/growth-assessments`、`/users/me/badges`；右栏「账号」面板：显示当前登录的昵称 + 手机号掩码，并放**退出登录**（从页头挪过来的，「账号」面板是这个页面的落点） |
| `assessment.html` | 题目来自 `/growth-assessments/template`（后端是 15 题），提交走 `POST /growth-assessments` |
| `communities.html` | 社群来自 `/communities`（我加入的走 `/communities/mine`）；帖子接口要成员身份，非成员显示空态 |
| `profile.html` | 资料来自 `/users/me`（手机号只回掩码、只读），保存走 `PATCH /users/me`；邮箱绑定 `/auth/email-code`（BIND）+ `POST /users/me/email`；改密码 `POST /users/me/password`（改完 token 作废，回登录页）；导出 `POST /users/me/data-export` + 列表 + `.../{id}/download`（取回 Blob 再点下载）；停用 `POST /users/me/deactivate`、删除 `POST /users/me/delete` |
| `notifications.html` | 列表 `/notifications`（`unreadOnly` 服务端筛）、角标 `/notifications/unread-count`、`POST /notifications/{id}/read` 与 `/notifications/read-all` |
| `wallet.html` | 余额 `/wallet`、流水 `/wallet/transactions`、充值 `POST /wallet/topup`（**模拟充值**，直接到账余额） |
| `forgot-password.html` | 验证码 `POST /auth/email-code`（purpose=RESET）、重设 `POST /auth/reset-password`；这一页**不需要登录** |
| `community-detail.html` | 抬头 `/communities/{id}`、加入 / 退出 `POST /communities/{id}/join\|leave`、帖子 `GET\|POST /communities/{id}/posts`、点赞 `POST …/posts/{postId}/like`；非成员看帖是 403，页面按「加入之后才看得到」处理 |
| `terms.html` | 协议正文来自 `/platform/agreement`（后端下发 Markdown，这里做最小转换）；这一页不用登录，所以闸门同样是 http(s) 而不是 `api.live` |
| `self-coaching-history.html` | 记录来自 `/self-coaching/records` 与 `/ai-conversations` |
| `admin.html`（**管理工作台 · 概览**） | 只给 ADMIN：概览来自 `/admin/stats`，待办的危机预警与教练审核来自 `/admin/crisis-flags`、`/admin/coach-audits`，两个列表来自 `/admin/users`、`/admin/articles`；顶部那排模块导航指到下面三页 |
| `admin-users.html`（管理工作台 · 用户） | 列表来自 `/admin/users`（`keyword` / `role` / `status` / `page` 服务端筛），停用与恢复走 `PATCH /admin/users/{id}/status`；「你自己」那一行的开关是禁用的 |
| `admin-articles.html`（管理工作台 · 内容） | 文章来自 `/admin/articles`，写 / 改走 `POST` 与 `PATCH`，上下线走 `PATCH {status}`，删除走 `DELETE`；分类来自 `/admin/article-categories`（增 / 改名 / 启停 / 删） |
| `admin-coach-audits.html`（管理工作台 · 教练审核） | 列表来自 `/admin/coach-audits?status=`，那一份申请来自 `/admin/coach-audits/{id}`（标签 id 用 `/admin/tags` 换名字），通过 / 驳回走 `POST …/{id}/approve` 与 `POST …/{id}/reject`（要写理由） |
| `index.html` | 首页现在只有一幅画 + 四个入口，**没有数据区**，无需接口 |

这四页都只给 ADMIN：没登录会被登录守卫送到 `login.html?next=…`；登录了但不是 ADMIN，
`AdminKit.bounce()` 会在第一次 401 / 403（后端对非 ADMIN 本来就 403）时把人请回首页。

两个细节：

- 后端 `.env` 的 `CORS_ORIGINS` 只写了 5173。演示站跑在 **5178**，所以 `demo/vite.config.mjs`
  的代理里把 **socket 握手的 Origin 重写成 5173**（只改转发出去的那个头），**没有动后端配置**；
  `/api` 走同源代理，也不受 CORS 影响。
- 演示数据（替身）默认仍然生效：`演示图/` 那四张图、`verify.mjs` / `collisions.mjs` 都按演示数据出，
  不受接后端影响。

## 跑一遍

```bash
cd 项目主体/frontend_hand/demo

python tools/prepare_assets.py     # 素材库2.0 → assets/（切边、缩放、转 WebP，含背景两件）
python tools/build_font.py         # 下载 + 子集化自托管字体 → fonts/（扫 HTML + styles/*.css + scripts/*.js）
python tools/font-check.py         # 只查：子集够不够用（缺字时退出码非 0）
python tools/first-paint-check.py  # 只查：每处底色是不是它那张背景图的平均色（不合规非 0）
cd vue && node node_modules/vite/bin/vite.js build && cd ..   # 自我教练页：原前端的 SFC → scripts/self-coaching-app.js
cd vue; $env:FEISI_APP="journal"; node node_modules/vite/bin/vite.js build; cd ..   # 情绪日记页 → scripts/emotion-journal-app.js
node   tools/render.mjs            # → ../演示图/ 四张图（home / coach / journal / coaches）
node   tools/render.mjs home       # 只出首页
node   tools/render.mjs coach coach-idle   # 自我教练：通话中（产物）+ 通话前（.cache/review）
node   tools/coach-call-check.mjs  # 自我教练：开始 → 暂停 → 继续 → 结束（假麦克风 + 真 socket）
node   tools/verify.mjs            # 版式自检（横向溢出、越界元素、图片未加载、文字溢出、字体）
node   tools/collisions.mjs        # 元素重叠自检
node   tools/boxes.mjs 1440        # 逐元素的精确坐标
python tools/preview.py <png> [列数] [x,y,w,h]   # 字符画看构图
python tools/rhythm.py  <png> [分段数]           # 整页疏密节奏
```

看自我教练那页的动态角色，用 `file://` 打开是不动的（浏览器禁止读视频像素），要看动态版本请起服务：

```bash
cd 项目主体/frontend_hand/demo
python -m http.server 5178 --bind 127.0.0.1
# → http://127.0.0.1:5178/index.html
```

十六个页面共用同一套校验脚本，用 `PAGE` 指定要跑哪一页（默认 `index.html`）：

```powershell
$env:PAGE="coaches.html"; node tools/verify.mjs
$env:PAGE="coaches.html"; node tools/collisions.mjs
$env:PAGE="self-coaching.html"; node tools/verify.mjs   # 这一页会自己用假麦克风起设备、点开始
```

改了**挂载页的 Vue 或替身**（`demo/vue/**`）要重跑上面那两条 `vite build`（两条都要，
因为 `@/api/client`、router、`vue-pages.css` 那层是两页共用的）；只改画风
`styles/self-coaching.css` / `styles/emotion-journal.css` 不用重编，刷新即可。

改文案后要重跑 `build_font.py`（它现在也扫 `scripts/*.js` —— 自我教练与情绪日记那两页的文案
在编译包里，不在 HTML 里），否则新字会落到系统字体；跑之前可以先 `python tools/font-check.py`
看差多少。改完字体要重出图（`node tools/render.mjs`），因为字体度量会影响折行与页高。

## 自检结果

| 检查 | 结果 |
| --- | --- |
| 横向溢出（1920 / 1600 / 1440 / 1280 / 1100） | 0 px · **24 页全过** |
| 越界元素 / 图片未加载 / 文字溢出 | 0 · **24 页全过** |
| 指定元素对重叠（内层页面 4 对 × 6 个宽度） | 0 |
| 标题字体 | LXGW WenKai（自托管子集，非系统兜底） · **24 页全过** |
| 字体覆盖（`tools/font-check.py`） | 子集 **1164 个字形**，页面用到的 1053 个字符**一个不缺**（修前缺 573 个，占 60.6%；修完全站文案都在一份字里） |
| `impeccable detect`（静态） | 改动过的那几份文件 **0 findings** |
| `impeccable detect`（渲染整页） | 首页 1 条、自我教练页 **1 条**、情绪日记页 **0 条** —— 报出来的都是「客户定稿色板」那一类，见下面「已知问题」 |
| 情绪日记 与上一版逐像素比对 | 上一版是手抄的静态页，这一版整页换成原组件，所以是整页不同 —— 换来的是「真的能用」（见下） |
| 情绪日记的交互（`PAGE=emotion-journal.html` 实测） | 选心情 → 写 → 提交：记录 3→4 条、AI 回应出现、新记录带「烦躁」标签；删一条 → 3 条；点 9 号 → 标题变「2026-10-09 的记录」、只剩 1 条、出现「清除筛选」；翻到 9 月 → 0 个心情点 |
| 自我教练 → 记录到日记 → 提交（整条链） | 心情自动选中「平静」、正文预填、提交按钮可用；提交后 URL 清掉 query、新记录带「自我教练」来源标签 |
| 情绪日记的背景是固定的（`cover` + `fixed`，同真人教练那页） | 同一屏往下滚 900px 前后，那条背景带的最大差 **8/255**、平均 **0.12** —— 内容在滑，画没动 |
| 首页首屏 与源画逐像素比对（2× 渲染，1440 宽） | 除页头、文案、四张便签这三处 UI 之外，画面平均色差 **1.36/255**（p99 = 8，残留的是浏览器放大的插值差）—— 画贴得准、整幅、比例不变 |
| 自我教练几何（1440 宽） | 舞台 1024 : 侧栏 372；页头 60 + 通话台 840 = 折线 900，页脚 900→965（往下滑才看到；1707×977 与 1920×1080 下同理） |
| 自我教练「越聊越大」的回归检查 | 连续 30 秒 + 反复点「说完了」：**舞台始终 597px**、页高始终 965，只有对话区内部滚动（修前：舞台 596.9→657→755→1049、页高 965→1417） |
| 自我教练「点说完了会不会自己填充」 | 无后端：消息 **0** 条（空态）+「服务未连接」；接后端：消息 **0** 条 +「服务已连接」—— 两种都不会自己冒字 |
| 自我教练普通打开（不带 `?demo`） | 30 秒后消息数仍为 **0** —— 页面不会自己往外冒字 |
| 自我教练文字对比度（深灰舞台，`coach-idle` 出图取像素） | 舞台上的标题 **8.03:1**、说明 **6.03:1**；陪伴卡里的角色与底的亮度差 **155**（改成纸卡时只有 26） |
| 首页背景跨缝（「双人聊天版」→ 它自己的草皮） | 最大色差 9–10/255，无可见台阶 |
| 首页有没有元素压到画里的两个人（1920 / 1600 / 1440 / 1280 / 1200 / 1100 六个宽度） | 全部不压人 · 横向溢出 0 |
| 首页几何（1440 宽，`boxes.mjs`） | 首屏 0→810（= 1440 ÷ 2730 × 1536），四张便签 724.6→846.2，草皮 810→908，页脚 909→1005 |
| 自我教练的四种状态 | 通话前（三项授权 + 开始）→ 点开始 → 设备启动中 → 通话中（聆听/思考/回复三态随剧情切换）→ 结束通话 → 「记录到情绪日记？」弹窗，逐个点过 |
| 自我教练「记录到日记」链路 | 点「记录到日记」→ POST 总结（替身）→ 跳 `emotion-journal.html?mood=calm&content=…&conversationId=1` → 情绪日记页心情选中「平静」、正文与字数（63 / 500）、来源标记 `data-conversation="1"` 全部对上 |
| 自我教练在 `file://` 下 | 页面照常（通话前/通话中/弹窗都在），只有 3D 角色位置是空的 —— 原组件的素材路径是站内绝对路径 `/companion/…`，`file://` 下指向磁盘根目录 |
| 控制台报错 / 请求失败 | 0 |
| 管理工作台四页 · 版式（`verify.mjs` / `collisions.mjs`，1920 → 1100 五个宽度） | 横向溢出 **0** · 越界元素 **0** · 图片未加载 **0** · 文字溢出 **0** · 指定元素对重叠 **0** |
| 管理工作台 · 联调（`tools/admin-live-check.mjs`，真后端 + 管理员账号，跑完数据已还原） | **用户**：共 81 位 · 每页 20 位；翻页与「角色 = 管理员」都跟地址栏对上（`?page=2`）；把 `13900000001` 停用 → 行内标签变「已停用」，再恢复 → 「正常」；「你自己」那一行的开关 `disabled`。**内容**：新建一篇（草稿）→ 排在第一行 → 编辑 → 改成已发布 → 删除，计数跟着回到 3 篇；分类新增 → 4 行 → 删除 → 3 行。**审核**：驳回的请求体是 `{"reason":"资质证明缺第 2 页…"}`、通过打到 `/approve`，两个都对上；真库里 0 条申请，所以显示空态（那一份申请的详情用替身响应验的） |
| 管理工作台 · 越权 | 未登录打开 `admin-users.html` → `login.html?next=admin-users.html`；普通用户（`13900000002`）打开这四页全部 → `index.html` |
| 用户端新页 · 联调（`tools/account-live-check.mjs`，真后端 + 演示账号，退出码 0、控制台 0 报错）| **登录**：密码登录 → 跳到 `index.html`，`mb_access_token` / `feisi_backend=live` / 昵称 / 角色都存下；邮箱那一栏真发码（「验证码已发出」），用错码登 → 后端那句「验证码错误或已过期」出现在表单里。**找回密码**：未登录打开留在本页（没被守卫拦走）；真的打 `/auth/email-code`；重设请求体 `{"email":…,"code":"123456","newPassword":"…"}`。**通知**：真库 0 条 → 空态 + 角标隐藏；给 3 条替身（2 未读）→ 角标显示「2」、点一条变 1、全部已读后「只看未读」进空态，两个 POST 的地址都对。**钱包**：真库 ¥0、流水空；点「充 ¥100」发出 `{"amountInCents":10000}`、余额变 ¥100；自定义 30.5 元 → `{"amountInCents":3050}`；填 0.5 元被拦在「单次最少充 1 元」。**社群**：未加入时帖子区是「加入之后才看得到组里的帖子」；真加入 → 成员数 0→1、发帖出现、点赞变「已赞 1」；然后删帖 + 退出，成员数回到 0。**个人中心**：真资料填进表单（小满 / 139****0002 / 开始于 2026 · 09 · 21）；改密码与删除只验请求体（`{"oldPassword":…,"newPassword":…}` / `{"password":"Demo123456"}`）；导出真跑一次并真的下载到 `mindbasic-data-export-<编号>.json`（连跑第 4 次会撞上后端 3 次/小时的限流，那是 429 的预期行为）|
| 用户端新页 · 越权与页头 | 未登录打开 `forgot-password.html` → **留在本页**（白名单生效）；页头 3 件（通知 + 角标 / 钱包 / 个人中心那颗按钮）在 1920 / 1440 / 1280 / 1100 下都横排得下（普通用户 **188px**、管理员 **246px**，加导航 436px），横向溢出 0、无越界元素 |
| 长内容压力（`tools/stress-check.mjs`，替身塞 120 字 token / 160 字网址 / 60 字中文名） | 通知 / 钱包 / 社群详情 / 个人中心 / 我的成长 **5 页全部 0 溢出、0 越界**（修前 profile.html 是 296px + 57 个越界元素） |
| 页头昵称上限（20 字拉丁 / 19 字中文 / 2 字 × 普通用户与管理员 × 1100 / 1280 / 1440） | 18 组全部 0 溢出，页头那组封顶 **436px**（修前 20 字昵称 563px、溢出 101px） |
| 会话中途过期（`account-live-check.mjs` 第 7 段） | 钱包页把 token 换掉再点充值 → `/login.html?next=wallet.html`，本地 `mb_access_token` 已清空（修前停在原页、坏 token 还在） |
| 通知页「就地改一条」 | 给别的行打 DOM 记号后标记一条已读，记号仍在 → 没有重画整张表；全读完后「全部标为已读」自己禁用 |

页面高度（1440 宽）：首页 **1005**（改版前 3098）、自我教练 **965**（`verify.mjs` 量的静态
demo；走开发服务器时是 **972** —— live 模式下多出来的那条说明，和字体无关）、
情绪日记 **1922**（改版前 1879）、真人教练 **1656**（删掉面包屑后 −32）。
内层页面第一个内容框距顶：找教练 237px、科普中心 208px、登录 / 注册 195px（这四页按你说的
删掉了「首页 / …」那一行面包屑）；个人中心 227px（它的面包屑还在）。

## 已知问题（`impeccable detect` 报出来的，逐条交代）

情绪日记页 0 条；自我教练页与首页各 1 条；内层页面（含管理工作台那四页）各 **1 条** ——
就下面这一条规则：

| 报在哪 | 报什么 | 为什么留着 |
| --- | --- | --- |
| 首页、自我教练页 | `cream-palette`：页面底色是暖米白 | 客户定稿色板里的页面色（`#FFFAF6` / 背景图的米色），十六页共用；这两页的底色实际只在背景图加载的那一瞬和橡皮筋滚动时露出来 |
| 内层页面（找教练 / 我的成长 / 科普中心 / 钱包 / 管理工作台那四页……） | `gray-on-color`：`#6f6459` 的次要文字压在 `#e7edc4` 上 | 检测器拿的是 `html` / `body` 的**兜底底色**，而页面上的次要文字实际都坐在纸面（`--surface` / `--paper`）上；我另用脚本逐页查过：没有一处 `#6f6459` 的文字，它最近的不透明背景是那片草地。这条只是「灰字压在彩色背景上」的风格提醒，**对比度已经够**（见下） |

之前那几条的处置（都验过）：

- **`low-contrast`（3.5:1）—— 已消失。** 那是「次要文字 `#6f6459` 压在草地绿 `#c3cfa4` 上」，
  改底色那轮顺手治好了：现在底色是各图的平均色，实测 `#6f6459` 压在 `#e7edc4` 上 **4.75:1**、
  压在带树 `#f1eedf` 上 **4.95:1**、压在木屋 `#EFE7DB` 上 **4.70:1**，都过了 AA 的 4.5:1。
  `impeccable detect` 在 20 个内层页面上都只剩上面那一条风格提醒。
- **文字对比度**（曾报「白字压在灰面上 2.9:1」）：舞台恢复成深灰的视频面，字按原版用浅色 ——
  取像素实测标题 8.03:1、说明 6.03:1。
- **`pulsing-dot` / `dark-glow`**（`.co-dot` 的脉冲与 0 偏移彩色光晕）：脉冲来自原组件、
  标的是真在变的状态，保留；**我自己写的**三处彩色光晕收掉了，圆点现在是实心的。
- **`low-contrast … via canvas-video-underlay`**：那是检测器把角色那张 canvas 当成文字底衬的
  误报，舞台改成深底之后这条自然消失。

## 还没做的

- **接口已经接齐**（见「接后端」一节）：用户端 19 页 + 管理工作台 4 页都能走真后端
  （首页没有数据区，无需接口；`terms.html` 走的是协议正文）。
  演示模式下页面里写好的示例照旧显示，接后端模式下同一个页面用真数据重绘 ——
  **两种模式共用同一份 HTML 与同一套画风**，出图与校验脚本不受影响。
- **两个挂载页的构建是这两页专用的。** `demo/vue/` 引的是原项目 `src` 下的源文件（不是拷贝）；
  正式接回 Vue 工程时，把 `styles/self-coaching.css` / `styles/emotion-journal.css` /
  `styles/vue-pages.css` 三份画风层带过去即可，`vue/shims/` 四个替身可以整包删掉。
- **自我教练页的角色浮窗在窄屏是「说明上移」处理的。** 原项目 1180px 以下没排过，
  舞台上居中的「摄像头已关闭」说明会和右下角角色卡撞上，这里把说明上移一档。
- **管理工作台还有四块没做。** 概览 / 用户 / 内容 / 教练审核 已经做完；订单
  （`/admin/orders` + 退款）、危机跟进（概览里只列了前 5 条，`/admin/crisis-flags` 还能
  指派 / 跟进 / 结案）、审计日志（`/admin/audit-logs`）、系统配置（`/admin/system-configs`）
  这四块接口都在，页面还没做。
- **用户端还剩这些没有对应页面**（对着原前端 27 条路由数的）：私信会话与教练侧会话
  （`/messages`、`/coach/messages`，原版 ChatView 683 行）、我的订单与支付
  （`/orders/{orderNo}/pay`，现在预约只到「生成待支付订单」为止）、教练工作台
  （`/coach`，原版 1602 行：接单 / 个案记录 / 话术库 / 服务项目 / 可约时段）、
  社群里的帖子详情（回复与删除）、自我教练的通话详情与记录详情（`/self-coaching/history/:id`、
  `/self-coaching/records/:id`）。
- **「我的成长」里还有几块没搬**：打卡排行榜（`/check-ins/leaderboard`）、我的收藏
  （`/users/me/favorites`）、我的预约与取消（`/appointments/mine`）、支付订单、服务评价
  （`/appointments/{id}/review`）。
- **页头不吸顶。** 这一版页头是**浮在首屏上方**的（`position: absolute`），因为要保留原图完整的
  天空；长列表页往下滚就看不到导航。正式站建议改成吸顶 + 滚动后加纸色底。
- **1100px 以下没调。** web 断点只做到 1100；更窄的窗口没排过。
- **还有几处是纯静态的。** 成长测评的量表、社群页的帖子卡片、教练档案的评价区在演示模式下
  仍是写好的示例（接后端时会整体重绘）。

## 想请你定

1. 首页标题继续用「把心事说出来／让心慢慢轻下来」，还是换一版？
2. 页头要不要吸顶（代价是首屏天空顶部会被一条纸色横条盖住）？
3. 自我教练那块视频面（摄像头的画面位）现在是**亮一档的暖灰渐变** —— 比上一版亮，是为了让
   压在上面的墨色文字守住对比度（实测 5.2–5.7:1）。要更深、更中性、或者干脆做成一整块
   纯色，都可以调。
4. ~~首屏那幅画要不要完整显示整幅？~~ **已定：整幅显示**（首屏高度按画的自己比例算 ——
   现在是「人物缩小版」的 2730:1536，1440 宽 → 810 高，不裁不拉）。四张入口便签仍压在接缝上：
   你的窗口是 2560×1600 的屏
   （约 1707 CSS px 宽），首屏会到 1067px 高，便签顶端在 977px 上下 —— 一屏装不下便签的下沿。
   要不要把首屏改成「按高度铺满」（画会等比缩小一点点，便签就回到一屏内）？
5. ~~`情绪日记-背景图-更新版.png` 用在哪一页？~~ **已定、且又改过一轮**：情绪日记页用
   `首页背景-纯水彩草地版.png`，自我教练页用 `纯水彩草地背景.png`（两页都是固定背景）。
   另一张 `两人草地聊天_..._草地质感优化.png` 还没用上。
6. 要不要把剩下那七个页面（私信、订单、支付、通知、钱包）也补上手绘版？
