(function () {
  'use strict';

  const PLACEHOLDER_COVER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%232a2a4a%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E';

  function renderVideoDetail(video, playSources, onEpisodeClick) {
    const container = document.getElementById('detailContent');
    const esc = VideoAPI.escapeHtml;

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
          </div>
          ${video.vod_actor ? '<p class="detail-meta-line"><strong>演员：</strong>' + esc(video.vod_actor) + '</p>' : ''}
          ${video.vod_director ? '<p class="detail-meta-line"><strong>导演：</strong>' + esc(video.vod_director) + '</p>' : ''}
          <p class="desc">${esc(video.vod_content || video.vod_blurb) || '暂无简介'}</p>
        </div>
      </div>
      ${playSources.length > 0 ? `
        <div class="detail-section">
          <div class="source-tabs" id="sourceTabs">
            ${playSources.map((s, i) => `
              <div class="source-tab ${i === 0 ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">${esc(s.name)}</div>
            `).join('')}
          </div>
          <div class="play-list" id="detailPlayList"></div>
        </div>
      ` : '<div class="loading">暂无播放资源</div>'}
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
      if (item) onEpisodeClick(parseInt(item.dataset.episode));
    });
  }

  window.VideoDetailComponent = {
    renderVideoDetail,
    renderDetailEpisodeList
  };
})();
