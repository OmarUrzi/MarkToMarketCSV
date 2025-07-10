/**
 * Utility functions for formatting numbers with thousand separators
 */

/**
 * Formats a number with thousand separators and currency symbol
 * @param value - The number to format (can be string or number)
 * @param currency - Currency symbol (default: '$')
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like $27,555.05
 */
export const formatCurrency = (
  value: string | number, 
  currency: string = '$', 
  decimals: number = 2
): string => {
  try {
    // Handle string values that might have currency symbols or spaces
    let numericValue: number;
    
    if (typeof value === 'string') {
      // Remove currency symbols, spaces, and other non-numeric characters except dots and minus
      const cleanValue = value.replace(/[^\d.-]/g, '');
      numericValue = parseFloat(cleanValue);
    } else {
      numericValue = value;
    }
    
    // Handle invalid numbers
    if (isNaN(numericValue)) {
      return `${currency}0.00`;
    }
    
    // Format with thousand separators and specified decimal places
    const formatted = numericValue.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    
    return `${currency}${formatted}`;
  } catch (error) {
    console.error('Error formatting currency:', error);
    return `${currency}0.00`;
  }
};

/**
 * Formats a number for display in mark-to-market tables
 * Handles both positive and negative values with proper formatting
 * @param value - The value to format
 * @returns Formatted currency string
 */
export const formatMarkToMarketValue = (value: string | number): string => {
  return formatCurrency(value, '$', 2);
};

/**
 * Formats a price value with higher precision (5 decimal places)
 * @param value - The price to format
 * @returns Formatted price string
 */
export const formatPrice = (value: string | number): string => {
  return formatCurrency(value, '$', 5);
};

/**
 * Formats a percentage value
 * @param value - The percentage value
 * @returns Formatted percentage string
 */
export const formatPercentage = (value: string | number): string => {
  try {
    let numericValue: number;
    
    if (typeof value === 'string') {
      const cleanValue = value.replace(/[^\d.-]/g, '');
      numericValue = parseFloat(cleanValue);
    } else {
      numericValue = value;
    }
    
    if (isNaN(numericValue)) {
      return '0.00%';
    }
    
    return `${numericValue.toFixed(2)}%`;
  } catch (error) {
    console.error('Error formatting percentage:', error);
    return '0.00%';
  }
};

/**
 * Formats a volume/position value
 * @param value - The volume to format
 * @returns Formatted volume string
 */
export const formatVolume = (value: string | number): string => {
  try {
    let numericValue: number;
    
    if (typeof value === 'string') {
      const cleanValue = value.replace(/[^\d.-]/g, '');
      numericValue = parseFloat(cleanValue);
    } else {
      numericValue = value;
    }
    
    if (isNaN(numericValue)) {
      return '0.00';
    }
    
    return numericValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } catch (error) {
    console.error('Error formatting volume:', error);
    return '0.00';
  }
};