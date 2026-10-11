import { pgTable, uuid, varchar, text, timestamp, numeric, integer, boolean } from 'drizzle-orm/pg-core';
import { companies, sites, locations, items, suppliers, boqItems } from './masters';
import { users, financialYears } from './core';

// --- Purchase Orders (PUR-03) ---
export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull().unique(),
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  deliveryLocationId: uuid('delivery_location_id').references(() => locations.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(), // YYYY-MM-DD
  status: varchar('status', { length: 30 }).default('DRAFT').notNull(),
  subTotal: numeric('sub_total', { precision: 18, scale: 2 }).default('0').notNull(),
  taxTotal: numeric('tax_total', { precision: 18, scale: 2 }).default('0').notNull(),
  grandTotal: numeric('grand_total', { precision: 18, scale: 2 }).default('0').notNull(),
  paymentTerms: text('payment_terms'),
  deliveryTerms: text('delivery_terms'),
  remarks: text('remarks'),
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  poId: uuid('po_id').references(() => purchaseOrders.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  enteredQty: numeric('entered_qty', { precision: 18, scale: 4 }).notNull(),
  enteredUnitCode: varchar('entered_unit_code', { length: 10 }).notNull(),
  baseQty: numeric('base_qty', { precision: 18, scale: 4 }).notNull(),
  receivedQty: numeric('received_qty', { precision: 18, scale: 4 }).default('0').notNull(), // Track pending balance
  unitRate: numeric('unit_rate', { precision: 18, scale: 4 }).notNull(),
  gstPercent: numeric('gst_percent', { precision: 5, scale: 2 }).default('18').notNull(),
  lineAmount: numeric('line_amount', { precision: 18, scale: 2 }).notNull(),
  remarks: text('remarks'),
});

// --- Goods Receipt Notes (GRN) (PUR-04 / MAT-02) ---
export const grnHeaders = pgTable('grn_headers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull().unique(),
  poId: uuid('po_id').references(() => purchaseOrders.id),
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  locationId: uuid('location_id').references(() => locations.id).notNull(), // Receiving store
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 30 }).default('POSTED').notNull(),
  supplierChallanNo: varchar('supplier_challan_no', { length: 100 }).notNull(),
  supplierChallanDate: varchar('supplier_challan_date', { length: 10 }),
  vehicleNumber: varchar('vehicle_number', { length: 50 }).notNull(),
  weighbridgeSlipNo: varchar('weighbridge_slip_no', { length: 100 }),
  grossWeightKg: numeric('gross_weight_kg', { precision: 18, scale: 4 }),
  tareWeightKg: numeric('tare_weight_kg', { precision: 18, scale: 4 }),
  netWeightKg: numeric('net_weight_kg', { precision: 18, scale: 4 }),
  totalValue: numeric('total_value', { precision: 18, scale: 2 }).default('0').notNull(),
  remarks: text('remarks'),
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const grnLines = pgTable('grn_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  grnId: uuid('grn_id').references(() => grnHeaders.id).notNull(),
  poLineId: uuid('po_line_id').references(() => purchaseOrderLines.id),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  receivedQty: numeric('received_qty', { precision: 18, scale: 4 }).notNull(),
  acceptedQty: numeric('accepted_qty', { precision: 18, scale: 4 }).notNull(),
  rejectedQty: numeric('rejected_qty', { precision: 18, scale: 4 }).default('0').notNull(),
  enteredUnitCode: varchar('entered_unit_code', { length: 10 }).notNull(),
  baseQty: numeric('base_qty', { precision: 18, scale: 4 }).notNull(), // Accepted qty in base unit
  unitRate: numeric('unit_rate', { precision: 18, scale: 4 }).notNull(),
  gstPercent: numeric('gst_percent', { precision: 5, scale: 2 }).default('18').notNull(),
  lineValue: numeric('line_value', { precision: 18, scale: 2 }).notNull(),
  remarks: text('remarks'),
});

// --- Store-to-Site Issue (Transfer Issue) (STR-01 / MAT-01) ---
export const transferIssues = pgTable('transfer_issues', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull().unique(),
  fromLocationId: uuid('from_location_id').references(() => locations.id).notNull(),
  toLocationId: uuid('to_location_id').references(() => locations.id).notNull(),
  inTransitLocationId: uuid('in_transit_location_id').references(() => locations.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 30 }).default('POSTED').notNull(), // POSTED means in transit; COMPLETED once site confirms
  challanNo: varchar('challan_no', { length: 100 }).notNull(),
  vehicleNumber: varchar('vehicle_number', { length: 50 }).notNull(),
  driverName: varchar('driver_name', { length: 100 }),
  driverMobile: varchar('driver_mobile', { length: 20 }),
  remarks: text('remarks'),
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const transferIssueLines = pgTable('transfer_issue_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  transferIssueId: uuid('transfer_issue_id').references(() => transferIssues.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  enteredQty: numeric('entered_qty', { precision: 18, scale: 4 }).notNull(),
  enteredUnitCode: varchar('entered_unit_code', { length: 10 }).notNull(),
  baseQty: numeric('base_qty', { precision: 18, scale: 4 }).notNull(),
  confirmedQty: numeric('confirmed_qty', { precision: 18, scale: 4 }).default('0').notNull(),
  valuationRate: numeric('valuation_rate', { precision: 18, scale: 4 }).default('0').notNull(),
  lineValue: numeric('line_value', { precision: 18, scale: 2 }).default('0').notNull(),
  remarks: text('remarks'),
});

