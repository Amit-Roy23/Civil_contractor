import { pgTable, uuid, varchar, text, timestamp, boolean, integer, numeric } from 'drizzle-orm/pg-core';
import { users } from './core';

// Companies (MST-01)
export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  pan: varchar('pan', { length: 10 }).notNull(),
  gstin: varchar('gstin', { length: 15 }),
  registeredAddress: text('registered_address').notNull(),
  state: varchar('state', { length: 50 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Sites (MST-02)
export const sites = pgTable('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  clientName: varchar('client_name', { length: 150 }),
  contractNumber: varchar('contract_number', { length: 100 }),
  locationAddress: text('location_address').notNull(),
  chainageStartKm: numeric('chainage_start_km', { precision: 10, scale: 3 }),
  chainageEndKm: numeric('chainage_end_km', { precision: 10, scale: 3 }),
  sanctionedBudget: numeric('sanctioned_budget', { precision: 18, scale: 2 }).default('0'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Plants (MST-04)
export const plants = pgTable('plants', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // HOT_MIX, CONCRETE_BATCHING, STONE_CRUSHER
  address: text('address').notNull(),
  capacityTph: numeric('capacity_tph', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Locations / Stores (MST-03, Section 4.1)
export const locations = pgTable('locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // CENTRAL_STORE, SITE_STORE, PLANT_STORE, FUEL_TANK, FUEL_BOWSER, IN_TRANSIT
  siteId: uuid('site_id').references(() => sites.id),
  plantId: uuid('plant_id').references(() => plants.id),
  currentSiteId: uuid('current_site_id').references(() => sites.id), // For movable bowser
  address: text('address'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Materials / Items (MST-05)
export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(), // Cement, Steel, Aggregates, Bitumen, Fuel, Admixtures
  baseUnitCode: varchar('base_unit_code', { length: 10 }).notNull(), // KG, MT, LTR, CUM, etc.
  hsnCode: varchar('hsn_code', { length: 10 }),
  reorderLevel: numeric('reorder_level', { precision: 18, scale: 4 }).default('0').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Item Unit Conversions (MST-05, MAT-12)
export const itemUnitConversions = pgTable('item_unit_conversions', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  unitCode: varchar('unit_code', { length: 10 }).notNull(), // e.g. BAG, MT, BRASS
  conversionFactor: numeric('conversion_factor', { precision: 18, scale: 4 }).notNull(), // 1 [unitCode] = conversionFactor * [baseUnit]
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Suppliers (MST-06)
export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  gstin: varchar('gstin', { length: 15 }),
  pan: varchar('pan', { length: 10 }),
  contactPerson: varchar('contact_person', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 100 }),
  address: text('address').notNull(),
  state: varchar('state', { length: 50 }).notNull(),
  paymentTermsDays: integer('payment_terms_days').default(30).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Clients (MST-07)
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  gstin: varchar('gstin', { length: 15 }),
  pan: varchar('pan', { length: 10 }),
  department: varchar('department', { length: 100 }), // NHAI, PWD, MoRTH
  address: text('address').notNull(),
  state: varchar('state', { length: 50 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Subcontractors (MST-08)
export const subcontractors = pgTable('subcontractors', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  pan: varchar('pan', { length: 10 }),
  gstin: varchar('gstin', { length: 15 }),
  specialisation: varchar('specialisation', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  address: text('address'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Workers (MST-09)
export const workers = pgTable('workers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  trade: varchar('trade', { length: 50 }).notNull(), // Mason, Barbender, Carpenter, Helper
  aadhaarMasked: varchar('aadhaar_masked', { length: 20 }), // XXXX-XXXX-1234
  dailyWageRate: numeric('daily_wage_rate', { precision: 18, scale: 2 }),
  phone: varchar('phone', { length: 20 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Vehicles / Machinery (MST-10)
export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  registrationNumber: varchar('registration_number', { length: 20 }).notNull(),
  assetName: varchar('asset_name', { length: 100 }).notNull(),
  ownership: varchar('ownership', { length: 20 }).notNull(), // OWNED, HIRED
  meterType: varchar('meter_type', { length: 20 }).notNull(), // ODOMETER_KM, HOUR_METER
  standardKmpl: numeric('standard_kmpl', { precision: 10, scale: 2 }),
  standardLph: numeric('standard_lph', { precision: 10, scale: 2 }),
  insuranceExpiryDate: varchar('insurance_expiry_date', { length: 10 }),
  fitnessExpiryDate: varchar('fitness_expiry_date', { length: 10 }),
  taxTokenExpiryDate: varchar('tax_token_expiry_date', { length: 10 }),
  pucExpiryDate: varchar('puc_expiry_date', { length: 10 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Fuel Sources (MST-11)
export const fuelSources = pgTable('fuel_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  isExternalPump: boolean('is_external_pump').default(false).notNull(),
  locationId: uuid('location_id').references(() => locations.id),
  supplierId: uuid('supplier_id').references(() => suppliers.id),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Expense Heads (MST-12)
export const expenseHeads = pgTable('expense_heads', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(), // CostHead
  parentHeadId: uuid('parent_head_id'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Recipes / BOM (MST-14)
export const recipes = pgTable('recipes', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  plantType: varchar('plant_type', { length: 50 }).notNull(),
  outputItemId: uuid('output_item_id').references(() => items.id).notNull(),
  batchSize: numeric('batch_size', { precision: 18, scale: 4 }).default('1').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const recipeItems = pgTable('recipe_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipeId: uuid('recipe_id').references(() => recipes.id).notNull(),
  rawMaterialItemId: uuid('raw_material_item_id').references(() => items.id).notNull(),
  standardQtyPerBatch: numeric('standard_qty_per_batch', { precision: 18, scale: 4 }).notNull(),
  tolerancePercent: numeric('tolerance_percent', { precision: 5, scale: 2 }).default('2').notNull(),
});

// BOQ Items (MST-15)
export const boqItems = pgTable('boq_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  itemNumber: varchar('item_number', { length: 30 }).notNull(),
  description: text('description').notNull(),
  unitCode: varchar('unit_code', { length: 10 }).notNull(),
  tenderQty: numeric('tender_qty', { precision: 18, scale: 4 }).notNull(),
  tenderRate: numeric('tender_rate', { precision: 18, scale: 4 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
