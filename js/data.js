const BASE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const FIELDS = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116';

let PROXY_URL = '';

export function setProxyUrl(url) {
  PROXY_URL = url ? url.replace(/\/$/, '') : '';
}

export function getProxyUrl() {
  return PROXY_URL;
}

export function autoPrefix(code) {
  const c = String(code).trim();
  if (c.startsWith('6') || c.startsWith('5') || c.startsWith('11')) {
    return `1.${c}`;
  }
  return `0.${c}`;
}

function buildUrl(secid, beg, end, fqt = 1, klt = 101) {
  return `${BASE_URL}?fields1=f1,f2,f3,f4,f5,f6`
    + `&fields2=${FIELDS}`
    + `&ut=7eea3edcaed734bea9cbfc24409ed989`
    + `&klt=${klt}&fqt=${fqt}&secid=${secid}&beg=${beg}&end=${end}`;
}

function round3(v) {
  return Math.round(parseFloat(v) * 1000) / 1000;
}

function round2(v) {
  return Math.round(parseFloat(v) * 100) / 100;
}

export function parseKlines(response) {
  const klines = response?.data?.klines || [];
  return klines.map(line => {
    const v = line.split(',');
    return {
      date: v[0],
      open: round3(v[1]),
      close: round3(v[2]),
      high: round3(v[3]),
      low: round3(v[4]),
      vol: parseInt(v[5], 10),
      turnover: parseFloat(v[6]),
      amplitude: round2(v[7]),
      change_percent: round2(v[8]),
      change_amount: round3(v[9]),
      turnover_rate: round2(v[10]),
    };
  });
}

export async function fetchKlines(stockCode, beg, end, fqt = 1) {
  const secid = autoPrefix(stockCode);
  const targetUrl = buildUrl(secid, beg, end, fqt);

  // 如果配置了代理，直接通过代理请求
  if (PROXY_URL) {
    const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(targetUrl)}`;
    try {
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`代理返回 HTTP ${resp.status}`);
      const data = await resp.json();
      return parseKlines(data);
    } catch (err) {
      const wrapped = new Error(
        `代理请求失败: ${err.message}\n`
        + `请检查代理地址是否正确: ${PROXY_URL}\n`
        + `或暂时切换到本地开发环境使用。`
      );
      wrapped.name = 'ProxyError';
      throw wrapped;
    }
  }

  // 未配置代理：先尝试直接 fetch，再尝试 JSONP
  try {
    const resp = await fetch(targetUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return parseKlines(data);
  } catch (fetchErr) {
    console.warn('Direct fetch blocked by CORS, trying JSONP...', fetchErr);
  }

  try {
    const data = await fetchJsonp(targetUrl);
    return parseKlines(data);
  } catch (jsonpErr) {
    console.warn('JSONP also failed:', jsonpErr);
  }

  // 全部失败
  const err = new Error(
    '无法访问东方财富API（CORS / 混合内容限制）。\n'
    + '当前为 HTTPS 线上部署，浏览器禁止直接访问 HTTP API。\n'
    + '请在上方"代理地址"输入框填入 Cloudflare Worker 地址，点击保存后重试。\n'
    + '部署步骤见 DEPLOY.md 文档。'
  );
  err.name = 'CorsBlockedError';
  throw err;
}

function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const cbName = 'em_kline_cb_' + Date.now();
    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}cb=${cbName}`;
    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP 请求失败'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP 请求超时'));
    }, 15000);
    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    document.head.appendChild(script);
  });
}
