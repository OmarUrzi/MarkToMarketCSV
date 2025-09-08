import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { MarkToMarketItem } from '../types';
import { MarkToMarketVisualizer } from './MarkToMarketVisualizer';
import { formatMarkToMarketValue, formatPrice, formatVolume } from '../utils/numberFormatter';

// Helper function to format date without timezone conversion
const formatDateForDisplay = (isoString: string): string => {
  try {
    // Extract date components directly from ISO string without creating Date object
    const match = isoString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match;
      return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
    }
    
    // Fallback: use UTC methods to avoid timezone conversion
    const date = new Date(isoString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.error('Error formatting date for display:', error);
    return isoString;
  }
};

interface MarkToMarketAnalyticsProps {
  data: MarkToMarketItem[];
  selectedSymbol?: string;
  isLoadingSymbol?: boolean;
  csvTimezone?: number;
}

interface TradeDetails {
  entryTime: string;
  symbol: string;
  type: string;
  volume: number;
  entryPrice: number;
  currentPrice: number;
  profit: number;
  deal: string;
}

export const MarkToMarketAnalytics: React.FC<MarkToMarketAnalyticsProps> = ({ 
  data, 
  selectedSymbol,
  isLoadingSymbol = false,
  csvTimezone = 0
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeView, setActiveView] = useState<'table' | 'visualizer'>('table');
  const [frequency, setFrequency] = useState<'M15'>('M15');
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    setCurrentPage(1);
  };
  
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    setCurrentPage(1);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toISOString().replace('T', ' ').slice(0, 16);
  };

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

  const calculateTradeStats = (trades: TradeDetails[] = []) => {
    const buyTrades = trades.filter(trade => trade.type.toLowerCase() === 'buy');
    const sellTrades = trades.filter(trade => trade.type.toLowerCase() === 'sell');
    
    const buyVolume = buyTrades.reduce((sum, trade) => sum + trade.volume, 0);
    const sellVolume = sellTrades.reduce((sum, trade) => sum + trade.volume, 0);
    
    return {
      buyCount: buyTrades.length,
      sellCount: sellTrades.length,
      buyVolume,
      sellVolume
    };
  };
  
  const safeData = Array.isArray(data) ? data : [];
  
  const filteredData = safeData.filter(item => {
    if (!startDate && !endDate) return true;
    
    const itemDate = new Date(item.date);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date(8640000000000000);
    
    return itemDate >= start && itemDate <= end;
  });
  
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  return (
    <div className="mt-4 w-full">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-medium">Mark to Market Analytics</h3>
            {selectedSymbol && (
              <div className={`px-3 py-1 rounded-md text-sm font-medium ${
                isLoadingSymbol 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {isLoadingSymbol ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></div>
                    Loading {selectedSymbol}...
                  </div>
                ) : (
                  selectedSymbol
                )}
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveView('table')}
              disabled={isLoadingSymbol}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeView === 'table'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${isLoadingSymbol ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Table View
            </button>
            <button
              onClick={() => setActiveView('visualizer')}
              disabled={isLoadingSymbol}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeView === 'visualizer'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${isLoadingSymbol ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Visualizer
            </button>
          </div>
        </div>

        {isLoadingSymbol && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-blue-700">
                Updating mark-to-market data for {selectedSymbol}...
              </span>
            </div>
          </div>
        )}

        {activeView === 'table' ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Show:</span>
                {[10, 20, 50, 100].map(size => (
                  <button
                    key={size}
                    onClick={() => setItemsPerPage(size)}
                    disabled={isLoadingSymbol}
                    className={`px-2 py-1 text-sm rounded ${
                      itemsPerPage === size
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${isLoadingSymbol ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {size}
                  </button>
                ))}
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
            
            <p className="text-sm text-gray-500 mb-4">
              Showing periods {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length}
            </p>

            <div className={`overflow-x-auto ${isLoadingSymbol ? 'opacity-50' : ''}`}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Net Position
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Buy Trades
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sell Trades
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Closed P/L
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AEP
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Market Price
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Open P/L
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total P/L
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Drawdown
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.map((item, index) => {
                    const globalIndex = (currentPage - 1) * itemsPerPage + index;
                    const isExpanded = expandedRows.has(globalIndex);
                    const trades = (item.trades as TradeDetails[]) || [];
                    const tradeStats = calculateTradeStats(trades);
                    
                    return (
                      <React.Fragment key={index}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => toggleRowExpansion(globalIndex)}
                              className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              disabled={trades.length === 0}
                            >
                              {trades.length > 0 ? (
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(item.date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatVolume(item.position)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="text-green-600 font-medium">
                              {tradeStats.buyCount} trades
                            </div>
                            <div className="text-xs text-gray-500">
                              ({tradeStats.buyVolume.toFixed(2)} lots)
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="text-red-600 font-medium">
                              {tradeStats.sellCount} trades
                            </div>
                            <div className="text-xs text-gray-500">
                              ({tradeStats.sellVolume.toFixed(2)} lots)
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatMarkToMarketValue(item.closed)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatPrice(item.aep)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatPrice(item.eoPeriodPrice)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatMarkToMarketValue(item.open)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatMarkToMarketValue(item.total)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className={`${parseFloat(item.currentDrawdown || '0') > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {item.currentDrawdown || '0.00%'}
                            </span>
                          </td>
                        </tr>
                        
                        {isExpanded && trades.length > 0 && (
                          <tr>
                            <td colSpan={11} className="px-6 py-4 bg-gray-50">
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium text-gray-900 mb-3">
                                  Open Trades Details ({trades.length} trades)
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Entry Time</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Entry Price</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Current Price</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Current P/L</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {trades.map((trade, tradeIndex) => (
                                        <tr key={tradeIndex} className="hover:bg-gray-50">
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
                                          <td className="px-4 py-2 text-sm text-gray-900">{trade.volume.toFixed(2)}</td>
                                          <td className="px-4 py-2 text-sm text-gray-900">
                                            {formatDateForDisplay(trade.entryTime)}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-gray-900">
                                            ${trade.entryPrice.toFixed(5)}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-gray-900">
                                            ${trade.currentPrice.toFixed(5)}
                                          </td>
                                          <td className="px-4 py-2 text-sm">
                                            <span className={`font-medium ${
                                              trade.profit >= 0 ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                              ${trade.profit.toFixed(2)}
                                            </span>
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
            
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4">
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1 || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === 1 || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    First
                  </button>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1 || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === 1 || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Previous
                  </button>
                </div>
                
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </div>
                
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === totalPages || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Next
                  </button>
                  <button 
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === totalPages || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <MarkToMarketVisualizer 
            data={data} 
            selectedSymbol={selectedSymbol}
            isLoadingSymbol={isLoadingSymbol}
            csvTimezone={csvTimezone}
          />
        )}
      </div>
    </div>
  );
};