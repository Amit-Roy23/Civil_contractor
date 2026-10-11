import { pgTable, uuid, varchar, text, timestamp, numeric, integer, boolean } from 'drizzle-orm/pg-core';
import { companies, sites, locations, items, vehicles, recipes, suppliers, subcontractors, workers } from './masters';
import { users } from './core';

// --- FUEL MODULE (FUEL-07) ---
// TODO(FUEL-01): Requisitions & bulk fuel purchases
export const fuelPurchases = pgTable('fuel_purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  locationId: uuid('location_id').references(() => locations.id).notNull(), // Tank or Bowser
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  invoiceNo: varchar('invoice_no', { length: 100 }).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  litres: numeric('litres', { precision: 18, scale: 4 }).notNull(),
  ratePerLitre: numeric('rate_per_litre', { precision: 18, scale: 4 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// TODO(FUEL-07): Fuel load with KMPL/LPH variance calculation
export const fuelLoads = pgTable('fuel_loads', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  locationId: uuid('location_id').references(() => locations.id).notNull(), // Dispensing Tank or Bowser
  vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  currentMeterReading: numeric('current_meter_reading', { precision: 10, scale: 2 }).notNull(),
  previousMeterReading: numeric('previous_meter_reading', { precision: 10, scale: 2 }).notNull(),
  distanceRunOrHours: numeric('distance_run_or_hours', { precision: 10, scale: 2 }).notNull(),
  litresIssued: numeric('litres_issued', { precision: 18, scale: 4 }).notNull(),
  expectedLitres: numeric('expected_litres', { precision: 18, scale: 4 }).notNull(),
  varianceLitres: numeric('variance_litres', { precision: 18, scale: 4 }).notNull(),
  isFullTankFill: boolean('is_full_tank_fill').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- VEHICLES MODULE ---
// TODO(VEH-01): Daily logbook with multi-site split
export const vehicleLogbooks = pgTable('vehicle_logbooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  logDate: varchar('log_date', { length: 10 }).notNull(),
  startMeter: numeric('start_meter', { precision: 10, scale: 2 }).notNull(),
  endMeter: numeric('end_meter', { precision: 10, scale: 2 }).notNull(),
  totalUnitsRun: numeric('total_units_run', { precision: 10, scale: 2 }).notNull(),
  workDetails: text('work_details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- LABOUR MODULE ---
// TODO(LAB-01): Daily Attendance
export const labourAttendances = pgTable('labour_attendances', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  attendanceDate: varchar('attendance_date', { length: 10 }).notNull(),
  workerId: uuid('worker_id').references(() => workers.id),
  subcontractorId: uuid('subcontractor_id').references(() => subcontractors.id),
  headcount: integer('headcount').default(1).notNull(),
  trade: varchar('trade', { length: 50 }).notNull(),
  shiftHours: numeric('shift_hours', { precision: 4, scale: 2 }).default('8.00').notNull(),
  wageAmount: numeric('wage_amount', { precision: 18, scale: 2 }).default('0').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- EXPENSES MODULE ---
// TODO(EXP-01): Petty Cash & Expense Entry
export const expenseEntries = pgTable('expense_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  expenseHeadId: uuid('expense_head_id').notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  paidTo: varchar('paid_to', { length: 150 }).notNull(),
  paymentMode: varchar('payment_mode', { length: 50 }).default('CASH').notNull(),
  voucherRef: varchar('voucher_ref', { length: 100 }),
  remarks: text('remarks'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- PLANT MODULE (PLT-13, PLT-15) ---
// TODO(PLT-01): Plant Production
export const plantProductions = pgTable('plant_productions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  locationId: uuid('location_id').references(() => locations.id).notNull(), // Plant Store
  recipeId: uuid('recipe_id').references(() => recipes.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  outputBatchQty: numeric('output_batch_qty', { precision: 18, scale: 4 }).notNull(),
  costPerUnit: numeric('cost_per_unit', { precision: 18, scale: 4 }).default('0').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// TODO(PLT-13): Plant Dispatches with site-wise raw-material allocation
export const plantDispatches = pgTable('plant_dispatches', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  fromLocationId: uuid('from_location_id').references(() => locations.id).notNull(),
  toSiteId: uuid('to_site_id').references(() => sites.id).notNull(),
  recipeId: uuid('recipe_id').references(() => recipes.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  dispatchedQty: numeric('dispatched_qty', { precision: 18, scale: 4 }).notNull(),
  transferRate: numeric('transfer_rate', { precision: 18, scale: 4 }).notNull(), // PLT-15
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const plantRawMaterialAllocations = pgTable('plant_raw_material_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  plantDispatchId: uuid('plant_dispatch_id').references(() => plantDispatches.id).notNull(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  rawMaterialItemId: uuid('raw_material_item_id').references(() => items.id).notNull(),
  allocatedQty: numeric('allocated_qty', { precision: 18, scale: 4 }).notNull(), // e.g. MT bitumen in BC
  allocatedRate: numeric('allocated_rate', { precision: 18, scale: 4 }).notNull(),
  allocatedAmount: numeric('allocated_amount', { precision: 18, scale: 2 }).notNull(),
});

// --- CONTRACT & RA BILLING MODULE ---
// TODO(BIL-01): Measurement Book & RA Bills
export const raBills = pgTable('ra_bills', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  billNumber: varchar('bill_number', { length: 50 }).notNull(),
  billDate: varchar('bill_date', { length: 10 }).notNull(),
  grossAmount: numeric('gross_amount', { precision: 18, scale: 2 }).notNull(),
  retentionDeduction: numeric('retention_deduction', { precision: 18, scale: 2 }).default('0').notNull(),
  tdsDeduction: numeric('tds_deduction', { precision: 18, scale: 2 }).default('0').notNull(),
  gstTdsDeduction: numeric('gst_tds_deduction', { precision: 18, scale: 2 }).default('0').notNull(),
  netPayableAmount: numeric('net_payable_amount', { precision: 18, scale: 2 }).notNull(),
  status: varchar('status', { length: 30 }).default('DRAFT').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- ALERTS MODULE (ALT-01...07) ---
export const alertRules = pgTable('alert_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  alertType: varchar('alert_type', { length: 50 }).notNull(), // ALT-01: LOW_STOCK, ALT-02: EXPIRY, etc.
  name: varchar('name', { length: 100 }).notNull(),
  cronExpression: varchar('cron_expression', { length: 50 }).default('0 8 * * *').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
