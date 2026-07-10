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
  btnHistory: document.getElementById('btn-history'),
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
  historyModal: document.getElementById('history-modal'),
  historyList: document.getElementById('history-list'),
  historyEmpty: document.getElementById('history-empty'),
  btnCloseHistory: document.getElementById('btn-close-history'),
  btnClearHistory: document.getElementById('btn-clear-history'),
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

const HISTORY_KEY = 'backtest_history';
const MAX_HISTORY = 50;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function addHistoryRecord(stockCode, buyExpr, sellExpr) {
  if (!stockCode || !buyExpr || !sellExpr) return;
  const history = loadHistory();
  // 去重：相同代码+策略移到最前并更新时间
  const existingIndex = history.findIndex(
    h => h.stockCode === stockCode && h.buyExpr === buyExpr && h.sellExpr === sellExpr
  );
  if (existingIndex >= 0) {
    history.splice(existingIndex, 1);
  }
  history.unshift({
    stockCode,
    buyExpr,
    sellExpr,
    timestamp: Date.now(),
  });
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }
  saveHistory(history);
}

function deleteHistoryRecord(index) {
  const history = loadHistory();
  history.splice(index, 1);
  saveHistory(history);
  renderHistory();
}

function clearHistory() {
  if (!confirm('确定要清空全部历史记录吗？')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function applyHistoryRecord(record) {
  els.stockCode.value = record.stockCode;
  els.buyExpr.value = record.buyExpr;
  els.sellExpr.value = record.sellExpr;
  hideHistoryModal();
  // 触发一次数据获取准备
  if (record.stockCode) {
    els.btnRun.disabled = true;
  }
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderHistory() {
  const history = loadHistory();
  els.historyList.innerHTML = '';
  if (history.length === 0) {
    els.historyEmpty.classList.remove('hidden');
    els.btnClearHistory.disabled = true;
    return;
  }
  els.historyEmpty.classList.add('hidden');
  els.btnClearHistory.disabled = false;

  history.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="history-info">
        <div class="history-code">${escapeHtml(item.stockCode)}</div>
        <div class="history-expr">买: ${escapeHtml(item.buyExpr)}</div>
        <div class="history-expr">卖: ${escapeHtml(item.sellExpr)}</div>
        <div class="history-time">${formatTime(item.timestamp)}</div>
      </div>
      <div class="history-actions">
        <button class="btn-apply" data-index="${index}" type="button">应用</button>
        <button class="btn-delete" data-index="${index}" type="button">删除</button>
      </div>
    `;
    els.historyList.appendChild(li);
  });

  // 绑定应用/删除按钮
  els.historyList.querySelectorAll('.btn-apply').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      applyHistoryRecord(loadHistory()[idx]);
    });
  });
  els.historyList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      deleteHistoryRecord(idx);
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showHistoryModal() {
  renderHistory();
  els.historyModal.classList.remove('hidden');
}

function hideHistoryModal() {
  els.historyModal.classList.add('hidden');
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

  // 保存到历史记录
  addHistoryRecord(els.stockCode.value.trim(), buyExpr, sellExpr);

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
els.btnHistory.addEventListener('click', showHistoryModal);
els.btnCloseHistory.addEventListener('click', hideHistoryModal);
els.btnClearHistory.addEventListener('click', clearHistory);

// 点击遮罩关闭弹窗
els.historyModal.querySelector('.modal-overlay').addEventListener('click', hideHistoryModal);

// Enter key on inputs
els.stockCode.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleFetch();
});

// Resize chart on window resize
window.addEventListener('resize', resizeChart);

// Initialize chart container size
initChart('main-chart');
