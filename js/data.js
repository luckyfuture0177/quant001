const BASE_URL = 'http://push2his.eastmoney.com/api/qt/stock/kline/get';
const FIELDS = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116';

export function autoPrefix(code) {
  const c = String(code).trim();
  // 上海: 6xxx(股票), 5xx(ETF), 11x(可转债)
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
  const url = buildUrl(secid, beg, end, fqt);

  // Attempt 1: direct fetch
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return parseKlines(data);
  } catch (fetchErr) {
    console.warn('Direct fetch blocked by CORS, trying JSONP...', fetchErr);
  }

  // Attempt 2: JSONP
  try {
    const data = await fetchJsonp(url);
    return parseKlines(data);
  } catch (jsonpErr) {
    console.warn('JSONP also failed:', jsonpErr);
  }

  // Both failed
  const err = new Error(
    '无法访问东方财富API（CORS限制）。\n'
    + '解决方案：\n'
    + '1. 安装浏览器 CORS 扩展（如 "CORS Unblock"）并刷新页面；\n'
    + '2. 使用本地代理：npx local-cors-proxy --proxyUrl http://push2his.eastmoney.com\n'
    + '   然后设置代理地址为 http://localhost:8010/proxy；\n'
    + '3. 开发模式启动浏览器（仅开发测试）：\n'
    + '   chrome --disable-web-security --user-data-dir=%TEMP%\\chrome_dev'
  );
  err.name = 'CorsBlockedError';
  throw err;
}
