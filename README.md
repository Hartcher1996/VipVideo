# VIP视频解析

一个基于 Node.js + Express 的多源聚合视频网站，支持数据源切换、聚合搜索、缓存和熔断器机制。
<img width="2549" height="1364" alt="image" src="https://github.com/user-attachments/assets/9030fad8-753f-4577-86a2-f264a222d0c4" />

## 功能特性

- 🎛️ **多数据源支持** — 配置化管理，轻松添加/删除数据源
- 🔀 **聚合搜索** — 并行请求多个数据源，自动去重合并
- 💾 **内存缓存** — 默认 5 分钟缓存，减轻上游压力
- 🛡️ **熔断器** — 连续失败自动熔断，避免拖慢响应
- 🌐 **代理支持** — 通过环境变量配置全局 HTTPS 代理
- 🎨 **响应式 UI** — 数据源切换、来源标签、详情页播放源切换
- ⚙️ **站点配置** — 站点名称、热搜词、默认宽屏等可通过 `config/site.config.js` 自定义

## 当前数据源

| 数据源 | API 地址 | 状态 |
|--------|----------|------|
| 最大资源 | `api.zuidapi.com` | ✅ |
| 非凡资源 | `api.ffzyapi.com` | ✅ |
| 量子资源 | `cj.lziapi.com` | ✅ |

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3000`

### 配置代理

如果数据源需要代理访问，通过环境变量设置：

```bash
# Linux / macOS
HTTPS_PROXY=http://127.0.0.1:18080 npm start

# Windows PowerShell
$env:HTTPS_PROXY="http://127.0.0.1:18080"; npm start
```

## 项目结构

```
├── config/
│   ├── sources.js         # 数据源配置
│   └── site.config.js     # 站点全局配置（站点名、热搜词、默认宽屏等）
├── services/
│   └── videoService.js    # 核心视频服务（含缓存、熔断器）
├── public/
│   ├── index.html         # 主页面
│   ├── css/
│   │   ├── style.css      # 站点样式
│   │   └── DPlayer.min.css
│   └── js/
│       ├── services/
│       │   ├── api.js     # 前端 API 封装
│       │   └── storage.js # localStorage 封装（主题、历史、列表状态）
│       ├── components/
│       │   ├── videoList.js  # 视频列表组件
│       │   ├── videoDetail.js # 视频详情组件
│       │   └── player.js     # 播放器组件
│       ├── app.js         # 应用主逻辑
│       ├── hls.min.js
│       └── DPlayer.min.js
├── server.js              # Express 服务器
└── package.json
```

## 站点配置

编辑 `config/site.config.js` 可自定义：

- `siteName` — 站点名称（显示在 Logo、浏览器标题）
- `siteSlogan` — Hero 区副标题
- `heroTitle` — Hero 区主标题（支持 `<hl>...</hl>` 高亮）
- `searchPlaceholder` — 搜索框占位文本
- `hotKeywords` — 热搜词数组
- `defaultWideScreen` — 是否默认进入宽屏模式
- `stats` — 首页底部统计条
- `footer` — 页脚文本

后端通过 `/api/site/config` 接口向前端暴露配置，前后端共享同一份文件。

## API 接口

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

### 获取视频列表 / 搜索

```
GET /api/list?pg=1&wd=关键词&source=zuidapi
```

参数：
- `pg` — 页码（默认 1）
- `wd` — 搜索关键词（可选）
- `source` — 指定数据源 ID（可选，不传则聚合所有源）

> 含中文参数时建议使用 `POST /api/list`，body 传 JSON。

### 获取视频详情

```
GET /api/detail?ids=12345&source=zuidapi
```

参数：
- `ids` — 视频 ID（必传）
- `source` — 数据源 ID（可选）

### 搜索

```
GET /api/search?wd=关键词&pg=1&source=zuidapi
```

## 添加新数据源

编辑 `config/sources.js`，添加新配置：

```javascript
{
  id: 'new_source',
  name: '新资源站',
  baseUrl: 'https://api.xxx.com/api.php/provide/vod/',
  enabled: true,
  priority: 4
}
```

## 技术栈

- **后端**：Node.js + Express
- **前端**：原生 JavaScript + DPlayer 播放器
- **代理**：https-proxy-agent（可选，通过环境变量启用）
- **播放器**：DPlayer + hls.js（支持 M3U8）

## 注意事项

- 本项目仅供学习交流使用
- 数据来源于第三方 API，请遵守相关法律法规
- 代理配置根据实际网络环境调整

## License

MIT
