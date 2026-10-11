import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Audit Logs (ROLE-05)
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id'),
  userId: uuid('user_id'),
  username: varchar('username', { length: 100 }),
  entity: varchar('entity', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }).notNull(),
  action: varchar('action', { length: 20 }).notNull(), // CREATE, UPDATE, DELETE, STATUS_CHANGE
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  reason: text('reason'),
  ip: varchar('ip', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Users
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }),
  mobile: varchar('mobile', { length: 20 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),
  isTotpEnabled: boolean('is_totp_enabled').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Roles (ROLE-01)
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Role Permissions
export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  roleId: uuid('role_id').references(() => roles.id).notNull(),
  permissionKey: varchar('permission_key', { length: 100 }).notNull(),
});

// User Roles
export const userRoles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  roleId: uuid('role_id').references(() => roles.id).notNull(),
});

// User Location Scope (ROLE-02)
export const userLocationScopes = pgTable('user_location_scopes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  siteId: uuid('site_id'), // if assigned to site
  locationId: uuid('location_id'), // if assigned directly to a location
  plantId: uuid('plant_id'), // if assigned to plant
});

// Financial Years (SEC-04)
export const financialYears = pgTable('financial_years', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  code: varchar('code', { length: 20 }).notNull(), // e.g. 2026-2027
  startDate: varchar('start_date', { length: 10 }).notNull(), // 2026-04-01
  endDate: varchar('end_date', { length: 10 }).notNull(), // 2027-03-31
  isClosed: boolean('is_closed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Period Locks (SEC-04)
export const periodLocks = pgTable('period_locks', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  financialYearId: uuid('financial_year_id').references(() => financialYears.id).notNull(),
  lockedUntilDate: varchar('locked_until_date', { length: 10 }).notNull(), // YYYY-MM-DD
  reason: text('reason'),
  lockedBy: uuid('locked_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Company Settings (MAT-11, MAT-14, APR-03)
export const companySettings = pgTable('company_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().unique(),
  valuationMethod: varchar('valuation_method', { length: 30 }).default('WEIGHTED_AVERAGE').notNull(),
  maxBackdateDays: integer('max_backdate_days').default(3).notNull(),
  includePendingInReports: boolean('include_pending_in_reports').default(false).notNull(),
  consumptionTolerancePercent: integer('consumption_tolerance_percent').default(5).notNull(),
  fuelVarianceTolerancePercent: integer('fuel_variance_tolerance_percent').default(10).notNull(),
  attendanceLockTime: varchar('attendance_lock_time', { length: 10 }).default('12:00').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Voucher Series (Auto-numbering)
export const voucherSeries = pgTable(
  'voucher_series',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    voucherType: varchar('voucher_type', { length: 50 }).notNull(),
    prefix: varchar('prefix', { length: 20 }).notNull(), // e.g. GRN
    locationPrefix: varchar('location_prefix', { length: 20 }).notNull(), // e.g. CS
    financialYearCode: varchar('financial_year_code', { length: 20 }).notNull(), // e.g. 26-27
    currentNumber: integer('current_number').default(0).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_voucher_series_unique').on(
      table.companyId,
      table.voucherType,
      table.locationPrefix,
      table.financialYearCode,
    ),
  ],
);

// Approval Rules (APR-01)
export const approvalRules = pgTable('approval_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  voucherType: varchar('voucher_type', { length: 50 }).notNull(),
  minAmount: varchar('min_amount', { length: 30 }).default('0').notNull(),
  locationId: uuid('location_id'),
  requiredRoleId: uuid('required_role_id').references(() => roles.id).notNull(),
  stepOrder: integer('step_order').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

// Approval Requests (APR-02)
export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  voucherType: varchar('voucher_type', { length: 50 }).notNull(),
  voucherId: uuid('voucher_id').notNull(),
  voucherNo: varchar('voucher_no', { length: 100 }).notNull(),
  requestedBy: uuid('requested_by').references(() => users.id).notNull(),
  approverRoleId: uuid('approver_role_id').references(() => roles.id).notNull(),
  action: varchar('action', { length: 20 }).default('PENDING').notNull(), // PENDING, APPROVED, REJECTED, SENT_BACK
  actionBy: uuid('action_by').references(() => users.id),
  actionRemarks: text('action_remarks'),
  actionAt: timestamp('action_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// In-app Notifications (APR-02, ALT-01)
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  message: text('message').notNull(),
  link: varchar('link', { length: 255 }),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Generic Attachments (Section 4.8)
export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  s3Key: varchar('s3_key', { length: 255 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
