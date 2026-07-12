const https = require('https');
const http = require('http');
const { URL } = require('url');
const sources = require('../config/sources');

// 检测代理环境变量
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
                 process.env.https_proxy || process.env.http_proxy;
let agent = undefined;
if (proxyUrl) {
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    agent = new HttpsProxyAgent(proxyUrl);
    console.log(`Using proxy: ${proxyUrl}`);
  } catch (e) {
    console.warn('https-proxy-agent not available, direct connection');
  }
}

// 简单内存缓存
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 熔断器状态
const breakerState = new Map(); // sourceId -> { failures, tripped, tripUntil }

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

function isTripped(sourceId) {
  const state = breakerState.get(sourceId);
  if (!state) return false;
  if (state.tripped && Date.now() < state.tripUntil) return true;
  if (state.tripped && Date.now() >= state.tripUntil) {
    state.tripped = false;
    state.failures = 0;
    return false;
  }
  return false;
}

function recordFailure(sourceId) {
  let state = breakerState.get(sourceId);
  if (!state) {
    state = { failures: 0, tripped: false, tripUntil: 0 };
    breakerState.set(sourceId, state);
  }
  state.failures++;
  if (state.failures >= 3) {
    state.tripped = true;
    state.tripUntil = Date.now() + 30 * 1000; // 熔断30秒
    console.warn(`[${sourceId}] 熔断器触发，30秒后重试`);
  }
}

function recordSuccess(sourceId) {
  breakerState.delete(sourceId);
}

function fetch(urlString, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
      timeout: timeout,
    };

    if (agent) {
      options.agent = agent;
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

// 从单个源获取数据
async function fetchFromSource(source, params) {
  if (!source.enabled) return null;
  if (isTripped(source.id)) return null;

  const query = new URLSearchParams(params).toString();
  const url = source.baseUrl + (query ? '?' + query : '');

  console.log(`[${source.id}] Request: \`${url}\``);

  try {
    const raw = await fetch(url);
    recordSuccess(source.id);

    // 清理可能的非JSON字符
    const jsonStr = raw.substring(0, raw.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonStr);

    // 标记数据来源
    if (data.list && Array.isArray(data.list)) {
      data.list.forEach(item => {
        item._source = source.id;
        item._sourceName = source.name;
      });
    }

    return data;
  } catch (err) {
    console.error(`[${source.id}] Error: ${err.message}`);
    recordFailure(source.id);
    return null;
  }
}

// 获取视频列表（优先从第一个可用源获取）
async function getVideoList(page = 1, keyword = '') {
  const cacheKey = `list:${page}:${keyword}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page };
  if (keyword) params.wd = keyword;

  for (const source of sources) {
    const data = await fetchFromSource(source, params);
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      setCache(cacheKey, data);
      return data;
    }
  }

  // 所有源都失败，返回空结果
  return { code: 1, list: [], pagecount: 1, page: page, total: 0 };
}

// 聚合搜索
async function searchVideos(keyword, page = 1) {
  const cacheKey = `search:${page}:${keyword}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page, wd: keyword };

  // 并行请求所有源
  const results = await Promise.all(
    sources.map(source => fetchFromSource(source, params))
  );

  // 合并结果
  let mergedList = [];
  let maxPageCount = 1;

  results.forEach(data => {
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      mergedList = mergedList.concat(data.list);
      if (data.pagecount > maxPageCount) {
        maxPageCount = data.pagecount;
      }
    }
  });

  // 去重（按vod_name）
  const seen = new Set();
  mergedList = mergedList.filter(item => {
    if (seen.has(item.vod_name)) return false;
    seen.add(item.vod_name);
    return true;
  });

  const result = {
    code: 1,
    list: mergedList,
    pagecount: maxPageCount,
    page: page,
    total: mergedList.length
  };

  setCache(cacheKey, result);
  return result;
}

// 获取视频详情
async function getVideoDetail(id) {
  const cacheKey = `detail:${id}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', ids: id };

  for (const source of sources) {
    const data = await fetchFromSource(source, params);
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [], pagecount: 1, page: 1, total: 0 };
}

module.exports = {
  getVideoList,
  searchVideos,
  getVideoDetail,
  sources,
};
