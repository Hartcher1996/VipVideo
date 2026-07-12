const API_BASE = '/api';
let currentPage = 1;
let currentKeyword = '';
let totalPage = 1;
let currentVideo = null;
let playSources = [];
let currentSourceIndex = 0;
let currentEpisodeIndex = 0;
let dp = null;

const $ = (id) => document.getElementById(id);

const pages = {
  home: $('homePage'),
  detail: $('detailPage'),
  player: $('playerPage')
};

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
      return `<span class="breadcrumb-item" data-page="${item.page}">${item.text}</span><span class="breadcrumb-sep">›</span>`;
    }
    return `<span class="breadcrumb-item${isLast ? ' active' : ''}">${item.text}</span>`;
  }).join('');

  breadcrumb.querySelectorAll('.breadcrumb-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page === 'home') {
        goHome();
      }
    });
  });
}

function goHome() {
  currentKeyword = '';
  currentPage = 1;
  $('searchInput').value = '';
  $('listTitle').textContent = '热门推荐';
  showPage('home');
  updateBreadcrumb([{ text: '首页', page: 'home' }]);
  loadVideoList(1);
}

async function fetchAPI(endpoint, params) {
  const query = new URLSearchParams(params).toString();
  const url = API_BASE + '/' + endpoint + (query ? '?' + query : '');
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    console.error('请求失败:', url, '状态:', response.status, '响应:', text.substring(0, 200));
    throw new Error('请求失败: ' + response.status);
  }
  return response.json();
}

async function loadVideoList(page = 1, keyword = '') {
  const videoList = $('videoList');
  videoList.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const params = { pg: page };
    if (keyword) {
      params.wd = keyword;
    }

    const data = await fetchAPI('list', params);

    if (data.code === 1 && data.list && data.list.length > 0) {
      totalPage = data.pagecount || 1;
      renderVideoList(data.list);
      updatePagination();
    } else {
      videoList.innerHTML = '<div class="loading">没有找到相关视频</div>';
      totalPage = 1;
      updatePagination();
    }
  } catch (error) {
    videoList.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
    console.error(error);
  }
}

function renderVideoList(videos) {
  const videoList = $('videoList');
  videoList.innerHTML = videos.map(video => `
    <div class="video-card" data-id="${video.vod_id}">
      <img class="cover" src="${video.vod_pic || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E'}" alt="${video.vod_name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E'">
      <div class="info">
        <div class="title">${video.vod_name}</div>
        <div class="meta">
          <span class="type">${video.type_name || ''}</span>
          <span>${video.vod_remarks || ''}</span>
        </div>
      </div>
    </div>
  `).join('');

  videoList.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      loadVideoDetail(id);
    });
  });
}

function updatePagination() {
  $('pageInfo').textContent = `第 ${currentPage} / ${totalPage} 页`;
  $('prevPage').disabled = currentPage <= 1;
  $('nextPage').disabled = currentPage >= totalPage;
}

