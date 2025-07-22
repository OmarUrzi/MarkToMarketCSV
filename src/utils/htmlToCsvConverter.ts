import { TradeHistoryItem } from '../types';

export interface ConvertedCSVData {
  csvContent: string;
  trades: TradeHistoryItem[];
  metadata: {
    symbol: string;
    expertName: string;
    initialBalance: number;
    totalNetProfit: string;
    totalTrades: number;
  };
}

/**
 * Convierte datos del HTML de MT4/MT5 al formato CSV unificado
 */
export const convertHtmlToCSV = (htmlContent: string, csvTimezone: number = 0, customInitialBalance?: number): ConvertedCSVData => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Extraer metadatos del HTML
  const symbol = extractSymbolFromHTML(doc) || 'XAUUSD';
  const expertName = extractExpertNameFromHTML(doc) || 'Unknown Expert';
  const initialBalance = customInitialBalance || extractInitialBalanceFromHTML(doc);
  const totalNetProfit = extractTotalNetProfitFromHTML(doc);

  // Encontrar la tabla de deals
  const dealsTable = findDealsTable(doc);
  if (!dealsTable) {
    throw new Error('Could not find Deals table in the HTML report');
  }

  const trades: TradeHistoryItem[] = [];
  const csvRows: string[] = [];
  
  // Header del CSV (igual formato que el CSV original)
  const csvHeader = 'Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit';
  csvRows.push(csvHeader);

  // Procesar filas de la tabla de deals y agrupar por pares open/close
  const rows = dealsTable.getElementsByTagName('tr');
  const openTrades: any[] = []; // Stack de trades abiertos
  const completedTrades: any[] = []; // Trades completos (open + close)

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName('td');
    
    if (cells.length >= 13) {
      const timeStr = cells[0].textContent?.trim() || '';
      
      // Saltar filas de balance, headers y filas vacías
      const type = cells[3].textContent?.trim() || '';
      if (!timeStr || timeStr === 'Time' || type === 'balance' || type === '') {
        continue;
      }

      try {
        const validTime = parseMTDateTime(timeStr);
        const deal = cells[1].textContent?.trim() || '';
        const symbolCell = cells[2].textContent?.trim() || '';
        const direction = cells[4].textContent?.trim() || '';
        const volume = cells[5].textContent?.trim() || '';
        const price = cells[6].textContent?.trim() || '';
        const order = cells[7].textContent?.trim() || '';
        const commission = cells[8].textContent?.trim() || '';
        const swap = cells[9].textContent?.trim() || '';
        const profit = cells[10].textContent?.trim() || '';
        const balance = cells[11].textContent?.trim() || '';
        const comment = cells[12].textContent?.trim() || '';

        const tradeData = {
          time: validTime,
          deal,
          symbol: symbolCell || symbol, // Usar symbol por defecto si está vacío
          type,
          direction,
          volume,
          price,
          order,
          commission,
          swap,
          profit,
          balance,
          comment
        };

        if (direction.toLowerCase() === 'in') {
          // Trade de entrada - agregar al stack
          openTrades.push(tradeData);
        } else if (direction.toLowerCase() === 'out') {
          // Trade de salida - buscar el trade de entrada correspondiente por volumen
          const matchingIndex = openTrades.findIndex(openTrade => 
            parseFloat(openTrade.volume) === parseFloat(volume) &&
            openTrade.symbol === (symbolCell || symbol) &&
            // Verificar que el tipo sea opuesto (buy cierra con sell, sell cierra con buy)
            ((openTrade.type.toLowerCase() === 'buy' && type.toLowerCase() === 'sell') ||
             (openTrade.type.toLowerCase() === 'sell' && type.toLowerCase() === 'buy'))
          );
          
          const openTrade = matchingIndex >= 0 ? openTrades[matchingIndex] : null;
          if (openTrade) {
            // Remover el trade abierto del stack
            openTrades.splice(matchingIndex, 1);
            
            // Crear fila CSV para trade completo
            const csvRow = [
              formatDateForCSV(openTrade.time), // Entry time
              openTrade.order, // Position
              openTrade.symbol, // Symbol
              openTrade.type, // Type
              openTrade.volume, // Volume
              openTrade.price, // Entry price
              '', // S/L (vacío por ahora)
              '', // T/P (vacío por ahora)
              formatDateForCSV(validTime), // Exit time
              price, // Exit price
              commission, // Commission
              swap, // Swap
              profit // Profit
            ].join(',');
            
            csvRows.push(csvRow);
            
            // Crear trades individuales para el array de trades
            const openTradeItem: TradeHistoryItem = {
              time: openTrade.time,
              deal: openTrade.deal,
              symbol: openTrade.symbol,
              type: openTrade.type,
              direction: 'in',
              volume: openTrade.volume,
              price: openTrade.price,
              order: openTrade.order,
              commission: '0.00',
              swap: '0.00',
              profit: '0.00',
              balance: openTrade.balance,
              comment: openTrade.comment,
              position: openTrade.order,
              closed: '$0.00',
              aep: '0',
              open: '$0.00',
              total: '$0.00'
            };
            
            const closeTradeItem: TradeHistoryItem = {
              time: validTime,
              deal,
              symbol: symbolCell || symbol,
              type,
              direction: 'out',
              volume,
              price,
              order,
              commission,
              swap,
              profit,
              balance,
              comment,
              position: order,
              closed: '$0.00',
              aep: '0',
              open: '$0.00',
              total: '$0.00'
            };
            
            trades.push(openTradeItem);
            trades.push(closeTradeItem);
          } else {
            console.warn(`No matching open trade found for close trade: Deal ${deal}, Volume ${volume}, Type ${type}`);
          }
        }
      } catch (error) {
        console.error(`Error processing HTML row ${i}:`, error);
        continue;
      }
    }
  }
  
  // Advertir sobre trades abiertos sin cerrar
  if (openTrades.length > 0) {
    console.warn(`Found ${openTrades.length} open trades without matching close trades`);
  }

  const csvContent = csvRows.join('\n');
  
  return {
    csvContent,
    trades,
    metadata: {
      symbol,
      expertName,
      initialBalance,
      totalNetProfit,
      totalTrades: Math.floor(trades.length / 2) // Dividir por 2 porque tenemos pares in/out
    }
  };
};

