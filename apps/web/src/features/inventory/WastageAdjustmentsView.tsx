import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatIndianDate } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import {
  AlertOctagon,
  Scale,
  Plus,
  Clock,
  CheckCircle,
  X,
  ShieldAlert,
} from 'lucide-react';

export const WastageAdjustmentsView: React.FC = () => {
  const { user, activeFyId } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'wastage' | 'adjustment'>('wastage');
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [locationId, setLocationId] = useState('');
  const [txnDate, setTxnDate] = useState('2026-04-19');
  const [reasonDescription, setReasonDescription] = useState('Heavy monsoon rain packaging tear');
  const [lines, setLines] = useState<any[]>([
    {
      itemId: '',
      enteredQty: '5.0000',
      enteredUnitCode: 'BAG',
      reason: 'Rainwater seepage into camp cement shed',
    },
  ]);

  // Queries
  const { data: masters } = useQuery({
    queryKey: ['masters-all'],
    queryFn: () => api.get<any>('/masters'),
  });

  const { items = [], locations = [] } = masters || {};

  const createWastageMutation = useMutation({
    mutationFn: (dto: any) => api.post('/inventory/wastage', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals-pending'] });
      setShowModal(false);
      alert('Wastage voucher submitted for multi-level approval (MAT-07 / APR-01)');
    },
    onError: (err: any) => alert(`Error: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId || !lines[0]?.itemId) {
      alert('Please fill Location and Material');
      return;
    }

    createWastageMutation.mutate({
      companyId: user?.companyId,
      financialYearId: activeFyId,
      locationId,
      txnDate,
      reasonDescription,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        enteredQty: String(l.enteredQty),
        enteredUnitCode: l.enteredUnitCode,
        reason: l.reason,
      })),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">
              Wastage & Stock Adjustments (MAT-07 / MAT-08)
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30">
              Approval Mandated (APR-01)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Material damage, transit loss, spillage, and physical stock count audit adjustments.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Wastage Voucher</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('wastage')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'wastage'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertOctagon className="w-3.5 h-3.5" />
          <span>Material Wastage (MAT-07)</span>
        </button>
        <button
          onClick={() => setActiveTab('adjustment')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'adjustment'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Physical Stock Adjustments (MAT-08)</span>
        </button>
      </div>

      {/* Info Notice */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-slate-100">Governance Rule (APR-01 & MAT-07):</span> All wastage and physical audit adjustment vouchers enter the approval lifecycle in <span className="font-mono text-amber-400">PENDING_APPROVAL</span> state. They will ONLY decrement or increment stock balance after formal sign-off by the Project Manager or Owner.
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="p-3">Voucher No</th>
                <th className="p-3">Date</th>
                <th className="p-3">Store Yard</th>
                <th className="p-3">Reason / Justification</th>
                <th className="p-3 text-center">Approval Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              <tr className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3 font-mono font-semibold text-amber-400">WST/ST-NH31/26-27/00001</td>
                <td className="p-3">19-04-2026</td>
                <td className="p-3">NH-31 Site Main Yard Store</td>
                <td className="p-3">Heavy rain damage - 5 Bags Cement burst packaging</td>
                <td className="p-3 text-center">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    PENDING_APPROVAL
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Record Material Wastage Voucher (MAT-07)
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Location / Yard *
                </label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
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
                  Reason Description *
                </label>
                <input
                  type="text"
                  value={reasonDescription}
                  onChange={(e) => setReasonDescription(e.target.value)}
                  required
                  placeholder="e.g. Monsoon flooding, bitumen leak, mishandling"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                />
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <label className="block text-[11px] text-slate-500 mb-0.5">Material *</label>
                  <select
                    value={lines[0].itemId}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[0].itemId = e.target.value;
                      setLines(updated);
                    }}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                  >
                    <option value="">Select Material...</option>
                    {items.map((it: any) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-3">
                  <label className="block text-[11px] text-slate-500 mb-0.5">Wastage Qty *</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lines[0].enteredQty}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[0].enteredQty = e.target.value;
                      setLines(updated);
                    }}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>

                <div className="col-span-3">
                  <label className="block text-[11px] text-slate-500 mb-0.5">Unit</label>
                  <input
                    type="text"
                    value={lines[0].enteredUnitCode}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[0].enteredUnitCode = e.target.value;
                      setLines(updated);
                    }}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createWastageMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shadow-md shadow-amber-500/20"
                >
                  Submit for Approval (APR-01)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
