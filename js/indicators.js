export function validateData(data) {
  const required = ['open', 'close', 'high', 'low', 'vol'];
  if (!data || data.length === 0) {
    throw new Error('数据为空');
  }
  const cols = Object.keys(data[0]);
  const missing = required.filter(c => !cols.includes(c));
  if (missing.length > 0) {
    throw new Error(`数据缺少必要列: ${missing.join(', ')}`);
  }
}

function rollingMeanArr(arr, window) {
  const out = new Array(arr.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= window) sum -= arr[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

function rollingStdArr(arr, window) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = window - 1; i < arr.length; i++) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) {
      sum += arr[j];
    }
    const mean = sum / window;
    let sumSqDiff = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const diff = arr[j] - mean;
      sumSqDiff += diff * diff;
    }
    out[i] = Math.sqrt(sumSqDiff / (window - 1));
  }
  return out;
}

function emaSeries(values, span) {
  const alpha = 2 / (span + 1);
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function ewmSeries(values, com) {
  const alpha = 1 / (1 + com);
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

export function addMA(data, windows = [5, 10, 20, 60]) {
  const closes = data.map(d => d.close);
  for (const w of windows) {
    const vals = rollingMeanArr(closes, w);
    for (let i = 0; i < data.length; i++) {
      data[i][`MA${w}`] = vals[i];
    }
  }
}

export function addEMA(data, windows = [12, 26]) {
  const closes = data.map(d => d.close);
  for (const w of windows) {
    const vals = emaSeries(closes, w);
    for (let i = 0; i < data.length; i++) {
      data[i][`EMA${w}`] = vals[i];
    }
  }
}

export function addMACD(data) {
  const closes = data.map(d => d.close);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const dif = ema12.map((v, i) => v - ema26[i]);
  const dea = emaSeries(dif, 9);
  for (let i = 0; i < data.length; i++) {
    data[i].DIF = dif[i];
    data[i].DEA = dea[i];
    data[i].MACD = (dif[i] - dea[i]) * 2;
  }
}

export function addRSI(data, windows = [6, 12, 24]) {
  const closes = data.map(d => d.close);
  const deltas = new Array(closes.length);
  deltas[0] = 0;
  for (let i = 1; i < closes.length; i++) {
    deltas[i] = closes[i] - closes[i - 1];
  }

  for (const w of windows) {
    const rsi = new Array(data.length).fill(NaN);
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - w + 1);
      const count = i - start + 1;
      let gainSum = 0, lossSum = 0;
      for (let j = start; j <= i; j++) {
        gainSum += Math.max(deltas[j], 0);
        lossSum += Math.max(-deltas[j], 0);
      }
      const avgGain = gainSum / count;
      const avgLoss = lossSum / count;
      if (avgLoss === 0) {
        rsi[i] = avgGain === 0 ? NaN : 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    }
    for (let i = 0; i < data.length; i++) {
      data[i][`RSI${w}`] = rsi[i];
    }
  }
}

export function addKDJ(data, n = 9, m1 = 3, m2 = 3) {
  const rsv = new Array(data.length).fill(NaN);
  for (let i = n - 1; i < data.length; i++) {
    let minL = Infinity, maxH = -Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      minL = Math.min(minL, data[j].low);
      maxH = Math.max(maxH, data[j].high);
    }
    const range = maxH - minL;
    rsv[i] = range === 0 ? 50 : (data[i].close - minL) / range * 100;
  }

  const validRsv = rsv.slice(n - 1);
  const kVals = ewmSeries(validRsv, m1 - 1);
  const dVals = ewmSeries(kVals, m2 - 1);

  for (let i = 0; i < data.length; i++) {
    if (i < n - 1) {
      data[i].K = NaN;
      data[i].D = NaN;
      data[i].J = NaN;
    } else {
      const idx = i - (n - 1);
      data[i].K = kVals[idx];
      data[i].D = dVals[idx];
      data[i].J = 3 * kVals[idx] - 2 * dVals[idx];
    }
  }
}

export function addBOLL(data, n = 20, k = 2) {
  const closes = data.map(d => d.close);
  const mb = rollingMeanArr(closes, n);
  const std = rollingStdArr(closes, n);
  for (let i = 0; i < data.length; i++) {
    data[i].MB = mb[i];
    data[i].UP = mb[i] + k * std[i];
    data[i].DN = mb[i] - k * std[i];
  }
}

export function addATR(data, n = 14) {
  const tr = new Array(data.length);
  tr[0] = data[0].high - data[0].low;
  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].close;
    tr[i] = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - prevClose),
      Math.abs(data[i].low - prevClose)
    );
  }
  const atr = rollingMeanArr(tr, n);
  for (let i = 0; i < data.length; i++) {
    data[i][`ATR${n}`] = atr[i];
  }
}

export function addVolMA(data, windows = [5, 10, 15, 20]) {
  const vols = data.map(d => d.vol);
  for (const w of windows) {
    const vals = rollingMeanArr(vols, w);
    for (let i = 0; i < data.length; i++) {
      data[i][`VolMA${w}`] = vals[i];
    }
  }
}

export const INDICATOR_MAP = {
  MA: addMA,
  EMA: addEMA,
  MACD: addMACD,
  RSI: addRSI,
  KDJ: addKDJ,
  BOLL: addBOLL,
  ATR: addATR,
  VOLMA: addVolMA,
};

export function addIndicators(data, indicators = null) {
  validateData(data);
  const names = indicators || Object.keys(INDICATOR_MAP);
  for (const name of names) {
    const key = name.toUpperCase();
    const fn = INDICATOR_MAP[key];
    if (!fn) {
      throw new Error(`不支持的指标: ${name}。支持的指标: ${Object.keys(INDICATOR_MAP).join(', ')}`);
    }
    fn(data);
  }
}
