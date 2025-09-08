import { BacktestData, TradeHistoryItem, MarkToMarketItem } from '../types';
import axios from 'axios';
import { apiTimeToCsvTime, csvTimeToApiTime } from './timezoneUtils';
import { convertCSVToUnified, generateCSVFromTrades } from './htmlToCsvConverter';

interface CSVTradeRow {
  'Time': string;
  'Position': string;
  'Symbol': string;
  'Type': string;
  'Volume': string;
  'Price': string;
  'S / L': string;
  'T / P': string;
  'Time': string; // Second Time column
  'Price': string; // Second Price column (exit price)
  'Commission': string;
  'Swap': string;
  'Profit': string;
}

interface CompleteTrade {
  position: string;
  symbol: string;
  type: string;
  volume: number;
  openTime: Date;
  closeTime: Date;
  openPrice: number;
  closePrice: number;
  commission: number;
  swap: number;
  profit: number;
  stopLoss: string;
  takeProfit: string;
}

interface MarketDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const parseCSVDateTime = (dateStr: string): string => {
  try {
    if (!dateStr || dateStr.trim() === '' || dateStr.trim() === '-') {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    // Handle format: 2025.01.08 11:25:24
    const [datePart, timePart] = dateStr.trim().split(' ');
    if (!datePart || !timePart) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    const [year, month, day] = datePart.split('.');
    const [hours, minutes, seconds] = timePart.split(':');

    if (!year || !month || !day || !hours || !minutes || !seconds) {
      throw new Error(`Missing date components: ${dateStr}`);
    }

    // Crear ISO string directamente sin usar Date constructor para evitar timezone del navegador
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    const paddedHours = hours.padStart(2, '0');
    const paddedMinutes = minutes.padStart(2, '0');
    const paddedSeconds = seconds.padStart(2, '0');
    
    // IMPORTANTE: Preservar el tiempo exacto del CSV sin conversión
    const isoString = `${year}-${paddedMonth}-${paddedDay}T${paddedHours}:${paddedMinutes}:${paddedSeconds}.000Z`;
    console.log(`CSV time ${dateStr} -> ${isoString}`);
    return isoString;
  } catch (error) {
    console.error('CSV Date parsing error:', error);
    throw new Error(`Invalid time value: ${dateStr}`);
  }
};

const parseCSVRow = (values: string[], headers: string[], index: number): { openTrade: TradeHistoryItem | null, closeTrade: TradeHistoryItem | null, completeTrade: CompleteTrade | null } => {
  try {
    // Find column indices - handle duplicate column names correctly
    const timeCol1 = headers.indexOf('Time');
    const timeCol2 = headers.lastIndexOf('Time');
    const priceCol1 = headers.indexOf('Price');
    const priceCol2 = headers.lastIndexOf('Price');
    
    const openTime = values[timeCol1] || '';
    const closeTime = values[timeCol2] || openTime;
    const entryPrice = values[priceCol1] || '';
    const exitPrice = values[priceCol2] || entryPrice;
    
    // Get other column values by finding their indices
    const positionIndex = headers.indexOf('Position');
    const symbolIndex = headers.indexOf('Symbol');
    const typeIndex = headers.indexOf('Type');
    const volumeIndex = headers.indexOf('Volume');
    const stopLossIndex = headers.indexOf('S / L');
    const takeProfitIndex = headers.indexOf('T / P');
    const commissionIndex = headers.indexOf('Commission');
    const swapIndex = headers.indexOf('Swap');
    const profitIndex = headers.indexOf('Profit');
    
    const position = positionIndex >= 0 ? values[positionIndex] || '' : '';
    const symbol = symbolIndex >= 0 ? values[symbolIndex] || '' : '';
    const type = typeIndex >= 0 ? values[typeIndex] || '' : '';
    const volume = volumeIndex >= 0 ? values[volumeIndex] || '' : '';
    const stopLoss = stopLossIndex >= 0 ? values[stopLossIndex] || '' : '';
    const takeProfit = takeProfitIndex >= 0 ? values[takeProfitIndex] || '' : '';
    const commission = commissionIndex >= 0 ? values[commissionIndex] || '0.00' : '0.00';
    const swap = swapIndex >= 0 ? values[swapIndex] || '0.00' : '0.00';
    
    // Clean profit value - remove spaces and other formatting issues
    let profit = profitIndex >= 0 ? values[profitIndex] || '0.00' : '0.00';
    profit = profit.replace(/\s+/g, ''); // Remove all spaces
    profit = profit.replace(/[^\d.-]/g, ''); // Keep only digits, dots, and minus signs
    if (!profit || profit === '' || profit === '-') {
      profit = '0.00';
    }

    // Skip rows with invalid or missing data
    if (!openTime || !symbol || !type || !closeTime || 
        openTime.trim() === '-' || closeTime.trim() === '-' ||
        symbol.trim() === '' || type.trim() === '') {
      console.warn(`Skipping row ${index}: Missing or invalid required fields`);
      return { openTrade: null, closeTrade: null, completeTrade: null };
    }

    // Parse numeric values
    const parsedProfit = parseFloat(profit) || 0;
    const parsedCommission = parseFloat(commission) || 0;
    const parsedSwap = parseFloat(swap) || 0;
    const parsedVolume = parseFloat(volume) || 0;
    const parsedOpenPrice = parseFloat(entryPrice) || 0;
    const parsedClosePrice = parseFloat(exitPrice) || 0;

    // Create the complete trade object for mark-to-market calculations
    const completeTrade: CompleteTrade = {
      position,
      symbol,
      type: type.toLowerCase(),
      volume: parsedVolume,
      openTime: new Date(parseCSVDateTime(openTime)),
      closeTime: new Date(parseCSVDateTime(closeTime)),
      openPrice: parsedOpenPrice,
      closePrice: parsedClosePrice,
      commission: parsedCommission,
      swap: parsedSwap,
      profit: parsedProfit,
      stopLoss,
      takeProfit
    };

    // Create open trade entry
    const openTrade: TradeHistoryItem = {
      time: parseCSVDateTime(openTime),
      deal: `${index + 1}`,
      symbol: symbol,
      type: type.toLowerCase(),
      direction: 'in',
      volume: volume,
      price: entryPrice,
      order: position || `${index + 1}`,
      commission: '0.00', // Commission applied at close
      swap: '0.00', // Swap applied at close
      profit: '0.00', // No profit at open
      balance: '10000.00', // Will be updated with running balance
      comment: `SL: ${stopLoss}, TP: ${takeProfit}`,
      position: position,
      closed: '$0.00',
      aep: '0',
      open: '$0.00',
      total: '$0.00'
    };

    // Create close trade entry
    const closeTrade: TradeHistoryItem = {
      time: parseCSVDateTime(closeTime),
      deal: `${index + 1}`,
      symbol: symbol,
      type: type.toLowerCase(),
      direction: 'out',
      volume: volume,
      price: exitPrice,
      order: position || `${index + 1}`,
      commission: parsedCommission.toFixed(2),
      swap: parsedSwap.toFixed(2),
      profit: parsedProfit.toFixed(2),
      balance: '10000.00', // Will be updated with running balance
      comment: `SL: ${stopLoss}, TP: ${takeProfit}`,
      position: position,
      closed: '$0.00',
      aep: '0',
      open: '$0.00',
      total: '$0.00'
    };

    return { openTrade, closeTrade, completeTrade };
  } catch (error) {
    console.error(`Error parsing CSV row ${index}:`, error);
    return { openTrade: null, closeTrade: null, completeTrade: null };
  }
};

const parseCSVContent = (csvContent: string): { headers: string[], dataRows: string[][] } => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must contain at least a header row and one data row');
  }

  // Parse headers - handle both tab and comma separation
  let headers: string[];
  const firstLine = lines[0];
  
  if (firstLine.includes('\t')) {
    headers = firstLine.split('\t').map(h => h.trim());
  } else {
    headers = firstLine.split(',').map(h => h.trim());
  }


  // Validate that we have the expected headers
  const expectedHeaders = ['Time', 'Position', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Commission', 'Swap', 'Profit'];
  const missingHeaders = expectedHeaders.filter(expected => 
    !headers.some(header => header.toLowerCase().includes(expected.toLowerCase()))
  );


  const dataRows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    // Parse values - handle both tab and comma separation
    let values: string[];
    if (line.includes('\t')) {
      values = line.split('\t').map(v => v.trim());
    } else {
      values = line.split(',').map(v => v.trim());
    }

    if (values.length < headers.length) {
      // Pad with empty strings if needed
      while (values.length < headers.length) {
        values.push('');
      }
    }

    dataRows.push(values);
  }

  return { headers, dataRows };
};

