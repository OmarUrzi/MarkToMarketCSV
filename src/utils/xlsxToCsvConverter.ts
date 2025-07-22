import * as XLSX from 'xlsx';
import { TradeHistoryItem } from '../types';

export interface ConvertedXLSXData {
  csvContent: string;
  trades: TradeHistoryItem[];
  metadata: {
    symbol: string;
    expertName: string;
    initialBalance: number;
    totalNetProfit: string;
    totalTrades: number;
    accountName?: string;
    accountNumber?: string;
    company?: string;
  };
}

/**
 * Convierte archivo XLSX al formato CSV unificado
 */
export const convertXlsxToCSV = (file: File, csvTimezone: number = 0, customInitialBalance: number = 10000): Promise<ConvertedXLSXData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        if (!event.target?.result) {
          throw new Error('Failed to read XLSX file content');
        }

        const data = new Uint8Array(event.target.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Obtener la primera hoja
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convertir a JSON para procesar
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
        
        console.log('XLSX data loaded:', jsonData.length, 'rows');
        
        // Extraer metadatos del header
        const metadata = extractMetadataFromXLSX(jsonData);
        console.log('Extracted metadata:', metadata);
        
        // Encontrar la sección "Positions"
        const positionsStartIndex = findPositionsSection(jsonData);
        if (positionsStartIndex === -1) {
          throw new Error('Could not find "Positions" section in XLSX file');
        }
        
        console.log('Positions section found at row:', positionsStartIndex);
        
        // Procesar las posiciones
        const { csvContent, trades } = processPositionsData(
          jsonData, 
          positionsStartIndex, 
          metadata.symbol,
          customInitialBalance
        );
        
        console.log('Processed trades:', trades.length);
        
        // Calcular profit total
        const completeTrades = trades.filter(t => t.direction === 'out');
        const totalProfit = completeTrades.reduce((sum, trade) => {
          return sum + parseFloat(trade.profit.replace(/[^\d.-]/g, '') || '0');
        }, 0);
        
        const result: ConvertedXLSXData = {
          csvContent,
          trades,
          metadata: {
            ...metadata,
            initialBalance: customInitialBalance,
            totalNetProfit: totalProfit.toFixed(2),
            totalTrades: completeTrades.length
          }
        };
        
        resolve(result);
        
      } catch (error) {
        console.error('Error processing XLSX file:', error);
        reject(new Error(error instanceof Error ? error.message : 'Failed to process XLSX file'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read XLSX file'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Extrae metadatos del header del XLSX
 */
const extractMetadataFromXLSX = (data: any[][]): any => {
  const metadata = {
    symbol: 'UNKNOWN',
    expertName: 'XLSX Import',
    accountName: '',
    accountNumber: '',
    company: ''
  };
  
  // Buscar información en las primeras filas
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const firstCell = String(row[0] || '').toLowerCase();
    
    if (firstCell.includes('name:') && row[1]) {
      metadata.accountName = String(row[1]).trim();
    } else if (firstCell.includes('account:') && row[1]) {
      metadata.accountNumber = String(row[1]).trim();
    } else if (firstCell.includes('company:') && row[1]) {
      metadata.company = String(row[1]).trim();
    }
  }
  
  return metadata;
};

/**
 * Encuentra la sección "Positions" en los datos
 */
const findPositionsSection = (data: any[][]): number => {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const firstCell = String(row[0] || '').toLowerCase().trim();
    if (firstCell === 'positions') {
      return i;
    }
  }
  return -1;
};

/**
 * Procesa los datos de la sección Positions
 */
const processPositionsData = (
  data: any[][], 
  startIndex: number, 
  defaultSymbol: string,
  initialBalance: number
): { csvContent: string, trades: TradeHistoryItem[] } => {
  
  // Buscar la fila de headers después de "Positions"
  let headerIndex = -1;
  for (let i = startIndex + 1; i < Math.min(startIndex + 5, data.length); i++) {
    const row = data[i];
    if (row && row.length > 0) {
      const firstCell = String(row[0] || '').toLowerCase();
      if (firstCell.includes('time') || firstCell.includes('position')) {
        headerIndex = i;
        break;
      }
    }
  }
  
  if (headerIndex === -1) {
    throw new Error('Could not find headers in Positions section');
  }
  
  console.log('Headers found at row:', headerIndex);
  console.log('Headers:', data[headerIndex]);
  
  // Procesar filas de datos
  const trades: TradeHistoryItem[] = [];
  const csvRows: string[] = [];
  
  // Header del CSV
  const csvHeader = 'Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit';
  csvRows.push(csvHeader);
  
  let runningBalance = initialBalance;
  
  // Procesar cada fila de posición
  for (let i = headerIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 10) {
      // Si encontramos una fila vacía o con pocos datos, podría ser el final de la sección
      if (row && row.length > 0 && String(row[0]).toLowerCase().includes('orders')) {
        break; // Llegamos a la sección Orders
      }
      continue;
    }
    
    try {
      // Mapear columnas según el formato esperado
      const openTime = String(row[0] || '').trim();
      const position = String(row[1] || '').trim();
      const symbol = String(row[2] || defaultSymbol).trim();
      const type = String(row[3] || '').trim();
      const volume = String(row[4] || '').trim();
      const openPrice = String(row[5] || '').trim();
      const stopLoss = String(row[6] || '').trim();
      const takeProfit = String(row[7] || '').trim();
      const closeTime = String(row[8] || '').trim();
      const closePrice = String(row[9] || '').trim();
      const commission = String(row[10] || '0.00').trim();
      const swap = String(row[11] || '0.00').trim();
      const profit = String(row[12] || '0.00').trim();
      
      // Validar datos esenciales
      if (!openTime || !position || !type || !volume || !openPrice || !closeTime || !closePrice) {
        console.warn(`Skipping row ${i}: Missing essential data`);
        continue;
      }
      
      // Limpiar y validar profit
      let cleanProfit = profit.replace(/[^\d.-]/g, '');
      if (!cleanProfit || cleanProfit === '' || cleanProfit === '-') {
        cleanProfit = '0.00';
      }
      
      const parsedProfit = parseFloat(cleanProfit) || 0;
      const parsedCommission = parseFloat(commission.replace(/[^\d.-]/g, '') || '0');
      const parsedSwap = parseFloat(swap.replace(/[^\d.-]/g, '') || '0');
      
      // Crear fila CSV
      const csvRow = [
        formatDateForCSVDirect(openTime),
        position,
        symbol,
        type.toLowerCase(),
        volume,
        cleanNumericValue(openPrice),
        stopLoss,
        takeProfit,
        formatDateForCSVDirect(closeTime),
        cleanNumericValue(closePrice),
        parsedCommission.toFixed(2),
        parsedSwap.toFixed(2),
        parsedProfit.toFixed(2)
      ].join(',');
      
      csvRows.push(csvRow);
      
      // Crear trades individuales para el array
      const openTrade: TradeHistoryItem = {
        time: parseXLSXDateTime(openTime),
        deal: position,
        symbol: symbol,
        type: type.toLowerCase(),
        direction: 'in',
        volume: volume,
        price: cleanNumericValue(openPrice),
        order: position,
        commission: '0.00',
        swap: '0.00',
        profit: '0.00',
        balance: runningBalance.toFixed(2),
        comment: `SL: ${stopLoss}, TP: ${takeProfit}`,
        position: position,
        closed: '$0.00',
        aep: '0',
        open: '$0.00',
        total: '$0.00'
      };
      
      trades.push(openTrade);
      
      // Actualizar balance
      runningBalance += parsedProfit + parsedCommission + parsedSwap;
      
      const closeTrade: TradeHistoryItem = {
        time: parseXLSXDateTime(closeTime),
        deal: position,
        symbol: symbol,
        type: type.toLowerCase(),
        direction: 'out',
        volume: volume,
        price: cleanNumericValue(closePrice),
        order: position,
        commission: parsedCommission.toFixed(2),
        swap: parsedSwap.toFixed(2),
        profit: parsedProfit.toFixed(2),
        balance: runningBalance.toFixed(2),
        comment: `SL: ${stopLoss}, TP: ${takeProfit}`,
        position: position,
        closed: '$0.00',
        aep: '0',
        open: '$0.00',
        total: '$0.00'
      };
      
      trades.push(closeTrade);
      
    } catch (error) {
      console.error(`Error processing XLSX row ${i}:`, error);
      continue;
    }
  }
  
  const csvContent = csvRows.join('\n');
  
  return { csvContent, trades };
};

