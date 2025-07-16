import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import axios from 'axios';
import { BacktestData, TradeHistoryItem, MarkToMarketItem } from '../types';
import { apiTimeToCsvTime, csvTimeToApiTime } from './timezoneUtils';

const parseMTDateTime = (dateStr: string): string => {
  try {
    if (!dateStr || dateStr.trim() === 'Time') {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    const [datePart, timePart] = dateStr.trim().split(' ');
    if (!datePart || !timePart) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    const [year, month, day] = datePart.split('.');
    const [hours, minutes, seconds = '00'] = timePart.split(':');

    if (!year || !month || !day || !hours || !minutes) {
      throw new Error(`Missing date components: ${dateStr}`);
    }

    // Create date exactly as specified in HTML (preserve original time)
    const htmlDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds)
    );

    // Return as ISO string preserving the exact time from HTML
    const isoString = htmlDate.toISOString();
    console.log(`HTML time ${dateStr} -> ${isoString}`);
    return isoString;
  } catch (error) {
    console.error('Date parsing error:', error);
    throw new Error(`Invalid time value: ${dateStr}`);
  }
};

interface OpenTrade {
  entryTime: string;
  symbol: string;
  type: string;
  volume: number;
  entryPrice: number;
  deal: string;
}

const calculateMarkToMarket = (
  trades: TradeHistoryItem[],
  currentTime: string,
  marketPrice: number,
  initialBalance: number,
  selectedSymbol: string,
  csvTimezone: number = 0
): MarkToMarketItem => {
  const openTrades: OpenTrade[] = [];
  
  // Filter trades for the selected symbol only
  const symbolTrades = trades.filter(trade => trade.symbol === selectedSymbol);
  
  // Process all trades up to current time
  const relevantTrades = symbolTrades
    .filter(trade => {
      const tradeTime = new Date(trade.time);
      const currentDateTime = new Date(currentTime);
      return tradeTime <= currentDateTime;
    })
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Find the last trade's balance for this symbol
  const lastTrade = relevantTrades[relevantTrades.length - 1];
  const currentBalance = lastTrade ? 
    parseFloat(lastTrade.balance.replace(/[^\d.-]/g, '')) : 
    initialBalance;
  
  // Track open trades for this symbol
  for (const trade of relevantTrades) {
    if (trade.direction.toLowerCase() === 'in') {
      openTrades.push({
        entryTime: trade.time,
        symbol: trade.symbol,
        type: trade.type.toLowerCase(),
        volume: parseFloat(trade.volume),
        entryPrice: parseFloat(trade.price),
        deal: trade.deal
      });
    } else if (trade.direction.toLowerCase() === 'out') {
      const matchIndex = openTrades.findIndex(pos => 
        pos.volume === parseFloat(trade.volume) && 
        ((trade.type.toLowerCase() === 'buy' && pos.type === 'sell') ||
         (trade.type.toLowerCase() === 'sell' && pos.type === 'buy'))
      );
      if (matchIndex !== -1) {
        openTrades.splice(matchIndex, 1);
      }
    }
  }
  
  // Calculate open positions value
  let openPnL = 0;
  let totalVolume = 0;
  let weightedAveragePrice = 0;
  let totalWeightedVolume = 0;
  
  // Calculate P/L for each open trade
  const tradesWithPnL = openTrades.map(trade => {
    const pnl = trade.type === 'buy'
      ? (marketPrice - trade.entryPrice) * trade.volume * 100000
      : (trade.entryPrice - marketPrice) * trade.volume * 100000;
    
    totalVolume += trade.type === 'buy' ? trade.volume : -trade.volume;
    openPnL += pnl;
    weightedAveragePrice += trade.entryPrice * trade.volume;
    totalWeightedVolume += trade.volume;

    return {
      ...trade,
      currentPrice: marketPrice,
      profit: pnl
    };
  });
  
  const aep = totalWeightedVolume > 0 ? weightedAveragePrice / totalWeightedVolume : 0;
  
  // Format the time (already in CSV timezone)
  const date = new Date(currentTime);
  const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

  // Calculate closed P/L for this symbol only
  const symbolClosedPnL = symbolTrades.reduce((total, trade) => {
    return total + parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
  }, 0);

  // Calculate drawdown - we need to track peak balance over time
  // For now, we'll use a simplified calculation based on current balance vs initial
  const totalPnL = symbolClosedPnL + openPnL;
  const currentTotalBalance = initialBalance + totalPnL;
  const peakBalance = Math.max(initialBalance, currentTotalBalance);
  const currentDrawdown = peakBalance > 0 ? ((peakBalance - currentTotalBalance) / peakBalance) * 100 : 0;

  return {
    date: formattedDate,
    position: totalVolume.toFixed(2),
    closed: `$${symbolClosedPnL.toFixed(2)}`,
    aep: `$${aep.toFixed(5)}`,
    eoPeriodPrice: `$${marketPrice.toFixed(5)}`,
    currentFX: '1.00',
    open: `$${openPnL.toFixed(2)}`,
    total: `$${(symbolClosedPnL + openPnL).toFixed(2)}`,
    trades: tradesWithPnL,
    openTradesCount: openTrades.length.toString(),
    currentDrawdown: `${Math.max(0, currentDrawdown).toFixed(2)}%`
  };
};