const fetchMarketData = async (symbol: string, fromDate: string, toDate: string): Promise<MarketDataPoint[]> => {
  try {
    console.log('=== CSV PARSER MARKET DATA API CALL START ===');
    console.log('CSV Parser API request:', {
      symbol,
      fromDate,
      toDate,
      caller: 'csvParser.fetchMarketData'
    });

    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    // Add one day to the end date to ensure we get the full period
    toDateObj.setDate(toDateObj.getDate() + 1);

    // Format dates for API call
    const formattedFromDate = fromDateObj.toISOString().split('T')[0];
    const formattedToDate = toDateObj.toISOString().split('T')[0];
      method: 'get',
      url: apiUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('CSV Parser API Response:', {
      status: response.status,
      statusText: response.statusText,
      dataType: typeof response.data,
    });

    if (!response.data) {
      console.error('CSV Parser: No data in API response');
      throw new Error('No data received from API');
    }

    // Parse the response data
    let marketDataPoints: MarketDataPoint[] = [];
    
    if (typeof response.data === 'string') {
      marketDataPoints = parseNDJSON(response.data.data);
    } else if (response.data.data && Array.isArray(response.data.data)) {
      marketDataPoints = response.data.data;
    }


    return marketDataPoints;

  } catch (error) {
    throw error;
  }
};

