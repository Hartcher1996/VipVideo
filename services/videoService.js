const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const sources = require('../config/sources');

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

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const breakerState = new Map();

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
    state.tripUntil = Date.now() + 30 * 1000;
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

async function fetchFromSource(source, params) {
  if (!source.enabled) return null;
  if (isTripped(source.id)) return null;

  const query = new URLSearchParams(params).toString();
  const url = source.baseUrl + (query ? '?' + query : '');

  console.log(`[${source.id}] Request: \`${url}\``);

  try {
    const raw = await fetch(url);
    recordSuccess(source.id);

    const jsonStr = raw.substring(0, raw.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonStr);

    if (data.list && Array.isArray(data.list)) {
      data.list.forEach(item => {
        item._source = source.id;
        item._sourceName = source.name;
      });
    }

    return data;
  } catch (err) {
    console.error(`[${source.id}] Error: ${err.message}`, err.stack || '');
    recordFailure(source.id);
    return null;
  }
}

function getEnabledSources() {
  return sources.filter(s => s.enabled);
}

// ============ 工具函数：URL 类型识别 ============
// 与 Cloudflare 版 functions/_shared/videoService.mjs 保持一致
// 返回值：'official'（官方平台URL，可套解析API）
//        'm3u8'（m3u8 直链，走 HLS 播放器）
//        'shareDirect'（资源站自带播放器的分享页，如 U酷云播，直接 iframe 嵌入）
//        'share'（share/play 跳转，需二次解析）
//        'unknown'（未识别）
function classifyPlayUrl(url) {
  if (!url || typeof url !== 'string') return 'unknown';

  // 官方平台 URL（腾讯视频、爱奇艺、优酷、芒果TV、哔哩哔哩、搜狐、暴风、风行 等）
  if (
    /v\.qq\.com\/x\/cover/i.test(url) ||
    /iqiyi\.com\/v_/i.test(url) ||
    /youku\.com\/v_show/i.test(url) ||
    /mgtv\.com\/b/i.test(url) ||
    /bilibili\.com\/bangumi/i.test(url) ||
    /sohu\.com\/tv|tv\.sohu\.com/i.test(url) ||
    /le\.com\/ptv/i.test(url) ||
    /vip\.1905\.com/i.test(url) ||
    /pptv\.com/i.test(url)
  ) {
    return 'official';
  }

  // m3u8 直链
  if (/\.m3u8(\?|$|#)/i.test(url)) {
    return 'm3u8';
  }

  // share 跳转（如 ukzyvod3.ukubf5.com/share/1aMd7fb1tS）
  if (/\/share\/[a-zA-Z0-9]{4,}/i.test(url)) {
    // U酷云播（ukzy*.ukubf*.com/share/xxx）：页面自带播放器，无需解析，直接 iframe 嵌入
    try {
      const host = new URL(url).hostname;
      if (/ukzy|ukubf/i.test(host)) return 'shareDirect';
    } catch (e) { /* 忽略非法 URL */ }
    return 'share';
  }

  // play 跳转（如 hd.ijycnd.com/play/bYEyzV9b）
  if (/\/play\/[a-zA-Z0-9_-]{4,}/i.test(url)) {
    // 金鹰云播（*.ijycnd.com/play/xxx）：页面自带播放器，无需解析，直接 iframe 嵌入
    try {
      const host = new URL(url).hostname;
      if (/ijycnd/i.test(host)) return 'shareDirect';
    } catch (e) { /* 忽略非法 URL */ }
    return 'share';
  }

  return 'unknown';
}

// ============ 工具函数：唯一 ID 生成 ============
// 与 CF 版保持一致：SHA-1(vod_name + vod_year) 取前 10 字节 = 20 位十六进制
// 同一部影片各源计算结果一致，可跨源去重/记录历史
function generateUniqueId(vodName, vodYear = '') {
  const input = `${vodName || ''}|${vodYear || ''}`;
  const hash = crypto.createHash('sha1').update(input, 'utf8').digest('hex');
  return 'av_' + hash.slice(0, 20);
}

// ============ 解析播放线路字符串 ============
// vod_play_from 格式: "zuidam3u8$$$feifan$$$ffm3u8"
// vod_play_url 格式: "第01集$url1#第02集$url2$$$第01集$url3#第02集$url4"
// 解析成结构化数据，并按线路类型分类
function parsePlaySources(vodPlayFrom, vodPlayUrl, sourceId, sourceName) {
  if (!vodPlayFrom || !vodPlayUrl) return [];

  const lineNames = vodPlayFrom.split('$$$');
  const lineUrls = vodPlayUrl.split('$$$');
  const result = [];

  for (let i = 0; i < lineNames.length; i++) {
    if (!lineUrls[i]) continue;
    const episodes = lineUrls[i]
      .split('#')
      .map((ep) => {
        const parts = ep.split('$');
        return {
          name: parts[0] || `第${i + 1}集`,
          url: parts[1] || '',
        };
      })
      .filter((ep) => ep.url);

    if (episodes.length === 0) continue;

    const sampleUrl = episodes[0].url;
    const urlType = classifyPlayUrl(sampleUrl);

    result.push({
      lineId: `${sourceId}_${i}`,
      lineName: lineNames[i] || sourceName || `线路${i + 1}`,
      sourceId,
      sourceName,
      urlType, // 'official' | 'm3u8' | 'shareDirect' | 'share' | 'unknown'
      episodes,
    });
  }

  return result;
}

async function getVideoList(page = 1) {
  const cacheKey = `list:${page}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page };

  for (const source of sources) {
    const data = await fetchFromSource(source, params);
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      // 为每条记录生成唯一 ID（与 CF 版一致）
      for (const item of data.list) {
        item.vod_uniq_id = generateUniqueId(item.vod_name, item.vod_year);
      }
      setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [], pagecount: 1, page: page, total: 0 };
}

// 聚合搜索：多源并行 → 按 vod_name 归并 → 同片多源收集到 _playSources
// 项目无单源模式：搜索永远聚合所有启用源
async function searchVideos(keyword, page = 1) {
  const cacheKey = `search:${page}:${encodeURIComponent(keyword)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page, wd: keyword };

  // 聚合模式：多源并行请求
  const results = await Promise.all(
    sources.map(s => fetchFromSource(s, params))
  );

  // 用 Map 按 vod_name 归并
  const grouped = new Map();
  let maxPageCount = 1;

  for (const data of results) {
    if (!data || data.code !== 1 || !Array.isArray(data.list)) continue;
    if (data.pagecount > maxPageCount) maxPageCount = data.pagecount;

    for (const item of data.list) {
      const key = item.vod_name;
      if (!key) continue;

      // 解析这个源的播放线路
      const playSources = parsePlaySources(
        item.vod_play_from,
        item.vod_play_url,
        item._source,
        item._sourceName
      );

      if (!grouped.has(key)) {
        // 首次出现，作为主条目
        const main = { ...item };
        main._playSources = playSources; // 所有源的播放线路汇总
        main._sourceCount = 1;
        grouped.set(key, main);
      } else {
        // 已存在：合并播放线路，保留更完整的元数据
        const main = grouped.get(key);
        main._sourceCount = (main._sourceCount || 1) + 1;
        if (playSources.length > 0) {
          main._playSources = (main._playSources || []).concat(playSources);
        }
        // 用后到的源补全缺失字段
        for (const k of Object.keys(item)) {
          if ((!main[k] || main[k] === '') && item[k]) {
            main[k] = item[k];
          }
        }
      }
    }
  }

  // 转成数组并生成唯一 ID
  const mergedList = [];
  for (const item of grouped.values()) {
    item.vod_uniq_id = generateUniqueId(item.vod_name, item.vod_year);
    // 保留 vod_play_from / vod_play_url 作为兼容字段（前端优先用 _playSources）
    mergedList.push(item);
  }

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

// 详情也做聚合：先用 vod_id 拿主条目，
// 再并行搜索其他源的同名影片，合并所有播放线路到 _playSources
async function getVideoDetail(id) {
  const cacheKey = `detail:${id}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', ids: id };

  let mainItem = null;
  const allPlaySources = [];

  // 先从任一源拿到主条目
  for (const source of sources) {
    const data = await fetchFromSource(source, params);
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      mainItem = { ...data.list[0] };

      // 解析主源的播放线路
      const playSources = parsePlaySources(
        mainItem.vod_play_from,
        mainItem.vod_play_url,
        mainItem._source,
        mainItem._sourceName
      );
      allPlaySources.push(...playSources);
      break;
    }
  }

  if (!mainItem) {
    return { code: 1, list: [], pagecount: 1, page: 1, total: 0 };
  }

  // 聚合其他源的同名影片播放线路
  if (mainItem.vod_name) {
    const searchParams = { ac: 'videolist', wd: mainItem.vod_name };
    const otherResults = await Promise.all(
      sources
        .filter(s => s.id !== mainItem._source)
        .map(s => fetchFromSource(s, searchParams))
    );

    for (const data of otherResults) {
      if (!data || data.code !== 1 || !Array.isArray(data.list)) continue;
      // 找同名影片
      const match = data.list.find(it => it.vod_name === mainItem.vod_name);
      if (match) {
        const playSources = parsePlaySources(
          match.vod_play_from,
          match.vod_play_url,
          match._source,
          match._sourceName
        );
        allPlaySources.push(...playSources);
      }
    }
  }

  // 生成唯一 ID
  mainItem.vod_uniq_id = generateUniqueId(mainItem.vod_name, mainItem.vod_year);

  // 附加聚合后的播放线路
  mainItem._playSources = allPlaySources;
  mainItem._sourceCount = new Set(allPlaySources.map(p => p.sourceId)).size;

  const result = {
    code: 1,
    list: [mainItem],
    pagecount: 1,
    page: 1,
    total: 1
  };

  setCache(cacheKey, result);
  return result;
}

async function getCategoryList() {
  const cacheKey = `category`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'typelist' };

  for (const source of sources) {
    const data = await fetchFromSource(source, params);
    if (data && data.list && data.list.length > 0) {
      setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [] };
}

module.exports = {
  getVideoList,
  searchVideos,
  getVideoDetail,
  getCategoryList,
  sources,
  getEnabledSources,
};
