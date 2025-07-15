export interface TradeHistoryItem {
  time: string;
  deal: string;
  symbol: string;
  type: string;
  direction: string;
  volume: string;
  price: string;
  order: string;
  commission: string;
  swap: string;
  profit: string;
  balance: string;
  comment: string;
  position: string;
  closed: string;
  aep: string;
  open: string;
  total: string;
}

export interface OpenTrade {
  entryTime: string;
  symbol: string;
  type: string;
  volume: number;
  entryPrice: number;
  currentPrice: number;
  profit: number;
  deal: string;
}

export interface MarkToMarketItem {
  date: string;
  position: string;
  closed: string;
  aep: string;
  eoPeriodPrice: string;
  currentFX: string;
  open: string;
  total: string;
  trades?: OpenTrade[];
  openTradesCount?: string;
  currentDrawdown?: string;
}

export interface ChartDataPoint {
  date: string;
  backtestValue: number;
  markToMarketValue: number;
}

export interface BacktestData {
  currencyPair: string;
  expertName: string;
  totalProfit: string;
  winRate: string;
  totalTrades: string;
  maxDrawdown: string;
  initialBalance: number;
  chartData: ChartDataPoint[];
  tradeHistory: TradeHistoryItem[];
  markToMarketData: MarkToMarketItem[];
  availableSymbols: string[];
}

export interface WeekRange {
  start: string;
  end: string;
  label: string;
}