const parseNDJSON = (responseData: string): MarketDataPoint[] => {
  try {
    const jsonLines = responseData.split('\n').filter(line => line.trim() !== '');
    return jsonLines.map(line => JSON.parse(line));
  } catch (error) {
    console.error('Error parsing NDJSON data:', error);
    return [];
  }
};

const getMarketPriceAtTime = (marketData: MarketDataPoint[], targetTime: Date): number => {
  if (marketData.length === 0) return 0;

  // Find the closest market data point to the target time
  const targetTimestamp = targetTime.getTime();
  
  let closestPoint = marketData[0];
  let closestDiff = Math.abs(new Date(closestPoint.time).getTime() - targetTimestamp);

  for (const point of marketData) {
    const pointTimestamp = new Date(point.time).getTime();
    const diff = Math.abs(pointTimestamp - targetTimestamp);
    
    if (diff < closestDiff) {
      closestDiff = diff;
      closestPoint = point;
    }
  }

  return closestPoint.close;
};

const generateMarkToMarketData = async (completeTrades: CompleteTrade[], selectedSymbol: string, initialBalance: number, csvTimezone: number = 0): Promise<MarkToMarketItem[]> => {
  const symbolTrades = completeTrades.filter(trade => trade.symbol === selectedSymbol);
  
  if (symbolTrades.length === 0) {
    return [];
  }


  // Get the date range using the first trade's entry time
  const firstTrade = symbolTrades.reduce((earliest, trade) => 
    trade.openTime < earliest.openTime ? trade : earliest
  );
  const lastTrade = symbolTrades.reduce((latest, trade) => 
    trade.closeTime > latest.closeTime ? trade : latest
  );


  let marketDataPoints: MarketDataPoint[] = [];
  
  try {
    // Convert CSV times to UTC for API request
    const apiFromTime = csvTimeToApiTime(firstTrade.openTime.toISOString(), csvTimezone);
    const apiToTime = csvTimeToApiTime(lastTrade.closeTime.toISOString(), csvTimezone);
    
    marketDataPoints = await fetchMarketData(
      selectedSymbol,
      apiFromTime,
      apiToTime
    );

    // Convert API data (UTC) back to CSV timezone
    const firstTradeTime = firstTrade.openTime.getTime();
    
    marketDataPoints = marketDataPoints
      .map(point => {
        // Convert API time (UTC) to CSV timezone
        const adjustedTime = new Date(apiTimeToCsvTime(point.time, csvTimezone));
        return {
          ...point,
          time: adjustedTime.toISOString()
        };
      })
      .filter(point => {
        // Only include data from the first trade time onwards
        return new Date(point.time).getTime() >= firstTradeTime;
      });

  } catch (error) {
    // Continue without market data - we'll use trade prices as fallback
  }

  // Create comprehensive mark-to-market data
  const markToMarketData: MarkToMarketItem[] = [];
  
  // If we have market data, use those timestamps; otherwise generate 15-minute intervals
  const timePoints = marketDataPoints.length > 0 
    ? marketDataPoints.map(point => ({ 
        time: new Date(point.time).getTime(), 
        marketPrice: point.close 
      }))
    : [];
  
  // If no market data, generate time intervals
  if (timePoints.length === 0) {
    const startTime = firstTrade.openTime.getTime();
    const endTime = lastTrade.closeTime.getTime();
    const intervalMs = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    for (let currentTime = startTime; currentTime <= endTime; currentTime += intervalMs) {
      timePoints.push({ time: currentTime, marketPrice: 0 });
    }
  }
  
  // Track running totals for accurate calculations
  let runningClosedPnL = 0;
  let peakBalance = initialBalance;
  
  // Process each time point
  for (const timePoint of timePoints) {
    const currentDateTime = new Date(timePoint.time);
    const marketPrice = timePoint.marketPrice;
    
    // Calculate closed P/L up to this point (cumulative)
    const closedTrades = symbolTrades.filter(trade => trade.closeTime <= currentDateTime);
    const totalRealizedProfit = closedTrades.reduce((sum, trade) => {
      const profitValue = parseFloat(trade.profit.toString().replace(/[^\d.-]/g, '') || '0');
      return sum + profitValue;
    }, 0);
    
    // Find open positions at this time
    const openTrades = symbolTrades.filter(trade => 
      trade.openTime <= currentDateTime && trade.closeTime > currentDateTime
    );
    
    // Determine market price to use for calculations
    let finalMarketPrice = marketPrice;
    if (finalMarketPrice === 0 && openTrades.length > 0) {
      // Fallback: use the most recent trade's close price or average entry price
      const recentClosedTrade = closedTrades[closedTrades.length - 1];
      if (recentClosedTrade) {
        finalMarketPrice = recentClosedTrade.closePrice;
      } else {
        finalMarketPrice = openTrades.reduce((sum, trade) => sum + trade.openPrice, 0) / openTrades.length;
      }
    }
    
    // Calculate open positions metrics with proper position sizing
    let netPosition = 0; // Net position (positive = long, negative = short)
    let weightedAveragePrice = 0;
    let totalWeightedVolume = 0;
    let openPnL = 0;
    
    // Calculate metrics for each open trade
    const openTradesWithPnL = openTrades.map(trade => {
      // Position direction: buy = positive, sell = negative
      const positionDirection = trade.type === 'buy' ? 1 : -1;
      const positionSize = trade.volume * positionDirection;
      
      netPosition += positionSize;
      
      // Calculate weighted average entry price
      const absVolume = Math.abs(trade.volume);
      weightedAveragePrice += trade.openPrice * absVolume;
      totalWeightedVolume += absVolume;
      
      // Calculate unrealized P/L for this trade
      let pnl = 0;
      if (finalMarketPrice > 0) {
        if (trade.type === 'buy') {
          // Long position: profit when market price > entry price
          pnl = (finalMarketPrice - trade.openPrice) * trade.volume * 100000;
        } else {
          // Short position: profit when market price < entry price
          pnl = (trade.openPrice - finalMarketPrice) * trade.volume * 100000;
        }
      }
      openPnL += pnl;

      return {
        entryTime: trade.openTime.toISOString(),
        symbol: trade.symbol,
        type: trade.type,
        volume: trade.volume,
        entryPrice: trade.openPrice,
        currentPrice: finalMarketPrice,
        profit: pnl,
        deal: trade.position
      };
    });
    
    // Calculate Average Entry Price (AEP)
    const aep = totalWeightedVolume > 0 ? weightedAveragePrice / totalWeightedVolume : 0;
    
    // Calculate total P/L and drawdown
    const totalPnL = totalRealizedProfit; // CRITICAL: Total P/L = REALIZED PROFIT ONLY
    const currentBalance = initialBalance + totalPnL;
    
    // Update peak balance for drawdown calculation
    if (currentBalance > peakBalance) {
      peakBalance = currentBalance;
    }
    const currentDrawdown = peakBalance > 0 ? ((peakBalance - currentBalance) / peakBalance) * 100 : 0;
    
    // Format the date for display
    const formattedDate = `${currentDateTime.getFullYear()}-${String(currentDateTime.getMonth() + 1).padStart(2, '0')}-${String(currentDateTime.getDate()).padStart(2, '0')} ${String(currentDateTime.getHours()).padStart(2, '0')}:${String(currentDateTime.getMinutes()).padStart(2, '0')}:00`;
    
    // Create mark-to-market entry
    markToMarketData.push({
      date: formattedDate,
      position: netPosition.toFixed(2), // Net position (positive = long, negative = short)
      closed: `$${totalRealizedProfit.toFixed(2)}`, // Realized P/L from closed trades
      aep: `$${aep.toFixed(5)}`, // Average Entry Price of open positions
      eoPeriodPrice: `$${finalMarketPrice.toFixed(5)}`, // Current market price
      currentFX: '1.00', // Conversion rate (assuming USD base)
      open: `$${openPnL.toFixed(2)}`, // Unrealized P/L from open positions
      total: `$${totalPnL.toFixed(2)}`, // Total P/L = REALIZED ONLY (excludes unrealized)
      trades: openTradesWithPnL, // Details of open trades
      openTradesCount: openTrades.length.toString(), // Number of open trades
      currentDrawdown: `${currentDrawdown.toFixed(2)}%` // Current drawdown percentage
    });
  }

  return markToMarketData;
};

