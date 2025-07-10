import React from 'react';
import { Clock } from 'lucide-react';

interface TimezoneSelectorProps {
  selectedTimezone: number;
  onTimezoneChange: (timezone: number) => void;
  disabled?: boolean;
}

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  selectedTimezone,
  onTimezoneChange,
  disabled = false
}) => {
  const timezones = [
    { value: -12, label: 'GMT-12' },
    { value: -11, label: 'GMT-11' },
    { value: -10, label: 'GMT-10' },
    { value: -9, label: 'GMT-9' },
    { value: -8, label: 'GMT-8 (PST)' },
    { value: -7, label: 'GMT-7 (MST)' },
    { value: -6, label: 'GMT-6 (CST)' },
    { value: -5, label: 'GMT-5 (EST)' },
    { value: -4, label: 'GMT-4' },
    { value: -3, label: 'GMT-3' },
    { value: -2, label: 'GMT-2' },
    { value: -1, label: 'GMT-1' },
    { value: 0, label: 'GMT+0 (UTC)' },
    { value: 1, label: 'GMT+1 (CET)' },
    { value: 2, label: 'GMT+2 (EET)' },
    { value: 3, label: 'GMT+3' },
    { value: 4, label: 'GMT+4' },
    { value: 5, label: 'GMT+5' },
    { value: 6, label: 'GMT+6' },
    { value: 7, label: 'GMT+7' },
    { value: 8, label: 'GMT+8' },
    { value: 9, label: 'GMT+9 (JST)' },
    { value: 10, label: 'GMT+10' },
    { value: 11, label: 'GMT+11' },
    { value: 12, label: 'GMT+12' }
  ];

  return (
    <div className="flex items-center space-x-2">
      <Clock className="h-4 w-4 text-gray-500" />
      <label className="text-sm text-gray-600 font-medium">CSV Timezone:</label>
      <select
        value={selectedTimezone}
        onChange={(e) => onTimezoneChange(Number(e.target.value))}
        disabled={disabled}
        className={`
          px-3 py-2 border border-blue-300 rounded-md text-sm bg-white min-w-[140px]
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-pointer hover:border-blue-400'}
        `}
      >
        {timezones.map(tz => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
    </div>
  );
};