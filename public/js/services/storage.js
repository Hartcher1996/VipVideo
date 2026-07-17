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

  function addToHistory(video) {
    const history = getHistory();
    const existingIndex = history.findIndex(h => h.vod_id === video.vod_id);

    if (existingIndex !== -1) {
      history.splice(existingIndex, 1);
    }

    history.unshift({
      vod_id: video.vod_id,
      vod_name: video.vod_name,
      vod_pic: video.vod_pic,
      type_name: video.type_name,
      vod_remarks: video.vod_remarks,
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

  function removeFromHistory(videoId) {
    const history = getHistory();
    const filtered = history.filter(h => h.vod_id !== videoId);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('删除历史记录失败:', e);
    }
    return filtered;
  }

  function clearHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (e) {
      console.error('清空历史记录失败:', e);
    }
    return [];
  }

  function getProgress(videoId, sourceIndex, episodeIndex) {
    const key = `progress:${videoId}:${sourceIndex}:${episodeIndex}`;
    try {
      const val = localStorage.getItem(key);
      return val ? parseFloat(val) : 0;
    } catch (e) {
      return 0;
    }
  }

  function setProgress(videoId, sourceIndex, episodeIndex, time) {
    const key = `progress:${videoId}:${sourceIndex}:${episodeIndex}`;
    try {
      localStorage.setItem(key, time);
    } catch (e) {
      console.error('保存进度失败:', e);
    }
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

  window.VideoStorage = {
    getTheme,
    setTheme,
    toggleTheme,
    getHistory,
    addToHistory,
    removeFromHistory,
    clearHistory,
    getProgress,
    setProgress,
    getSavedListState,
    saveListState
  };
})();
