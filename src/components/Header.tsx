import React from 'react';
import { LineChart } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-gray-900 text-white py-4 px-6 -mx-4 sm:-mx-6 lg:-mx-8 mb-6">
      <div className="flex items-center">
        <LineChart className="h-6 w-6 text-cyan-400 mr-2" />
        <h1 className="text-xl font-bold">TradeAnalytics</h1>
      </div>
    </header>
  );
};