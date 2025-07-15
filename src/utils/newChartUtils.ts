import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { Trade, DrillDownState } from '../types';

export interface ChartData {
  time: UTCTimestamp;
  value: number;
}

export interface HistogramData {
  time: UTCTimestamp;
  value: number;
  color?: string;
}

export interface PeriodReturn {
  startDate: Date;
  endDate: Date;
  returnPercent: number;
  trades: Trade[];
}

export function renderBalanceChart(
  container: HTMLElement,
  trades: Trade[],
  initialBalance: number,
  csvTimezone: number
): IChartApi | null {
  if (!container || trades.length === 0) return null;

  container.innerHTML = '';

  const chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#333',
    },
    width: container.clientWidth,
    height: 400,
    grid: {
      vertLines: { color: '#e1e5e9' },
      horzLines: { color: '#e1e5e9' },
    },
    rightPriceScale: {
      borderColor: '#cccccc',
    },
    timeScale: {
      borderColor: '#cccccc',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  const lineSeries = chart.addLineSeries({
    color: '#2563eb',
    lineWidth: 2,
  });

  // Calculate running balance
  let runningBalance = initialBalance;
  const balanceMap = new Map<number, number>();
  
  trades.forEach(trade => {
    runningBalance += trade.profit;
    const timestamp = Math.floor(trade.closeTime.getTime() / 1000);
    balanceMap.set(timestamp, runningBalance);
  });

  const balanceData: ChartData[] = Array.from(balanceMap.entries())
    .map(([time, value]) => ({
      time: time as UTCTimestamp,
      value,
    }))
    .sort((a, b) => a.time - b.time);

  lineSeries.setData(balanceData);

  return chart;
}

export function renderPeriodReturnsChart(
  container: HTMLElement,
  trades: Trade[],
  timezone: string,
  drillDownState: DrillDownState,
  onDrillDown?: (period: Date) => void
): IChartApi | null {
  if (!container || trades.length === 0) return null;

  container.innerHTML = '';

  const chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#333',
    },
    width: container.clientWidth,
    height: 400,
    grid: {
      vertLines: { color: '#e1e5e9' },
      horzLines: { color: '#e1e5e9' },
    },
    rightPriceScale: {
      borderColor: '#cccccc',
    },
    timeScale: {
      borderColor: '#cccccc',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // Calculate period returns based on drill-down level
  const returns = calculatePeriodReturns(trades, drillDownState);
  
  const histogramData: HistogramData[] = returns.map(item => ({
    time: Math.floor(item.startDate.getTime() / 1000) as UTCTimestamp,
    value: item.returnPercent,
    color: item.returnPercent >= 0 ? '#22c55e' : '#ef4444',
  }));

  const histogramSeries = chart.addHistogramSeries({
    color: '#2563eb',
    priceFormat: {
      type: 'custom',
      formatter: (price: number) => `${price.toFixed(1)}`,
    },
  });

  histogramSeries.setData(histogramData);

  // Create markers with all information combined
  const allMarkers = returns.map(item => {
    const buyTrades = item.trades.filter(trade => trade.type.toLowerCase() === 'buy').length;
    const sellTrades = item.trades.filter(trade => trade.type.toLowerCase() === 'sell').length;
    
    // Base marker with percentage
    const baseMarker = {
      time: Math.floor(item.startDate.getTime() / 1000) as UTCTimestamp,
      position: 'inBar' as const,
      color: 'transparent',
      shape: 'circle' as const,
      size: 0,
      text: `${item.returnPercent.toFixed(1)}%`
    };

    // Additional marker for trade counts in detailed view
    if (drillDownState.level === 'detailed') {
      return [
        baseMarker,
        {
          time: Math.floor(item.startDate.getTime() / 1000) as UTCTimestamp,
          position: 'aboveBar' as const,
          color: 'transparent',
          shape: 'circle' as const,
          size: 0,
          text: `B:${buyTrades} S:${sellTrades}`
        }
      ];
    }
    
    return [baseMarker];
  }).flat();

  // Sort markers by time to ensure proper ordering
  allMarkers.sort((a, b) => a.time - b.time);

  histogramSeries.setMarkers(allMarkers);

  // Add click handler for drill-down in monthly view
  if (drillDownState.level === 'monthly' && onDrillDown) {
    chart.subscribeClick((param) => {
      if (param.time) {
        const clickedTime = new Date((param.time as number) * 1000);
        onDrillDown(clickedTime);
      }
    });
  }

  // Add custom tooltip
  const tooltip = createCustomTooltip(container);
  
  chart.subscribeCrosshairMove((param) => {
    if (param.time) {
      const time = param.time as number;
      const periodData = returns.find(item => 
        Math.floor(item.startDate.getTime() / 1000) === time
      );
      
      if (periodData) {
        showTooltip(tooltip, param, periodData, drillDownState.level);
      } else {
        hideTooltip(tooltip);
      }
    } else {
      hideTooltip(tooltip);
    }
  });

  return chart;
}

