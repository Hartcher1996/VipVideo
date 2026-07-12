const API_BASE = '/api';
let currentPage = 1;
let currentKeyword = '';
let totalPage = 1;
let currentVideo = null;
let currentEpisode = null;
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
      renderVideoDetail(currentVideo);
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

  const playFrom = video.vod_play_from || '';
  const playUrl = video.vod_play_url || '';

  const playSources = [];
  if (playFrom && playUrl) {
    const sources = playFrom.split('$$$');
    const urls = playUrl.split('$$$');

    sources.forEach((source, index) => {
      if (urls[index]) {
        const episodes = urls[index].split('#').map(item => {
          const parts = item.split('$');
          return {
            name: parts[0] || '',
            url: parts[1] || ''
          };
        }).filter(ep => ep.name && ep.url);

        if (episodes.length > 0) {
          playSources.push({
            name: source || '播放源' + (index + 1),
            episodes: episodes
          });
        }
      }
    });
  }

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
    ${playSources.length > 0 ? playSources.map((source, sIndex) => `
      <div class="detail-section">
        <h3>${source.name}</h3>
        <div class="play-list">
          ${source.episodes.map((ep, eIndex) => `
            <div class="play-item" data-source="${sIndex}" data-episode="${eIndex}">${ep.name}</div>
          `).join('')}
        </div>
      </div>
    `).join('') : '<div class="loading">暂无播放资源</div>'}
  `;

  detailContent.querySelectorAll('.play-item').forEach(item => {
    item.addEventListener('click', () => {
      const sIndex = parseInt(item.dataset.source);
      const eIndex = parseInt(item.dataset.episode);
      const episode = playSources[sIndex].episodes[eIndex];
      playVideo(video.vod_name, episode.name, episode.url);
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

function init() {
  initEvents();
  loadVideoList(1);
}

init();
