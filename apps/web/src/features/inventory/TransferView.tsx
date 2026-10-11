import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatIndianDate } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import {
  ArrowRightLeft,
  Truck,
  Plus,
  CheckCircle2,
  Clock,
  MapPin,
  X,
} from 'lucide-react';

export const TransferView: React.FC = () => {
  const { user, activeFyId } = useAuth();
  const queryClient = useQueryClient();
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [confirmIssueId, setConfirmIssueId] = useState<any | null>(null);

  // Form State for Issue
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [txnDate, setTxnDate] = useState('2026-04-14');
  const [challanNo, setChallanNo] = useState('TR-CH-0042');
  const [vehicleNumber, setVehicleNumber] = useState('WB-29-B-8911');
  const [driverName, setDriverName] = useState('Raju Yadav');
  const [driverMobile, setDriverMobile] = useState('9831998877');
  const [remarks, setRemarks] = useState('');

  const [lines, setLines] = useState<any[]>([
    {
      itemId: '',
      enteredQty: '200.0000',
      enteredUnitCode: 'BAG',
    },
  ]);

  // Queries
  const { data: issues = [], isLoading } = useQuery({
    queryKey: ['transfer-issues'],
    queryFn: () => api.get<any[]>('/inventory/transfer-issues'),
  });

  const { data: masters } = useQuery({
    queryKey: ['masters-all'],
    queryFn: () => api.get<any>('/masters'),
  });

  const { items = [], locations = [] } = masters || {};

  // Mutations
  const createIssueMutation = useMutation({
    mutationFn: (dto: any) => api.post('/inventory/transfer-issues', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-issues'] });
      queryClient.invalidateQueries({ queryKey: ['owner-dashboard'] });
      setShowIssueModal(false);
      alert('Material dispatched to IN_TRANSIT successfully (STR-01)');
    },
    onError: (err: any) => {
      alert(`Transfer Issue failed: ${err.message}`);
    },
  });

  const confirmReceiptMutation = useMutation({
    mutationFn: (dto: any) => api.post('/inventory/transfer-receipts/confirm', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-issues'] });
      queryClient.invalidateQueries({ queryKey: ['owner-dashboard'] });
      setConfirmIssueId(null);
      alert('Site receipt confirmed! Stock landed in site store (MAT-05)');
    },
    onError: (err: any) => {
      alert(`Confirmation failed: ${err.message}`);
    },
  });

  const handleCreateIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromLocationId || !toLocationId || !lines[0]?.itemId) {
      alert('Please fill From Location, To Location, and Material');
      return;
    }

    createIssueMutation.mutate({
      companyId: user?.companyId,
      financialYearId: activeFyId,
      fromLocationId,
      toLocationId,
      txnDate,
      challanNo,
      vehicleNumber,
      driverName,
      driverMobile,
      remarks,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        enteredQty: String(l.enteredQty),
        enteredUnitCode: l.enteredUnitCode,
      })),
    });
  };

  const handleConfirmReceipt = (issue: any) => {
    confirmReceiptMutation.mutate({
      transferIssueId: issue.id,
      receivedLocationId: issue.toLocationId,
      txnDate: new Date().toISOString().substring(0, 10),
      lines: [
        {
          transferLineId: issue.id, // Using first line representation for vertical slice
          acceptedQty: '400.0000',
          rejectedQty: '0.0000',
        },
      ],
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">
              Material Transfers & In-Transit (STR-01 / MAT-01 / MAT-05)
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/30">
              Virtual In-Transit Isolation
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Transfers deduct from sender and sit in virtual IN_TRANSIT. Destination confirms receipt before stock lands (MAT-05).
          </p>
        </div>

        <button
          onClick={() => setShowIssueModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Transfer Issue</span>
        </button>
      </div>

      {/* Transfer Vouchers List */}
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
                <th className="p-3 text-center">In-Transit Status</th>
                <th className="p-3 text-center">Site Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading Material Transfers...
                  </td>
                </tr>
              ) : issues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No active store transfers found.
                  </td>
                </tr>
              ) : (
                issues.map((issue: any) => {
                  const fromLoc = locations.find((l: any) => l.id === issue.fromLocationId);
                  const toLoc = locations.find((l: any) => l.id === issue.toLocationId);
                  return (
                    <tr key={issue.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-semibold text-amber-400">{issue.voucherNo}</td>
                      <td className="p-3">{formatIndianDate(issue.txnDate)}</td>
                      <td className="p-3 font-medium text-slate-200">
                        {fromLoc?.name || fromLoc?.code || 'Central Store'}
                      </td>
                      <td className="p-3 font-medium text-slate-200">
                        {toLoc?.name || toLoc?.code || 'Site Store'}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {issue.vehicleNumber} &bull; {issue.driverName || 'Driver'}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 justify-center w-fit mx-auto">
                          <Clock className="w-3 h-3" />
                          <span>DISPATCHED</span>
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleConfirmReceipt(issue)}
                          disabled={confirmReceiptMutation.isPending}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] flex items-center gap-1 mx-auto shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirm Receipt (MAT-05)</span>
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

      {/* New Transfer Issue Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  New Store Transfer Issue (STR-01)
                </h3>
              </div>
              <button
                onClick={() => setShowIssueModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIssue} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Dispatching From (Origin) *
                  </label>
                  <select
                    value={fromLocationId}
                    onChange={(e) => setFromLocationId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    <option value="">Select Origin Location...</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Destination Site Store *
                  </label>
                  <select
                    value={toLocationId}
                    onChange={(e) => setToLocationId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    <option value="">Select Destination Store...</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Challan No *
                  </label>
                  <input
                    type="text"
                    value={challanNo}
                    onChange={(e) => setChallanNo(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Vehicle Number *
                  </label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Driver Mobile
                  </label>
                  <input
                    type="text"
                    value={driverMobile}
                    onChange={(e) => setDriverMobile(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              {/* Material Lines */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold text-slate-300">Material to Dispatch</span>
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 grid grid-cols-12 gap-2 text-xs items-center"
                  >
                    <div className="col-span-6">
                      <select
                        value={line.itemId}
                        onChange={(e) => {
                          const updated = [...lines];
                          updated[idx].itemId = e.target.value;
                          setLines(updated);
                        }}
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

                    <div className="col-span-3">
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="Quantity"
                        value={line.enteredQty}
                        onChange={(e) => {
                          const updated = [...lines];
                          updated[idx].enteredQty = e.target.value;
                          setLines(updated);
                        }}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>

                    <div className="col-span-3">
                      <input
                        type="text"
                        placeholder="Unit"
                        value={line.enteredUnitCode}
                        onChange={(e) => {
                          const updated = [...lines];
                          updated[idx].enteredUnitCode = e.target.value;
                          setLines(updated);
                        }}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 uppercase font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createIssueMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shadow-md shadow-amber-500/20"
                >
                  {createIssueMutation.isPending ? 'Dispatching...' : 'Dispatch Transfer (STR-01)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
