import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { Header } from './components/Header';
import { TabNavigation } from './components/TabNavigation';
import { UploadSection } from './components/UploadSection';
import { Dashboard } from './components/Dashboard';
import { NewChartSection } from './components/NewChartSection';
import { TradeHistory } from './components/TradeHistory';
import { MarkToMarketAnalytics } from './components/MarkToMarketAnalytics';
import { BacktestData } from './types';
import { parseHtmlFile, fetchMarkToMarketForSymbol } from './utils/parsers';
import { parseCSVFile } from './utils/csvParser';
import { convertXlsxToCSV } from './utils/xlsxToCsvConverter';
import { mockBacktestData } from './data/mockData';
import { TimezoneSelector } from './components/TimezoneSelector';

function App() {
  const [activeTab, setActiveTab] = useState<'mt4' | 'mt5'>('mt5');
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState<'trades' | 'markToMarket'>('trades');
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'1d' | '7d' | '30d' | '1y'>('1y');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [isLoadingSymbol, setIsLoadingSymbol] = useState(false);
  const [csvTimezone, setCsvTimezone] = useState<number>(0); // GMT+0 (UTC) default - this is the CSV data timezone
  const [initialAmount, setInitialAmount] = useState<number>(10000);

  const handleFileUpload = async (file: File, timezone: number = csvTimezone) => {
    try {
      setError(null);
      setIsDataLoaded(false);
      setBacktestData(null);
      
      // Check if file is empty
      if (file.size === 0) {
        throw new Error('The uploaded file is empty. Please select a valid file.');
      }
      
      const fileName = file.name.toLowerCase();
      let data: BacktestData;

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Handle XLSX file
        const xlsxData = await convertXlsxToCSV(file, timezone, initialAmount);
        
        // Create a virtual CSV file and use the existing CSV parser
        const csvBlob = new Blob([xlsxData.csvContent], { type: 'text/csv' });
        const csvFile = new File([csvBlob], 'converted.csv', { type: 'text/csv' });
        
        data = await parseCSVFile(csvFile, timezone, initialAmount);
        
        // Update metadata with XLSX information
        data.expertName = xlsxData.metadata.expertName;
        data.totalProfit = `$${xlsxData.metadata.totalNetProfit}`;
        
        // Add the converted CSV as property for download
        (data as any).convertedCSV = xlsxData.csvContent;
        
      } else if (fileName.endsWith('.csv')) {
        // Handle CSV file
        data = await parseCSVFile(file, timezone, initialAmount);
      } else if (fileName.endsWith('.htm') || fileName.endsWith('.html')) {
        // Handle HTML file
        data = await parseHtmlFile(file, timezone, initialAmount);
      } else {
        throw new Error('Please upload either an HTML file (.html/.htm) from MT4/MT5 backtest report, a CSV file (.csv) with trade data, or an Excel file (.xlsx/.xls) with trade history');
      }

      if (!data) {
        throw new Error('Failed to parse file data');
      }

      setBacktestData(data);
      setSelectedSymbol(data.currencyPair);
      setIsDataLoaded(true);
    } catch (error) {
      console.error('Error processing file:', {
        error,
        message: error?.message || 'Unknown error',
        stack: error.stack
      });
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse file. Please check the file format and try again.';
      setError(errorMessage);
      setIsDataLoaded(false);
      setBacktestData(null);
    }
  };

  const handleLoadMockData = () => {
    setError(null);
    const data = {
      ...mockBacktestData,
      markToMarketData: mockBacktestData.markToMarketData || [],
      availableSymbols: ['XAUUSD', 'EURUSD', 'GBPUSD']
    };
    setBacktestData(data);
    setSelectedSymbol(data.currencyPair);
    setIsDataLoaded(true);
  };

  const handleSymbolChange = async (symbol: string) => {
    if (!backtestData || symbol === selectedSymbol) return;

    console.log('=== SYMBOL CHANGE START ===');
    console.log(`App: Changing symbol from ${selectedSymbol} to ${symbol}`);
    console.log('App: Current backtest data:', {
      currencyPair: backtestData.currencyPair,
      totalTrades: backtestData.totalTrades,
      tradeHistoryLength: backtestData.tradeHistory.length,
      markToMarketLength: backtestData.markToMarketData?.length || 0
    });
    
    setIsLoadingSymbol(true);
    setError(null);

    try {
      // Filter trades for the selected symbol
      const symbolTrades = backtestData.tradeHistory.filter(trade => 
        trade.symbol === symbol && parseFloat(trade.profit) !== 0
      );

      console.log(`App: Found ${symbolTrades.length} trades for symbol ${symbol}`);
      if (symbolTrades.length > 0) {
        console.log('App: First trade for symbol:', symbolTrades[0]);
        console.log('App: Last trade for symbol:', symbolTrades[symbolTrades.length - 1]);
      }

      // Calculate stats for the selected symbol
      const profitableTrades = symbolTrades.filter(trade => parseFloat(trade.profit) > 0);
      const winRate = symbolTrades.length > 0
        ? ((profitableTrades.length / symbolTrades.length) * 100).toFixed(2)
        : '0.00';

      const totalProfit = symbolTrades.reduce((sum, trade) => 
        {
          const profitValue = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
          const commissionValue = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
          const swapValue = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
          const totalValue = profitValue + commissionValue + swapValue;
          console.log(`App Symbol Change - Total Profit: Trade ${trade.deal} profit="${trade.profit}" commission="${trade.commission}" swap="${trade.swap}" -> total=${totalValue}`);
          return sum + totalValue;
        }, 0
      );

      console.log(`App: Symbol ${symbol} stats:`, {
        totalTrades: symbolTrades.length,
        profitableTrades: profitableTrades.length,
        winRate: winRate,
        totalProfit: totalProfit.toFixed(2),
        note: 'Calculated from Profit + Commission + Swap'
      });

      // Fetch new mark to market data for the selected symbol
      let newMarkToMarketData = [];
      try {
        console.log(`App: Fetching mark-to-market data for ${symbol}`);
        newMarkToMarketData = await fetchMarkToMarketForSymbol(
          symbol,
          backtestData.tradeHistory,
          backtestData.initialBalance,
          csvTimezone
        );
        console.log(`App: Received ${newMarkToMarketData.length} mark-to-market data points for ${symbol}`);
      } catch (error) {
        console.error('App: Failed to fetch market data for symbol:', symbol, error);
        // Continue with empty mark to market data but show a warning
        setError(`Warning: Could not fetch market data for ${symbol}. Charts may not display properly.`);
      }

      // Update the backtest data with symbol-specific information
      const updatedData: BacktestData = {
        ...backtestData,
        currencyPair: symbol,
        totalProfit: `$${totalProfit.toFixed(2)}`, // FROM PROFIT + COMMISSION + SWAP
        winRate: `${winRate}%`,
        totalTrades: symbolTrades.length.toString(),
        markToMarketData: newMarkToMarketData
      };

      setBacktestData(updatedData);
      setSelectedSymbol(symbol);
      
      console.log(`=== APP SYMBOL CHANGE - TOTAL PROFIT ===`);
      console.log(`App: Successfully updated data for symbol ${symbol} (TOTAL PROFIT):`, {
        totalTrades: symbolTrades.length,
        totalProfitAmount: totalProfit.toFixed(2),
        winRate: winRate,
        markToMarketDataPoints: newMarkToMarketData.length,
        note: 'Total Profit = Profit + Commission + Swap (excludes unrealized)'
      });
      console.log('=== END APP SYMBOL CHANGE ===');
      
    } catch (error) {
      console.error('=== SYMBOL CHANGE FAILED ===');
      console.error('App: Error changing symbol:', error);
      setError(`Failed to load data for symbol ${symbol}: ${error.message}`);
      console.error('=== END SYMBOL CHANGE ERROR ===');
    } finally {
      setIsLoadingSymbol(false);
    }
  };

  // Get filtered trade history for the selected symbol
  const getFilteredTradeHistory = () => {
    if (!backtestData || !selectedSymbol) return [];
    const filtered = backtestData.tradeHistory.filter(trade => trade.symbol === selectedSymbol);
    console.log(`App: Filtered trade history for ${selectedSymbol}:`, filtered.length, 'trades');
    return filtered;
  };

  return (
    <Layout>
      <Header />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      {!isDataLoaded ? (
        <UploadSection 
          onFileUpload={handleFileUpload}
          onLoadMockData={handleLoadMockData}
          error={error}
          csvTimezone={csvTimezone}
          onTimezoneChange={setCsvTimezone}
          initialAmount={initialAmount}
          onInitialAmountChange={setInitialAmount}
        />
      ) : (
        <>
          <Dashboard 
            data={backtestData} 
            selectedSymbol={selectedSymbol}
            onSymbolChange={handleSymbolChange}
            isLoadingSymbol={isLoadingSymbol}
          />
          
          {isLoadingSymbol && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                <span className="text-blue-700 font-medium">
                  Loading data for {selectedSymbol}...
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-red-700">{error}</div>
            </div>
          )}
          
          <div className="mb-8">
            <NewChartSection 
              data={backtestData} 
              selectedSymbol={selectedSymbol}
              csvTimezone={csvTimezone}
            />
          </div>
          
          <div className="mt-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  className={`
                    py-2 px-1 border-b-2 font-medium text-sm
                    ${activeSection === 'trades' 
                      ? 'border-blue-500 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                  `}
                  onClick={() => setActiveSection('trades')}
                >
                  Trade History
                </button>
                <button
                  className={`
                    py-2 px-1 border-b-2 font-medium text-sm
                    ${activeSection === 'markToMarket' 
                      ? 'border-blue-500 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                  `}
                  onClick={() => setActiveSection('markToMarket')}
                >
                  Mark to Market Analytics
                </button>
              </nav>
            </div>
            
            {activeSection === 'trades' ? (
              <TradeHistory 
                data={getFilteredTradeHistory()} 
              />
            ) : (
              <MarkToMarketAnalytics 
                data={backtestData?.markToMarketData || []} 
                selectedSymbol={selectedSymbol}
                isLoadingSymbol={isLoadingSymbol}
                csvTimezone={csvTimezone}
              />
            )}
          </div>
        </>
      )}
    </Layout>
  );
}

export default App;