function calculatePeriodReturns(trades: Trade[], drillDownState: DrillDownState): PeriodReturn[] {
  if (trades.length === 0) return [];

  const sortedTrades = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
  
  if (drillDownState.level === 'monthly') {
    // Group by month
    const monthlyGroups = new Map<string, Trade[]>();
    
    sortedTrades.forEach(trade => {
      const monthKey = `${trade.closeTime.getFullYear()}-${trade.closeTime.getMonth()}`;
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, []);
      }
      monthlyGroups.get(monthKey)!.push(trade);
    });

    return Array.from(monthlyGroups.entries()).map(([monthKey, monthTrades]) => {
      const [year, month] = monthKey.split('-').map(Number);
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      const totalProfit = monthTrades.reduce((sum, trade) => sum + trade.profit, 0);
      
      return {
        startDate,
        endDate,
        returnPercent: totalProfit,
        trades: monthTrades,
      };
    });
  } else {
    // Detailed view: group by 15-minute intervals for the selected month
    const selectedMonth = drillDownState.selectedPeriod;
    if (!selectedMonth) return [];

    const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
    
    const monthTrades = sortedTrades.filter(trade => 
      trade.closeTime >= monthStart && trade.closeTime <= monthEnd
    );

    // Group by 15-minute intervals
    const intervalGroups = new Map<number, Trade[]>();
    
    monthTrades.forEach(trade => {
      const time = trade.closeTime.getTime();
      const intervalStart = Math.floor(time / (15 * 60 * 1000)) * (15 * 60 * 1000);
      
      if (!intervalGroups.has(intervalStart)) {
        intervalGroups.set(intervalStart, []);
      }
      intervalGroups.get(intervalStart)!.push(trade);
    });

    return Array.from(intervalGroups.entries()).map(([intervalStart, intervalTrades]) => {
      const startDate = new Date(intervalStart);
      const endDate = new Date(intervalStart + 15 * 60 * 1000);
      const totalProfit = intervalTrades.reduce((sum, trade) => sum + trade.profit, 0);
      
      return {
        startDate,
        endDate,
        returnPercent: totalProfit,
        trades: intervalTrades,
      };
    });
  }
}

