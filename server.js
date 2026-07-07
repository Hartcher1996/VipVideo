const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/*', (req, res) => {
  const pathPart = req.params[0] || '';
  const query = req.query;

  const params = new URLSearchParams();
  Object.keys(query).forEach(key => {
    params.append(key, query[key]);
  });
  const queryString = params.toString();

  const targetUrl = 'https://api.zuidapi.com/api.php/provide/vod/' + pathPart + (queryString ? '?' + queryString : '');

  console.log('Request:', targetUrl);

  const args = [
    '-s',
    '-x', 'http://127.0.0.1:18080',
    targetUrl,
    '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    '-H', 'Accept: application/json, text/plain, */*',
    '-H', 'Referer: https://zuidapi.com/',
  ];

  const curl = spawn('curl', args, { timeout: 30000 });

  let stdout = '';
  let stderr = '';

  curl.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  curl.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  curl.on('close', (code) => {
    if (code !== 0) {
      console.error('Curl error code:', code);
      console.error('Stderr:', stderr);
      if (!res.headersSent) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: 'Curl failed: ' + stderr });
      }
      return;
    }

    console.log('Response length:', stdout.length);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200);
    res.send(stdout);
  });

  curl.on('error', (err) => {
    console.error('Spawn error:', err.message);
    if (!res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({ error: err.message });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
