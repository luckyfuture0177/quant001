/**
 * Cloudflare Worker - 东方财富 API 代理
 *
 * 部署步骤:
 * 1. 登录 https://dash.cloudflare.com 注册账号
 * 2. 进入 Workers & Pages → 创建 Worker
 * 3. 复制本文件全部代码粘贴到编辑器
 * 4. 点击部署，获得 Worker 地址 (如 https://your-name.xxx.workers.dev)
 * 5. 在网页"代理地址"输入框填入该地址，点击保存
 */

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '*';

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 只处理 GET 请求
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    // 从查询参数获取目标 URL
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing "url" query parameter', { status: 400 });
    }

    // 验证目标域名，只允许东财 API
    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      return new Response('Invalid target URL', { status: 400 });
    }

    const allowedHosts = ['push2his.eastmoney.com', 'push2.eastmoney.com'];
    if (!allowedHosts.includes(target.host)) {
      return new Response('Target host not allowed', { status: 403 });
    }

    // 转发请求到东财 API，添加必要的请求头
    try {
      const proxyRequest = new Request(targetUrl, {
        method: 'GET',
        headers: {
          'Referer': 'https://emweb.securities.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const response = await fetch(proxyRequest);

      // 复制响应并添加 CORS 头
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', origin);
      newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, { status: 502 });
    }
  },
};