/**
 * Convierte datos CSV existentes al formato unificado
 */
export const convertCSVToUnified = (csvContent: string, csvTimezone: number = 0, customInitialBalance: number = 10000): ConvertedCSVData => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must contain at least a header row and one data row. Found ' + lines.length + ' lines.');
  }

  // Parse headers
  let headers: string[];
  const firstLine = lines[0];
  
  if (!firstLine || firstLine.trim() === '') {
    throw new Error('CSV file appears to be empty or has no valid header row.');
  }
  
  if (firstLine.includes('\t')) {
    headers = firstLine.split('\t').map(h => h.trim());
  } else {
    headers = firstLine.split(',').map(h => h.trim());
  }
  
  // Validate that we have some expected headers
  const requiredHeaders = ['Time', 'Symbol', 'Type', 'Volume', 'Price', 'Profit'];
  const hasRequiredHeaders = requiredHeaders.some(required => 
    headers.some(header => header.toLowerCase().includes(required.toLowerCase()))
  );
  
  if (!hasRequiredHeaders) {
    throw new Error('CSV file does not contain expected trading data headers. Please check the file format.');
  }

  const trades: TradeHistoryItem[] = [];
  let runningBalance = customInitialBalance;

  // Procesar cada fila del CSV
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    let values: string[];
    if (line.includes('\t')) {
      values = line.split('\t').map(v => v.trim());
    } else {
      values = line.split(',').map(v => v.trim());
    }

    if (values.length < headers.length) {
      while (values.length < headers.length) {
        values.push('');
      }
    }

    try {
      // Extraer valores usando índices de headers
      const timeCol1 = headers.indexOf('Time');
      const timeCol2 = headers.lastIndexOf('Time');
      const priceCol1 = headers.indexOf('Price');
      const priceCol2 = headers.lastIndexOf('Price');
      
      const openTime = values[timeCol1] || '';
      const closeTime = values[timeCol2] || openTime;
      const entryPrice = values[priceCol1] || '';
      const exitPrice = values[priceCol2] || entryPrice;
      
      const positionIndex = headers.indexOf('Position');
      const symbolIndex = headers.indexOf('Symbol');
      const typeIndex = headers.indexOf('Type');
      const volumeIndex = headers.indexOf('Volume');
      const commissionIndex = headers.indexOf('Commission');
      const swapIndex = headers.indexOf('Swap');
      const profitIndex = headers.indexOf('Profit');
      
      const position = positionIndex >= 0 ? values[positionIndex] || '' : '';
      const symbol = symbolIndex >= 0 ? values[symbolIndex] || '' : '';
      const type = typeIndex >= 0 ? values[typeIndex] || '' : '';
      const volume = volumeIndex >= 0 ? values[volumeIndex] || '' : '';
      const commission = commissionIndex >= 0 ? values[commissionIndex] || '0.00' : '0.00';
      const swap = swapIndex >= 0 ? values[swapIndex] || '0.00' : '0.00';
      let profit = profitIndex >= 0 ? values[profitIndex] || '0.00' : '0.00';
      
      // Limpiar profit
      profit = profit.replace(/\s+/g, '').replace(/[^\d.-]/g, '');
      if (!profit || profit === '' || profit === '-') {
        profit = '0.00';
      }

      const parsedProfit = parseFloat(profit) || 0;
      const parsedCommission = parseFloat(commission) || 0;
      const parsedSwap = parseFloat(swap) || 0;

      // Crear trade de entrada
      const openTrade: TradeHistoryItem = {
        time: parseCSVDateTime(openTime),
        deal: `${i}`,
        symbol: symbol,
        type: type.toLowerCase(),
        direction: 'in',
        volume: volume,
        price: entryPrice,
        order: position || `${i}`,
        commission: '0.00',
        swap: '0.00',
        profit: '0.00',
        balance: runningBalance.toFixed(2),
        comment: '',
        position: position,
        closed: '$0.00',
        aep: '0',
        open: '$0.00',
        total: '$0.00'
      };

      trades.push(openTrade);

      // Crear trade de salida
      runningBalance += parsedProfit + parsedCommission + parsedSwap;
      
      const closeTrade: TradeHistoryItem = {
        time: parseCSVDateTime(closeTime),
        deal: `${i}`,
        symbol: symbol,
        type: type.toLowerCase(),
        direction: 'out',
        volume: volume,
        price: exitPrice,
        order: position || `${i}`,
        commission: parsedCommission.toFixed(2),
        swap: parsedSwap.toFixed(2),
        profit: parsedProfit.toFixed(2),
        balance: runningBalance.toFixed(2),
        comment: '',
        position: position,
        closed: '$0.00',
        aep: '0',
        open: '$0.00',
        total: '$0.00'
      };

      trades.push(closeTrade);

    } catch (error) {
      console.error(`Error parsing CSV row ${i}:`, error);
      continue;
    }
  }

  // Extraer símbolos únicos
  const availableSymbols = [...new Set(trades.map(trade => trade.symbol))].sort();
  const mainSymbol = availableSymbols[0] || 'UNKNOWN';

  // Calcular estadísticas
  const completeTrades = trades.filter(t => t.direction === 'out');
  const totalProfit = completeTrades.reduce((sum, trade) => {
    return sum + parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
  }, 0);

  return {
    csvContent, // Retornar el CSV original
    trades,
    metadata: {
      symbol: mainSymbol,
      expertName: 'CSV Import',
      initialBalance: customInitialBalance,
      totalNetProfit: totalProfit.toFixed(2),
      totalTrades: completeTrades.length
    }
  };
};