const parseMarketData = (data: string, trades: TradeHistoryItem[], initialBalance: number, selectedSymbol: string, csvTimezone: number = 0): MarkToMarketItem[] => {
  try {
    // Handle both string (NDJSON) and array (parsed JSON) inputs
    let marketDataPoints;
    
    if (Array.isArray(data)) {
      // Data is already parsed as an array
      marketDataPoints = data;
    } else if (typeof data === 'string') {
      // Data is a string, parse each line as JSON
      const lines = data.trim().split('\n');
      marketDataPoints = lines.map(line => JSON.parse(line));
    } else {
      throw new Error('Invalid data format: expected string or array');
    }
    
    // Find the first trade time for the selected symbol
    const symbolTrades = trades.filter(trade => trade.symbol === selectedSymbol);
    
    if (symbolTrades.length === 0) {
      console.log(`No trades found for symbol ${selectedSymbol}`);
      return [];
    }
    
    // Sort trades by time to get the actual first trade
    const sortedTrades = symbolTrades.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const firstTradeTime = new Date(sortedTrades[0].time);
    
    console.log(`First trade time for ${selectedSymbol}:`, firstTradeTime?.toISOString());
    console.log(`Total trades for ${selectedSymbol}:`, symbolTrades.length);
    
    const processedMarketData = marketDataPoints.map(candle => {
      
      // Convert API time (UTC) to CSV timezone
      const adjustedTime = new Date(apiTimeToCsvTime(candle.time, csvTimezone));
      
      return {
        ...candle,
        time: adjustedTime.toISOString(),
        adjustedTime: adjustedTime
      };
    });
    
    if (processedMarketData.length > 0) {
      console.log(`CSV timezone: GMT+${csvTimezone}`);
      console.log(`CSV first trade: ${firstTradeTime.toISOString()}`);
      console.log(`API first point (adjusted): ${processedMarketData[0]?.time}`);
    }
    
    // Filter to start from the first trade time
    const filteredMarketData = processedMarketData.filter(point => {
      const pointTime = point.adjustedTime.getTime();
      const tradeTime = firstTradeTime.getTime();
      
      // Allow some tolerance (within 15 minutes) to account for market data intervals
      const tolerance = 15 * 60 * 1000; // 15 minutes in milliseconds
      return pointTime >= (tradeTime - tolerance);
    });
    
    console.log(`Filtered market data points: ${filteredMarketData.length}`);
    if (filteredMarketData.length > 0) {
      console.log(`First filtered point:`, filteredMarketData[0]?.time);
    }
    
    return filteredMarketData.map(point => 
      calculateMarkToMarket(trades, point.time, point.close, initialBalance, selectedSymbol, csvTimezone)
    );
  } catch (error) {
    console.error('Error parsing market data:', error);
    return [];
  }
};

