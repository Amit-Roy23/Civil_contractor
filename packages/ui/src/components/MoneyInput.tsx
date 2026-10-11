import React from 'react';
import { formatINR } from '@civil/shared';
import { cn } from '../lib/utils.js';

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string | number;
  onChange: (val: string) => void;
  label?: string;
  error?: string;
  helperText?: string;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onChange,
  label,
  error,
  helperText,
  className,
  disabled,
  ...props
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits and up to one decimal point
    if (/^\d*\.?\d{0,2}$/.test(raw) || raw === '') {
      onChange(raw);
    }
  };

  const preview = value ? formatINR(value) : '';

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>}
      <div className="relative rounded-md shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <span className="text-slate-500 font-semibold text-sm">₹</span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={value ?? ''}
          onChange={handleChange}
          disabled={disabled}
          placeholder="0.00"
          className={cn(
            'block w-full rounded-md border py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition',
            error
              ? 'border-red-500 text-red-900 focus:ring-red-500'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
            disabled && 'bg-slate-100 dark:bg-slate-800 opacity-60 cursor-not-allowed',
            className,
          )}
          {...props}
        />
      </div>
      <div className="flex justify-between items-center text-xs mt-0.5">
        {error ? (
          <span className="text-red-500">{error}</span>
        ) : helperText ? (
          <span className="text-slate-500">{helperText}</span>
        ) : (
          <span />
        )}
        {preview && !error && (
          <span className="text-slate-500 font-medium">In words/preview: {preview}</span>
        )}
      </div>
    </div>
  );
};
