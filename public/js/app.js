(function () {
  'use strict';

  let currentPage = 1;
  let currentKeyword = '';
  let currentTypeId = '';
  let totalPage = 1;
  let currentVideo = null;
  let playSources = [];
  let currentSourceIndex = 0;
  let availableSources = [];

  const pages = {
    home: document.getElementById('homePage'),
    detail: document.getElementById('detailPage'),
    player: document.getElementById('playerPage'),
    history: document.getElementById('historyPage')
  };

  function showPage(pageName) {
    Object.keys(pages).forEach(key => {
      if (pages[key]) {
        pages[key].classList.toggle('active', key === pageName);
      }
    });
    window.scrollTo(0, 0);
  }

  function updateBreadcrumb(items) {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = items.map((item, index) => {
      const isLast = index === items.length - 1;
      if (item.page && !isLast) {
        return `<span class="breadcrumb-item" data-page="${item.page}" role="button" tabindex="0">${VideoAPI.escapeHtml(item.text)}</span><span class="breadcrumb-sep">›</span>`;
      }
      return `<span class="breadcrumb-item active">${VideoAPI.escapeHtml(item.text)}</span>`;
    }).join('');

    breadcrumb.querySelectorAll('.breadcrumb-item[data-page]').forEach(item => {
      const handler = () => {
        const page = item.dataset.page;
        if (page === 'home') {
          goHome();
        } else if (page === 'detail') {
          if (currentVideo) {
            PlayerComponent.pause();
            showPage('detail');
            updateBreadcrumb([
              { text: '首页', page: 'home' },
              { text: currentVideo.vod_name }
            ]);
          }
        }
      };
      item.addEventListener('click', handler);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  }

  function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function goHome() {
    PlayerComponent.pause();
    currentKeyword = '';
    currentTypeId = '';
    currentPage = 1;
    document.getElementById('searchInput').value = '';
    document.getElementById('listTitle').textContent = '热门推荐';
    showPage('home');
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
    VideoStorage.saveListState({ keyword: '', page: 1, typeId: '' });
    loadVideoList(1, '', '');
  }

  async function loadVideoList(page, keyword, typeId) {
    const videoList = document.getElementById('videoList');
    VideoListComponent.renderSkeletonCards(videoList);

    try {
      const data = await VideoAPI.loadVideoList(page, keyword, typeId);

      if (data.code === 1 && data.list && data.list.length > 0) {
        let filteredList = data.list;
        
        if (typeId && !keyword) {
          filteredList = data.list.filter(v => String(v.type_id) === String(typeId));
        }

        totalPage = data.pagecount || 1;
        
        if (filteredList.length > 0) {
          VideoListComponent.renderVideoList(filteredList, (id) => loadVideoDetail(id));
          VideoListComponent.updatePagination(
            page,
            totalPage,
            () => { if (page > 1) { currentPage--; loadVideoList(currentPage, keyword, typeId); } },
            () => { if (page < totalPage) { currentPage++; loadVideoList(currentPage, keyword, typeId); } },
            (targetPage) => { currentPage = targetPage; loadVideoList(currentPage, keyword, typeId); }
          );
          VideoStorage.saveListState({ keyword, page, typeId });
        } else {
          videoList.innerHTML = '<div class="loading">当前页没有该分类视频，尝试翻页</div>';
          VideoListComponent.updatePagination(page, totalPage, () => {}, () => {}, () => {});
        }
      } else {
        videoList.innerHTML = '<div class="loading">没有找到相关视频</div>';
        totalPage = 1;
        VideoListComponent.updatePagination(page, totalPage, () => {}, () => {}, () => {});
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        videoList.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
        showToast('加载失败，请稍后重试');
        console.error(error);
      }
    }
  }

  const DEFAULT_CATEGORIES = [
    { type_id: 8, type_name: '爱情片' },
    { type_id: 11, type_name: '剧情片' },
    { type_id: 13, type_name: '国产剧' },
    { type_id: 14, type_name: '港台剧' },
    { type_id: 15, type_name: '日韩剧' },
    { type_id: 16, type_name: '欧美剧' },
    { type_id: 20, type_name: '动作片' },
    { type_id: 21, type_name: '喜剧片' },
    { type_id: 22, type_name: '科幻片' },
    { type_id: 28, type_name: '综艺' },
    { type_id: 29, type_name: '动漫' },
    { type_id: 30, type_name: '日韩动漫' },
    { type_id: 31, type_name: '国产动漫' },
    { type_id: 32, type_name: '欧美动漫' },
  ];

  let categoriesCache = [];

  async function loadCategories() {
    try {
      const data = await VideoAPI.loadCategories();
      if (data.code === 1 && data.list && data.list.length > 0) {
        const firstItem = data.list[0];
        if (firstItem.type_id !== undefined && firstItem.type_name !== undefined && firstItem.vod_name === undefined) {
          categoriesCache = data.list;
        }
      }
    } catch (error) {
      console.log('分类接口不可用，使用默认分类');
    }

    if (categoriesCache.length === 0) {
      categoriesCache = DEFAULT_CATEGORIES;
    }

    renderCategories();
  }

  function renderCategories() {
    VideoListComponent.renderCategories(categoriesCache, currentTypeId, (tid) => {
      currentTypeId = tid;
      currentKeyword = '';
      currentPage = 1;
      document.getElementById('searchInput').value = '';
      const cat = categoriesCache.find(c => String(c.type_id) === String(tid));
      const title = tid ? (cat?.type_name || '分类') : '热门推荐';
      document.getElementById('listTitle').textContent = title;
      updateBreadcrumb([{ text: '首页', page: 'home' }, { text: title }]);
      loadVideoList(1, '', tid);
    });
  }

  async function loadVideoDetail(id) {
    showPage('detail');
    const detailContent = document.getElementById('detailContent');
    detailContent.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const data = await VideoAPI.loadVideoDetail(id);

      if (data.code === 1 && data.list && data.list.length > 0) {
        currentVideo = data.list[0];
        playSources = VideoAPI.parsePlaySources(currentVideo);
        currentSourceIndex = 0;

        VideoStorage.addToHistory(currentVideo);
        VideoDetailComponent.renderVideoDetail(currentVideo, playSources, (episodeIndex) => {
          showPage('player');
          PlayerComponent.playEpisode(currentVideo, playSources, currentSourceIndex, episodeIndex);
          updateBreadcrumb([
            { text: '首页', page: 'home' },
            { text: currentVideo.vod_name, page: 'detail' },
            { text: playSources[currentSourceIndex]?.episodes[episodeIndex]?.name || '' }
          ]);
        });

        updateBreadcrumb([
          { text: '首页', page: 'home' },
          { text: currentVideo.vod_name }
        ]);
      } else {
        detailContent.innerHTML = '<div class="loading">未找到视频信息</div>';
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        detailContent.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
        showToast('加载详情失败');
        console.error(error);
      }
    }
  }

  function renderHistory() {
    const history = VideoStorage.getHistory();
    const container = document.getElementById('historyList');
    const esc = VideoAPI.escapeHtml;

    if (history.length === 0) {
      container.innerHTML = '<div class="loading">暂无观看历史</div>';
      return;
    }

    container.innerHTML = `
      <div class="history-actions">
        <button class="history-clear-btn" id="clearHistoryBtn">清空历史</button>
      </div>
      <div class="video-grid">
        ${history.map(video => `
          <div class="video-card" data-id="${esc(video.vod_id)}" role="button" tabindex="0">
            <img class="cover" loading="lazy" src="${esc(video.vod_pic) || ''}" alt="${esc(video.vod_name)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E'">
            <div class="info">
              <div class="title">${esc(video.vod_name)}</div>
              <div class="meta">
                <span class="type">${esc(video.type_name) || ''}</span>
                <span>${esc(video.vod_remarks || '')}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.video-card').forEach(card => {
      card.addEventListener('click', () => loadVideoDetail(card.dataset.id));
    });

    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
      if (confirm('确定清空所有观看历史？')) {
        VideoStorage.clearHistory();
        renderHistory();
        showToast('历史已清空');
      }
    });
  }

  async function loadSources() {
    try {
      const data = await VideoAPI.getSources();
      if (data.code === 1 && data.sources) {
        availableSources = data.sources;
        renderSourceDropdown();
        updateSourceLabel();
      }
    } catch (error) {
      console.error('加载源列表失败:', error);
    }
  }

  function renderSourceDropdown() {
    const dropdown = document.getElementById('sourceDropdown');
    if (!dropdown) return;

    const esc = VideoAPI.escapeHtml;
    const currentSrc = VideoAPI.getSource();
    dropdown.innerHTML = `
      <div class="source-dropdown-item ${!currentSrc ? 'active' : ''}" data-id="" role="button" tabindex="0">
        <span class="source-name">全部源</span>
        ${!currentSrc ? '<span class="source-check">✓</span>' : ''}
      </div>
      ${availableSources.map(s => `
        <div class="source-dropdown-item ${currentSrc === s.id ? 'active' : ''}" data-id="${esc(s.id)}" role="button" tabindex="0">
          <span class="source-name">${esc(s.name)}</span>
          ${currentSrc === s.id ? '<span class="source-check">✓</span>' : ''}
        </div>
      `).join('')}
    `;

    dropdown.querySelectorAll('.source-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const sourceId = item.dataset.id || '';
        switchSource(sourceId);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const sourceId = item.dataset.id || '';
          switchSource(sourceId);
        }
      });
    });
  }

  function updateSourceLabel() {
    const label = document.getElementById('sourceLabel');
    if (!label) return;

    const currentSrc = VideoAPI.getSource();
    if (!currentSrc) {
      label.textContent = '全部源';
    } else {
      const source = availableSources.find(s => s.id === currentSrc);
      label.textContent = source ? source.name : '全部源';
    }
  }

  function switchSource(sourceId) {
    VideoAPI.setSource(sourceId);
    updateSourceLabel();
    renderSourceDropdown();
    const dropdown = document.getElementById('sourceDropdown');
    if (dropdown) dropdown.style.display = 'none';

    const srcName = sourceId ? (availableSources.find(s => s.id === sourceId)?.name || '全部源') : '全部源';
    showToast(`已切换到 ${srcName}`);

    if (pages.home.classList.contains('active')) {
      currentPage = 1;
      loadVideoList(1, currentKeyword, currentTypeId);
      loadCategories();
    }
  }

  function initEvents() {
    document.getElementById('logoBtn').addEventListener('click', goHome);

    const sourceBtn = document.getElementById('sourceBtn');
    const sourceDropdown = document.getElementById('sourceDropdown');
    if (sourceBtn && sourceDropdown) {
      sourceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sourceDropdown.style.display = sourceDropdown.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.source-switcher')) {
          sourceDropdown.style.display = 'none';
        }
      });
    }

    document.getElementById('searchBtn').addEventListener('click', () => {
      const keyword = document.getElementById('searchInput').value.trim();
      currentKeyword = keyword;
      currentTypeId = '';
      currentPage = 1;
      document.getElementById('listTitle').textContent = keyword ? `搜索: ${keyword}` : '热门推荐';
      showPage('home');
      updateBreadcrumb([
        { text: '首页', page: 'home' },
        { text: keyword ? `搜索「${keyword}」` : '热门推荐' }
      ]);
      loadVideoList(1, keyword, '');
    });

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') document.getElementById('searchBtn').click();
    });

    const clearBtn = document.getElementById('searchClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('searchInput').focus();
        clearBtn.style.display = 'none';
      });
      document.getElementById('searchInput').addEventListener('input', () => {
        clearBtn.style.display = document.getElementById('searchInput').value.trim() ? 'block' : 'none';
      });
    }

    const bindBackBtn = (btnId) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          PlayerComponent.pause();
          const state = VideoStorage.getSavedListState();
          currentKeyword = state.keyword;
          currentTypeId = state.typeId;
          currentPage = state.page;
          document.getElementById('searchInput').value = state.keyword;
          document.getElementById('listTitle').textContent = state.keyword ? `搜索: ${state.keyword}` : '热门推荐';
          showPage('home');
          updateBreadcrumb([{ text: '首页', page: 'home' }]);
        });
      }
    };
    bindBackBtn('backBtn');
    bindBackBtn('historyBackBtn');

    document.getElementById('playerBackBtn').addEventListener('click', () => {
      PlayerComponent.pause();
      showPage('detail');
      if (currentVideo) {
        updateBreadcrumb([
          { text: '首页', page: 'home' },
          { text: currentVideo.vod_name }
        ]);
      }
    });

    document.getElementById('prevEpBtn').addEventListener('click', () => PlayerComponent.prevEpisode());
    document.getElementById('nextEpBtn').addEventListener('click', () => PlayerComponent.nextEpisode());

    document.getElementById('themeToggle').addEventListener('click', () => {
      const theme = VideoStorage.toggleTheme();
      document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';
      showToast(theme === 'dark' ? '已切换深色模式' : '已切换浅色模式');
    });

    document.getElementById('historyBtn').addEventListener('click', () => {
      PlayerComponent.pause();
      showPage('history');
      updateBreadcrumb([{ text: '首页', page: 'home' }, { text: '观看历史' }]);
      renderHistory();
    });

    document.addEventListener('keydown', (e) => {
      if (!pages.player?.classList.contains('active')) return;
      if (e.target.tagName === 'INPUT') return;
      if (e.target.closest('.dplayer')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        PlayerComponent.prevEpisode();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        PlayerComponent.nextEpisode();
      }
    });
  }

  function init() {
    VideoAPI.loadSavedSource();

    const theme = VideoStorage.getTheme();
    VideoStorage.setTheme(theme);
    document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';

    initEvents();
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
    loadSources();
    loadCategories();
    loadVideoList(1, '', '');

    window.addEventListener('error', (e) => {
      console.error('全局错误:', e.error);
      showToast('发生错误，请刷新页面');
    });

    window.addEventListener('unhandledrejection', (e) => {
      console.error('未处理的 Promise 拒绝:', e.reason);
      showToast('请求失败，请重试');
    });
  }

  window.VideoApp = {
    showToast
  };

  init();
})();
