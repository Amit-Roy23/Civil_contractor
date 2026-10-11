import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatIndianDate } from '../../lib/formatters';
import { useAuth } from '../../lib/auth-context';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  UserCheck,
  MessageSquare,
} from 'lucide-react';

export const ApprovalsInboxView: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [actionRemark, setActionRemark] = useState('');
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['approvals-pending'],
    queryFn: () => api.get<any[]>('/approvals/inbox/pending'),
  });

  const takeActionMutation = useMutation({
    mutationFn: ({ id, action, remark }: { id: string; action: string; remark?: string }) =>
      api.post(`/approvals/requests/${id}/action`, { action, remark }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['approvals-pending'] });
      queryClient.invalidateQueries({ queryKey: ['owner-dashboard'] });
      setSelectedReq(null);
      setActionRemark('');
      alert(`Action processed: ${data.message || 'Updated'}`);
    },
    onError: (err: any) => {
      alert(`Approval action failed: ${err.message}`);
    },
  });

  const handleAction = (id: string, action: 'APPROVE' | 'REJECT' | 'SEND_BACK') => {
    takeActionMutation.mutate({
      id,
      action,
      remark: actionRemark || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-100">Approvals Inbox (APR-01 / APR-02)</h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Multi-Tier Governance
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Review, approve, reject, or return vouchers requiring authorized role authorization.
        </p>
      </div>

      {/* Inbox List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="font-semibold text-slate-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Pending Vouchers Requiring Your Approval ({requests.length})</span>
          </div>
          <span className="text-slate-400 font-mono">Logged as: {user?.roles?.[0]}</span>
        </div>

        <div className="divide-y divide-slate-800/80">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading inbox...</div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 space-y-2">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="font-medium text-slate-200">Inbox Clear!</div>
              <p className="text-slate-500">There are no vouchers awaiting your sign-off.</p>
            </div>
          ) : (
            requests.map((req: any) => (
              <div
                key={req.id}
                className="p-4 hover:bg-slate-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-amber-400">
                      {req.voucherNo}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">
                      {req.voucherType}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {req.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Requested by: <span className="font-medium text-slate-100">{req.requestedBy || 'Site Engineer'}</span>
                    {' '}&bull; Date: {formatIndianDate(req.createdAt)}
                  </div>
                  {req.amount && parseFloat(req.amount) > 0 && (
                    <div className="text-xs font-mono text-slate-400">
                      Voucher Amount: ₹ {req.amount}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Optional remarks..."
                    value={selectedReq?.id === req.id ? actionRemark : ''}
                    onFocus={() => setSelectedReq(req)}
                    onChange={(e) => setActionRemark(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 w-44"
                  />
                  <button
                    onClick={() => handleAction(req.id, 'APPROVE')}
                    disabled={takeActionMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-sm transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleAction(req.id, 'SEND_BACK')}
                    disabled={takeActionMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-medium border border-slate-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Send Back</span>
                  </button>
                  <button
                    onClick={() => handleAction(req.id, 'REJECT')}
                    disabled={takeActionMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-400 text-xs font-medium border border-rose-800/80"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