/**
 * Parsea fecha/hora del XLSX
 */
const parseXLSXDateTime = (dateStr: string): string => {
  try {
    if (!dateStr || dateStr.trim() === '') {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    
    // Formato esperado: 2025.06.16 15:00:00 - preservar tiempo exacto
    const [datePart, timePart] = dateStr.trim().split(' ');
    if (!datePart || !timePart) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    
    const [year, month, day] = datePart.split('.');
    const [hours, minutes, seconds = '00'] = timePart.split(':');
    
    if (!year || !month || !day || !hours || !minutes) {
      throw new Error(`Missing date components: ${dateStr}`);
    }
    
    // Crear fecha preservando el tiempo exacto del XLSX sin conversión de timezone
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    const paddedHours = hours.padStart(2, '0');
    const paddedMinutes = minutes.padStart(2, '0');
    const paddedSeconds = seconds.padStart(2, '0');
    
    // Crear ISO string directamente para evitar conversión de timezone del navegador
    const isoString = `${year}-${paddedMonth}-${paddedDay}T${paddedHours}:${paddedMinutes}:${paddedSeconds}.000Z`;
    
    console.log(`XLSX time ${dateStr} -> ${isoString}`);
    return isoString;
  } catch (error) {
    console.error('XLSX Date parsing error:', error);
    throw new Error(`Invalid time value: ${dateStr}`);
  }
};

/**
 * Formatea fecha para CSV manteniendo el tiempo original
 */
const formatDateForCSV = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.error('Error formatting date for CSV:', error);
    // Fallback: extraer directamente del ISO string
    const match = isoString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match;
      return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
    }
    return isoString; // Último recurso
  }
};

