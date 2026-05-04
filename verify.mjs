import fs from 'fs';
import { addIndicators } from './js/indicators.js';
import { StrategyEvaluator } from './js/strategy.js';
import { backtest } from './js/backtest.js';

const referenceData = JSON.parse(fs.readFileSync('reference_data.json', 'utf-8'));
const referenceResult = JSON.parse(fs.readFileSync('reference_result.json', 'utf-8'));

// Extract raw data (only the base columns)
const rawData = referenceData.map(row => ({
  date: row.date,
  open: row.open,
  close: row.close,
  high: row.high,
  low: row.low,
  vol: row.vol,
  turnover: row.turnover,
  amplitude: row.amplitude,
  change_percent: row.change_percent,
  change_amount: row.change_amount,
  turnover_rate: row.turnover_rate,
}));

console.log(`Loaded ${rawData.length} rows of reference data`);

// Run indicators
addIndicators(rawData, ['MA', 'MACD', 'RSI', 'VOLMA', 'KDJ', 'BOLL']);

// Compare some indicator values
const checkIndicators = ['MA5', 'MA10', 'MA20', 'MA60', 'DIF', 'DEA', 'MACD', 'RSI6', 'RSI12', 'RSI24', 'K', 'D', 'J', 'MB', 'UP', 'DN', 'ATR14', 'VolMA5', 'VolMA10', 'VolMA15', 'VolMA20'];
let indicatorMaxDiff = 0;
let indicatorMaxDiffName = '';
let indicatorMaxDiffIdx = -1;

for (const name of checkIndicators) {
  for (let i = 0; i < rawData.length; i++) {
    const jsVal = rawData[i][name];
    const pyVal = referenceData[i][name];
    if (jsVal === undefined || pyVal === undefined || pyVal === null) continue;
    const diff = Math.abs(jsVal - pyVal);
    if (diff > indicatorMaxDiff) {
      indicatorMaxDiff = diff;
      indicatorMaxDiffName = name;
      indicatorMaxDiffIdx = i;
    }
  }
}

console.log(`\nIndicator max diff: ${indicatorMaxDiff} (${indicatorMaxDiffName} at index ${indicatorMaxDiffIdx})`);

// Run backtest
const result = backtest(rawData,
  'K > D and J > 0 and close > MA20 and MA5 > MA10 and close > MA60',
  'K < D or close < MA10 or DIF < DEA'
);

// Compare equity curve
let equityMaxDiff = 0;
let equityMaxDiffIdx = -1;
for (let i = 0; i < result.data.length; i++) {
  const jsEquity = result.data[i].equity;
  const pyEquity = referenceData[i].equity;
  if (pyEquity === null) continue;
  const diff = Math.abs(jsEquity - pyEquity);
  if (diff > equityMaxDiff) {
    equityMaxDiff = diff;
    equityMaxDiffIdx = i;
  }
}

console.log(`\nEquity max diff: ${equityMaxDiff} at index ${equityMaxDiffIdx}`);
if (equityMaxDiffIdx >= 0) {
  console.log(`  JS equity: ${result.data[equityMaxDiffIdx].equity}`);
  console.log(`  PY equity: ${referenceData[equityMaxDiffIdx].equity}`);
}

// Compare statistics
const stats = ['total_return', 'annual_return', 'max_drawdown', 'trade_count', 'win_rate', 'profit_loss_ratio'];
console.log('\nStatistics comparison:');
for (const s of stats) {
  const jsVal = result[s];
  const pyVal = referenceResult[s];
  const diff = Math.abs(jsVal - pyVal);
  const ok = diff < 1e-9 || (s === 'profit_loss_ratio' && jsVal === Infinity && pyVal === 'inf');
  console.log(`  ${s}: JS=${jsVal}, PY=${pyVal}, diff=${diff} ${ok ? 'OK' : 'MISMATCH'}`);
}

// Compare trades
console.log(`\nTrades: JS=${result.trades.length}, PY=${referenceResult.trades.length}`);
const tradeCount = Math.min(result.trades.length, referenceResult.trades.length);
for (let i = 0; i < tradeCount; i++) {
  const jt = result.trades[i];
  const pt = referenceResult.trades[i];
  const diff = Math.abs(jt.return - pt.return);
  if (diff > 1e-9) {
    console.log(`  Trade ${i} mismatch: JS=${jt.return}, PY=${pt.return}`);
  }
}

// Check position signals
let posDiffCount = 0;
for (let i = 0; i < result.data.length; i++) {
  if (result.data[i].position !== referenceData[i].position) posDiffCount++;
}
console.log(`\nPosition mismatches: ${posDiffCount} / ${result.data.length}`);

// Summary
const allOk = indicatorMaxDiff < 1e-9 && equityMaxDiff < 1e-9 && posDiffCount === 0;
console.log(`\n${allOk ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}`);
