import { TradeHistoryItem, MarkToMarketItem } from '../types';
import { createChart, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts';

// Types for drawdown calculation modes
export type DrawdownMode = 'realized' | 'unrealized';

// Types for drill-down functionality
export interface DrillDownState {
  level: 'monthly' | 'detailed';
  selectedPeriod?: {
    year: number;
    month: number;
    label: string;
  };
}

// Calculate period returns (monthly/daily)
export const calculatePeriodReturns = (
  trades: TradeHistoryItem[],
  initialBalance: number,
  timeframe: 'monthly' | 'daily' = 'monthly'
) => {
  if (trades.length === 0) return [];

  // Sort trades by time
  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.openTime).getTime() - new Date(b.openTime).getTime()
  );

  const periods = new Map<string, {
    profit: number;
    trades: number;
    startBalance: number;
    endBalance: number;
    date: Date;
  }>();

  let runningBalance = initialBalance;

  sortedTrades.forEach(trade => {
    const tradeDate = new Date(trade.closeTime);
    const periodKey = timeframe === 'monthly' 
      ? `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}`
      : tradeDate.toISOString().split('T')[0];

    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    const netProfit = profit + commission + swap;

    if (!periods.has(periodKey)) {
      periods.set(periodKey, {
        profit: 0,
        trades: 0,
        startBalance: runningBalance,
        endBalance: runningBalance,
        date: tradeDate
      });
    }

    const period = periods.get(periodKey)!;
    period.profit += netProfit;
    period.trades += 1;
    runningBalance += netProfit;
    period.endBalance = runningBalance;
  });

  return Array.from(periods.entries()).map(([key, data]) => ({
    period: key,
    profit: data.profit,
    trades: data.trades,
    startBalance: data.startBalance,
    endBalance: data.endBalance,
    returnPercent: ((data.endBalance - data.startBalance) / data.startBalance) * 100,
    date: data.date
  })).sort((a, b) => a.date.getTime() - b.date.getTime());
};

// Calculate drawdown data
export const calculateDrawdownData = (
  trades: TradeHistoryItem[],
  initialBalance: number,
  mode: DrawdownMode = 'realized'
) => {
  if (trades.length === 0) return [];

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.openTime).getTime() - new Date(b.openTime).getTime()
  );

  let runningBalance = initialBalance;
  let peak = initialBalance;
  const drawdownData: Array<{
    time: string;
    balance: number;
    drawdown: number;
    drawdownPercent: number;
    peak: number;
  }> = [];

  // Add initial point
  drawdownData.push({
    time: sortedTrades[0]?.openTime || new Date().toISOString(),
    balance: initialBalance,
    drawdown: 0,
    drawdownPercent: 0,
    peak: initialBalance
  });

  sortedTrades.forEach(trade => {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    const netProfit = profit + commission + swap;

    runningBalance += netProfit;
    
    if (runningBalance > peak) {
      peak = runningBalance;
    }

    const drawdown = peak - runningBalance;
    const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

    drawdownData.push({
      time: trade.closeTime,
      balance: runningBalance,
      drawdown,
      drawdownPercent,
      peak
    });
  });

  return drawdownData;
};

// Create equity curve chart
export const createEquityCurveChart = (
  container: HTMLElement,
  trades: TradeHistoryItem[],
  initialBalance: number
) => {
  const chart = createChart(container, {
    width: container.clientWidth,
    height: 400,
    layout: {
      background: { type: ColorType.Solid, color: 'white' },
      textColor: 'black',
    },
    grid: {
      vertLines: { color: '#e1e1e1' },
      horzLines: { color: '#e1e1e1' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: '#cccccc',
    },
    timeScale: {
      borderColor: '#cccccc',
    },
  });

  const lineSeries = chart.addLineSeries({
    color: '#2563eb',
    lineWidth: 2,
  });

  // Calculate equity curve data
  const equityData = [];
  let runningBalance = initialBalance;

  // Add initial point
  if (trades.length > 0) {
    equityData.push({
      time: trades[0].openTime.split('T')[0],
      value: initialBalance
    });
  }

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.openTime).getTime() - new Date(b.openTime).getTime()
  );

  sortedTrades.forEach(trade => {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    const netProfit = profit + commission + swap;

    runningBalance += netProfit;
    
    equityData.push({
      time: trade.closeTime.split('T')[0],
      value: runningBalance
    });
  });

  lineSeries.setData(equityData);
  chart.timeScale().fitContent();

  return chart;
};

// Create drawdown chart
export const createDrawdownChart = (
  container: HTMLElement,
  trades: TradeHistoryItem[],
  initialBalance: number
) => {
  const chart = createChart(container, {
    width: container.clientWidth,
    height: 300,
    layout: {
      background: { type: ColorType.Solid, color: 'white' },
      textColor: 'black',
    },
    grid: {
      vertLines: { color: '#e1e1e1' },
      horzLines: { color: '#e1e1e1' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: '#cccccc',
    },
    timeScale: {
      borderColor: '#cccccc',
    },
  });

  const areaSeries = chart.addAreaSeries({
    topColor: 'rgba(239, 68, 68, 0.3)',
    bottomColor: 'rgba(239, 68, 68, 0.1)',
    lineColor: '#ef4444',
    lineWidth: 2,
  });

  const drawdownData = calculateDrawdownData(trades, initialBalance);
  const chartData = drawdownData.map(point => ({
    time: point.time.split('T')[0],
    value: -point.drawdownPercent // Negative for visual representation
  }));

  areaSeries.setData(chartData);
  chart.timeScale().fitContent();

  return chart;
};