const fetchMarketData = async (symbol: string, fromDate: string, toDate: string) => {
  try {
    // Convert CSV dates to UTC for API request
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    // Add one day to the end date to ensure we get complete data
    toDateObj.setDate(toDateObj.getDate() + 1);

    // Format dates for API call
    const formattedFromDate = fromDateObj.toISOString().split('T')[0];
    const formattedToDate = toDateObj.toISOString().split('T')[0];
    
    const apiUrl = `https://test.neuix.host/api/market-data/get?from_date=${encodeURIComponent(formattedFromDate)}&to_date=${encodeURIComponent(formattedToDate)}&timeframe=M15&symbols=${encodeURIComponent(symbol)}`;
    
    console.log('Making API call for market data:', {
      symbol,
      fromDate: formattedFromDate,
      toDate: formattedToDate,
      originalFromDate: fromDate,
      originalToDate: toDate
    });

    const response = await axios({
      method: 'get',
      url: apiUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (!response.data) {
      throw new Error('No data received from API');
    }

    return response.data;
  } catch (error) {
    console.error('API call failed:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers
    });
    throw error;
  }
};

const extractSymbolFromHTML = (doc: Document): string | null => {
  const rows = doc.getElementsByTagName('tr');
  for (const row of rows) {
    const cells = row.getElementsByTagName('td');
    if (cells.length >= 2) {
      const firstCell = cells[0].textContent?.trim() || '';
      if (firstCell === 'Symbol:') {
        const symbolCell = cells[1].querySelector('b');
        if (symbolCell && symbolCell.textContent) {
          return symbolCell.textContent.trim();
        }
      }
    }
  }
  return null;
};

const isValidSymbol = (symbol: string): boolean => {
  // Updated regex to support:
  // - 6 alphanumeric characters (XAUUSD, EURUSD)
  // - 3-4 characters followed by underscore and suffix (GDX_S, GLD_ETF, GDXJ_S)
  // - Currency pairs with underscore (USDEUR_E)
  const symbolRegex = /^([A-Za-z0-9]{6}|[A-Za-z0-9]{3,6}_[A-Za-z0-9]{1,3})$/;
  return symbolRegex.test(symbol);
};

const extractAllSymbolsFromHTML = (doc: Document): string[] => {
  const symbols = new Set<string>();
  
  // First, try to get the main symbol from the Symbol field
  const mainSymbol = extractSymbolFromHTML(doc);
  if (mainSymbol && isValidSymbol(mainSymbol)) {
    symbols.add(mainSymbol);
  }
  
  // Then extract symbols from the deals table
  const dealsTable = findDealsTable(doc);
  if (dealsTable) {
    const rows = dealsTable.getElementsByTagName('tr');
    
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].getElementsByTagName('td');
      
      if (cells.length >= 3) {
        const symbolCell = cells[2].textContent?.trim();
        if (symbolCell && symbolCell !== 'Symbol' && symbolCell !== '') {
          // Filter out balance entries and other non-symbol entries
          // Use the updated validation function
          if (!symbolCell.toLowerCase().includes('balance') && 
              !symbolCell.toLowerCase().includes('credit') &&
              !symbolCell.toLowerCase().includes('deposit') &&
              isValidSymbol(symbolCell)) {
            symbols.add(symbolCell);
          }
        }
      }
    }
  }
  
  console.log('Extracted valid symbols:', Array.from(symbols));
  return Array.from(symbols).sort();
};

const extractExpertNameFromHTML = (doc: Document): string | null => {
  const rows = doc.getElementsByTagName('tr');
  for (const row of rows) {
    const cells = row.getElementsByTagName('td');
    if (cells.length >= 2) {
      const firstCell = cells[0].textContent?.trim() || '';
      if (firstCell === 'Expert:') {
        const expertCell = cells[1].querySelector('b');
        if (expertCell && expertCell.textContent) {
          return expertCell.textContent.trim();
        }
      }
    }
  }
  return null;
};

const extractInitialBalanceFromHTML = (doc: Document): number => {
  const rows = doc.getElementsByTagName('tr');
  for (const row of rows) {
    const cells = row.getElementsByTagName('td');
    if (cells.length >= 2) {
      const firstCell = cells[0].textContent?.trim() || '';
      if (firstCell === 'Initial Deposit:') {
        const balanceText = cells[1].textContent?.trim() || '0';
        return parseFloat(balanceText.replace(/[^\d.-]/g, '')) || 10000;
      }
    }
  }
  return 10000; // Default value if not found
};

const isTradeDataRow = (row: HTMLTableRowElement): boolean => {
  const cells = Array.from(row.getElementsByTagName('td'));
  if (cells.length < 5) return false;

  const timeCell = cells[0].textContent?.trim() || '';
  const hasDateFormat = /^\d{4}\.\d{2}\.\d{2}/.test(timeCell);

  const hasNumericData = cells.some(cell => {
    const text = cell.textContent?.trim() || '';
    return /^-?\d+\.?\d*$/.test(text);
  });

  return hasDateFormat && hasNumericData;
};

const analyzeTableHeaders = (headerRow: HTMLTableRowElement): boolean => {
  const headerCells = Array.from(headerRow.getElementsByTagName('td')).map(td => 
    td.textContent?.trim().toLowerCase() || ''
  );

  const requiredHeaders = ['time', 'deal', 'type', 'volume', 'price'];
  const foundHeaders = requiredHeaders.filter(header => 
    headerCells.some(cell => cell.includes(header))
  );

  console.log('Table header analysis:', {
    foundHeaders,
    headerCells,
    matchScore: foundHeaders.length / requiredHeaders.length
  });

  return foundHeaders.length / requiredHeaders.length >= 0.8;
};

