/**
 * Utility functions for timezone handling
 * The selected timezone is used to calculate the offset between CSV data and API data
 * All display times remain in CSV timezone
 */

import { TradeHistoryItem, MarkToMarketItem } from '../types';

/**
 * Calculates the API time offset needed to match CSV data
 * @param csvTimezoneOffset - The timezone offset of the CSV data (e.g., 3 for GMT+3)
 * @returns The offset in hours to apply to API data
 */
export const calculateApiOffset = (csvTimezoneOffset: number): number => {
  // API data comes in UTC (GMT+0)
  // We need to add the CSV timezone offset to API data to match CSV times
  return csvTimezoneOffset;
};

/**
 * Adjusts API market data timestamps to match CSV timezone
 * @param marketData - Array of market data points from API (in UTC)
 * @param csvTimezoneOffset - The timezone offset of the CSV data
 * @returns Market data with timestamps adjusted to match CSV timezone
 */
export const adjustApiDataToMatchCsv = (
  marketData: any[], 
  csvTimezoneOffset: number
): any[] => {
  const offsetHours = calculateApiOffset(csvTimezoneOffset);
  
  return marketData.map(point => ({
    ...point,
    time: new Date(new Date(point.time).getTime() + (offsetHours * 60 * 60 * 1000)).toISOString()
  }));
};

/**
 * Formats a date for display (always shows CSV timezone)
 * @param dateTimeStr - ISO string to format
 * @param csvTimezoneOffset - The CSV timezone offset for display label
 * @returns Formatted date string with timezone label
 */
export const formatDateWithTimezone = (
  dateTimeStr: string, 
  csvTimezoneOffset: number
): string => {
  try {
    const date = new Date(dateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    const timezoneStr = csvTimezoneOffset >= 0 ? `+${csvTimezoneOffset}` : `${csvTimezoneOffset}`;
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (GMT${timezoneStr})`;
  } catch (error) {
    console.error('Error formatting date with timezone:', error);
    return dateTimeStr;
  }
};

/**
 * Gets the timezone label for display
 * @param timezoneOffset - Timezone offset in hours
 * @returns Formatted timezone label
 */
export const getTimezoneLabel = (timezoneOffset: number): string => {
  if (timezoneOffset === 0) return 'GMT+0 (UTC)';
  const sign = timezoneOffset > 0 ? '+' : '';
  return `GMT${sign}${timezoneOffset}`;
};

/**
 * Calculates what time to request from API based on CSV time and timezone
 * @param csvDateTime - DateTime from CSV
 * @param csvTimezoneOffset - The timezone offset of the CSV data
 * @returns The UTC time to request from API
 */
export const csvTimeToApiTime = (csvDateTime: string, csvTimezoneOffset: number): string => {
  const csvDate = new Date(csvDateTime);
  // Subtract the CSV timezone offset to get UTC time for API request
  const apiTime = new Date(csvDate.getTime() - (csvTimezoneOffset * 60 * 60 * 1000));
  return apiTime.toISOString();
};

/**
 * Converts API response time back to CSV timezone for display
 * @param apiDateTime - DateTime from API response (UTC)
 * @param csvTimezoneOffset - The timezone offset of the CSV data
 * @returns Time adjusted to match CSV timezone
 */
export const apiTimeToCsvTime = (apiDateTime: string, csvTimezoneOffset: number): string => {
  const apiDate = new Date(apiDateTime);
  // Add the CSV timezone offset to API time to match CSV display
  const csvTime = new Date(apiDate.getTime() + (csvTimezoneOffset * 60 * 60 * 1000));
  return csvTime.toISOString();
};