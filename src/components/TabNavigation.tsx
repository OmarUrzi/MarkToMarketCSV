import React from 'react';

interface TabNavigationProps {
  activeTab: 'mt4' | 'mt5';
  onTabChange: (tab: 'mt4' | 'mt5') => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const handleMT4Click = () => {
    window.location.href = 'https://super-gaufre-f54160.netlify.app/';
  };

  return (
    <div className="mb-6 flex space-x-4">
      <button
        className={`
          px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
          ${activeTab === 'mt4' 
            ? 'bg-blue-100 text-blue-800' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
        `}
        onClick={handleMT4Click}
      >
        Backtest Mark to Market Analysis - MT4
      </button>
      <button
        className={`
          px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
          ${activeTab === 'mt5' 
            ? 'bg-blue-100 text-blue-800' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
        `}
        onClick={() => onTabChange('mt5')}
      >
        Backtest Mark to Market Analysis - MT5
      </button>
    </div>
  );
};