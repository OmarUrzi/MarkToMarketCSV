import React, { useState, useMemo } from 'react';
import { Calculator, TrendingDown, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { TradeHistoryItem, MarkToMarketItem } from '../types';
import { formatCurrency, formatPercentage, formatVolume } from '../utils/numberFormatter';
import { DrawdownMode } from '../utils/newChartUtils';

interface DrawdownCalculatorProps {
  trades: TradeHistoryItem[];
  initialBalance: number;
  selectedSymbol?: string;
  markToMarketData?: MarkToMarketItem[];
}

interface DrawdownEvent {
  startDate: string;
  endDate: string;
  peakBalance: number;
  troughBalance: number;
  drawdownPercent: number;
  drawdownAmount: number;
  duration: number; // in hours
  recoveryDate?: string;
  recoveryDuration?: number; // in hours
  triggerTrades: TradeHistoryItem[];
  tradeTypes: {
    buyCount: number;
    sellCount: number;
    totalVolume: number;
  };
}

export const DrawdownCalculator: React.FC<DrawdownCalculatorProps> = ({
  trades,
  initialBalance,
  selectedSymbol,
  markToMarketData = []
}) => {
  const [thresholdPercent, setThresholdPercent] = useState<number>(5);
  const [tempThreshold, setTempThreshold] = useState<string>('5');
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell'>('all');
  const [minAmount, setMinAmount] = useState<number>(0);
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'percent' | 'amount' | 'duration' | 'date'>('percent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>('realized');

  // Enhanced drawdown event interface with detailed tracking
  interface EnhancedDrawdownEvent {
    peakTimestamp: string;
    peakBalance: number;
    valleyTimestamp: string;
    valleyBalance: number;
    drawdownPercent: number;
    drawdownAmount: number;
    duration: number; // in hours
    recoveryTimestamp?: string;
    recoveryBalance?: number;
    recoveryDuration?: number; // in hours
    triggerTrades: TradeHistoryItem[];
    tradeTypes: {
      buyCount: number;
      sellCount: number;
      totalVolume: number;
    };
  }

  // Calculate realized drawdown events (closed trades only)
  const calculateRealizedDrawdownEvents = (): EnhancedDrawdownEvent[] => {
    console.log('=== DRAWDOWN CALCULATOR CALCULATION ===');
    console.log('Threshold:', thresholdPercent, '%');
    console.log('Initial balance:', initialBalance);

    const events: EnhancedDrawdownEvent[] = [];
    const balanceHistory: { time: string; balance: number; trade: TradeHistoryItem }[] = [];
    
    // Build complete balance history
    let peakBalance = initialBalance;
    let runningBalance = initialBalance;
    
    // Add initial balance point
    const firstTrade = trades.find(trade => parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') !== 0);
    if (firstTrade) {
      balanceHistory.push({
        time: firstTrade.time,
        balance: initialBalance,
        trade: firstTrade
      });
    }

    // Sort trades by time and calculate running balance
    const sortedTrades = [...trades]
      .filter(trade => parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') !== 0)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    console.log('Processing', sortedTrades.length, 'trades for calculator');

    for (let i = 0; i < sortedTrades.length; i++) {
      const trade = sortedTrades[i];
      
      // Calculate new balance after this trade
      const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
      const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
      const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
      
      const netProfit = profit + commission + swap;
      runningBalance += netProfit;

      // Add to balance history
      balanceHistory.push({
        time: trade.time,
        balance: runningBalance,
        trade: trade
      });
    }

    // Now analyze balance history for drawdowns
    let currentPeak = { balance: initialBalance, timestamp: balanceHistory[0]?.time || '', index: 0 };
    let inDrawdown = false;
    let drawdownStart = -1;
    
    for (let i = 0; i < balanceHistory.length; i++) {
      const current = balanceHistory[i];
      
      // Update peak if current balance is higher
      if (current.balance > currentPeak.balance) {
        // If we were in drawdown and recovered, finalize the previous drawdown
        if (inDrawdown && drawdownStart >= 0) {
          const drawdownEvents = balanceHistory.slice(drawdownStart, i);
          const valley = drawdownEvents.reduce((min, item) => 
            item.balance < min.balance ? item : min
          );
          
          const drawdownPercent = currentPeak.balance > 0 ? 
            ((currentPeak.balance - valley.balance) / currentPeak.balance) * 100 : 0;
          
          if (drawdownPercent >= thresholdPercent) {
            // Get trades during drawdown period
            const drawdownTrades = drawdownEvents.map(item => item.trade);
            const filteredTriggerTrades = drawdownTrades.filter(t => {
              if (filterType === 'all') return true;
              return t.type.toLowerCase() === filterType;
            });

            const buyTrades = filteredTriggerTrades.filter(t => t.type.toLowerCase() === 'buy');
            const sellTrades = filteredTriggerTrades.filter(t => t.type.toLowerCase() === 'sell');
            const totalVolume = filteredTriggerTrades.reduce((sum, t) => sum + parseFloat(t.volume || '0'), 0);

            events.push({
              peakTimestamp: currentPeak.timestamp,
              peakBalance: currentPeak.balance,
              valleyTimestamp: valley.time,
              valleyBalance: valley.balance,
              drawdownPercent: drawdownPercent,
              drawdownAmount: currentPeak.balance - valley.balance,
              duration: (new Date(valley.time).getTime() - new Date(currentPeak.timestamp).getTime()) / (1000 * 60 * 60),
              recoveryTimestamp: current.time,
              recoveryBalance: current.balance,
              recoveryDuration: (new Date(current.time).getTime() - new Date(currentPeak.timestamp).getTime()) / (1000 * 60 * 60),
              triggerTrades: filteredTriggerTrades,
              tradeTypes: {
                buyCount: buyTrades.length,
                sellCount: sellTrades.length,
                totalVolume
              }
            });
            
            console.log(`Drawdown detected: Peak $${currentPeak.balance.toFixed(2)} -> Valley $${valley.balance.toFixed(2)} = ${drawdownPercent.toFixed(2)}%`);
          }
        }
        
        // Update peak
        currentPeak = { balance: current.balance, timestamp: current.time, index: i };
        inDrawdown = false;
      } else {
        // Check if we're entering a drawdown
        const drawdownPercent = currentPeak.balance > 0 ? 
          ((currentPeak.balance - current.balance) / currentPeak.balance) * 100 : 0;
        
        if (drawdownPercent >= thresholdPercent && !inDrawdown) {
          inDrawdown = true;
          drawdownStart = currentPeak.index;
          console.log(`Drawdown started from peak $${currentPeak.balance.toFixed(2)} at ${currentPeak.timestamp}`);
        }
      }
    }
    
    // Handle ongoing drawdown at the end
    if (inDrawdown && drawdownStart >= 0) {
      const drawdownEvents = balanceHistory.slice(drawdownStart);
      const valley = drawdownEvents.reduce((min, item) => 
        item.balance < min.balance ? item : min
      );
      
      const drawdownPercent = currentPeak.balance > 0 ? 
        ((currentPeak.balance - valley.balance) / currentPeak.balance) * 100 : 0;
      
      if (drawdownPercent >= thresholdPercent) {
        const drawdownTrades = drawdownEvents.map(item => item.trade);
        const filteredTriggerTrades = drawdownTrades.filter(t => {
          if (filterType === 'all') return true;
          return t.type.toLowerCase() === filterType;
        });

        const buyTrades = filteredTriggerTrades.filter(t => t.type.toLowerCase() === 'buy');
        const sellTrades = filteredTriggerTrades.filter(t => t.type.toLowerCase() === 'sell');
        const totalVolume = filteredTriggerTrades.reduce((sum, t) => sum + parseFloat(t.volume || '0'), 0);

        events.push({
          peakTimestamp: currentPeak.timestamp,
          peakBalance: currentPeak.balance,
          valleyTimestamp: valley.time,
          valleyBalance: valley.balance,
          drawdownPercent: drawdownPercent,
          drawdownAmount: currentPeak.balance - valley.balance,
          duration: (new Date(valley.time).getTime() - new Date(currentPeak.timestamp).getTime()) / (1000 * 60 * 60),
          triggerTrades: filteredTriggerTrades,
          tradeTypes: {
            buyCount: buyTrades.length,
            sellCount: sellTrades.length,
            totalVolume
          }
        });
        
        console.log(`Ongoing drawdown: Peak $${currentPeak.balance.toFixed(2)} -> Valley $${valley.balance.toFixed(2)} = ${drawdownPercent.toFixed(2)}%`);
      }
    }

    console.log('=== DRAWDOWN CALCULATOR RESULTS ===');
    console.log('Total events found:', events.length);
    events.forEach((event, index) => {
      console.log(`Event ${index + 1}: ${event.drawdownPercent.toFixed(2)}% from ${event.peakTimestamp} to ${event.valleyTimestamp}`);
      if (event.recoveryTimestamp) {
        console.log(`  Recovery: ${event.recoveryTimestamp} (${event.recoveryDuration?.toFixed(1)}h total)`);
      }
    });
    console.log('=== END DRAWDOWN CALCULATOR CALCULATION ===');
    return events;
  };

  // Calculate unrealized drawdown events (including open positions)
  const calculateUnrealizedDrawdownEvents = (): EnhancedDrawdownEvent[] => {
    if (!markToMarketData || markToMarketData.length === 0) return [];

    const events: EnhancedDrawdownEvent[] = [];
    let peakBalance = initialBalance;
    let peakDate = '';
    let inDrawdown = false;
    let drawdownStart = '';
    let drawdownTrades: TradeHistoryItem[] = [];

    // Sort mark-to-market data by time
    const sortedMTMData = [...markToMarketData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (let i = 0; i < sortedMTMData.length; i++) {
      const mtmItem = sortedMTMData[i];
      
      // Calculate current balance: initial + closed P&L + open P&L
      const closedPnL = parseFloat(mtmItem.closed.replace(/[^\d.-]/g, '') || '0');
      const openPnL = parseFloat(mtmItem.open.replace(/[^\d.-]/g, '') || '0');
      const currentBalance = initialBalance + closedPnL + openPnL;

      // Update peak if current balance is higher
      if (currentBalance > peakBalance) {
        peakBalance = currentBalance;
        peakDate = mtmItem.date;
        
        // If we were in drawdown and recovered, end the drawdown event
        if (inDrawdown) {
          const lastEvent = events[events.length - 1];
          if (lastEvent) {
            lastEvent.recoveryDate = mtmItem.date;
            // Recovery duration is from drawdown START to full recovery
            lastEvent.recoveryDuration = 
              (new Date(mtmItem.date).getTime() - new Date(lastEvent.startDate).getTime()) / (1000 * 60 * 60);
          }
          inDrawdown = false;
          drawdownTrades = [];
        }
      }

      // Calculate current drawdown
      const drawdownPercent = peakBalance > 0 ? 
        ((peakBalance - currentBalance) / peakBalance) * 100 : 0;
      const drawdownAmount = peakBalance - currentBalance;

      // Check if we hit the threshold
      if (drawdownPercent >= thresholdPercent && !inDrawdown) {
        inDrawdown = true;
        drawdownStart = mtmItem.date;
        drawdownTrades = [];
      }

      // If in drawdown, collect trades that occurred around this time
      if (inDrawdown) {
        const mtmTime = new Date(mtmItem.date);
        const relevantTrades = trades.filter(trade => {
          const tradeTime = new Date(trade.time);
          const timeDiff = Math.abs(tradeTime.getTime() - mtmTime.getTime());
          return timeDiff <= 15 * 60 * 1000; // Within 15 minutes
        });
        
        for (const trade of relevantTrades) {
          if (!drawdownTrades.find(t => t.deal === trade.deal)) {
            drawdownTrades.push(trade);
          }
        }
      }

      // If in drawdown and this is a new maximum drawdown, update or create event
      if (inDrawdown && drawdownPercent >= thresholdPercent) {
        const existingEventIndex = events.findIndex(event => 
          event.startDate === drawdownStart && !event.recoveryDate
        );

        // Filter trades based on filter type
        const filteredTriggerTrades = drawdownTrades.filter(t => {
          if (filterType === 'all') return true;
          return t.type.toLowerCase() === filterType;
        });

        // Calculate trade statistics
        const buyTrades = filteredTriggerTrades.filter(t => t.type.toLowerCase() === 'buy');
        const sellTrades = filteredTriggerTrades.filter(t => t.type.toLowerCase() === 'sell');
        const totalVolume = filteredTriggerTrades.reduce((sum, t) => sum + parseFloat(t.volume || '0'), 0);

        const tradeTypes = {
          buyCount: buyTrades.length,
          sellCount: sellTrades.length,
          totalVolume
        };

        if (existingEventIndex >= 0) {
          // Update existing event if this is a deeper drawdown
          const event = events[existingEventIndex];
          if (drawdownPercent > event.drawdownPercent) {
            event.endDate = mtmItem.date;
            event.troughBalance = currentBalance;
            event.drawdownPercent = drawdownPercent;
            event.drawdownAmount = drawdownAmount;
            event.duration = (new Date(mtmItem.date).getTime() - new Date(event.startDate).getTime()) / (1000 * 60 * 60);
            event.triggerTrades = [...filteredTriggerTrades];
            event.tradeTypes = tradeTypes;
          }
        } else {
          // Create new event
          events.push({
            peakTimestamp: peakDate,
            peakBalance: peakBalance,
            valleyTimestamp: mtmItem.date,
            valleyBalance: currentBalance,
            drawdownPercent,
            drawdownAmount,
            duration: (new Date(mtmItem.date).getTime() - new Date(drawdownStart).getTime()) / (1000 * 60 * 60),
            triggerTrades: [...filteredTriggerTrades],
            tradeTypes
          });
        }
      }
    }

    return events;
  };

  // Calculate drawdown events based on mode
  const drawdownEvents = useMemo(() => {
    if (!trades || trades.length === 0) return [];

    if (drawdownMode === 'unrealized' && markToMarketData && markToMarketData.length > 0) {
      return calculateUnrealizedDrawdownEvents();
    } else {
      return calculateRealizedDrawdownEvents();
    }
  }, [trades, initialBalance, thresholdPercent, filterType, drawdownMode, markToMarketData]);

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let filtered = drawdownEvents.filter(event => {
      // Amount filters
      if (minAmount > 0 && event.drawdownAmount < minAmount) return false;
      if (maxAmount > 0 && event.drawdownAmount > maxAmount) return false;
      
      // Trade type filter
      if (filterType === 'buy' && event.tradeTypes.buyCount === 0) return false;
      if (filterType === 'sell' && event.tradeTypes.sellCount === 0) return false;
      
      return true;
    });

    // Sort events
    filtered.sort((a, b) => {
      let aValue: number, bValue: number;
      
      switch (sortBy) {
        case 'percent':
          aValue = a.drawdownPercent;
          bValue = b.drawdownPercent;
          break;
        case 'amount':
          aValue = a.drawdownAmount;
          bValue = b.drawdownAmount;
          break;
        case 'duration':
          aValue = a.duration;
          bValue = b.duration;
          break;
        case 'date':
          aValue = new Date(a.startDate).getTime();
          bValue = new Date(b.startDate).getTime();
          break;
        default:
          aValue = a.drawdownPercent;
          bValue = b.drawdownPercent;
      }

      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    return filtered;
  }, [drawdownEvents, minAmount, maxAmount, filterType, sortBy, sortOrder]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (filteredEvents.length === 0) return null;

    const totalEvents = filteredEvents.length;
    const avgDrawdown = filteredEvents.reduce((sum, e) => sum + e.drawdownPercent, 0) / totalEvents;
    const maxDrawdown = Math.max(...filteredEvents.map(e => e.drawdownPercent));
    const avgDuration = filteredEvents.reduce((sum, e) => sum + e.duration, 0) / totalEvents;
    const totalBuyTriggers = filteredEvents.reduce((sum, e) => sum + e.tradeTypes.buyCount, 0);
    const totalSellTriggers = filteredEvents.reduce((sum, e) => sum + e.tradeTypes.sellCount, 0);

    return {
      totalEvents,
      avgDrawdown,
      maxDrawdown,
      avgDuration,
      totalBuyTriggers,
      totalSellTriggers
    };
  }, [filteredEvents]);

  const toggleRowExpansion = (index: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(index)) {
      newExpandedRows.delete(index);
    } else {
      newExpandedRows.add(index);
    }
    setExpandedRows(newExpandedRows);
  };

  const collapseAllRows = () => {
    setExpandedRows(new Set());
  };

  const handleThresholdChange = () => {
    const newThreshold = parseFloat(tempThreshold);
    if (!isNaN(newThreshold) && newThreshold >= 0 && newThreshold <= 100) {
      setThresholdPercent(newThreshold);
    } else {
      // Reset to current value if invalid
      setTempThreshold(thresholdPercent.toString());
    }
  };

  const handleThresholdKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleThresholdChange();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toISOString().replace('T', ' ').slice(0, 16);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-6">
        <Calculator className="h-6 w-6 text-blue-600 mr-2" />
        <h3 className="text-lg font-medium">Drawdown Calculator</h3>
        {selectedSymbol && (
          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
            {selectedSymbol}
          </span>
        )}
        <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
          {drawdownMode === 'realized' ? 'Realized' : 'Unrealized'}
        </span>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Drawdown Mode
          </label>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setDrawdownMode('realized')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                drawdownMode === 'realized'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Realized
            </button>
            <button
              onClick={() => setDrawdownMode('unrealized')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                drawdownMode === 'unrealized'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              disabled={!markToMarketData || markToMarketData.length === 0}
              title={!markToMarketData || markToMarketData.length === 0 ? 'No mark-to-market data available' : ''}
            >
              Unrealized
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {drawdownMode === 'realized' ? 'Closed trades only' : 'Including open positions'}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Threshold (%)
          </label>
          <div className="flex space-x-2">
            <input
              type="number"
              value={tempThreshold}
              onChange={(e) => setTempThreshold(e.target.value)}
              onKeyPress={handleThresholdKeyPress}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              min="0"
              max="100"
              step="0.1"
              placeholder="Enter threshold %"
            />
            <button
              onClick={handleThresholdChange}
              className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
            >
              OK
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Current: {thresholdPercent}% (Press Enter or click OK to apply)
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Trade Type Filter
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'buy' | 'sell')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">All Trades</option>
            <option value="buy">Buy Trades Only</option>
            <option value="sell">Sell Trades Only</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Amount ($)
          </label>
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            min="0"
            step="100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Amount ($)
          </label>
          <input
            type="number"
            value={maxAmount}
            onChange={(e) => setMaxAmount(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            min="0"
            step="100"
          />
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="percent">Drawdown %</option>
              <option value="amount">Amount</option>
              <option value="duration">Duration</option>
              <option value="date">Date</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Order:</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {expandedRows.size > 0 && (
          <button
            onClick={collapseAllRows}
            className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
          >
            <Minus className="h-4 w-4 mr-1" />
            Collapse All
          </button>
        )}
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="col-span-full mb-2">
            <div className="text-sm text-gray-600 bg-white p-3 rounded border">
              <strong>Debug Info:</strong> Threshold: {thresholdPercent}% | 
              Initial Balance: ${initialBalance.toLocaleString()} | 
              Trades: {trades.length} | 
              Mode: {drawdownMode}
              <br />
              <em>Check browser console for detailed calculation logs</em>
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{statistics.totalEvents}</div>
            <div className="text-xs text-gray-600">Total Events</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{statistics.avgDrawdown.toFixed(2)}%</div>
            <div className="text-xs text-gray-600">Avg Drawdown</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-700">{statistics.maxDrawdown.toFixed(2)}%</div>
            <div className="text-xs text-gray-600">Max Drawdown</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{statistics.avgDuration.toFixed(1)}h</div>
            <div className="text-xs text-gray-600">Avg Duration</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{statistics.totalBuyTriggers}</div>
            <div className="text-xs text-gray-600">Buy Triggers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{statistics.totalSellTriggers}</div>
            <div className="text-xs text-gray-600">Sell Triggers</div>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Peak Balance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Drawdown Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Drawdown %
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEvents.map((event, index) => {
              const isExpanded = expandedRows.has(index);
              
              return (
                <React.Fragment key={index}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleRowExpansion(index)}
                        className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(event.peakBalance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                      {formatCurrency(event.drawdownAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                      {event.drawdownPercent.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {event.duration.toFixed(1)}h
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-gray-900 mb-4">
                            Drawdown Details
                          </h4>
                          
                          {/* Detailed Information Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                            <div className="bg-white p-3 rounded border">
                              <div className="text-xs text-gray-500 uppercase tracking-wide">Peak Timestamp</div>
                              <div className="text-sm font-medium text-gray-900">{formatDate(event.peakTimestamp)}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-xs text-gray-500 uppercase tracking-wide">Peak Balance</div>
                              <div className="text-sm font-medium text-green-600">{formatCurrency(event.peakBalance)}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-xs text-gray-500 uppercase tracking-wide">Valley Timestamp</div>
                              <div className="text-sm font-medium text-gray-900">{formatDate(event.valleyTimestamp)}</div>
                            </div>
                            <div className="bg-white p-3 rounded border">
                              <div className="text-xs text-gray-500 uppercase tracking-wide">Valley Balance</div>
                              <div className="text-sm font-medium text-red-600">{formatCurrency(event.valleyBalance)}</div>
                            </div>
                            {event.recoveryTimestamp && (
                              <>
                                <div className="bg-white p-3 rounded border">
                                  <div className="text-xs text-gray-500 uppercase tracking-wide">Recovery Timestamp</div>
                                  <div className="text-sm font-medium text-gray-900">{formatDate(event.recoveryTimestamp)}</div>
                                </div>
                                <div className="bg-white p-3 rounded border">
                                  <div className="text-xs text-gray-500 uppercase tracking-wide">Recovery Balance</div>
                                  <div className="text-sm font-medium text-blue-600">{formatCurrency(event.recoveryBalance || 0)}</div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Trade Statistics */}
                          <div className="bg-white p-3 rounded border mb-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Trade Statistics</div>
                            <div className="flex space-x-4">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                Buy: {event.tradeTypes.buyCount}
                              </span>
                              <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                                Sell: {event.tradeTypes.sellCount}
                              </span>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Volume: {event.tradeTypes.totalVolume.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Trigger Trades Table */}
                          {event.triggerTrades.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-900 mb-2">
                                Trigger Trades ({event.triggerTrades.length} trades)
                              </h5>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Profit</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {event.triggerTrades.map((trade, tradeIndex) => (
                                      <tr key={tradeIndex} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-sm text-gray-900">
                                          {formatDate(trade.time)}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-900">{trade.deal}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 font-medium">{trade.symbol}</td>
                                        <td className="px-4 py-2 text-sm">
                                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            trade.type.toLowerCase() === 'buy' 
                                              ? 'bg-green-100 text-green-800' 
                                              : 'bg-red-100 text-red-800'
                                          }`}>
                                            {trade.type.toUpperCase()}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-sm">
                                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            trade.direction.toLowerCase() === 'in' 
                                              ? 'bg-blue-100 text-blue-800' 
                                              : 'bg-orange-100 text-orange-800'
                                          }`}>
                                            {trade.direction.toUpperCase()}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-900">{trade.volume}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900">
                                          {formatCurrency(trade.price)}
                                        </td>
                                        <td className="px-4 py-2 text-sm">
                                          <span className={`font-medium ${
                                            parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') >= 0 
                                              ? 'text-green-600' 
                                              : 'text-red-600'
                                          }`}>
                                            {formatCurrency(trade.profit)}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-900">
                                          {formatCurrency(trade.balance)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredEvents.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <TrendingDown className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No {drawdownMode} drawdown events found with the current filters.</p>
          <p className="text-sm">Try adjusting the threshold or filters.</p>
          {drawdownMode === 'unrealized' && (!markToMarketData || markToMarketData.length === 0) && (
            <p className="text-sm text-orange-600 mt-2">
              No mark-to-market data available for unrealized drawdown calculation.
            </p>
          )}
        </div>
      )}
    </div>
  );
};