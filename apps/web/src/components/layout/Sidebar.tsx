import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  PackageCheck,
  ArrowRightLeft,
  Flame,
  Truck,
  Users,
  Receipt,
  Factory,
  FileSpreadsheet,
  PieChart,
  BellRing,
  ClipboardList,
  Database,
  Building2,
  AlertOctagon,
  HardHat,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

export type NavItemKey =
  | 'dashboard'
  | 'po'
  | 'grn'
  | 'transfers'
  | 'consumption'
  | 'adjustments'
  | 'approvals'
  | 'reports'
  | 'masters'
  | 'fuel'
  | 'vehicles'
  | 'labour'
  | 'expenses'
  | 'plant'
  | 'contract'
  | 'costing'
  | 'alerts';

interface SidebarProps {
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
}) => {
  const { user } = useAuth();

  const navGroups = [
    {
      title: 'Core Operations',
      items: [
        { key: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
        { key: 'consumption', label: 'Site Consumption', icon: HardHat, tag: 'MAT-04' },
        { key: 'po', label: 'Purchase Orders', icon: ShoppingCart, tag: 'PUR-03' },
        { key: 'grn', label: 'Goods Receipt (GRN)', icon: PackageCheck, tag: 'PUR-04' },
        { key: 'transfers', label: 'Store Transfers', icon: ArrowRightLeft, tag: 'STR-01' },
        { key: 'adjustments', label: 'Wastage & Adj.', icon: AlertOctagon, tag: 'MAT-07' },
      ],
    },
    {
      title: 'Reports & Governance',
      items: [
        { key: 'approvals', label: 'Approvals Inbox', icon: ShieldCheck, tag: 'APR-01' },
        { key: 'reports', label: 'Registers & Ledgers', icon: FileSpreadsheet, tag: 'MAT-06' },
        { key: 'masters', label: 'Master Data', icon: Database, tag: 'MST-01' },
      ],
    },
    {
      title: 'Module Skeletons',
      items: [
        { key: 'fuel', label: 'Fuel & Bowser', icon: Flame, tag: 'FUEL-07' },
        { key: 'vehicles', label: 'Fleet & Logbooks', icon: Truck, tag: 'MST-10' },
        { key: 'labour', label: 'Labour & Wages', icon: Users, tag: 'LAB-09' },
        { key: 'expenses', label: 'Petty Cash & Imprest', icon: Receipt, tag: 'MST-12' },
        { key: 'plant', label: 'Hot Mix & Concrete', icon: Factory, tag: 'PLT-13' },
        { key: 'contract', label: 'BOQ & RA Bills', icon: ClipboardList, tag: 'BIL-06' },
        { key: 'costing', label: 'Site Cost Sheet', icon: PieChart, tag: 'CST-01' },
        { key: 'alerts', label: 'Alert Engines', icon: BellRing, tag: 'ALT-01' },
      ],
    },
  ];

  return (
    <aside
      className={`bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 z-20 shrink-0 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center font-bold text-slate-950 shrink-0 shadow-md shadow-amber-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <div className="font-semibold text-sm tracking-wide text-slate-100 uppercase">
                Arohon Infra ERP
              </div>
              <div className="text-[11px] text-amber-400 font-mono tracking-tight">
                Roads & Civil Works
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onSelectTab(item.key as NavItemKey)}
                  title={item.label}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                  {!isCollapsed && (
                    <div className="flex-1 flex items-center justify-between truncate">
                      <span className="truncate">{item.label}</span>
                      {item.tag && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {item.tag}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* User / Scoped Footprint */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/50">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-400">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="truncate flex-1">
              <div className="text-xs font-medium text-slate-200 truncate">{user?.fullName || 'User'}</div>
              <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                {user?.roles?.[0] || 'SITE_ENGINEER'}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-amber-400">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
        )}
      </div>
    </aside>
  );
};
