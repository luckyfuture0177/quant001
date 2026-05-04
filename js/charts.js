let chartInstance = null;

export function initChart(domId) {
  const dom = document.getElementById(domId);
  if (!dom) return null;
  if (chartInstance) {
    chartInstance.dispose();
  }
  chartInstance = echarts.init(dom);
  return chartInstance;
}

export function renderChart(data, trades) {
  if (!chartInstance) return;

  const dates = data.map(d => d.date);
  const hasMA = data.some(d => !Number.isNaN(d.MA5));
  const hasBOLL = data.some(d => !Number.isNaN(d.MB));
  const hasMACD = data.some(d => !Number.isNaN(d.MACD));
  const hasVolMA = data.some(d => !Number.isNaN(d.VolMA5));

  // Candlestick: [open, close, low, high]
  const klineData = data.map(d => [d.open, d.close, d.low, d.high]);

  // Volume with color
  const volData = data.map((d, i) => ({
    value: d.vol,
    itemStyle: {
      color: d.close >= d.open ? '#ef232a' : '#14b143'
    }
  }));

  // Buy/sell markers on price chart
  const buyPricePoints = [];
  const sellPricePoints = [];
  const buyEquityPoints = [];
  const sellEquityPoints = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i].position === 1 && data[i - 1].position === 0) {
      buyPricePoints.push([data[i].date, data[i].low * 0.98]);
      buyEquityPoints.push([data[i].date, data[i].equity]);
    }
    if (data[i].position === 0 && data[i - 1].position === 1) {
      sellPricePoints.push([data[i].date, data[i].high * 1.02]);
      sellEquityPoints.push([data[i].date, data[i].equity]);
    }
  }

  const series = [];

  // Grid 0: K-line
  series.push({
    name: 'K线',
    type: 'candlestick',
    data: klineData,
    itemStyle: {
      color: '#ef232a',
      color0: '#14b143',
      borderColor: '#ef232a',
      borderColor0: '#14b143'
    }
  });

  // Grid 0: MA lines
  if (hasMA) {
    series.push(
      { name: 'MA5', type: 'line', data: data.map(d => d.MA5), smooth: false, lineStyle: { opacity: 0.7, width: 1 }, symbol: 'none' },
      { name: 'MA10', type: 'line', data: data.map(d => d.MA10), smooth: false, lineStyle: { opacity: 0.7, width: 1 }, symbol: 'none' },
      { name: 'MA20', type: 'line', data: data.map(d => d.MA20), smooth: false, lineStyle: { opacity: 0.7, width: 1 }, symbol: 'none' },
      { name: 'MA60', type: 'line', data: data.map(d => d.MA60), smooth: false, lineStyle: { opacity: 0.7, width: 1 }, symbol: 'none' }
    );
  }

  // Grid 0: BOLL
  if (hasBOLL) {
    series.push(
      { name: 'UP', type: 'line', data: data.map(d => d.UP), smooth: false, lineStyle: { opacity: 0.5, width: 1, type: 'dashed' }, symbol: 'none' },
      { name: 'MB', type: 'line', data: data.map(d => d.MB), smooth: false, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none' },
      { name: 'DN', type: 'line', data: data.map(d => d.DN), smooth: false, lineStyle: { opacity: 0.5, width: 1, type: 'dashed' }, symbol: 'none' }
    );
  }

  // Grid 0: Buy/Sell markers on price
  series.push(
    { name: '买入', type: 'scatter', data: buyPricePoints, symbol: 'triangle', symbolSize: 14, itemStyle: { color: '#ff0000' }, z: 10 },
    { name: '卖出', type: 'scatter', data: sellPricePoints, symbol: 'triangle', symbolSize: 14, symbolRotate: 180, itemStyle: { color: '#00aa00' }, z: 10 }
  );

  // Grid 1: Volume
  series.push({
    name: '成交量',
    type: 'bar',
    xAxisIndex: 1,
    yAxisIndex: 1,
    data: volData,
  });

  if (hasVolMA) {
    series.push(
      { name: 'VolMA5', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: data.map(d => d.VolMA5), smooth: false, lineStyle: { opacity: 0.7, width: 1 }, symbol: 'none' },
      { name: 'VolMA10', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: data.map(d => d.VolMA10), smooth: false, lineStyle: { opacity: 0.7, width: 1 }, symbol: 'none' }
    );
  }

  // Grid 2: Equity
  series.push(
    { name: '策略净值', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: data.map(d => d.equity), lineStyle: { color: '#1f77b4', width: 2 }, symbol: 'none' },
    { name: '买入持有', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: data.map(d => d.benchmark), lineStyle: { color: '#999999', type: 'dashed', width: 1 }, symbol: 'none' }
  );

  // Grid 2: Drawdown area
  series.push({
    name: '回撤',
    type: 'line',
    xAxisIndex: 2,
    yAxisIndex: 2,
    data: data.map(d => d.drawdown),
    areaStyle: { color: 'rgba(255, 0, 0, 0.2)' },
    lineStyle: { color: '#ff4444', width: 1 },
    symbol: 'none'
  });

  // Grid 2: Buy/Sell on equity
  series.push(
    { name: '买入(净值)', type: 'scatter', xAxisIndex: 2, yAxisIndex: 2, data: buyEquityPoints, symbol: 'triangle', symbolSize: 10, itemStyle: { color: '#ff0000' }, z: 10 },
    { name: '卖出(净值)', type: 'scatter', xAxisIndex: 2, yAxisIndex: 2, data: sellEquityPoints, symbol: 'triangle', symbolSize: 10, symbolRotate: 180, itemStyle: { color: '#00aa00' }, z: 10 }
  );

  const option = {
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ccc',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter: function (params) {
        if (!params || params.length === 0) return '';
        const idx = params[0].dataIndex;
        const row = data[idx];
        if (!row) return '';

        let html = `<div style="font-weight:bold;margin-bottom:4px;">${row.date}</div>`;
        html += `<div>开: ${row.open} &nbsp; 收: <b>${row.close}</b> &nbsp; 高: ${row.high} &nbsp; 低: ${row.low}</div>`;
        html += `<div>成交量: ${row.vol.toLocaleString()} &nbsp; 换手: ${row.turnover_rate}% &nbsp; 振幅: ${row.amplitude}%</div>`;

        if (!Number.isNaN(row.MA5)) {
          html += `<div>MA5: ${fmt(row.MA5)} &nbsp; MA10: ${fmt(row.MA10)} &nbsp; MA20: ${fmt(row.MA20)} &nbsp; MA60: ${fmt(row.MA60)}</div>`;
        }
        if (!Number.isNaN(row.DIF)) {
          html += `<div>DIF: ${fmt(row.DIF)} &nbsp; DEA: ${fmt(row.DEA)} &nbsp; MACD: ${fmt(row.MACD)}</div>`;
        }
        if (!Number.isNaN(row.K)) {
          html += `<div>K: ${fmt(row.K)} &nbsp; D: ${fmt(row.D)} &nbsp; J: ${fmt(row.J)}</div>`;
        }
        if (!Number.isNaN(row.RSI6)) {
          html += `<div>RSI6: ${fmt(row.RSI6)} &nbsp; RSI12: ${fmt(row.RSI12)} &nbsp; RSI24: ${fmt(row.RSI24)}</div>`;
        }
        if (!Number.isNaN(row.MB)) {
          html += `<div>BOLL: UP ${fmt(row.UP)} &nbsp; MB ${fmt(row.MB)} &nbsp; DN ${fmt(row.DN)}</div>`;
        }

        html += `<div style="margin-top:4px;border-top:1px solid #eee;padding-top:4px;">`;
        html += `净值: <b>${fmt(row.equity)}</b> &nbsp; 基准: ${fmt(row.benchmark)} &nbsp; 回撤: ${(row.drawdown * 100).toFixed(2)}%`;
        html += `</div>`;

        if (row.position === 1) {
          html += `<div style="color:#ff0000;">持仓中</div>`;
        }
        return html;
      }
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }]
    },
    grid: [
      { left: '60', right: '60', top: '40', height: '48%' },
      { left: '60', right: '60', top: '62%', height: '12%' },
      { left: '60', right: '60', top: '78%', height: '16%' }
    ],
    xAxis: [
      { type: 'category', data: dates, scale: true, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false }, min: 'dataMin', max: 'dataMax', axisLabel: { show: true } },
      { type: 'category', gridIndex: 1, data: dates, scale: true, boundaryGap: false, axisLine: { onZero: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, min: 'dataMin', max: 'dataMax' },
      { type: 'category', gridIndex: 2, data: dates, scale: true, boundaryGap: false, axisLine: { onZero: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, min: 'dataMin', max: 'dataMax' }
    ],
    yAxis: [
      { scale: true, splitArea: { show: true } },
      { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
      { scale: true, gridIndex: 2, splitNumber: 3, axisLabel: { formatter: '{value}x' } }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: 0, end: 100 },
      { show: true, xAxisIndex: [0, 1, 2], type: 'slider', top: '96%', start: 0, end: 100, height: 20 }
    ],
    legend: {
      top: 10,
      data: ['K线', 'MA5', 'MA10', 'MA20', 'MA60', 'UP', 'MB', 'DN', '买入', '卖出', '成交量', 'VolMA5', 'VolMA10', '策略净值', '买入持有', '回撤', '买入(净值)', '卖出(净值)'],
      selected: {
        'MA5': true, 'MA10': true, 'MA20': true, 'MA60': false,
        'UP': false, 'MB': false, 'DN': false,
        'VolMA5': false, 'VolMA10': false,
        '回撤': false,
        '买入(净值)': false, '卖出(净值)': false
      }
    },
    series: series
  };

  chartInstance.setOption(option, true);
}

function fmt(v) {
  if (v === undefined || v === null || Number.isNaN(v)) return '-';
  return typeof v === 'number' ? v.toFixed(3) : String(v);
}

export function resizeChart() {
  if (chartInstance) chartInstance.resize();
}
