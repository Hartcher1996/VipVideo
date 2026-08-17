# VIP视频解析

一个多源聚合视频网站，现已原生适配 **Cloudflare Pages + Functions**（零运行时成本，全球 CDN 直出），同时保留原版 Node.js + Express 本地运行方式。

<img width="2549" height="1364" alt="image" src="https://github.com/user-attachments/assets/9030fad8-753f-4577-86a2-f264a222d0c4" />

## 功能特性

- 🎛️ **多数据源支持** — 配置化管理，轻松添加/删除数据源
- 🔀 **聚合搜索** — 并行请求多个数据源，自动去重合并
- 💾 **多级缓存** — Cloudflare Cache API（Pages 版）/ 内存 Map（Express 版），默认 5 分钟 TTL
- 🛡️ **熔断器** — 连续失败自动熔断 30 秒，避免拖慢响应
- 🎨 **响应式 UI** — 聚合来源标签、详情页多播放源切换、深浅色主题、宽屏模式、观看历史
- ⚙️ **站点配置** — 站点名称、热搜词、默认宽屏、首页 Stats 条等一键自定义
- 🚀 **Serverless 部署** — 一键托管到 Cloudflare Pages，无需自购服务器与维护 Node 进程

## 当前数据源

| 数据源 | API 地址 | 状态 |
|--------|----------|------|
| 最大资源 | `api.zuidapi.com` | ✅ |
| 非凡资源 | `api.ffzyapi.com` | ✅ |
| 量子资源 | `cj.lziapi.com` | ✅ |

## 快速开始

### 方式 A：Cloudflare Pages（推荐 · 生产部署）

