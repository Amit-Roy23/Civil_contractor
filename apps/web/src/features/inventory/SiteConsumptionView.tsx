import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatIndianDate, formatQuantity } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import { saveDraft, loadDraft, clearDraft } from '../../lib/offline-sync';
import {
  HardHat,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';

export const SiteConsumptionView: React.FC = () => {
  const { user, activeFyId, isOnline } = useAuth();
  const queryClient = useQueryClient();

  // Form State
  const [siteId, setSiteId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [txnDate, setTxnDate] = useState('2026-04-18');
  const [workSection, setWorkSection] = useState('Box Culvert CH 12+450');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<any[]>([
    {
      itemId: '',
      enteredQty: '25.0000',
      enteredUnitCode: 'BAG',
      chainageText: 'Ch. 12+450 LHS',
      purpose: 'M25 Pier Cap Pour',
    },
  ]);

  const [draftSavedTime, setDraftSavedTime] = useState<string | null>(null);

  // Queries
  const { data: consumptions = [], isLoading } = useQuery({
    queryKey: ['site-consumptions'],
    queryFn: () => api.get<any[]>('/inventory/consumptions'),
  });

  const { data: masters } = useQuery({
    queryKey: ['masters-all'],
    queryFn: () => api.get<any>('/masters'),
  });

  const { items = [], sites = [], locations = [] } = masters || {};

  // Auto-restore draft on mount
  useEffect(() => {
    async function restore() {
      const draft = await loadDraft<any>('daily_consumption');
      if (draft && draft.data) {
        setSiteId(draft.data.siteId || '');
        setLocationId(draft.data.locationId || '');
        setTxnDate(draft.data.txnDate || '2026-04-18');
        setWorkSection(draft.data.workSection || '');
        setRemarks(draft.data.remarks || '');
        if (draft.data.lines && draft.data.lines.length > 0) {
          setLines(draft.data.lines);
        }
        setDraftSavedTime(new Date(draft.lastSavedAt).toLocaleTimeString());
      } else if (sites.length > 0) {
        setSiteId(sites[0].id);
        const siteLoc = locations.find((l: any) => l.siteId === sites[0].id);
        if (siteLoc) setLocationId(siteLoc.id);
      }
    }
    restore();
  }, [sites, locations]);

  // Autosave draft on change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (lines.length > 0) {
        saveDraft('daily_consumption', {
          siteId,
          locationId,
          txnDate,
          workSection,
          remarks,
          lines,
        });
        setDraftSavedTime(new Date().toLocaleTimeString());
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [siteId, locationId, txnDate, workSection, remarks, lines]);

  // Mutation
  const createConsumptionMutation = useMutation({
    mutationFn: (dto: any) => api.post('/inventory/consumptions', dto),
    onSuccess: async () => {
      await clearDraft('daily_consumption');
      setDraftSavedTime(null);
      queryClient.invalidateQueries({ queryKey: ['site-consumptions'] });
      queryClient.invalidateQueries({ queryKey: ['owner-dashboard'] });
      alert('Consumption posted to Stock Ledger & Cost Ledger successfully (MAT-04 / CST-01)!');
      // Reset lines
      setLines([
        {
          itemId: items[0]?.id || '',
          enteredQty: '10.0000',
          enteredUnitCode: items[0]?.baseUnitCode || 'KG',
          chainageText: '',
          purpose: '',
        },
      ]);
    },
    onError: (err: any) => {
      alert(`Submission failed: ${err.message}. Your draft is saved locally in IndexedDB.`);
    },
  });

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        itemId: items[0]?.id || '',
        enteredQty: '10.0000',
        enteredUnitCode: items[0]?.baseUnitCode || 'KG',
        chainageText: workSection,
        purpose: 'Concrete mix',
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: string, val: any) => {
    const updated = [...lines];
    updated[idx][field] = val;
    if (field === 'itemId') {
      const it = items.find((i: any) => i.id === val);
      if (it) updated[idx].enteredUnitCode = it.baseUnitCode;
    }
    setLines(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteId || !locationId || !lines[0]?.itemId) {
      alert('Please select Site, Location, and at least one Item');
      return;
    }

    createConsumptionMutation.mutate({
      companyId: user?.companyId,
      financialYearId: activeFyId,
      siteId,
      locationId,
      txnDate,
      workSection,
      remarks,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        enteredQty: String(l.enteredQty),
        enteredUnitCode: l.enteredUnitCode,
        chainageText: l.chainageText,
        purpose: l.purpose,
      })),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Daily Site Consumption (MAT-04)</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Site Worksite Entry
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tablet-optimised daily logging with offline IndexedDB draft persistence. Posts to stock & site cost ledgers.
          </p>
        </div>

        {/* Offline / Autosave Badge */}
        <div className="flex items-center gap-3">
          {draftSavedTime && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              <Save className="w-3.5 h-3.5 text-amber-400" />
              <span>Draft autosaved: {draftSavedTime}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Entry Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Project Site *</label>
              <select
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  const loc = locations.find((l: any) => l.siteId === e.target.value);
                  if (loc) setLocationId(loc.id);
                }}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-medium"
              >
                <option value="">Select Site...</option>
                {sites.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Site Store / Yard *
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-medium"
              >
                <option value="">Select Location...</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Transaction Date *
              </label>
              <input
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Work Section / Structure
              </label>
              <input
                type="text"
                value={workSection}
                onChange={(e) => setWorkSection(e.target.value)}
                placeholder="e.g. Culvert Box CH 12+450"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200"
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Materials Consumed from Site Stock
              </span>
              <button
                type="button"
                onClick={handleAddLine}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-medium flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Line</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 grid grid-cols-12 gap-3 items-center text-xs"
                >
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Item *</label>
                    <select
                      value={line.itemId}
                      onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                    >
                      <option value="">Select Material...</option>
                      {items.map((it: any) => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Quantity *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={line.enteredQty}
                      onChange={(e) => handleLineChange(idx, 'enteredQty', e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono text-amber-400 font-bold"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Unit</label>
                    <input
                      type="text"
                      value={line.enteredUnitCode}
                      onChange={(e) => handleLineChange(idx, 'enteredUnitCode', e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 uppercase font-mono"
                    />
                  </div>

                  <div className="col-span-10 sm:col-span-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Chainage / Purpose</label>
                    <input
                      type="text"
                      value={line.chainageText}
                      onChange={(e) => handleLineChange(idx, 'chainageText', e.target.value)}
                      placeholder="e.g. Pier P-1 LHS"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1 text-center pt-3">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="p-1.5 rounded text-rose-400 hover:bg-rose-500/10"
                        title="Remove Line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-800">
            <span className="text-[11px] text-slate-500">
              * Atomic row-locked check (`FOR UPDATE`) prevents negative site inventory.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await clearDraft('daily_consumption');
                  setDraftSavedTime(null);
                  alert('Draft cleared');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-medium"
              >
                Clear Draft
              </button>
              <button
                type="submit"
                disabled={createConsumptionMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
              >
                {createConsumptionMutation.isPending ? 'Posting...' : 'Post Daily Consumption'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* History Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-slate-800 font-semibold text-xs text-slate-200">
          Recent Site Consumption Vouchers
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="p-3">Voucher No</th>
                <th className="p-3">Date</th>
                <th className="p-3">Site</th>
                <th className="p-3">Work Section</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Loading consumption records...
                  </td>
                </tr>
              ) : consumptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No consumption logged yet.
                  </td>
                </tr>
              ) : (
                consumptions.map((c: any) => {
                  const s = sites.find((st: any) => st.id === c.siteId);
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-semibold text-amber-400">{c.voucherNo}</td>
                      <td className="p-3">{formatIndianDate(c.txnDate)}</td>
                      <td className="p-3 font-medium text-slate-200">{s?.name || 'Site'}</td>
                      <td className="p-3">{c.workSection || '—'}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
