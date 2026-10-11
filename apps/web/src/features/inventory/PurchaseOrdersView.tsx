import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatINR, formatIndianDate, formatQuantity } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import {
  Plus,
  ShoppingCart,
  FileText,
  Building,
  CheckCircle,
  X,
  Printer,
} from 'lucide-react';

export const PurchaseOrdersView: React.FC = () => {
  const { user, activeFyId } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPoForPdf, setSelectedPoForPdf] = useState<any | null>(null);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [deliveryLocationId, setDeliveryLocationId] = useState('');
  const [txnDate, setTxnDate] = useState('2026-04-10');
  const [paymentTerms, setPaymentTerms] = useState('30 days from invoice date');
  const [deliveryTerms, setDeliveryTerms] = useState('FOR Destination Site');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<any[]>([
    {
      itemId: '',
      enteredQty: '100.0000',
      enteredUnitCode: 'BAG',
      unitRate: '350.0000',
      gstPercent: 18,
    },
  ]);

  // Queries
  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get<any[]>('/inventory/purchase-orders'),
  });

  const { data: masters } = useQuery({
    queryKey: ['masters-all'],
    queryFn: () => api.get<any>('/masters'),
  });

  const { items = [], suppliers = [], locations = [] } = masters || {};

  // Mutation
  const createPoMutation = useMutation({
    mutationFn: (dto: any) => api.post('/inventory/purchase-orders', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setShowCreateModal(false);
      resetForm();
    },
    onError: (err: any) => {
      alert(`Failed to create PO: ${err.message}`);
    },
  });

  const resetForm = () => {
    setSupplierId('');
    setDeliveryLocationId('');
    setRemarks('');
    setLines([
      {
        itemId: '',
        enteredQty: '100.0000',
        enteredUnitCode: 'BAG',
        unitRate: '350.0000',
        gstPercent: 18,
      },
    ]);
  };

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        itemId: items[0]?.id || '',
        enteredQty: '10.0000',
        enteredUnitCode: items[0]?.baseUnitCode || 'KG',
        unitRate: '100.0000',
        gstPercent: 18,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: string, value: any) => {
    const updated = [...lines];
    updated[idx][field] = value;
    if (field === 'itemId') {
      const selectedItem = items.find((it: any) => it.id === value);
      if (selectedItem) {
        updated[idx].enteredUnitCode = selectedItem.baseUnitCode;
      }
    }
    setLines(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !deliveryLocationId) {
      alert('Please select both Supplier and Delivery Location');
      return;
    }
    if (lines.length === 0 || !lines[0].itemId) {
      alert('Please add at least one material line');
      return;
    }

    createPoMutation.mutate({
      companyId: user?.companyId,
      financialYearId: activeFyId,
      supplierId,
      deliveryLocationId,
      txnDate,
      paymentTerms,
      deliveryTerms,
      remarks,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        enteredQty: String(l.enteredQty),
        enteredUnitCode: l.enteredUnitCode,
        unitRate: String(l.unitRate),
        gstPercent: Number(l.gstPercent),
      })),
    });
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Purchase Orders (PUR-03)</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Procurement Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Generate formal supplier contracts, delivery sites, GST tax computation, and PDF export.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Purchase Order</span>
        </button>
      </div>

      {/* PO List Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="p-3">PO Number</th>
                <th className="p-3">Date</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Delivery Store</th>
                <th className="p-3 text-right">Grand Total (₹)</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading Purchase Orders...
                  </td>
                </tr>
              ) : pos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No purchase orders found. Click "+ New Purchase Order" to generate your first order.
                  </td>
                </tr>
              ) : (
                pos.map((po: any) => {
                  const sup = suppliers.find((s: any) => s.id === po.supplierId);
                  const loc = locations.find((l: any) => l.id === po.deliveryLocationId);
                  return (
                    <tr key={po.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-semibold text-amber-400">{po.voucherNo}</td>
                      <td className="p-3">{formatIndianDate(po.txnDate)}</td>
                      <td className="p-3 font-medium text-slate-100">{sup?.name || 'Supplier'}</td>
                      <td className="p-3">{loc?.name || loc?.code || 'Store'}</td>
                      <td className="p-3 text-right font-mono font-semibold text-slate-100">
                        {po.grandTotal ? formatINR(po.grandTotal) : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {po.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedPoForPdf({ ...po, supplier: sup, location: loc })}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 mx-auto"
                        >
                          <Printer className="w-3 h-3 text-amber-400" />
                          <span>PDF / Print</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create PO Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">Create Purchase Order (PUR-03)</h3>
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
                  <label className="block text-xs font-medium text-slate-400 mb-1">Supplier *</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
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
                    Delivery Location *
                  </label>
                  <select
                    value={deliveryLocationId}
                    onChange={(e) => setDeliveryLocationId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Select Destination Store...</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Order Date (DD-MM-YYYY)
                  </label>
                  <input
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Material Lines */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Material Items</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 grid grid-cols-12 gap-2 items-center text-xs"
                    >
                      <div className="col-span-4">
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
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="Quantity"
                          value={line.enteredQty}
                          onChange={(e) => handleLineChange(idx, 'enteredQty', e.target.value)}
                          required
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Unit"
                          value={line.enteredUnitCode}
                          onChange={(e) => handleLineChange(idx, 'enteredUnitCode', e.target.value)}
                          required
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 uppercase font-mono"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="Rate ₹"
                          value={line.unitRate}
                          onChange={(e) => handleLineChange(idx, 'unitRate', e.target.value)}
                          required
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>

                      <div className="col-span-1">
                        <select
                          value={line.gstPercent}
                          onChange={(e) => handleLineChange(idx, 'gstPercent', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </div>

                      <div className="col-span-1 text-center">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-rose-400 hover:text-rose-300"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Delivery Terms
                  </label>
                  <input
                    type="text"
                    value={deliveryTerms}
                    onChange={(e) => setDeliveryTerms(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  />
                </div>
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
                  disabled={createPoMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shadow-md shadow-amber-500/20"
                >
                  {createPoMutation.isPending ? 'Generating PO...' : 'Create & Post PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO Print / PDF Voucher Preview Modal */}
      {selectedPoForPdf && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Purchase Order Voucher: {selectedPoForPdf.voucherNo}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPoForPdf(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Preview Sheet */}
            <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 text-slate-200 space-y-4 font-mono text-xs">
              <div className="text-center border-b border-slate-800 pb-3">
                <div className="text-sm font-bold tracking-wider text-slate-100">
                  AROHON INFRASTRUCTURE PROJECTS PVT LTD
                </div>
                <div className="text-[11px] text-slate-400">
                  Kona Expressway Logistic Park, Howrah, West Bengal | GSTIN: 19AAACA1234A1Z5
                </div>
                <div className="text-xs font-semibold text-amber-400 mt-1">PURCHASE ORDER</div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[11px]">
                <div>
                  <div className="text-slate-400">VOUCHER NO: <span className="text-slate-100 font-bold">{selectedPoForPdf.voucherNo}</span></div>
                  <div className="text-slate-400">DATE: <span className="text-slate-100">{formatIndianDate(selectedPoForPdf.txnDate)}</span></div>
                  <div className="text-slate-400">DELIVERY TO: <span className="text-slate-100">{selectedPoForPdf.location?.name || 'Site Yard'}</span></div>
                </div>
                <div>
                  <div className="text-slate-400">SUPPLIER: <span className="text-slate-100 font-bold">{selectedPoForPdf.supplier?.name}</span></div>
                  <div className="text-slate-400">GSTIN: <span className="text-slate-100">{selectedPoForPdf.supplier?.gstin || '19AAACU0147K1Z8'}</span></div>
                  <div className="text-slate-400">PAYMENT TERMS: <span className="text-slate-100">{selectedPoForPdf.paymentTerms || '30 Days'}</span></div>
                </div>
              </div>

              <div className="border border-slate-800 rounded p-3 text-right">
                <div className="text-xs text-slate-400">TOTAL ORDER VALUE (INCL. GST):</div>
                <div className="text-lg font-bold text-amber-400">
                  {formatINR(selectedPoForPdf.grandTotal)}
                </div>
              </div>

              <div className="text-[10px] text-slate-500 text-center italic">
                Rendered with Indian civil works compliance (PUR-03). Authorized digital signature.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
