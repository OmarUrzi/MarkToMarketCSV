import { TradeHistoryItem, MarkToMarketItem } from '../types';
import { createChart, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts';

// Calculate period returns (monthly/daily)
export const calculatePeriodReturns = (
  trades: TradeHistoryItem[],
  initialBalance: number,
  timeframe: 'monthly' | 'daily' = 'monthly'
) => {
  if (trades.length === 0) return [];

  // Sort trades by time
  const sortedTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  // Calculate running balance for each trade
  let runningBalance = initialBalance;
  const balanceHistory: { time: Date; balance: number }[] = [
    { time: new Date(sortedTrades[0].time), balance: initialBalance }
  ];

  for (const trade of sortedTrades) {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    
    runningBalance += profit + commission + swap;
    balanceHistory.push({
      time: new Date(trade.time),
      balance: runningBalance
    });
  }

  // Group by periods
  const periods = new Map<string, { start: number; end: number; startDate: Date; endDate: Date }>();
  
  for (const entry of balanceHistory) {
    let periodKey: string;
    let periodStart: Date;
    let periodEnd: Date;

    if (timeframe === 'monthly') {
      const year = entry.time.getFullYear();
      const month = entry.time.getMonth();
      periodKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      periodStart = new Date(year, month, 1);
      periodEnd = new Date(year, month + 1, 0, 23, 59, 59);
    } else {
      const year = entry.time.getFullYear();
      const month = entry.time.getMonth();
      const day = entry.time.getDate();
      periodKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      periodStart = new Date(year, month, day, 0, 0, 0);
      periodEnd = new Date(year, month, day, 23, 59, 59);
    }

    if (!periods.has(periodKey)) {
      periods.set(periodKey, {
        start: entry.balance,
        end: entry.balance,
        startDate: periodStart,
        endDate: periodEnd
      });
    } else {
      const period = periods.get(periodKey)!;
      period.end = entry.balance;
    }
  }

  // Calculate returns for each period
  const returns = Array.from(periods.entries()).map(([periodKey, data]) => {
    const returnPercent = data.start > 0 ? ((data.end - data.start) / data.start) * 100 : 0;
    
    return {
      period: periodKey,
      startDate: data.startDate,
      endDate: data.endDate,
      startBalance: data.start,
      endBalance: data.end,
      returnPercent: returnPercent,
      returnValue: data.end - data.start
    };
  });

  return returns.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
};

// Calculate balance history for area chart
export const calculateBalanceHistory = (
  trades: TradeHistoryItem[],
  initialBalance: number
) => {
  if (trades.length === 0) return [];

  const sortedTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  let runningBalance = initialBalance;
  const balanceHistory = [
    {
      time: new Date(sortedTrades[0].time).getTime() / 1000,
      balance: initialBalance
    }
  ];

  for (const trade of sortedTrades) {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    
    runningBalance += profit + commission + swap;
    
    balanceHistory.push({
      time: new Date(trade.time).getTime() / 1000,
      balance: runningBalance
    });
  }

  return balanceHistory;
};

// Calculate drawdown history
export const calculateDrawdownHistory = (
  trades: TradeHistoryItem[],
  initialBalance: number
) => {
  if (trades.length === 0) return [];

  const sortedTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  let runningBalance = initialBalance;
  let peakBalance = initialBalance;
  const drawdownHistory = [
    {
      time: new Date(sortedTrades[0].time).getTime() / 1000,
      drawdown: 0
    }
  ];

  for (const trade of sortedTrades) {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    
    runningBalance += profit + commission + swap;
    
    // Update peak if current balance is higher
    if (runningBalance > peakBalance) {
      peakBalance = runningBalance;
    }
    
    // Calculate drawdown as percentage
    const drawdownPercent = peakBalance > 0 ? ((peakBalance - runningBalance) / peakBalance) * 100 : 0;
    
    drawdownHistory.push({
      time: new Date(trade.time).getTime() / 1000,
      drawdown: -drawdownPercent // Negative for display
    });
  }

  return drawdownHistory;
};

// Render period returns chart (bar chart)
export const renderPeriodReturnsChart = (
  container: HTMLDivElement,
  trades: TradeHistoryItem[],
  initialBalance: number,
  selectedSymbol?: string
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';

  const returns = calculatePeriodReturns(trades, initialBalance, 'monthly');
  
  if (returns.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No return data available for ${selectedSymbol}`
      : 'No return data available';
    container.appendChild(message);
    return { chart: null, cleanup: () => {} };
  }

  const chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'white' },
      textColor: '#333',
    },
    width: container.clientWidth,
    height: container.clientHeight,
    rightPriceScale: {
      borderVisible: false,
      autoScale: true,
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
    grid: {
      horzLines: {
        color: '#f3f4f6',
        style: LineStyle.Dotted,
      },
      vertLines: {
        color: '#f3f4f6',
        style: LineStyle.Dotted,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
  });

  const histogramSeries = chart.addHistogramSeries({
    color: '#22c55e',
    priceFormat: {
      type: 'percent',
      precision: 2,
    },
  });

  const chartData = returns.map(item => ({
    time: item.startDate.getTime() / 1000,
    value: item.returnPercent,
    color: item.returnPercent >= 0 ? '#22c55e' : '#ef4444'
  }));

  histogramSeries.setData(chartData);

  // Add zero line
  const zeroLineSeries = chart.addLineSeries({
    color: '#6b7280',
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
  });

  const zeroLineData = chartData.map(item => ({
    time: item.time,
    value: 0
  }));

  zeroLineSeries.setData(zeroLineData);

  chart.timeScale().fitContent();

  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) return;
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width, height: newRect.height });
  });

  resizeObserver.observe(container);

  return {
    chart,
    cleanup: () => {
      resizeObserver.disconnect();
      chart.remove();
    }
  };
};

// Render balance area chart
export const renderBalanceAreaChart = (
  container: HTMLDivElement,
  trades: TradeHistoryItem[],
  initialBalance: number,
  selectedSymbol?: string
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';

  const balanceHistory = calculateBalanceHistory(trades, initialBalance);
  
  if (balanceHistory.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No balance data available for ${selectedSymbol}`
      : 'No balance data available';
    container.appendChild(message);
    return { chart: null, cleanup: () => {} };
  }

  const chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'white' },
      textColor: '#333',
    },
    width: container.clientWidth,
    height: container.clientHeight,
    rightPriceScale: {
      borderVisible: false,
      autoScale: true,
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
    grid: {
      horzLines: {
        color: '#f3f4f6',
        style: LineStyle.Dotted,
      },
      vertLines: {
        color: '#f3f4f6',
        style: LineStyle.Dotted,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
  });

  const areaSeries = chart.addAreaSeries({
    lineColor: '#2563eb',
    topColor: 'rgba(37, 99, 235, 0.4)',
    bottomColor: 'rgba(37, 99, 235, 0.1)',
    lineWidth: 2,
    priceFormat: {
      type: 'price',
      precision: 2,
      minMove: 0.01,
    },
  });

  const chartData = balanceHistory.map(item => ({
    time: item.time,
    value: item.balance
  }));

  areaSeries.setData(chartData);

  chart.timeScale().fitContent();

  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) return;
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width, height: newRect.height });
  });

  resizeObserver.observe(container);

  return {
    chart,
    cleanup: () => {
      resizeObserver.disconnect();
      chart.remove();
    }
  };
};

