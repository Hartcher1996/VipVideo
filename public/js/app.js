(function () {
  'use strict';

  let currentPage = 1;
  let currentKeyword = '';
  let currentTypeId = '';
  let totalPage = 1;
  let currentVideo = null;
  let playSources = [];
  let currentSourceIndex = 0;
  let scrollPosition = 0;
  let availableSources = [];
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
  // 宽屏模式状态与 setter（暴露给 player.js 使用默认宽屏）
  let wideMode = false;
  function setWideMode(on) {
    wideMode = !!on;
    const playerCombined = document.getElementById('playerCombined');
    const wideScreenBtn = document.getElementById('wideScreenBtn');
    if (playerCombined) playerCombined.classList.toggle('wide-mode', wideMode);
    if (wideScreenBtn) {
      wideScreenBtn.classList.toggle('wide-active', wideMode);
      wideScreenBtn.title = wideMode ? '退出宽屏（显示剧集列表）' : '宽屏模式（隐藏剧集列表）';
      wideScreenBtn.textContent = wideMode ? '⛶ 退出宽屏' : '⛶ 宽屏';
    }
    // 从宽屏模式退出回到正常布局时，重新同步 sidebar 高度
    // （player-main 的宽度从全屏缩回到左列，aspect-ratio:16/9 会让高度发生变化）
    if (!wideMode && typeof window.PlayerComponent !== 'undefined'
        && typeof window.PlayerComponent.syncSidebarHeight === 'function') {
      // 等一下 classList.toggle 的布局重排生效
      setTimeout(() => window.PlayerComponent.syncSidebarHeight(), 50);
      setTimeout(() => window.PlayerComponent.syncSidebarHeight(), 250);
    }
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
    document.body.dataset.page = pageName;
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
        } else if (page === 'search') {
          // 回到搜索结果页，恢复当前搜索词/分类和页码
          PlayerComponent.pause();
          const state = VideoStorage.getSavedListState();
          const kw = state.keyword || currentKeyword || '';
          const tid = state.typeId || currentTypeId || '';
          const pg = state.page || currentPage || 1;
          currentKeyword = kw;
          currentTypeId = tid;
          currentPage = pg;
          const topIn = document.getElementById('searchInput');
          const heroIn = document.getElementById('heroSearchInput');
          if (topIn) topIn.value = kw;
          if (heroIn) heroIn.value = kw;

          if (kw || tid) {
            const titleDoc = document.getElementById('listTitle');
            if (titleDoc) {
              titleDoc.textContent = kw ? `搜索: ${kw}` : (categoriesCache.find(c => String(c.type_id) === String(tid))?.type_name || '搜索结果');
            }
            const bc = [{ text: '首页', page: 'home' }];
            if (kw) bc.push({ text: `搜索「${kw}」` });
            else if (tid) bc.push({ text: categoriesCache.find(c => String(c.type_id) === String(tid))?.type_name || '分类' });
            updateBreadcrumb(bc);
            showPage('search');
            loadVideoList(pg, kw, tid).then(() => { setTimeout(restoreScrollPosition, 50); });
          } else {
            showPage('home');
            updateBreadcrumb([{ text: '首页', page: 'home' }]);
          }
        } else if (page === 'history') {
          PlayerComponent.pause();
          renderHistory();
          showPage('history');
          updateBreadcrumb([{ text: '首页', page: 'home' }, { text: '观看历史' }]);
        } else if (page === 'detail') {
          if (currentVideo) {
            PlayerComponent.pause();
            showPage('detail');
            // 详情页：根据来源（搜索/分类/历史）重建完整面包屑，保持方案A
            const fromHistory = !currentKeyword && !currentTypeId;
            updateBreadcrumb(buildDetailCrumbs(currentVideo.vod_name, fromHistory));
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

  // 返回「进入详情/播放页之前的上下文层」数组（用于方案A完整面包屑）
  function buildContextCrumbs(fromHistory) {
    const crumbs = [{ text: '首页', page: 'home' }];
    if (currentKeyword) {
      crumbs.push({ text: `搜索「${currentKeyword}」`, page: 'search' });
    } else if (currentTypeId) {
      const cat = categoriesCache.find(c => String(c.type_id) === String(currentTypeId));
      crumbs.push({ text: cat?.type_name || '分类', page: 'search' });
    } else if (fromHistory) {
      crumbs.push({ text: '历史记录', page: 'history' });
    }
    return crumbs;
  }

  // 生成详情页（方案A）面包屑
  function buildDetailCrumbs(videoName, fromHistory) {
    return [
      ...buildContextCrumbs(fromHistory),
      { text: videoName }
    ];
  }

  // 生成播放页（方案A）面包屑：首页 › 搜索「xxx」 › 剧集名 › 第NN集 正在播放
  function buildPlayerCrumbs(videoName, sourceLabel, episodeName, episodeIndex) {
    const name = episodeName
      ? `正在播放：${episodeName}`
      : `第${episodeIndex + 1}集 正在播放`;
    return [
      ...buildContextCrumbs(false),
      { text: videoName, page: 'detail' },
      { text: name }
    ];
  }

  function goHome() {
    PlayerComponent.pause();
    currentKeyword = '';
    currentTypeId = '';
    currentPage = 1;
    // 清空两个搜索框
    const inputs = [document.getElementById('searchInput'), document.getElementById('heroSearchInput')];
    inputs.forEach(el => { if (el) el.value = ''; });
    showPage('home');
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
    VideoStorage.saveListState({ keyword: '', page: 1, typeId: '' });
  }

  async function loadVideoList(page, keyword, typeId) {
    const videoList = document.getElementById('videoList');
    const listTitle = document.getElementById('listTitle');

    if (listTitle) {
      listTitle.textContent = keyword ? `搜索: ${keyword}` : '搜索结果';
    }
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
          videoList.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">🔍</div>
              <div class="empty-title">本页暂无该分类内容</div>
              <div class="empty-desc">试试翻到下一页，说不定会有惊喜哦～</div>
              ${page < totalPage ? `<button class="retry-btn" id="emptyNextBtn">下一页看看</button>` : ''}
            </div>
          `;
          const nextBtn = document.getElementById('emptyNextBtn');
          if (nextBtn) {
            nextBtn.addEventListener('click', () => {
              currentPage++;
              loadVideoList(currentPage, keyword, typeId);
            });
          }
          VideoListComponent.updatePagination(page, totalPage, () => {}, () => {}, () => {});
        }
      } else {
        const isSearch = !!keyword;
        videoList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${isSearch ? '🔍' : '📭'}</div>
            <div class="empty-title">${isSearch ? '没有找到相关视频' : '暂无内容'}</div>
            <div class="empty-desc">${isSearch ? '换个关键词试试吧，或者检查一下拼写是否正确' : '稍等片刻，内容马上就来～'}</div>
          </div>
        `;
        totalPage = 1;
        VideoListComponent.updatePagination(page, totalPage, () => {}, () => {}, () => {});
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        videoList.innerHTML = `
          <div class="error-state">
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

  // 分类缓存占位（保留供面包屑查找逻辑使用，分类接口未启用时永远为空数组）
  let categoriesCache = [];

  function renderHotTags() {
    const wrap = document.getElementById('hotTags');
    if (!wrap) return;
    const keywords = Array.isArray(siteConfig.hotKeywords) ? siteConfig.hotKeywords : [];
    // 没有热搜词就隐藏整个热搜区（包括标题）
    const hotLabel = document.querySelector('.hot-label');
    if (keywords.length === 0) {
      wrap.innerHTML = '';
      if (hotLabel) hotLabel.style.display = 'none';
      return;
    }
    if (hotLabel) hotLabel.style.display = '';
    const esc = VideoAPI.escapeHtml;
    wrap.innerHTML = keywords.slice(0, 9).map((k, i) => `
      <span class="hot-tag" data-keyword="${esc(k)}" role="button" tabindex="0">
        <span class="rank">${i + 1}</span>${esc(k)}
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

  // 将配置应用到 DOM 各位置（标题 / Logo / Hero / 搜索框 / Stats / 页脚 / 面包屑）
  function applySiteConfig() {
    const esc = VideoAPI.escapeHtml;

    // 1. HTML 标题 + Logo 文字 + 首页面包屑显示名
    const name = siteConfig.siteName || 'VIP视频解析';
    document.title = name;
    const logoText = document.querySelector('.logo-text');
    if (logoText) logoText.textContent = name;

    // 2. Hero 主标题（支持 <hl>xxx</hl> 高亮）
    const heroTitleEl = document.querySelector('.hero-title');
    if (heroTitleEl) {
      const raw = siteConfig.heroTitle || '';
      if (raw) {
        const html = esc(raw).replace(/&lt;hl&gt;(.*?)&lt;\/hl&gt;/g, '<span class="hero-hl">$1</span>');
        heroTitleEl.innerHTML = html;
      }
    }

    // 3. Hero 副标题 / slogan
    const heroSubEl = document.querySelector('.hero-sub');
    if (heroSubEl && siteConfig.siteSlogan) {
      heroSubEl.textContent = siteConfig.siteSlogan;
    }

    // 4. 搜索框 placeholder（顶部 + Hero 两个）
    const ph = siteConfig.searchPlaceholder || '';
    const heroInput = document.getElementById('heroSearchInput');
    const topInput = document.getElementById('searchInput');
    if (heroInput && ph) heroInput.placeholder = ph;
    if (topInput && ph) topInput.placeholder = ph;

    // 5. 热搜词
    renderHotTags();

    // 6. 首页底部 Stats 数据条
    const statsEl = document.querySelector('.home-stats');
    if (statsEl) {
      const stats = Array.isArray(siteConfig.stats) ? siteConfig.stats : [];
      if (stats.length === 0) {
        statsEl.style.display = 'none';
      } else {
        statsEl.style.display = '';
        statsEl.innerHTML = stats.map(s => `
          <div class="stat-item"><div class="stat-num">${esc(s.num || '')}</div><div class="stat-lbl">${esc(s.label || '')}</div></div>
        `).join('');
      }
    }

    // 7. 页脚版权
    const footerEl = document.querySelector('.footer p');
    if (footerEl) {
      if (siteConfig.footer) footerEl.textContent = siteConfig.footer;
    }
  }

  // 统一搜索执行入口（Header/Hero 都走这里）
  function performSearch(keyword) {
    const kw = (keyword || '').trim();
    // 同步到两个搜索框
    const hInput = document.getElementById('heroSearchInput');
    const tInput = document.getElementById('searchInput');
    if (hInput) hInput.value = kw;
    if (tInput) tInput.value = kw;

    // 空关键词：回到首页，不加载列表
    if (!kw) {
      showPage('home');
      updateBreadcrumb([{ text: '首页', page: 'home' }]);
      return;
    }

    currentKeyword = kw;
    currentTypeId = '';
    currentPage = 1;

    const listTitle = document.getElementById('listTitle');
    if (listTitle) listTitle.textContent = `搜索: ${kw}`;

    updateBreadcrumb([
      { text: '首页', page: 'home' },
      { text: `搜索「${kw}」` }
    ]);

    // 跳转到独立的搜索结果页
    showPage('search');
    loadVideoList(1, kw, '');
  }

  async function loadVideoDetail(id) {
    saveScrollPosition();
    showPage('detail');
    const detailContent = document.getElementById('detailContent');
    detailContent.innerHTML = '<div class="loading">加载中...</div>';
    window.scrollTo(0, 0);

    try {
      const data = await VideoAPI.loadVideoDetail(id);

      if (data.code === 1 && data.list && data.list.length > 0) {
        currentVideo = data.list[0];
        playSources = VideoAPI.parsePlaySources(currentVideo);
        currentSourceIndex = 0;

        VideoStorage.addToHistory(currentVideo);
        VideoDetailComponent.renderVideoDetail(currentVideo, playSources, (episodeIndex, sourceIdx, epName) => {
          saveScrollPosition();
          showPage('player');
          currentSourceIndex = typeof sourceIdx === 'number' ? sourceIdx : currentSourceIndex;
          PlayerComponent.playEpisode(currentVideo, playSources, currentSourceIndex, episodeIndex);
          const src = playSources[currentSourceIndex] || playSources[0];
          const episodeName = (typeof epName === 'string' && epName.trim())
            ? epName
            : (src && src.episodes && src.episodes[episodeIndex] ? src.episodes[episodeIndex].name : '');
          updateBreadcrumb(buildPlayerCrumbs(
            currentVideo.vod_name,
            src ? src.source : '',
            episodeName,
            episodeIndex
          ));
        });

        const fromHistory = !currentKeyword && !currentTypeId;
        updateBreadcrumb(buildDetailCrumbs(currentVideo.vod_name, fromHistory));
      } else {
        detailContent.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🤔</div>
            <div class="empty-title">未找到视频信息</div>
            <div class="empty-desc">这个视频可能已经下线了，去看看其他精彩内容吧</div>
          </div>
        `;
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        detailContent.innerHTML = `
          <div class="error-state">
            <div class="error-icon">😵</div>
            <div class="error-title">加载失败</div>
            <div class="error-desc">网络好像出了点小问题，请检查网络连接后重试</div>
            <button class="retry-btn" id="detailRetryBtn">重新加载</button>
          </div>
        `;
        const retryBtn = document.getElementById('detailRetryBtn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => loadVideoDetail(id));
        }
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
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <div class="empty-title">还没有观看记录</div>
          <div class="empty-desc">去发现精彩内容吧，你的观看记录会保存在这里</div>
          <button class="retry-btn" id="historyGoHomeBtn">去发现</button>
        </div>
      `;
      const goHomeBtn = document.getElementById('historyGoHomeBtn');
      if (goHomeBtn) {
        goHomeBtn.addEventListener('click', goHome);
      }
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
        
        if (!VideoAPI.getSource() && availableSources.length > 0) {
          switchSource(availableSources[0].id);
        } else {
          renderSourceDropdown();
          updateSourceLabel();
        }
      }
    } catch (error) {
      console.error('加载源列表失败:', error);
    }
  }

  function renderSourceDropdown() {
    const dropdown = document.getElementById('sourceDropdown');
    const heroDropdown = document.getElementById('heroSourceDropdown');
    const esc = VideoAPI.escapeHtml;
    const currentSrc = VideoAPI.getSource();
    const html = `
      ${availableSources.map(s => `
        <div class="source-dropdown-item ${currentSrc === s.id ? 'active' : ''}" data-id="${esc(s.id)}" role="button" tabindex="0">
          <span class="source-name">${esc(s.name)}</span>
          ${currentSrc === s.id ? '<span class="source-check">✓</span>' : ''}
        </div>
      `).join('')}
    `;
    if (dropdown) dropdown.innerHTML = html;
    if (heroDropdown) heroDropdown.innerHTML = html;

    const bind = (drop) => {
      if (!drop) return;
      drop.querySelectorAll('.source-dropdown-item').forEach(item => {
        const onClick = () => {
          const sourceId = item.dataset.id || '';
          switchSource(sourceId);
        };
        item.addEventListener('click', onClick);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
        });
      });
    };
    bind(dropdown);
    bind(heroDropdown);
  }

  function updateSourceLabel() {
    const label = document.getElementById('sourceLabel');
    const heroLabel = document.getElementById('heroSourceLabel');
    const currentSrc = VideoAPI.getSource();
    const source = availableSources.find(s => s.id === currentSrc);
    const name = source ? source.name : availableSources[0]?.name || '选择源';
    if (label) label.textContent = name;
    if (heroLabel) heroLabel.textContent = name;
  }

  function switchSource(sourceId) {
    VideoAPI.setSource(sourceId);
    updateSourceLabel();
    renderSourceDropdown();
    // 关掉所有可能的下拉
    document.querySelectorAll('.source-switcher, .hero-source').forEach(el => el.classList.remove('open'));

    const srcName = availableSources.find(s => s.id === sourceId)?.name || '选择源';
    showToast(`已切换到 ${srcName}`);

    // 如果在搜索结果页，切换源后重新搜索
    if (pages.search && pages.search.classList.contains('active')) {
      currentPage = 1;
      loadVideoList(1, currentKeyword, currentTypeId);
    }
  }

  function initEvents() {
    document.getElementById('logoBtn').addEventListener('click', goHome);

    // 滚动时给 body 加 .header-scrolled → Header 变毛玻璃，避免和内容混在一起
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        document.body.classList.toggle('header-scrolled', window.scrollY > 12);
        scrollTicking = false;
      });
    }, { passive: true });

    // Header 源切换下拉
    const sourceBtn = document.getElementById('sourceBtn');
    const sourceSwitcher = document.querySelector('.header-source');
    if (sourceBtn && sourceSwitcher) {
      sourceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 关掉 Hero 的下拉
        const heroSwitch = document.querySelector('.hero-source');
        if (heroSwitch) heroSwitch.classList.remove('open');
        sourceSwitcher.classList.toggle('open');
      });
    }
    // Hero 源切换下拉
    const heroSourceBtn = document.getElementById('heroSourceBtn');
    const heroSwitcher = document.querySelector('.hero-source');
    if (heroSourceBtn && heroSwitcher) {
      heroSourceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const headSw = document.querySelector('.header-source');
        if (headSw) headSw.classList.remove('open');
        heroSwitcher.classList.toggle('open');
      });
    }
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.source-switcher') && !e.target.closest('.hero-source')) {
        document.querySelectorAll('.source-switcher, .hero-source').forEach(el => el.classList.remove('open'));
      }
    });

    // 顶部搜索框 → performSearch
    const topSearchBtn = document.getElementById('searchBtn');
    const topSearchInput = document.getElementById('searchInput');
    if (topSearchBtn && topSearchInput) {
      topSearchBtn.addEventListener('click', () => performSearch(topSearchInput.value));
      topSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch(topSearchInput.value);
      });
    }

    // Hero 搜索框 → performSearch
    const heroSearchBtn = document.getElementById('heroSearchBtn');
    const heroSearchInput = document.getElementById('heroSearchInput');
    if (heroSearchBtn && heroSearchInput) {
      heroSearchBtn.addEventListener('click', () => performSearch(heroSearchInput.value));
      heroSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch(heroSearchInput.value);
      });
    }

    // 双搜索框输入联动（保持值同步）
    if (heroSearchInput && topSearchInput) {
      heroSearchInput.addEventListener('input', () => {
        if (document.activeElement === heroSearchInput) topSearchInput.value = heroSearchInput.value;
      });
      topSearchInput.addEventListener('input', () => {
        if (document.activeElement === topSearchInput) heroSearchInput.value = topSearchInput.value;
      });
    }

    // 宽屏模式切换（隐藏剧集列表）—— wideMode / setWideMode 已在顶部声明
    const wideScreenBtn = document.getElementById('wideScreenBtn');
    if (wideScreenBtn) {
      wideScreenBtn.addEventListener('click', () => setWideMode(!wideMode));
    }

    // 主题切换
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

    // 键盘快捷键（宽屏切换 + 播放控制）
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
      } else if (e.key.toLowerCase() === 'w') {
        // W 键切换宽屏模式
        e.preventDefault();
        setWideMode(!wideMode);
      }
    });
  }

  async function init() {
    // 1. 先拉取站点配置（失败不中断，走默认值）
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
    // 先应用一次配置（确保标题/Logo/Hero 等尽早显示）
    applySiteConfig();

    VideoAPI.loadSavedSource();

    const theme = VideoStorage.getTheme();
    VideoStorage.setTheme(theme);
    document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';

    initEvents();
    showPage('home');
    updateBreadcrumb([{ text: '首页', page: 'home' }]);
    loadSources();

    window.addEventListener('error', (e) => {
      console.error('全局错误:', e.error);
      showToast('发生错误，请刷新页面');
    });

    window.addEventListener('unhandledrejection', (e) => {
      console.error('未处理的 Promise 拒绝:', e.reject);
      showToast('请求失败，请重试');
    });
  }

  window.VideoApp = {
    showToast,
    updateBreadcrumb,
    buildDetailCrumbs,
    buildPlayerCrumbs,
    buildContextCrumbs,
    // 暴露配置读取 + 宽屏 setter，供 player.js / 其他组件使用
    getSiteConfig: () => Object.assign({}, siteConfig),
    setWideMode
  };

  init();
})();
