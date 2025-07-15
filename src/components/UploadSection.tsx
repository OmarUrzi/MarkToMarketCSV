import React, { useCallback, useState } from 'react';
import { Upload, Loader2, FileText, Table } from 'lucide-react';
import { TimezoneSelector } from './TimezoneSelector';

interface UploadSectionProps {
  onFileUpload: (file: File, timezone: number) => void;
  onLoadMockData: () => void;
  error: string | null;
  csvTimezone: number;
  onTimezoneChange: (timezone: number) => void;
  initialAmount: number;
  onInitialAmountChange: (amount: number) => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({ 
  onFileUpload, 
  onLoadMockData, 
  error, 
  csvTimezone, 
  onTimezoneChange,
  initialAmount,
  onInitialAmountChange
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadType, setUploadType] = useState<'html' | 'csv'>('csv');
  
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setIsLoading(true);
      try {
        await onFileUpload(e.dataTransfer.files[0], csvTimezone);
      } finally {
        setIsLoading(false);
      }
    }
  }, [onFileUpload]);
  
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsLoading(true);
      try {
        await onFileUpload(e.target.files[0], csvTimezone);
      } finally {
        setIsLoading(false);
      }
    }
  }, [onFileUpload]);

  const getAcceptedFileTypes = () => {
    return uploadType === 'html' ? '.html,.htm' : '.csv';
  };

  const getFileDescription = () => {
    return uploadType === 'html' 
      ? 'MT4/MT5 Backtest HTML Report'
      : 'CSV Backtest Data';
  };

  return (
    <div className="mt-8 p-8">
      {/* Timezone Selector */}
      <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-blue-900 mb-2">Configuration</h3>
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-md font-medium text-blue-900 mb-1">Data Timezone</h4>
              <p className="text-sm text-blue-700">
                Select the timezone of your CSV/HTML data for proper synchronization.
              </p>
            </div>
            <TimezoneSelector
              selectedTimezone={csvTimezone}
              onTimezoneChange={onTimezoneChange}
              disabled={isLoading}
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-md font-medium text-blue-900 mb-1">Initial Account Balance</h4>
                <p className="text-sm text-blue-700">
                  Set the starting balance for calculations and analysis.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-blue-700 font-medium">$</span>
                <input
                  type="number"
                  value={initialAmount}
                  onChange={(e) => onInitialAmountChange(Number(e.target.value))}
                  disabled={isLoading}
                  className={`
                    px-3 py-2 border border-blue-300 rounded-md text-sm bg-white min-w-[120px]
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${isLoading ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-text hover:border-blue-400'}
                  `}
                  min="0"
                  step="1000"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Upload Type Selection */}
      <div className="mb-6 flex justify-center">
        <div className="bg-gray-100 p-1 rounded-lg flex">
          <button
            onClick={() => setUploadType('html')}
            className={`
              flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
              ${uploadType === 'html' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-800'}
            `}
          >
            <FileText className="h-4 w-4 mr-2" />
            HTML Report
          </button>
          <button
            onClick={() => setUploadType('csv')}
            className={`
              flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
              ${uploadType === 'csv' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-800'}
            `}
          >
            <Table className="h-4 w-4 mr-2" />
            CSV Data
          </button>
        </div>
      </div>

      <div 
        className={`
          border-2 border-dashed rounded-lg p-12 text-center
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          transition-all duration-200 ease-in-out
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center">
          {isLoading ? (
            <Loader2 
              className="h-12 w-12 mb-4 text-blue-500 animate-spin" 
              strokeWidth={1.5}
            />
          ) : (
            <div className={`
              p-3 rounded-full mb-4
              ${uploadType === 'html' ? 'bg-blue-100' : 'bg-green-100'}
            `}>
              {uploadType === 'html' ? (
                <FileText className={`h-6 w-6 ${isDragging ? 'text-blue-600' : 'text-blue-500'}`} />
              ) : (
                <Table className={`h-6 w-6 ${isDragging ? 'text-green-600' : 'text-green-500'}`} />
              )}
            </div>
          )}
          
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Upload {getFileDescription()}
          </h3>
          
          <p className="text-sm text-gray-500 mb-4">
            {isLoading ? 'Processing file...' : 'Drag and drop your file here, or click to browse'}
          </p>

          {uploadType === 'csv' && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg text-left text-sm text-gray-700 max-w-4xl">
              <div className="font-semibold mb-3 text-gray-900">Expected CSV Column Headers:</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                {[
                  'Time', 'Position', 'Symbol', 'Type', 
                  'Volume', 'Price', 'S / L', 'T / P', 
                  'Time', 'Price', 'Commission', 'Swap', 'Profit'
                ].map((header, index) => (
                  <div key={index} className="bg-white px-2 py-1 rounded border text-xs font-mono">
                    {header}
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <div><strong>Format:</strong> Tab-separated or comma-separated values</div>
                <div><strong>Date Format:</strong> YYYY.MM.DD HH:MM:SS (e.g., 2025.01.08 11:25:24)</div>
                <div><strong>Note:</strong> Two Time columns (entry and exit) and two Price columns (entry and exit)</div>
                <div><strong>Position:</strong> Position ID or number</div>
                <div><strong>Commission/Swap/Profit:</strong> Numeric values (can be negative)</div>
              </div>
            </div>
          )}
          
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-md max-w-md">
              {error}
            </div>
          )}
          
          <div className="flex space-x-4">
            <label 
              htmlFor="file-upload"
              className={`
                px-6 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium 
                ${isLoading 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer'}
                transition-colors duration-200
              `}
            >
              {isLoading ? 'Processing...' : `Select ${uploadType.toUpperCase()} File`}
            </label>
            <input
              id="file-upload"
              name="file-upload"
              type="file"
              accept={getAcceptedFileTypes()}
              onChange={handleFileSelect}
              className="sr-only"
              disabled={isLoading}
            />
            
            <button
              onClick={onLoadMockData}
              disabled={isLoading}
              className={`
                px-6 py-2 rounded-md text-sm font-medium transition-colors duration-200
                ${isLoading 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}
              `}
            >
              Load Demo Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};