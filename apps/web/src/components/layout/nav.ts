import type { LucideIcon } from 'lucide-react';
import {
  BellRing,
  Boxes,
  ClipboardCheck,
  Database,
  Factory,
  FileSpreadsheet,
  HardHat,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import type { ModuleKey } from '../../data/types';

export interface NavTab {
  key: string;
  label: string;
  hint?: string;
}
export interface NavModule {
  key: ModuleKey;
  path: string;
  label: string;
  short: string;
  icon: LucideIcon;
  group: 'Overview' | 'Operations' | 'Commercial' | 'Control';
  tabs?: NavTab[];
}

export const NAV: NavModule[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, group: 'Overview' },
  { key: 'approvals', path: '/approvals', label: 'Approvals', short: 'Approve', icon: ShieldCheck, group: 'Overview' },
  { key: 'alerts', path: '/alerts', label: 'Alerts', short: 'Alerts', icon: BellRing, group: 'Overview' },
  {
    key: 'inventory', path: '/inventory', label: 'Site Inventory', short: 'Stock', icon: Boxes, group: 'Operations',
    tabs: [
      { key: 'stock', label: 'Stock register', hint: 'Opening, received, consumed, closing per site' },
      { key: 'transactions', label: 'Transactions', hint: 'Receipts, consumption, transfers, wastage' },
      { key: 'ledger', label: 'Item ledger', hint: 'Every movement with running balance' },
      { key: 'transit', label: 'In transit', hint: 'Material awaiting receipt confirmation' },
      { key: 'variance', label: 'Theoretical vs actual', hint: 'Recipe-based consumption check' },
      { key: 'tools', label: 'Tools & tackles', hint: 'Returnable items at sites' },
      { key: 'daily', label: 'Daily material report' },
    ],
  },
  {
    key: 'purchase', path: '/purchase', label: 'Store & Purchase', short: 'Purchase', icon: ShoppingCart, group: 'Operations',
    tabs: [
      { key: 'central', label: 'Central store', hint: 'Stock, reorder & ageing' },
      { key: 'requisitions', label: 'Requisitions' },
      { key: 'quotations', label: 'Quotations' },
      { key: 'orders', label: 'Purchase orders' },
      { key: 'grn', label: 'GRN' },
      { key: 'invoices', label: 'Invoices' },
      { key: 'payments', label: 'Payments' },
      { key: 'debit-notes', label: 'Debit notes' },
      { key: 'suppliers', label: 'Supplier ledger' },
      { key: 'payables', label: 'Payables ageing' },
      { key: 'register', label: 'Purchase register (GST)' },
    ],
  },
  {
    key: 'labour', path: '/labour', label: 'Labour', short: 'Labour', icon: HardHat, group: 'Operations',
    tabs: [
      { key: 'attendance', label: 'Attendance' },
      { key: 'daily', label: 'Daily labour report' },
      { key: 'wages', label: 'Wage sheets' },
      { key: 'advances', label: 'Advances' },
      { key: 'contractors', label: 'Contractor ledgers' },
      { key: 'subcontract', label: 'Sub-contract work' },
      { key: 'compliance', label: 'Compliance' },
    ],
  },
  {
    key: 'expenses', path: '/expenses', label: 'Expenses & Petty Cash', short: 'Expenses', icon: Receipt, group: 'Operations',
    tabs: [
      { key: 'entries', label: 'Expenses' },
      { key: 'petty-cash', label: 'Petty cash book' },
      { key: 'overheads', label: 'HO overheads' },
      { key: 'register', label: 'Expense register' },
    ],
  },
  {
    key: 'fleet', path: '/fleet', label: 'Vehicles & Machinery', short: 'Fleet', icon: Truck, group: 'Operations',
    tabs: [
      { key: 'overview', label: 'Fleet' },
      { key: 'fuel', label: 'Fuel issue' },
      { key: 'tanks', label: 'Tank & bowser' },
      { key: 'logbook', label: 'Logbook' },
      { key: 'efficiency', label: 'Fuel efficiency' },
      { key: 'hire', label: 'Hire bills' },
      { key: 'maintenance', label: 'Maintenance' },
      { key: 'documents', label: 'Documents' },
      { key: 'cost', label: 'Vehicle cost' },
    ],
  },
  {
    key: 'plant', path: '/plant', label: 'Plants', short: 'Plant', icon: Factory, group: 'Operations',
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'production', label: 'Production' },
      { key: 'dispatch', label: 'Dispatch' },
      { key: 'raw-material', label: 'Raw-material ledger' },
      { key: 'allocation', label: 'Site-wise allocation' },
      { key: 'cost', label: 'Plant cost sheet' },
      { key: 'reconciliation', label: 'Reconciliation' },
    ],
  },
  {
    key: 'contract', path: '/contract', label: 'Contracts & Billing', short: 'Billing', icon: ClipboardCheck, group: 'Commercial',
    tabs: [
      { key: 'costing', label: 'Site profitability' },
      { key: 'boq', label: 'BOQ & progress' },
      { key: 'measurements', label: 'Measurement book' },
      { key: 'bills', label: 'RA bills' },
      { key: 'receivables', label: 'Client ledger' },
      { key: 'budget', label: 'Budget vs actual' },
      { key: 'boq-cost', label: 'Cost per BOQ item' },
    ],
  },
  { key: 'reports', path: '/reports', label: 'Reports', short: 'Reports', icon: FileSpreadsheet, group: 'Commercial' },
  {
    key: 'masters', path: '/masters', label: 'Masters', short: 'Masters', icon: Database, group: 'Control',
    tabs: [
      { key: 'sites', label: 'Sites' },
      { key: 'materials', label: 'Materials' },
      { key: 'suppliers', label: 'Suppliers' },
      { key: 'clients', label: 'Clients' },
      { key: 'subcons', label: 'Contractors' },
      { key: 'workers', label: 'Workers' },
      { key: 'vehicles', label: 'Vehicles' },
      { key: 'stores', label: 'Stores' },
      { key: 'plants', label: 'Plants' },
      { key: 'recipes', label: 'Recipes' },
      { key: 'boq', label: 'BOQ items' },
      { key: 'fuel-sources', label: 'Fuel sources' },
      { key: 'expense-heads', label: 'Expense heads' },
      { key: 'units', label: 'Units' },
      { key: 'company', label: 'Company' },
    ],
  },
  {
    key: 'admin', path: '/admin', label: 'Administration', short: 'Admin', icon: Settings, group: 'Control',
    tabs: [
      { key: 'users', label: 'Users' },
      { key: 'roles', label: 'Roles & permissions' },
      { key: 'settings', label: 'Settings' },
      { key: 'audit', label: 'Audit log' },
    ],
  },
];

export const navByPath = (seg: string | undefined) => NAV.find((n) => (seg ? n.path === `/${seg}` : n.path === '/'));
