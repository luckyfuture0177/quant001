import json
import pandas as pd
import numpy as np
import stockdata
from indicators import add_indicators
from strategy import StrategyEvaluator

# Fetch data
df = stockdata.get_stockdata_byeast(
    stockid='1.600089',
    begdate='20210101',
    enddate='20240924',
    fqt=1,
    klt=101,
)

# Rename columns
df.columns = [
    'date', 'open', 'close', 'high', 'low',
    'vol', 'turnover', 'amplitude',
    'change_percent', 'change_amount', 'turnover_rate',
]
df['date'] = pd.to_datetime(df['date'])
df.set_index('date', inplace=True)
df.sort_index(inplace=True)

# Add indicators
add_indicators(df, ['MA', 'MACD', 'RSI', 'VOLMA', 'KDJ', 'BOLL'])

# Evaluate strategy
evaluator = StrategyEvaluator(df)
buy_signal = evaluator.eval_expression('K > D and J > 0 and close > MA20 and MA5 > MA10 and close > MA60')
sell_signal = evaluator.eval_expression('K < D or close < MA10 or DIF < DEA')

# Backtest state machine
position = 0
positions = []
trades = []
entry_price = None
entry_date = None

for date, row in df.iterrows():
    if position == 0 and buy_signal.loc[date]:
        position = 1
        entry_price = row['close']
        entry_date = date
    elif position == 1 and sell_signal.loc[date]:
        position = 0
        exit_price = row['close']
        ret = (exit_price - entry_price) / entry_price - 2 * 0.0003
        trades.append({
            'entry_date': str(entry_date)[:10],
            'exit_date': str(date)[:10],
            'entry_price': round(entry_price, 3),
            'exit_price': round(exit_price, 3),
            'return': round(ret, 4),
        })
        entry_price = None
        entry_date = None
    positions.append(position)

df['position'] = positions
df['buy_signal'] = buy_signal
df['sell_signal'] = sell_signal

# Returns
df['daily_return'] = df['close'].pct_change()
df['strategy_return'] = df['daily_return'] * df['position'].shift(1)
trade_diff = df['position'].diff().abs()
df['strategy_return'] -= trade_diff * 0.0003
df['strategy_return'] = df['strategy_return'].fillna(0)

df['equity'] = (1 + df['strategy_return']).cumprod()
df['benchmark'] = (1 + df['daily_return'].fillna(0)).cumprod()

# Statistics
total_return = df['equity'].iloc[-1] - 1
days = len(df)
annual_return = (1 + total_return) ** (252 / days) - 1 if days > 0 else 0

max_dd = (df['equity'] / df['equity'].cummax()).min() - 1

trade_count = len(trades)
win_trades = [t for t in trades if t['return'] > 0]
loss_trades = [t for t in trades if t['return'] <= 0]
win_rate = len(win_trades) / trade_count if trade_count > 0 else 0

avg_win = np.mean([t['return'] for t in win_trades]) if win_trades else 0
avg_loss = abs(np.mean([t['return'] for t in loss_trades])) if loss_trades else 0
profit_loss_ratio = avg_win / avg_loss if avg_loss > 0 else float('inf')

result = {
    'total_return': float(total_return),
    'annual_return': float(annual_return),
    'max_drawdown': float(max_dd),
    'trade_count': int(trade_count),
    'win_rate': float(win_rate),
    'profit_loss_ratio': float(profit_loss_ratio) if np.isfinite(profit_loss_ratio) else 'inf',
    'trades': trades,
}

# Export full data
df_export = df.reset_index()
records = []
for _, row in df_export.iterrows():
    r = {}
    for col in df_export.columns:
        v = row[col]
        if pd.isna(v):
            r[col] = None
        elif isinstance(v, (np.floating, float)):
            r[col] = float(v)
        elif isinstance(v, (np.integer, int)):
            r[col] = int(v)
        elif isinstance(v, bool):
            r[col] = bool(v)
        else:
            r[col] = str(v)
    records.append(r)

with open('reference_data.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

with open('reference_result.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print('参考数据已导出到 reference_data.json 和 reference_result.json')
