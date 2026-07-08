module.exports = [
  {
    id: 'zuidapi',
    name: '最大资源',
    baseUrl: 'https://api.zuidapi.com/api.php/provide/vod/',
    enabled: true,
    priority: 1,
    timeout: 15000,
    proxy: 'http://127.0.0.1:18080',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://zuidapi.com/',
    },
    cacheTTL: 300,
  },
  {
    id: 'example_source',
    name: '示例资源',
    baseUrl: 'https://api.example.com/api.php/provide/vod/',
    enabled: false,
    priority: 2,
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://example.com/',
    },
    cacheTTL: 300,
  },
];
