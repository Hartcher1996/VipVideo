// 官方线路解析代理
// 前端 iframe 加载 /api/parse?url=xxx，本端点 302 重定向到解析站
// 解析站会返回完整的播放 HTML（包含 m3u8 或 iframe 嵌入播放器）

// 备选解析 API 列表（按优先级，前一个失败自动切换后一个）
const PARSERS = [
  'https://jx.xmflv.cc/?url=',
  'https://jx.parwix.com:4433/?url=',
  'https://jx.bozai.cc/?url=',
];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  // 查询可用解析 API 列表：/api/parse?list=1
  if (url.searchParams.get('list') === '1' || url.searchParams.get('action') === 'list') {
    return new Response(
      JSON.stringify({
        code: 1,
        parsers: PARSERS.map((p, i) => ({
          id: `parser_${i}`,
          url: p,
          name: new URL(p).hostname,
        })),
      }),
      { headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  const target = url.searchParams.get('url');

  if (!target) {
    return new Response(
      JSON.stringify({ code: 0, msg: '缺少 url 参数' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  // 简单 URL 合法性校验
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    return new Response(
      JSON.stringify({ code: 0, msg: 'url 参数不合法' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  // 只允许官方平台 URL 走解析，防止滥用代理其他内容
  const officialPattern =
    /v\.qq\.com\/x\/cover|iqiyi\.com\/v_|youku\.com\/v_show|mgtv\.com\/b|bilibili\.com\/bangumi|sohu\.com|tv\.sohu\.com|le\.com\/ptv|vip\.1905\.com|pptv\.com/i;

  if (!officialPattern.test(targetUrl.href)) {
    return new Response(
      JSON.stringify({
        code: 0,
        msg: '仅支持官方平台 URL（腾讯/爱奇艺/优酷/芒果/B站等）',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  // 302 重定向到首选解析 API
  // 前端 iframe 会跟随重定向加载解析站返回的播放页面
  const parserUrl = PARSERS[0] + encodeURIComponent(targetUrl.href);

  console.log(`[parse] 代理: ${targetUrl.href} → ${PARSERS[0]}...`);

  return Response.redirect(parserUrl, 302);
}

export async function onRequestPost(context) {
  return onRequestGet(context);
}
