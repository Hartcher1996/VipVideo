(function () {
  'use strict';

  const PLACEHOLDER_COVER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E';

  function renderSkeletonCards(container) {
    const skeletons = Array.from({ length: 12 }, () =>
      '<div class="skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-info"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>'
    ).join('');
    container.innerHTML = skeletons;
  }

  function renderVideoList(videos, onVideoClick) {
    const videoList = document.getElementById('videoList');
    const esc = VideoAPI.escapeHtml;

    videoList.innerHTML = videos.map(video => `
      <div class="video-card" data-id="${esc(video.vod_id)}" role="button" tabindex="0">
        <div class="cover-wrapper">
          <img class="cover" loading="lazy" src="${esc(video.vod_pic) || PLACEHOLDER_COVER}" alt="${esc(video.vod_name)}" onerror="this.src='${PLACEHOLDER_COVER}'">
          <div class="play-overlay">
            <div class="play-icon">▶</div>
          </div>
        </div>
        <div class="info">
          <div class="title">${esc(video.vod_name)}</div>
          <div class="meta">
            <span class="type">${esc(video.type_name) || ''}</span>
            <span class="remark">${esc(video.vod_remarks) || ''}</span>
          </div>
        </div>
      </div>
    `).join('');

    videoList.addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      if (card) onVideoClick(card.dataset.id);
    });

    videoList.addEventListener('keydown', (e) => {
      const card = e.target.closest('.video-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onVideoClick(card.dataset.id);
      }
    });
  }

  function renderCategories(categories, currentTypeId, onCategoryClick) {
    const container = document.getElementById('categoryFilter');
    if (!container) return;

    const esc = VideoAPI.escapeHtml;
    container.innerHTML = `
      <button class="filter-btn ${!currentTypeId ? 'active' : ''}" data-id="">全部</button>
      ${categories.map(cat => `
        <button class="filter-btn ${String(currentTypeId) === String(cat.type_id) ? 'active' : ''}" data-id="${esc(cat.type_id)}">${esc(cat.type_name)}</button>
      `).join('')}
    `;

    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        onCategoryClick(btn.dataset.id || '');
      });
    });
  }

  function updatePagination(page, totalPage, onPrevClick, onNextClick, onJump) {
    document.getElementById('pageInfo').textContent = `第 ${page} / ${totalPage} 页`;
    document.getElementById('prevPage').disabled = page <= 1;
    document.getElementById('nextPage').disabled = page >= totalPage;

    const jumpInput = document.getElementById('jumpPage');
    if (jumpInput) {
      jumpInput.max = totalPage;
      jumpInput.placeholder = totalPage;
    }

    const jumpBtn = document.getElementById('jumpBtn');
    if (jumpBtn && jumpInput) {
      jumpBtn.onclick = () => {
        const targetPage = parseInt(jumpInput.value);
        if (targetPage >= 1 && targetPage <= totalPage) {
          onJump(targetPage);
          jumpInput.value = '';
        } else {
          VideoApp.showToast(`请输入 1-${totalPage} 之间的页码`);
        }
      };
      jumpInput.onkeypress = (e) => {
        if (e.key === 'Enter') jumpBtn.click();
      };
    }

    document.getElementById('prevPage').onclick = () => onPrevClick();
    document.getElementById('nextPage').onclick = () => onNextClick();
  }

  window.VideoListComponent = {
    renderSkeletonCards,
    renderVideoList,
    renderCategories,
    updatePagination
  };
})();
