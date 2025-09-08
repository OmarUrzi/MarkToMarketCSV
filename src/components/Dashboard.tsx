import React from 'react';
import { TrendingUp, BarChart2, RefreshCw, ArrowDownRight, ChevronDown, Download } from 'lucide-react';
import { BacktestData } from '../types';
import { formatCurrency } from '../utils/numberFormatter';
import { generateCSVFromTrades } from '../utils/htmlToCsvConverter';

interface DashboardProps {
  data: BacktestData | null;
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  isLoadingSymbol?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  data, 
  selectedSymbol, 
  onSymbolChange, 
  isLoadingSymbol = false 
}) => {
  if (!data) return null;
  
  const { 
    expertName, 
    totalProfit, 
    winRate, 
    totalTrades, 
    maxDrawdown,
    availableSymbols 
  } = data;

  // Parse the profit value, removing the $ sign
  const profitValue = parseFloat(totalProfit.replace('$', ''));
  
  console.log('=== DASHBOARD TOTAL NET PROFIT ===');
  console.log('Dashboard Profit Display (REALIZED ONLY):', {
    rawTotalProfit: totalProfit,
    parsedValue: profitValue,
    selectedSymbol,
    dataSource: 'PROFIT COLUMN from closed trades only',
    calculation: 'Sum of PROFIT COLUMN values for CLOSED trades of selected symbol',
    excludes: 'Commission, Swap, and Unrealized profit from open positions',
    note: 'Uses only the Profit column data, not commission or swap'
  });
  console.log('=== END DASHBOARD PROFIT DISPLAY ===');

  const handleNewUpload = () => {
    window.location.reload();
  };

  const handleSymbolChange = (newSymbol: string) => {
    console.log(`Dashboard: Symbol change requested from ${selectedSymbol} to ${newSymbol}`);
    onSymbolChange(newSymbol);
  };

  const handleDownloadRawData = () => {
    try {
      // Generar CSV desde los datos actuales
      const csvContent = generateCSVFromTrades(data.tradeHistory, {
        symbol: data.currencyPair,
        expertName: data.expertName,
        initialBalance: data.initialBalance,
        totalNetProfit: data.totalProfit,
        totalTrades: data.totalTrades
      });
      
      // Crear y descargar archivo
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `raw_data_${data.currencyPair}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading raw data:', error);
      alert('Error generating CSV file. Please try again.');
    }
  };

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <select
              value={selectedSymbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              disabled={isLoadingSymbol}
              className={`
                appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-lg font-bold text-gray-900 
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                ${isLoadingSymbol ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
              `}
            >
              {availableSymbols.map(symbol => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            {isLoadingSymbol && (
              <div className="absolute right-8 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">{expertName}</p>
            <p className="text-xs text-gray-400">
              {availableSymbols.length} symbols available
            </p>
          </div>
          {isLoadingSymbol && (
            <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium">
              Updating {selectedSymbol}...
            </div>
          )}
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={handleDownloadRawData}
            className="flex items-center px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
            title="Download processed data as CSV"
          >
            <Download className="h-4 w-4 mr-1" />
            Raw Data
          </button>
          <button 
            onClick={handleNewUpload}
            className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
          >
            New Upload
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Net Profit */}
        <div className={`bg-white rounded-lg shadow p-4 ${isLoadingSymbol ? 'opacity-75' : ''}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Total Net Profit</p>
              <p className={`text-xl font-bold ${profitValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalProfit)}
              </p>
              <p className="text-xs text-blue-600 font-medium mt-1">
                {selectedSymbol}
              </p>
            </div>
            <div className={`${profitValue >= 0 ? 'bg-green-100' : 'bg-red-100'} p-2 rounded-full`}>
              <TrendingUp className={`h-5 w-5 ${profitValue >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
        
        {/* Win Rate */}
        <div className={`bg-white rounded-lg shadow p-4 ${isLoadingSymbol ? 'opacity-75' : ''}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Win Rate</p>
              <p className="text-xl font-bold text-gray-900">{winRate}</p>
              <p className="text-xs text-blue-600 font-medium mt-1">
                {selectedSymbol}
              </p>
            </div>
            <div className="bg-green-100 p-2 rounded-full">
              <BarChart2 className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>
        
        {/* Total Trades */}
        <div className={`bg-white rounded-lg shadow p-4 ${isLoadingSymbol ? 'opacity-75' : ''}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Total Trades</p>
              <p className="text-xl font-bold text-gray-900">{totalTrades}</p>
              <p className="text-xs text-blue-600 font-medium mt-1">
                {selectedSymbol}
              </p>
            </div>
            <div className="bg-blue-100 p-2 rounded-full">
              <RefreshCw className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
        
        {/* Max Drawdown */}
        <div className={`bg-white rounded-lg shadow p-4 ${isLoadingSymbol ? 'opacity-75' : ''}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Max Drawdown</p>
              <p className="text-xl font-bold text-red-600">{maxDrawdown}</p>
              <p className="text-xs text-gray-400 mt-1">
                Overall Portfolio
              </p>
            </div>
            <div className="bg-red-100 p-2 rounded-full">
              <ArrowDownRight className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};