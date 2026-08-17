(function () {
  'use strict';

  // ============ 状态 ============
  let currentPage = 1;
  let currentKeyword = '';
  let currentTypeId = '';
  let totalPage = 1;
  let currentVideo = null;
  let playSources = [];
  let currentSourceIndex = 0;
  let scrollPosition = 0;

  // 站点全局配置（由 init 阶段 fetch /api/site/config 填充，失败则用默认值）
  let siteConfig = {
    siteName: 'VIP视频解析',
    siteSlogan: 'VIP视频聚合搜索引擎 · 电影 / 剧 / 动漫 / 综艺一网打尽 · 多源智能切换',
    heroTitle: '想看的片，<hl>30秒直达播放源</hl>',
    searchPlaceholder: '搜索电影、电视剧、动漫、演员、导演...',
    hotKeywords: [],
    defaultWideScreen: false,
    stats: [],
    footer: ''
  };

  // 影院模式：body 加 theater class → 只有播放器显示
  let theaterMode = false;
  function setTheaterMode(on) {
    theaterMode = !!on;
    document.body.classList.toggle('theater', theaterMode);
  }

  function saveScrollPosition() {
    scrollPosition = window.scrollY || window.pageYOffset;
  }

  function restoreScrollPosition() {
    if (scrollPosition > 0) {
      window.scrollTo(0, scrollPosition);
    }
  }

  const pages = {
    home: document.getElementById('homePage'),
    search: document.getElementById('searchPage'),
    player: document.getElementById('playerPage')
  };

  function showPage(pageName) {
    Object.keys(pages).forEach(key => {
      if (pages[key]) {
        pages[key].classList.toggle('active', key === pageName);
      }
    });
    document.body.dataset.page = pageName;
    // 切换页面时关闭历史浮层与官方解析浮窗
    closeHistoryPopover();
    closeOfficialModal();
    window.scrollTo(0, 0);
  }

  // 面包屑已移除（no-op，保留签名避免外部调用报错）
  function updateBreadcrumb(items) {}

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
    if (window.PlayerComponent && PlayerComponent.pause) PlayerComponent.pause();
    currentKeyword = '';
    currentTypeId = '';
    currentPage = 1;
    const heroIn = document.getElementById('heroSearchInput');
    if (heroIn) heroIn.value = '';
    const heroClear = document.getElementById('heroSearchClear');
    if (heroClear) heroClear.classList.remove('visible');
    showPage('home');
  }

  // ============ 搜索结果 + 无限滚动 ============
  async function loadVideoList(page, keyword, typeId) {
    const videoList = document.getElementById('videoList');

    // 更新搜索页 topbar 标题
    const topbarTitle = document.getElementById('searchTopbarTitle');
    if (topbarTitle) {
      topbarTitle.textContent = keyword ? `搜索「${keyword}」` : '搜索结果';
    }

    VideoListComponent.renderSkeletonCards(videoList);
    VideoListComponent.setSentinelState('loading');

    try {
      const data = await VideoAPI.loadVideoList(page, keyword, typeId);

      if (data.code === 1 && data.list && data.list.length > 0) {
        totalPage = data.pagecount || 1;
        currentPage = page;

        VideoListComponent.renderVideoList(data.list, (id) => loadVideoDetail(id));
        VideoStorage.saveListState({ keyword, page, typeId });

        // 初始化无限滚动
        if (page < totalPage) {
          VideoListComponent.setSentinelState('idle');
          VideoListComponent.initInfiniteScroll(() => loadMoreResults());
        } else {
          VideoListComponent.setSentinelState('done');
        }
      } else {
        const isSearch = !!keyword;
        const hotPicks = (siteConfig.hotKeywords || []).slice(0, 5).map(k =>
          `<span class="hot-pick" data-kw="${VideoAPI.escapeHtml(k)}">${VideoAPI.escapeHtml(k)}</span>`
        ).join('');
        videoList.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">${isSearch ? '🔍' : '📭'}</div>
            <div class="empty-title">${isSearch ? '没有找到相关视频' : '暂无内容'}</div>
            <div class="empty-desc">${isSearch ? '换个关键词试试吧，或者从下面的热门搜索找找灵感' : '稍等片刻，内容马上就来～'}</div>
            ${hotPicks ? `<div class="search-empty-cta">${hotPicks}</div>` : ''}
          </div>
        `;
        videoList.querySelectorAll('.hot-pick').forEach(pick => {
          pick.addEventListener('click', () => {
            const k = pick.dataset.kw || '';
            if (k) {
              const heroIn = document.getElementById('heroSearchInput');
              if (heroIn) heroIn.value = k;
              performSearch(k);
            }
          });
        });
        VideoListComponent.setSentinelState('done');
        totalPage = 1;
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        videoList.innerHTML = `
          <div class="error-state" style="grid-column: 1 / -1;">
            <div class="error-icon">😵</div>
            <div class="error-title">加载失败</div>
            <div class="error-desc">网络好像出了点小问题，请检查网络连接后重试</div>
            <button class="retry-btn" id="retryBtn">重新加载</button>
          </div>
        `;
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => loadVideoList(page, keyword, typeId));
        }
        showToast('加载失败，请重试');
        console.error(error);
      }
    }
  }

  // 无限滚动：加载下一页并追加
  async function loadMoreResults() {
    if (currentPage >= totalPage) {
      VideoListComponent.setSentinelState('done');
      return;
    }

    VideoListComponent.setLoadingMore(true);
    VideoListComponent.setSentinelState('loading');

    try {
      const nextPage = currentPage + 1;
      // 使用 abortable:false 避免打断正在进行的请求
      const data = await VideoAPI.loadVideoList(nextPage, currentKeyword, currentTypeId, { abortable: false });

      if (data.code === 1 && data.list && data.list.length > 0) {
        VideoListComponent.appendVideoList(data.list, (id) => loadVideoDetail(id));
        currentPage = nextPage;
        VideoStorage.saveListState({ keyword: currentKeyword, page: currentPage, typeId: currentTypeId });

        if (currentPage >= totalPage) {
          VideoListComponent.setSentinelState('done');
        } else {
          VideoListComponent.setSentinelState('idle');
        }
      } else {
        VideoListComponent.setSentinelState('done');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        VideoListComponent.setSentinelState('idle');
        showToast('加载更多失败');
        console.error(error);
      }
    } finally {
      VideoListComponent.setLoadingMore(false);
    }
  }

  function renderHotTags() {
    const wrap = document.getElementById('hotTags');
    if (!wrap) return;
    const keywords = Array.isArray(siteConfig.hotKeywords) ? siteConfig.hotKeywords : [];
    if (keywords.length === 0) {
      wrap.innerHTML = '';
      return;
    }
    const esc = VideoAPI.escapeHtml;
    wrap.innerHTML = keywords.slice(0, 9).map((k, i) => `
      <span class="hot-tag" data-keyword="${esc(k)}" role="button" tabindex="0">
        <span class="rank">${i + 1}</span><span class="hot-name">${esc(k)}</span>
      </span>
    `).join('');
    wrap.querySelectorAll('.hot-tag').forEach(tag => {
      const doSearch = () => {
        const kw = tag.dataset.keyword || '';
        performSearch(kw);
      };
      tag.addEventListener('click', doSearch);
      tag.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSearch(); }
      });
    });
  }

  // 将配置应用到 DOM 各位置
  function applySiteConfig() {
    const esc = VideoAPI.escapeHtml;

    // 1. HTML 标题
    const name = siteConfig.siteName || 'VIP视频解析';
    document.title = name;

    // 2. Hero 主标题（支持 <hl>xxx</hl> 高亮）
    const heroTitleEl = document.querySelector('.hero-title');
    if (heroTitleEl) {
      const raw = siteConfig.heroTitle || '';
      if (raw) {
        const html = esc(raw).replace(/&lt;hl&gt;(.*?)&lt;\/hl&gt;/g, '<span class="hero-hl">$1</span>');
        heroTitleEl.innerHTML = html;
      }
    }

    // 3. Hero 副标题
    const heroSubEl = document.querySelector('.hero-sub');
    if (heroSubEl && siteConfig.siteSlogan) {
      heroSubEl.textContent = siteConfig.siteSlogan;
    }

    // 4. 搜索框 placeholder
    const ph = siteConfig.searchPlaceholder || '';
    const heroInput = document.getElementById('heroSearchInput');
    if (heroInput && ph) heroInput.placeholder = ph;

    // 5. 热搜词
    renderHotTags();
  }

  // 统一搜索执行入口
  function performSearch(keyword) {
    const kw = (keyword || '').trim();
    const heroIn = document.getElementById('heroSearchInput');
    if (heroIn) heroIn.value = kw;

    if (!kw) {
      showPage('home');
      return;
    }

    currentKeyword = kw;
    currentTypeId = '';
    currentPage = 1;

    showPage('search');
    loadVideoList(1, kw, '');
  }

  // ============ 进入播放页 ============
  async function loadVideoDetail(id) {
    return loadVideoAndGoPlayer(id);
  }

  async function loadVideoAndGoPlayer(id, preferredSourceIdx, preferredEpisodeIdx) {
    saveScrollPosition();
    setTheaterMode(false);

    showPage('player');
    const inlineInfo = document.getElementById('detailInlineContent');
    if (inlineInfo) inlineInfo.innerHTML = '<div class="loading">加载影片信息...</div>';
    window.scrollTo(0, 0);

    try {
      const data = await VideoAPI.loadVideoDetail(id);

      if (data.code === 1 && data.list && data.list.length > 0) {
        currentVideo = data.list[0];
        playSources = VideoAPI.parsePlaySources(currentVideo);
        currentSourceIndex = typeof preferredSourceIdx === 'number' ? preferredSourceIdx : 0;
        if (currentSourceIndex >= playSources.length) currentSourceIndex = 0;
        let epIdx = typeof preferredEpisodeIdx === 'number' ? preferredEpisodeIdx : 0;
        const curSrc = playSources[currentSourceIndex] || playSources[0];
        if (curSrc && epIdx >= (curSrc.episodes?.length || 0)) epIdx = 0;

        // 历史记录
        VideoStorage.addToHistory(currentVideo);

        // 起播
        if (window.PlayerComponent && PlayerComponent.playEpisode) {
          PlayerComponent.playEpisode(currentVideo, playSources, currentSourceIndex, epIdx);
        }

        // 填充简介 Tab
        if (window.VideoDetailComponent && VideoDetailComponent.renderPlayerInlineInfo) {
          VideoDetailComponent.renderPlayerInlineInfo(currentVideo, playSources);
        }
      } else {
        if (inlineInfo) {
          inlineInfo.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">🤔</div>
              <div class="empty-title">未找到视频信息</div>
              <div class="empty-desc">这个视频可能已经下线了，去看看其他精彩内容吧</div>
            </div>
          `;
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        if (inlineInfo) {
          inlineInfo.innerHTML = `
            <div class="error-state">
              <div class="error-icon">😵</div>
              <div class="error-title">加载失败</div>
              <div class="error-desc">网络好像出了点小问题，请检查网络连接后重试</div>
              <button class="retry-btn" id="detailRetryBtn">重新加载</button>
            </div>
          `;
          const retryBtn = document.getElementById('detailRetryBtn');
          if (retryBtn) {
            retryBtn.addEventListener('click', () => loadVideoAndGoPlayer(id, preferredSourceIdx, preferredEpisodeIdx));
          }
        }
        showToast('加载视频信息失败');
        console.error(error);
      }
    }
  }

  // ============ 历史浮层 ============
  // 所有事件使用内联 onclick 方式绑定，100% 可靠
  // 这些函数必须暴露到 VideoApp，供 HTML onclick 调用

  function toggleHistoryPopover() {
    const popover = document.getElementById('historyPopover');
    if (!popover) return;
    if (popover.classList.contains('open')) {
      closeHistoryPopover();
    } else {
      renderHistoryPopover();
      popover.classList.add('open');
      popover.setAttribute('aria-hidden', 'false');
    }
  }

  function closeHistoryPopover() {
    const popover = document.getElementById('historyPopover');
    if (popover) {
      popover.classList.remove('open');
      popover.setAttribute('aria-hidden', 'true');
    }
  }

  // 清空全部历史（供内联 onclick 调用）
  function clearAllHistory() {
    if (!confirm('确定清空所有观看历史？')) return;
    VideoStorage.clearHistory();
    renderHistoryPopover();
    showToast('历史已清空');
  }

  // 删除单条历史（供内联 onclick 调用）
  function removeHistoryItem(uniqId, evt) {
    if (evt) { evt.stopPropagation && evt.stopPropagation(); }
    VideoStorage.removeHistory(uniqId);
    renderHistoryPopover();
    showToast('已删除该记录');
    return false;
  }

  // 点击历史项进入播放（供内联 onclick 调用）
  function clickHistoryItem(vodId, uniqId, evt) {
    if (evt) { evt.stopPropagation && evt.stopPropagation(); }
    const hist = VideoStorage.getHistory().find(h => (h.vod_uniq_id || h.vod_id) === uniqId);
    const srcIdx = hist && typeof hist.lastSourceIdx === 'number' ? hist.lastSourceIdx : 0;
    const epIdx = hist && typeof hist.lastEpisodeIdx === 'number' ? hist.lastEpisodeIdx : 0;
    closeHistoryPopover();
    loadVideoAndGoPlayer(vodId, srcIdx, epIdx);
    return false;
  }

  // 空状态"去发现"
  function historyGoHome() {
    closeHistoryPopover();
    goHome();
  }

  function renderHistoryPopover() {
    const history = VideoStorage.getHistory();
    const container = document.getElementById('historyList');
    if (!container) return;

    const esc = VideoAPI.escapeHtml;
    const PLACEHOLDER_COVER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E';

    if (history.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <div class="empty-title">还没有观看记录</div>
          <div class="empty-desc">去发现精彩内容吧，你的观看记录会保存在这里</div>
          <button class="retry-btn" onclick="VideoApp.historyGoHome()">去发现</button>
        </div>
      `;
      return;
    }

    // 按时间分组渲染 — 所有元素全部使用内联 onclick
    const groups = VideoStorage.groupHistoryByTime(history);
    container.innerHTML = groups.map(group => {
      const items = group.items.map(video => {
        const uniqId = video.vod_uniq_id || video.vod_id;
        const continueLabel = video.lastEpisodeName
          ? `<span class="h-continue">续看 · ${esc(video.lastEpisodeName)}</span>`
          : '';
        const remark = video.vod_remarks
          ? `<span class="h-remark"><span class="dot"></span>${esc(video.vod_remarks)}</span>`
          : '';
        const relTime = VideoStorage.formatRelativeTime(video.timestamp);

        // 构造内联 onclick — 生成可安全嵌入双引号 HTML 属性的 JS 字符串字面量。
        // 注意：JSON.stringify 只保证 JS 层安全，输出中的 " 会截断 HTML 属性，
        // 必须再对 & " < > 做 HTML 实体转义（浏览器解析属性时会把 &quot; 还原为 "）。
        const inlineJsString = (v) => JSON.stringify(v == null ? '' : String(v))
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const vodIdJs = inlineJsString(video.vod_id);
        const uniqJs = inlineJsString(uniqId);

        return `
          <div class="history-item" role="button" tabindex="0"
            onclick="VideoApp.clickHistoryItem(${vodIdJs}, ${uniqJs}, event)">
            <img class="h-cover" loading="lazy" src="${esc(video.vod_pic) || PLACEHOLDER_COVER}" alt="${esc(video.vod_name)}" onerror="this.src='${PLACEHOLDER_COVER}'">
            <div class="h-body">
              <div class="h-top">
                <span class="h-name">${esc(video.vod_name)}</span>
                ${video.type_name ? `<span class="h-type">${esc(video.type_name)}</span>` : ''}
              </div>
              <div class="h-bottom">
                ${remark}
                ${continueLabel}
                <span class="h-time">${esc(relTime)}</span>
              </div>
            </div>
            <button class="h-del" aria-label="删除" title="删除此记录"
              onclick="return VideoApp.removeHistoryItem(${uniqJs}, event)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        `;
      }).join('');

      return `
        <div class="history-group">
          <div class="history-group-title">
            ${esc(group.title)}
            <span class="history-group-count">${group.items.length} 部</span>
          </div>
          ${items}
        </div>
      `;
    }).join('');
  }

  // ============ 主题切换 ============
  function toggleTheme() {
    const theme = VideoStorage.toggleTheme();
    // 更新所有主题图标
    document.querySelectorAll('.js-theme-icon').forEach(el => {
      el.textContent = theme === 'dark' ? '🌙' : '☀️';
    });
  }

  // ============ 官方解析浮窗 ============
  // 官方平台 URL 白名单（与后端 /api/parse 放行范围保持一致）
  const OFFICIAL_URL_RE = /v\.qq\.com\/x\/cover|iqiyi\.com\/v_|youku\.com\/v_show|mgtv\.com\/b|bilibili\.com\/bangumi|sohu\.com|tv\.sohu\.com|le\.com\/ptv|vip\.1905\.com|pptv\.com/i;

  function openOfficialModal() {
    const modal = document.getElementById('officialModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    // 每次打开重置输入与错误状态
    const input = document.getElementById('officialUrlInput');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 80);
    }
    hideOfficialError();
    const submit = document.getElementById('officialParseSubmit');
    if (submit) submit.classList.remove('loading');
  }

  function closeOfficialModal() {
    const modal = document.getElementById('officialModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    const input = document.getElementById('officialUrlInput');
    if (input) input.blur();
  }

  function showOfficialError(msg) {
    const err = document.getElementById('officialUrlError');
    if (!err) return;
    err.textContent = msg;
    err.classList.add('show');
    // 重新触发抖动动画
    err.classList.remove('shake');
    void err.offsetWidth;
    err.classList.add('shake');
  }

  function hideOfficialError() {
    const err = document.getElementById('officialUrlError');
    if (!err) return;
    err.textContent = '';
    err.classList.remove('show', 'shake');
  }

  function submitOfficialParse() {
    const input = document.getElementById('officialUrlInput');
    const submit = document.getElementById('officialParseSubmit');
    const value = input ? input.value.trim() : '';
    if (!value) {
      showOfficialError('请先粘贴官方平台链接');
      if (input) input.focus();
      return;
    }
    if (!OFFICIAL_URL_RE.test(value)) {
      showOfficialError('暂不支持该链接，请粘贴腾讯 / 爱奇艺 / 优酷 / 芒果TV / B站 等官方平台链接');
      if (input) {
        input.focus();
        input.select();
      }
      return;
    }
    hideOfficialError();
    if (submit) submit.classList.add('loading');
    // 先切到播放页，再交给播放器组件解析
    showPage('player');
    closeOfficialModal();
    if (window.PlayerComponent && PlayerComponent.playOfficialUrl) {
      PlayerComponent.playOfficialUrl(value);
      showToast('正在通过官方线路解析，请稍候...');
    }
  }

  // ============ 事件绑定 ============
  function initEvents() {
    // Hero 搜索框
    const heroSearchBtn = document.getElementById('heroSearchBtn');
    const heroSearchInput = document.getElementById('heroSearchInput');
    const heroSearchClear = document.getElementById('heroSearchClear');
    if (heroSearchBtn && heroSearchInput) {
      heroSearchBtn.addEventListener('click', () => performSearch(heroSearchInput.value));
      heroSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch(heroSearchInput.value);
      });

      // 清除按钮：输入非空时显示，点击清空并聚焦
      const syncClearBtn = () => {
        if (heroSearchClear) heroSearchClear.classList.toggle('visible', heroSearchInput.value.length > 0);
      };
      heroSearchInput.addEventListener('input', syncClearBtn);
      heroSearchInput.addEventListener('blur', () => setTimeout(syncClearBtn, 150));
      if (heroSearchClear) {
        heroSearchClear.addEventListener('click', () => {
          heroSearchInput.value = '';
          heroSearchInput.focus();
          syncClearBtn();
        });
      }
    }

    // 搜索页返回按钮
    const searchBackBtn = document.getElementById('searchBackBtn');
    if (searchBackBtn) {
      searchBackBtn.addEventListener('click', goHome);
    }

    // 播放页返回按钮
    const pBackBtn = document.getElementById('pBackBtn');
    if (pBackBtn) {
      pBackBtn.addEventListener('click', goBackFromPlayer);
    }

    // 主题切换（所有实例）
    document.querySelectorAll('.js-theme-btn').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });

    // 官方解析浮窗：Enter 提交 + Esc 关闭
    const officialInput = document.getElementById('officialUrlInput');
    if (officialInput) {
      officialInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitOfficialParse();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeOfficialModal();
    });

    // 键盘快捷键（播放页：影院模式 + 选集）
    document.addEventListener('keydown', (e) => {
      if (!pages.player?.classList.contains('active')) return;
      if (e.target.tagName === 'INPUT') return;
      if (e.target.closest('.dplayer')) return;
      if (e.target.closest('.artplayer')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (PlayerComponent.prevEpisode) PlayerComponent.prevEpisode();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (PlayerComponent.nextEpisode) PlayerComponent.nextEpisode();
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        setTheaterMode(!theaterMode);
      } else if (e.key === 'Escape') {
        if (theaterMode) {
          e.preventDefault();
          setTheaterMode(false);
        }
      }
    });
  }

  // 从播放页返回：上下文感知（搜索结果 > 首页）
  function goBackFromPlayer() {
    if (window.PlayerComponent && PlayerComponent.pause) PlayerComponent.pause();

    const state = VideoStorage.getSavedListState();
    const kw = state.keyword || currentKeyword || '';

    if (kw) {
      // 返回搜索结果页
      currentKeyword = kw;
      currentPage = state.page || 1;
      const heroIn = document.getElementById('heroSearchInput');
      if (heroIn) heroIn.value = kw;
      showPage('search');
      loadVideoList(currentPage, kw, '').then(() => { setTimeout(restoreScrollPosition, 50); });
    } else {
      goHome();
    }
  }

  async function init() {
    // 1. 拉取站点配置（失败不中断，走默认值）
    try {
      const res = await fetch('/api/site/config', { cache: 'no-store' });
      const data = await res.json();
      if (data && data.code === 1) {
        siteConfig = Object.assign({}, siteConfig, {
          siteName: data.siteName,
          siteSlogan: data.siteSlogan,
          heroTitle: data.heroTitle,
          searchPlaceholder: data.searchPlaceholder,
          hotKeywords: Array.isArray(data.hotKeywords) ? data.hotKeywords : [],
          defaultWideScreen: !!data.defaultWideScreen,
          stats: Array.isArray(data.stats) ? data.stats : [],
          footer: data.footer
        });
      }
    } catch (err) {
      console.warn('加载站点配置失败，使用默认配置:', err.message);
    }
    applySiteConfig();

    const theme = VideoStorage.getTheme();
    VideoStorage.setTheme(theme);
    // 设置所有主题图标
    document.querySelectorAll('.js-theme-icon').forEach(el => {
      el.textContent = theme === 'dark' ? '🌙' : '☀️';
    });

    initEvents();
    showPage('home');

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
    showToast,
    updateBreadcrumb,
    goBackFromPlayer,
    // 官方解析浮窗（供内联 onclick 调用）
    openOfficialModal,
    closeOfficialModal,
    submitOfficialParse,
    // 历史浮层相关（供内联 onclick 调用）
    toggleHistoryPopover,
    closeHistoryPopover,
    clearHistory: clearAllHistory,
    removeHistoryItem,
    clickHistoryItem,
    historyGoHome,
    // 进入播放页（供内联 onclick 历史项调用）
    loadVideoAndGoPlayer,
    pause: () => {
      if (window.PlayerComponent && PlayerComponent.destroy) {
        PlayerComponent.destroy();
      }
    },
    saveToHistory: (video, sources, srcIdx, epIdx) => {
      try {
        let lastEpisodeName = '';
        if (Array.isArray(sources) && sources[srcIdx] && Array.isArray(sources[srcIdx].episodes)) {
          const ep = sources[srcIdx].episodes[epIdx];
          if (ep) lastEpisodeName = ep.name || `第${epIdx + 1}集`;
        }
        VideoStorage.addToHistory(video, {
          lastSourceIdx: srcIdx,
          lastEpisodeIdx: epIdx,
          lastEpisodeName
        });
      } catch (e) {}
    }
  };

  init();
})();