// --- Site Transfer Receipt Confirmation (MAT-05) ---
export const transferReceipts = pgTable('transfer_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull().unique(),
  transferIssueId: uuid('transfer_issue_id').references(() => transferIssues.id).notNull(),
  receivedLocationId: uuid('received_location_id').references(() => locations.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 30 }).default('POSTED').notNull(),
  remarks: text('remarks'),
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const transferReceiptLines = pgTable('transfer_receipt_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  transferReceiptId: uuid('transfer_receipt_id').references(() => transferReceipts.id).notNull(),
  transferLineId: uuid('transfer_line_id').references(() => transferIssueLines.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  acceptedQty: numeric('accepted_qty', { precision: 18, scale: 4 }).notNull(),
  rejectedQty: numeric('rejected_qty', { precision: 18, scale: 4 }).default('0').notNull(),
  enteredUnitCode: varchar('entered_unit_code', { length: 10 }).notNull(),
  baseQty: numeric('base_qty', { precision: 18, scale: 4 }).notNull(),
  valuationRate: numeric('valuation_rate', { precision: 18, scale: 4 }).default('0').notNull(),
  lineValue: numeric('line_value', { precision: 18, scale: 2 }).default('0').notNull(),
  remarks: text('remarks'),
});

// --- Site Consumption (MAT-04) ---
export const siteConsumptions = pgTable('site_consumptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull().unique(),
  siteId: uuid('site_id').references(() => sites.id).notNull(),
  locationId: uuid('location_id').references(() => locations.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 30 }).default('POSTED').notNull(),
  workSection: varchar('work_section', { length: 100 }),
  totalValue: numeric('total_value', { precision: 18, scale: 2 }).default('0').notNull(),
  remarks: text('remarks'),
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const siteConsumptionLines = pgTable('site_consumption_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  consumptionId: uuid('consumption_id').references(() => siteConsumptions.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  enteredQty: numeric('entered_qty', { precision: 18, scale: 4 }).notNull(),
  enteredUnitCode: varchar('entered_unit_code', { length: 10 }).notNull(),
  baseQty: numeric('base_qty', { precision: 18, scale: 4 }).notNull(),
  valuationRate: numeric('valuation_rate', { precision: 18, scale: 4 }).default('0').notNull(),
  lineValue: numeric('line_value', { precision: 18, scale: 2 }).default('0').notNull(),
  boqItemId: uuid('boq_item_id').references(() => boqItems.id),
  chainageText: varchar('chainage_text', { length: 100 }),
  purpose: text('purpose'),
});

// --- Wastage Vouchers (MAT-07) ---
export const wastageVouchers = pgTable('wastage_vouchers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull().unique(),
  locationId: uuid('location_id').references(() => locations.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 30 }).default('PENDING_APPROVAL').notNull(), // Requires approval
  reasonDescription: text('reason_description').notNull(),
  totalValue: numeric('total_value', { precision: 18, scale: 2 }).default('0').notNull(),
  remarks: text('remarks'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const wastageVoucherLines = pgTable('wastage_voucher_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  wastageId: uuid('wastage_id').references(() => wastageVouchers.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  enteredQty: numeric('entered_qty', { precision: 18, scale: 4 }).notNull(),
  enteredUnitCode: varchar('entered_unit_code', { length: 10 }).notNull(),
  baseQty: numeric('base_qty', { precision: 18, scale: 4 }).notNull(),
  valuationRate: numeric('valuation_rate', { precision: 18, scale: 4 }).default('0').notNull(),
  lineValue: numeric('line_value', { precision: 18, scale: 2 }).default('0').notNull(),
  reason: text('reason').notNull(),
});

// --- Physical Stock Adjustment Vouchers (MAT-08) ---
export const stockAdjustments = pgTable('stock_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull().unique(),
  locationId: uuid('location_id').references(() => locations.id).notNull(),
  txnDate: varchar('txn_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 30 }).default('PENDING_APPROVAL').notNull(), // Requires approval
  remarks: text('remarks'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const stockAdjustmentLines = pgTable('stock_adjustment_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  adjustmentId: uuid('adjustment_id').references(() => stockAdjustments.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  systemQty: numeric('system_qty', { precision: 18, scale: 4 }).notNull(),
  physicalQty: numeric('physical_qty', { precision: 18, scale: 4 }).notNull(),
  varianceQty: numeric('variance_qty', { precision: 18, scale: 4 }).notNull(), // positive = surplus, negative = shortage
  enteredUnitCode: varchar('entered_unit_code', { length: 10 }).notNull(),
  baseVarianceQty: numeric('base_variance_qty', { precision: 18, scale: 4 }).notNull(),
  valuationRate: numeric('valuation_rate', { precision: 18, scale: 4 }).default('0').notNull(),
  varianceValue: numeric('variance_value', { precision: 18, scale: 2 }).default('0').notNull(),
  reason: text('reason').notNull(),
});
