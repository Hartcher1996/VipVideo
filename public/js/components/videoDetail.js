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

  window.VideoDetailComponent = {
    renderPlayerInlineInfo
  };
})();
