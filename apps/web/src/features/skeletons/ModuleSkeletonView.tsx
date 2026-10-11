import React from 'react';
import {
  Flame,
  Truck,
  Users,
  Receipt,
  Factory,
  ClipboardList,
  PieChart,
  BellRing,
  Code2,
  Table,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { NavItemKey } from '../../components/layout/Sidebar';

interface ModuleSkeletonViewProps {
  moduleKey: NavItemKey;
}

export const ModuleSkeletonView: React.FC<ModuleSkeletonViewProps> = ({ moduleKey }) => {
  const metaMap: Record<
    string,
    {
      title: string;
      reqId: string;
      tagline: string;
      icon: any;
      architectureSummary: string;
      drizzleSchemaSnippet: string;
      mockRecords: Array<Record<string, string>>;
      columns: string[];
    }
  > = {
    fuel: {
      title: 'Fuel Management & Bowser Logistics',
      reqId: 'FUEL-07 / MST-11',
      tagline: 'Movable Bowser locations, fuel purchases, dip readings, and KMPL / LPH variance validation.',
      icon: Flame,
      architectureSummary:
        'A bowser is a movable location with `current_site_id`. Tanker purchase posts to stock ledger. Fuel dispense to vehicle calculates expected litres = (km / KMPL) or (hours * LPH) and captures variance between full-tank fills (FUEL-07).',
      drizzleSchemaSnippet: `// Fuel Loads (FUEL-07)
export const fuelLoads = pgTable('fuel_loads', {
  id: uuid('id').primaryKey(),
  bowserLocationId: uuid('bowser_location_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  dispensedLitres: numeric('dispensed_litres', { precision: 18, scale: 4 }).notNull(),
  odometerReading: numeric('odometer_reading', { precision: 12, scale: 2 }),
  hourMeterReading: numeric('hour_meter_reading', { precision: 12, scale: 2 }),
  expectedLitres: numeric('expected_litres', { precision: 18, scale: 4 }),
  varianceLitres: numeric('variance_litres', { precision: 18, scale: 4 }),
  isFullTankFill: boolean('is_full_tank_fill').default(true),
});`,
      columns: ['Date', 'Bowser Location', 'Vehicle / Machine', 'Litres Dispensed', 'Meter Reading', 'Variance Litres'],
      mockRecords: [
        { Date: '18-04-2026', 'Bowser Location': 'BOWSER-01 (NH-31)', 'Vehicle / Machine': 'HYUNDAI 210 Excavator (EXC-02)', 'Litres Dispensed': '180.00 Ltr', 'Meter Reading': '3,450.5 Hrs', 'Variance Litres': '-3.50 Ltr (Normal)' },
        { Date: '19-04-2026', 'Bowser Location': 'BOWSER-01 (NH-31)', 'Vehicle / Machine': 'TATA 2518 Tipper (TIP-09)', 'Litres Dispensed': '65.00 Ltr', 'Meter Reading': '45,210 Km', 'Variance Litres': '+1.20 Ltr (Efficient)' },
      ],
    },
    vehicles: {
      title: 'Fleet Logbook & Machine Maintenance',
      reqId: 'MST-10 / VEH-01',
      tagline: 'Daily logbook with multi-site hour split, hire terms, job cards, tyre tracking, and document expiry scans.',
      icon: Truck,
      architectureSummary:
        'Supports both company-owned and third-party hired fleet. Tracks daily hour/km logs split across sites. BullMQ scans RC, Fitness, Insurance, Pollution, and Road Tax expiry 30 days in advance (ALT-05).',
      drizzleSchemaSnippet: `// Vehicles & Machines (MST-10)
export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey(),
  registrationNumber: varchar('registration_number').notNull(),
  assetType: varchar('asset_type').notNull(), // EXCAVATOR, TIPPER, GRADER, ROLLER
  ownership: varchar('ownership').notNull(), // OWNED, HIRED
  insuranceExpiryDate: date('insurance_expiry_date'),
  fitnessExpiryDate: date('fitness_expiry_date'),
  standardKmPerLitre: numeric('standard_km_per_litre'),
  standardLitresPerHour: numeric('standard_litres_per_hour'),
});`,
      columns: ['Asset Code', 'Registration No', 'Type', 'Ownership', 'Insurance Expiry', 'Fitness Expiry', 'Status'],
      mockRecords: [
        { 'Asset Code': 'EXC-01', 'Registration No': 'WB-19-J-2201', Type: 'Crawler Excavator (21T)', Ownership: 'OWNED', 'Insurance Expiry': '15-11-2026', 'Fitness Expiry': '20-10-2026', Status: 'ACTIVE' },
        { 'Asset Code': 'TIP-04', 'Registration No': 'WB-29-B-1144', Type: '10-Wheel Tipper (16 CUM)', Ownership: 'HIRED', 'Insurance Expiry': '04-08-2026', 'Fitness Expiry': '18-07-2026', Status: 'ACTIVE' },
      ],
    },
    labour: {
      title: 'Labour Workforce & Wage Administration',
      reqId: 'MST-09 / LAB-09',
      tagline: 'Per-worker and headcount-by-trade attendance, advances, wage runs, and subcontractor work orders.',
      icon: Users,
      architectureSummary:
        'Masked Aadhaar storage for privacy (MST-09). Daily attendance lock time enforcement. Posts wage sheets to cost ledger under LABOUR head and contractor payments to party ledger.',
      drizzleSchemaSnippet: `// Labour Attendance (LAB-01 / LAB-09)
export const labourAttendances = pgTable('labour_attendances', {
  id: uuid('id').primaryKey(),
  siteId: uuid('site_id').notNull(),
  txnDate: date('txn_date').notNull(),
  workerId: uuid('worker_id'),
  trade: varchar('trade'), // Mason, Bar Bender, Shuttering, Helper
  headcount: integer('headcount').default(1),
  shiftType: varchar('shift_type').default('FULL_DAY'),
  overtimeHours: numeric('overtime_hours').default('0'),
});`,
      columns: ['Attendance Date', 'Site', 'Worker / Trade', 'Shift Type', 'OT Hours', 'Daily Rate (₹)', 'Net Payable (₹)'],
      mockRecords: [
        { 'Attendance Date': '18-04-2026', Site: 'NH-31 Site', 'Worker / Trade': 'Bar Bender (Gang of 8)', 'Shift Type': 'FULL DAY', 'OT Hours': '2.0 Hrs', 'Daily Rate (₹)': '₹ 750.00', 'Net Payable (₹)': '₹ 7,500.00' },
        { 'Attendance Date': '18-04-2026', Site: 'NH-31 Site', 'Worker / Trade': 'Mason - Subhas Mondal', 'Shift Type': 'FULL DAY', 'OT Hours': '0.0 Hrs', 'Daily Rate (₹)': '₹ 800.00', 'Net Payable (₹)': '₹ 800.00' },
      ],
    },
    expenses: {
      title: 'Site Petty Cash & Imprest Administration',
      reqId: 'MST-12 / EXP-01',
      tagline: 'Cash imprest to site engineers, expense vouchers against GST bills, and automated head allocation.',
      icon: Receipt,
      architectureSummary:
        'Site in-charges receive imprest advances. Every petty cash expense carries GST bill upload, tags to expense head (MST-12), and posts into cost ledger under MISC_EXPENSE or OVERHEAD.',
      drizzleSchemaSnippet: `// Expense Entries (EXP-01)
export const expenseEntries = pgTable('expense_entries', {
  id: uuid('id').primaryKey(),
  siteId: uuid('site_id').notNull(),
  expenseHeadId: uuid('expense_head_id').notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  gstAmount: numeric('gst_amount', { precision: 18, scale: 2 }),
  billNumber: varchar('bill_number'),
  paidTo: varchar('paid_to').notNull(),
});`,
      columns: ['Voucher Date', 'Site', 'Expense Head', 'Paid To / Vendor', 'Bill No', 'Amount (₹)', 'Status'],
      mockRecords: [
        { 'Voucher Date': '17-04-2026', Site: 'NH-31 Site', 'Expense Head': 'Site Office Electricity', 'Paid To / Vendor': 'WBSEDCL Division', 'Bill No': 'ELEC-9921', 'Amount (₹)': '₹ 4,320.00', Status: 'POSTED' },
        { 'Voucher Date': '18-04-2026', Site: 'Ganga Bridge', 'Expense Head': 'Safety Helmets & Vests', 'Paid To / Vendor': 'National Hardware Store', 'Bill No': 'NHS-401', 'Amount (₹)': '₹ 12,500.00', Status: 'POSTED' },
      ],
    },
    plant: {
      title: 'Hot Mix & Concrete Production Engine',
      reqId: 'PLT-13 / PLT-15',
      tagline: 'Raw material consumption via recipe BOM, crusher split, dispatch to site, and site raw-material allocation.',
      icon: Factory,
      architectureSummary:
        'Each dispatch line records site_id, qty, recipe_id. A plant-allocation table stores raw materials consumed broken down by item, allowing queries like "Total Bitumen consumed for NH-31" (PLT-13). Receipt at site lands in stock ledger.',
      drizzleSchemaSnippet: `// Plant Raw Material Allocation (PLT-13)
export const plantRawMaterialAllocations = pgTable('plant_raw_material_allocations', {
  id: uuid('id').primaryKey(),
  dispatchId: uuid('dispatch_id').notNull(),
  siteId: uuid('site_id').notNull(),
  itemId: uuid('item_id').notNull(), // Bitumen VG-30, 10mm, 20mm
  allocatedQty: numeric('allocated_qty', { precision: 18, scale: 4 }).notNull(),
  rate: numeric('rate', { precision: 18, scale: 4 }).notNull(),
  totalCost: numeric('total_cost', { precision: 18, scale: 2 }).notNull(),
});`,
      columns: ['Dispatch No', 'Product', 'Destination Site', 'Dispatched Qty', 'Bitumen Content (MT)', 'Plant Cost (₹)'],
      mockRecords: [
        { 'Dispatch No': 'DISP-HMP-0012', Product: 'Dense Bituminous Macadam (DBM)', 'Destination Site': 'NH-31 Site Main Yard', 'Dispatched Qty': '32.50 MT', 'Bitumen Content (MT)': '1.46 MT (4.5%)', 'Plant Cost (₹)': '₹ 1,36,500.00' },
        { 'Dispatch No': 'DISP-HMP-0013', Product: 'Bituminous Concrete (BC Grade 2)', 'Destination Site': 'NH-31 Site Main Yard', 'Dispatched Qty': '30.00 MT', 'Bitumen Content (MT)': '1.56 MT (5.2%)', 'Plant Cost (₹)': '₹ 1,32,000.00' },
      ],
    },
    contract: {
      title: 'Contract BOQ & Running Account (RA) Billing',
      reqId: 'BIL-06 / MST-15',
      tagline: 'Item-rate BOQ import, progressive joint measurements, RA Bill with deductions (TDS, retention, mobilization).',
      icon: ClipboardList,
      architectureSummary:
        'Import client tender BOQ (MST-15). Generate Running Account (RA) bills against cumulative measurements. Automatically computes statutory and contractual deductions (5% Retention, 2% TDS u/s 194C, 1% Labour Welfare Cess). Feeds client party ledger (BIL-06).',
      drizzleSchemaSnippet: `// RA Bills (BIL-06)
export const raBills = pgTable('ra_bills', {
  id: uuid('id').primaryKey(),
  siteId: uuid('site_id').notNull(),
  raBillNo: varchar('ra_bill_no').notNull(), // RA-01, RA-02
  grossWorkDoneValue: numeric('gross_work_done_value', { precision: 18, scale: 2 }),
  retentionDeduction: numeric('retention_deduction', { precision: 18, scale: 2 }), // 5%
  tdsDeduction: numeric('tds_deduction', { precision: 18, scale: 2 }), // 2%
  labourCessDeduction: numeric('labour_cess_deduction', { precision: 18, scale: 2 }), // 1%
  netPayableAmount: numeric('net_payable_amount', { precision: 18, scale: 2 }),
});`,
      columns: ['Bill No', 'Site / Stretch', 'Client', 'Gross Work Done', 'Retention (5%)', 'TDS (2%)', 'Net Billed (₹)'],
      mockRecords: [
        { 'Bill No': 'RA-01', 'Site / Stretch': 'NH-31 Four Laning', Client: 'NHAI Project Div', 'Gross Work Done': '₹ 1,45,20,000.00', 'Retention (5%)': '₹ 7,26,000.00', 'TDS (2%)': '₹ 2,90,400.00', 'Net Billed (₹)': '₹ 1,33,58,400.00' },
      ],
    },
    costing: {
      title: 'Site Cost Sheet & Budget vs Actual',
      reqId: 'CST-01',
      tagline: 'Site-wise consolidated profit/loss across Material, Labour, Fuel, Subcontract, and Overheads vs BOQ revenue.',
      icon: PieChart,
      architectureSummary:
        'Pure high-performance SQL query aggregated over append-only `cost_ledger`. Every module (GRN, fuel, attendance, expense, plant) posts its site cost here. Compares cumulative expenditure with client certified bill revenue.',
      drizzleSchemaSnippet: `// Cost Ledger Query Aggregation (CST-01)
const costSummary = await db
  .select({
    costHead: costLedger.costHead,
    totalSpent: sql\`sum(\${costLedger.amount})\`,
  })
  .from(costLedger)
  .where(eq(costLedger.siteId, siteId))
  .groupBy(costLedger.costHead);`,
      columns: ['Cost Head', 'Sub Head', 'Cumulative Spent (₹)', 'Budget Allocation (₹)', 'Variance %', 'Status'],
      mockRecords: [
        { 'Cost Head': 'MATERIAL', 'Sub Head': 'Cement, TMT Steel, Aggregates', 'Cumulative Spent (₹)': '₹ 45,20,000.00', 'Budget Allocation (₹)': '₹ 48,00,000.00', 'Variance %': '-5.8% (Under Budget)', Status: 'HEALTHY' },
        { 'Cost Head': 'VEHICLE_FUEL', 'Sub Head': 'High Speed Diesel (HSD)', 'Cumulative Spent (₹)': '₹ 9,50,000.00', 'Budget Allocation (₹)': '₹ 9,00,000.00', 'Variance %': '+5.5% (Over Budget)', Status: 'ATTENTION' },
        { 'Cost Head': 'LABOUR', 'Sub Head': 'Daily Mason & Trade Wage Sheet', 'Cumulative Spent (₹)': '₹ 14,30,000.00', 'Budget Allocation (₹)': '₹ 15,00,000.00', 'Variance %': '-4.6%', Status: 'HEALTHY' },
      ],
    },
    alerts: {
      title: 'Background Alert Engines (BullMQ)',
      reqId: 'ALT-01 to ALT-07',
      tagline: 'Asynchronous workers scanning low stock, fuel variance spikes, document expiry, and attendance locks.',
      icon: BellRing,
      architectureSummary:
        'Powered by Redis 7 + BullMQ. ALT-01 (Low stock) implemented in worker processor. ALT-05 scans vehicle fitness, insurance, and tax expiry. ALT-06 flags abnormal diesel variance (>15%).',
      drizzleSchemaSnippet: `// Low Stock Worker Processor (ALT-01)
@Processor('alerts-queue')
export class LowStockAlertProcessor extends WorkerHost {
  async process(job: Job) {
    // Queries items where currentQty <= reorderLevel
    // Emits in-app notification and alerts dashboard
  }
}`,
      columns: ['Rule Code', 'Trigger Event', 'Frequency', 'Condition', 'Notification Channel', 'Engine Status'],
      mockRecords: [
        { 'Rule Code': 'ALT-01', 'Trigger Event': 'Material Low Stock', Frequency: 'Every 30 Mins', Condition: 'Stock <= Reorder Level', 'Notification Channel': 'In-App + Store Bell', 'Engine Status': 'ACTIVE (BullMQ)' },
        { 'Rule Code': 'ALT-05', 'Trigger Event': 'Vehicle Fitness Expiry', Frequency: 'Daily at 08:00 AM', Condition: 'Expiry <= 30 Days', 'Notification Channel': 'In-App + Fleet Alert', 'Engine Status': 'SCHEDULED' },
        { 'Rule Code': 'ALT-06', 'Trigger Event': 'Abnormal Fuel Variance', Frequency: 'On Fuel Load', Condition: 'Variance > 15%', 'Notification Channel': 'Owner Bell + Audit Flag', 'Engine Status': 'ACTIVE' },
      ],
    },
  };

  const meta = metaMap[moduleKey] || metaMap.fuel;
  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/60 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-100">{meta.title}</h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {meta.reqId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{meta.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-medium font-mono">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Architecture Scaffolded</span>
          </div>
        </div>
      </div>

      {/* Architecture Spec Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Data Model & Ledger Wiring (Section 7 Spec)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{meta.architectureSummary}</p>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="text-amber-400 font-semibold font-mono text-xs">
              Backend API Controller:
            </div>
            <div className="font-mono text-slate-300">
              apps/api/src/{moduleKey}/{moduleKey}.controller.ts
            </div>
            <div className="text-slate-500">
              Routes wired with RbacGuard, ScopeService, and FieldMaskingInterceptor.
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Code2 className="w-4 h-4 text-sky-400" />
            <span>Drizzle ORM Schema Stub (`schema/skeletons.ts`)</span>
          </div>
          <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48">
            {meta.drizzleSchemaSnippet}
          </pre>
        </div>
      </div>

      {/* Mock Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-slate-800 font-semibold text-xs text-slate-200 flex items-center justify-between">
          <span>Active Pipeline Records & Layout Blueprint</span>
          <span className="text-[11px] text-slate-500 font-mono">Module Skeleton</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                {meta.columns.map((col, idx) => (
                  <th key={idx} className="p-3">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {meta.mockRecords.map((rec, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors font-mono text-[11px]">
                  {meta.columns.map((col, cIdx) => (
                    <td key={cIdx} className="p-3 text-slate-200 font-sans">
                      {rec[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
