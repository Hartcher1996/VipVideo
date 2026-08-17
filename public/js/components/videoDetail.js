(function () {
  'use strict';

  const PLACEHOLDER_COVER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E';

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
  }

  /**
   * 渲染播放页内的「简介」Tab 内容
   * V3 布局：竖向紧凑排列（封面 + 标题 + 标签 + 元信息 + 简介）
   * 长简介用 line-clamp 收起，点「展开」显示全文，避免桌面端滚动条
   */
  function renderPlayerInlineInfo(video, playSources) {
    const container = document.getElementById('detailInlineContent');
    if (!container || !video) return;
    const esc = VideoAPI.escapeHtml;
    const desc = stripHtml(video.vod_content || video.vod_blurb) || '暂无简介';

    // 标签行
    const badges = [];
    if (video.type_name) badges.push(`<span class="pinfo-tag hl">${esc(video.type_name)}</span>`);
    if (video.vod_year) badges.push(`<span class="pinfo-tag">${esc(video.vod_year)}</span>`);
    if (video.vod_area) badges.push(`<span class="pinfo-tag">${esc(video.vod_area)}</span>`);
    if (video.vod_remarks) badges.push(`<span class="pinfo-tag">${esc(video.vod_remarks)}</span>`);
    const srcCount = (playSources && playSources.length) || 0;
    if (srcCount > 1) badges.push(`<span class="pinfo-tag src">${srcCount} 源聚合</span>`);

    // 元信息行
    const metaLines = [];
    if (video.vod_actor) metaLines.push(`<div class="pinfo-meta"><span class="pinfo-ml">演员</span><span class="pinfo-mv">${esc(video.vod_actor)}</span></div>`);
    if (video.vod_director) metaLines.push(`<div class="pinfo-meta"><span class="pinfo-ml">导演</span><span class="pinfo-mv">${esc(video.vod_director)}</span></div>`);
    if (video.vod_lang) metaLines.push(`<div class="pinfo-meta"><span class="pinfo-ml">语言</span><span class="pinfo-mv">${esc(video.vod_lang)}</span></div>`);
    if (video.vod_pubdate || video.vod_addtime) metaLines.push(`<div class="pinfo-meta"><span class="pinfo-ml">更新</span><span class="pinfo-mv">${esc(video.vod_pubdate || video.vod_addtime)}</span></div>`);

    container.innerHTML = `
      <div class="pinfo-wrap">
        <div class="pinfo-top">
          <img class="pinfo-cover" src="${esc(video.vod_pic) || PLACEHOLDER_COVER}" alt="${esc(video.vod_name)}" onerror="this.src='${PLACEHOLDER_COVER}'">
          <div class="pinfo-head-info">
            <div class="pinfo-name">${esc(video.vod_name)}</div>
            <div class="pinfo-tags">${badges.join('')}</div>
          </div>
        </div>
        ${metaLines.length ? `<div class="pinfo-meta-list">${metaLines.join('')}</div>` : ''}
        <div class="pinfo-desc-wrap">
          <div class="pinfo-desc" id="pinfoDesc">${esc(desc)}</div>
          <button class="pinfo-toggle" id="pinfoToggle" style="display:none;">展开</button>
        </div>
      </div>
    `;

    // 长简介：检测是否超出 4 行，超出则显示展开按钮
    const descEl = document.getElementById('pinfoDesc');
    const toggleBtn = document.getElementById('pinfoToggle');
    if (descEl && toggleBtn) {
      // 延迟检测，确保渲染完毕
      requestAnimationFrame(() => {
        if (descEl.scrollHeight > descEl.clientHeight + 2) {
          toggleBtn.style.display = '';
          let expanded = false;
          toggleBtn.addEventListener('click', () => {
            expanded = !expanded;
            descEl.classList.toggle('expanded', expanded);
            toggleBtn.textContent = expanded ? '收起' : '展开';
          });
        } else {
          descEl.classList.add('expanded');
        }
      });
    }
  }

  function renderVideoDetail(video, playSources, onEpisodeClick) {
    const container = document.getElementById('detailContent');
    const esc = VideoAPI.escapeHtml;
    const desc = stripHtml(video.vod_content || video.vod_blurb) || '暂无简介';

    // 线路类型徽章
    function lineBadge(src) {
      if (src.urlType === 'official') {
        return '<span class="line-badge official" title="官方解析线路">官方</span>';
      }
      if (src.urlType === 'm3u8') {
        return '<span class="line-badge m3u8" title="m3u8 直链线路">m3u8</span>';
      }
      if (src.urlType === 'shareDirect') {
        return '<span class="line-badge m3u8" title="站点自带播放器，直接嵌入">云播</span>';
      }
      return '<span class="line-badge unknown" title="第三方线路">第三方</span>';
    }

    // 线路 tab 名称：优先中文源名（如 最大资源），同源多线路时附加「线路N」
    function sourceTabLabel(src, idx, all) {
      const cn = src.sourceName || '';
      if (cn) {
        const sameSource = all.filter(s => s.sourceName === cn);
        if (sameSource.length > 1) {
          return `${cn}·线路${sameSource.indexOf(src) + 1}`;
        }
        return cn;
      }
      return src.lineName || src.name || `线路${idx + 1}`;
    }

    container.innerHTML = `
      <div class="detail-header">
        <div class="detail-cover">
          <img src="${esc(video.vod_pic) || PLACEHOLDER_COVER}" alt="${esc(video.vod_name)}" onerror="this.src='${PLACEHOLDER_COVER}'">
        </div>
        <div class="detail-info">
          <h1>${esc(video.vod_name)}</h1>
          <div class="tags">
            ${video.type_name ? '<span class="tag highlight">' + esc(video.type_name) + '</span>' : ''}
            ${video.vod_year ? '<span class="tag">' + esc(video.vod_year) + '</span>' : ''}
            ${video.vod_area ? '<span class="tag">' + esc(video.vod_area) + '</span>' : ''}
            ${video.vod_remarks ? '<span class="tag">' + esc(video.vod_remarks) + '</span>' : ''}
            ${video._sourceCount && video._sourceCount > 1 ? '<span class="tag source-count">' + video._sourceCount + ' 源聚合</span>' : ''}
          </div>
          ${video.vod_actor ? '<p class="detail-meta-line"><strong>演员：</strong>' + esc(video.vod_actor) + '</p>' : ''}
          ${video.vod_director ? '<p class="detail-meta-line"><strong>导演：</strong>' + esc(video.vod_director) + '</p>' : ''}
          <p class="desc">${esc(desc)}</p>
        </div>
      </div>
      ${playSources.length > 0 ? `
        <div class="detail-section">
          <h3 class="section-subtitle">播放选集</h3>
          <div class="source-tabs-row" id="detailSourceTabs">
            ${playSources.map((s, i) => `
              <div class="source-tab ${i === 0 ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">
                ${esc(sourceTabLabel(s, i, playSources))}${lineBadge(s)}
              </div>
            `).join('')}
          </div>
          <div class="play-list" id="detailPlayList"></div>
        </div>
      ` : '<div class="empty-state"><div class="empty-icon">🎬</div><div class="empty-title">暂无播放资源</div><div class="empty-desc">换个视频看看吧～</div></div>'}
    `;

    if (playSources.length > 0) {
      renderDetailEpisodeList(0, playSources, onEpisodeClick);

      container.addEventListener('click', (e) => {
        const tab = e.target.closest('.source-tab');
        if (tab) {
          const index = parseInt(tab.dataset.index);
          container.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          renderDetailEpisodeList(index, playSources, onEpisodeClick);
        }
      });
    }
  }

  function renderDetailEpisodeList(sourceIndex, playSources, onEpisodeClick) {
    const playlist = document.getElementById('detailPlayList');
    if (!playlist) return;

    const source = playSources[sourceIndex];
    if (!source) return;

    const esc = VideoAPI.escapeHtml;
    playlist.innerHTML = source.episodes.map((ep, eIndex) => `
      <div class="play-item" data-episode="${eIndex}" role="button" tabindex="0">${esc(ep.name)}</div>
    `).join('');

    playlist.addEventListener('click', (e) => {
      const item = e.target.closest('.play-item');
      if (item) {
        const epIdx = parseInt(item.dataset.episode);
        const epName = source.episodes[epIdx]?.name || '';
        onEpisodeClick(epIdx, sourceIndex, epName);
      }
    });
  }

  window.VideoDetailComponent = {
    renderVideoDetail,
    renderDetailEpisodeList,
    renderPlayerInlineInfo
  };
})();
