class AppleCMSAdapter {
  normalizeList(raw, sourceId) {
    if (!raw || raw.code !== 1 || !raw.list) {
      return { list: [], page: 1, pagecount: 1, total: 0 };
    }
    return {
      list: raw.list.map(item => this.normalizeVideo(item, sourceId)),
      page: parseInt(raw.page) || 1,
      pagecount: parseInt(raw.pagecount) || 1,
      total: parseInt(raw.total) || 0,
    };
  }

  normalizeDetail(raw, sourceId) {
    if (!raw || raw.code !== 1 || !raw.list || raw.list.length === 0) {
      return null;
    }
    return this.normalizeVideo(raw.list[0], sourceId, true);
  }

  normalizeVideo(item, sourceId, withDetail = false) {
    const video = {
      id: item.vod_id,
      sourceId: sourceId,
      name: item.vod_name || '',
      sub: item.vod_sub || '',
      en: item.vod_en || '',
      pic: item.vod_pic || '',
      picThumb: item.vod_pic_thumb || '',
      typeId: item.type_id,
      typeId1: item.type_id_1,
      typeName: item.type_name || '',
      letter: item.vod_letter || '',
      year: item.vod_year || '',
      area: item.vod_area || '',
      remarks: item.vod_remarks || '',
    };

    if (withDetail) {
      video.actor = item.vod_actor || '';
      video.director = item.vod_director || '';
      video.content = item.vod_content || item.vod_blurb || '';
      video.playFrom = item.vod_play_from || '';
      video.playUrl = item.vod_play_url || '';
      video.playSources = this.parsePlaySources(item.vod_play_from, item.vod_play_url);
    }

    return video;
  }

  parsePlaySources(playFrom, playUrl) {
    if (!playFrom || !playUrl) return [];

    const sources = playFrom.split('$$$');
    const urls = playUrl.split('$$$');
    const result = [];

    sources.forEach((source, index) => {
      if (!urls[index]) return;

      const episodes = urls[index].split('#').map(item => {
        const parts = item.split('$');
        return {
          name: parts[0] || '',
          url: parts[1] || '',
        };
      }).filter(ep => ep.name && ep.url);

      if (episodes.length > 0) {
        result.push({
          name: source || ('播放源' + (index + 1)),
          episodes: episodes,
        });
      }
    });

    return result;
  }
}

module.exports = new AppleCMSAdapter();
