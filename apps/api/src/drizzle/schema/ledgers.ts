import { pgTable, uuid, varchar, text, timestamp, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies, sites, locations, items, boqItems } from './masters.js';

// Stock Ledger (Section 4.3 - Append-Only)
export const stockLedger = pgTable(
  'stock_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id).notNull(),
    locationId: uuid('location_id').references(() => locations.id).notNull(),
    itemId: uuid('item_id').references(() => items.id).notNull(),
    txnDate: varchar('txn_date', { length: 10 }).notNull(), // Business Date YYYY-MM-DD
    voucherType: varchar('voucher_type', { length: 50 }).notNull(),
    voucherId: uuid('voucher_id').notNull(),
    voucherLineId: uuid('voucher_line_id'),
    voucherNo: varchar('voucher_no', { length: 100 }).notNull(),
    qtyIn: numeric('qty_in', { precision: 18, scale: 4 }).default('0').notNull(),
    qtyOut: numeric('qty_out', { precision: 18, scale: 4 }).default('0').notNull(),
    rate: numeric('rate', { precision: 18, scale: 4 }).default('0').notNull(),
    valueIn: numeric('value_in', { precision: 18, scale: 2 }).default('0').notNull(),
    valueOut: numeric('value_out', { precision: 18, scale: 2 }).default('0').notNull(),
    batchId: varchar('batch_id', { length: 50 }),
    runningQty: numeric('running_qty', { precision: 18, scale: 4 }).notNull(),
    runningValue: numeric('running_value', { precision: 18, scale: 2 }).notNull(),
    valuationRate: numeric('valuation_rate', { precision: 18, scale: 4 }).notNull(),
    siteId: uuid('site_id').references(() => sites.id), // Denormalised for reporting
    boqItemId: uuid('boq_item_id').references(() => boqItems.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_stock_ledger_loc_item_date').on(table.locationId, table.itemId, table.txnDate),
    index('idx_stock_ledger_voucher').on(table.voucherType, table.voucherId),
  ],
);

// Stock Balance Materialized Table (Section 4.3 - Row-locked with SELECT ... FOR UPDATE)
export const stockBalance = pgTable(
  'stock_balance',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id).notNull(),
    locationId: uuid('location_id').references(() => locations.id).notNull(),
    itemId: uuid('item_id').references(() => items.id).notNull(),
    currentQty: numeric('current_qty', { precision: 18, scale: 4 }).default('0').notNull(),
    currentValue: numeric('current_value', { precision: 18, scale: 2 }).default('0').notNull(),
    valuationRate: numeric('valuation_rate', { precision: 18, scale: 4 }).default('0').notNull(),
    lastUpdatedTxnDate: varchar('last_updated_txn_date', { length: 10 }),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_stock_balance_loc_item').on(table.locationId, table.itemId),
    index('idx_stock_balance_item').on(table.itemId),
  ],
);

// Cost Ledger (Section 4.4, CST-01 - Append-Only)
export const costLedger = pgTable(
  'cost_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id).notNull(),
    siteId: uuid('site_id').references(() => sites.id).notNull(),
    txnDate: varchar('txn_date', { length: 10 }).notNull(), // YYYY-MM-DD
    costHead: varchar('cost_head', { length: 50 }).notNull(), // MATERIAL, LABOUR, VEHICLE_FUEL, etc.
    subHead: varchar('sub_head', { length: 100 }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    qty: numeric('qty', { precision: 18, scale: 4 }),
    unit: varchar('unit', { length: 10 }),
    sourceVoucherType: varchar('source_voucher_type', { length: 50 }).notNull(),
    sourceVoucherId: uuid('source_voucher_id').notNull(),
    sourceVoucherNo: varchar('source_voucher_no', { length: 100 }).notNull(),
    boqItemId: uuid('boq_item_id').references(() => boqItems.id),
    vehicleId: uuid('vehicle_id'),
    plantId: uuid('plant_id'),
    status: varchar('status', { length: 20 }).default('POSTED').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_cost_ledger_site_head').on(table.siteId, table.costHead, table.txnDate),
  ],
);

// Party Sub-Ledger (Section 4.5, SUP-01/02 - Append-Only)
export const partyLedger = pgTable(
  'party_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id).notNull(),
    partyId: uuid('party_id').notNull(),
    partyType: varchar('party_type', { length: 50 }).notNull(), // SUPPLIER, CLIENT, WORKER, etc.
    txnDate: varchar('txn_date', { length: 10 }).notNull(),
    debit: numeric('debit', { precision: 18, scale: 2 }).default('0').notNull(),
    credit: numeric('credit', { precision: 18, scale: 2 }).default('0').notNull(),
    voucherType: varchar('voucher_type', { length: 50 }).notNull(),
    voucherId: uuid('voucher_id').notNull(),
    voucherNo: varchar('voucher_no', { length: 100 }).notNull(),
    dueDate: varchar('due_date', { length: 10 }),
    remarks: text('remarks'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_party_ledger_party_date').on(table.partyId, table.txnDate),
  ],
);