前置条件：一个 [Cloudflare](https://dash.cloudflare.com/) 账号。

#### 1. 本地开发

```bash
npm install
npm run dev
# → 打开 http://localhost:3000
```

`wrangler pages dev` 会同时加载 `public/` 静态资源和 `functions/` API 路由，行为与线上完全一致。

#### 2. 部署到 Cloudflare Pages

**Dashboard 方式（零配置，推荐）**：
1. Cloudflare Dashboard → Pages → **Connect to Git**
2. 选中本仓库，配置：
   - **Build command**：留空（纯静态 + Functions 自动识别）
   - **Build output directory**：`public`
3. 保存，首次部署自动完成；后续 push 到 main 即触发发布

**CLI 方式**：
```bash
npm run deploy
# 或显式指定项目名：
# npx wrangler pages deploy public --project-name vip-video
```

### 方式 B：传统 Node.js + Express（本地 / VPS 部署）

```bash
npm install express https-proxy-agent
npm start          # 别名: node server.js
# → http://localhost:3000
```

如需代理访问上游 API：
```bash
# Linux / macOS
HTTPS_PROXY=http://127.0.0.1:18080 npm start
# Windows PowerShell
$env:HTTPS_PROXY="http://127.0.0.1:18080"; npm start
```

## 项目结构

```
├── functions/                  # ← Cloudflare Pages Functions（文件路由）
│   ├── _shared/
│   │   ├── config/
│   │   │   ├── sources.mjs     # 数据源配置 (ESM)
│   │   │   └── site.config.mjs # 站点全局配置 (ESM)
│   │   └── videoService.mjs    # 核心服务：fetch + Cache API + 熔断
│   └── api/
│       ├── site/config.js      # GET /api/site/config
│       ├── sources.js          # GET|POST /api/sources
│       ├── list.js             # GET|POST /api/list
│       ├── search.js           # GET|POST /api/search
│       └── detail.js           # GET|POST /api/detail
│
├── public/                     # 静态资源（Pages 直接托管）
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   └── DPlayer.min.css
│   └── js/
│       ├── services/
│       │   ├── api.js          # 前端 API 封装
│       │   └── storage.js      # 主题/历史/列表状态
│       ├── components/
│       │   ├── videoList.js
│       │   ├── videoDetail.js
│       │   └── player.js
│       ├── app.js
│       ├── hls.min.js
│       └── DPlayer.min.js
│
├── config/                     # Express 版使用的 CJS 配置
│   ├── sources.js / sources.mjs
│   └── site.config.js / site.config.mjs
├── services/videoService.js    # Express 版核心服务
├── server.js                   # Express 服务器
├── package.json
└── .gitignore
```

## 站点配置

编辑 `functions/_shared/config/site.config.mjs`（Pages 版）或 `config/site.config.js`（Express 版）可自定义：

- `siteName` — 站点名称（显示在 Logo、浏览器标题）
- `siteSlogan` — Hero 区副标题
- `heroTitle` — Hero 区主标题（支持 `<hl>...</hl>` 高亮渐变色）
- `searchPlaceholder` — 搜索框占位文本
- `hotKeywords` — 首页热搜词数组
- `defaultWideScreen` — 进入播放页是否默认开启宽屏模式（隐藏剧集列表）
- `stats` — 首页底部数据条（纯展示）
- `footer` — 页脚版权文本

后端通过 `/api/site/config` 接口向前端暴露配置，前后端共享同一份文件。

## API 接口

所有接口同时支持 `GET`（query 参数）和 `POST`（JSON body）两种调用方式；**参数含中文时推荐使用 POST**，以免 URL 编码异常。

### 获取站点配置

```
GET /api/site/config
```

### 获取数据源列表

```
GET /api/sources
```

响应：
```json
{
  "code": 1,
  "sources": [
    { "id": "zuidapi", "name": "最大资源", "priority": 1 },
    { "id": "ffzyapi", "name": "非凡资源", "priority": 2 },
    { "id": "lziapi", "name": "量子资源", "priority": 3 }
  ]
}
```

### 获取视频列表 / 分类 / 搜索

```
GET /api/list?pg=1&wd=关键词&source=zuidapi&ac=typelist
```

参数：
- `pg` — 页码（默认 1）
- `wd` — 搜索关键词（可选）
- `source` — 指定数据源 ID（可选，不传则依次轮询所有启用的源）
- `ac` — `typelist` 时返回分类列表；其他或留空返回视频列表

### 获取视频详情

```
GET /api/detail?ids=12345&source=zuidapi
```

参数：
- `ids` — 视频 ID（必传）
- `source` — 数据源 ID（可选）

### 搜索（独立端点）

```
GET /api/search?wd=关键词&pg=1&source=zuidapi
```

功能上等同于 `GET /api/list?wd=关键词&pg=1&source=zuidapi`；`/api/search` 为显式语义化端点。

## 添加新数据源

编辑 `functions/_shared/config/sources.mjs`（Pages 版）或 `config/sources.js`（Express 版），追加一条：

```javascript
{
  id: 'new_source',
  name: '新资源站',
  baseUrl: 'https://api.xxx.com/api.php/provide/vod/',
  enabled: true,
  priority: 4
}
```

要求上游 API 兼容 MacCMS 的 `provide/vod/` 协议（`ac=videolist|typelist`、`pg`、`wd`、`ids` 等参数）。

## Pages 版 vs Express 版对比

| 维度 | Cloudflare Pages + Functions | Node.js + Express |
|---|---|---|
| 运行时 | Workers V8 isolate（免费额度充足） | Node 进程（需自托管/VPS） |
| HTTP 客户端 | 标准 `fetch()` + `AbortSignal.timeout` | `http/https` 原生模块 |
| 缓存 | `caches.default`（跨请求/边缘节点共享） | 进程内 `Map`（单实例级） |
| 代理 | Cloudflare 出口直连，无需代理 | `https-proxy-agent` + `HTTPS_PROXY` 环境变量 |
| 模块系统 | ES Modules | CommonJS |
| 静态资源 | Pages CDN 自动托管 + 全球边缘节点 | `express.static` 单机 |
| 部署 | Git 推送自动发布 / `wrangler pages deploy` | 需部署 Node 运行环境 |
| 前端代码 | ✅ 零改动，`/api/*` 路径完全兼容 | ✅ |

## 技术栈

- **后端（Pages）**：Cloudflare Pages Functions + Web Standard API（`fetch` / `Cache` / `AbortSignal`）
- **后端（Express）**：Node.js + Express + https-proxy-agent
- **前端**：原生 JavaScript + DPlayer + hls.js
- **播放器**：DPlayer + hls.js（支持 M3U8 / HLS 流）

## 注意事项

- 本项目仅供学习交流使用
- 数据来源于第三方 API，请遵守相关法律法规
- Pages 版中某源返回 `internal error` 或超时属正常现象：熔断器会自动降级并轮询下一个源

## License

MIT
