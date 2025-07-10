import { ChartDataPoint, TradeHistoryItem, MarkToMarketItem } from '../types';
import { createChart, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts';

export const renderChart = (
  container: HTMLDivElement, 
  trades: TradeHistoryItem[],
  markToMarket: MarkToMarketItem[],
  timeFilter: '1d' | '7d' | '30d' | '1y',
  selectedSymbol?: string,
  csvTimezone: number = 0
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';
  
  console.log(`Rendering chart for ${selectedSymbol}`);
  console.log(`Trade data points: ${trades.length}`);
  console.log(`Mark-to-market data points: ${markToMarket.length}`);
  
  if (trades.length > 0) {
    // Sort trades by time to get actual first and last
    const sortedTrades = [...trades].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    console.log(sortedTrades[0])
    console.log(`First trade time: ${sortedTrades[0].time}`);
    console.log(`Last trade time: ${sortedTrades[sortedTrades.length - 1].time}`);
  }
  
  if (markToMarket.length > 0) {
    // Sort MTM data by time to get actual first and last
    const sortedMTM = [...markToMarket].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    console.log(`First MTM time: ${sortedMTM[0].date}`);
    console.log(`Last MTM time: ${sortedMTM[sortedMTM.length - 1].date}`);
  }
  
  // Use the trades passed in (already filtered by symbol)
  const tradeData = trades.map(trade => {
    // Trade times are already in CSV timezone
    const tradeTime = new Date(trade.time);
    
    // Log the first few trade times for debugging
    if (trades.indexOf(trade) < 3) {
      console.log(`Trade ${trades.indexOf(trade)}: ${trade.time} -> timestamp: ${tradeTime.getTime() / 1000}`);
    }
    
    return {
      time: tradeTime.getTime() / 1000,
      value: parseFloat(trade.price),
      trade: trade
    };
  }).filter(point => !isNaN(point.value));

  // Mark-to-market data should already be synchronized with CSV timezone
  const markToMarketData = markToMarket.map(item => ({
    time: new Date(item.date).getTime() / 1000,
    value: parseFloat(item.eoPeriodPrice.replace('$', '')),
    item: item
  })).filter(point => !isNaN(point.value));
  
  console.log(`Processed trade data points: ${tradeData.length}`);
  console.log(`Processed MTM data points: ${markToMarketData.length}`);
  
  const now = new Date();
  let startDate: Date;
  
  switch (timeFilter) {
    case '1d':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case '7d':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case '30d':
      startDate = new Date(now.setDate(now.getDate() - 30));
      break;
    case '1y':
      startDate = new Date(now.setFullYear(now.getFullYear() - 2));
      break;
  }

  const filteredTradeData = tradeData.filter(point => {
    const pointDate = new Date(point.time * 1000);
    return pointDate >= startDate;
  });

  const filteredMarkToMarketData = markToMarketData.filter(point => {
    const pointDate = new Date(point.time * 1000);
    return pointDate >= startDate;
  });

  filteredTradeData.sort((a, b) => a.time - b.time);
  filteredMarkToMarketData.sort((a, b) => a.time - b.time);

  // Round all timestamps to 15-minute intervals to prevent duplicates
  const roundToFifteenMinutes = (timestamp: number): number => {
    const date = new Date(timestamp * 1000);
    const minutes = date.getMinutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    date.setMinutes(roundedMinutes, 0, 0);
    return Math.floor(date.getTime() / 1000);
  };

  // Group trade data by 15-minute intervals, keeping the most representative price
  const groupedTradeDataMap = new Map();
  filteredTradeData.forEach(point => {
    const roundedTime = roundToFifteenMinutes(point.time);
    
    if (!groupedTradeDataMap.has(roundedTime)) {
      groupedTradeDataMap.set(roundedTime, {
        time: roundedTime,
        value: point.value,
        count: 1,
        totalValue: point.value,
        trade: point.trade
      });
    } else {
      const existing = groupedTradeDataMap.get(roundedTime);
      existing.count++;
      existing.totalValue += point.value;
      existing.value = existing.totalValue / existing.count; // Average price for the interval
    }
  });
  
  const uniqueTradeData = Array.from(groupedTradeDataMap.values())
    .map(group => ({
      time: group.time,
      value: group.value,
      trade: group.trade
    }))
    .sort((a, b) => a.time - b.time);

  // Group mark-to-market data by 15-minute intervals
  const groupedMTMDataMap = new Map();
  filteredMarkToMarketData.forEach(point => {
    const roundedTime = roundToFifteenMinutes(point.time);
    
    if (!groupedMTMDataMap.has(roundedTime)) {
      groupedMTMDataMap.set(roundedTime, {
        time: roundedTime,
        value: point.value,
        count: 1,
        totalValue: point.value,
        item: point.item
      });
    } else {
      const existing = groupedMTMDataMap.get(roundedTime);
      existing.count++;
      existing.totalValue += point.value;
      existing.value = existing.totalValue / existing.count; // Average price for the interval
    }
  });
  
  const uniqueMarkToMarketData = Array.from(groupedMTMDataMap.values())
    .map(group => ({
      time: group.time,
      value: group.value,
      item: group.item
    }))
    .sort((a, b) => a.time - b.time);

  console.log(`After 15-min grouping - Trade data points: ${uniqueTradeData.length}`);
  console.log(`After 15-min grouping - MTM data points: ${uniqueMarkToMarketData.length}`);
  
  if (uniqueTradeData.length > 0) {
    console.log(`First grouped trade timestamp: ${new Date(uniqueTradeData[0].time * 1000).toISOString()}`);
    console.log(`Last grouped trade timestamp: ${new Date(uniqueTradeData[uniqueTradeData.length - 1].time * 1000).toISOString()}`);
  }

  // Bundle trades that occur at the same time (rounded to 15-minute intervals)
  const bundledTradeMarkers = new Map();
  
  trades
    .filter(trade => {
      const tradeTime = new Date(trade.time);
      return tradeTime >= startDate;
    })
    .forEach(trade => {
      const tradeTime = new Date(trade.time);
      // Round to nearest 15-minute interval to group nearby trades
      const timeKey = roundToFifteenMinutes(Math.floor(tradeTime.getTime() / 1000));
      
      if (!bundledTradeMarkers.has(timeKey)) {
        bundledTradeMarkers.set(timeKey, {
          time: timeKey,
          trades: [],
          hasEntry: false,
          hasExit: false
        });
      }
      
      const bundle = bundledTradeMarkers.get(timeKey);
      bundle.trades.push(trade);
      
      if (trade.direction.toLowerCase() === 'in') {
        bundle.hasEntry = true;
      } else if (trade.direction.toLowerCase() === 'out') {
        bundle.hasExit = true;
      }
    });

  // Convert bundled markers to chart markers
  const tradeMarkers = Array.from(bundledTradeMarkers.values())
    .map(bundle => {
      let color = '#6b7280'; // Default gray
      if (bundle.hasEntry && bundle.hasExit) {
        color = '#f59e0b'; // Orange for mixed
      } else if (bundle.hasEntry) {
        color = '#22c55e'; // Green for entry
      } else if (bundle.hasExit) {
        color = '#ef4444'; // Red for exit
      }
      
      return {
        time: bundle.time,
        position: 'inBar',
        color: color,
        shape: 'circle',
        size: Math.min(6, 2 + bundle.trades.length), // Size based on number of trades
        trades: bundle.trades
      };
    })
    .sort((a, b) => a.time - b.time);

  if (uniqueTradeData.length === 0 && uniqueMarkToMarketData.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No data available for ${selectedSymbol} in the selected time range`
      : 'No data available for the selected time range';
    container.appendChild(message);
    return { chart: null, cleanup: () => {} };
  }

  const labelContainer = document.createElement('div');
  labelContainer.className = 'absolute top-4 right-4 bg-white/90 px-3 py-1.5 rounded-md shadow-sm border text-sm';
  container.style.position = 'relative';
  container.appendChild(labelContainer);

  const tooltipContainer = document.createElement('div');
  tooltipContainer.className = 'absolute hidden bg-gray-900 text-white text-xs rounded py-2 px-3 z-50 max-w-md shadow-lg border border-gray-700';
  tooltipContainer.style.pointerEvents = 'auto'; // Allow mouse interaction
  container.appendChild(tooltipContainer);

  // Add close button functionality
  let tooltipTimeout: NodeJS.Timeout | null = null;
  let isTooltipHovered = false;

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
      entireTextOnly: false,
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 12,
      barSpacing: 8,
      minBarSpacing: 6,
      fixLeftEdge: false,
      fixRightEdge: false,
      lockVisibleTimeRangeOnResize: false,
    },
    grid: {
      horzLines: {
        color: '#f3f4f6',
        style: LineStyle.Solid,
      },
      vertLines: {
        color: '#f3f4f6',
        style: LineStyle.Solid,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        labelBackgroundColor: '#2962FF',
      },
      horzLine: {
        labelBackgroundColor: '#2962FF',
      },
    },
  });

  const tradeSeries = uniqueTradeData.length > 0 ? chart.addLineSeries({
    color: '#2962FF',
    lineWidth: 2,
    title: 'Trade History',
    priceFormat: {
      type: 'price',
      precision: 5,
      minMove: 0.00001,
    },
  }) : null;

  if (tradeSeries) {
    tradeSeries.setMarkers(tradeMarkers);
    tradeSeries.setData(uniqueTradeData.map(d => ({ time: d.time, value: d.value })));
  }

  const markToMarketSeries = uniqueMarkToMarketData.length > 0 ? chart.addLineSeries({
    color: '#ef4444',
    lineWidth: 2,
    title: 'Mark to Market',
    priceFormat: {
      type: 'price',
      precision: 5,
      minMove: 0.00001,
    },
  }) : null;

  if (markToMarketSeries) {
    markToMarketSeries.setData(uniqueMarkToMarketData.map(d => ({ time: d.time, value: d.value })));
  }

  chart.subscribeCrosshairMove(param => {
    if (param.time) {
      // Find exact marker match (since we're now using rounded timestamps)
      const marker = tradeMarkers.find(m => m.time === param.time);
      
      if (marker?.trades && marker.trades.length > 0) {
        const trades = marker.trades;
        
        // Calculate totals for the bundle
        const totalVolume = trades.reduce((sum, trade) => sum + parseFloat(trade.volume || '0'), 0);
        const totalProfit = trades.reduce((sum, trade) => sum + parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0'), 0);
        const entryTrades = trades.filter(t => t.direction.toLowerCase() === 'in');
        const exitTrades = trades.filter(t => t.direction.toLowerCase() === 'out');
        
        // Format time consistently with CSV timezone
        const timeDate = new Date(param.time * 1000);
        // Apply CSV timezone offset to display time correctly
        const adjustedTime = new Date(timeDate.getTime() + (csvTimezone * 60 * 60 * 1000));
        const formattedTime = `${String(adjustedTime.getHours()).padStart(2, '0')}:${String(adjustedTime.getMinutes()).padStart(2, '0')}`;
        
        // Create scrollable content for many trades
        const maxTradesShown = 5;
        const hasMoreTrades = trades.length > maxTradesShown;
        const tradesToShow = trades.slice(0, maxTradesShown);
        
        tooltipContainer.innerHTML = `
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <div class="font-semibold border-b border-gray-600 pb-1 flex-1">
                ${trades.length} Trade${trades.length > 1 ? 's' : ''} at ${formattedTime}
              </div>
              <button class="ml-2 text-gray-400 hover:text-white text-lg leading-none" onclick="this.parentElement.parentElement.parentElement.style.display='none'">×</button>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>Total Volume: ${totalVolume.toFixed(2)}</div>
              <div class="${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}">
                Total P/L: $${totalProfit.toFixed(2)}
              </div>
              ${entryTrades.length > 0 ? `<div class="text-green-400">Entries: ${entryTrades.length}</div>` : ''}
              ${exitTrades.length > 0 ? `<div class="text-red-400">Exits: ${exitTrades.length}</div>` : ''}
            </div>
            <div class="space-y-1 ${hasMoreTrades ? 'max-h-48 overflow-y-auto' : ''} pr-1">
              ${tradesToShow.map((trade, index) => `
                <div class="text-xs border-t border-gray-700 pt-1 ${index === 0 ? 'border-t-0 pt-0' : ''}">
                  <div class="flex justify-between">
                    <span class="${trade.direction.toLowerCase() === 'in' ? 'text-green-400' : 'text-red-400'}">
                      ${trade.direction.toUpperCase()} ${trade.type}
                    </span>
                    <span>${trade.symbol}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Vol: ${trade.volume}</span>
                    <span>Price: $${parseFloat(trade.price).toFixed(5)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="${parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') >= 0 ? 'text-green-400' : 'text-red-400'}">
                      P/L: ${trade.profit}
                    </span>
                    <span class="text-gray-400">Deal: ${trade.deal}</span>
                  </div>
                </div>
              `).join('')}
              ${hasMoreTrades ? `
                <div class="text-xs text-gray-400 text-center pt-2 border-t border-gray-700">
                  ... and ${trades.length - maxTradesShown} more trades
                </div>
              ` : ''}
            </div>
          </div>
        `;
        
        // Position tooltip
        const containerRect = container.getBoundingClientRect();
        const tooltipRect = tooltipContainer.getBoundingClientRect();
        
        let left = param.point?.x || 0;
        let top = (param.point?.y || 0) - tooltipContainer.offsetHeight - 10;
        
        // Adjust if tooltip goes outside container
        if (left + tooltipContainer.offsetWidth > containerRect.width) {
          left = containerRect.width - tooltipContainer.offsetWidth - 10;
        }
        if (left < 0) {
          left = 10;
        }
        if (top < 0) {
          top = (param.point?.y || 0) + 10; // Show below cursor if no space above
        }
        
        tooltipContainer.style.display = 'block';
        tooltipContainer.style.left = `${left}px`;
        tooltipContainer.style.top = `${top}px`;
        
        // Clear any existing timeout
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
          tooltipTimeout = null;
        }
        
        // Add hover listeners to tooltip
        tooltipContainer.onmouseenter = () => {
          isTooltipHovered = true;
          if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
          }
        };
        
        tooltipContainer.onmouseleave = () => {
          isTooltipHovered = false;
          tooltipTimeout = setTimeout(() => {
            if (!isTooltipHovered) {
              tooltipContainer.style.display = 'none';
            }
          }, 300);
        };
      } else {
        // Hide tooltip with delay if not hovering over it
        if (!isTooltipHovered) {
          tooltipTimeout = setTimeout(() => {
            if (!isTooltipHovered) {
              tooltipContainer.style.display = 'none';
            }
          }, 100);
        }
      }

      const prices = param.seriesPrices || new Map();
      const tradePrice = tradeSeries && prices.has(tradeSeries) ? prices.get(tradeSeries)?.toFixed(5) : undefined;
      const mtmPrice = markToMarketSeries && prices.has(markToMarketSeries) ? prices.get(markToMarketSeries)?.toFixed(5) : undefined;
      
      labelContainer.innerHTML = `
        ${tradePrice ? `<span class="text-blue-600">Trade: $${tradePrice}</span>` : ''}
        ${tradePrice && mtmPrice ? ' | ' : ''}
        ${mtmPrice ? `<span class="text-red-600">MTM: $${mtmPrice}</span>` : ''}
      `;
    } else {
      const lastTrade = uniqueTradeData[uniqueTradeData.length - 1]?.value.toFixed(5);
      const lastMTM = uniqueMarkToMarketData[uniqueMarkToMarketData.length - 1]?.value.toFixed(5);
      
      labelContainer.innerHTML = `
        ${lastTrade ? `<span class="text-blue-600">Trade: $${lastTrade}</span>` : ''}
        ${lastTrade && lastMTM ? ' | ' : ''}
        ${lastMTM ? `<span class="text-red-600">MTM: $${lastMTM}</span>` : ''}
      `;
      
      // Hide tooltip when not hovering over chart
      if (!isTooltipHovered) {
        tooltipTimeout = setTimeout(() => {
          if (!isTooltipHovered) {
            tooltipContainer.style.display = 'none';
          }
        }, 100);
      }
    }
  });

  chart.applyOptions({
    rightPriceScale: {
      visible: true,
      borderColor: '#2962FF',
    },
  });

  chart.timeScale().fitContent();

  // Set minimum zoom level to prevent going below 15-minute intervals
  chart.timeScale().applyOptions({
    barSpacing: 8,
    minBarSpacing: 6,
    // Ensure timezone consistency
    timezone: csvTimezone === 0 ? 'Etc/UTC' : `Etc/GMT${csvTimezone > 0 ? '-' : '+'}${Math.abs(csvTimezone)}`,
  });

  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) {
      return;
    }
    
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

// Navigation helper functions
export const navigateToAbsoluteStart = (chart: any) => {
  if (chart) {
    // Get the visible logical range to find the actual data boundaries
    const visibleRange = chart.timeScale().getVisibleLogicalRange();
    if (visibleRange) {
      // Set visible range to start from the very beginning of data
      // Use a small range (about 100 bars) starting from the first data point
      chart.timeScale().setVisibleLogicalRange({
        from: 0,
        to: Math.min(100, visibleRange.to)
      });
    } else {
      // Fallback: fit content then scroll to start
      chart.timeScale().fitContent();
      setTimeout(() => {
        chart.timeScale().scrollToPosition(-2000, false);
      }, 100);
    }
  }
};

export const navigateToAbsoluteEnd = (chart: any) => {
  if (chart) {
    // Get the visible logical range to find the actual data boundaries
    const visibleRange = chart.timeScale().getVisibleLogicalRange();
    if (visibleRange) {
      // Set visible range to show the end of data
      // Use a range of about 100 bars ending at the last data point
      const rangeSize = Math.min(100, visibleRange.to);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, visibleRange.to - rangeSize),
        to: visibleRange.to
      });
    } else {
      // Fallback: scroll to real time
      chart.timeScale().scrollToRealTime();
    }
  }
};

export const renderMarkToMarketChart = (
  container: HTMLDivElement,
  markToMarket: MarkToMarketItem[],
  initialBalance: number,
  timeFilter: '1d' | '7d' | '30d' | '1y',
  trades: TradeHistoryItem[] = [],
  selectedSymbol?: string,
  csvTimezone: number = 0
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';

  const totalData = markToMarket.map(item => ({
    time: new Date(item.date).getTime() / 1000,
    value: initialBalance + parseFloat(item.total.replace('$', '')),
    item: item
  })).filter(point => !isNaN(point.value));

  const closedData = markToMarket.map(item => ({
    time: new Date(item.date).getTime() / 1000,
    value: initialBalance + parseFloat(item.closed.replace('$', '')),
    item: item
  })).filter(point => !isNaN(point.value));

  const now = new Date();
  let startDate: Date;
  
  switch (timeFilter) {
    case '1d':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case '7d':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case '30d':
      startDate = new Date(now.setDate(now.getDate() - 30));
      break;
    case '1y':
      startDate = new Date(now.setFullYear(now.getFullYear() - 2));
      break;
  }

  const filteredTotalData = totalData.filter(point => {
    const pointDate = new Date(point.time * 1000);
    return pointDate >= startDate;
  });

  const filteredClosedData = closedData.filter(point => {
    const pointDate = new Date(point.time * 1000);
    return pointDate >= startDate;
  });

  filteredTotalData.sort((a, b) => a.time - b.time);
  filteredClosedData.sort((a, b) => a.time - b.time);

  // Round all timestamps to 15-minute intervals to prevent duplicates
  const roundToFifteenMinutes = (timestamp: number): number => {
    const date = new Date(timestamp * 1000);
    const minutes = date.getMinutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    date.setMinutes(roundedMinutes, 0, 0);
    return Math.floor(date.getTime() / 1000);
  };

  // Group total data by 15-minute intervals
  const groupedTotalDataMap = new Map();
  filteredTotalData.forEach(point => {
    const roundedTime = roundToFifteenMinutes(point.time);
    
    if (!groupedTotalDataMap.has(roundedTime)) {
      groupedTotalDataMap.set(roundedTime, {
        time: roundedTime,
        value: point.value,
        count: 1,
        totalValue: point.value,
        item: point.item
      });
    } else {
      const existing = groupedTotalDataMap.get(roundedTime);
      existing.count++;
      existing.totalValue += point.value;
      existing.value = existing.totalValue / existing.count;
    }
  });
  
  const uniqueTotalData = Array.from(groupedTotalDataMap.values())
    .map(group => ({
      time: group.time,
      value: group.value,
      item: group.item
    }))
    .sort((a, b) => a.time - b.time);

  // Group closed data by 15-minute intervals
  const groupedClosedDataMap = new Map();
  filteredClosedData.forEach(point => {
    const roundedTime = roundToFifteenMinutes(point.time);
    
    if (!groupedClosedDataMap.has(roundedTime)) {
      groupedClosedDataMap.set(roundedTime, {
        time: roundedTime,
        value: point.value,
        count: 1,
        totalValue: point.value,
        item: point.item
      });
    } else {
      const existing = groupedClosedDataMap.get(roundedTime);
      existing.count++;
      existing.totalValue += point.value;
      existing.value = existing.totalValue / existing.count;
    }
  });
  
  const uniqueClosedData = Array.from(groupedClosedDataMap.values())
    .map(group => ({
      time: group.time,
      value: group.value,
      item: group.item
    }))
    .sort((a, b) => a.time - b.time);

  // Bundle trades for mark-to-market chart as well
  const bundledMTMMarkers = new Map();
  
  trades
    .filter(trade => {
      const tradeTime = new Date(trade.time);
      return tradeTime >= startDate;
    })
    .forEach(trade => {
      const tradeTime = new Date(trade.time);
      // Round to nearest 15-minute interval to group nearby trades
      const timeKey = roundToFifteenMinutes(Math.floor(tradeTime.getTime() / 1000));
      
      if (!bundledMTMMarkers.has(timeKey)) {
        bundledMTMMarkers.set(timeKey, {
          time: timeKey,
          trades: [],
          hasEntry: false,
          hasExit: false
        });
      }
      
      const bundle = bundledMTMMarkers.get(timeKey);
      bundle.trades.push(trade);
      
      if (trade.direction.toLowerCase() === 'in') {
        bundle.hasEntry = true;
      } else if (trade.direction.toLowerCase() === 'out') {
        bundle.hasExit = true;
      }
    });

  // Convert bundled markers to chart markers for MTM chart
  const mtmTradeMarkers = Array.from(bundledMTMMarkers.values())
    .map(bundle => {
      let color = '#6b7280';
      if (bundle.hasEntry && bundle.hasExit) {
        color = '#f59e0b';
      } else if (bundle.hasEntry) {
        color = '#22c55e';
      } else if (bundle.hasExit) {
        color = '#ef4444';
      }
      
      return {
        time: bundle.time,
        position: 'inBar',
        color: color,
        shape: 'circle',
        size: Math.min(6, 2 + bundle.trades.length),
        trades: bundle.trades
      };
    })
    .sort((a, b) => a.time - b.time);

  if (uniqueTotalData.length === 0 && uniqueClosedData.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No mark-to-market data available for ${selectedSymbol} in the selected time range`
      : 'No data available for the selected time range';
    container.appendChild(message);
    return { chart: null, cleanup: () => {} };
  }

  const labelContainer = document.createElement('div');
  labelContainer.className = 'absolute top-4 right-4 bg-white/90 px-3 py-1.5 rounded-md shadow-sm border text-sm';
  container.style.position = 'relative';
  container.appendChild(labelContainer);

  const tooltipContainer = document.createElement('div');
  tooltipContainer.className = 'absolute hidden bg-gray-900 text-white text-xs rounded py-2 px-3 z-50 max-w-md shadow-lg border border-gray-700';
  tooltipContainer.style.pointerEvents = 'auto'; // Allow mouse interaction
  container.appendChild(tooltipContainer);

  // Add tooltip interaction variables
  let mtmTooltipTimeout: NodeJS.Timeout | null = null;
  let isMtmTooltipHovered = false;

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
      entireTextOnly: false,
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 12,
      barSpacing: 8,
      minBarSpacing: 6,
      fixLeftEdge: false,
      fixRightEdge: false,
      lockVisibleTimeRangeOnResize: false,
    },
    grid: {
      horzLines: {
        color: '#f3f4f6',
        style: LineStyle.Solid,
      },
      vertLines: {
        color: '#f3f4f6',
        style: LineStyle.Solid,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
  });

  const totalSeries = uniqueTotalData.length > 0 ? chart.addLineSeries({
    color: '#ef4444',
    lineWidth: 2,
    title: 'Total',
    priceFormat: {
      type: 'price',
      precision: 5,
      minMove: 0.00001,
    },
  }) : null;

  const closedSeries = uniqueClosedData.length > 0 ? chart.addLineSeries({
    color: '#22c55e',
    lineWidth: 2,
    title: 'Closed',
    priceFormat: {
      type: 'price',
      precision: 5,
      minMove: 0.00001,
    },
  }) : null;

  if (closedSeries) {
    closedSeries.setMarkers(mtmTradeMarkers);
    closedSeries.setData(uniqueClosedData.map(d => ({ time: d.time, value: d.value })));
  }

  if (totalSeries) {
    totalSeries.setData(uniqueTotalData.map(d => ({ time: d.time, value: d.value })));
  }

  chart.subscribeCrosshairMove(param => {
    if (param.time) {
      // Find exact marker match (since we're now using rounded timestamps)
      const marker = mtmTradeMarkers.find(m => m.time === param.time);
      
      if (marker?.trades && marker.trades.length > 0) {
        const trades = marker.trades;
        
        const totalVolume = trades.reduce((sum, trade) => sum + parseFloat(trade.volume || '0'), 0);
        const totalProfit = trades.reduce((sum, trade) => sum + parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0'), 0);
        const entryTrades = trades.filter(t => t.direction.toLowerCase() === 'in');
        const exitTrades = trades.filter(t => t.direction.toLowerCase() === 'out');
        
        // Format time consistently with CSV timezone
        const timeDate = new Date(param.time * 1000);
        // Apply CSV timezone offset to display time correctly
        const adjustedTime = new Date(timeDate.getTime() + (csvTimezone * 60 * 60 * 1000));
        const formattedTime = `${String(adjustedTime.getHours()).padStart(2, '0')}:${String(adjustedTime.getMinutes()).padStart(2, '0')}`;
        
        // Create scrollable content for many trades
        const maxTradesShown = 5;
        const hasMoreTrades = trades.length > maxTradesShown;
        const tradesToShow = trades.slice(0, maxTradesShown);
        
        tooltipContainer.innerHTML = `
          <div class="space-y-2">
            <div class="font-semibold border-b border-gray-600 pb-1">
              ${trades.length} Trade${trades.length > 1 ? 's' : ''} at ${formattedTime}
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>Total Volume: ${totalVolume.toFixed(2)}</div>
              <div class="${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}">
                Total P/L: $${totalProfit.toFixed(2)}
              </div>
              ${entryTrades.length > 0 ? `<div class="text-green-400">Entries: ${entryTrades.length}</div>` : ''}
              ${exitTrades.length > 0 ? `<div class="text-red-400">Exits: ${exitTrades.length}</div>` : ''}
            </div>
            <div class="space-y-1 ${hasMoreTrades ? 'max-h-48 overflow-y-auto' : ''} pr-1">
              ${tradesToShow.map((trade, index) => `
                <div class="text-xs border-t border-gray-700 pt-1 ${index === 0 ? 'border-t-0 pt-0' : ''}">
                  <div class="flex justify-between">
                    <span class="${trade.direction.toLowerCase() === 'in' ? 'text-green-400' : 'text-red-400'}">
                      ${trade.direction.toUpperCase()} ${trade.type}
                    </span>
                    <span>${trade.symbol}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Vol: ${trade.volume}</span>
                    <span>Price: $${parseFloat(trade.price).toFixed(5)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="${parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') >= 0 ? 'text-green-400' : 'text-red-400'}">
                      P/L: ${trade.profit}
                    </span>
                    <span class="text-gray-400">Deal: ${trade.deal}</span>
                  </div>
                </div>
              `).join('')}
              ${hasMoreTrades ? `
                <div class="text-xs text-gray-400 text-center pt-2 border-t border-gray-700">
                  ... and ${trades.length - maxTradesShown} more trades
                </div>
              ` : ''}
            </div>
          </div>
        `;
        
        // Position tooltip
        const containerRect = container.getBoundingClientRect();
        
        let left = param.point?.x || 0;
        let top = (param.point?.y || 0) - tooltipContainer.offsetHeight - 10;
        
        // Adjust if tooltip goes outside container
        if (left + tooltipContainer.offsetWidth > containerRect.width) {
          left = containerRect.width - tooltipContainer.offsetWidth - 10;
        }
        if (left < 0) {
          left = 10;
        }
        if (top < 0) {
          top = (param.point?.y || 0) + 10; // Show below cursor if no space above
        }
        
        tooltipContainer.style.display = 'block';
        tooltipContainer.style.left = `${left}px`;
        tooltipContainer.style.top = `${top}px`;
        
        // Clear any existing timeout
        if (mtmTooltipTimeout) {
          clearTimeout(mtmTooltipTimeout);
          mtmTooltipTimeout = null;
        }
        
        // Add hover listeners to tooltip
        tooltipContainer.onmouseenter = () => {
          isMtmTooltipHovered = true;
          if (mtmTooltipTimeout) {
            clearTimeout(mtmTooltipTimeout);
            mtmTooltipTimeout = null;
          }
        };
        
        tooltipContainer.onmouseleave = () => {
          isMtmTooltipHovered = false;
          mtmTooltipTimeout = setTimeout(() => {
            if (!isMtmTooltipHovered) {
              tooltipContainer.style.display = 'none';
            }
          }, 300);
        };
      } else {
        // Hide tooltip with delay if not hovering over it
        if (!isMtmTooltipHovered) {
          mtmTooltipTimeout = setTimeout(() => {
            if (!isMtmTooltipHovered) {
              tooltipContainer.style.display = 'none';
            }
          }, 100);
        }
      }

      const prices = param.seriesPrices || new Map();
      const totalValue = totalSeries && prices.has(totalSeries) ? prices.get(totalSeries)?.toFixed(5) : undefined;
      const closedValue = closedSeries && prices.has(closedSeries) ? prices.get(closedSeries)?.toFixed(5) : undefined;
      
      labelContainer.innerHTML = `
        ${totalValue ? `<span class="text-red-600">Total: $${totalValue}</span>` : ''}
        ${totalValue && closedValue ? ' | ' : ''}
        ${closedValue ? `<span class="text-green-600">Closed: $${closedValue}</span>` : ''}
      `;
    } else {
      const lastTotal = uniqueTotalData[uniqueTotalData.length - 1]?.value.toFixed(5);
      const lastClosed = uniqueClosedData[uniqueClosedData.length - 1]?.value.toFixed(5);
      
      labelContainer.innerHTML = `
        ${lastTotal ? `<span class="text-red-600">Total: $${lastTotal}</span>` : ''}
        ${lastTotal && lastClosed ? ' | ' : ''}
        ${lastClosed ? `<span class="text-green-600">Closed: $${lastClosed}</span>` : ''}
      `;
      
      // Hide tooltip when not hovering over chart
      if (!isMtmTooltipHovered) {
        mtmTooltipTimeout = setTimeout(() => {
          if (!isMtmTooltipHovered) {
            tooltipContainer.style.display = 'none';
          }
        }, 100);
      }
    }
  });

  chart.timeScale().fitContent();

  // Set minimum zoom level to prevent going below 15-minute intervals
  chart.timeScale().applyOptions({
    barSpacing: 8,
    minBarSpacing: 6,
    // Ensure timezone consistency
    timezone: csvTimezone === 0 ? 'Etc/UTC' : `Etc/GMT${csvTimezone > 0 ? '-' : '+'}${Math.abs(csvTimezone)}`,
  });

  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) {
      return;
    }
    
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

export const renderOpenPositionsChart = (
  container: HTMLDivElement,
  markToMarket: MarkToMarketItem[],
  timeFilter: '1d' | '7d' | '30d' | '1y',
  selectedSymbol?: string,
  csvTimezone: number = 0
): { chart: any; cleanup: () => void } => {
  container.innerHTML = '';

  const openData = markToMarket.map(item => ({
    time: new Date(item.date).getTime() / 1000,
    value: parseFloat(item.open.replace('$', '')),
    trades: item.trades || [],
    numPositions: parseInt(item.position) || 0,
    item: item
  })).filter(point => !isNaN(point.value));

  const now = new Date();
  let startDate: Date;
  
  switch (timeFilter) {
    case '1d':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case '7d':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case '30d':
      startDate = new Date(now.setDate(now.getDate() - 30));
      break;
    case '1y':
      startDate = new Date(now.setFullYear(now.getFullYear() - 2));
      break;
  }

  const filteredOpenData = openData.filter(point => {
    const pointDate = new Date(point.time * 1000);
    return pointDate >= startDate;
  });

  filteredOpenData.sort((a, b) => a.time - b.time);

  // Round all timestamps to 15-minute intervals to prevent duplicates
  const roundToFifteenMinutes = (timestamp: number): number => {
    const date = new Date(timestamp * 1000);
    const minutes = date.getMinutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    date.setMinutes(roundedMinutes, 0, 0);
    return Math.floor(date.getTime() / 1000);
  };

  // Group open data by 15-minute intervals
  const groupedOpenDataMap = new Map();
  filteredOpenData.forEach(point => {
    const roundedTime = roundToFifteenMinutes(point.time);
    
    if (!groupedOpenDataMap.has(roundedTime)) {
      groupedOpenDataMap.set(roundedTime, {
        time: roundedTime,
        value: point.value,
        trades: point.trades,
        numPositions: point.numPositions,
        item: point.item,
        count: 1,
        totalValue: point.value
      });
    } else {
      const existing = groupedOpenDataMap.get(roundedTime);
      existing.count++;
      existing.totalValue += point.value;
      existing.value = existing.totalValue / existing.count;
      // Keep the trades from the most recent point in the interval
      existing.trades = point.trades;
      existing.numPositions = point.numPositions;
      existing.item = point.item;
    }
  });
  
  const uniqueOpenData = Array.from(groupedOpenDataMap.values())
    .map(group => ({
      time: group.time,
      value: group.value,
      trades: group.trades,
      numPositions: group.numPositions,
      item: group.item
    }))
    .sort((a, b) => a.time - b.time);

  if (uniqueOpenData.length === 0) {
    const message = document.createElement('div');
    message.className = 'flex items-center justify-center h-full text-gray-500';
    message.textContent = selectedSymbol 
      ? `No open positions data available for ${selectedSymbol} in the selected time range`
      : 'No data available for the selected time range';
    container.appendChild(message);
    return { chart: null, cleanup: () => {} };
  }

  const labelContainer = document.createElement('div');
  labelContainer.className = 'absolute top-4 right-4 bg-white/90 px-3 py-1.5 rounded-md shadow-sm border text-sm';
  container.style.position = 'relative';
  container.appendChild(labelContainer);

  const tooltipContainer = document.createElement('div');
  tooltipContainer.className = 'absolute hidden bg-gray-900 text-white text-xs rounded py-1 px-2 pointer-events-none z-50';
  container.appendChild(tooltipContainer);

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
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      barSpacing: 8,
      minBarSpacing: 6,
      fixLeftEdge: false,
      fixRightEdge: false,
      lockVisibleTimeRangeOnResize: false,
    },
    grid: {
      horzLines: {
        color: '#f3f4f6',
        style: LineStyle.Solid,
      },
      vertLines: {
        color: '#f3f4f6',
        style: LineStyle.Solid,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: {
        time: true,
        price: true,
      },
    },
  });

  const openSeries = chart.addLineSeries({
    color: '#3b82f6',
    lineWidth: 2,
    title: 'Open Positions',
    priceFormat: {
      type: 'price',
      precision: 5,
      minMove: 0.00001,
    },
  });

  openSeries.setData(uniqueOpenData.map(d => ({ time: d.time, value: d.value })));

  chart.subscribeCrosshairMove(param => {
    if (param.time) {
      const dataPoint = uniqueOpenData.find(d => d.time === param.time);
      if (dataPoint) {
        const numTrades = dataPoint.trades.length;
        const numPositions = dataPoint.numPositions;
        
        let tooltipContent = `
          <div class="space-y-2">
            <div class="font-semibold border-b border-gray-700 pb-1">
              <div>Open Trades: ${numTrades}</div>
              <div>Lot Size: ${numPositions}</div>
              ${selectedSymbol ? `<div>Symbol: ${selectedSymbol}</div>` : ''}
            </div>
        `;
        
        if (dataPoint.trades.length > 0) {
          tooltipContent += `<div class="space-y-2">`;
          dataPoint.trades.forEach((trade, index) => {
            const profitClass = trade.profit >= 0 ? 'text-green-400' : 'text-red-400';
            tooltipContent += `
              <div class="border-b border-gray-700 pb-1 last:border-0">
                <div>Trade ${index + 1} (${trade.type})</div>
                <div>Entry: $${trade.entryPrice.toFixed(2)}</div>
                <div>Current: $${trade.currentPrice.toFixed(2)}</div>
                <div>Volume: ${trade.volume}</div>
                <div class="${profitClass}">P/L: $${trade.profit.toFixed(2)}</div>
              </div>
            `;
          });
          tooltipContent += `</div>`;
        }
        tooltipContent += `</div>`;

        tooltipContainer.innerHTML = tooltipContent;
        tooltipContainer.style.display = 'block';
        tooltipContainer.style.left = `${param.point?.x}px`;
        tooltipContainer.style.top = `${param.point?.y - tooltipContainer.offsetHeight - 10}px`;
      }

      const prices = param.seriesPrices || new Map();
      const openValue = prices.get(openSeries)?.toFixed(5);
      
      labelContainer.innerHTML = openValue ? 
        `<span class="text-blue-600">Open P/L: $${openValue}</span>` : '';
    } else {
      const lastOpen = uniqueOpenData[uniqueOpenData.length - 1]?.value.toFixed(5);
      labelContainer.innerHTML = lastOpen ? 
        `<span class="text-blue-600">Open P/L: $${lastOpen}</span>` : '';
      tooltipContainer.style.display = 'none';
    }
  });

  chart.timeScale().fitContent();

  // Set minimum zoom level to prevent going below 15-minute intervals
  chart.timeScale().applyOptions({
    barSpacing: 8,
    minBarSpacing: 6,
    // Ensure timezone consistency
    timezone: csvTimezone === 0 ? 'Etc/UTC' : `Etc/GMT${csvTimezone > 0 ? '-' : '+'}${Math.abs(csvTimezone)}`,
  });

  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) {
      return;
    }
    
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