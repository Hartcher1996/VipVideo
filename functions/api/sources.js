import { getEnabledSources } from '../_shared/videoService.mjs';

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

async function handleSources() {
  const enabledSources = getEnabledSources();
  return json({
    code: 1,
    sources: enabledSources.map((s) => ({
      id: s.id,
      name: s.name,
      priority: s.priority,
    })),
  });
}

export async function onRequestGet() {
  return handleSources();
}

export async function onRequestPost() {
  return handleSources();
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
