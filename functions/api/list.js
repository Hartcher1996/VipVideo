import {
  getVideoList,
  searchVideos,
  getCategoryList,
} from '../_shared/videoService.mjs';

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

async function getParams(context) {
  const req = context.request;
  if (req.method === 'POST') {
    try {
      return (await req.json()) || {};
    } catch (e) {
      return {};
    }
  }
  const url = new URL(req.url);
  const obj = {};
  for (const [k, v] of url.searchParams.entries()) obj[k] = v;
  return obj;
}

async function handle(context) {
  const params = await getParams(context);
  const page = parseInt(params.pg) || 1;
  const keyword = params.wd || '';
  const ac = params.ac || '';

  try {
    if (ac === 'typelist') {
      const data = await getCategoryList();
      return json(data);
    }

    if (keyword) {
      const data = await searchVideos(keyword, page);
      return json(data);
    }

    const data = await getVideoList(page);
    return json(data);
  } catch (err) {
    console.error('API /list error:', err.message);
    return json(
      { code: 0, msg: '服务器错误: ' + err.message, list: [] },
      { status: 500 }
    );
  }
}

export async function onRequestGet(context) {
  return handle(context);
}

export async function onRequestPost(context) {
  return handle(context);
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
