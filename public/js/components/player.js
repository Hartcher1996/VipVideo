(function () {
  'use strict';

  let dp = null;
  let currentSourceIndex = 0;
  let currentEpisodeIndex = 0;
  let playSources = [];
  let currentVideo = null;

  function playEpisode(video, sources, sourceIndex, episodeIndex) {
    currentVideo = video;
    playSources = sources;
    currentSourceIndex = sourceIndex;
    currentEpisodeIndex = episodeIndex;

    const source = playSources[currentSourceIndex];
    if (!source) return;

    const episode = source.episodes[episodeIndex];
    if (!episode) return;

    const videoName = video.vod_name || '';
    const videoId = video.vod_id || '';

    document.getElementById('playerTitle').textContent = videoName + ' - ' + episode.name;

    if (dp) {
      dp.destroy();
      dp = null;
    }

    const isM3u8 = episode.url.includes('.m3u8');
    const dpOptions = {
      container: document.getElementById('dplayer'),
      video: {
        url: episode.url,
        type: isM3u8 ? 'customHls' : 'auto',
        customType: isM3u8 ? {
          customHls: function (videoEl, player) {
            const hls = new Hls();
            hls.loadSource(videoEl.src);
            hls.attachMedia(videoEl);
          }
        } : undefined
      },
      autoplay: true,
      lang: 'zh-cn'
    };

    dp = new DPlayer(dpOptions);

    dp.on('error', () => {
      VideoApp.showToast('视频加载失败，请尝试切换播放源');
    });

    const progressKey = `progress:${videoId}:${currentSourceIndex}:${episodeIndex}`;
    dp.on('timeupdate', () => {
      if (dp && dp.video) {
        try {
          localStorage.setItem(progressKey, dp.video.currentTime);
        } catch (e) {}
      }
    });

    dp.on('loadedmetadata', () => {
      try {
        const saved = localStorage.getItem(progressKey);
        if (saved && parseFloat(saved) > 5) {
          dp.seek(parseFloat(saved));
        }
      } catch (e) {}
    });

    renderPlayerSourceTabs();
    renderPlayerEpisodeList();
    updatePlayerControls();
  }

  function renderPlayerSourceTabs() {
    const container = document.getElementById('playerSourceTabs');
    if (!container) return;

    const esc = VideoAPI.escapeHtml;
    container.innerHTML = playSources.map((s, i) => `
      <div class="sidebar-tab ${i === currentSourceIndex ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">${esc(s.name)}</div>
    `).join('');

    container.addEventListener('click', (e) => {
      const tab = e.target.closest('.sidebar-tab');
      if (tab) {
        const index = parseInt(tab.dataset.index);
        if (index === currentSourceIndex) return;
        currentSourceIndex = index;
        currentEpisodeIndex = 0;
        renderPlayerSourceTabs();
        renderPlayerEpisodeList();
        playEpisode(currentVideo, playSources, currentSourceIndex, 0);
      }
    });
  }

  function renderPlayerEpisodeList() {
    const container = document.getElementById('playerEpisodeList');
    if (!container) return;

    const source = playSources[currentSourceIndex];
    if (!source) return;

    const esc = VideoAPI.escapeHtml;
    container.innerHTML = source.episodes.map((ep, i) => `
      <div class="episode-item ${i === currentEpisodeIndex ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">
        <span class="ep-num">${i + 1}</span>
        <span class="ep-name">${esc(ep.name)}</span>
        ${i === currentEpisodeIndex ? '<span class="ep-playing">▶ 播放中</span>' : ''}
      </div>
    `).join('');

    const activeItem = container.querySelector('.episode-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    container.addEventListener('click', (e) => {
      const item = e.target.closest('.episode-item');
      if (item) {
        const index = parseInt(item.dataset.index);
        if (index === currentEpisodeIndex) return;
        playEpisode(currentVideo, playSources, currentSourceIndex, index);
      }
    });
  }

  function updatePlayerControls() {
    const source = playSources[currentSourceIndex];
    if (!source) return;

    const prevBtn = document.getElementById('prevEpBtn');
    const nextBtn = document.getElementById('nextEpBtn');
    if (prevBtn) prevBtn.disabled = currentEpisodeIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentEpisodeIndex >= source.episodes.length - 1;
  }

  function prevEpisode() {
    if (currentEpisodeIndex > 0) {
      playEpisode(currentVideo, playSources, currentSourceIndex, currentEpisodeIndex - 1);
    }
  }

  function nextEpisode() {
    const source = playSources[currentSourceIndex];
    if (source && currentEpisodeIndex < source.episodes.length - 1) {
      playEpisode(currentVideo, playSources, currentSourceIndex, currentEpisodeIndex + 1);
    }
  }

  function pause() {
    if (dp) dp.pause();
  }

  function destroy() {
    if (dp) {
      dp.destroy();
      dp = null;
    }
  }

  window.PlayerComponent = {
    playEpisode,
    prevEpisode,
    nextEpisode,
    pause,
    destroy
  };
})();