function createCustomTooltip(container: HTMLElement): HTMLElement {
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: absolute;
    display: none;
    padding: 12px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 12px;
    z-index: 1000;
    max-width: 32rem;
    max-height: 12rem;
    overflow-y: auto;
    pointer-events: auto;
    backdrop-filter: blur(4px);
  `;
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 4px;
    right: 8px;
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  closeButton.addEventListener('click', () => {
    tooltip.style.display = 'none';
  });
  
  tooltip.appendChild(closeButton);
  container.appendChild(tooltip);
  
  return tooltip;
}

function showTooltip(tooltip: HTMLElement, param: any, periodData: PeriodReturn, level: string): void {
  const buyTrades = periodData.trades.filter(trade => trade.type.toLowerCase() === 'buy');
  const sellTrades = periodData.trades.filter(trade => trade.type.toLowerCase() === 'sell');
  
  const formatDate = (date: Date) => {
    if (level === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else {
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  tooltip.innerHTML = `
    <button style="position: absolute; top: 4px; right: 8px; background: none; border: none; font-size: 16px; cursor: pointer; color: #666;">×</button>
    <div style="margin-bottom: 8px; font-weight: bold;">
      ${formatDate(periodData.startDate)}
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
      <div>Total Trades: ${periodData.trades.length}</div>
      <div>P/L: <span style="color: ${periodData.returnPercent >= 0 ? '#22c55e' : '#ef4444'}">${periodData.returnPercent.toFixed(2)}</span></div>
      <div style="color: #22c55e;">Buy: ${buyTrades.length}</div>
      <div style="color: #ef4444;">Sell: ${sellTrades.length}</div>
    </div>
    <div style="border-top: 1px solid #eee; padding-top: 8px;">
      <div style="font-weight: bold; margin-bottom: 4px;">Trades:</div>
      <div style="max-height: 120px; overflow-y: auto;">
        ${periodData.trades.map(trade => `
          <div style="margin-bottom: 4px; padding: 4px; background: #f9f9f9; border-radius: 4px; font-size: 11px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
              <div><strong>${trade.symbol}</strong></div>
              <div style="color: ${trade.type.toLowerCase() === 'buy' ? '#22c55e' : '#ef4444'};">${trade.type}</div>
              <div>Vol: ${trade.volume}</div>
              <div>P/L: <span style="color: ${trade.profit >= 0 ? '#22c55e' : '#ef4444'}">${trade.profit.toFixed(2)}</span></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Re-add close button event listener
  const closeBtn = tooltip.querySelector('button');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      tooltip.style.display = 'none';
    });
  }

  // Position tooltip
  const containerRect = tooltip.parentElement!.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  let left = param.point?.x || 0;
  let top = (param.point?.y || 0) - 10;
  
  // Adjust if tooltip would go outside container
  if (left + tooltipRect.width > containerRect.width) {
    left = containerRect.width - tooltipRect.width - 10;
  }
  if (top < 0) {
    top = 10;
  }
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.display = 'block';
}

function hideTooltip(tooltip: HTMLElement): void {
  // Add a small delay to allow moving to tooltip
  setTimeout(() => {
    if (!tooltip.matches(':hover')) {
      tooltip.style.display = 'none';
    }
  }, 100);
}

export function renderDrawdownChart(
  container: HTMLElement,
  trades: Trade[],
  initialBalance: number,
  csvTimezone: number
): IChartApi | null {
  if (!container || trades.length === 0) return null;

  container.innerHTML = '';

  const chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#333',
    },
    width: container.clientWidth,
    height: 400,
    grid: {
      vertLines: { color: '#e1e5e9' },
      horzLines: { color: '#e1e5e9' },
    },
    rightPriceScale: {
      borderColor: '#cccccc',
    },
    timeScale: {
      borderColor: '#cccccc',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  const areaSeries = chart.addAreaSeries({
    topColor: 'rgba(239, 68, 68, 0.4)',
    bottomColor: 'rgba(239, 68, 68, 0.1)',
    lineColor: '#ef4444',
    lineWidth: 2,
  });

  // Calculate drawdown
  let runningBalance = initialBalance;
  let peak = initialBalance;
  const drawdownMap = new Map<number, number>();
  
  trades.forEach(trade => {
    runningBalance += trade.profit;
    peak = Math.max(peak, runningBalance);
    const drawdown = runningBalance - peak;
    const timestamp = Math.floor(trade.closeTime.getTime() / 1000);
    drawdownMap.set(timestamp, drawdown);
  });
    
  const drawdownData: ChartData[] = Array.from(drawdownMap.entries())
    .map(([time, value]) => ({
      time: time as UTCTimestamp,
      value,
    }))
    .sort((a, b) => a.time - b.time);

  areaSeries.setData(drawdownData);

  return chart;
}