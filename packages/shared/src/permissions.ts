// RBAC Permission Keys & Definitions (ROLE-01, ROLE-02, ROLE-03)

export const PERMISSION_KEYS = {
  // Special Keys
  RATES_VIEW: 'rates.view',
  STOCK_OVERRIDE_NEGATIVE: 'stock.override_negative',
  BACKDATE_BEYOND_LIMIT: 'backdate.beyond_limit',
  PERIOD_EDIT_LOCKED: 'period.edit_locked',

  // Masters
  MASTERS_VIEW: 'masters.view',
  MASTERS_CREATE: 'masters.create',
  MASTERS_EDIT: 'masters.edit',
  MASTERS_DELETE: 'masters.delete',

  // Inventory & Stores
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_EDIT: 'inventory.edit',
  INVENTORY_CANCEL: 'inventory.cancel',
  INVENTORY_APPROVE: 'inventory.approve',

  // Purchase
  PURCHASE_VIEW: 'purchase.view',
  PURCHASE_CREATE: 'purchase.create',
  PURCHASE_EDIT: 'purchase.edit',
  PURCHASE_CANCEL: 'purchase.cancel',
  PURCHASE_APPROVE: 'purchase.approve',

  // Fuel
  FUEL_VIEW: 'fuel.view',
  FUEL_CREATE: 'fuel.create',
  FUEL_EDIT: 'fuel.edit',
  FUEL_CANCEL: 'fuel.cancel',

  // Vehicles & Machinery
  VEHICLES_VIEW: 'vehicles.view',
  VEHICLES_CREATE: 'vehicles.create',
  VEHICLES_EDIT: 'vehicles.edit',
  VEHICLES_CANCEL: 'vehicles.cancel',

  // Labour
  LABOUR_VIEW: 'labour.view',
  LABOUR_CREATE: 'labour.create',
  LABOUR_EDIT: 'labour.edit',
  LABOUR_APPROVE: 'labour.approve',

  // Expenses & Petty Cash
  EXPENSES_VIEW: 'expenses.view',
  EXPENSES_CREATE: 'expenses.create',
  EXPENSES_EDIT: 'expenses.edit',
  EXPENSES_APPROVE: 'expenses.approve',

  // Plant
  PLANT_VIEW: 'plant.view',
  PLANT_CREATE: 'plant.create',
  PLANT_EDIT: 'plant.edit',

  // Contracts & BOQ
  CONTRACTS_VIEW: 'contracts.view',
  CONTRACTS_CREATE: 'contracts.create',
  CONTRACTS_EDIT: 'contracts.edit',

  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  // Approvals & Audit
  APPROVALS_MANAGE: 'approvals.manage',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

// Default permissions mapped to standard seed roles
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: Object.values(PERMISSION_KEYS),

  ACCOUNTANT: [
    PERMISSION_KEYS.RATES_VIEW,
    PERMISSION_KEYS.MASTERS_VIEW,
    PERMISSION_KEYS.INVENTORY_VIEW,
    PERMISSION_KEYS.PURCHASE_VIEW,
    PERMISSION_KEYS.PURCHASE_CREATE,
    PERMISSION_KEYS.PURCHASE_EDIT,
    PERMISSION_KEYS.PURCHASE_APPROVE,
    PERMISSION_KEYS.FUEL_VIEW,
    PERMISSION_KEYS.VEHICLES_VIEW,
    PERMISSION_KEYS.LABOUR_VIEW,
    PERMISSION_KEYS.EXPENSES_VIEW,
    PERMISSION_KEYS.EXPENSES_APPROVE,
    PERMISSION_KEYS.PLANT_VIEW,
    PERMISSION_KEYS.CONTRACTS_VIEW,
    PERMISSION_KEYS.REPORTS_VIEW,
    PERMISSION_KEYS.REPORTS_EXPORT,
    PERMISSION_KEYS.AUDIT_VIEW,
  ],

  STORE_KEEPER: [
    // Note: Store Keeper lacks rates.view by default (ROLE-03)
    PERMISSION_KEYS.MASTERS_VIEW,
    PERMISSION_KEYS.INVENTORY_VIEW,
    PERMISSION_KEYS.INVENTORY_CREATE,
    PERMISSION_KEYS.INVENTORY_EDIT,
    PERMISSION_KEYS.PURCHASE_VIEW,
    PERMISSION_KEYS.REPORTS_VIEW,
  ],

  SITE_ENGINEER: [
    // Note: Site Engineer is strictly location scoped (ROLE-02) and lacks rates.view by default
    PERMISSION_KEYS.MASTERS_VIEW,
    PERMISSION_KEYS.INVENTORY_VIEW,
    PERMISSION_KEYS.INVENTORY_CREATE, // Daily consumption & receipt confirmation
    PERMISSION_KEYS.LABOUR_VIEW,
    PERMISSION_KEYS.LABOUR_CREATE,
    PERMISSION_KEYS.EXPENSES_VIEW,
    PERMISSION_KEYS.EXPENSES_CREATE,
    PERMISSION_KEYS.VEHICLES_VIEW,
    PERMISSION_KEYS.VEHICLES_CREATE,
    PERMISSION_KEYS.REPORTS_VIEW,
  ],

  PLANT_INCHARGE: [
    PERMISSION_KEYS.MASTERS_VIEW,
    PERMISSION_KEYS.INVENTORY_VIEW,
    PERMISSION_KEYS.INVENTORY_CREATE,
    PERMISSION_KEYS.PLANT_VIEW,
    PERMISSION_KEYS.PLANT_CREATE,
    PERMISSION_KEYS.REPORTS_VIEW,
  ],

  FLEET_INCHARGE: [
    PERMISSION_KEYS.MASTERS_VIEW,
    PERMISSION_KEYS.VEHICLES_VIEW,
    PERMISSION_KEYS.VEHICLES_CREATE,
    PERMISSION_KEYS.VEHICLES_EDIT,
    PERMISSION_KEYS.FUEL_VIEW,
    PERMISSION_KEYS.FUEL_CREATE,
    PERMISSION_KEYS.REPORTS_VIEW,
  ],
};
