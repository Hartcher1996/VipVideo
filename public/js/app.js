const API_BASE = '/api/';
let currentPage = 1;
let currentKeyword = '';
let totalPage = 1;
let currentSource = 'all';
let sourceList = [];
let currentVideo = null;
let currentEpisode = null;
let dp = null;
let currentDetailSource = null;

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

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('请求失败');
  return response.json();
}

async function loadSources() {
  try {
    const data = await fetchJSON(API_BASE + 'sources');
    if (data.code === 1 && data.sources) {
      sourceList = data.sources;
      renderSourceTabs();
    }
  } catch (error) {
    console.error('加载数据源失败:', error);
  }
}

function renderSourceTabs() {
  const container = $('sourceTabs');
  const allTab = document.createElement('span');
  allTab.className = 'source-tab' + (currentSource === 'all' ? ' active' : '');
  allTab.textContent = '全部聚合';
  allTab.dataset.source = 'all';
  allTab.addEventListener('click', () => {
    currentSource = 'all';
    currentPage = 1;
    updateActiveSourceTab();
    loadVideoList(1, currentKeyword);
  });
  container.appendChild(allTab);

  sourceList.forEach(source => {
    const tab = document.createElement('span');
    tab.className = 'source-tab' + (currentSource === source.id ? ' active' : '');
    tab.innerHTML = source.name + '<span class="source-count" id="count-' + source.id + '"></span>';
    tab.dataset.source = source.id;
    tab.addEventListener('click', () => {
      currentSource = source.id;
      currentPage = 1;
      updateActiveSourceTab();
      loadVideoList(1, currentKeyword);
    });
    container.appendChild(tab);
  });
}

function updateActiveSourceTab() {
  document.querySelectorAll('.source-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.source === currentSource);
  });
}

function updateSourceStatus(sources) {
  const statusEl = $('sourceStatus');
  if (!sources || sources.length === 0) {
    statusEl.innerHTML = '';
    return;
  }

  const success = sources.filter(s => s.success).length;
  const total = sources.length;

  if (currentSource === 'all') {
    statusEl.innerHTML = `<span class="success">${success}/${total}</span> 源可用`;
  } else {
    const src = sources.find(s => s.id === currentSource);
    if (src) {
      statusEl.innerHTML = src.success
        ? `<span class="success">●</span> 正常`
        : `<span class="error">●</span> ${src.error || '异常'}`;
    }
  }

  sources.forEach(s => {
    const countEl = $('count-' + s.id);
    if (countEl) {
      countEl.textContent = s.success ? s.count : '×';
      countEl.style.color = s.success ? '' : '#f87171';
    }
  });
}

async function loadVideoList(page = 1, keyword = '') {
  const videoList = $('videoList');
  const sectionTitle = $('sectionTitle');
  videoList.innerHTML = '<div class="loading">加载中...</div>';

  if (keyword) {
    sectionTitle.textContent = '搜索：' + keyword;
  } else {
    sectionTitle.textContent = '热门推荐';
  }

  try {
    let url = API_BASE + 'videos?pg=' + page;
    if (keyword) url += '&wd=' + encodeURIComponent(keyword);
    if (currentSource !== 'all') url += '&source=' + currentSource;

    const data = await fetchJSON(url);

    if (data.code === 1 && data.list && data.list.length > 0) {
      totalPage = data.pagecount || 1;
      renderVideoList(data.list);
      updatePagination();
      updateSourceStatus(data.sources);
    } else {
      videoList.innerHTML = '<div class="loading">没有找到相关视频</div>';
      totalPage = 1;
      updatePagination();
      updateSourceStatus(data.sources);
    }
  } catch (error) {
    videoList.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
    console.error(error);
  }
}

function renderVideoList(videos) {
  const videoList = $('videoList');
  videoList.innerHTML = videos.map(video => {
    const sourceName = sourceList.find(s => s.id === video.sourceId)?.name || '';
    return `
    <div class="video-card" data-id="${video.id}" data-source="${video.sourceId}">
      ${sourceName ? '<span class="source-tag">' + sourceName + '</span>' : ''}
      <img class="cover" src="${video.pic || ''}" alt="${video.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E'">
      <div class="info">
        <div class="title">${video.name}</div>
        <div class="meta">
          <span class="type">${video.typeName || ''}</span>
          <span>${video.remarks || ''}</span>
        </div>
      </div>
    </div>
  `}).join('');

  videoList.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const source = card.dataset.source;
      loadVideoDetail(id, source);
    });
  });
}

