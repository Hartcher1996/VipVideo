(function () {
  'use strict';

  const THEME_KEY = 'video_theme';
  const HISTORY_KEY = 'video_history';
  const MAX_HISTORY = 50;

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    document.body.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
  }

  function getHistory() {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  // 添加历史记录：可携带续看信息（lastSourceIdx, lastEpisodeIdx, lastEpisodeName）
  function addToHistory(video, opts) {
    const history = getHistory();
    const uniqId = video.vod_uniq_id || video.vod_id;
    const existingIndex = history.findIndex(h => (h.vod_uniq_id || h.vod_id) === uniqId);

    // 保留已有的续看信息（除非传入新的）
    let lastSourceIdx = 0;
    let lastEpisodeIdx = 0;
    let lastEpisodeName = '';
    let vodSource = video._source || '';
    if (existingIndex !== -1) {
      const prev = history[existingIndex];
      lastSourceIdx = prev.lastSourceIdx || 0;
      lastEpisodeIdx = prev.lastEpisodeIdx || 0;
      lastEpisodeName = prev.lastEpisodeName || '';
      if (!vodSource) vodSource = prev.vod_source || '';
    }
    if (opts && typeof opts === 'object') {
      if (typeof opts.lastSourceIdx === 'number') lastSourceIdx = opts.lastSourceIdx;
      if (typeof opts.lastEpisodeIdx === 'number') lastEpisodeIdx = opts.lastEpisodeIdx;
      if (typeof opts.lastEpisodeName === 'string') lastEpisodeName = opts.lastEpisodeName;
    }

    if (existingIndex !== -1) {
      history.splice(existingIndex, 1);
    }

    history.unshift({
      vod_id: video.vod_id,
      vod_uniq_id: video.vod_uniq_id || '',
      vod_source: vodSource,
      vod_name: video.vod_name,
      vod_pic: video.vod_pic,
      type_name: video.type_name,
      vod_remarks: video.vod_remarks,
      vod_year: video.vod_year || '',
      lastSourceIdx,
      lastEpisodeIdx,
      lastEpisodeName,
      timestamp: Date.now()
    });

    if (history.length > MAX_HISTORY) {
      history.pop();
    }

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('保存历史记录失败:', e);
    }

    return history;
  }

  // 删除单条历史记录
  function removeHistory(uniqId) {
    const history = getHistory();
    const idx = history.findIndex(h => (h.vod_uniq_id || h.vod_id) === uniqId);
    if (idx !== -1) {
      history.splice(idx, 1);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch (e) {
        console.error('删除历史记录失败:', e);
      }
    }
    return history;
  }

  function clearHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (e) {
      console.error('清空历史记录失败:', e);
    }
    return [];
  }

  function getSavedListState() {
    try {
      const data = localStorage.getItem('list_state');
      return data ? JSON.parse(data) : { keyword: '', page: 1, typeId: '' };
    } catch (e) {
      return { keyword: '', page: 1, typeId: '' };
    }
  }

  function saveListState(state) {
    try {
      localStorage.setItem('list_state', JSON.stringify(state));
    } catch (e) {
      console.error('保存列表状态失败:', e);
    }
  }

  // 时间分组：今天 / 昨天 / 本周 / 更早
  function groupHistoryByTime(history) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 24 * 60 * 60 * 1000;
    const weekAgo = today - 7 * 24 * 60 * 60 * 1000;

    const groups = {
      today: { title: '今天', items: [] },
      yesterday: { title: '昨天', items: [] },
      thisWeek: { title: '本周', items: [] },
      earlier: { title: '更早', items: [] }
    };

    for (const item of history) {
      const ts = item.timestamp || 0;
      if (ts >= today) groups.today.items.push(item);
      else if (ts >= yesterday) groups.yesterday.items.push(item);
      else if (ts >= weekAgo) groups.thisWeek.items.push(item);
      else groups.earlier.items.push(item);
    }

    // 过滤空分组
    return Object.values(groups).filter(g => g.items.length > 0);
  }

  // 格式化时间为相对时间
  function formatRelativeTime(ts) {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;

    if (diff < min) return '刚刚';
    if (diff < hour) return Math.floor(diff / min) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 7 * day) return Math.floor(diff / day) + ' 天前';
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  window.VideoStorage = {
    getTheme,
    setTheme,
    toggleTheme,
    getHistory,
    addToHistory,
    removeHistory,
    clearHistory,
    getSavedListState,
    saveListState,
    groupHistoryByTime,
    formatRelativeTime
  };
})();
