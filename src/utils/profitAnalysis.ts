// PROFIT CALCULATION ANALYSIS
// This file documents exactly what data is used for profit calculations

export interface ProfitCalculationSources {
  // 1. DIRECT PROFIT FROM TRADE DATA
  directProfit: {
    source: 'trade.profit field from CSV/HTML/XLSX';
    description: 'Raw profit value from each trade record';
    format: 'String with currency symbol (e.g., "$123.45" or "-$45.67")';
    processing: 'Cleaned with regex: trade.profit.replace(/[^\\d.-]/g, "")';
    location: 'TradeHistoryItem.profit';
  };

  // 2. COMMISSION AND SWAP
  additionalCosts: {
    commission: {
      source: 'trade.commission field';
      description: 'Broker commission for the trade';
      format: 'String with currency (e.g., "$2.50")';
      processing: 'Added to profit calculation';
    };
    swap: {
      source: 'trade.swap field';
      description: 'Overnight financing cost/credit';
      format: 'String with currency (e.g., "$1.25" or "-$0.75")';
      processing: 'Added to profit calculation';
    };
  };

  // 3. RUNNING BALANCE CALCULATION
  balanceCalculation: {
    formula: 'newBalance = previousBalance + profit + commission + swap';
    startingPoint: 'initialBalance (user-defined, default 10000)';
    accumulation: 'Each trade updates running balance';
    storage: 'trade.balance field';
  };

  // 4. SYMBOL-SPECIFIC PROFIT
  symbolFiltering: {
    method: 'Filter trades by trade.symbol === selectedSymbol';
    calculation: 'Sum profits only for selected symbol';
    exclusion: 'Trades with profit = 0 are filtered out';
  };

  // 5. MARK-TO-MARKET PROFIT
  markToMarketProfit: {
    closedPnL: {
      source: 'Sum of all closed trades profit + commission + swap';
      description: 'Realized profit from completed trades';
    };
    openPnL: {
      source: 'Calculated from open positions vs current market price';
      formula: 'For BUY: (currentPrice - entryPrice) * volume * contractSize';
      formula2: 'For SELL: (entryPrice - currentPrice) * volume * contractSize';
      contractSize: '100,000 for forex pairs';
    };
    totalPnL: {
      formula: 'closedPnL + openPnL';
      description: 'Total profit including unrealized gains/losses';
    };
  };
}

// ACTUAL CALCULATION LOCATIONS IN CODE:

// 1. CSV Parser (csvParser.ts)
export const csvProfitCalculation = `
const parsedProfit = parseFloat(profit) || 0;
const parsedCommission = parseFloat(commission) || 0;
const parsedSwap = parseFloat(swap) || 0;

runningBalance += parsedProfit + parsedCommission + parsedSwap;
`;

// 2. HTML Parser (htmlToCsvConverter.ts)
export const htmlProfitCalculation = `
const profit = parseFloat(trade.profit.replace(/[^\\d.-]/g, '') || '0');
const commission = parseFloat(trade.commission.replace(/[^\\d.-]/g, '') || '0');
const swap = parseFloat(trade.swap.replace(/[^\\d.-]/g, '') || '0');

runningBalance += profit + commission + swap;
`;

// 3. Dashboard Display (Dashboard.tsx)
export const dashboardProfitDisplay = `
// Uses totalProfit from BacktestData
const profitValue = parseFloat(totalProfit.replace('$', ''));

// Calculated in parsers as:
const totalProfit = completeTrades.reduce((sum, trade) => {
  return sum + parseFloat(trade.profit.replace(/[^\\d.-]/g, '') || '0');
}, 0);
`;

// 4. Mark-to-Market Calculation (parsers.ts)
export const markToMarketCalculation = `
// Closed P/L (Realized)
const symbolClosedPnL = symbolTrades.reduce((total, trade) => {
  return total + parseFloat(trade.profit.replace(/[^\\d.-]/g, '') || '0');
}, 0);

// Open P/L (Unrealized)
const pnl = trade.type === 'buy'
  ? (marketPrice - trade.entryPrice) * trade.volume * 100000
  : (trade.entryPrice - marketPrice) * trade.volume * 100000;

// Total P/L
const totalPnL = symbolClosedPnL + openPnL;
`;

// 5. Drawdown Calculator (DrawdownCalculator.tsx)
export const drawdownProfitCalculation = `
const profit = parseFloat(trade.profit.replace(/[^\\d.-]/g, '') || '0');
const commission = parseFloat(trade.commission.replace(/[^\\d.-]/g, '') || '0');
const swap = parseFloat(trade.swap.replace(/[^\\d.-]/g, '') || '0');

runningBalance += profit + commission + swap;

// Peak tracking for drawdown
if (runningBalance > peakBalance) {
  peakBalance = runningBalance;
}

const drawdownPercent = ((peakBalance - runningBalance) / peakBalance) * 100;
`;

// DATA FLOW SUMMARY:
export const dataFlowSummary = `
1. FILE UPLOAD (CSV/HTML/XLSX)
   ↓
2. PARSE TRADE DATA
   - Extract: time, symbol, type, volume, price, profit, commission, swap
   ↓
3. CLEAN PROFIT VALUES
   - Remove currency symbols: profit.replace(/[^\\d.-]/g, '')
   - Convert to numbers: parseFloat()
   ↓
4. CALCULATE RUNNING BALANCE
   - Start with initialBalance
   - Add: profit + commission + swap for each trade
   ↓
5. FILTER BY SYMBOL
   - Show only trades for selected symbol
   - Recalculate totals for that symbol
   ↓
6. DISPLAY RESULTS
   - Dashboard: Total profit for symbol
   - Charts: Balance progression over time
   - Tables: Individual trade profits
   - Mark-to-Market: Realized + Unrealized P/L
`;