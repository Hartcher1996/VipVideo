(function () {
  'use strict';

  const PLACEHOLDER_COVER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E';

  // 聚合唯一：按 vod_uniq_id（后端 SHA-1(name+year) 生成）归并
  // 比 vod_id 更稳定 —— 同一部片在不同源 vod_id 不同，但 vod_uniq_id 一致
  function aggregateUnique(videos) {
    const merged = new Map();
    for (const v of (videos || [])) {
      const key = String(v.vod_uniq_id || v.vod_id || v.vod_name || Math.random());
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, { ...v, _agg_sources: v._sourceCount || 1 });
      } else {
        // 合并：累加源数、补全缺失字段、取更完整的数据
        prev._agg_sources = (prev._agg_sources || 1) + (v._sourceCount || 1);
        if ((!prev.vod_pic && v.vod_pic) || (v.vod_pic && prev.vod_pic && v.vod_pic.length > prev.vod_pic.length)) {
          prev.vod_pic = v.vod_pic;
        }
        if (!prev.vod_content && v.vod_content) prev.vod_content = v.vod_content;
        if (!prev.vod_remarks && v.vod_remarks) prev.vod_remarks = v.vod_remarks;
        if (!prev.vod_year && v.vod_year) prev.vod_year = v.vod_year;
        if (!prev.type_name && v.type_name) prev.type_name = v.type_name;
        // 合并播放线路（用于卡片悬浮显示线路类型分布）
        if (Array.isArray(v._playSources) && v._playSources.length > 0) {
          prev._playSources = (prev._playSources || []).concat(v._playSources);
        }
        if (v._sourceCount && v._sourceCount > 1) prev._sourceCount = v._sourceCount;
      }
    }
    return Array.from(merged.values());
  }

  // 统计影片的线路类型分布（用于搜索结果卡片悬浮显示）
  function getLineTypeDistribution(video) {
    const types = new Set();
    const sources = video._playSources || [];
    for (const s of sources) {
      if (s && s.urlType) types.add(s.urlType);
    }
    return Array.from(types);
  }

  // 渲染单张视频卡片 HTML
  function renderCardHtml(video, esc) {
    const sourceCount = video._sourceCount || video._agg_sources || 1;
    const sourceBadge = sourceCount > 1
      ? `<span class="card-source-badge" title="${sourceCount} 个源聚合">${sourceCount}源</span>`
      : '';

    const remarks = video.vod_remarks
      ? `<span class="card-remarks">${esc(video.vod_remarks)}</span>`
      : '';

    // 线路类型分布 chips（悬浮显示）
    const lineTypes = getLineTypeDistribution(video);
    const lineChips = lineTypes.length > 1
      ? `<div class="card-line-info">${lineTypes.map(t => `<span class="line-chip ${esc(t)}">${esc(t === 'm3u8' ? '直链' : t === 'official' ? '官方' : t === 'shareDirect' ? '云播' : t === 'share' ? '分享' : '其他')}</span>`).join('')}</div>`
      : '';

    return `
      <div class="video-card" data-id="${esc(video.vod_id)}" data-source="${esc(video._source || '')}" data-name="${esc(video.vod_name)}" data-uniq="${esc(video.vod_uniq_id || '')}" role="button" tabindex="0">
        <div class="cover-wrapper">
          <img class="cover" loading="lazy" src="${esc(video.vod_pic) || PLACEHOLDER_COVER}" alt="${esc(video.vod_name)}" onerror="this.src='${PLACEHOLDER_COVER}'">
          ${sourceBadge}
          ${remarks}
          ${lineChips}
          <div class="play-overlay">
            <div class="play-icon">▶</div>
          </div>
        </div>
        <div class="info">
          <div class="title">${esc(video.vod_name)}</div>
          <div class="meta">
            ${video.type_name ? `<span class="type">${esc(video.type_name)}</span>` : ''}
            ${video.vod_year ? `<span class="year">${esc(video.vod_year)}</span>` : ''}
          </div>
          <div class="card-extra">
            ${sourceCount > 1 ? `<span class="ex-source">${sourceCount}源</span>` : ''}
            ${video.vod_remarks ? `<span class="ex-remarks">${esc(video.vod_remarks)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderSkeletonCards(container) {
    const skeletons = Array.from({ length: 12 }, () =>
      '<div class="skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-info"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>'
    ).join('');
    container.innerHTML = skeletons;
  }

  // 渲染视频列表（替换模式）：第一页或重置时使用
  function renderVideoList(videos, onVideoClick) {
    const videoList = document.getElementById('videoList');
    const esc = VideoAPI.escapeHtml;

    // 前端聚合唯一：按 vod_uniq_id 去重合并
    const uniqueVideos = aggregateUnique(videos);

    videoList.innerHTML = uniqueVideos.map(video => renderCardHtml(video, esc)).join('');
    bindCardClick(videoList, onVideoClick);
  }

  // 追加渲染（无限滚动）：新增页追加到现有列表
  function appendVideoList(videos, onVideoClick) {
    const videoList = document.getElementById('videoList');
    const esc = VideoAPI.escapeHtml;

    const uniqueVideos = aggregateUnique(videos);

    // 过滤掉已在列表中的视频（按 vod_uniq_id / vod_id 去重）
    const existingKeys = new Set();
    videoList.querySelectorAll('.video-card').forEach(card => {
      const k = card.dataset.uniq || card.dataset.id;
      if (k) existingKeys.add(String(k));
    });
    const newVideos = uniqueVideos.filter(v => {
      const k = String(v.vod_uniq_id || v.vod_id || '');
      return k && !existingKeys.has(k);
    });

    if (newVideos.length === 0) return 0;

    // 追加到现有列表
    const html = newVideos.map(video => renderCardHtml(video, esc)).join('');
    videoList.insertAdjacentHTML('beforeend', html);

    // 重新绑定点击事件（事件委托，一次性）
    bindCardClick(videoList, onVideoClick);

    return newVideos.length;
  }

  // 事件委托：绑定卡片点击
  function bindCardClick(videoList, onVideoClick) {
    // 移除旧监听器：克隆替换
    const newList = videoList.cloneNode(true);
    videoList.parentNode.replaceChild(newList, videoList);
    newList.addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      if (card) onVideoClick(card.dataset.id, card.dataset.source || '', card.dataset.name || '');
    });
    newList.addEventListener('keydown', (e) => {
      const card = e.target.closest('.video-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onVideoClick(card.dataset.id, card.dataset.source || '', card.dataset.name || '');
      }
    });
  }

  // ============ 无限滚动 ============
  let scrollObserver = null;
  let isLoadingMore = false;

  // 初始化 IntersectionObserver：当 sentinel 进入视口时触发回调
  function initInfiniteScroll(onLoadMore) {
    const sentinel = document.getElementById('loadMoreSentinel');
    if (!sentinel) return;

    // 清理旧 observer
    if (scrollObserver) {
      scrollObserver.disconnect();
      scrollObserver = null;
    }

    scrollObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !isLoadingMore) {
        onLoadMore();
      }
    }, {
      root: null,
      rootMargin: '200px',
      threshold: 0
    });

    scrollObserver.observe(sentinel);
  }

  // 设置 sentinel 状态：loading / done / idle
  function setSentinelState(state) {
    const sentinel = document.getElementById('loadMoreSentinel');
    if (!sentinel) return;
    sentinel.classList.remove('loading', 'done');
    if (state) sentinel.classList.add(state);

    const textEl = sentinel.querySelector('.load-more-text');
    if (textEl) {
      if (state === 'loading') textEl.textContent = '正在加载...';
      else if (state === 'done') textEl.textContent = '已全部加载';
      else textEl.textContent = '向下滚动加载更多';
    }
  }

  function setLoadingMore(loading) {
    isLoadingMore = loading;
  }

  window.VideoListComponent = {
    renderSkeletonCards,
    renderVideoList,
    appendVideoList,
    initInfiniteScroll,
    setSentinelState,
    setLoadingMore
  };
})();
