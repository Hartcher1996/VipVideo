const express = require('express');
const path = require('path');
const videoService = require('./services/videoService');

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
  const source = params.source || '';

  try {
    if (ac === 'typelist') {
      const data = await videoService.getCategoryList(source);
      return res.json(data);
    }

    if (keyword) {
      const data = await videoService.searchVideos(keyword, page, source);
      return res.json(data);
    }

    const data = await videoService.getVideoList(page, source);
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
  const source = params.source || '';

  if (!keyword) {
    return res.json({ code: 0, msg: '请输入搜索关键词', list: [] });
  }

  try {
    const data = await videoService.searchVideos(keyword, page, source);
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

  if (!id) {
    return res.json({ code: 0, msg: '缺少视频ID', list: [] });
  }

  try {
    const data = await videoService.getVideoDetail(id, source);
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
