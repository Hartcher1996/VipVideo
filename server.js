const express = require('express');
const path = require('path');
const videoService = require('./services/videoService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 视频列表接口
app.get('/api/list', async (req, res) => {
  const page = parseInt(req.query.pg) || 1;
  const keyword = req.query.wd || '';

  try {
    const data = keyword
      ? await videoService.searchVideos(keyword, page)
      : await videoService.getVideoList(page);
    res.json(data);
  } catch (err) {
    console.error('API /list error:', err.message);
    res.status(500).json({ code: 0, msg: '服务器错误: ' + err.message, list: [] });
  }
});

// 搜索接口
app.get('/api/search', async (req, res) => {
  const keyword = req.query.wd || '';
  const page = parseInt(req.query.pg) || 1;

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
});

// 详情接口
app.get('/api/detail', async (req, res) => {
  const id = req.query.ids;

  if (!id) {
    return res.json({ code: 0, msg: '缺少视频ID', list: [] });
  }

  try {
    const data = await videoService.getVideoDetail(id);
    res.json(data);
  } catch (err) {
    console.error('API /detail error:', err.message);
    res.status(500).json({ code: 0, msg: '服务器错误: ' + err.message, list: [] });
  }
});

// 数据源状态接口
app.get('/api/sources', (req, res) => {
  res.json({
    code: 1,
    sources: videoService.sources.map(s => ({
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      priority: s.priority
    }))
  });
});

app.listen(PORT, () => {
  const enabledSources = videoService.sources.filter(s => s.enabled);
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Enabled sources (${enabledSources.length}): ${enabledSources.map(s => s.name).join(', ')}`);
});
