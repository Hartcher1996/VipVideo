import sources from './config/sources.mjs';

const CACHE_TTL = 5 * 60; // 秒
const CACHE_PREFIX = 'https://cache.local/';

const breakerState = new Map();

// ============ 缓存 ============

async function getCache(key) {
  try {
    const cache = await caches.default;
    const res = await cache.match(new Request(CACHE_PREFIX + key));
    if (!res) return null;
    const data = await res.json();
    if (Date.now() > data._expires) return null;
    delete data._expires;
    return data;
  } catch (e) {
    return null;
  }
}

async function setCache(key, data, ttl = CACHE_TTL) {
  try {
    const cache = await caches.default;
    const payload = { ...data, _expires: Date.now() + ttl * 1000 };
    await cache.put(
      new Request(CACHE_PREFIX + key),
      new Response(JSON.stringify(payload), {
        headers: {
          'Cache-Control': `max-age=${ttl}`,
          'Content-Type': 'application/json',
        },
      })
    );
  } catch (e) {
    // Cache API 不可用时静默降级
  }
}

// ============ 熔断器 ============

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

// ============ HTTP ============

async function fetchRaw(urlString, timeoutMs = 10000) {
  const res = await fetch(urlString, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

async function fetchFromSource(source, params) {
  if (!source.enabled) return null;
  if (isTripped(source.id)) return null;

  const query = new URLSearchParams(params).toString();
  const url = source.baseUrl + (query ? '?' + query : '');

  console.log(`[${source.id}] Request: ${url}`);

  try {
    const raw = await fetchRaw(url);
    recordSuccess(source.id);

    const jsonStr = raw.substring(0, raw.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonStr);

    if (data.list && Array.isArray(data.list)) {
      data.list.forEach((item) => {
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

export function getEnabledSources() {
  return sources.filter((s) => s.enabled);
}

// ============ 工具函数：URL 类型识别 ============
// 识别播放 URL 的类型，为前端播放分发提供依据
// 返回值：'official'（官方平台URL，可套解析API）
//        'm3u8'（m3u8 直链，走 HLS 播放器）
//        'shareDirect'（资源站自带播放器的分享页，如 U酷云播，直接 iframe 嵌入）
//        'share'（share 跳转，需二次解析）
//        'unknown'（未识别）
export function classifyPlayUrl(url) {
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
  // 放宽长度和字符集：支持短 ID、字母数字混合
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
// 用 SHA-1(vod_name + vod_year) 生成稳定的 av_ 前缀唯一 ID
// 同样的影片每次计算结果一致，无需数据库存储映射关系
export async function generateUniqueId(vodName, vodYear = '') {
  const input = `${vodName || ''}|${vodYear || ''}`;
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(buf)]
    .slice(0, 10) // 取前 10 字节 = 20 位十六进制，足够避免碰撞
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return 'av_' + hex;
}

// 同步版本（用于不便 async 的场景，基于简单 hash）
// 注意：与 async 版本结果不同，仅作为兜底
function generateUniqueIdSync(vodName, vodYear = '') {
  const input = `${vodName || ''}|${vodYear || ''}`;
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h) + input.charCodeAt(i);
    h |= 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, '0').repeat(3).slice(0, 20);
  return 'av_' + hex;
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

// ============ 列表/搜索 ============

export async function getVideoList(page = 1) {
  const cacheKey = `list:${page}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page };

  for (const source of sources) {
    const data = await fetchFromSource(source, params);
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      // 为每条记录生成唯一 ID
      for (const item of data.list) {
        item.vod_uniq_id = await generateUniqueId(item.vod_name, item.vod_year);
      }
      await setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [], pagecount: 1, page: page, total: 0 };
}

// ============ 工具函数：关键词相关性 ============
// 部分资源站会忽略 wd 直接返回最新列表，需要在聚合时过滤掉与关键词无关的条目
function normalizeForMatch(str) {
  return String(str || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function matchesKeyword(item, keyword) {
  const kw = normalizeForMatch(keyword);
  if (!kw) return true;
  const haystack = normalizeForMatch(
    [item.vod_name, item.vod_sub, item.vod_actor, item.vod_director, item.vod_blurb].join(' ')
  );
  return haystack.includes(kw);
}

// 排序分数：片名完全匹配 > 前缀匹配 > 包含 > 仅其他字段匹配
function relevanceScore(item, keyword) {
  const kw = normalizeForMatch(keyword);
  const name = normalizeForMatch(item.vod_name);
  if (!kw) return 0;
  if (name === kw) return 0;
  if (name.startsWith(kw)) return 1;
  if (name.includes(kw)) return 2;
  return 3;
}

// 聚合搜索：多源并行 → 按 vod_name 归并 → 同片多源收集到 _playSources
// 项目无单源模式：搜索永远聚合所有启用源
export async function searchVideos(keyword, page = 1) {
  const cacheKey = `search:${page}:${encodeURIComponent(keyword)}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page, wd: keyword };

  // 聚合模式：多源并行请求
  const results = await Promise.all(
    sources.map((s) => fetchFromSource(s, params))
  );

  // 用 Map 按 vod_name 归并
  const grouped = new Map();
  let maxPageCount = 1;

  for (const data of results) {
    if (!data || data.code !== 1 || !Array.isArray(data.list)) continue;
    const sourceItems = data.list.filter((item) => item.vod_name && matchesKeyword(item, keyword));
    // 只有整页结果都与关键词相关时才采信该源的 pagecount，
    // 避免忽略 wd 的源用「全站列表页数」污染分页
    if (sourceItems.length > 0 && sourceItems.length === data.list.length && data.pagecount > maxPageCount) {
      maxPageCount = data.pagecount;
    }

    for (const item of sourceItems) {
      const key = item.vod_name;

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
    item.vod_uniq_id = await generateUniqueId(item.vod_name, item.vod_year);
    // 清理原始播放字段（前端改用 _playSources）
    // 保留 vod_play_from / vod_play_url 作为兼容字段
    mergedList.push(item);
  }

  // 按相关度排序：片名完全匹配的排最前
  mergedList.sort((a, b) => relevanceScore(a, keyword) - relevanceScore(b, keyword));

  const result = {
    code: 1,
    list: mergedList,
    pagecount: maxPageCount,
    page: page,
    total: mergedList.length,
  };

  await setCache(cacheKey, result);
  return result;
}

// 详情也做聚合：先用 vod_id 拿主条目，
// 同时补全其他源的播放线路（如果有同名影片）
// sourceId：卡片所属源。不同源的 vod_id 空间会冲突，必须优先用同源查询
export async function getVideoDetail(id, sourceId = '', expectedName = '') {
  const cacheKey = `detail:${sourceId || 'any'}:${id}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', ids: id };

  let mainItem = null;
  const allPlaySources = [];

  // 1) 指定源优先：卡片的 vod_id 本来就来自该源，直接采用
  if (sourceId) {
    for (const source of sources.filter((s) => s.id === sourceId)) {
      const data = await fetchFromSource(source, params);
      if (data && data.code === 1 && data.list && data.list.length > 0) {
        mainItem = { ...data.list[0] };
        break;
      }
    }
  }

  // 2) 指定源不可用（或未指定）时回落其他源，但必须片名一致，
  //    避免不同源的同号 id 串成另一部片
  if (!mainItem) {
    const expected = normalizeForMatch(expectedName);
    for (const source of sources.filter((s) => s.id !== sourceId)) {
      const data = await fetchFromSource(source, params);
      if (!data || data.code !== 1 || !Array.isArray(data.list)) continue;
      const hit = expected
        ? data.list.find((it) => normalizeForMatch(it.vod_name) === expected)
        : data.list[0];
      if (hit) {
        mainItem = { ...hit };
        break;
      }
    }
  }

  if (mainItem) {
    // 解析主源的播放线路
    const playSources = parsePlaySources(
      mainItem.vod_play_from,
      mainItem.vod_play_url,
      mainItem._source,
      mainItem._sourceName
    );
    allPlaySources.push(...playSources);
  }

  if (!mainItem) {
    return { code: 1, list: [], pagecount: 1, page: 1, total: 0 };
  }

  // 聚合其他源的同名影片播放线路
  if (mainItem.vod_name) {
    const searchParams = { ac: 'videolist', wd: mainItem.vod_name };
    const otherResults = await Promise.all(
      sources
        .filter((s) => s.id !== mainItem._source)
        .map((s) => fetchFromSource(s, searchParams))
    );

    for (const data of otherResults) {
      if (!data || data.code !== 1 || !Array.isArray(data.list)) continue;
      // 找同名影片
      const match = data.list.find(
        (it) => it.vod_name === mainItem.vod_name
      );
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
  mainItem.vod_uniq_id = await generateUniqueId(
    mainItem.vod_name,
    mainItem.vod_year
  );

  // 附加聚合后的播放线路
  mainItem._playSources = allPlaySources;
  mainItem._sourceCount = new Set(allPlaySources.map((p) => p.sourceId)).size;

  const result = {
    code: 1,
    list: [mainItem],
    pagecount: 1,
    page: 1,
    total: 1,
  };

  await setCache(cacheKey, result);
  return result;
}

export async function getCategoryList() {
  const cacheKey = `category`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'typelist' };

  for (const source of sources) {
    const data = await fetchFromSource(source, params);
    if (data && data.list && data.list.length > 0) {
      await setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [] };
}
