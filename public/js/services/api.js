(function () {
  'use strict';

  const API_BASE = '/api';
  const apiCache = new Map();
  let listFetchController = null;
  let detailFetchController = null;

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  async function fetchAPI(endpoint, params, signal) {
    const query = new URLSearchParams(params).toString();
    const key = endpoint + '?' + query;
    const url = API_BASE + '/' + endpoint + (query ? '?' + query : '');

    if (apiCache.has(key)) {
      const cached = apiCache.get(key);
      if (Date.now() - cached.time < 60000) {
        return cached.data;
      }
    }

    const response = await fetch(url, { signal });
    if (!response.ok) {
      const text = await response.text();
      console.error('请求失败:', url, '状态:', response.status, '响应:', text.substring(0, 200));
      throw new Error('请求失败: ' + response.status);
    }
    const data = await response.json();
    apiCache.set(key, { data, time: Date.now() });
    return data;
  }

  async function loadVideoList(page, keyword, typeId) {
    page = page || 1;
    keyword = keyword || '';

    if (listFetchController) listFetchController.abort();
    listFetchController = new AbortController();

    const params = { pg: page };
    if (keyword) params.wd = keyword;
    if (typeId) params.tid = typeId;

    const data = await fetchAPI('list', params, listFetchController.signal);
    return data;
  }

  async function loadVideoDetail(id) {
    if (detailFetchController) detailFetchController.abort();
    detailFetchController = new AbortController();
    const data = await fetchAPI('detail', { ids: id }, detailFetchController.signal);
    return data;
  }

  async function loadCategories() {
    const data = await fetchAPI('list', { ac: 'typelist' });
    return data;
  }

  function parsePlaySources(video) {
    const playFrom = video.vod_play_from || '';
    const playUrl = video.vod_play_url || '';

    const sources = [];
    if (playFrom && playUrl) {
      const fromArr = playFrom.split('$$$');
      const urlArr = playUrl.split('$$$');

      fromArr.forEach((source, index) => {
        if (urlArr[index]) {
          const episodes = urlArr[index].split('#').map(item => {
            const parts = item.split('$');
            return { name: parts[0] || '', url: parts[1] || '' };
          }).filter(ep => ep.name && ep.url);

          if (episodes.length > 0) {
            sources.push({
              name: source || '播放源' + (index + 1),
              episodes: episodes
            });
          }
        }
      });
    }
    return sources;
  }

  window.VideoAPI = {
    loadVideoList,
    loadVideoDetail,
    loadCategories,
    parsePlaySources,
    escapeHtml
  };
})();
