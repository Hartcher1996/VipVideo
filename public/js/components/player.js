(function () {
  'use strict';

  let dp = null;
  let currentSourceIndex = 0;
  let currentEpisodeIndex = 0;
  let playSources = [];
  let currentVideo = null;
  let collapseBound = false;
  // 记住上一次应用默认宽屏时的视频 ID，避免切集时覆盖用户的手动切换
  let lastAppliedWideVideoId = null;

  // resize 定时器（节流）
  let syncSidebarTimer = null;
  // error 误报检测定时器（HLS 流非致命错误会频繁触发 error 事件，但视频实际能正常播放）
  let errorCheckTimer = null;

  /**
   * 将右侧 sidebar 的高度锁定为左侧 player-main 的实际高度
   * —— sidebar 有了明确 height 后，内部 flex:1 分配链才能正常工作，
   *    剧集列表才能填满剩余空间并在溢出时内部滚动（不会塌缩为0看不见）。
   * 只在桌面端（>1024px）生效，平板/手机端由媒体查询恢复自然高度。
   */
  function syncSidebarHeight() {
    const sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;
    // 平板/手机端：清除 inline 高度，交给媒体查询（height:auto）
    if (window.innerWidth <= 1024) {
      sidebar.style.height = '';
      sidebar.style.maxHeight = '';
      return;
    }
    const main = document.querySelector('.player-main');
    if (!main) return;
    const mainH = main.offsetHeight;
    if (!mainH || mainH < 200) return; // 高度还没稳定，稍后重试
    // 用 height（不是 maxHeight）：让 sidebar 有明确高度，
    // 内部 .sidebar-section:last-of-type 的 flex:1 才能分配到空间，
    // .episode-list-wrapper 的 height:100% 才有参考值，剧集列表才可见可滚。
    sidebar.style.height = mainH + 'px';
    sidebar.style.maxHeight = mainH + 'px';
  }

  function queueSyncSidebar(delay = 60) {
    if (syncSidebarTimer) clearTimeout(syncSidebarTimer);
    syncSidebarTimer = setTimeout(syncSidebarHeight, delay);
  }

  function updateEpisodeCount() {
    const label = document.getElementById('episodeCountLabel');
    const source = playSources[currentSourceIndex];
    if (label && source) {
      const n = source.episodes?.length || 0;
      label.textContent = n ? `(${n}集)` : '';
    }
  }

  function bindCollapseToggle() {
    if (collapseBound) return;
    const title = document.getElementById('episodeCollapse');
    const wrap = document.querySelector('#playerSidebar .episode-list-wrapper');
    if (!title || !wrap) return;
    collapseBound = true;
    const toggle = (e) => {
      // 只有在手机端才有折叠效果；桌面端点击无效
      if (window.innerWidth > 768) return;
      if (e) e.stopPropagation();
      const collapsed = title.classList.toggle('collapsed');
      wrap.classList.toggle('hidden', collapsed);
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    // 初始化：手机端首次进入播放页，默认折叠
    if (window.innerWidth <= 768) {
      title.classList.add('collapsed');
      wrap.classList.add('hidden');
    } else {
      title.classList.remove('collapsed');
      wrap.classList.remove('hidden');
    }
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        title.classList.remove('collapsed');
        wrap.classList.remove('hidden');
      }
      // resize 时重新同步 sidebar 高度（窗口变化 → player-main 尺寸变化 → sidebar上限要跟着变）
      queueSyncSidebar(80);
    });
  }

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

    // 仅显示视频名，不再追加剧集名
    document.getElementById('playerTitle').textContent = videoName;

    if (dp) {
      dp.destroy();
      dp = null;
    }
    // 清除上一集残留的 error 检测定时器，避免切集时误报
    if (errorCheckTimer) { clearTimeout(errorCheckTimer); errorCheckTimer = null; }

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

    // DPlayer/hls.js 的 error 事件对 HLS 流过于敏感：
    // 个别 ts 分片加载失败自动重试、码率自适应切换、瞬时网络抖动等非致命错误都会触发，
    // 但视频实际能正常播放。这里延迟 3 秒检查 currentTime 是否还在变化，
    // 只有视频真的卡住不动时才提示用户切源，避免误报打扰。
    if (errorCheckTimer) { clearTimeout(errorCheckTimer); errorCheckTimer = null; }
    dp.on('error', () => {
      if (errorCheckTimer) clearTimeout(errorCheckTimer);
      const videoEl = dp && dp.video;
      const t0 = videoEl ? videoEl.currentTime : 0;
      errorCheckTimer = setTimeout(() => {
        errorCheckTimer = null;
        // 播放器已销毁（切集/切源/退出播放页），忽略
        if (!dp || !dp.video) return;
        const t1 = dp.video.currentTime;
        // 3 秒内 currentTime 变化 < 0.5 秒 → 视频真的卡住了
        if (Math.abs(t1 - t0) < 0.5) {
          VideoApp.showToast('视频加载失败，请尝试切换播放源');
        }
      }, 3000);
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
      // 视频尺寸稳定后，再次同步 sidebar 高度（播放器尺寸可能变化）
      queueSyncSidebar(50);
    });

    renderPlayerSourceTabs();
    renderPlayerEpisodeList();
    updateEpisodeCount();
    bindCollapseToggle();
    // DOM 渲染完成后，立刻同步一次 sidebar 高度（对齐 player-main）
    queueSyncSidebar(20);
    // 再多补几次兜底，避免 DPlayer 内部二次布局导致高度继续变化
    queueSyncSidebar(200);
    queueSyncSidebar(600);

    // 进入一个新剧集时，根据站点配置 defaultWideScreen 自动设置默认宽屏
    // 同一剧集内切换集数/切换源时，不覆盖用户的手动选择（videoId 已在上方声明）
    if (videoId && videoId !== lastAppliedWideVideoId) {
      lastAppliedWideVideoId = videoId;
      try {
        if (typeof VideoApp !== 'undefined' && VideoApp.getSiteConfig && VideoApp.setWideMode) {
          const cfg = VideoApp.getSiteConfig();
          if (cfg && cfg.defaultWideScreen) {
            // 延迟一点确保 playerCombined 已在 DOM 中
            setTimeout(() => VideoApp.setWideMode(true), 0);
          }
        }
      } catch (e) {}
    }

    // 方案A：切集/切源后同步更新播放页面包屑
    try {
      const src = playSources[currentSourceIndex];
      const epName = src && src.episodes && src.episodes[currentEpisodeIndex]
        ? src.episodes[currentEpisodeIndex].name
        : '';
      if (typeof VideoApp !== 'undefined' && VideoApp.buildPlayerCrumbs && VideoApp.updateBreadcrumb) {
        VideoApp.updateBreadcrumb(
          VideoApp.buildPlayerCrumbs(
            video.vod_name,
            src ? src.source : '',
            epName,
            currentEpisodeIndex
          )
        );
      }
    } catch (e) {}
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
    // 退出播放页时清除残留的 error 检测定时器
    if (errorCheckTimer) { clearTimeout(errorCheckTimer); errorCheckTimer = null; }
  }

  window.PlayerComponent = {
    playEpisode,
    prevEpisode,
    nextEpisode,
    pause,
    destroy,
    syncSidebarHeight
  };
})();