const findDealsTable = (doc: Document): HTMLTableElement | null => {
  const tables = Array.from(doc.getElementsByTagName('table'));
  console.log(`Analyzing ${tables.length} tables in document`);

  for (const table of tables) {
    console.log('Analyzing table:', {
      rows: table.rows.length,
      caption: table.querySelector('caption')?.textContent,
      firstRowCells: table.rows[0]?.cells.length
    });

    const caption = table.querySelector('caption')?.textContent?.toLowerCase() || '';
    if (caption.includes('deal') || caption.includes('order') || caption.includes('trade')) {
      console.log('Found table by caption:', caption);
      return table;
    }

    const headerRow = table.rows[0];
    if (headerRow && analyzeTableHeaders(headerRow)) {
      console.log('Found table by header analysis');
      return table;
    }

    const dataRows = Array.from(table.rows).slice(1);
    const tradeDataCount = dataRows.filter(row => isTradeDataRow(row)).length;
    
    if (tradeDataCount > 0) {
      console.log(`Found table with ${tradeDataCount} trade-like data rows`);
      return table;
    }
  }

  console.error('No deals table found. Table details:', tables.map(table => ({
    rowCount: table.rows.length,
    caption: table.querySelector('caption')?.textContent,
    firstRowContent: table.rows[0]?.textContent,
    hasTradeData: Array.from(table.rows).slice(1).some(row => isTradeDataRow(row))
  })));

  return null;
};