function updatePagination() {
  $('pageInfo').textContent = `第 ${currentPage} / ${totalPage} 页`;
  $('prevPage').disabled = currentPage <= 1;
  $('nextPage').disabled = currentPage >= totalPage;
}

async function loadVideoDetail(id, sourceId) {
  showPage('detail');
  currentDetailSource = sourceId;
  const detailContent = $('detailContent');
  detailContent.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const data = await fetchJSON(API_BASE + 'videos/' + id + '?source=' + sourceId);

    if (data.code === 1 && data.video) {
      currentVideo = data.video;
      renderVideoDetail(data.video);
    } else {
      detailContent.innerHTML = '<div class="loading">未找到视频信息</div>';
    }
  } catch (error) {
    detailContent.innerHTML = '<div class="loading">加载失败，请稍后重试</div>';
    console.error(error);
  }
}

function renderVideoDetail(video) {
  const detailContent = $('detailContent');
  const playSources = video.playSources || [];

  detailContent.innerHTML = `
    <div class="detail-header">
      <div class="detail-cover">
        <img src="${video.pic || ''}" alt="${video.name}" onerror="this.style.display='none'">
      </div>
      <div class="detail-info">
        <h1>${video.name}</h1>
        <div class="tags">
          ${video.typeName ? '<span class="tag highlight">' + video.typeName + '</span>' : ''}
          ${video.year ? '<span class="tag">' + video.year + '</span>' : ''}
          ${video.area ? '<span class="tag">' + video.area + '</span>' : ''}
          ${video.remarks ? '<span class="tag">' + video.remarks + '</span>' : ''}
        </div>
        ${video.actor ? '<p style="margin-bottom:10px;color:#aaa;font-size:14px;"><strong style="color:#ccc;">演员：</strong>' + video.actor + '</p>' : ''}
        ${video.director ? '<p style="margin-bottom:10px;color:#aaa;font-size:14px;"><strong style="color:#ccc;">导演：</strong>' + video.director + '</p>' : ''}
        <p class="desc">${video.content || '暂无简介'}</p>
      </div>
    </div>
    ${playSources.length > 0 ? `
      <div class="detail-section">
        <h3>播放列表</h3>
        <div class="detail-source-tabs" id="detailSourceTabs">
          ${playSources.map((source, index) => `
            <div class="detail-source-tab ${index === 0 ? 'active' : ''}" data-source-index="${index}">
              ${source.name} (${source.episodes.length})
            </div>
          `).join('')}
        </div>
        <div id="playListContainer"></div>
      </div>
    ` : '<div class="loading">暂无播放资源</div>'}
  `;

  if (playSources.length > 0) {
    renderPlayList(playSources, 0);

    detailContent.querySelectorAll('.detail-source-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const index = parseInt(tab.dataset.sourceIndex);
        detailContent.querySelectorAll('.detail-source-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderPlayList(playSources, index);
      });
    });
  }
}

function renderPlayList(playSources, sourceIndex) {
  const container = $('playListContainer');
  if (!container) return;

  const source = playSources[sourceIndex];
  container.innerHTML = `
    <div class="play-list">
      ${source.episodes.map((ep, eIndex) => `
        <div class="play-item" data-source-index="${sourceIndex}" data-episode-index="${eIndex}">${ep.name}</div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.play-item').forEach(item => {
    item.addEventListener('click', () => {
      const sIndex = parseInt(item.dataset.sourceIndex);
      const eIndex = parseInt(item.dataset.episodeIndex);
      const episode = playSources[sIndex].episodes[eIndex];
      playVideo(currentVideo.name, episode.name, episode.url);
    });
  });
}

function playVideo(videoName, episodeName, url) {
  showPage('player');
  $('playerTitle').textContent = videoName + ' - ' + episodeName;
  currentEpisode = { videoName, episodeName, url };

  if (dp) {
    dp.destroy();
  }

  dp = new DPlayer({
    container: $('dplayer'),
    video: {
      url: url,
      type: 'auto'
    },
    autoplay: true,
    lang: 'zh-cn'
  });
}

function initEvents() {
  $('searchBtn').addEventListener('click', () => {
    const keyword = $('searchInput').value.trim();
    currentKeyword = keyword;
    currentPage = 1;
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
  });

  $('playerBackBtn').addEventListener('click', () => {
    if (dp) {
      dp.pause();
    }
    showPage('detail');
  });
}

async function init() {
  initEvents();
  await loadSources();
  loadVideoList(1);
}

init();
