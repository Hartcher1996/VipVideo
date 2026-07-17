(function () {
  'use strict';

  let currentPage = 1;
  let currentKeyword = '';
  let currentTypeId = '';
  let totalPage = 1;
  let currentVideo = null;
  let playSources = [];
  let currentSourceIndex = 0;

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

  async function loadCategories() {
    try {
      const data = await VideoAPI.loadCategories();
      if (data.code === 1 && data.list) {
        VideoListComponent.renderCategories(data.list, currentTypeId, (tid) => {
          currentTypeId = tid;
          currentKeyword = '';
          currentPage = 1;
          document.getElementById('searchInput').value = '';
          const title = tid ? data.list.find(c => String(c.type_id) === String(tid))?.type_name : '热门推荐';
          document.getElementById('listTitle').textContent = title || '热门推荐';
          updateBreadcrumb([{ text: '首页', page: 'home' }, { text: document.getElementById('listTitle').textContent }]);
          loadVideoList(1, '', tid);
        });
      }
    } catch (error) {
      console.error('加载分类失败:', error);
    }
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

  function initEvents() {
    document.getElementById('logoBtn').addEventListener('click', goHome);

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
    const theme = VideoStorage.getTheme();
    VideoStorage.setTheme(theme);
    document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';

    initEvents();
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
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
