import sources from '../config/sources.mjs';

const CACHE_TTL = 5 * 60; // 秒
const CACHE_PREFIX = 'https://cache.local/';

const breakerState = new Map();

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
    // Cache API 不可用时静默降级（local dev 偶尔不支持）
  }
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

function getSourceById(sourceId) {
  return sources.find((s) => s.id === sourceId);
}

export function getEnabledSources() {
  return sources.filter((s) => s.enabled);
}

export async function getVideoList(page = 1, sourceId = '') {
  const cacheKey = `list:${sourceId}:${page}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page };
  const targetSources = sourceId
    ? [getSourceById(sourceId)].filter(Boolean)
    : sources;

  for (const source of targetSources) {
    const data = await fetchFromSource(source, params);
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      await setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [], pagecount: 1, page: page, total: 0 };
}

export async function searchVideos(keyword, page = 1, sourceId = '') {
  const cacheKey = `search:${sourceId}:${page}:${encodeURIComponent(keyword)}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', pg: page, wd: keyword };

  if (sourceId) {
    const source = getSourceById(sourceId);
    if (source) {
      const data = await fetchFromSource(source, params);
      if (data) {
        await setCache(cacheKey, data);
        return data;
      }
    }
    return { code: 1, list: [], pagecount: 1, page: page, total: 0 };
  }

  const results = await Promise.all(
    sources.map((s) => fetchFromSource(s, params))
  );

  let mergedList = [];
  let maxPageCount = 1;

  results.forEach((data) => {
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      mergedList = mergedList.concat(data.list);
      if (data.pagecount > maxPageCount) {
        maxPageCount = data.pagecount;
      }
    }
  });

  const seen = new Set();
  mergedList = mergedList.filter((item) => {
    if (seen.has(item.vod_name)) return false;
    seen.add(item.vod_name);
    return true;
  });

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

export async function getVideoDetail(id, sourceId = '') {
  const cacheKey = `detail:${sourceId}:${id}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'videolist', ids: id };
  const targetSources = sourceId
    ? [getSourceById(sourceId)].filter(Boolean)
    : sources;

  for (const source of targetSources) {
    const data = await fetchFromSource(source, params);
    if (data && data.code === 1 && data.list && data.list.length > 0) {
      await setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [], pagecount: 1, page: 1, total: 0 };
}

export async function getCategoryList(sourceId = '') {
  const cacheKey = `category:${sourceId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const params = { ac: 'typelist' };
  const targetSources = sourceId
    ? [getSourceById(sourceId)].filter(Boolean)
    : sources;

  for (const source of targetSources) {
    const data = await fetchFromSource(source, params);
    if (data && data.list && data.list.length > 0) {
      await setCache(cacheKey, data);
      return data;
    }
  }

  return { code: 1, list: [] };
}
