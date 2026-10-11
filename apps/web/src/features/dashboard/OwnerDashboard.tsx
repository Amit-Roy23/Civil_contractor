import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatINR, formatIndianDate } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  MapPin,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  CalendarCheck,
  CheckCircle2,
  HardHat,
} from 'lucide-react';

export const OwnerDashboard: React.FC<{ onNavigate: (tab: any) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const isSiteEngineer = user?.roles?.includes('SITE_ENGINEER');

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['owner-dashboard'],
    queryFn: () => api.get<any>('/dashboard/owner'),
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mr-3"></div>
        Loading live operations dashboard...
      </div>
    );
  }

  const {
    company,
    totalStockValue,
    sites = [],
    plants = [],
    lowStockAlerts = [],
    recentMovements = [],
  } = dashboardData || {};

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/30 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-100">
              {company?.name || 'Arohon Infrastructure Projects'}
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
              FY 2026-27 Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time project inventory, multi-site material logistics, and cost governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('consumption')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/20"
          >
            <HardHat className="w-4 h-4" />
            <span>+ Daily Consumption</span>
          </button>
          <button
            onClick={() => onNavigate('reports')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all"
          >
            <span>Stock Register</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Site Engineer Today's Checklist (Section 8) */}
      {isSiteEngineer && (
        <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
              <CalendarCheck className="w-4 h-4" />
              <span>Today's Site Engineer Checklist — NH-31 Four-Laning</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Scoped Location: ST-NH31</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => onNavigate('consumption')}
              className="p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 hover:border-amber-500/50 text-left transition-all"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>1. Material Consumption</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Log daily cement, TMT rebar, and aggregate pour.
              </p>
            </button>
            <button
              onClick={() => onNavigate('transfers')}
              className="p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 hover:border-amber-500/50 text-left transition-all"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>2. Confirm In-Transit Receipts</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Acknowledge cement transfer from Central Godown.
              </p>
            </button>
            <button
              onClick={() => onNavigate('fuel')}
              className="p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 hover:border-amber-500/50 text-left transition-all"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>3. Daily Bowser Fuel Issue</span>
                <Clock className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Record excavator and tipper diesel dispenses.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Key Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Company Inventory</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-2">
            {formatINR(totalStockValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Valuation: Weighted Average (MAT-11)</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Project Sites</span>
            <MapPin className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{sites.length} Sites</div>
          <div className="text-[11px] text-emerald-400 mt-1">All sites operational</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Production Plants</span>
            <Package className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">
            {plants.length} Hot Mix Plant
          </div>
          <div className="text-[11px] text-slate-400 mt-1">120 TPH Sonarpur Batching</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Low Stock Triggers</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2">
            {lowStockAlerts.length} Items
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Automated BullMQ Scan (ALT-01)</div>
        </div>
      </div>

      {/* Site Cards Wired to Real Stock Values (Section 7 Dashboard Requirement) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Site-Wise Stock Valuation & Inventory Footprint
          </h2>
          <span className="text-xs text-slate-400">Section 7 / 4.1 Locations Engine</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sites.map((site: any) => (
            <div
              key={site.id}
              className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-semibold">
                    {site.code}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" title="Active"></span>
                </div>
                <h3 className="font-semibold text-slate-100 mt-2 text-sm">{site.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{site.client || 'NHAI / PWD'}</p>

                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Store Yard:</span>
                    <span className="text-slate-200 font-medium">{site.storeCode || 'ST-01'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Current Stock Value:</span>
                    <span className="text-amber-400 font-mono font-semibold">
                      {formatINR(site.currentStockValue)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Contract: {formatINR(site.contractValue)}</span>
                <button
                  onClick={() => onNavigate('reports')}
                  className="text-amber-400 hover:text-amber-300 font-medium"
                >
                  View Ledger &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Low Stock Alerts & Recent Ledger Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Watch */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                Material Reorder Alert (ALT-01)
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Min Threshold Rule</span>
          </div>

          <div className="space-y-2">
            {lowStockAlerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                All materials are above reorder threshold.
              </div>
            ) : (
              lowStockAlerts.map((alert: any, idx: number) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-medium text-slate-200">{alert.itemName}</div>
                    <div className="text-[11px] text-slate-400">
                      Location: {alert.locationName} ({alert.locationCode})
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-rose-400 font-semibold">
                      {alert.currentQty} {alert.unit}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Reorder: {alert.reorderLevel} {alert.unit}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Append-Only Stock Movements */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                Recent Stock Ledger Movements (Append-Only)
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">SEC-03 Traceable</span>
          </div>

          <div className="space-y-2">
            {recentMovements.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No recent movements recorded.
              </div>
            ) : (
              recentMovements.slice(0, 5).map((txn: any) => (
                <div
                  key={txn.id}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-200">{txn.voucherNo}</div>
                    <div className="text-[11px] text-slate-400">
                      {txn.itemName} &bull; {formatIndianDate(txn.txnDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`font-mono font-semibold ${
                        parseFloat(txn.qtyIn) > 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {parseFloat(txn.qtyIn) > 0 ? `+${txn.qtyIn}` : `-${txn.qtyOut}`} {txn.unit}
                    </span>
                    <div className="text-[10px] text-slate-400">{txn.voucherType}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