async function loadVideoDetail(id) {
  showPage('detail');
  const detailContent = $('detailContent');
  detailContent.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const data = await fetchAPI('detail', { ids: id });

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
    detailContent.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
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
          return {
            name: parts[0] || '',
            url: parts[1] || ''
          };
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
        <img src="${video.vod_pic || ''}" alt="${video.vod_name}" onerror="this.style.display='none'">
      </div>
      <div class="detail-info">
        <h1>${video.vod_name}</h1>
        <div class="tags">
          ${video.type_name ? '<span class="tag highlight">' + video.type_name + '</span>' : ''}
          ${video.vod_year ? '<span class="tag">' + video.vod_year + '</span>' : ''}
          ${video.vod_area ? '<span class="tag">' + video.vod_area + '</span>' : ''}
          ${video.vod_remarks ? '<span class="tag">' + video.vod_remarks + '</span>' : ''}
        </div>
        ${video.vod_actor ? '<p style="margin-bottom:10px;color:#aaa;font-size:14px;"><strong style="color:#ccc;">演员：</strong>' + video.vod_actor + '</p>' : ''}
        ${video.vod_director ? '<p style="margin-bottom:10px;color:#aaa;font-size:14px;"><strong style="color:#ccc;">导演：</strong>' + video.vod_director + '</p>' : ''}
        <p class="desc">${video.vod_content || video.vod_blurb || '暂无简介'}</p>
      </div>
    </div>
    ${playSources.length > 0 ? `
      <div class="detail-section">
        <div class="source-tabs" id="sourceTabs">
          ${playSources.map((s, i) => `
            <div class="source-tab ${i === 0 ? 'active' : ''}" data-index="${i}">${s.name}</div>
          `).join('')}
        </div>
        <div class="play-list" id="detailPlayList"></div>
      </div>
    ` : '<div class="loading">暂无播放资源</div>'}
  `;

  if (playSources.length > 0) {
    renderDetailEpisodeList(0);

    detailContent.querySelectorAll('.source-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const index = parseInt(tab.dataset.index);
        currentSourceIndex = index;
        currentEpisodeIndex = 0;
        detailContent.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderDetailEpisodeList(index);
      });
    });
  }
}

function renderDetailEpisodeList(sourceIndex) {
  const playlist = $('detailPlayList');
  if (!playlist) return;

  const source = playSources[sourceIndex];
  if (!source) return;

  playlist.innerHTML = source.episodes.map((ep, eIndex) => `
    <div class="play-item" data-episode="${eIndex}">${ep.name}</div>
  `).join('');

  playlist.querySelectorAll('.play-item').forEach(item => {
    item.addEventListener('click', () => {
      const eIndex = parseInt(item.dataset.episode);
      playEpisode(eIndex);
    });
  });
}

function playEpisode(episodeIndex) {
  const source = playSources[currentSourceIndex];
  if (!source) return;

  const episode = source.episodes[episodeIndex];
  if (!episode) return;

  currentEpisodeIndex = episodeIndex;
  const videoName = currentVideo ? currentVideo.vod_name : '';

  showPage('player');
  $('playerTitle').textContent = videoName + ' - ' + episode.name;

  if (dp) {
    dp.destroy();
    dp = null;
  }

  dp = new DPlayer({
    container: $('dplayer'),
    video: {
      url: episode.url,
      type: 'auto'
    },
    autoplay: true,
    lang: 'zh-cn'
  });

  renderPlayerSourceTabs();
  renderPlayerEpisodeList();
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
    <div class="sidebar-tab ${i === currentSourceIndex ? 'active' : ''}" data-index="${i}">${s.name}</div>
  `).join('');

  container.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const index = parseInt(tab.dataset.index);
      if (index === currentSourceIndex) return;
      currentSourceIndex = index;
      currentEpisodeIndex = 0;
      renderPlayerSourceTabs();
      renderPlayerEpisodeList();
      playEpisode(0);
    });
  });
}

function renderPlayerEpisodeList() {
  const container = $('playerEpisodeList');
  if (!container) return;

  const source = playSources[currentSourceIndex];
  if (!source) return;

  container.innerHTML = source.episodes.map((ep, i) => `
    <div class="episode-item ${i === currentEpisodeIndex ? 'active' : ''}" data-index="${i}">
      <span class="ep-num">${i + 1}</span>
      <span class="ep-name">${ep.name}</span>
      ${i === currentEpisodeIndex ? '<span class="ep-playing">▶ 播放中</span>' : ''}
    </div>
  `).join('');

  container.querySelectorAll('.episode-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      if (index === currentEpisodeIndex) return;
      playEpisode(index);
    });
  });

  const activeItem = container.querySelector('.episode-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function initEvents() {
  $('logoBtn').addEventListener('click', goHome);

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

  $('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      $('searchBtn').click();
    }
  });

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

  $('backBtn').addEventListener('click', () => {
    showPage('home');
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
  });

  $('playerBackBtn').addEventListener('click', () => {
    if (dp) {
      dp.pause();
    }
    showPage('detail');
    if (currentVideo) {
      updateBreadcrumb([
        { text: '首页', page: 'home' },
        { text: currentVideo.vod_name }
      ]);
    }
  });
}

function init() {
  initEvents();
  updateBreadcrumb([{ text: '首页', page: 'home' }]);
  loadVideoList(1);
}

init();
