(function() {
  'use strict';

  let abortController = null;
  const responseCache = new Map();
  const CACHE_TTL = 60 * 1000;

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function hasChinese(str) {
    return /[\u4e00-\u9fa5]/.test(str);
  }

  function paramsHaveChinese(params) {
    for (const key in params) {
      if (params[key] && hasChinese(String(params[key]))) {
        return true;
      }
    }
    return false;
  }

  async function fetchWithAbort(url, options) {
    const cacheKey = url + (options.body || '');
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return cached.data;
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      console.error('请求失败:', url, '状态:', response.status, '响应:', text.substring(0, 200));
      throw new Error('请求失败: ' + response.status);
    }
    const data = await response.json();
    responseCache.set(cacheKey, { data, time: Date.now() });
    return data;
  }

  async function fetchAPI(endpoint, params = {}, options = {}) {
    const { abortable = true } = options;

    if (abortable && abortController) {
      abortController.abort();
    }

    const controller = abortable ? new AbortController() : null;
    if (abortable) {
      abortController = controller;
    }

    const signal = controller ? controller.signal : undefined;
    const usePost = paramsHaveChinese(params);

    try {
      if (usePost) {
        const body = { ...params };
        return await fetchWithAbort(`/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal
        });
      } else {
        const searchParams = new URLSearchParams(params);
        const url = `/api/${endpoint}?${searchParams.toString()}`;
        return await fetchWithAbort(url, { signal });
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(`[VideoAPI] ${endpoint} 失败:`, error);
      }
      throw error;
    }
  }

  async function loadVideoList(page, keyword, typeId, options) {
    const params = { pg: page };
    if (keyword) params.wd = keyword;
    if (typeId) params.tid = typeId;
    return fetchAPI('list', params, options || {});
  }

  async function loadVideoDetail(id, source, name) {
    const params = { ids: id };
    // 带上卡片所属源与片名：不同源的 vod_id 会重号，避免详情取到别的片
    if (source) params.source = source;
    if (name) params.name = name;
    return fetchAPI('detail', params, { abortable: false });
  }

  function parsePlaySources(video) {
    // 优先使用后端 Phase 1 返回的结构化 _playSources
    // 后端已经做了多源聚合 + URL 类型识别
    if (Array.isArray(video._playSources) && video._playSources.length > 0) {
      // 规范化字段：兼容旧调用方（name/source 字段）
      return video._playSources.map(s => ({
        name: s.sourceName || s.lineName || `线路${(s.lineId || '').split('_')[1] || '1'}`,
        source: s.sourceId || '',
        sourceId: s.sourceId || '',
        sourceName: s.sourceName || '',
        lineId: s.lineId || '',
        lineName: s.lineName || s.sourceName || '',
        urlType: s.urlType || 'unknown',
        episodes: (s.episodes || []).map((ep, i) => ({
          name: ep.name || `第${i + 1}集`,
          url: ep.url || '',
          index: i
        }))
      }));
    }

    // 兜底：本地解析 vod_play_from / vod_play_url
    const playUrl = video.vod_play_url || '';
    const playNote = video.vod_play_from || '';
    if (!playUrl) return [];

    const sources = [];
    const groups = playUrl.split('$$$');
    const names = playNote ? playNote.split('$$$') : [];

    groups.forEach((group, groupIndex) => {
      const episodeList = group.split('#').filter(Boolean);
      const episodes = [];
      episodeList.forEach((item, i) => {
        const parts = item.split('$');
        if (parts.length >= 2) {
          episodes.push({
            name: parts[0],
            url: parts[1],
            index: i
          });
        }
      });

      if (episodes.length > 0) {
        sources.push({
          name: names[groupIndex] || `线路${groupIndex + 1}`,
          source: '',
          sourceId: '',
          sourceName: '',
          lineId: `local_${groupIndex}`,
          lineName: names[groupIndex] || `线路${groupIndex + 1}`,
          urlType: classifyUrlLocal(episodes[0].url),
          episodes: episodes
        });
      }
    });

    return sources;
  }

  // 本地 URL 类型识别（兜底，与后端 classifyPlayUrl 保持一致）
  function classifyUrlLocal(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    if (
      /v\.qq\.com\/x\/cover/i.test(url) ||
      /iqiyi\.com\/v_/i.test(url) ||
      /youku\.com\/v_show/i.test(url) ||
      /mgtv\.com\/b/i.test(url) ||
      /bilibili\.com\/bangumi/i.test(url) ||
      /sohu\.com|tv\.sohu\.com/i.test(url) ||
      /le\.com\/ptv/i.test(url) ||
      /vip\.1905\.com/i.test(url) ||
      /pptv\.com/i.test(url)
    ) {
      return 'official';
    }
    if (/\.m3u8(\?|$|#)/i.test(url)) return 'm3u8';
    // 与后端保持一致：share 短 ID 放宽到 4 位字符；/play/ 也当 share（需解析代理）
    if (/\/share\/[a-zA-Z0-9]{4,}/i.test(url)) {
      // U酷云播（ukzy*.ukubf*.com/share/xxx）：站点自带播放器，直接 iframe 嵌入
      try {
        const host = new URL(url).hostname;
        if (/ukzy|ukubf/i.test(host)) return 'shareDirect';
      } catch (e) {}
      return 'share';
    }
    if (/\/play\/[a-zA-Z0-9_-]{4,}/i.test(url)) {
      // 金鹰云播（*.ijycnd.com/play/xxx）：站点自带播放器，直接 iframe 嵌入
      try {
        const host = new URL(url).hostname;
        if (/ijycnd/i.test(host)) return 'shareDirect';
      } catch (e) {}
      return 'share';
    }
    return 'unknown';
  }

  window.VideoAPI = {
    loadVideoList,
    loadVideoDetail,
    parsePlaySources,
    escapeHtml: esc
  };
})();
