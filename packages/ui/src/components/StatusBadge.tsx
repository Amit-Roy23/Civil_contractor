import React from 'react';
import { VoucherStatus } from '@civil/shared';
import { cn } from '../lib/utils.js';

interface StatusBadgeProps {
  status: VoucherStatus | string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const getColors = () => {
    switch (status) {
      case VoucherStatus.POSTED:
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300';
      case VoucherStatus.PENDING_APPROVAL:
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300';
      case VoucherStatus.DRAFT:
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300';
      case VoucherStatus.CANCELLED:
        return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300';
      case VoucherStatus.REJECTED:
        return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300';
      case VoucherStatus.SENT_BACK:
        return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getLabel = () => {
    switch (status) {
      case VoucherStatus.PENDING_APPROVAL:
        return 'Pending Approval';
      case VoucherStatus.SENT_BACK:
        return 'Sent Back';
      default:
        return status;
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide uppercase',
        getColors(),
        className,
      )}
    >
      {getLabel()}
    </span>
  );
};
