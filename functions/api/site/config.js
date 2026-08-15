import siteConfig from '../../_shared/config/site.config.mjs';

function json(data, init = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...(init.headers || {}),
  };
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function onRequestGet() {
  return json({
    code: 1,
    siteName: siteConfig.siteName,
    siteSlogan: siteConfig.siteSlogan,
    heroTitle: siteConfig.heroTitle,
    searchPlaceholder: siteConfig.searchPlaceholder,
    hotKeywords: Array.isArray(siteConfig.hotKeywords) ? siteConfig.hotKeywords : [],
    defaultWideScreen: !!siteConfig.defaultWideScreen,
    stats: Array.isArray(siteConfig.stats) ? siteConfig.stats : [],
    footer: siteConfig.footer,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