/**
 * Genera CSV desde datos de trades unificados
 */
export const generateCSVFromTrades = (trades: TradeHistoryItem[], metadata: any): string => {
  const csvRows: string[] = [];
  
  // Header del CSV
  const csvHeader = 'Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit';
  csvRows.push(csvHeader);

  // Agrupar trades por posición para crear filas CSV completas
  const completedTrades = new Map<string, any>();
  
  for (const trade of trades) {
    if (trade.direction.toLowerCase() === 'in') {
      // Trade de entrada
      completedTrades.set(trade.order, {
        entryTime: trade.time,
        entryPrice: trade.price,
        position: trade.order,
        symbol: trade.symbol,
        type: trade.type,
        volume: trade.volume,
        comment: trade.comment
      });
    } else if (trade.direction.toLowerCase() === 'out') {
      // Trade de salida
      const openTrade = completedTrades.get(trade.order);
      if (openTrade) {
        const csvRow = [
          formatDateForCSV(openTrade.entryTime), // Entry time
          openTrade.position, // Position
          openTrade.symbol, // Symbol
          openTrade.type, // Type
          openTrade.volume, // Volume
          openTrade.entryPrice, // Entry price
          '', // S/L
          '', // T/P
          formatDateForCSV(trade.time), // Exit time
          trade.price, // Exit price
          trade.commission, // Commission
          trade.swap, // Swap
          trade.profit // Profit
        ].join(',');
        
        csvRows.push(csvRow);
        completedTrades.delete(trade.order);
      }
    }
  }

  return csvRows.join('\n');
};

