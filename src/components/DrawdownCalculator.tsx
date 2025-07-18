import React, { useState, useMemo } from 'react';
import { Calculator, TrendingDown, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { TradeHistoryItem } from '../types';
import { formatCurrency, formatPercentage, formatVolume } from '../utils/numberFormatter';

interface DrawdownCalculatorProps {
  trades: TradeHistoryItem[];
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
  selectedSymbol
}) => {
  const [thresholdPercent, setThresholdPercent] = useState<number>(5);
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell'>('all');
  const [minAmount, setMinAmount] = useState<number>(0);
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'percent' | 'amount' | 'duration' | 'date'>('percent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Calculate drawdown events based on CSV trades
  const drawdownEvents = useMemo(() => {
    if (!trades || trades.length === 0) return [];

    const events: DrawdownEvent[] = [];
    let peakBalance = initialBalance;
    let peakDate = '';
    let inDrawdown = false;
    let drawdownStart = '';
    let drawdownTrades: TradeHistoryItem[] = [];

    // Sort trades by time and calculate running balance
    const sortedTrades = [...trades]
      .filter(trade => parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') !== 0)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    let runningBalance = initialBalance;

    for (let i = 0; i < sortedTrades.length; i++) {
      const trade = sortedTrades[i];
      
      // Calculate new balance after this trade
      const profit = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
      const commission = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
      const swap = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
      
      runningBalance += profit + commission + swap;

      // Update peak if current balance is higher
      if (runningBalance > peakBalance) {
        peakBalance = runningBalance;
        peakDate = trade.time;
        
        // If we were in drawdown and recovered, end the drawdown event
        if (inDrawdown) {
          const lastEvent = events[events.length - 1];
          if (lastEvent) {
            lastEvent.recoveryDate = trade.time;
            lastEvent.recoveryDuration = 
              (new Date(trade.time).getTime() - new Date(lastEvent.endDate).getTime()) / (1000 * 60 * 60);
          }
          inDrawdown = false;
          drawdownTrades = [];
        }
      }

      // Calculate current drawdown
      const drawdownPercent = peakBalance > 0 ? 
        ((peakBalance - runningBalance) / peakBalance) * 100 : 0;
      const drawdownAmount = peakBalance - runningBalance;

      // Check if we hit the threshold
      if (drawdownPercent >= thresholdPercent && !inDrawdown) {
        inDrawdown = true;
        drawdownStart = trade.time;
        drawdownTrades = [];
      }

      // If in drawdown, collect trades
      if (inDrawdown) {
        drawdownTrades.push(trade);
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
            event.endDate = trade.time;
            event.troughBalance = runningBalance;
            event.drawdownPercent = drawdownPercent;
            event.drawdownAmount = drawdownAmount;
            event.duration = (new Date(trade.time).getTime() - new Date(event.startDate).getTime()) / (1000 * 60 * 60);
            event.triggerTrades = [...filteredTriggerTrades];
            event.tradeTypes = tradeTypes;
          }
        } else {
          // Create new event
          events.push({
            startDate: drawdownStart,
            endDate: trade.time,
            peakBalance,
            troughBalance: runningBalance,
            drawdownPercent,
            drawdownAmount,
            duration: (new Date(trade.time).getTime() - new Date(drawdownStart).getTime()) / (1000 * 60 * 60),
            triggerTrades: [...filteredTriggerTrades],
            tradeTypes
          });
        }
      }
    }

    return events;
  }, [trades, initialBalance, thresholdPercent, filterType]);

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
            {filteredEvents.map((event, index) => {
              const isExpanded = expandedRows.has(index);
              
              return (
                <React.Fragment key={index}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleRowExpansion(index)}
                        className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        disabled={event.triggerTrades.length === 0}
                      >
                        {event.triggerTrades.length > 0 ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(event.startDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(event.endDate)}
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
                  
                  {isExpanded && event.triggerTrades.length > 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-gray-900 mb-3">
                            Drawdown Trigger Trades ({event.triggerTrades.length} trades)
                          </h4>
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
          <p>No drawdown events found with the current filters.</p>
          <p className="text-sm">Try adjusting the threshold or filters.</p>
        </div>
      )}
    </div>
  );
};