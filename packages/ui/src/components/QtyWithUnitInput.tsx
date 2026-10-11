import React from 'react';
import { convertToBaseQty, formatQtyDisplay } from '@civil/shared';
import { cn } from '../lib/utils.js';

interface UnitOption {
  code: string;
  name: string;
  conversionFactor: string | number; // factor to base unit
}

interface QtyWithUnitInputProps {
  qtyValue: string | number;
  onQtyChange: (val: string) => void;
  unitValue: string;
  onUnitChange: (unitCode: string) => void;
  units: UnitOption[];
  baseUnitCode: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export const QtyWithUnitInput: React.FC<QtyWithUnitInputProps> = ({
  qtyValue,
  onQtyChange,
  unitValue,
  onUnitChange,
  units,
  baseUnitCode,
  label,
  error,
  disabled,
}) => {
  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (/^\d*\.?\d{0,4}$/.test(raw) || raw === '') {
      onQtyChange(raw);
    }
  };

  const selectedUnit = units.find((u) => u.code === unitValue) || {
    code: baseUnitCode,
    name: baseUnitCode,
    conversionFactor: 1,
  };

  const baseEquivalent =
    qtyValue && selectedUnit.code !== baseUnitCode
      ? convertToBaseQty(qtyValue, selectedUnit.conversionFactor)
      : null;

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>}
      <div className="flex rounded-md shadow-sm">
        <input
          type="text"
          inputMode="decimal"
          value={qtyValue ?? ''}
          onChange={handleQtyChange}
          disabled={disabled}
          placeholder="0.0000"
          className={cn(
            'flex-1 rounded-l-md border py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition',
            error
              ? 'border-red-500 text-red-900 focus:ring-red-500'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
            disabled && 'bg-slate-100 dark:bg-slate-800 opacity-60 cursor-not-allowed',
          )}
        />
        <select
          value={unitValue}
          onChange={(e) => onUnitChange(e.target.value)}
          disabled={disabled}
          className="border-y border-r border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-r-md text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {units.map((u) => (
            <option key={u.code} value={u.code}>
              {u.code} ({u.name})
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-between items-center text-xs mt-0.5">
        {error ? (
          <span className="text-red-500">{error}</span>
        ) : baseEquivalent ? (
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            Base equivalent: {formatQtyDisplay(baseEquivalent, baseUnitCode)}
          </span>
        ) : (
          <span className="text-slate-500">Base unit: {baseUnitCode}</span>
        )}
      </div>
    </div>
  );
};
