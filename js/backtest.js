import { StrategyEvaluator } from './strategy.js';

export function backtest(data, buyExpr, sellExpr, commission = 0.0003) {
  const evaluator = new StrategyEvaluator(data);
  const buySignal = evaluator.evalExpression(buyExpr);
  const sellSignal = evaluator.evalExpression(sellExpr);

  let position = 0;
  const positions = [];
  const trades = [];
  let entryPrice = null;
  let entryDate = null;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (position === 0 && buySignal[i]) {
      position = 1;
      entryPrice = row.close;
      entryDate = row.date;
    } else if (position === 1 && sellSignal[i]) {
      position = 0;
      const exitPrice = row.close;
      const ret = (exitPrice - entryPrice) / entryPrice - 2 * commission;
      trades.push({
        entry_date: entryDate,
        exit_date: row.date,
        entry_price: Math.round(entryPrice * 1000) / 1000,
        exit_price: Math.round(exitPrice * 1000) / 1000,
        return: Math.round(ret * 10000) / 10000,
      });
      entryPrice = null;
      entryDate = null;
    }
    positions.push(position);
  }

  // Attach computed columns
  for (let i = 0; i < data.length; i++) {
    data[i].position = positions[i];
    data[i].buy_signal = buySignal[i];
    data[i].sell_signal = sellSignal[i];
  }

  // Daily return
  data[0].daily_return = 0;
  for (let i = 1; i < data.length; i++) {
    data[i].daily_return = (data[i].close - data[i - 1].close) / data[i - 1].close;
  }

  // Strategy return: daily_return * prev_position - abs(position_diff) * commission
  for (let i = 0; i < data.length; i++) {
    const prevPos = i > 0 ? positions[i - 1] : 0;
    let sr = data[i].daily_return * prevPos;
    const posDiff = i > 0 ? Math.abs(positions[i] - positions[i - 1]) : 0;
    sr -= posDiff * commission;
    data[i].strategy_return = sr;
  }

  // Equity curve
  let equity = 1;
  let benchmark = 1;
  for (let i = 0; i < data.length; i++) {
    equity *= (1 + data[i].strategy_return);
    benchmark *= (1 + data[i].daily_return);
    data[i].equity = equity;
    data[i].benchmark = benchmark;
  }

  // Drawdown
  let maxEquity = 1;
  let maxDrawdown = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].equity > maxEquity) maxEquity = data[i].equity;
    const dd = data[i].equity / maxEquity - 1;
    if (dd < maxDrawdown) maxDrawdown = dd;
    data[i].drawdown = dd;
  }

  // Statistics
  const totalReturn = data[data.length - 1].equity - 1;
  const days = data.length;
  const annualReturn = days > 0 ? Math.pow(1 + totalReturn, 252 / days) - 1 : 0;

  const tradeCount = trades.length;
  const winTrades = trades.filter(t => t.return > 0);
  const lossTrades = trades.filter(t => t.return <= 0);
  const winRate = tradeCount > 0 ? winTrades.length / tradeCount : 0;

  const avgWin = winTrades.length > 0
    ? winTrades.reduce((s, t) => s + t.return, 0) / winTrades.length
    : 0;
  const avgLoss = lossTrades.length > 0
    ? Math.abs(lossTrades.reduce((s, t) => s + t.return, 0) / lossTrades.length)
    : 0;
  const plRatio = avgLoss > 0 ? avgWin / avgLoss : Infinity;

  return {
    total_return: totalReturn,
    annual_return: annualReturn,
    max_drawdown: maxDrawdown,
    trade_count: tradeCount,
    win_rate: winRate,
    profit_loss_ratio: plRatio,
    trades,
    data,
  };
}
