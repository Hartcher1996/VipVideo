(function() {
  'use strict';

  const PLACEHOLDER_COVER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect fill="%232a2a4a" width="300" height="420"/><text x="150" y="210" fill="%23888" font-size="18" text-anchor="middle" font-family="Arial">暂无封面</text></svg>';
  const SOURCE_KEY = 'video_source';

  let abortController = null;
  const responseCache = new Map();
  const CACHE_TTL = 60 * 1000;
  let currentSource = '';
  const inFlightRequests = new Set();

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function setSource(sourceId) {
    currentSource = sourceId || '';
    try {
      localStorage.setItem(SOURCE_KEY, currentSource);
    } catch (e) {}
    responseCache.clear();
  }

  function getSource() {
    return currentSource;
  }

  function loadSavedSource() {
    try {
      const saved = localStorage.getItem(SOURCE_KEY);
      if (saved) {
        currentSource = saved;
      }
    } catch (e) {}
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
        if (currentSource) {
          body.source = currentSource;
        }
        return await fetchWithAbort(`/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal
        });
      } else {
        const searchParams = new URLSearchParams(params);
        if (currentSource) {
          searchParams.set('source', currentSource);
        }
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

  async function loadVideoList(page, keyword, typeId) {
    const params = { pg: page };
    if (keyword) params.wd = keyword;
    if (typeId) params.tid = typeId;
    return fetchAPI('list', params);
  }

  async function getCategories() {
    return fetchAPI('list', { ac: 'typelist' }, { abortable: false });
  }

  async function searchVideos(keyword, page) {
    return fetchAPI('search', { wd: keyword, pg: page });
  }

  async function loadVideoDetail(id) {
    return fetchAPI('detail', { ids: id }, { abortable: false });
  }

  async function getSources() {
    return fetchAPI('sources', {}, { abortable: false });
  }

  function parseEpisodes(video) {
    const playUrl = video.vod_play_url || '';
    if (!playUrl) return [];

    const episodes = [];
    const groups = playUrl.split('$$$');

    groups.forEach((group, groupIndex) => {
      const episodeList = group.split('#').filter(Boolean);
      episodeList.forEach((item, i) => {
        const parts = item.split('$');
        if (parts.length >= 2) {
          episodes.push({
            name: parts[0],
            url: parts[1],
            groupIndex: groupIndex,
            index: i
          });
        }
      });
    });

    return episodes;
  }

  function parsePlaySources(video) {
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
          episodes: episodes
        });
      }
    });

    return sources;
  }

  window.VideoAPI = {
    PLACEHOLDER_COVER,
    setSource,
    getSource,
    loadSavedSource,
    loadVideoList,
    getCategories,
    searchVideos,
    loadVideoDetail,
    getSources,
    parseEpisodes,
    parsePlaySources,
    escapeHtml: esc
  };
})();
