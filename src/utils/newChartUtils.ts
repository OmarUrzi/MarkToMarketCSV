import { TradeHistoryItem, MarkToMarketItem } from '../types';
import { createChart, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts';

// Types for drawdown calculation modes
export type DrawdownMode = 'realized' | 'unrealized';

// Types for drill-down functionality
export interface DrillDownState {
  level: 'monthly' | 'detailed';
  selectedPeriod?: {
    year: number;
    month: number;
    label: string;
  };
}

// Calculate period returns (monthly/daily)
export const calculatePeriodReturns = (
  trades: TradeHistoryItem[],
  initialBalance: number,
  timeframe: 'monthly' | 'daily' = 'monthly'
) => {
  if (trades.length === 0) return [];

  // Sort trades by time