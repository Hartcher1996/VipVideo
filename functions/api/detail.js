import { getVideoDetail } from '../_shared/videoService.mjs';

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
  const id = params.ids;
  const source = params.source || '';

  if (!id) {
    return json({ code: 0, msg: '缺少视频ID', list: [] });
  }

  try {
    const data = await getVideoDetail(id, source);
    return json(data);
  } catch (err) {
    console.error('API /detail error:', err.message);
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
