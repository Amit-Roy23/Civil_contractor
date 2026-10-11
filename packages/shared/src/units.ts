// Unit of Measurement & Conversion Utils (MST-05, MST-13, MAT-12)
import { Decimal, toQty } from './money.js';

export interface UnitDefinition {
  code: string;
  name: string;
  category: 'WEIGHT' | 'VOLUME' | 'AREA' | 'LENGTH' | 'COUNT';
}

export const STANDARD_UNITS: Record<string, UnitDefinition> = {
  KG: { code: 'KG', name: 'Kilogram', category: 'WEIGHT' },
  MT: { code: 'MT', name: 'Metric Tonne', category: 'WEIGHT' },
  BAG: { code: 'BAG', name: 'Bag (50 kg std)', category: 'WEIGHT' },
  LTR: { code: 'LTR', name: 'Litre', category: 'VOLUME' },
  KL: { code: 'KL', name: 'Kilo-Litre (1000 L)', category: 'VOLUME' },
  CUM: { code: 'CUM', name: 'Cubic Metre', category: 'VOLUME' },
  CFT: { code: 'CFT', name: 'Cubic Feet', category: 'VOLUME' },
  BRASS: { code: 'BRASS', name: 'Brass (100 cft)', category: 'VOLUME' },
  SQM: { code: 'SQM', name: 'Square Metre', category: 'AREA' },
  SQFT: { code: 'SQFT', name: 'Square Feet', category: 'AREA' },
  RMT: { code: 'RMT', name: 'Running Metre', category: 'LENGTH' },
  NO: { code: 'NO', name: 'Number / Piece', category: 'COUNT' },
  TRIP: { code: 'TRIP', name: 'Trip', category: 'COUNT' },
};

export interface ItemUnitConversion {
  id?: string;
  itemId: string;
  unitCode: string;
  /**
   * Multiplier such that: 1 [unitCode] = multiplier * [baseUnit]
   * Example: If base unit is KG and unitCode is BAG (50 kg): multiplier is 50.
   * Example: If base unit is KG and unitCode is MT: multiplier is 1000.
   */
  conversionFactor: Decimal.Value;
}

/**
 * Converts entered quantity to the item's primary base unit (MAT-12)
 * Formula: baseQty = enteredQty * conversionFactor
 */
export function convertToBaseQty(
  enteredQty: Decimal.Value,
  conversionFactor: Decimal.Value = 1,
): Decimal {
  const qty = new Decimal(enteredQty);
  const factor = new Decimal(conversionFactor);
  return toQty(qty.times(factor));
}

/**
 * Converts base quantity back to the display unit
 * Formula: enteredQty = baseQty / conversionFactor
 */
export function convertFromBaseQty(
  baseQty: Decimal.Value,
  conversionFactor: Decimal.Value = 1,
): Decimal {
  const qty = new Decimal(baseQty);
  const factor = new Decimal(conversionFactor);
  if (factor.isZero()) {
    throw new Error('Conversion factor cannot be zero');
  }
  return toQty(qty.dividedBy(factor));
}
