# VIP视频解析

一个基于 Node.js + Express 的多源聚合视频网站，支持数据源切换、聚合搜索、缓存和熔断器机制。

## 功能特性

- 🎛️ **多数据源支持** — 配置化管理，轻松添加/删除数据源
- 🔀 **聚合搜索** — 并行请求多个数据源，自动去重合并
- 💾 **内存缓存** — 默认 5 分钟缓存，减轻上游压力
- 🛡️ **熔断器** — 连续失败自动熔断，避免拖慢响应
- 🌐 **代理支持** — 每个数据源可独立配置代理
- 🎨 **响应式 UI** — 数据源切换 Tab、来源标签、详情页播放源切换

## 当前数据源

| 数据源 | API 地址 | 资源量 | 状态 |
|--------|----------|--------|------|
| 最大资源 | `api.zuidapi.com` | 12万+ | ✅ |
| 非凡资源 | `api.ffzyapi.com` | 9.7万+ | ✅ |
| 量子资源 | `cj.lziapi.com` | 14.3万+ | ✅ |

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

如果数据源需要代理访问，在 `config/sources.js` 中配置：

```javascript
{
  id: 'zuidapi',
  name: '最大资源',
  baseUrl: 'https://api.zuidapi.com/api.php/provide/vod/',
  proxy: 'http://127.0.0.1:18080',  // 代理地址
  // ...
}
```

## 项目结构

```
├── config/
│   └── sources.js         # 数据源配置
├── adapters/
│   └── appleCMS.js        # 苹果CMS数据格式适配器
├── services/
│   ├── cache.js           # 内存缓存
│   └── videoService.js    # 核心视频服务
├── public/
│   ├── index.html         # 主页面
│   ├── css/style.css      # 样式
│   └── js/app.js          # 前端逻辑
├── server.js              # Express 服务器
└── package.json           # 项目配置
```

## API 接口

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

### 获取视频列表（聚合）

```
GET /api/videos?pg=1
```

参数：
- `pg` — 页码（默认 1）
- `wd` — 搜索关键词（可选）
- `source` — 指定数据源 ID（可选，不传则聚合所有源）

响应：
```json
{
  "code": 1,
  "list": [...],
  "page": 1,
  "pagecount": 6018,
  "total": 120353,
  "sources": [
    { "id": "zuidapi", "name": "最大资源", "success": true, "count": 20 }
  ]
}
```

### 获取视频详情

```
GET /api/videos/:id?source=zuidapi
```

参数：
- `id` — 视频 ID
- `source` — 数据源 ID（必传）

## 添加新数据源

编辑 `config/sources.js`，添加新配置：

```javascript
{
  id: 'new_source',
  name: '新资源站',
  baseUrl: 'https://api.xxx.com/api.php/provide/vod/',
  enabled: true,
  priority: 4,
  timeout: 15000,
  proxy: 'http://127.0.0.1:18080',  // 如需代理
  headers: {
    'User-Agent': 'Mozilla/5.0 ...',
    'Referer': 'https://xxx.com/',
  },
  cacheTTL: 300,
}
```

## 技术栈

- **后端**：Node.js + Express
- **前端**：原生 JavaScript + DPlayer 播放器
- **代理**：https-proxy-agent
- **播放器**：DPlayer + hls.js（支持 M3U8）

## 注意事项

- 本项目仅供学习交流使用
- 数据来源于第三方 API，请遵守相关法律法规
- 代理配置根据实际网络环境调整

## License

MIT