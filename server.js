const express = require('express');
const path = require('path');
const videoService = require('./services/videoService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.get('/api/sources', (req, res) => {
  try {
    const sources = videoService.getSourceList();
    res.json({ code: 1, sources });
  } catch (err) {
    res.status(500).json({ code: 0, error: err.message });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const { wd: keyword, pg: page, source } = req.query;
    const result = await videoService.searchVideos(keyword || '', parseInt(page) || 1, source || null);
    res.json({ code: 1, ...result });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ code: 0, error: err.message, list: [] });
  }
});

app.get('/api/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.query;
    if (!source) {
      return res.status(400).json({ code: 0, error: 'source parameter is required' });
    }
    const video = await videoService.getVideoDetail(id, source);
    if (!video) {
      return res.json({ code: 0, msg: '未找到视频信息', video: null });
    }
    res.json({ code: 1, video });
  } catch (err) {
    console.error('Detail Error:', err);
    res.status(500).json({ code: 0, error: err.message, video: null });
  }
});

app.get('/api/*', async (req, res) => {
  try {
    const pathPart = req.params[0] || '';
    const query = req.query;
    const source = query.source || null;
    delete query.source;

    if (pathPart === '' || pathPart === '/') {
      const result = await videoService.searchVideos(query.wd || '', parseInt(query.pg) || 1, source);
      return res.json({ code: 1, ...result });
    }

    res.status(404).json({ code: 0, error: 'Not found' });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ code: 0, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  const sources = videoService.getSourceList();
  console.log(`Enabled sources (${sources.length}):`, sources.map(s => s.name).join(', '));
});
