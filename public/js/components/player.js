(function () {
  'use strict';

  let art = null;
  let iframeEl = null;
  let currentSourceIndex = 0;
  let currentEpisodeIndex = 0;
  let playSources = [];
  let currentVideo = null;
  let loadingTimer = null;
  let hlsInstances = [];

  const SHORT_NAMES = {
    zuidapi: 'ZD', lziapi: 'LZ', ukuapi: 'UK', bfzyapi: 'BF', jinyingzy: 'JY',
    zuidam3u8: 'ZD', lzim3u8: 'LZ', ukum3u8: 'UK', bfm3u8: 'BF', jym3u8: 'JY'
  };

  function shortName(source) {
    // 优先中文源名：去「资源/线路/云播」后缀取前 2 字，如 最大资源 → 最大
    const cn = source.sourceName || '';
    if (cn) {
      const short = cn.replace(/资源|线路|云播/g, '').slice(0, 2);
      if (short) return short;
    }
    const n = source.lineName || '';
    const id = source.sourceId || '';
    if (SHORT_NAMES[n]) return SHORT_NAMES[n];
    if (SHORT_NAMES[id]) return SHORT_NAMES[id];
    const raw = n || id;
    return (raw || '').replace(/资源|线路|云播/g, '').slice(0, 2) || '线路';
  }

  function fullName(source) {
    // 优先完整中文源名（如 最大资源）；同源多条线路时附加「线路N」区分
    const cn = source.sourceName || '';
    if (cn) {
      const sameSource = playSources.filter(s => s.sourceName === cn);
      if (sameSource.length > 1) {
        const idx = sameSource.indexOf(source);
        return `${cn}·线路${idx + 1}`;
      }
      return cn;
    }
    return source.lineName || source.sourceId || '';
  }

  function showLoading(seconds) {
    const el = document.getElementById('playerLoading');
    if (!el) return;
    el.classList.remove('hidden');
    armFallback(seconds || 12);
  }

  function hideLoading() {
    const el = document.getElementById('playerLoading');
    if (el) el.classList.add('hidden');
    disarmFallback();
  }

  function armFallback(secs) {
    disarmFallback();
    loadingTimer = setTimeout(() => {
      if (!document.getElementById('playerLoading')?.classList.contains('hidden')) {
        hideLoading();
        VideoApp && VideoApp.showToast && VideoApp.showToast('加载超时，请尝试切换线路');
      }
    }, Math.max(4, secs) * 1000);
  }

  function disarmFallback() {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
  }

  function destroyPlayer() {
    if (art) { try { art.destroy(); } catch (e) {} art = null; }
    if (iframeEl) { iframeEl.remove(); iframeEl = null; }
    hlsInstances.forEach(h => { try { h.destroy(); } catch(e) {} });
    hlsInstances = [];
    const c = document.getElementById('dplayer');
    if (c) c.innerHTML = '';
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.p-tab');
    const panes = document.querySelectorAll('.p-pane');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        panes.forEach(p => p.classList.toggle('active', p.dataset.pane === target));
      });
    });
  }

  function initBackButton() {
    const btn = document.getElementById('pBackBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (window.VideoApp && VideoApp.goBackFromPlayer) {
          VideoApp.goBackFromPlayer();
        } else if (window.VideoApp && VideoApp.pause) {
          VideoApp.pause();
          window.history.back();
        }
      });
    }
  }

  // 右侧栏收起按钮：鼠标在播放区移动时出现，静止一段时间或移出后隐藏
  function initSideToggle() {
    const player = document.querySelector('.p-player');
    const main = document.querySelector('.p-main');
    const btn = document.getElementById('pSideToggle');
    if (!player || !main || !btn) return;

    let hideTimer = null;

    function hideToggle() {
      player.classList.remove('ui-active');
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    function showToggle() {
      player.classList.add('ui-active');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hideToggle, 2400);
    }

    player.addEventListener('mouseenter', showToggle);
    player.addEventListener('mousemove', showToggle);
    player.addEventListener('mouseleave', hideToggle);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collapsed = main.classList.toggle('side-collapsed');
      const label = collapsed ? '显示右侧栏' : '隐藏右侧栏';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      showToggle();
    });
  }

  function renderSidebar() {
    const v = currentVideo;
    if (!v) return;

    // 顶栏正在播放标题（V3：p-now-title，id=playerTitle）
    const $pt = document.getElementById('playerTitle');
    if ($pt) $pt.textContent = v.vod_name || '';

    renderEpisodes();
    renderSourceList();

    const $ce = document.getElementById('tabCountEp');
    if ($ce) {
      const src = playSources[currentSourceIndex];
      $ce.textContent = src && src.episodes ? String(src.episodes.length) : '';
    }

    const $sh = document.getElementById('pSourceHint');
    if ($sh && playSources.length) $sh.textContent = `共 ${playSources.length} 条线路`;
  }

  function renderEpisodes() {
    const src = playSources[currentSourceIndex];
    const container = document.getElementById('playerEpisodeList');
    const $cur = document.getElementById('pCurrentEp');
    if (!src || !container) return;
    const esc = VideoAPI.escapeHtml;
    container.innerHTML = src.episodes.map((ep, i) => `
      <div class="p-ep-item ${i === currentEpisodeIndex ? 'active' : ''}" data-idx="${i}">
        ${esc(ep.name)}
      </div>
    `).join('');
    container.onclick = (e) => {
      const el = e.target.closest('.p-ep-item');
      if (!el) return;
      const idx = parseInt(el.dataset.idx);
      if (idx !== currentEpisodeIndex) {
        playEpisode(currentVideo, playSources, currentSourceIndex, idx);
      }
    };
    if ($cur) $cur.textContent = `当前：第${currentEpisodeIndex + 1}集`;
  }

  function renderSourceList() {
    const container = document.getElementById('playerSourceTabs');
    if (!container) return;
    const esc = VideoAPI.escapeHtml;
    container.innerHTML = playSources.map((s, i) => {
      const active = i === currentSourceIndex ? 'active' : '';
      const badge = s.urlType === 'm3u8' ? 'HD' : s.urlType === 'shareDirect' ? '云播' : s.urlType === 'share' ? '解析' : '代理';
      return `
        <div class="p-src-item ${active}" data-src="${i}">
          <div class="psi-left">
            <span class="psi-short">${esc(shortName(s))}</span>
            <span class="psi-name">${esc(fullName(s) || '线路' + (i + 1))}</span>
          </div>
          <div class="psi-right">
            <span class="psi-badge">${badge}</span>
            <span class="psi-count">${s.episodes?.length || 0}集</span>
          </div>
        </div>
      `;
    }).join('');
    container.onclick = (e) => {
      const el = e.target.closest('.p-src-item');
      if (!el) return;
      const idx = parseInt(el.dataset.src);
      if (idx !== currentSourceIndex) {
        playEpisode(currentVideo, playSources, idx, 0);
      }
    };
  }

  function playM3u8Direct(url, videoId) {
    const container = document.getElementById('dplayer');
    container.innerHTML = '';

    if (art) { try { art.destroy(); } catch(e) {} art = null; }
    hlsInstances.forEach(h => { try { h.destroy(); } catch(e) {} });
    hlsInstances = [];

    const video = document.createElement('video');
    video.id = 'artplayer-video';
    video.style.cssText = 'width:100%;height:100%;display:block;background:#000;';
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    container.appendChild(video);

    const progressKey = `progress:${videoId}:${currentSourceIndex}:${currentEpisodeIndex}`;

    const onLoadedMeta = () => {
      try {
        const saved = parseFloat(localStorage.getItem(progressKey) || '');
        if (!isNaN(saved) && saved > 5) video.currentTime = saved;
      } catch (e) {}
      hideLoading();
      video.play().catch(() => {});
    };

    const onTimeUpdate = () => {
      try { localStorage.setItem(progressKey, String(video.currentTime)); } catch (e) {}
    };

    const onError = () => {
      hideLoading();
      if (window.VideoApp && VideoApp.showToast) {
        VideoApp.showToast('视频加载失败，尝试切换线路');
      }
    };

    const onCanPlay = () => { hideLoading(); };

    video.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onError, { once: true });
    video.addEventListener('canplay', onCanPlay, { once: true });

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        lowLatencyMode: true,
        enableWorker: true,
      });
      hlsInstances.push(hls);
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      hideLoading();
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#fff;">当前浏览器不支持 HLS 播放</div>';
    }
  }

  function playWithArtPlayer(url, videoId) {
    const container = document.getElementById('dplayer');
    container.innerHTML = '';

    if (art) { try { art.destroy(); } catch(e) {} art = null; }

    const cfg = {
      container: container,
      url: url,
      autoplay: true,
      theme: '#4c9eff',
      volume: 0.7,
      loop: false,
      playbackRate: true,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      lang: 'zh-cn',
      moreVideoAttr: { crossOrigin: 'anonymous' },
    };

    const progressKey = `progress:${videoId}:${currentSourceIndex}:${currentEpisodeIndex}`;

    try {
      art = new Artplayer(cfg);

      art.on('video:timeupdate', () => {
        if (art && art.video) {
          try { localStorage.setItem(progressKey, String(art.video.currentTime)); } catch (e) {}
        }
      });
      art.on('video:loadedmetadata', () => {
        try {
          const saved = parseFloat(localStorage.getItem(progressKey) || '');
          if (!isNaN(saved) && saved > 5 && art && art.video) art.video.currentTime = saved;
        } catch (e) {}
        hideLoading();
      });
      art.on('video:canplay', hideLoading);
      art.on('video:playing', hideLoading);
      art.on('video:error', () => {
        hideLoading();
      });

      armFallback(15);
    } catch (e) {
      console.error('[ArtPlayer] init fail:', e);
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#fff;">播放器初始化失败，尝试备用方案...</div>';
      setTimeout(() => {
        if (container.innerHTML.includes('初始化失败')) {
          playM3u8Direct(url, videoId);
        }
      }, 800);
    }
  }

  function playWithIframe(url) {
    const container = document.getElementById('dplayer');
    container.innerHTML = '';

    if (art) { try { art.destroy(); } catch(e) {} art = null; }

    iframeEl = document.createElement('iframe');
    iframeEl.src = '/api/parse?url=' + encodeURIComponent(url);
    iframeEl.setAttribute('allowfullscreen', 'true');
    iframeEl.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    iframeEl.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#000;';
    iframeEl.addEventListener('load', () => hideLoading(), { once: true });
    container.appendChild(iframeEl);
    armFallback(25);
  }

  function playDirectIframe(url) {
    const container = document.getElementById('dplayer');
    container.innerHTML = '';

    if (art) { try { art.destroy(); } catch(e) {} art = null; }

    iframeEl = document.createElement('iframe');
    iframeEl.src = url;
    iframeEl.setAttribute('allowfullscreen', 'true');
    iframeEl.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    iframeEl.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#000;';
    iframeEl.addEventListener('load', () => hideLoading(), { once: true });
    container.appendChild(iframeEl);
    armFallback(20);
  }

  function classifyClient(url) {
    if (!url) return 'unknown';
    if (/\.m3u8(\?|$|#)/i.test(url)) return 'm3u8';
    if (/\/share\/[a-zA-Z0-9]{4,}/i.test(url)) {
      // U酷云播：站点自带播放器，直接嵌入
      try {
        const host = new URL(url).hostname;
        if (/ukzy|ukubf/i.test(host)) return 'shareDirect';
      } catch (e) {}
      return 'share';
    }
    if (/\/play\/[a-zA-Z0-9_-]{4,}/i.test(url)) {
      // 金鹰云播：站点自带播放器，直接嵌入
      try {
        const host = new URL(url).hostname;
        if (/ijycnd/i.test(host)) return 'shareDirect';
      } catch (e) {}
      return 'share';
    }
    return 'share';
  }

  function playEpisode(video, sources, sourceIndex, episodeIndex) {
    currentVideo = video;
    playSources = sources || [];
    currentSourceIndex = typeof sourceIndex === 'number' ? sourceIndex : 0;
    currentEpisodeIndex = typeof episodeIndex === 'number' ? episodeIndex : 0;

    const src = playSources[currentSourceIndex];
    if (!src) return;
    const ep = src.episodes[currentEpisodeIndex];
    if (!ep) return;

    destroyPlayer();
    showLoading(12);

    const urlType = src.urlType || classifyClient(ep.url);
    const videoId = video.vod_id || video.vod_uniq_id || '';

    if (urlType === 'm3u8') {
      if (window.Artplayer) {
        playWithArtPlayer(ep.url, videoId);
      } else if (window.Hls) {
        playM3u8Direct(ep.url, videoId);
      } else {
        const container = document.getElementById('dplayer');
        const videoEl = document.createElement('video');
        videoEl.src = ep.url;
        videoEl.controls = true;
        videoEl.autoplay = true;
        videoEl.style.cssText = 'width:100%;height:100%;background:#000;';
        videoEl.setAttribute('playsinline', 'true');
        container.appendChild(videoEl);
        videoEl.addEventListener('loadedmetadata', hideLoading, { once: true });
        videoEl.addEventListener('error', hideLoading, { once: true });
      }
    } else if (urlType === 'shareDirect') {
      // 站点自带播放器（如 U酷云播），直接嵌入原始地址，不走解析代理
      playDirectIframe(ep.url);
    } else if (urlType === 'official') {
      playWithIframe(ep.url);
    } else if (urlType === 'share') {
      // 云播 share 页面自带播放器，直接嵌入；
      // /api/parse 只放行官方平台 URL，走代理会被 403
      playDirectIframe(ep.url);
    } else {
      playDirectIframe(ep.url);
    }

    renderSidebar();

    try {
      if (window.VideoApp && VideoApp.saveToHistory) {
        VideoApp.saveToHistory(video, playSources, currentSourceIndex, currentEpisodeIndex);
      }
    } catch (e) {}
  }

  function playOfficialUrl(officialUrl) {
    destroyPlayer();
    showLoading(15);
    const $t = document.getElementById('playerTitle');
    const $s = document.getElementById('playerSub');
    const $ti = document.getElementById('pviTitle');
    if ($t) $t.textContent = '官方解析';
    if ($s) $s.textContent = '直接解析官方平台链接';
    if ($ti) $ti.textContent = '官方解析播放';
    currentVideo = { vod_name: '官方解析', vod_id: 'official_' + Date.now() };
    playSources = [];
    currentSourceIndex = 0;
    currentEpisodeIndex = 0;
    const $el = document.getElementById('playerEpisodeList');
    const $src = document.getElementById('playerSourceTabs');
    const $cur = document.getElementById('pCurrentEp');
    if ($el) $el.innerHTML = '';
    if ($src) $src.innerHTML = '';
    if ($cur) $cur.textContent = '官方解析单集模式';
    playWithIframe(officialUrl);
  }

  function nextEpisode() {
    const src = playSources[currentSourceIndex];
    if (!src) return;
    if (currentEpisodeIndex < src.episodes.length - 1) {
      playEpisode(currentVideo, playSources, currentSourceIndex, currentEpisodeIndex + 1);
    }
  }

  function prevEpisode() {
    if (currentEpisodeIndex > 0) {
      playEpisode(currentVideo, playSources, currentSourceIndex, currentEpisodeIndex - 1);
    }
  }

  function pause() {
    destroyPlayer();
  }

  function init() {
    initTabs();
    initBackButton();
    initSideToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PlayerComponent = {
    playEpisode,
    playOfficialUrl,
    destroy: destroyPlayer,
    showLoading,
    hideLoading,
    nextEpisode,
    prevEpisode,
    pause
  };
})();
