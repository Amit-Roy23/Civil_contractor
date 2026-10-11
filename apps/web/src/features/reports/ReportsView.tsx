import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatINR, formatIndianDate } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import {
  FileSpreadsheet,
  Download,
  Filter,
  FileText,
  Layers,
  ArrowRightLeft,
  Calendar,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<'register' | 'ledger' | 'transit'>('register');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [fromDate, setFromDate] = useState('2026-04-01');
  const [toDate, setToDate] = useState('2026-04-30');

  // Queries
  const { data: masters } = useQuery({
    queryKey: ['masters-all'],
    queryFn: () => api.get<any>('/masters'),
  });

  const { items = [], sites = [] } = masters || {};

  // Stock Register Query
  const { data: stockRegister = [], isLoading: isRegisterLoading } = useQuery({
    queryKey: ['stock-register', selectedSiteId, fromDate, toDate],
    queryFn: () =>
      api.get<any[]>('/reports/stock-register', {
        siteId: selectedSiteId || undefined,
        fromDate,
        toDate,
      }),
    enabled: reportType === 'register',
  });

  // Item Ledger Query
  const { data: itemLedger = [], isLoading: isLedgerLoading } = useQuery({
    queryKey: ['item-ledger', selectedItemId, fromDate, toDate],
    queryFn: () =>
      api.get<any[]>('/reports/item-ledger', {
        itemId: selectedItemId || (items[0]?.id ?? undefined),
        fromDate,
        toDate,
      }),
    enabled: reportType === 'ledger',
  });

  // In-Transit Query
  const { data: inTransit = [], isLoading: isTransitLoading } = useQuery({
    queryKey: ['in-transit-report'],
    queryFn: () => api.get<any[]>('/reports/in-transit'),
    enabled: reportType === 'transit',
  });

  const handleExportExcel = () => {
    window.open(
      `/api/reports/stock-register/excel?fromDate=${fromDate}&toDate=${toDate}${
        selectedSiteId ? `&siteId=${selectedSiteId}` : ''
      }`,
      '_blank',
    );
  };

  const handleExportPdf = () => {
    window.open(
      `/api/reports/stock-register/pdf?fromDate=${fromDate}&toDate=${toDate}${
        selectedSiteId ? `&siteId=${selectedSiteId}` : ''
      }`,
      '_blank',
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">
              Registers & Ledgers (MAT-06 / CST-01)
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Audit Ready
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Site stock register, running item ledgers, in-transit movements, and export to Excel/PDF.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>Printable PDF</span>
          </button>
        </div>
      </div>

      {/* Report Switcher Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setReportType('register')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            reportType === 'register'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Site Stock Register</span>
        </button>
        <button
          onClick={() => setReportType('ledger')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            reportType === 'ledger'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Item Running Ledger</span>
        </button>
        <button
          onClick={() => setReportType('transit')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            reportType === 'transit'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>In-Transit Report</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs items-center">
        {reportType === 'register' && (
          <div>
            <label className="block text-[10px] text-slate-400 mb-1 font-medium">Filter Site</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200"
            >
              <option value="">All Scoped Sites</option>
              {sites.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'ledger' && (
          <div>
            <label className="block text-[10px] text-slate-400 mb-1 font-medium">Select Material</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200"
            >
              {items.map((it: any) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.code})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-slate-400 mb-1 font-medium">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 font-mono"
          />
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 mb-1 font-medium">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 font-mono"
          />
        </div>
      </div>

      {/* Content: Stock Register */}
      {reportType === 'register' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Material Code & Name</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Opening Qty</th>
                  <th className="p-3 text-right text-emerald-400">Received (GRN)</th>
                  <th className="p-3 text-right text-amber-400">Consumed (Site)</th>
                  <th className="p-3 text-right">Transferred</th>
                  <th className="p-3 text-right text-rose-400">Wastage</th>
                  <th className="p-3 text-right font-bold text-slate-100">Closing Qty</th>
                  <th className="p-3 text-right font-bold text-amber-400">Valuation (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {isRegisterLoading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                      Calculating stock register movements...
                    </td>
                  </tr>
                ) : stockRegister.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                      No stock movement records found for this period.
                    </td>
                  </tr>
                ) : (
                  stockRegister.map((row: any) => (
                    <tr key={row.itemId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-sans font-medium text-slate-200">
                        <div>{row.itemName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{row.itemCode}</div>
                      </td>
                      <td className="p-3 uppercase text-slate-400">{row.baseUnit}</td>
                      <td className="p-3 text-right text-slate-400">{row.openingQty}</td>
                      <td className="p-3 text-right text-emerald-400">+{row.receivedQty}</td>
                      <td className="p-3 text-right text-amber-400">-{row.consumedQty}</td>
                      <td className="p-3 text-right text-slate-400">{row.transferredQty}</td>
                      <td className="p-3 text-right text-rose-400">-{row.wastedQty}</td>
                      <td className="p-3 text-right font-bold text-slate-100">{row.closingQty}</td>
                      <td className="p-3 text-right font-bold text-amber-400 font-mono">
                        {row.closingValue ? formatINR(row.closingValue) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Content: Item Ledger */}
      {reportType === 'ledger' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Txn Date</th>
                  <th className="p-3">Voucher No</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right text-emerald-400">Qty In</th>
                  <th className="p-3 text-right text-amber-400">Qty Out</th>
                  <th className="p-3 text-right">Valuation Rate ₹</th>
                  <th className="p-3 text-right font-bold text-slate-100">Running Balance</th>
                  <th className="p-3 text-right font-bold text-amber-400">Running Value ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {isLedgerLoading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                      Loading item running ledger...
                    </td>
                  </tr>
                ) : itemLedger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                      No ledger transactions for this material in selected range.
                    </td>
                  </tr>
                ) : (
                  itemLedger.map((row: any) => (
                    <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 text-slate-300">{formatIndianDate(row.txnDate)}</td>
                      <td className="p-3 font-semibold text-amber-400">{row.voucherNo}</td>
                      <td className="p-3 text-slate-400">{row.voucherType}</td>
                      <td className="p-3 text-right text-emerald-400 font-semibold">
                        {parseFloat(row.qtyIn) > 0 ? `+${row.qtyIn}` : '—'}
                      </td>
                      <td className="p-3 text-right text-amber-400 font-semibold">
                        {parseFloat(row.qtyOut) > 0 ? `-${row.qtyOut}` : '—'}
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        {row.valuationRate ? `₹ ${row.valuationRate}` : '—'}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-100">{row.runningQty}</td>
                      <td className="p-3 text-right font-bold text-amber-400">
                        {row.runningValue ? formatINR(row.runningValue) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Content: In-Transit Report */}
      {reportType === 'transit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Transfer Voucher</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Origin Store</th>
                  <th className="p-3">Destination Store</th>
                  <th className="p-3">Vehicle & Driver</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {isTransitLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Loading in-transit movements...
                    </td>
                  </tr>
                ) : inTransit.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      No material currently in transit.
                    </td>
                  </tr>
                ) : (
                  inTransit.map((tr: any) => (
                    <tr key={tr.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-semibold text-amber-400">{tr.voucherNo}</td>
                      <td className="p-3">{formatIndianDate(tr.txnDate)}</td>
                      <td className="p-3 font-medium text-slate-200">
                        {tr.fromLocation?.name || tr.fromLocationId}
                      </td>
                      <td className="p-3 font-medium text-slate-200">
                        {tr.toLocation?.name || tr.toLocationId}
                      </td>
                      <td className="p-3 font-mono text-slate-300">{tr.vehicleNumber}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          {tr.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
