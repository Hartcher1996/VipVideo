const https = require('https');
const http = require('http');
const { URL } = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const sources = require('../config/sources');
const adapter = require('../adapters/appleCMS');
const cache = require('./cache');

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 60000;
const circuitBreakers = {};
const proxyAgentCache = {};

function getProxyAgent(proxyUrl) {
  if (proxyAgentCache[proxyUrl]) return proxyAgentCache[proxyUrl];
  proxyAgentCache[proxyUrl] = new HttpsProxyAgent(proxyUrl);
  return proxyAgentCache[proxyUrl];
}

function getEnabledSources() {
  return sources.filter(s => s.enabled).sort((a, b) => a.priority - b.priority);
}

function getCircuitBreaker(sourceId) {
  if (!circuitBreakers[sourceId]) {
    circuitBreakers[sourceId] = {
      failures: 0,
      lastFailure: 0,
      open: false,
    };
  }
  return circuitBreakers[sourceId];
}

function recordFailure(sourceId) {
  const cb = getCircuitBreaker(sourceId);
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    cb.open = true;
  }
}

function isCircuitOpen(sourceId) {
  const cb = getCircuitBreaker(sourceId);
  if (!cb.open) return false;
  if (Date.now() - cb.lastFailure > CIRCUIT_BREAKER_TIMEOUT) {
    cb.open = false;
    cb.failures = 0;
    return false;
  }
  return true;
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const module = isHttps ? https : http;

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 15000,
      };

      if (options.proxy) {
        reqOptions.agent = getProxyAgent(options.proxy);
      }

      const req = module.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const jsonStr = data.substring(0, data.lastIndexOf('}') + 1);
            resolve(JSON.parse(jsonStr));
          } catch (e) {
            reject(new Error('JSON parse error: ' + e.message));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function buildUrl(baseUrl, params) {
  const searchParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      searchParams.append(key, params[key]);
    }
  });
  const queryString = searchParams.toString();
  return baseUrl + (queryString ? '?' + queryString : '');
}

function getCacheKey(sourceId, params) {
  return sourceId + ':' + JSON.stringify(params);
}

async function fetchFromSource(source, params) {
  if (isCircuitOpen(source.id)) {
    throw new Error('Circuit breaker open for ' + source.id);
  }

  const cacheKey = getCacheKey(source.id, params);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = buildUrl(source.baseUrl, params);
  console.log(`[${source.id}] Request: ${url}`);

  try {
    const result = await requestJson(url, {
      headers: source.headers,
      timeout: source.timeout,
      proxy: source.proxy,
    });
    cache.set(cacheKey, result, source.cacheTTL || 300);
    return result;
  } catch (err) {
    recordFailure(source.id);
    console.error(`[${source.id}] Error:`, err.message);
    throw err;
  }
}

async function searchVideos(keyword, page = 1, sourceId = null) {
  const enabledSources = getEnabledSources();
  let targetSources = enabledSources;

  if (sourceId) {
    targetSources = enabledSources.filter(s => s.id === sourceId);
  }

  if (targetSources.length === 0) {
    return { list: [], page, pagecount: 0, total: 0, sources: [] };
  }

  const promises = targetSources.map(async (source) => {
    try {
      const params = { ac: 'videolist', pg: page };
      if (keyword) params.wd = keyword;

      const raw = await fetchFromSource(source, params);
      const normalized = adapter.normalizeList(raw, source.id);
      return { sourceId: source.id, sourceName: source.name, ...normalized, success: true };
    } catch (err) {
      return { sourceId: source.id, sourceName: source.name, list: [], page, pagecount: 0, total: 0, success: false, error: err.message };
    }
  });

  const results = await Promise.all(promises);

  if (sourceId) {
    return results[0];
  }

  const allVideos = [];
  const seen = new Set();
  let minPageCount = Infinity;
  let maxTotal = 0;

  results.forEach(r => {
    if (r.success && r.list) {
      r.list.forEach(v => {
        const key = v.name + '_' + v.pic;
        if (!seen.has(key)) {
          seen.add(key);
          allVideos.push(v);
        }
      });
      if (r.pagecount < minPageCount) minPageCount = r.pagecount;
      if (r.total > maxTotal) maxTotal = r.total;
    }
  });

  return {
    list: allVideos,
    page,
    pagecount: minPageCount === Infinity ? 1 : minPageCount,
    total: maxTotal,
    sources: results.map(r => ({
      id: r.sourceId,
      name: r.sourceName,
      success: r.success,
      count: r.list ? r.list.length : 0,
      error: r.error || null,
    })),
  };
}

async function getVideoDetail(vodId, sourceId) {
  const enabledSources = getEnabledSources();
  const source = enabledSources.find(s => s.id === sourceId);

  if (!source) {
    throw new Error('Source not found: ' + sourceId);
  }

  const raw = await fetchFromSource(source, { ac: 'videolist', ids: vodId });
  return adapter.normalizeDetail(raw, source.id);
}

function getSourceList() {
  return getEnabledSources().map(s => ({
    id: s.id,
    name: s.name,
    priority: s.priority,
  }));
}

module.exports = {
  searchVideos,
  getVideoDetail,
  getSourceList,
};
