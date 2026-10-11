import React from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { cn } from '../lib/utils.js';

interface DateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  maxBackdateDays?: number; // Company setting, default e.g. 3
  label?: string;
  error?: string;
  disabled?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  maxBackdateDays = 3,
  label = 'Transaction Date',
  error,
  disabled,
}) => {
  const today = new Date();
  const selectedDate = value ? parseISO(value) : null;
  const daysDiff = selectedDate ? differenceInCalendarDays(today, selectedDate) : 0;
  const isBackdated = daysDiff > 0;
  const isOverLimit = daysDiff > maxBackdateDays;

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full rounded-md border py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition',
          isOverLimit
            ? 'border-amber-500 text-amber-900 focus:ring-amber-500 bg-amber-50 dark:bg-amber-950/30'
            : error
              ? 'border-red-500 text-red-900 focus:ring-red-500'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
          disabled && 'bg-slate-100 dark:bg-slate-800 opacity-60 cursor-not-allowed',
        )}
      />
      <div className="text-xs mt-0.5">
        {error ? (
          <span className="text-red-500">{error}</span>
        ) : isOverLimit ? (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            ⚠️ Back-dated by {daysDiff} days (company limit is {maxBackdateDays} days). Requires approval (MAT-14).
          </span>
        ) : isBackdated ? (
          <span className="text-slate-500">Back-dated by {daysDiff} day(s).</span>
        ) : null}
      </div>
    </div>
  );
};