export const parseCSVFile = async (file: File, csvTimezone: number = 0, customInitialBalance: number = 10000): Promise<BacktestData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        if (!event.target?.result) {
          throw new Error('Failed to read file content');
        }

        const csvContent = event.target.result as string;
        
        // Check if file is empty
        if (!csvContent.trim()) {
          throw new Error('File is empty. Please upload a valid CSV or HTML file.');
        }
        
        let convertedData;
        try {
          // Convertir CSV a formato unificado
          convertedData = convertCSVToUnified(csvContent, csvTimezone, customInitialBalance);
        } catch (error) {
          // If CSV conversion fails, it might be an HTML file
          throw new Error('Invalid CSV format. Please ensure your file has the correct CSV structure with headers and data rows, or upload an HTML backtest report instead.');
        }
        
        // Procesar usando la lógica existente pero con datos unificados
        const tradeHistory = convertedData.trades;
        const availableSymbols = [...new Set(tradeHistory.map(trade => trade.symbol))].sort();
        const mainSymbol = convertedData.metadata.symbol;
        
        // Calcular estadísticas
        const mainSymbolTrades = tradeHistory.filter(trade => 
          trade.symbol === mainSymbol && parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0') !== 0
        );
        const profitableTrades = mainSymbolTrades.filter(trade => parseFloat(trade.profit) > 0);
        const winRate = mainSymbolTrades.length > 0
          ? ((profitableTrades.length / mainSymbolTrades.length) * 100).toFixed(2)
          : '0.00';
        
        // Calcular max drawdown
        let maxDrawdown = 0;
        let peak = customInitialBalance;
        let currentBalance = customInitialBalance;

        for (const trade of tradeHistory) {
          currentBalance = parseFloat(trade.balance);
          if (currentBalance > peak) {
            peak = currentBalance;
          }
          const drawdown = ((peak - currentBalance) / peak) * 100;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }
        
        // Generar mark-to-market data
        const completeTrades = convertTradesForMarkToMarket(tradeHistory);
        const markToMarketData = await generateMarkToMarketData(completeTrades, mainSymbol, customInitialBalance, csvTimezone);
        
        const totalRealizedProfit = completeTrades.reduce((sum, trade) => {
          const profitValue = parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
          const commissionValue = parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0');
          const swapValue = parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0');
          const totalValue = profitValue + commissionValue + swapValue;
          return sum + totalValue;
        }, 0);
        
        const backtestData: BacktestData = {
          currencyPair: mainSymbol,
          expertName: convertedData.metadata.expertName,
          totalTrades: Math.floor(mainSymbolTrades.length / 2).toString(), // Dividir por 2 porque tenemos in/out
          totalProfit: `$${totalRealizedProfit.toFixed(2)}`,
          winRate: `${winRate}%`,
          maxDrawdown: `${maxDrawdown.toFixed(2)}%`,
          tradeHistory: tradeHistory,
          markToMarketData: markToMarketData,
          availableSymbols: availableSymbols,
          initialBalance: customInitialBalance,
          chartData: []
        };
        
        // Agregar el CSV unificado para descarga
        (backtestData as any).unifiedCSV = convertedData.csvContent;
        
        resolve(backtestData);

      } catch (error) {
        reject(new Error(error instanceof Error ? error.message : 'Failed to parse CSV file'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read CSV file'));
    reader.readAsText(file);
  });
};

// Función auxiliar para convertir trades a formato para mark-to-market
const convertTradesForMarkToMarket = (trades: TradeHistoryItem[]): CompleteTrade[] => {
  const completeTrades: CompleteTrade[] = [];
  const openTrades = new Map<string, TradeHistoryItem>();
  
  for (const trade of trades) {
    if (trade.direction.toLowerCase() === 'in') {
      openTrades.set(trade.order, trade);
    } else if (trade.direction.toLowerCase() === 'out') {
      const openTrade = openTrades.get(trade.order);
      if (openTrade) {
        completeTrades.push({
          position: trade.order,
          symbol: trade.symbol,
          type: trade.type,
          volume: parseFloat(trade.volume),
          openTime: new Date(openTrade.time),
          closeTime: new Date(trade.time),
          openPrice: parseFloat(openTrade.price),
          closePrice: parseFloat(trade.price),
          commission: parseFloat(trade.commission.replace(/[^\d.-]/g, '') || '0'),
          swap: parseFloat(trade.swap.replace(/[^\d.-]/g, '') || '0'),
          profit: parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0'),
          stopLoss: '',
          takeProfit: ''
        });
        openTrades.delete(trade.order);
      }
    }
  }
  
  return completeTrades;
};