/**
 * Formatea fecha para CSV desde string original
 */
const formatDateForCSVDirect = (dateStr: string): string => {
  try {
    // Formato esperado: 2025.06.16 15:00:00
    const [datePart, timePart] = dateStr.trim().split(' ');
    if (!datePart || !timePart) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    
    const [year, month, day] = datePart.split('.');
    const [hours, minutes, seconds = '00'] = timePart.split(':');
    
    if (!year || !month || !day || !hours || !minutes) {
      throw new Error(`Missing date components: ${dateStr}`);
    }
    
    // Formatear directamente sin conversión
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    const paddedHours = hours.padStart(2, '0');
    const paddedMinutes = minutes.padStart(2, '0');
    const paddedSeconds = seconds.padStart(2, '0');
    
    return `${year}.${paddedMonth}.${paddedDay} ${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  } catch (error) {
    console.error('Error formatting date for CSV direct:', error);
    return dateStr; // Fallback to original
  }
};

/**
 * Limpia valores numéricos
 */
const cleanNumericValue = (value: string): string => {
  if (!value) return '0.00';
  
  // Remover espacios y caracteres no numéricos excepto punto y signo menos
  const cleaned = value.toString().replace(/[^\d.-]/g, '');
  
  if (!cleaned || cleaned === '' || cleaned === '-') {
    return '0.00';
  }
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? '0.00' : parsed.toFixed(5);
};