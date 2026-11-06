import { ArrowRight, CircleCheck, Circle } from 'lucide-react';
import type { DB } from '../data/types';
import type { Session } from '../data/session';
import { Card, CardHeader } from './ui/core';
import { navigate } from '../lib/router';

/**
 * A new company starts empty (no sample data). This checklist shows the Admin what to enter first,
 * ticks itself off as the data arrives, and disappears once the basics are in.
 */
export function GettingStarted({ db, s }: { db: DB; s: Session }) {
  if (!s.isAdmin) return null;
  const steps: Array<{ done: boolean; title: string; hint: string; to: string }> = [
    { done: db.sites.length > 0, title: 'Add the running works', hint: 'Masters › Works — or import them from Excel', to: '/masters/sites' },
    { done: db.suppliers.length > 0, title: 'Add suppliers', hint: 'Bitumen depot, stone crushers, cement and steel dealers, fuel pump', to: '/masters/suppliers' },
    { done: db.workers.length > 0 || db.subcons.length > 0, title: 'Add workers and labour contractors', hint: 'Own workers with UAN / ESIC, and contractors', to: '/masters/workers' },
    { done: db.stockTxns.some((t) => t.type === 'OPENING'), title: 'Enter the opening stock', hint: 'Masters › Import & export › Opening stock (Excel)', to: '/masters/import' },
    { done: db.boq.length > 0, title: 'Load the BOQ of each work', hint: 'Contracts › BOQ — import the department BOQ file', to: '/contract/boq' },
    { done: db.users.length > 1, title: 'Create logins for your staff', hint: 'Administration › Users — username, password, role and works', to: '/admin/users' },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (!left) return null;
  return (
    <Card className="p-5">
      <CardHeader title="Getting started" subtitle={`Your company starts empty — ${steps.length - left} of ${steps.length} done. Every screen fills in as you enter your own data.`} />
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        {steps.map((x) => (
          <button key={x.title} onClick={() => navigate(x.to)} className="flex items-start gap-3 text-left rounded-xl border border-line px-3 py-2.5 hover:border-brand hover:bg-surface-2 transition-colors">
            {x.done ? <CircleCheck className="w-5 h-5 text-good shrink-0 mt-0.5" /> : <Circle className="w-5 h-5 text-muted shrink-0 mt-0.5" />}
            <span className="flex-1 min-w-0">
              <span className={x.done ? 'block text-sm text-muted line-through' : 'block text-sm font-medium'}>{x.title}</span>
              <span className="block text-xs text-muted">{x.hint}</span>
            </span>
            {!x.done && <ArrowRight className="w-4 h-4 text-muted mt-1" />}
          </button>
        ))}
      </div>
    </Card>
  );
}
