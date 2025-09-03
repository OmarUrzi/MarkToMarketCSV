import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MarkToMarketItem, TradeHistoryItem } from '../types';
import { createChart, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts';
import { formatMarkToMarketValue, formatPrice, formatVolume } from '../utils/numberFormatter';

interface MarkToMarketVisualizerProps {
  data: MarkToMarketItem[];
  frequency?: 'M15';
  selectedSymbol?: string;
  isLoadingSymbol?: boolean;
  csvTimezone?: number;
}

export const MarkToMarketVisualizer: React.FC<MarkToMarketVisualizerProps> = ({ 
  data,
  frequency = 'M15',
  selectedSymbol,
  isLoadingSymbol = false,
  csvTimezone = 0
}) => {
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [weeks, setWeeks] = useState<WeekRange[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<MarkToMarketItem[]>([]);
  const chartContainerRef = React.useRef<HTMLDivElement>(null);

  // Extract symbol from the HTML table
  const getSymbol = (): string | null => {
    if (selectedSymbol) return selectedSymbol;
    
    const rows = document.getElementsByTagName('tr');
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
    return 'XAUUSD'; // Default fallback
  };

  const symbol = getSymbol();

  // Calculate position, closed, AEP, open, and total values
  const calculateMetrics = (currentData: any, previousData: any | null = null): MarkToMarketItem => {
    // Convert market data timestamp to GMT+3
    const marketDataTime = new Date(currentData.time);
    marketDataTime.setHours(marketDataTime.getHours() + 3); // Add 3 hours for GMT+3
    const marketDataTimeStr = marketDataTime.toISOString().slice(0, 16).replace('T', ' ');

    // Find the closest matching trade data entry
    const matchingData = data.reduce((closest, item) => {
      const tradeTime = new Date(item.date);
      const marketTime = new Date(marketDataTimeStr);
      
      if (!closest) return item;
      
      const closestDiff = Math.abs(new Date(closest.date).getTime() - marketTime.getTime());
      const currentDiff = Math.abs(tradeTime.getTime() - marketTime.getTime());
      
      return currentDiff < closestDiff ? item : closest;
    }, null as MarkToMarketItem | null);

    if (!matchingData) {
      return {
        date: marketDataTimeStr,
        position: '0',
        closed: '$0.00',
        aep: '$0.00',
        eoPeriodPrice: `$${currentData.close.toFixed(2)}`,
        currentFX: '1.00',
        open: '$0.00',
        total: '$0.00'
      };
    }

    return {
      date: marketDataTimeStr,
      position: matchingData.position,
      closed: matchingData.closed,
      aep: matchingData.aep,
      eoPeriodPrice: `$${currentData.close.toFixed(5)}`,
      currentFX: currentData.conversionFx ? currentData.conversionFx.toFixed(2) : '1.00',
      open: matchingData.open,
      total: matchingData.total
    };
  };

  useEffect(() => {
    if (data.length > 0) {
      // Dates are already in CSV timezone, create week ranges
      const sortedDates = data
        .map(item => {
          const date = new Date(item.date);
          // Dates are already in CSV timezone
          return date;
        })
        .sort((a, b) => a.getTime() - b.getTime());

      const startDate = sortedDates[0];
      const endDate = sortedDates[sortedDates.length - 1];
      const weekRanges: WeekRange[] = [];

      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const weekStart = new Date(currentDate);
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6);

        if (weekEnd > endDate) {
          weekEnd.setTime(endDate.getTime());
        }

        weekRanges.push({
          start: weekStart.toISOString().split('T')[0],
          end: weekEnd.toISOString().split('T')[0],
          label: `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`
        });

        currentDate.setDate(currentDate.getDate() + 7);
      }

      setWeeks(weekRanges);
      if (weekRanges.length > 0) {
        setSelectedWeek(weekRanges[0].start);
      }
    }
  }, [data]);

  const renderChart = (container: HTMLDivElement, data: MarkToMarketItem[]) => {
    if (!data.length) return;

    // Clear previous chart
    container.innerHTML = '';

    // Create chart
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#333',
      },
      width: container.clientWidth,
      height: 300,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        horzLines: {
          color: '#f3f4f6',
        },
        vertLines: {
          color: '#f3f4f6',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });

    // Create the series
    const totalSeries = chart.addLineSeries({
      color: '#22c55e',
      lineWidth: 2,
      title: 'Total',
    });

    const openSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      title: 'Open',
    });

    const closedSeries = chart.addLineSeries({
      color: '#ef4444',
      lineWidth: 2,
      title: 'Closed',
    });

    // Prepare the data with GMT+3 timestamps
    const chartData = data.map(item => {
      const timestamp = new Date(item.date);
      timestamp.setHours(timestamp.getHours() + 3); // Add 3 hours for GMT+3
      
      return {
        time: timestamp.getTime() / 1000,
        total: parseFloat(item.total.replace(/[^-0-9.]/g, '')),
        open: parseFloat(item.open.replace(/[^-0-9.]/g, '')),
        closed: parseFloat(item.closed.replace(/[^-0-9.]/g, '')),
      };
    });

    // Set the data
    totalSeries.setData(chartData.map(d => ({ time: d.time, value: d.total })));
    openSeries.setData(chartData.map(d => ({ time: d.time, value: d.open })));
    closedSeries.setData(chartData.map(d => ({ time: d.time, value: d.closed })));

    // Fit the content
    chart.timeScale().fitContent();

    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== container) return;
      const newRect = entries[0].contentRect;
      chart.applyOptions({ width: newRect.width });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  };

  useEffect(() => {
    if (chartContainerRef.current && marketData.length > 0 && !isLoadingSymbol) {
      const cleanup = renderChart(chartContainerRef.current, marketData);
      return () => {
        if (cleanup) cleanup();
      };
    }
  }, [marketData, isLoadingSymbol]);

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedWeek || !weeks.length || !symbol || isLoadingSymbol) {
        console.log('Missing required data:', {
          selectedWeek,
          weeksLength: weeks.length,
          symbol,
          isLoadingSymbol
        });
        if (!isLoadingSymbol) {
          setError('Missing required data for market data request');
        }
        return;
      }

      const selectedRange = weeks.find(week => week.start === selectedWeek);
      if (!selectedRange) {
        console.error('Invalid date range selected:', selectedWeek);
        setError('Invalid date range selected');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log('=== VISUALIZER API CALL START ===');
        console.log('Visualizer API request:', {
          symbol,
          fromDate: selectedRange.start,
          toDate: toDate.toISOString().split('T')[0],
          timeframe: frequency,
          selectedWeek,
          csvTimezone
        });

        const apiUrl = 'https://test.neuix.host/api/market-data/get';
        
        // Add one day to the end date to ensure we get the full period
        const toDate = new Date(selectedRange.end);
        toDate.setDate(toDate.getDate());
        
        const params = {
          from_date: selectedRange.start,
          to_date: toDate.toISOString().split('T')[0],
          timeframe: frequency,
          symbols: symbol
        };

        console.log('Visualizer API URL:', apiUrl);
        console.log('Visualizer API params:', params);
        console.log('Visualizer API call timestamp:', new Date().toISOString());

        const response = await axios.get(apiUrl, {
          params,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        console.log('Visualizer API Response:', {
          status: response.status,
          statusText: response.statusText,
          dataType: typeof response.data,
          dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
          timestamp: new Date().toISOString()
        });

        if (!response.data) {
          console.error('Visualizer: No data in API response');
          throw new Error('No data received from API');
        }

        let parsedData: any[] = [];
        
        if (typeof response.data === 'string') {
          console.log('Visualizer: Parsing NDJSON response');
          parsedData = parseNDJSON(response.data);
        } else if (response.data.data && typeof response.data.data === 'string') {
          console.log('Visualizer: Parsing nested NDJSON response');
          parsedData = parseNDJSON(response.data.data);
        } else if (Array.isArray(response.data)) {
          console.log('Visualizer: Using array response directly');
          parsedData = response.data;
        } else {
          console.error('Visualizer: Unexpected response format:', typeof response.data);
          throw new Error('Unexpected response format');
        }

        console.log(`Visualizer: Parsed ${parsedData.length} data points`);
        if (parsedData.length > 0) {
          console.log('Visualizer: First parsed point:', parsedData[0]);
          console.log('Visualizer: Last parsed point:', parsedData[parsedData.length - 1]);
        }

        // Process API data to match CSV timezone and filter from first trade time
        if (data.length > 0) {
          const firstTradeTime = new Date(data[0].date);
          console.log(`Visualizer: First trade time: ${firstTradeTime.toISOString()}`);
          
          // Adjust API timestamps to match CSV timezone
          parsedData = parsedData
            .map(item => ({
              ...item,
              time: new Date(new Date(item.time).getTime() + csvTimezone * 60 * 60 * 1000).toISOString()
            }))
            .filter(item => {
              const itemTime = new Date(item.time);
              return itemTime >= firstTradeTime;
            });
            
          console.log(`Visualizer: Filtered API data points: ${parsedData.length}`);
          if (parsedData.length > 0) {
            console.log(`Visualizer: First API data point after adjustment: ${parsedData[0].time}`);
          }
        }
        
        // Process the parsed data with metrics calculation
        const processedData = parsedData.map((item, index) => 
          calculateMetrics(item, index > 0 ? parsedData[index - 1] : null)
        );

        console.log(`Visualizer: Processed ${processedData.length} market data items`);
        setMarketData(processedData);
        setChartData(parsedData);
        console.log('=== VISUALIZER API CALL END ===');
      } catch (err: any) {
        console.error('=== VISUALIZER API CALL FAILED ===');
        console.error('Visualizer API Error:', {
          error: err,
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
          config: err.config,
          timestamp: new Date().toISOString()
        });
        console.error('=== END VISUALIZER API CALL ERROR ===');
        
        const errorMessage = err.response?.data?.error?.message || 
                           err.response?.data?.error || 
                           err.response?.data?.details || 
                           err.message;
        setError(`Failed to fetch market data: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedWeek, frequency, weeks, symbol, data, isLoadingSymbol, csvTimezone]);

  const parseNDJSON = (responseData: string): any[] => {
    try {
      const jsonLines = responseData.split('\n').filter(line => line.trim() !== '');
      return jsonLines.map(line => JSON.parse(line));
    } catch (error) {
      console.error('Error parsing NDJSON data:', error);
      return [];
    }
  };

  if (isLoadingSymbol) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center h-[400px] bg-blue-50 rounded-lg p-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
            <div className="text-blue-700 font-medium">
              Loading visualizer for {selectedSymbol}...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            disabled={weeks.length === 0 || loading}
          >
            {weeks.length === 0 ? (
              <option value="">No date ranges available</option>
            ) : (
              weeks.map((week) => (
                <option key={week.start} value={week.start}>
                  {week.label}
                </option>
              ))
            )}
          </select>
          {selectedSymbol && (
            <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium">
              {selectedSymbol}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
            <div className="text-gray-500">Loading data...</div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[400px] bg-red-50 rounded-lg p-4">
          <div className="text-red-600">{error}</div>
        </div>
      )}

      {!loading && !error && marketData.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h3 className="text-lg font-medium mb-4">
              Mark to Market Chart
              {selectedSymbol && (
                <span className="ml-2 text-sm text-blue-600 font-medium">
                  ({selectedSymbol})
                </span>
              )}
            </h3>
            <div ref={chartContainerRef} className="h-[300px]" />
          </div>

          <div className="overflow-x-auto">
            <div className="text-sm text-gray-500 mb-2">
              Showing periods 1-{marketData.length} of {marketData.length}
              {selectedSymbol && (
                <span className="ml-2 text-blue-600 font-medium">
                  for {selectedSymbol}
                </span>
              )}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DATE</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LOTS</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CLOSED</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AEP</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">EOPERIOD PRICE</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CONVERTFX</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OPEN</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">TOTAL</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OPEN TRADES</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DRAWDOWN</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {marketData.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatVolume(item.position)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMarkToMarketValue(item.closed)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatPrice(item.aep)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatPrice(item.eoPeriodPrice)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.currentFX}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMarkToMarketValue(item.open)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMarkToMarketValue(item.total)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.openTradesCount || '0'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`${parseFloat(item.currentDrawdown || '0') > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.currentDrawdown || '0.00%'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};