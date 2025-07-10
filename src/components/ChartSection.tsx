import React, { useEffect, useRef, useState } from 'react';
import { SkipBack, SkipForward } from 'lucide-react';
import { BacktestData } from '../types';
import { renderChart, renderMarkToMarketChart, renderOpenPositionsChart, navigateToAbsoluteStart, navigateToAbsoluteEnd } from '../utils/chartUtils';

interface ChartSectionProps {
  data: BacktestData | null;
  timeFilter: '1d' | '7d' | '30d' | '1y';
  onTimeFilterChange: (filter: '1d' | '7d' | '30d' | '1y') => void;
  selectedSymbol: string;
  csvTimezone: number;
}

export const ChartSection: React.FC<ChartSectionProps> = ({ 
  data, 
  timeFilter, 
  onTimeFilterChange,
  selectedSymbol,
  csvTimezone
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const mtmChartRef = useRef<HTMLDivElement>(null);
  const openPositionsChartRef = useRef<HTMLDivElement>(null);
  const [chartInstance, setChartInstance] = useState<any>(null);
  const [mtmChartInstance, setMtmChartInstance] = useState<any>(null);
  const [openPositionsChartInstance, setOpenPositionsChartInstance] = useState<any>(null);
  const [initialBalance, setInitialBalance] = useState<number>(data?.initialBalance || 10000);
  
  useEffect(() => {
    if (data?.initialBalance) {
      setInitialBalance(data.initialBalance);
    }
  }, [data?.initialBalance]);

  // Filter trades for selected symbol
  const symbolTrades = data?.tradeHistory?.filter(trade => 
    trade.symbol === selectedSymbol && parseFloat(trade.price) > 0
  ) || [];

  // Filter mark-to-market data for selected symbol (if it has symbol-specific data)
  const symbolMarkToMarket = data?.markToMarketData || [];

  useEffect(() => {
    if (chartRef.current && data && symbolTrades.length > 0) {
      const { chart, cleanup } = renderChart(
        chartRef.current,
        symbolTrades, // Pass filtered trades
        symbolMarkToMarket,
        timeFilter,
        selectedSymbol,
        csvTimezone
      );
      
      setChartInstance(chart);
      
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
        setChartInstance(null);
      };
    } else if (chartRef.current) {
      // Clear chart if no data
      chartRef.current.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-500">
          No trade data available for ${selectedSymbol}
        </div>
      `;
    }
  }, [data, timeFilter, selectedSymbol, symbolTrades.length]);

  useEffect(() => {
    if (mtmChartRef.current && symbolMarkToMarket.length > 0) {
      const { chart, cleanup } = renderMarkToMarketChart(
        mtmChartRef.current,
        symbolMarkToMarket,
        initialBalance,
        timeFilter,
        symbolTrades, // Pass filtered trades
        selectedSymbol,
        csvTimezone
      );
      
      setMtmChartInstance(chart);
      
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
        setMtmChartInstance(null);
      };
    } else if (mtmChartRef.current) {
      // Clear chart if no data
      mtmChartRef.current.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-500">
          No mark-to-market data available for ${selectedSymbol}
        </div>
      `;
    }
  }, [data, timeFilter, initialBalance, selectedSymbol, symbolTrades.length, symbolMarkToMarket.length]);

  useEffect(() => {
    if (openPositionsChartRef.current && symbolMarkToMarket.length > 0) {
      const { chart, cleanup } = renderOpenPositionsChart(
        openPositionsChartRef.current,
        symbolMarkToMarket,
        timeFilter,
        selectedSymbol,
        csvTimezone
      );
      
      setOpenPositionsChartInstance(chart);
      
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
        setOpenPositionsChartInstance(null);
      };
    } else if (openPositionsChartRef.current) {
      // Clear chart if no data
      openPositionsChartRef.current.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-500">
          No open positions data available for ${selectedSymbol}
        </div>
      `;
    }
  }, [data, timeFilter, selectedSymbol, symbolMarkToMarket.length]);
  
  if (!data) return null;
  
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Trade History - {selectedSymbol}</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => navigateToAbsoluteStart(chartInstance)}
                disabled={!chartInstance}
                className={`
                  flex items-center px-2 py-1 rounded-md text-xs transition-colors
                  ${!chartInstance 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'}
                `}
                title="Go to start"
              >
                <SkipBack className="h-3 w-3" />
              </button>
              <button
                onClick={() => navigateToAbsoluteEnd(chartInstance)}
                disabled={!chartInstance}
                className={`
                  flex items-center px-2 py-1 rounded-md text-xs transition-colors
                  ${!chartInstance 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'}
                `}
                title="Go to end"
              >
                <SkipForward className="h-3 w-3" />
              </button>
              <button className={`px-2 py-1 rounded-md text-xs ${
                timeFilter === '1d' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`} onClick={() => onTimeFilterChange('1d')}>
                1D
              </button>
              <button className={`px-2 py-1 rounded-md text-xs ${
                timeFilter === '7d' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`} onClick={() => onTimeFilterChange('7d')}>
                7D
              </button>
              <button className={`px-2 py-1 rounded-md text-xs ${
                timeFilter === '30d' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`} onClick={() => onTimeFilterChange('30d')}>
                30D
              </button>
              <button className={`px-2 py-1 rounded-md text-xs ${
                timeFilter === '1y' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`} onClick={() => onTimeFilterChange('1y')}>
                MAX
              </button>
            </div>
          </div>
          
          <div className="flex space-x-4">
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
              <span className="text-sm text-gray-600">Trade Entry</span>
            </div>
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-full bg-red-500 mr-2"></div>
              <span className="text-sm text-gray-600">Trade Exit</span>
            </div>
          </div>
        </div>
        
        <div className="p-4 h-[500px]">
          <div ref={chartRef} className="w-full h-full"></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Open Positions - {selectedSymbol}</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => navigateToAbsoluteStart(openPositionsChartInstance)}
                disabled={!openPositionsChartInstance}
                className={`
                  flex items-center px-2 py-1 rounded-md text-xs transition-colors
                  ${!openPositionsChartInstance 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'}
                `}
                title="Go to start"
              >
                <SkipBack className="h-3 w-3" />
              </button>
              <button
                onClick={() => navigateToAbsoluteEnd(openPositionsChartInstance)}
                disabled={!openPositionsChartInstance}
                className={`
                  flex items-center px-2 py-1 rounded-md text-xs transition-colors
                  ${!openPositionsChartInstance 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'}
                `}
                title="Go to end"
              >
                <SkipForward className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Use mouse wheel to zoom and drag to pan the chart
          </div>
        </div>
        <div className="p-4 h-[500px]">
          <div ref={openPositionsChartRef} className="w-full h-full"></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Mark to Market - {selectedSymbol}</h3>
            <div className="flex items-center space-x-4">
              <div className="flex space-x-2">
                <button
                  onClick={() => navigateToAbsoluteStart(mtmChartInstance)}
                  disabled={!mtmChartInstance}
                  className={`
                    flex items-center px-2 py-1 rounded-md text-xs transition-colors
                    ${!mtmChartInstance 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'}
                  `}
                  title="Go to start"
                >
                  <SkipBack className="h-3 w-3" />
                </button>
                <button
                  onClick={() => navigateToAbsoluteEnd(mtmChartInstance)}
                  disabled={!mtmChartInstance}
                  className={`
                    flex items-center px-2 py-1 rounded-md text-xs transition-colors
                    ${!mtmChartInstance 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'}
                  `}
                  title="Go to end"
                >
                  <SkipForward className="h-3 w-3" />
                </button>
              </div>
              <label className="text-sm text-gray-600">Initial Balance:</label>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(Number(e.target.value))}
                className="w-32 px-3 py-1 border border-gray-300 rounded-md text-sm"
                min="0"
                step="1000"
              />
            </div>
          </div>
          
          <div className="flex space-x-4">
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-full bg-red-500 mr-2"></div>
              <span className="text-sm text-gray-600">Total</span>
            </div>
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
              <span className="text-sm text-gray-600">Closed</span>
            </div>
          </div>
        </div>
        
        <div className="p-4 h-[500px]">
          <div ref={mtmChartRef} className="w-full h-full"></div>
        </div>
      </div>
    </div>
  );
};