// Render drawdown chart
export const renderDrawdownChart = (
  container: HTMLDivElement,
  trades: TradeHistoryItem[],
  initialBalance: number,
  selectedSymbol?: string
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';

  const drawdownHistory = calculateDrawdownHistory(trades, initialBalance);
  
  if (drawdownHistory.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No drawdown data available for ${selectedSymbol}`
      : 'No drawdown data available';
    container.appendChild(message);
    return { chart: null, cleanup: () => {} };
  }

  const chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'white' },
      textColor: '#333',
    },
    width: container.clientWidth,
    height: container.clientHeight,
    rightPriceScale: {
      borderVisible: false,
      autoScale: true,
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
    grid: {
      horzLines: {
        color: '#f3f4f6',
        style: LineStyle.Dotted,
      },
      vertLines: {
        color: '#f3f4f6',
        style: LineStyle.Dotted,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
  });

  const lineSeries = chart.addLineSeries({
    color: '#3b82f6',
    lineWidth: 2,
    priceFormat: {
      type: 'percent',
      precision: 2,
    },
  });

  const chartData = drawdownHistory.map(item => ({
    time: item.time,
    value: item.drawdown
  }));

  lineSeries.setData(chartData);

  // Add zero line
  const zeroLineSeries = chart.addLineSeries({
    color: '#6b7280',
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
  });

  const zeroLineData = chartData.map(item => ({
    time: item.time,
    value: 0
  }));

  zeroLineSeries.setData(zeroLineData);

  chart.timeScale().fitContent();

  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) return;
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width, height: newRect.height });
  });

  resizeObserver.observe(container);

  return {
    chart,
    cleanup: () => {
      resizeObserver.disconnect();
      chart.remove();
    }
  };
};