// Funciones auxiliares
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

    // Crear ISO string directamente sin usar Date constructor para evitar timezone del navegador
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    const paddedHours = hours.padStart(2, '0');
    const paddedMinutes = minutes.padStart(2, '0');
    const paddedSeconds = seconds.padStart(2, '0');
    
    // IMPORTANTE: Preservar el tiempo exacto del HTML sin conversión
    const isoString = `${year}-${paddedMonth}-${paddedDay}T${paddedHours}:${paddedMinutes}:${paddedSeconds}.000Z`;
    
    return isoString;
  } catch (error) {
    console.error('HTML Date parsing error:', error);
    throw new Error(`Invalid time value: ${dateStr}`);
  }
};

const parseCSVDateTime = (dateStr: string): string => {
  try {
    if (!dateStr || dateStr.trim() === '' || dateStr.trim() === '-') {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    const [datePart, timePart] = dateStr.trim().split(' ');
    if (!datePart || !timePart) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    const [year, month, day] = datePart.split('.');
    const [hours, minutes, seconds] = timePart.split(':');

    if (!year || !month || !day || !hours || !minutes || !seconds) {
      throw new Error(`Missing date components: ${dateStr}`);
    }

    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    const paddedHours = hours.padStart(2, '0');
    const paddedMinutes = minutes.padStart(2, '0');
    const paddedSeconds = seconds.padStart(2, '0');
    
    const isoString = `${year}-${paddedMonth}-${paddedDay}T${paddedHours}:${paddedMinutes}:${paddedSeconds}.000Z`;
    return isoString;
  } catch (error) {
    console.error('CSV Date parsing error:', error);
    throw new Error(`Invalid time value: ${dateStr}`);
  }
};

const formatDateForCSV = (isoString: string): string => {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
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
  return 10000;
};

const extractTotalNetProfitFromHTML = (doc: Document): string => {
  const rows = doc.getElementsByTagName('tr');
  for (const row of rows) {
    const cells = row.getElementsByTagName('td');
    if (cells.length >= 2) {
      const firstCell = cells[0].textContent?.trim() || '';
      if (firstCell === 'Total Net Profit:') {
        const profitCell = cells[1].querySelector('b');
        if (profitCell && profitCell.textContent) {
          return profitCell.textContent.trim();
        }
      }
    }
  }
  return '0.00';
};

const findDealsTable = (doc: Document): HTMLTableElement | null => {
  const tables = Array.from(doc.getElementsByTagName('table'));
  
  for (const table of tables) {
    const caption = table.querySelector('caption')?.textContent?.toLowerCase() || '';
    if (caption.includes('deal') || caption.includes('order') || caption.includes('trade')) {
      return table;
    }

    // Buscar por headers de la tabla
    const headerRow = table.rows[0];
    if (headerRow) {
      const headerCells = Array.from(headerRow.getElementsByTagName('td')).map(td => 
        td.textContent?.trim().toLowerCase() || ''
      );

      const requiredHeaders = ['time', 'deal', 'type', 'volume', 'price'];
      const foundHeaders = requiredHeaders.filter(header => 
        headerCells.some(cell => cell.includes(header))
      );

      if (foundHeaders.length / requiredHeaders.length >= 0.8) {
        return table;
      }
    }

    // Buscar tabla que contenga datos de trades
    const dataRows = Array.from(table.rows).slice(1);
    const tradeDataCount = dataRows.filter(row => {
      const cells = Array.from(row.getElementsByTagName('td'));
      if (cells.length < 5) return false;

      const timeCell = cells[0].textContent?.trim() || '';
      const hasDateFormat = /^\d{4}\.\d{2}\.\d{2}/.test(timeCell);

      const hasNumericData = cells.some(cell => {
        const text = cell.textContent?.trim() || '';
        return /^-?\d+\.?\d*$/.test(text);
      });

      return hasDateFormat && hasNumericData;
    }).length;
    
    if (tradeDataCount > 0) {
      return table;
    }
  }

  return null;
};