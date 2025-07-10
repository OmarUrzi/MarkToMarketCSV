import React, { useState } from 'react';
import { Download, ChevronDown, ChevronUp } from 'lucide-react';
import { TradeHistoryItem } from '../types';
import { formatCurrency } from '../utils/numberFormatter';

interface TradeHistoryProps {
  data: TradeHistoryItem[];
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({ data }) => {
  const [sortField, setSortField] = useState<keyof TradeHistoryItem>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  const handleSort = (field: keyof TradeHistoryItem) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  };
  
  const filteredData = data.filter(trade => parseFloat(trade.price) > 0);
  
  const sortedData = [...filteredData].sort((a, b) => {
    if (a[sortField] < b[sortField]) return sortDirection === 'asc' ? -1 : 1;
    if (a[sortField] > b[sortField]) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = sortedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  const handleExportCSV = () => {
    const headers = ['Time', 'Deal', 'Symbol', 'Type', 'Direction', 'Volume', 'Price', 'Order', 'Commission', 'Swap', 'Profit', 'Balance', 'Comment'];
    const csvContent = [
      headers.join(','),
      ...sortedData.map(item => [
        item.time,
        item.deal,
        item.symbol,
        item.type,
        item.direction,
        item.volume,
        item.price,
        item.order,
        item.commission,
        item.swap,
        item.profit,
        item.balance,
        item.comment
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trade_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format number with dollar sign
  const formatDollar = (value: string) => {
    return formatCurrency(value);
  };
  
  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-medium">Trade History</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Show:</span>
            {[10, 20, 50, 100].map(size => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`px-2 py-1 text-sm rounded ${
                  itemsPerPage === size
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <button 
          className="flex items-center text-sm text-blue-600 hover:text-blue-800"
          onClick={handleExportCSV}
        >
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              {[
                { key: 'time', label: 'Time' },
                { key: 'deal', label: 'Deal' },
                { key: 'symbol', label: 'Symbol' },
                { key: 'type', label: 'Type' },
                { key: 'direction', label: 'Direction' },
                { key: 'volume', label: 'Volume' },
                { key: 'price', label: 'Price' },
                { key: 'order', label: 'Order' },
                { key: 'commission', label: 'Commission' },
                { key: 'swap', label: 'Swap' },
                { key: 'profit', label: 'Profit' },
                { key: 'balance', label: 'Balance' },
                { key: 'comment', label: 'Comment' }
              ].map(({ key, label }) => (
                <th 
                  key={key}
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort(key as keyof TradeHistoryItem)}
                >
                  <div className="flex items-center">
                    {label}
                    {sortField === key && (
                      sortDirection === 'asc' ? 
                        <ChevronUp className="h-4 w-4 ml-1" /> : 
                        <ChevronDown className="h-4 w-4 ml-1" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.map((trade, index) => {
              const profit = parseFloat(trade.profit);
              const isProfit = profit > 0;
              
              return (
                <tr key={`${trade.deal}-${index}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="relative group">
                      <div 
                        className={`w-3 h-3 rounded-full ${isProfit ? 'bg-green-500' : 'bg-red-500'}`}
                        title={`Profit: ${formatDollar(trade.profit)}`}
                      />
                      <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-1 px-2 -mt-1 left-6">
                        Profit: {formatDollar(trade.profit)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.time}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.deal}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.symbol}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-red-600 font-medium">{trade.direction}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.volume}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDollar(trade.price)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.order}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDollar(trade.commission)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.swap}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatDollar(trade.profit)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDollar(trade.balance)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className={`px-3 py-1 rounded text-sm ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            Previous
          </button>
          
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </div>
          
          <button 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className={`px-3 py-1 rounded text-sm ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};