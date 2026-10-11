import { useState } from 'react';
import { ArrowUpRight, Boxes, ClipboardCheck, Factory, FileSpreadsheet, HardHat, PieChart, Receipt, ShoppingCart, Truck, Warehouse } from 'lucide-react';
import { useSession } from '../data/session';
import type { ModuleKey } from '../data/types';
import { Card, PageHeader } from '../components/ui/core';
import { SearchBox } from '../components/ui/fields';
import { navigate } from '../lib/router';

/** Report catalogue (11.2) — every report opens with date / site / plant / material / vehicle / supplier filters and exports to Excel & PDF. */
const AREAS: Array<{ area: string; icon: any; module: ModuleKey; reports: Array<[string, string, string]> }> = [
  { area: 'Site stock', icon: Boxes, module: 'inventory', reports: [['Stock register', 'Opening, received, consumed, transferred, returned, wasted, closing — qty & value', '/inventory/stock'], ['Item ledger', 'Every transaction with running balance', '/inventory/ledger'], ['Daily material report', 'Per site, per day', '/inventory/daily'], ['Materials in transit', 'Awaiting receipt confirmation', '/inventory/transit'], ['Theoretical vs actual', 'Recipe-based consumption check', '/inventory/variance'], ['Tools & tackles balance', 'Returnables at each site', '/inventory/tools']] },
  { area: 'Central store', icon: Warehouse, module: 'purchase', reports: [['Stock statement & reorder list', 'With minimum level flags', '/purchase/central'], ['Stock ageing', 'Not moved in 90 / 180 / 365 days', '/purchase/central'], ['Issue register', 'By site / plant / vehicle', '/purchase/central']] },
  { area: 'Purchase', icon: ShoppingCart, module: 'purchase', reports: [['PO register & pending PO', 'Ordered vs received', '/purchase/orders'], ['GRN register', 'With rejections', '/purchase/grn'], ['Purchase register (GST)', 'Site / material / supplier-wise, GSTR-2B', '/purchase/register'], ['Supplier ledger', 'POs, invoices, payments, debit notes', '/purchase/suppliers'], ['Payables ageing', '0–30, 31–60, 61–90, 90+ days', '/purchase/payables']] },
  { area: 'Labour', icon: HardHat, module: 'labour', reports: [['Daily labour report', 'Trade-wise headcount & cost', '/labour/daily'], ['Attendance register', 'Monthly grid per worker', '/labour/attendance'], ['Wage sheet & payslips', 'Weekly / fortnightly / monthly', '/labour/wages'], ['Contractor & sub-contractor ledgers', 'Billed, paid, advances, balance', '/labour/contractors'], ['Labour cost by site', 'Monthly', '/labour/daily']] },
  { area: 'Expenses', icon: Receipt, module: 'expenses', reports: [['Petty cash book', 'Site-wise with balance in hand', '/expenses/petty-cash'], ['Expense register', 'By head and site, date range', '/expenses/register']] },
  { area: 'Fuel & vehicles', icon: Truck, module: 'fleet', reports: [['Tank / bowser stock', 'With dip variance', '/fleet/tanks'], ['Fuel issue register', 'Every fill with meter reading', '/fleet/fuel'], ['Consumption vs standard', 'By vehicle, driver, site, month', '/fleet/efficiency'], ['Logbook & idle hours', 'Trips, material carried, idle reasons', '/fleet/logbook'], ['Hire bills', 'From logbook & terms', '/fleet/hire'], ['Maintenance history', 'Service, job cards, tyres', '/fleet/maintenance'], ['Document expiry', '30 / 15 / 7 day alerts', '/fleet/documents'], ['Cost per vehicle', 'Per km, hour, trip and MT', '/fleet/cost']] },
  { area: 'Plant', icon: Factory, module: 'plant', reports: [['Raw-material ledger', 'Plant stock statement', '/plant/raw-material'], ['Daily production report', 'Product, qty, hours, power, fuel', '/plant/production'], ['Dispatch register', 'Plant-wise and site-wise', '/plant/dispatch'], ['Site-wise raw-material allocation', 'Bitumen / aggregate / cement per site', '/plant/allocation'], ['Plant cost sheet', 'Cost per MT / cum', '/plant/cost'], ['Plant reconciliation', 'Unexplained loss per material', '/plant/reconciliation']] },
  { area: 'Contract', icon: ClipboardCheck, module: 'contract', reports: [['BOQ progress', '% complete & balance', '/contract/boq'], ['RA bill register', 'Gross, deductions, net, status', '/contract/bills'], ['Client ledger & receivables ageing', 'Outstanding by client', '/contract/receivables']] },
  { area: 'Costing', icon: PieChart, module: 'contract', reports: [['Site cost sheet', 'All cost heads from source modules', '/contract/costing'], ['Budget vs actual', 'Per site per cost head', '/contract/budget'], ['Site profitability', 'Work done vs billed vs cost', '/contract/costing'], ['Company-wide summary', 'All sites side by side', '/contract/costing?site='], ['Cost per BOQ item', 'Direct cost vs BOQ rate', '/contract/boq-cost']] },
];

export default function Reports() {
  const s = useSession();
  const [q, setQ] = useState('');
  const t = q.toLowerCase();
  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Every report filters by date range, site, plant, material, vehicle and supplier, and exports to Excel and PDF."
        tags={['11.2', 'TEC-07']}
        actions={<SearchBox value={q} onChange={setQ} placeholder="Find a report…" className="w-72" />}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
        {AREAS.filter((a) => s.can(a.module)).map((a) => {
          const reps = a.reports.filter(([title, desc]) => !t || `${a.area} ${title} ${desc}`.toLowerCase().includes(t));
          if (!reps.length) return null;
          const I = a.icon;
          return (
            <Card key={a.area} className="p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-strong flex items-center justify-center"><I className="w-[18px] h-[18px]" /></span>
                <h3 className="font-semibold">{a.area}</h3>
              </div>
              <div className="space-y-1">
                {reps.map(([title, desc, path]) => (
                  <button key={title} onClick={() => navigate(path)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left hover:bg-surface-2 group">
                    <FileSpreadsheet className="w-4 h-4 text-good shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{title}</span>
                      <span className="block text-[11px] text-muted truncate">{desc}</span>
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
