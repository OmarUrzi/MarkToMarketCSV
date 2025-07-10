import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { MarkToMarketItem } from '../types';
import { MarkToMarketVisualizer } from './MarkToMarketVisualizer';
import { formatMarkToMarketValue, formatPrice, formatVolume } from '../utils/numberFormatter';

interface MarkToMarketAnalyticsProps {
  data: MarkToMarketItem[];
  selectedSymbol?: string;
  isLoadingSymbol?: boolean;
  csvTimezone?: number;
}

export const MarkToMarketAnalytics: React.FC<MarkToMarketAnalyticsProps> = ({ 
  data, 
  selectedSymbol,
  isLoadingSymbol = false,
  csvTimezone = 0
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeView, setActiveView] = useState<'table' | 'visualizer'>('table');
  const [frequency, setFrequency] = useState<'M15'>('M15');
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    setCurrentPage(1);
  };
  
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    setCurrentPage(1);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toISOString().replace('T', ' ').slice(0, 16);
  };
  
  const safeData = Array.isArray(data) ? data : [];
  
  const filteredData = safeData.filter(item => {
    if (!startDate && !endDate) return true;
    
    const itemDate = new Date(item.date);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date(8640000000000000);
    
    return itemDate >= start && itemDate <= end;
  });
  
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  return (
    <div className="mt-4 w-full">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-medium">Mark to Market Analytics</h3>
            {selectedSymbol && (
              <div className={`px-3 py-1 rounded-md text-sm font-medium ${
                isLoadingSymbol 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {isLoadingSymbol ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></div>
                    Loading {selectedSymbol}...
                  </div>
                ) : (
                  selectedSymbol
                )}
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveView('table')}
              disabled={isLoadingSymbol}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeView === 'table'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${isLoadingSymbol ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Table View
            </button>
            <button
              onClick={() => setActiveView('visualizer')}
              disabled={isLoadingSymbol}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                activeView === 'visualizer'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${isLoadingSymbol ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Visualizer
            </button>
          </div>
        </div>

        {isLoadingSymbol && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-blue-700">
                Updating mark-to-market data for {selectedSymbol}...
              </span>
            </div>
          </div>
        )}

        {activeView === 'table' ? (
          <>
            <div className="flex flex-wrap gap-4 mb-4">
             
            </div>
              
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Show:</span>
                {[10, 20, 50, 100].map(size => (
                  <button
                    key={size}
                    onClick={() => setItemsPerPage(size)}
                    disabled={isLoadingSymbol}
                    className={`px-2 py-1 text-sm rounded ${
                      itemsPerPage === size
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${isLoadingSymbol ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            
            <p className="text-sm text-gray-500 mt-4">
              Showing periods {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length}
            </p>

            <div className={`overflow-x-auto ${isLoadingSymbol ? 'opacity-50' : ''}`}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pos
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Closed
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AEP
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      EOPeriod Price
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ConvertFX
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Open
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Open Trades
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current Drawdown
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.map((item, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatVolume(item.position)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatMarkToMarketValue(item.closed)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatPrice(item.aep)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatPrice(item.eoPeriodPrice)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.currentFX}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatMarkToMarketValue(item.open)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatMarkToMarketValue(item.total)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.openTradesCount || '0'}
                      </td>
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
            
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4">
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1 || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === 1 || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    First
                  </button>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1 || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === 1 || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Previous
                  </button>
                </div>
                
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </div>
                
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === totalPages || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Next
                  </button>
                  <button 
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || isLoadingSymbol}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === totalPages || isLoadingSymbol
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <MarkToMarketVisualizer 
            data={data} 
            selectedSymbol={selectedSymbol}
            isLoadingSymbol={isLoadingSymbol}
            csvTimezone={csvTimezone}
          />
        )}
      </div>
    </div>
  );
};