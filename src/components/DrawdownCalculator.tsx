import React, { useState, useMemo } from 'react';
import { Calculator, TrendingDown, Filter, BarChart3 } from 'lucide-react';
import { MarkToMarketItem } from '../types';
import { formatCurrency, formatPercentage } from '../utils/numberFormatter';

interface DrawdownCalculatorProps {
  markToMarketData: MarkToMarketItem[];
  initialBalance: number;
  selectedSymbol?: string;
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
  triggerTrades: any[];
  tradeTypes: {
    buyCount: number;
    sellCount: number;
    totalVolume: number;
  };
}

export const DrawdownCalculator: React.FC<DrawdownCalculatorProps> = ({
  markToMarketData,
  initialBalance,
  selectedSymbol
}) => {
  const [thresholdPercent, setThresholdPercent] = useState<number>(5);
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell'>('all');
  const [minAmount, setMinAmount] = useState<number>(0);
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'percent' | 'amount' | 'duration' | 'date'>('percent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Calculate drawdown events
  const drawdownEvents = useMemo(() => {
    if (!markToMarketData || markToMarketData.length === 0) return [];

    const events: DrawdownEvent[] = [];
    let peakBalance = initialBalance;
    let peakDate = '';
    let inDrawdown = false;
    let drawdownStart = '';

    // Sort data by date
    const sortedData = [...markToMarketData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (let i = 0; i < sortedData.length; i++) {
      const item = sortedData[i];
      
      // Calculate current balance (closed + open P&L)
      const closedPnL = parseFloat(item.closed.replace(/[^\d.-]/g, '') || '0');
      const openPnL = parseFloat(item.open.replace(/[^\d.-]/g, '') || '0');
      const currentBalance = initialBalance + closedPnL + openPnL;

      // Update peak if current balance is higher
      if (currentBalance > peakBalance) {
        peakBalance = currentBalance;
        peakDate = item.date;
        
        // If we were in drawdown and recovered, end the drawdown event
        if (inDrawdown) {
          const lastEvent = events[events.length - 1];
          if (lastEvent) {
            lastEvent.recoveryDate = item.date;
            lastEvent.recoveryDuration = 
              (new Date(item.date).getTime() - new Date(lastEvent.endDate).getTime()) / (1000 * 60 * 60);
          }
          inDrawdown = false;
        }
      }

      // Calculate current drawdown
      const drawdownPercent = peakBalance > 0 ? 
        ((peakBalance - currentBalance) / peakBalance) * 100 : 0;
      const drawdownAmount = peakBalance - currentBalance;

      // Check if we hit the threshold
      if (drawdownPercent >= thresholdPercent && !inDrawdown) {
        inDrawdown = true;
        drawdownStart = item.date;
      }

      // If in drawdown, update the current event or create new one
      if (inDrawdown && drawdownPercent >= thresholdPercent) {
        const existingEventIndex = events.findIndex(event => 
          event.startDate === drawdownStart && !event.recoveryDate
        );

        // Get trades that might have triggered this drawdown
        const triggerTrades = (item.trades || []).filter(trade => {
          if (filterType === 'all') return true;
          return trade.type.toLowerCase() === filterType;
        });

        // Calculate trade statistics
        const buyTrades = triggerTrades.filter(t => t.type.toLowerCase() === 'buy');
        const sellTrades = triggerTrades.filter(t => t.type.toLowerCase() === 'sell');
        const totalVolume = triggerTrades.reduce((sum, t) => sum + (t.volume || 0), 0);

        const tradeTypes = {
          buyCount: buyTrades.length,
          sellCount: sellTrades.length,
          totalVolume
        };

        if (existingEventIndex >= 0) {
          // Update existing event
          const event = events[existingEventIndex];
          if (drawdownPercent > event.drawdownPercent) {
            event.endDate = item.date;
            event.troughBalance = currentBalance;
            event.drawdownPercent = drawdownPercent;
            event.drawdownAmount = drawdownAmount;
            event.duration = (new Date(item.date).getTime() - new Date(event.startDate).getTime()) / (1000 * 60 * 60);
            event.triggerTrades = triggerTrades;
            event.tradeTypes = tradeTypes;
          }
        } else {
          // Create new event
          events.push({
            startDate: drawdownStart,
            endDate: item.date,
            peakBalance,
            troughBalance: currentBalance,
            drawdownPercent,
            drawdownAmount,
            duration: (new Date(item.date).getTime() - new Date(drawdownStart).getTime()) / (1000 * 60 * 60),
            triggerTrades,
            tradeTypes
          });
        }
      }
    }

    return events;
  }, [markToMarketData, initialBalance, thresholdPercent, filterType]);

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
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Threshold (%)
          </label>
          <input
            type="number"
            value={thresholdPercent}
            onChange={(e) => setThresholdPercent(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            min="0"
            max="100"
            step="0.1"
          />
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
      <div className="flex items-center space-x-4 mb-6">
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

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
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
                #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Start Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                End Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Drawdown %
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Peak Balance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trough Balance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Buy/Sell Trades
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Recovery
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEvents.map((event, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(event.startDate).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(event.endDate).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                  {event.drawdownPercent.toFixed(2)}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                  {formatCurrency(event.drawdownAmount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {event.duration.toFixed(1)}h
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(event.peakBalance)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(event.troughBalance)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="flex space-x-2">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                      B: {event.tradeTypes.buyCount}
                    </span>
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                      S: {event.tradeTypes.sellCount}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Vol: {event.tradeTypes.totalVolume.toFixed(2)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {event.recoveryDate ? (
                    <div>
                      <div className="text-green-600 font-medium">Recovered</div>
                      <div className="text-xs text-gray-500">
                        {event.recoveryDuration?.toFixed(1)}h
                      </div>
                    </div>
                  ) : (
                    <span className="text-orange-600">Ongoing</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredEvents.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <TrendingDown className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No drawdown events found with the current filters.</p>
          <p className="text-sm">Try adjusting the threshold or filters.</p>
        </div>
      )}
    </div>
  );
};