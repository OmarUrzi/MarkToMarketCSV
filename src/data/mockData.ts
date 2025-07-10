import { BacktestData } from '../types';

// Generate dates for the past year
const generateDates = (count: number): string[] => {
  const dates: string[] = [];
  const now = new Date();
  
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
};

// Generate mock chart data
const generateChartData = (dates: string[]) => {
  const chartData = dates.map((date, index) => {
    // Generate a baseline value that increases over time (blue line)
    const baseValue = 100 + (index * 0.05);
    
    // Generate a more volatile line for mark to market (red line)
    let markToMarketValue = baseValue;
    
    // Add some volatility
    if (index > 10 && index < 30) {
      markToMarketValue += 0.5 + Math.random() * 1.5;
    } else if (index > 50 && index < 70) {
      markToMarketValue -= 0.3 + Math.random() * 0.7;
    }
    
    return {
      date,
      backtestValue: baseValue,
      markToMarketValue,
    };
  });
  
  return chartData;
};

// Generate mock trade history
const generateTradeHistory = () => {
  const types = ['buy', 'sell'];
  const symbols = ['XAUUSD', 'EURUSD', 'GBPUSD'];
  const trades = [];
  
  for (let i = 0; i < 50; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
    
    const type = types[Math.floor(Math.random() * types.length)];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const price = (2000 + Math.random() * 200).toFixed(2);
    const takeProfit = (parseFloat(price) + (type === 'buy' ? 5 : -5)).toFixed(2);
    const pl = ((Math.random() * 20) * (Math.random() > 0.1 ? 1 : -1)).toFixed(2);
    const balance = (10000 + (i * 20) + (Math.random() * 100)).toFixed(2);
    
    trades.push({
      time,
      deal: (1000 + i).toString(),
      symbol,
      type,
      direction: Math.random() > 0.5 ? 'in' : 'out',
      volume: '0.1',
      price,
      order: (2000 + i).toString(),
      commission: '0.00',
      swap: '0.00',
      profit: pl,
      balance,
      comment: '',
      position: '0',
      closed: '$0.00',
      aep: '0',
      open: '$0.00',
      total: '$0.00'
    });
  }
  
  return trades;
};

// Generate mark to market data
const generateMarkToMarketData = () => {
  const data = [];
  
  for (let i = 0; i < 100; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Create 4 entries per day (every 6 hours)
    for (let hour = 0; hour < 24; hour += 6) {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00:00`;
      
      const position = '0';
      const closed = '$0.00';
      const aep = `$${(2000 + Math.random() * 50).toFixed(2)}`;
      const eoPeriodPrice = `$${(2000 + Math.random() * 50).toFixed(2)}`;
      const currentFX = `$${(110 + Math.random() * 0.5).toFixed(3)}`;
      const open = '$0.00';
      const total = `$${((Math.random() * 2) * (Math.random() > 0.3 ? 1 : -1)).toFixed(2)}`;
      
      data.push({
        date: dateStr,
        position,
        closed,
        aep,
        eoPeriodPrice,
        currentFX,
        open,
        total,
      });
    }
  }
  
  return data;
};

// Create mock data
const dates = generateDates(100);
const chartData = generateChartData(dates);
const tradeHistory = generateTradeHistory();
const markToMarketData = generateMarkToMarketData();

export const mockBacktestData: BacktestData = {
  currencyPair: 'XAUUSD',
  expertName: 'The Infinity EA MT5',
  totalProfit: '$7536.87',
  winRate: '97.9%',
  totalTrades: '533',
  maxDrawdown: '1.44%',
  initialBalance: 10000,
  chartData,
  tradeHistory,
  markToMarketData,
  availableSymbols: ['XAUUSD', 'EURUSD', 'GBPUSD']
};