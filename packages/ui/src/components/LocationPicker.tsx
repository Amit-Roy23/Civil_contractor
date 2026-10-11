import React from 'react';
import { LocationType } from '@civil/shared';
import { cn } from '../lib/utils.js';

export interface LocationItem {
  id: string;
  name: string;
  code: string;
  type: LocationType;
  siteName?: string;
  plantName?: string;
}

interface LocationPickerProps {
  value?: string;
  onChange: (locationId: string) => void;
  locations: LocationItem[];
  label?: string;
  filterTypes?: LocationType[];
  error?: string;
  disabled?: boolean;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  locations,
  label = 'Select Location',
  filterTypes,
  error,
  disabled,
}) => {
  const filtered = filterTypes
    ? locations.filter((loc) => filterTypes.includes(loc.type))
    : locations;

  // Group locations by type
  const centralStores = filtered.filter((l) => l.type === LocationType.CENTRAL_STORE);
  const siteStores = filtered.filter((l) => l.type === LocationType.SITE_STORE);
  const plantStores = filtered.filter((l) => l.type === LocationType.PLANT_STORE);
  const fuelLocations = filtered.filter(
    (l) => l.type === LocationType.FUEL_TANK || l.type === LocationType.FUEL_BOWSER,
  );

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
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
          -- Choose Location --
        </option>
        {centralStores.length > 0 && (
          <optgroup label="🏢 Central Godown / Stores">
            {centralStores.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </optgroup>
        )}
        {siteStores.length > 0 && (
          <optgroup label="🚧 Project Site Stores">
            {siteStores.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.siteName ? `${loc.siteName} - ` : ''}
                {loc.name} ({loc.code})
              </option>
            ))}
          </optgroup>
        )}
        {plantStores.length > 0 && (
          <optgroup label="🏭 Production Plants">
            {plantStores.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.plantName ? `${loc.plantName} - ` : ''}
                {loc.name} ({loc.code})
              </option>
            ))}
          </optgroup>
        )}
        {fuelLocations.length > 0 && (
          <optgroup label="⛽ Fuel Tanks & Bowsers">
            {fuelLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};
