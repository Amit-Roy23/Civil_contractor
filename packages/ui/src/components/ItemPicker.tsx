import React, { useState } from 'react';
import { cn } from '../lib/utils.js';

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  category: string;
  baseUnitCode: string;
}

interface ItemPickerProps {
  value?: string;
  onChange: (itemId: string, item: ItemOption) => void;
  items: ItemOption[];
  label?: string;
  error?: string;
  disabled?: boolean;
}

export const ItemPicker: React.FC<ItemPickerProps> = ({
  value,
  onChange,
  items,
  label = 'Select Material / Item',
  error,
  disabled,
}) => {
  const [search, setSearch] = useState('');
  const selectedItem = items.find((i) => i.id === value);

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.code.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>}
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => {
            const item = items.find((i) => i.id === e.target.value);
            if (item) onChange(item.id, item);
          }}
          disabled={disabled}
          className={cn(
            'w-full rounded-md border py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition',
            error
              ? 'border-red-500 text-red-900 focus:ring-red-500'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
            disabled && 'bg-slate-100 dark:bg-slate-800 opacity-60 cursor-not-allowed',
          )}
        >
          <option value="" disabled>
            -- Choose Material / Item --
          </option>
          {filteredItems.map((item) => (
            <option key={item.id} value={item.id}>
              [{item.code}] {item.name} ({item.baseUnitCode}) - {item.category}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
      {selectedItem && (
        <span className="text-xs text-slate-500">
          Category: <span className="font-medium text-slate-700 dark:text-slate-300">{selectedItem.category}</span> | Base Unit:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{selectedItem.baseUnitCode}</span>
        </span>
      )}
    </div>
  );
};
