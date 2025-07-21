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
  const sortedTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  // Calculate running balance for each trade
  let runningBalance = initialBalance;
  const balanceHistory: { time: Date; balance: number; trade: TradeHistoryItem }[] = [
    { time: new Date(sortedTrades[0].time), balance: initialBalance, trade: sortedTrades[0] }
  ];

  for (const trade of sortedTrades) {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    
    runningBalance += profit + commission + swap;
    balanceHistory.push({
      time: new Date(trade.time),
      balance: runningBalance,
      trade: trade
    });
  }

  // Group by periods
  const periods = new Map<string, { 
    start: number; 
    end: number; 
    startDate: Date; 
    endDate: Date;
    trades: TradeHistoryItem[];
  }>();
  
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
        endDate: periodEnd,
        trades: []
      });
    } else {
      const period = periods.get(periodKey)!;
      period.end = entry.balance;
    }
    
    // Add trade to period
    periods.get(periodKey)!.trades.push(entry.trade);
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
      returnValue: data.end - data.start,
      trades: data.trades
    };
  });

  return returns.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
};

// Calculate detailed returns for a specific month (15-minute intervals)
export const calculateDetailedReturns = (
  trades: TradeHistoryItem[],
  initialBalance: number,
  year: number,
  month: number
) => {
  if (trades.length === 0) return [];

  // Filter trades for the specific month
  const monthTrades = trades.filter(trade => {
    const tradeDate = new Date(trade.time);
    return tradeDate.getFullYear() === year && tradeDate.getMonth() === month;
  });

  if (monthTrades.length === 0) return [];

  // Sort trades by time
  const sortedTrades = [...monthTrades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  // Get the balance at the start of the month
  const allTradesBeforeMonth = trades.filter(trade => {
    const tradeDate = new Date(trade.time);
    return tradeDate < new Date(year, month, 1);
  }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  let startingBalance = initialBalance;
  for (const trade of allTradesBeforeMonth) {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    startingBalance += profit + commission + swap;
  }

  // Create 15-minute intervals for the entire month
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const intervals: { 
    start: Date; 
    end: Date; 
    trades: TradeHistoryItem[];
    balance: number;
  }[] = [];

  let currentTime = new Date(monthStart);
  let runningBalance = startingBalance;

  while (currentTime <= monthEnd) {
    const intervalEnd = new Date(currentTime.getTime() + 15 * 60 * 1000); // 15 minutes
    
    // Find trades in this interval
    const intervalTrades = sortedTrades.filter(trade => {
      const tradeTime = new Date(trade.time);
      return tradeTime >= currentTime && tradeTime < intervalEnd;
    });

    // Calculate balance change for this interval
    let intervalBalance = runningBalance;
    for (const trade of intervalTrades) {
      const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
      const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
      const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
      intervalBalance += profit + commission + swap;
    }

    if (intervalTrades.length > 0 || intervals.length === 0) {
      intervals.push({
        start: new Date(currentTime),
        end: new Date(intervalEnd),
        trades: intervalTrades,
        balance: intervalBalance
      });
    }

    runningBalance = intervalBalance;
    currentTime = intervalEnd;
  }

  // Calculate returns for each interval
  return intervals.map((interval, index) => {
    const previousBalance = index === 0 ? startingBalance : intervals[index - 1].balance;
    const returnPercent = previousBalance > 0 ? ((interval.balance - previousBalance) / previousBalance) * 100 : 0;
    
    return {
      period: `${interval.start.getHours()}:${String(interval.start.getMinutes()).padStart(2, '0')}`,
      startDate: interval.start,
      endDate: interval.end,
      startBalance: previousBalance,
      endBalance: interval.balance,
      returnPercent: returnPercent,
      returnValue: interval.balance - previousBalance,
      trades: interval.trades
    };
  }).filter(item => item.trades.length > 0); // Only show intervals with trades
};

// Calculate balance history for area chart
export const calculateBalanceHistory = (
  trades: TradeHistoryItem[],
  initialBalance: number
) => {
  if (trades.length === 0) return [];

  const sortedTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  let runningBalance = initialBalance;
  const balanceMap = new Map<number, number>();
  
  // Add initial balance
  const firstTradeTime = Math.floor(new Date(sortedTrades[0].time).getTime() / 1000);
  balanceMap.set(firstTradeTime, initialBalance);

  for (const trade of sortedTrades) {
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    
    runningBalance += profit + commission + swap;
    
    const timeInSeconds = Math.floor(new Date(trade.time).getTime() / 1000);
    balanceMap.set(timeInSeconds, runningBalance);
  }

  // Convert map to array and sort by time
  return Array.from(balanceMap.entries())
    .map(([time, balance]) => ({ time, balance }))
    .sort((a, b) => a.time - b.time);
};

// Calculate drawdown history using real-time mark-to-market data
export const calculateDrawdownHistory = (
  trades: TradeHistoryItem[],
  initialBalance: number,
  markToMarketData?: MarkToMarketItem[],
  mode: DrawdownMode = 'realized'
) => {
  if (mode === 'unrealized' && markToMarketData && markToMarketData.length > 0) {
    return calculateUnrealizedDrawdown(markToMarketData, initialBalance);
  } else {
    return calculateRealizedDrawdown(trades, initialBalance);
  }
};

// Calculate unrealized drawdown using mark-to-market data (includes open positions)
const calculateUnrealizedDrawdown = (
  markToMarketData: MarkToMarketItem[],
  initialBalance: number
) => {
  if (markToMarketData.length === 0) return [];

  let peakBalance = initialBalance;
  const drawdownMap = new Map<number, number>();
  
  // Sort mark-to-market data by time
  const sortedData = [...markToMarketData].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const item of sortedData) {
    // Calculate real-time balance: initial + closed P&L + open P&L
    const closedPnL = parseFloat(item.closed.replace(/[^\d.-]/g, '') || '0');
    const openPnL = parseFloat(item.open.replace(/[^\d.-]/g, '') || '0');
    const currentBalance = initialBalance + closedPnL + openPnL;
    
    // Update peak if current balance is higher
    if (currentBalance > peakBalance) {
      peakBalance = currentBalance;
    }
    
    // Calculate drawdown as percentage from peak
    const drawdownPercent = peakBalance > 0 ? 
      ((peakBalance - currentBalance) / peakBalance) * 100 : 0;
    
    const timeInSeconds = Math.floor(new Date(item.date).getTime() / 1000);
    drawdownMap.set(timeInSeconds, -drawdownPercent); // Negative for display
  }

  return Array.from(drawdownMap.entries())
    .map(([time, drawdown]) => ({ time, drawdown }))
    .sort((a, b) => a.time - b.time);
};

// Calculate realized drawdown based only on closed trades
const calculateRealizedDrawdown = (
  trades: TradeHistoryItem[],
  initialBalance: number
) => {
  if (trades.length === 0) return [];

  const sortedTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  
  let runningBalance = initialBalance;
  let peakBalance = initialBalance;  
  const drawdownMap = new Map<number, number>();
  
  // Add initial drawdown
  const firstTradeTime = Math.floor(new Date(sortedTrades[0].time).getTime() / 1000);
  drawdownMap.set(firstTradeTime, 0);  

  for (const trade of sortedTrades) {
    // Calculate new balance
    const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
    const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
    const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
    
    runningBalance += profit + commission + swap;
    
    // Update peak if current balance is higher
    if (runningBalance > peakBalance) {
      peakBalance = runningBalance;
    }
    
    // Calculate drawdown as percentage
    const drawdownPercent = peakBalance > 0 ? 
      ((peakBalance - runningBalance) / peakBalance) * 100 : 0;
    
    const timeInSeconds = Math.floor(new Date(trade.time).getTime() / 1000);
    drawdownMap.set(timeInSeconds, -drawdownPercent); // Negative for display
  }

  return Array.from(drawdownMap.entries())
    .map(([time, drawdown]) => ({ time, drawdown }))
    .sort((a, b) => a.time - b.time);
};

// Render period returns chart with drill-down functionality
export const renderPeriodReturnsChart = (
  container: HTMLDivElement,
  trades: TradeHistoryItem[],
  initialBalance: number,
  selectedSymbol?: string,
  drillDownState: DrillDownState = { level: 'monthly' },
  onDrillDown?: (year: number, month: number, label: string) => void,
  onDrillUp?: () => void
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';

  // Calculate returns based on drill-down state
  let returns;
  let titleSuffix = '';
  
  if (drillDownState.level === 'monthly') {
    returns = calculatePeriodReturns(trades, initialBalance, 'monthly');
    titleSuffix = 'Monthly View';
  } else if (drillDownState.selectedPeriod) {
    returns = calculateDetailedReturns(
      trades, 
      initialBalance, 
      drillDownState.selectedPeriod.year, 
      drillDownState.selectedPeriod.month
    );
    titleSuffix = drillDownState.selectedPeriod.label;
  } else {
    returns = [];
  }
  
  if (returns.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No return data available for ${selectedSymbol}`
      : 'No return data available';
    container.appendChild(message);
    return { chart: null, cleanup: () => {} };
  }

  // Add title and back button
  const headerContainer = document.createElement('div');
  headerContainer.className = 'flex items-center justify-between mb-4 px-4';
  
  const titleContainer = document.createElement('div');
  titleContainer.className = 'flex items-center space-x-2';
  
  if (drillDownState.level === 'detailed' && onDrillUp) {
    const backButton = document.createElement('button');
    backButton.className = 'flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-md transition-colors';
    backButton.innerHTML = '← Back to Monthly View';
    backButton.onclick = onDrillUp;
    titleContainer.appendChild(backButton);
  }
  
  const title = document.createElement('h4');
  title.className = 'text-sm font-medium text-gray-700';
  title.textContent = titleSuffix;
  titleContainer.appendChild(title);
  
  headerContainer.appendChild(titleContainer);
  container.appendChild(headerContainer);

  // Create chart container
  const chartContainer = document.createElement('div');
  chartContainer.style.height = 'calc(100% - 60px)';
  chartContainer.style.position = 'relative';
  container.appendChild(chartContainer);

  // Create popup container
  const popupContainer = document.createElement('div');
  popupContainer.className = 'absolute hidden bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-w-md p-4';
  popupContainer.style.pointerEvents = 'auto';
  chartContainer.appendChild(popupContainer);

  const chart = createChart(chartContainer, {
    layout: {
      background: { type: ColorType.Solid, color: 'white' },
      textColor: '#333',
    },
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight,
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
    base: 0,
    priceFormat: {
      type: 'percent',
      precision: 2,
    },
  });

  const chartData = returns.map(item => ({
    time: Math.floor(item.startDate.getTime() / 1000),
    value: item.returnPercent,
    color: item.returnPercent >= 0 ? '#22c55e' : '#ef4444',
    originalData: item
  }));

  histogramSeries.setData(chartData);
  
  // Add markers with percentage labels
  const updateMarkers = () => {
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleLogicalRange();
    
    if (visibleRange) {
      const containerWidth = chartContainer.clientWidth;
      const visibleBars = visibleRange.to - visibleRange.from;
      const pixelsPerBar = containerWidth / visibleBars;
      
      // Always show percentage markers for monthly view, or when zoomed in enough for detailed view
      if (drillDownState.level === 'monthly' || pixelsPerBar >= 40) {
        const markers = returns.map(item => ({
          time: Math.floor(item.startDate.getTime() / 1000),
          position: 'inBar' as const,
          color: 'transparent',
          shape: 'circle' as const,
          size: 0,
          text: `${item.returnPercent >= 0 ? '+' : ''}${item.returnPercent.toFixed(1)}%`
        }));
        histogramSeries.setMarkers(markers);
      } else {
        // Clear markers when zoomed out
        histogramSeries.setMarkers([]);
      }
    }
  };
  
  // Initial markers update
  updateMarkers();
  
  // Update markers when user zooms or pans
  chart.timeScale().subscribeVisibleTimeRangeChange(updateMarkers);
  
  // Initialize cleanup function
  let cleanupFn = () => {
    resizeObserver.disconnect();
    chart.remove();
    const indicator = document.getElementById('drill-indicator');
    if (indicator) {
      indicator.remove();
    }
  };
  
  // For monthly view, also add percentage labels as overlay text
  if (drillDownState.level === 'monthly') {
    // Create overlay for percentage labels
    const percentageOverlay = document.createElement('div');
    percentageOverlay.className = 'absolute inset-0 pointer-events-none';
    percentageOverlay.style.zIndex = '15';
    chartContainer.appendChild(percentageOverlay);

    // Function to update percentage labels
    const updatePercentageLabels = () => {
      percentageOverlay.innerHTML = '';
      
      const timeScale = chart.timeScale();
      
      chartData.forEach(dataPoint => {
        const coordinate = timeScale.timeToCoordinate(dataPoint.time);
        const priceCoordinate = histogramSeries.priceToCoordinate(dataPoint.value);
        
        if (coordinate !== null && priceCoordinate !== null) {
          // Create percentage label above the bar
          const percentLabel = document.createElement('div');
          percentLabel.className = 'absolute text-xs font-bold text-gray-800 pointer-events-none text-center';
          percentLabel.style.left = `${coordinate - 25}px`;
          percentLabel.style.width = '50px';
          
          // Position above positive bars, below negative bars
          if (dataPoint.value >= 0) {
            percentLabel.style.top = `${Math.max(priceCoordinate - 25, 5)}px`;
          } else {
            percentLabel.style.top = `${Math.min(priceCoordinate + 10, chartContainer.clientHeight - 20)}px`;
          }
          
          // Format percentage with + for positive values
          const formattedPercent = `${dataPoint.value >= 0 ? '+' : ''}${dataPoint.value.toFixed(1)}%`;
          percentLabel.textContent = formattedPercent;
          
          // Color based on positive/negative
          percentLabel.style.color = dataPoint.value >= 0 ? '#059669' : '#dc2626';
          
          percentageOverlay.appendChild(percentLabel);
        }
      });
    };

    // Initial label update
    updatePercentageLabels();

    // Update labels when chart is resized or scrolled
    chart.timeScale().subscribeVisibleTimeRangeChange(updatePercentageLabels);
    
    // Update cleanup function to include percentage overlay removal
    const originalCleanup = cleanupFn;
    cleanupFn = () => {
      originalCleanup();
      if (percentageOverlay.parentNode) {
        percentageOverlay.parentNode.removeChild(percentageOverlay);
      }
    };
  }

  // Add click handlers for drill-down (only for monthly view)
  if (drillDownState.level === 'monthly' && onDrillDown) {
    chart.subscribeCrosshairMove(param => {
      if (param.time && param.point) {
        const dataPoint = chartData.find(d => d.time === param.time);
        if (dataPoint) {
          chartContainer.style.cursor = 'pointer';
          
          // Show drill-down indicator
          const indicator = document.getElementById('drill-indicator');
          if (!indicator) {
            const newIndicator = document.createElement('div');
            newIndicator.id = 'drill-indicator';
            newIndicator.className = 'absolute bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-10';
            newIndicator.textContent = '🔍 Click to drill down';
            newIndicator.style.left = `${param.point.x + 10}px`;
            newIndicator.style.top = `${param.point.y - 30}px`;
            chartContainer.style.position = 'relative';
            chartContainer.appendChild(newIndicator);
          }
        }
      } else {
        chartContainer.style.cursor = 'default';
        const indicator = document.getElementById('drill-indicator');
        if (indicator) {
          indicator.remove();
        }
      }
    });

    chart.subscribeClick(param => {
      if (param.time) {
        const dataPoint = chartData.find(d => d.time === param.time);
        if (dataPoint && onDrillDown) {
          const date = dataPoint.originalData.startDate;
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                            'July', 'August', 'September', 'October', 'November', 'December'];
          const label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
          onDrillDown(date.getFullYear(), date.getMonth(), label);
        }
      }
    });
  }

  // Add custom labels and popup functionality for detailed view
  if (drillDownState.level === 'detailed' && drillDownState.selectedPeriod) {
    // Create overlay for custom labels and buttons
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 pointer-events-none';
    overlay.style.zIndex = '10';
    chartContainer.appendChild(overlay);

    // Function to update labels
    const updateLabels = () => {
      overlay.innerHTML = '';
      
      const timeScale = chart.timeScale();
      
      chartData.forEach(dataPoint => {
        const coordinate = timeScale.timeToCoordinate(dataPoint.time);
        const priceCoordinate = histogramSeries.priceToCoordinate(dataPoint.value);
        
        if (coordinate !== null && priceCoordinate !== null) {
          // Calculate trade statistics
          const buyTrades = dataPoint.originalData.trades.filter(t => t.type.toLowerCase() === 'buy');
          const sellTrades = dataPoint.originalData.trades.filter(t => t.type.toLowerCase() === 'sell');
          
          // Create percentage label (above bar)
          const percentLabel = document.createElement('div');
          percentLabel.className = 'absolute text-xs font-medium text-gray-700 pointer-events-none';
          percentLabel.style.left = `${coordinate - 15}px`;
          percentLabel.style.top = `${Math.min(priceCoordinate - 25, 10)}px`;
          percentLabel.textContent = dataPoint.value.toFixed(1);
          
          
          // Create buy/sell label (below percentage)
          const tradeLabel = document.createElement('div');
          tradeLabel.className = 'absolute text-xs font-medium pointer-events-none flex items-center space-x-1';
          tradeLabel.style.left = `${coordinate - 20}px`;
          tradeLabel.style.top = `${Math.min(priceCoordinate - 10, 25)}px`;
          
          const buySpan = document.createElement('span');
          buySpan.className = 'text-green-600';
          buySpan.textContent = `${buyTrades.length}`;
          
          const separator = document.createElement('span');
          separator.className = 'text-gray-400';
          separator.textContent = '/';
          
          const sellSpan = document.createElement('span');
          sellSpan.className = 'text-red-600';
          sellSpan.textContent = `${sellTrades.length}`;
          
          tradeLabel.appendChild(buySpan);
          tradeLabel.appendChild(separator);
          tradeLabel.appendChild(sellSpan);
          
          // Only show labels when zoomed in enough (check bar spacing)
          const timeScale = chart.timeScale();
          const visibleRange = timeScale.getVisibleLogicalRange();
          if (visibleRange) {
            const containerWidth = chartContainer.clientWidth;
            const visibleBars = visibleRange.to - visibleRange.from;
            const pixelsPerBar = containerWidth / visibleBars;
            
            // Only show when bars are spaced at least 40 pixels apart
            if (pixelsPerBar >= 40) {
              overlay.appendChild(tradeLabel);
              overlay.appendChild(percentLabel);
            }
          }
          
          // Create info button (clickable)
          if (dataPoint.originalData.trades.length > 0) {
            const infoButton = document.createElement('button');
            infoButton.className = 'absolute w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors';
            infoButton.style.left = `${coordinate + 30}px`;
            infoButton.style.top = `${Math.min(priceCoordinate - 8, 30)}px`;
            infoButton.style.pointerEvents = 'auto';
            infoButton.innerHTML = 'i';
            infoButton.title = 'Click to see trade details';
            
            infoButton.onclick = (e) => {
              e.stopPropagation();
              showTradePopup(dataPoint.originalData, coordinate, priceCoordinate);
            };
            
            // Only show info button when labels are visible
            if (visibleRange) {
              const containerWidth = chartContainer.clientWidth;
              const visibleBars = visibleRange.to - visibleRange.from;
              const pixelsPerBar = containerWidth / visibleBars;
              
              if (pixelsPerBar >= 40) {
                overlay.appendChild(infoButton);
              }
            }
          }
        }
      });
    };

    // Function to show trade popup
    const showTradePopup = (data: any, x: number, y: number) => {
      const trades = data.trades;
      const totalProfit = trades.reduce((sum: number, trade: any) => {
        return sum + parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
      }, 0);

      const maxTradesShown = 5;
      const hasMoreTrades = trades.length > maxTradesShown;
      const tradesToShow = trades; // Show ALL trades, not just first 5

      popupContainer.innerHTML = `
        <div class="space-y-3">
          <div class="flex justify-between items-center border-b border-gray-200 pb-2">
            <div class="font-semibold text-gray-900">
              ${trades.length} Trade${trades.length > 1 ? 's' : ''} at ${data.period}
            </div>
            <button class="text-gray-400 hover:text-gray-600 text-lg leading-none" onclick="this.parentElement.parentElement.parentElement.style.display='none'">×</button>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>Total P/L: <span class="${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'} font-medium">$${totalProfit.toFixed(2)}</span></div>
            <div>Return: <span class="${data.returnPercent >= 0 ? 'text-green-600' : 'text-red-600'} font-medium">${data.returnPercent.toFixed(2)}%</span></div>
          </div>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            ${tradesToShow.map((trade: any, index: number) => `
              <div class="text-sm border border-gray-200 rounded p-2 ${index === 0 ? '' : 'border-t'}">
                <div class="flex justify-between items-center mb-1">
                  <span class="font-medium ${trade.direction.toLowerCase() === 'in' ? 'text-green-600' : 'text-red-600'}">
                    ${trade.direction.toUpperCase()} ${trade.type}
                  </span>
                  <span class="text-gray-600">${trade.symbol}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>Volume: ${trade.volume}</div>
                  <div>Price: $${parseFloat(trade.price).toFixed(5)}</div>
                  <div class="${parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') >= 0 ? 'text-green-600' : 'text-red-600'}">
                    P/L: ${trade.profit}
                  </div>
                  <div>Deal: ${trade.deal}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // Position popup
      const containerRect = chartContainer.getBoundingClientRect();
      let left = x + 10;
      let top = y - popupContainer.offsetHeight - 10;

      // Adjust if popup goes outside container
      if (left + 300 > containerRect.width) {
        left = containerRect.width - 310;
      }
      if (left < 0) {
        left = 10;
      }
      if (top < 0) {
        top = y + 10;
      }

      popupContainer.style.display = 'block';
      popupContainer.style.left = `${left}px`;
      popupContainer.style.top = `${top}px`;
    };

    // Initial label update
    updateLabels();

    // Update labels when chart is resized or scrolled
    chart.timeScale().subscribeVisibleTimeRangeChange(updateLabels);
  }
  
  // Custom time scale formatting
  chart.applyOptions({
    timeScale: {
      timeVisible: true,
      tickMarkFormatter: (time: number) => {
        const date = new Date(time * 1000);
        if (drillDownState.level === 'monthly') {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return `${monthNames[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
        } else {
          // For detailed view, show day and time for better context
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          
          // Check the range to decide format
          const timeScale = chart.timeScale();
          const visibleRange = timeScale.getVisibleLogicalRange();
          
          if (visibleRange) {
            const containerWidth = chartContainer.clientWidth;
            const visibleBars = visibleRange.to - visibleRange.from;
            const pixelsPerBar = containerWidth / visibleBars;
            
            // If showing many bars (zoomed out), show day/date
            if (pixelsPerBar < 30) {
              return `${day}`;
            } else if (pixelsPerBar < 60) {
              return `${day} ${hours}:00`;
            } else {
              return `${hours}:${minutes}`;
            }
          }
          
          return `${day} ${hours}:${minutes}`;
        }
      }
    }
  });

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
    if (entries.length === 0 || entries[0].target !== chartContainer) return;
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width, height: newRect.height });
  });

  resizeObserver.observe(chartContainer);

  return {
    chart,
    cleanup: cleanupFn
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

  // Calculate min and max values for gradient positioning
  const values = balanceHistory.map(item => item.balance);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const areaSeries = chart.addAreaSeries({
    lineColor: '#ef4444', // Red line color
    topColor: 'rgba(239, 68, 68, 0.8)', // Red at top (80% opacity)
    bottomColor: 'rgba(34, 197, 94, 0.8)', // Green at bottom (80% opacity)
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
  selectedSymbol?: string,
  markToMarketData?: MarkToMarketItem[],
  mode: DrawdownMode = 'realized'
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';

  const drawdownHistory = calculateDrawdownHistory(trades, initialBalance, markToMarketData, mode);
  
  if (drawdownHistory.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No ${mode} drawdown data available for ${selectedSymbol}`
      : `No ${mode} drawdown data available`;
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