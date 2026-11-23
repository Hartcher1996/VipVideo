const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const videoService = require('./services/videoService');
const siteConfig = require('./config/site.config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function getParams(req) {
  if (req.method === 'POST' && req.body) {
    return req.body;
  }
  return req.query;
}

app.get('/api/parse', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ code: 0, msg: '缺少 url 参数' });
  }

  try {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': parsed.origin,
      },
      timeout: 15000,
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      if (proxyRes.headers['content-length']) {
        res.setHeader('Content-Length', proxyRes.headers['content-length']);
      }
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ code: 0, msg: '代理请求失败: ' + err.message });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ code: 0, msg: '代理请求超时' });
      }
    });

    proxyReq.end();
  } catch (err) {
    res.status(500).json({ code: 0, msg: '解析失败: ' + err.message });
  }
});

/**
 * 站点全局配置（与前端共享同一份文件）
 */
app.get('/api/site/config', (req, res) => {
  res.json({
    code: 1,
    siteName: siteConfig.siteName,
    siteSlogan: siteConfig.siteSlogan,
    heroTitle: siteConfig.heroTitle,
    searchPlaceholder: siteConfig.searchPlaceholder,
    hotKeywords: Array.isArray(siteConfig.hotKeywords) ? siteConfig.hotKeywords : [],
    defaultWideScreen: !!siteConfig.defaultWideScreen,
    stats: Array.isArray(siteConfig.stats) ? siteConfig.stats : [],
    footer: siteConfig.footer
  });
});

app.get('/api/sources', (req, res) => {
  const enabledSources = videoService.getEnabledSources();
  res.json({
    code: 1,
    sources: enabledSources.map(s => ({
      id: s.id,
      name: s.name,
      priority: s.priority
    }))
  });
});
app.post('/api/sources', (req, res) => {
  const enabledSources = videoService.getEnabledSources();
  res.json({
    code: 1,
    sources: enabledSources.map(s => ({
      id: s.id,
      name: s.name,
      priority: s.priority
    }))
  });
});

async function handleList(req, res) {
  const params = getParams(req);
  const page = parseInt(params.pg) || 1;
  const keyword = params.wd || '';
  const ac = params.ac || '';

  try {
    if (ac === 'typelist') {
      const data = await videoService.getCategoryList();
      return res.json(data);
    }

    if (keyword) {
      const data = await videoService.searchVideos(keyword, page);
      return res.json(data);
    }

    const data = await videoService.getVideoList(page);
    res.json(data);
  } catch (err) {
    console.error('API /list error:', err.message);
    res.status(500).json({ code: 0, msg: '服务器错误: ' + err.message, list: [] });
  }
}
app.get('/api/list', handleList);
app.post('/api/list', handleList);

async function handleSearch(req, res) {
  const params = getParams(req);
  const keyword = params.wd || '';
  const page = parseInt(params.pg) || 1;

  if (!keyword) {
    return res.json({ code: 0, msg: '请输入搜索关键词', list: [] });
  }

  try {
    const data = await videoService.searchVideos(keyword, page);
    res.json(data);
  } catch (err) {
    console.error('API /search error:', err.message);
    res.status(500).json({ code: 0, msg: '服务器错误: ' + err.message, list: [] });
  }
}
app.get('/api/search', handleSearch);
app.post('/api/search', handleSearch);

async function handleDetail(req, res) {
  const params = getParams(req);
  const id = params.ids;
  const source = params.source || '';
  const name = params.name || '';

  if (!id) {
    return res.json({ code: 0, msg: '缺少视频ID', list: [] });
  }

  try {
    const data = await videoService.getVideoDetail(id, source, name);
    res.json(data);
  } catch (err) {
    console.error('API /detail error:', err.message);
    res.status(500).json({ code: 0, msg: '服务器错误: ' + err.message, list: [] });
  }
}
app.get('/api/detail', handleDetail);
app.post('/api/detail', handleDetail);

app.listen(PORT, () => {
  const enabledSources = videoService.sources.filter(s => s.enabled);
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Enabled sources (${enabledSources.length}): ${enabledSources.map(s => s.name).join(', ')}`);
});
