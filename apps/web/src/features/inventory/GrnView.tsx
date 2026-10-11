import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatINR, formatIndianDate, formatQuantity } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import {
  PackageCheck,
  Plus,
  Truck,
  Scale,
  CheckCircle,
  X,
  FileCheck2,
} from 'lucide-react';

export const GrnView: React.FC = () => {
  const { user, activeFyId } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [poId, setPoId] = useState('');
  const [txnDate, setTxnDate] = useState('2026-04-12');
  const [supplierChallanNo, setSupplierChallanNo] = useState('CH-88421');
  const [vehicleNumber, setVehicleNumber] = useState('WB-11-D-5521');
  const [weighbridgeSlipNo, setWeighbridgeSlipNo] = useState('WB-SLIP-4009');
  const [grossWeightKg, setGrossWeightKg] = useState('32450.00');
  const [tareWeightKg, setTareWeightKg] = useState('12450.00');
  const [remarks, setRemarks] = useState('');

  const [lines, setLines] = useState<any[]>([
    {
      itemId: '',
      receivedQty: '400.0000',
      acceptedQty: '400.0000',
      rejectedQty: '0.0000',
      enteredUnitCode: 'BAG',
      unitRate: '350.0000',
      gstPercent: 18,
    },
  ]);

  // Queries
  const { data: grns = [], isLoading } = useQuery({
    queryKey: ['grns-list'],
    queryFn: () => api.get<any[]>('/inventory/grns'),
  });

  const { data: masters } = useQuery({
    queryKey: ['masters-all'],
    queryFn: () => api.get<any>('/masters'),
  });

  const { data: pos = [] } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get<any[]>('/inventory/purchase-orders'),
  });

  const { items = [], suppliers = [], locations = [] } = masters || {};

  const createGrnMutation = useMutation({
    mutationFn: (dto: any) => api.post('/inventory/grns', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grns-list'] });
      queryClient.invalidateQueries({ queryKey: ['owner-dashboard'] });
      setShowCreateModal(false);
      alert('GRN saved and posted to Stock & Party Ledgers successfully!');
    },
    onError: (err: any) => {
      alert(`GRN posting failed: ${err.message}`);
    },
  });

  const handleLineChange = (idx: number, field: string, value: any) => {
    const updated = [...lines];
    updated[idx][field] = value;
    if (field === 'receivedQty') {
      updated[idx].acceptedQty = value;
    }
    setLines(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !locationId || !lines[0]?.itemId) {
      alert('Please fill all mandatory fields (Supplier, Receiving Location, Material)');
      return;
    }

    const netKg =
      grossWeightKg && tareWeightKg
        ? String(parseFloat(grossWeightKg) - parseFloat(tareWeightKg))
        : undefined;

    createGrnMutation.mutate({
      companyId: user?.companyId,
      financialYearId: activeFyId,
      poId: poId || undefined,
      supplierId,
      locationId,
      txnDate,
      supplierChallanNo,
      vehicleNumber,
      weighbridgeSlipNo,
      grossWeightKg,
      tareWeightKg,
      netWeightKg: netKg,
      remarks,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        receivedQty: String(l.receivedQty),
        acceptedQty: String(l.acceptedQty),
        rejectedQty: String(l.rejectedQty || 0),
        enteredUnitCode: l.enteredUnitCode,
        unitRate: String(l.unitRate),
        gstPercent: Number(l.gstPercent),
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
              Goods Receipt Note (GRN) (PUR-04 / MAT-02)
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Inward Gate
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Weighbridge slips, vehicle verification, challan matching, and atomic stock ledger posting.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Goods Receipt (GRN)</span>
        </button>
      </div>

      {/* GRN Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="p-3">GRN No.</th>
                <th className="p-3">Date</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Receiving Store</th>
                <th className="p-3">Challan / Vehicle</th>
                <th className="p-3 text-right">Weighbridge (Kg)</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading Goods Receipts...
                  </td>
                </tr>
              ) : grns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No GRN vouchers found. Click "+ New Goods Receipt" to record supplier delivery.
                  </td>
                </tr>
              ) : (
                grns.map((grn: any) => {
                  const sup = suppliers.find((s: any) => s.id === grn.supplierId);
                  const loc = locations.find((l: any) => l.id === grn.locationId);
                  return (
                    <tr key={grn.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-semibold text-amber-400">{grn.voucherNo}</td>
                      <td className="p-3">{formatIndianDate(grn.txnDate)}</td>
                      <td className="p-3 font-medium text-slate-100">{sup?.name || 'Supplier'}</td>
                      <td className="p-3">{loc?.name || loc?.code || 'Store'}</td>
                      <td className="p-3 font-mono text-slate-300">
                        {grn.supplierChallanNo} &bull; {grn.vehicleNumber}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {grn.netWeightKg ? `${grn.netWeightKg} Kg` : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {grn.status}
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

      {/* New GRN Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Record Goods Receipt Note (GRN) (PUR-04 / MAT-02)
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Against Purchase Order
                  </label>
                  <select
                    value={poId}
                    onChange={(e) => setPoId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    <option value="">Direct Receipt (No PO)</option>
                    {pos.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.voucherNo}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Supplier *</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Receiving Location / Store *
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    <option value="">Select Receiving Location...</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Transport & Weighbridge Details */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Truck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Challan & Weighbridge Verification (MAT-02)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Challan No *</label>
                    <input
                      type="text"
                      value={supplierChallanNo}
                      onChange={(e) => setSupplierChallanNo(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Vehicle No *</label>
                    <input
                      type="text"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Weighbridge Slip</label>
                    <input
                      type="text"
                      value={weighbridgeSlipNo}
                      onChange={(e) => setWeighbridgeSlipNo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Gross Weight (Kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={grossWeightKg}
                      onChange={(e) => setGrossWeightKg(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Receipt Lines */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300">Materials Received</span>
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 grid grid-cols-12 gap-2 text-xs items-center"
                  >
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Item *</label>
                      <select
                        value={line.itemId}
                        onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                      >
                        <option value="">Select Material...</option>
                        {items.map((it: any) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({it.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Challan Qty</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={line.receivedQty}
                        onChange={(e) => handleLineChange(idx, 'receivedQty', e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Accepted Qty</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={line.acceptedQty}
                        onChange={(e) => handleLineChange(idx, 'acceptedQty', e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono text-emerald-400 font-bold"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Unit</label>
                      <input
                        type="text"
                        value={line.enteredUnitCode}
                        onChange={(e) => handleLineChange(idx, 'enteredUnitCode', e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono uppercase"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Rate ₹</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={line.unitRate}
                        onChange={(e) => handleLineChange(idx, 'unitRate', e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createGrnMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shadow-md shadow-amber-500/20"
                >
                  {createGrnMutation.isPending ? 'Posting to Ledger...' : 'Post GRN to Stock Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
