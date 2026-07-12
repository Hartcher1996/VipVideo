(function () {
  'use strict';

  const API_BASE = '/api';
  let currentPage = 1;
  let currentKeyword = '';
  let totalPage = 1;
  let currentVideo = null;
  let playSources = [];
  let currentSourceIndex = 0;
  let currentEpisodeIndex = 0;
  let dp = null;

  // 请求去重
  let listFetchController = null;
  let detailFetchController = null;

  // 列表状态记忆
  let savedListState = { keyword: '', page: 1 };

  const $ = (id) => document.getElementById(id);

  const pages = {
    home: $('homePage'),
    detail: $('detailPage'),
    player: $('playerPage')
  };

  // ---- 工具函数 ----

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  const PLACEHOLDER_COVER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E';

  function showToast(msg) {
    let toast = $('toast');
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

  // ---- 页面切换 ----

  function showPage(pageName) {
    Object.keys(pages).forEach(key => {
      pages[key].classList.toggle('active', key === pageName);
    });
    window.scrollTo(0, 0);
  }

  function updateBreadcrumb(items) {
    const breadcrumb = $('breadcrumb');
    breadcrumb.innerHTML = items.map((item, index) => {
      const isLast = index === items.length - 1;
      if (item.page && !isLast) {
        return `<span class="breadcrumb-item" data-page="${item.page}" role="button" tabindex="0">${escapeHtml(item.text)}</span><span class="breadcrumb-sep">›</span>`;
      }
      return `<span class="breadcrumb-item active">${escapeHtml(item.text)}</span>`;
    }).join('');

    breadcrumb.querySelectorAll('.breadcrumb-item[data-page]').forEach(item => {
      const handler = () => {
        const page = item.dataset.page;
        if (page === 'home') {
          goHome();
        } else if (page === 'detail') {
          if (currentVideo) {
            if (dp) dp.pause();
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

  function goHome() {
    if (dp) dp.pause();
    currentKeyword = '';
    currentPage = 1;
    savedListState = { keyword: '', page: 1 };
    $('searchInput').value = '';
    $('listTitle').textContent = '热门推荐';
    showPage('home');
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
    loadVideoList(1);
  }

  // ---- API ----

  async function fetchAPI(endpoint, params, signal) {
    const query = new URLSearchParams(params).toString();
    const url = API_BASE + '/' + endpoint + (query ? '?' + query : '');
    const response = await fetch(url, { signal });
    if (!response.ok) {
      const text = await response.text();
      console.error('请求失败:', url, '状态:', response.status, '响应:', text.substring(0, 200));
      throw new Error('请求失败: ' + response.status);
    }
    return response.json();
  }

  async function loadVideoList(page, keyword) {
    page = page || 1;
    keyword = keyword || '';

    // 取消上一个请求
    if (listFetchController) listFetchController.abort();
    listFetchController = new AbortController();

    const videoList = $('videoList');
    renderSkeletonCards(videoList);

    try {
      const params = { pg: page };
      if (keyword) params.wd = keyword;

      const data = await fetchAPI('list', params, listFetchController.signal);

      if (data.code === 1 && data.list && data.list.length > 0) {
        totalPage = data.pagecount || 1;
        renderVideoList(data.list);
        updatePagination();
        savedListState = { keyword, page };
      } else {
        videoList.innerHTML = '<div class="loading">没有找到相关视频</div>';
        totalPage = 1;
        updatePagination();
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      videoList.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
      showToast('加载失败，请稍后重试');
      console.error(error);
    }
  }

  function renderSkeletonCards(container) {
    const skeletons = Array.from({ length: 12 }, () =>
      '<div class="skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-info"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>'
    ).join('');
    container.innerHTML = skeletons;
  }

  function renderVideoList(videos) {
    const videoList = $('videoList');
    videoList.innerHTML = videos.map(video => `
      <div class="video-card" data-id="${escapeHtml(video.vod_id)}" role="button" tabindex="0">
        <img class="cover" loading="lazy" src="${escapeHtml(video.vod_pic) || PLACEHOLDER_COVER}" alt="${escapeHtml(video.vod_name)}" onerror="this.src='${PLACEHOLDER_COVER}'">
        <div class="info">
          <div class="title">${escapeHtml(video.vod_name)}</div>
          <div class="meta">
            <span class="type">${escapeHtml(video.type_name) || ''}</span>
            <span>${escapeHtml(video.vod_remarks) || ''}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function updatePagination() {
    $('pageInfo').textContent = `第 ${currentPage} / ${totalPage} 页`;
    $('prevPage').disabled = currentPage <= 1;
    $('nextPage').disabled = currentPage >= totalPage;
    const jumpInput = $('jumpPage');
    if (jumpInput) {
      jumpInput.max = totalPage;
      jumpInput.placeholder = totalPage;
    }
  }

  // ---- 事件委托 ----

  function setupDelegatedEvents() {
    // 视频卡片点击
    $('videoList').addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      if (card) loadVideoDetail(card.dataset.id);
    });
    $('videoList').addEventListener('keydown', (e) => {
      const card = e.target.closest('.video-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        loadVideoDetail(card.dataset.id);
      }
    });

    // 详情页播放源切换 + 剧集点击
    $('detailContent').addEventListener('click', (e) => {
      const tab = e.target.closest('.source-tab');
      if (tab) {
        const index = parseInt(tab.dataset.index);
        currentSourceIndex = index;
        currentEpisodeIndex = 0;
        $('detailContent').querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderDetailEpisodeList(index);
        return;
      }
      const item = e.target.closest('.play-item');
      if (item) {
        const eIndex = parseInt(item.dataset.episode);
        playEpisode(eIndex);
      }
    });

    // 播放页播放源切换 + 剧集点击
    $('playerSourceTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.sidebar-tab');
      if (tab) {
        const index = parseInt(tab.dataset.index);
        if (index === currentSourceIndex) return;
        currentSourceIndex = index;
        currentEpisodeIndex = 0;
        renderPlayerSourceTabs();
        renderPlayerEpisodeList();
        playEpisode(0);
      }
    });

    $('playerEpisodeList').addEventListener('click', (e) => {
      const item = e.target.closest('.episode-item');
      if (item) {
        const index = parseInt(item.dataset.index);
        if (index === currentEpisodeIndex) return;
        playEpisode(index);
      }
    });
  }

  // ---- 详情页 ----

  async function loadVideoDetail(id) {
    showPage('detail');
    const detailContent = $('detailContent');
    detailContent.innerHTML = '<div class="loading">加载中...</div>';

    if (detailFetchController) detailFetchController.abort();
    detailFetchController = new AbortController();

    try {
      const data = await fetchAPI('detail', { ids: id }, detailFetchController.signal);

      if (data.code === 1 && data.list && data.list.length > 0) {
        currentVideo = data.list[0];
        playSources = parsePlaySources(currentVideo);
        currentSourceIndex = 0;
        currentEpisodeIndex = 0;
        renderVideoDetail(currentVideo);
        updateBreadcrumb([
          { text: '首页', page: 'home' },
          { text: currentVideo.vod_name }
        ]);
      } else {
        detailContent.innerHTML = '<div class="loading">未找到视频信息</div>';
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      detailContent.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
      showToast('加载详情失败');
      console.error(error);
    }
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

  function renderVideoDetail(video) {
    const detailContent = $('detailContent');

    detailContent.innerHTML = `
      <div class="detail-header">
        <div class="detail-cover">
          <img src="${escapeHtml(video.vod_pic) || PLACEHOLDER_COVER}" alt="${escapeHtml(video.vod_name)}" onerror="this.src='${PLACEHOLDER_COVER}'">
        </div>
        <div class="detail-info">
          <h1>${escapeHtml(video.vod_name)}</h1>
          <div class="tags">
            ${video.type_name ? '<span class="tag highlight">' + escapeHtml(video.type_name) + '</span>' : ''}
            ${video.vod_year ? '<span class="tag">' + escapeHtml(video.vod_year) + '</span>' : ''}
            ${video.vod_area ? '<span class="tag">' + escapeHtml(video.vod_area) + '</span>' : ''}
            ${video.vod_remarks ? '<span class="tag">' + escapeHtml(video.vod_remarks) + '</span>' : ''}
          </div>
          ${video.vod_actor ? '<p class="detail-meta-line"><strong>演员：</strong>' + escapeHtml(video.vod_actor) + '</p>' : ''}
          ${video.vod_director ? '<p class="detail-meta-line"><strong>导演：</strong>' + escapeHtml(video.vod_director) + '</p>' : ''}
          <p class="desc">${escapeHtml(video.vod_content || video.vod_blurb) || '暂无简介'}</p>
        </div>
      </div>
      ${playSources.length > 0 ? `
        <div class="detail-section">
          <div class="source-tabs" id="sourceTabs">
            ${playSources.map((s, i) => `
              <div class="source-tab ${i === 0 ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">${escapeHtml(s.name)}</div>
            `).join('')}
          </div>
          <div class="play-list" id="detailPlayList"></div>
        </div>
      ` : '<div class="loading">暂无播放资源</div>'}
    `;

    if (playSources.length > 0) {
      renderDetailEpisodeList(0);
    }
  }

  function renderDetailEpisodeList(sourceIndex) {
    const playlist = $('detailPlayList');
    if (!playlist) return;

    const source = playSources[sourceIndex];
    if (!source) return;

    playlist.innerHTML = source.episodes.map((ep, eIndex) => `
      <div class="play-item" data-episode="${eIndex}" role="button" tabindex="0">${escapeHtml(ep.name)}</div>
    `).join('');
  }

  // ---- 播放页 ----

  function playEpisode(episodeIndex) {
    const source = playSources[currentSourceIndex];
    if (!source) return;

    const episode = source.episodes[episodeIndex];
    if (!episode) return;

    currentEpisodeIndex = episodeIndex;
    const videoName = currentVideo ? currentVideo.vod_name : '';
    const videoId = currentVideo ? currentVideo.vod_id : '';

    showPage('player');
    $('playerTitle').textContent = videoName + ' - ' + episode.name;

    if (dp) {
      dp.destroy();
      dp = null;
    }

    const isM3u8 = episode.url.includes('.m3u8');
    const dpOptions = {
      container: $('dplayer'),
      video: {
        url: episode.url,
        type: isM3u8 ? 'customHls' : 'auto',
        customType: isM3u8 ? {
          customHls: function (video, player) {
            const hls = new Hls();
            hls.loadSource(video.src);
            hls.attachMedia(video);
          }
        } : undefined
      },
      autoplay: true,
      lang: 'zh-cn'
    };

    dp = new DPlayer(dpOptions);

    // 播放进度记忆
    const progressKey = `progress:${videoId}:${currentSourceIndex}:${episodeIndex}`;
    dp.on('timeupdate', () => {
      if (dp && dp.video) {
        try {
          localStorage.setItem(progressKey, dp.video.currentTime);
        } catch (e) { /* 忽略存储错误 */ }
      }
    });

    dp.on('loadedmetadata', () => {
      try {
        const saved = localStorage.getItem(progressKey);
        if (saved && parseFloat(saved) > 5) {
          dp.seek(parseFloat(saved));
        }
      } catch (e) { /* 忽略 */ }
    });

    renderPlayerSourceTabs();
    renderPlayerEpisodeList();
    updatePlayerControls();
    updateBreadcrumb([
      { text: '首页', page: 'home' },
      { text: videoName, page: 'detail' },
      { text: episode.name }
    ]);
  }

  function renderPlayerSourceTabs() {
    const container = $('playerSourceTabs');
    if (!container) return;

    container.innerHTML = playSources.map((s, i) => `
      <div class="sidebar-tab ${i === currentSourceIndex ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">${escapeHtml(s.name)}</div>
    `).join('');
  }

  function renderPlayerEpisodeList() {
    const container = $('playerEpisodeList');
    if (!container) return;

    const source = playSources[currentSourceIndex];
    if (!source) return;

    container.innerHTML = source.episodes.map((ep, i) => `
      <div class="episode-item ${i === currentEpisodeIndex ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">
        <span class="ep-num">${i + 1}</span>
        <span class="ep-name">${escapeHtml(ep.name)}</span>
        ${i === currentEpisodeIndex ? '<span class="ep-playing">▶ 播放中</span>' : ''}
      </div>
    `).join('');

    const activeItem = container.querySelector('.episode-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updatePlayerControls() {
    const source = playSources[currentSourceIndex];
    if (!source) return;

    const prevBtn = $('prevEpBtn');
    const nextBtn = $('nextEpBtn');
    if (prevBtn) prevBtn.disabled = currentEpisodeIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentEpisodeIndex >= source.episodes.length - 1;
  }

  // ---- 事件绑定 ----

  function initEvents() {
    $('logoBtn').addEventListener('click', goHome);

    // 搜索防抖
    let searchTimer = null;
    $('searchBtn').addEventListener('click', () => {
      const keyword = $('searchInput').value.trim();
      currentKeyword = keyword;
      currentPage = 1;
      $('listTitle').textContent = keyword ? `搜索: ${keyword}` : '热门推荐';
      showPage('home');
      updateBreadcrumb([
        { text: '首页', page: 'home' },
        { text: keyword ? `搜索「${keyword}」` : '热门推荐' }
      ]);
      loadVideoList(1, keyword);
    });

    $('searchInput').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (!$('searchInput').value.trim()) return;
      }, 300);
    });

    $('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') $('searchBtn').click();
    });

    // 搜索框清除按钮
    const clearBtn = $('searchClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        $('searchInput').value = '';
        $('searchInput').focus();
        clearBtn.style.display = 'none';
      });
      $('searchInput').addEventListener('input', () => {
        clearBtn.style.display = $('searchInput').value.trim() ? 'block' : 'none';
      });
    }

    $('prevPage').addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadVideoList(currentPage, currentKeyword);
      }
    });

    $('nextPage').addEventListener('click', () => {
      if (currentPage < totalPage) {
        currentPage++;
        loadVideoList(currentPage, currentKeyword);
      }
    });

    // 分页跳转
    const jumpBtn = $('jumpBtn');
    const jumpInput = $('jumpPage');
    if (jumpBtn && jumpInput) {
      const doJump = () => {
        const page = parseInt(jumpInput.value);
        if (page >= 1 && page <= totalPage) {
          currentPage = page;
          loadVideoList(currentPage, currentKeyword);
          jumpInput.value = '';
        } else {
          showToast(`请输入 1-${totalPage} 之间的页码`);
        }
      };
      jumpBtn.addEventListener('click', doJump);
      jumpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doJump();
      });
    }

    // 返回列表（保留列表状态）
    $('backBtn').addEventListener('click', () => {
      if (dp) dp.pause();
      currentKeyword = savedListState.keyword;
      currentPage = savedListState.page;
      $('searchInput').value = savedListState.keyword;
      $('listTitle').textContent = savedListState.keyword ? `搜索: ${savedListState.keyword}` : '热门推荐';
      showPage('home');
      updateBreadcrumb([{ text: '首页', page: 'home' }]);
    });

    $('playerBackBtn').addEventListener('click', () => {
      if (dp) dp.pause();
      showPage('detail');
      if (currentVideo) {
        updateBreadcrumb([
          { text: '首页', page: 'home' },
          { text: currentVideo.vod_name }
        ]);
      }
    });

    // 上一集/下一集
    const prevEpBtn = $('prevEpBtn');
    const nextEpBtn = $('nextEpBtn');
    if (prevEpBtn) prevEpBtn.addEventListener('click', () => {
      if (currentEpisodeIndex > 0) playEpisode(currentEpisodeIndex - 1);
    });
    if (nextEpBtn) nextEpBtn.addEventListener('click', () => {
      const source = playSources[currentSourceIndex];
      if (source && currentEpisodeIndex < source.episodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
      }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (!$('playerPage').classList.contains('active')) return;
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' && currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        const source = playSources[currentSourceIndex];
        if (source && currentEpisodeIndex < source.episodes.length - 1) {
          playEpisode(currentEpisodeIndex + 1);
        }
      }
    });

    setupDelegatedEvents();
  }

  function init() {
    initEvents();
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
    loadVideoList(1);
  }

  init();
})();