export const parseHtmlFile = async (file: File, csvTimezone: number = 0, customInitialBalance?: number): Promise<BacktestData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        if (!event.target?.result) {
          throw new Error('Failed to read file content');
        }

        const html = event.target.result as string;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const totalTables = doc.getElementsByTagName('table').length;
        console.log(`Found ${totalTables} tables in the document`);

        const initialBalance = extractInitialBalanceFromHTML(doc);
        let drawdown = '0.00';
        let totalNetProfit = '0.00';
        
        const tables = Array.from(doc.getElementsByTagName('table'));
        for (const table of tables) {
          const rows = Array.from(table.getElementsByTagName('tr'));
          for (const row of rows) {
            const cells = row.getElementsByTagName('td');
            for (let i = 0; i < cells.length; i++) {
              const cell = cells[i];
              const text = cell.textContent?.trim() || '';
              
              if (text === 'Balance Drawdown Absolute:') {
                const valueCell = cells[i + 1];
                const drawdownValue = valueCell?.querySelector('b')?.textContent?.trim() || '0.00';
                drawdown = drawdownValue;
              } else if (text === 'Total Net Profit:') {
                const valueCell = cells[i + 1];
                const profitValue = valueCell?.querySelector('b')?.textContent?.trim() || '0.00';
                totalNetProfit = profitValue;
              }
            }
          }
        }

        const dealsTable = findDealsTable(doc);
        const currencyPair = extractSymbolFromHTML(doc) || 'XAUUSD';
        const availableSymbols = extractAllSymbolsFromHTML(doc);
        const expertName = extractExpertNameFromHTML(doc) || 'Unknown Expert';
        const finalInitialBalance = customInitialBalance || initialBalance;

        if (!dealsTable) {
          console.error('Deals table not found. Document structure:', {
            tables: totalTables,
            tableHeaders: Array.from(doc.getElementsByTagName('table')).map(table => {
              const caption = table.querySelector('caption')?.textContent;
              const firstRow = table.querySelector('tr')?.textContent;
              const innerHTML = table.innerHTML;
              return { caption, firstRow, innerHTML };
            })
          });
          throw new Error('Could not find Deals table in the report. The file might not be a valid MT4/MT5 backtest report, or it might have a different structure than expected. Please ensure you are uploading a complete backtest report file.');
        }

        let tradeHistory: TradeHistoryItem[] = [];
        const rows = dealsTable.getElementsByTagName('tr');

        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].getElementsByTagName('td');
          
          if (cells.length >= 13) {
            const timeStr = cells[0].textContent?.trim() || '';
            
            if (!timeStr || timeStr === 'Time') {
              continue;
            }

            let validTime: string;
            try {
              validTime = parseMTDateTime(timeStr);
            } catch (error) {
              console.error(`Skipping row ${i} due to invalid time:`, timeStr);
              continue;
            }

            const trade: TradeHistoryItem = {
              time: validTime,
              deal: cells[1].textContent?.trim() || '',
              symbol: cells[2].textContent?.trim() || '',
              type: cells[3].textContent?.trim() || '',
              direction: cells[4].textContent?.trim() || '',
              volume: cells[5].textContent?.trim() || '',
              price: cells[6].textContent?.trim() || '',
              order: cells[7].textContent?.trim() || '',
              commission: cells[8].textContent?.trim() || '',
              swap: cells[9].textContent?.trim() || '',
              profit: cells[10].textContent?.trim() || '',
              balance: cells[11].textContent?.trim() || '',
              comment: cells[12].textContent?.trim() || '',
              position: '0',
              closed: '$0.00',
              aep: '0',
              open: '$0.00',
              total: '$0.00'
            };

            if (trade.time && (trade.symbol || trade.type.toLowerCase() === 'balance')) {
              tradeHistory.push(trade);
            }
          }
        }

        if (tradeHistory.length === 0) {
          throw new Error('No valid trades found in the Deals table. Please ensure the report contains trading history data.');
        }

        // Calculate stats for the main symbol only
        const mainSymbolTrades = tradeHistory.filter(trade => 
          trade.symbol === currencyPair && parseFloat(trade.profit) !== 0
        );
        const profitableTrades = mainSymbolTrades.filter(trade => parseFloat(trade.profit) > 0);
        const winRate = mainSymbolTrades.length > 0
          ? ((profitableTrades.length / mainSymbolTrades.length) * 100).toFixed(2)
          : '0.00';

        const trades = tradeHistory.filter(trade => parseFloat(trade.profit) !== 0);
        let markToMarketData = [];

        if (trades.length > 0) {
          // Find the first actual trade for the main symbol
          const firstTrade = trades.find(trade => 
            trade.type.toLowerCase() !== 'balance' && trade.symbol === currencyPair
          );
          const lastTrade = trades.filter(trade => trade.symbol === currencyPair).pop();

          if (firstTrade && lastTrade) {
            const fromDate = new Date(firstTrade.time);
            const toDate = new Date(lastTrade.time);

            try {
              const marketData = await fetchMarketData(
                currencyPair,
                csvTimeToApiTime(fromDate.toISOString(), csvTimezone),
                csvTimeToApiTime(toDate.toISOString(), csvTimezone)
              );
              markToMarketData = parseMarketData(marketData, tradeHistory, finalInitialBalance, currencyPair, csvTimezone);
            } catch (error) {
              console.error('Market data fetch error:', {
                error,
                message: error.message,
                response: error.response?.data
              });
              markToMarketData = [];
            }
          }
        }

        resolve({
          currencyPair,
          expertName,
          totalProfit: `$${totalNetProfit}`,
          winRate: `${winRate}%`,
          totalTrades: mainSymbolTrades.length.toString(),
          maxDrawdown: `${drawdown}%`,
          initialBalance: finalInitialBalance,
          tradeHistory,
          markToMarketData,
          chartData: [],
          availableSymbols
        });

      } catch (error) {
        console.error('Error processing file:', {
          error,
          message: error.message,
          stack: error.stack
        });
        reject(new Error(error instanceof Error ? error.message : 'Unknown error'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const fetchMarkToMarketForSymbol = async (
  symbol: string,
  tradeHistory: TradeHistoryItem[],
  initialBalance: number,
  csvTimezone: number = 0
): Promise<MarkToMarketItem[]> => {
  const symbolTrades = tradeHistory.filter(trade => 
    trade.symbol === symbol && parseFloat(trade.profit) !== 0
  );

  if (symbolTrades.length === 0) {
    return [];
  }

  const firstTrade = symbolTrades.find(trade => trade.type.toLowerCase() !== 'balance');
  const lastTrade = symbolTrades[symbolTrades.length - 1];

  if (!firstTrade || !lastTrade) {
    return [];
  }

  try {
    // Reset peak balance for new calculation
    calculateMarkToMarket.peakBalance = initialBalance;
    
    const fromDate = new Date(firstTrade.time);
    const toDate = new Date(lastTrade.time);

    // Convert CSV times to UTC for API request
    const apiFromDate = csvTimeToApiTime(fromDate.toISOString(), csvTimezone);
    const apiToDate = csvTimeToApiTime(toDate.toISOString(), csvTimezone);

    const marketData = await fetchMarketData(
      symbol,
      apiFromDate,
      apiToDate
    );

    return parseMarketData(marketData, tradeHistory, initialBalance, symbol, csvTimezone);
  } catch (error) {
    console.error('Market data fetch error for symbol:', symbol, error);
    throw error;
  }
};