import { fetchKlines, setProxyUrl, getProxyUrl } from './data.js';
import { addIndicators } from './indicators.js';
import { backtest } from './backtest.js';
import { initChart, renderChart, resizeChart } from './charts.js';

let rawData = null;

const els = {
  stockCode: document.getElementById('stock-code'),
  startDate: document.getElementById('start-date'),
  endDate: document.getElementById('end-date'),
  fqt: document.getElementById('fqt'),
  btnFetch: document.getElementById('btn-fetch'),
  btnRun: document.getElementById('btn-run'),
  buyExpr: document.getElementById('buy-expr'),
  sellExpr: document.getElementById('sell-expr'),
  indChecks: document.querySelectorAll('.ind-check'),
  status: document.getElementById('status'),
  corsBanner: document.getElementById('cors-banner'),
  proxyUrl: document.getElementById('proxy-url'),
  btnSaveProxy: document.getElementById('btn-save-proxy'),
  proxyStatus: document.getElementById('proxy-status'),
  statsPanel: document.getElementById('stats-panel'),
  statTotal: document.getElementById('stat-total'),
  statAnnual: document.getElementById('stat-annual'),
  statMdd: document.getElementById('stat-mdd'),
  statTrades: document.getElementById('stat-trades'),
  statWin: document.getElementById('stat-win'),
  statPl: document.getElementById('stat-pl'),
  tradesTbody: document.querySelector('#trades-table tbody'),
  syntaxToggle: document.getElementById('syntax-toggle'),
  syntaxContent: document.getElementById('syntax-content'),
};

// Load proxy URL from localStorage
const savedProxy = localStorage.getItem('backtest_proxy_url') || '';
if (savedProxy) {
  els.proxyUrl.value = savedProxy;
  setProxyUrl(savedProxy);
  els.proxyStatus.textContent = '已启用代理';
}

function setStatus(msg) {
  els.status.textContent = msg;
}

function showCorsError(msg) {
  els.corsBanner.textContent = msg;
  els.corsBanner.classList.remove('hidden');
}

function hideCorsError() {
  els.corsBanner.classList.add('hidden');
}

function fmtDate(d) {
  return d.replace(/-/g, '');
}

function fmtPct(v) {
  if (!isFinite(v)) return '∞';
  return (v * 100).toFixed(2) + '%';
}

function fmtRatio(v) {
  if (!isFinite(v)) return '∞';
  return v.toFixed(2);
}

async function handleFetch() {
  hideCorsError();
  const code = els.stockCode.value.trim();
  if (!code) {
    alert('请输入股票代码');
    return;
  }

  const beg = fmtDate(els.startDate.value);
  const end = fmtDate(els.endDate.value);
  const fqt = els.fqt.value;

  els.btnFetch.disabled = true;
  els.btnRun.disabled = true;
  setStatus('正在获取数据...');

  try {
    rawData = await fetchKlines(code, beg, end, parseInt(fqt, 10));
    if (!rawData || rawData.length === 0) {
      setStatus('未获取到数据');
      return;
    }
    setStatus(`数据获取完成，共 ${rawData.length} 条记录`);
    els.btnRun.disabled = false;
  } catch (err) {
    console.error(err);
    if (err.name === 'CorsBlockedError' || err.message.includes('CORS')) {
      showCorsError(err.message);
    } else {
      alert('获取数据失败: ' + err.message);
    }
    setStatus('数据获取失败');
  } finally {
    els.btnFetch.disabled = false;
  }
}

function getSelectedIndicators() {
  return Array.from(els.indChecks)
    .filter(cb => cb.checked)
    .map(cb => cb.value);
}

function handleRun() {
  if (!rawData || rawData.length === 0) {
    alert('请先获取数据');
    return;
  }

  const buyExpr = els.buyExpr.value.trim();
  const sellExpr = els.sellExpr.value.trim();
  if (!buyExpr || !sellExpr) {
    alert('请输入买入和卖出策略表达式');
    return;
  }

  // Deep clone rawData so we can re-run with different expressions
  const data = rawData.map(d => ({ ...d }));

  // Add selected indicators
  const indicators = getSelectedIndicators();
  try {
    addIndicators(data, indicators);
  } catch (err) {
    alert('指标计算失败: ' + err.message);
    return;
  }

  // Run backtest
  let result;
  try {
    result = backtest(data, buyExpr, sellExpr);
  } catch (err) {
    alert('回测失败: ' + err.message);
    return;
  }

  // Update stats
  els.statsPanel.classList.remove('hidden');
  els.statTotal.textContent = fmtPct(result.total_return);
  els.statTotal.style.color = result.total_return >= 0 ? '#ef232a' : '#14b143';
  els.statAnnual.textContent = fmtPct(result.annual_return);
  els.statAnnual.style.color = result.annual_return >= 0 ? '#ef232a' : '#14b143';
  els.statMdd.textContent = fmtPct(result.max_drawdown);
  els.statMdd.style.color = '#333';
  els.statTrades.textContent = String(result.trade_count);
  els.statWin.textContent = fmtPct(result.win_rate);
  els.statPl.textContent = fmtRatio(result.profit_loss_ratio);

  // Update trades table
  els.tradesTbody.innerHTML = '';
  if (result.trades.length === 0) {
    els.tradesTbody.innerHTML = '<tr><td colspan="6">无交易记录</td></tr>';
  } else {
    result.trades.forEach((t, i) => {
      const tr = document.createElement('tr');
      const cls = t.return > 0 ? 'positive' : 'negative';
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${t.entry_date}</td>
        <td>${t.entry_price}</td>
        <td>${t.exit_date}</td>
        <td>${t.exit_price}</td>
        <td class="${cls}">${(t.return * 100).toFixed(2)}%</td>
      `;
      els.tradesTbody.appendChild(tr);
    });
  }

  // Render chart
  initChart('main-chart');
  renderChart(result.data, result.trades);
}

// Syntax reference toggle
els.syntaxToggle.addEventListener('click', () => {
  els.syntaxContent.classList.toggle('open');
  els.syntaxToggle.classList.toggle('open');
});

// Proxy URL save handler
els.btnSaveProxy.addEventListener('click', () => {
  const url = els.proxyUrl.value.trim();
  if (url) {
    setProxyUrl(url);
    localStorage.setItem('backtest_proxy_url', url);
    els.proxyStatus.textContent = '已保存并启用代理';
    hideCorsError();
  } else {
    setProxyUrl('');
    localStorage.removeItem('backtest_proxy_url');
    els.proxyStatus.textContent = '已清除代理设置';
  }
});

// Event bindings
els.btnFetch.addEventListener('click', handleFetch);
els.btnRun.addEventListener('click', handleRun);

// Enter key on inputs
els.stockCode.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleFetch();
});

// Resize chart on window resize
window.addEventListener('resize', resizeChart);

// Initialize chart container size
initChart('main-chart');
