import React, { useEffect, useRef, useState } from 'react';
import { BacktestData } from '../types';
import { 
  renderPeriodReturnsChart, 
  renderBalanceAreaChart, 
  renderDrawdownChart,
  DrillDownState
} from '../utils/newChartUtils';

interface NewChartSectionProps {
  data: BacktestData | null;
  selectedSymbol: string;
  csvTimezone: number;
}

export const NewChartSection: React.FC<NewChartSectionProps> = ({ 
  data, 
  selectedSymbol,
  csvTimezone
}) => {
  const returnsChartRef = useRef<HTMLDivElement>(null);
  const balanceChartRef = useRef<HTMLDivElement>(null);
  const drawdownChartRef = useRef<HTMLDivElement>(null);
  
  const [returnsChartInstance, setReturnsChartInstance] = useState<any>(null);
  const [balanceChartInstance, setBalanceChartInstance] = useState<any>(null);
  const [drawdownChartInstance, setDrawdownChartInstance] = useState<any>(null);
  
  // Drill-down state for period returns chart
  const [drillDownState, setDrillDownState] = useState<DrillDownState>({ level: 'monthly' });

  // Filter trades for selected symbol
  const symbolTrades = data?.tradeHistory?.filter(trade => 
    trade.symbol === selectedSymbol && parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') !== 0
  ) || [];

  const initialBalance = data?.initialBalance || 10000;

  // Handle drill-down navigation
  const handleDrillDown = (year: number, month: number, label: string) => {
    setDrillDownState({
      level: 'detailed',
      selectedPeriod: { year, month, label }
    });
  };

  const handleDrillUp = () => {
    setDrillDownState({ level: 'monthly' });
  };

  // Period Returns Chart with drill-down
  useEffect(() => {
    if (returnsChartRef.current && symbolTrades.length > 0) {
      const { chart, cleanup } = renderPeriodReturnsChart(
        returnsChartRef.current,
        symbolTrades,
        initialBalance,
        selectedSymbol,
        drillDownState,
        handleDrillDown,
        handleDrillUp
      );
      
      setReturnsChartInstance(chart);
      
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
        setReturnsChartInstance(null);
      };
    } else if (returnsChartRef.current) {
      returnsChartRef.current.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-500">
          No return data available for ${selectedSymbol}
        </div>
      `;
    }
  }, [data, selectedSymbol, symbolTrades.length, initialBalance, drillDownState]);

  // Balance Area Chart
  useEffect(() => {
    if (balanceChartRef.current && symbolTrades.length > 0) {
      const { chart, cleanup } = renderBalanceAreaChart(
        balanceChartRef.current,
        symbolTrades,
        initialBalance,
        selectedSymbol
      );
      
      setBalanceChartInstance(chart);
      
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
        setBalanceChartInstance(null);
      };
    } else if (balanceChartRef.current) {
      balanceChartRef.current.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-500">
          No balance data available for ${selectedSymbol}
        </div>
      `;
    }
  }, [data, selectedSymbol, symbolTrades.length, initialBalance]);

  // Drawdown Chart
  useEffect(() => {
    if (drawdownChartRef.current && symbolTrades.length > 0) {
      const { chart, cleanup } = renderDrawdownChart(
        drawdownChartRef.current,
        symbolTrades,
        initialBalance,
        selectedSymbol,
        data?.markToMarketData // Pass mark-to-market data for real-time drawdown
      );
      
      setDrawdownChartInstance(chart);
      
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
        setDrawdownChartInstance(null);
      };
    } else if (drawdownChartRef.current) {
      drawdownChartRef.current.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-500">
          No drawdown data available for ${selectedSymbol}
        </div>
      `;
    }
  }, [data, selectedSymbol, symbolTrades.length, initialBalance, data?.markToMarketData?.length]);
  
  if (!data) return null;
  
  return (
    <div className="space-y-8">
      {/* Period Returns Chart */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">
              Period Returns - {selectedSymbol}
              {drillDownState.level === 'detailed' && drillDownState.selectedPeriod && (
                <span className="text-sm text-gray-500 ml-2">
                  ({drillDownState.selectedPeriod.label})
                </span>
              )}
            </h3>
            <div className="text-sm text-gray-500">
              {drillDownState.level === 'monthly' 
                ? 'Monthly returns - Click bars to drill down' 
                : '15-minute intervals - Hover for trade details'
              }
            </div>
          </div>
          <div className="flex space-x-4">
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-sm bg-green-500 mr-2"></div>
              <span className="text-sm text-gray-600">Positive Returns</span>
            </div>
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-sm bg-red-500 mr-2"></div>
              <span className="text-sm text-gray-600">Negative Returns</span>
            </div>
            {drillDownState.level === 'monthly' && (
              <div className="flex items-center">
                <div className="h-3 w-3 rounded-sm bg-blue-500 mr-2"></div>
                <span className="text-sm text-gray-600">🔍 Clickable for details</span>
              </div>
            )}
          </div>
        </div>
        <div className="p-4 h-[400px]">
          <div ref={returnsChartRef} className="w-full h-full"></div>
        </div>
      </div>

      {/* Balance Area Chart */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Account Balance Growth - {selectedSymbol}</h3>
            <div className="text-sm text-gray-500">
              Balance progression over time
            </div>
          </div>
          <div className="flex space-x-4">
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-full bg-gradient-to-t from-green-500 to-red-500 mr-2"></div>
              <span className="text-sm text-gray-600">Account Balance (Green→Red gradient)</span>
            </div>
          </div>
        </div>
        <div className="p-4 h-[400px]">
          <div ref={balanceChartRef} className="w-full h-full"></div>
        </div>
      </div>

      {/* Drawdown Chart */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Drawdown Analysis - {selectedSymbol}</h3>
            <div className="text-sm text-gray-500">
              Drawdown percentage from peak balance
            </div>
          </div>
          <div className="flex space-x-4">
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-full bg-blue-500 mr-2"></div>
              <span className="text-sm text-gray-600">Drawdown %</span>
            </div>
          </div>
        </div>
        <div className="p-4 h-[400px]">
          <div ref={drawdownChartRef} className="w-full h-full"></div>
        </div>
      </div>
    </div>
  );
};