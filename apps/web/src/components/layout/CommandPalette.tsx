import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import { NAV } from './nav';
import { navigate } from '../../lib/router';
import { useDB } from '../../data/store';
import { useSession } from '../../data/session';
import { cn } from '../../lib/utils';

interface Item {
  label: string;
  hint: string;
  path: string;
  group: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);

  const all = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const n of NAV) {
      if (!s.can(n.key)) continue;
      out.push({ label: n.label, hint: 'Module', path: n.path, group: 'Go to' });
      for (const t of n.tabs || []) out.push({ label: `${n.label} › ${t.label}`, hint: t.hint || 'Screen', path: `${n.path}/${t.key}`, group: 'Go to' });
    }
    const entries: Array<[string, string]> = [
      ['Record material consumption', '/inventory/transactions?new=CONSUMPTION'],
      ['Receive material at site', '/inventory/transactions?new=ISSUE'],
      ['Mark attendance', '/labour/attendance?new=1'],
      ['Add expense', '/expenses/entries?new=1'],
      ['Issue fuel to vehicle', '/fleet/fuel?new=1'],
      ['Logbook entry', '/fleet/logbook?new=1'],
      ['Raise purchase order', '/purchase/orders?new=1'],
      ['Record GRN', '/purchase/grn?new=1'],
      ['Plant production entry', '/plant/production?new=1'],
      ['Dispatch slip', '/plant/dispatch?new=1'],
      ['Measurement entry', '/contract/measurements?new=1'],
      ['Prepare RA bill', '/contract/bills?new=1'],
    ];
    for (const [label, path] of entries) out.push({ label, hint: 'New entry', path, group: 'Create' });
    for (const x of db.sites.filter((x) => s.seesSite(x.id))) out.push({ label: x.name, hint: `${x.code} · site`, path: `/contract/costing?site=${x.id}`, group: 'Sites' });
    for (const x of db.vehicles) out.push({ label: `${x.code} ${x.regNo}`, hint: `${x.type} · ${x.make} ${x.model}`, path: `/fleet/overview?v=${x.id}`, group: 'Vehicles' });
    for (const x of db.materials) out.push({ label: x.name, hint: `${x.code} · ${x.category}`, path: `/masters/materials?q=${encodeURIComponent(x.code)}`, group: 'Materials' });
    for (const x of db.suppliers) out.push({ label: x.name, hint: `${x.code} · supplier`, path: `/purchase/suppliers?s=${x.id}`, group: 'Suppliers' });
    for (const x of db.pos.slice(-60)) out.push({ label: x.no, hint: 'Purchase order', path: `/purchase/orders?q=${encodeURIComponent(x.no)}`, group: 'Documents' });
    for (const x of db.raBills.slice(-20)) out.push({ label: x.no, hint: 'RA bill', path: `/contract/bills?q=${encodeURIComponent(x.no)}`, group: 'Documents' });
    return out;
  }, [db, s]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all.filter((i) => i.group === 'Create' || (i.group === 'Go to' && !i.label.includes('›'))).slice(0, 24);
    const words = t.split(/\s+/);
    return all.filter((i) => words.every((w) => `${i.label} ${i.hint}`.toLowerCase().includes(w))).slice(0, 30);
  }, [q, all]);

  useEffect(() => {
    if (open) {
      setQ('');
      setHi(0);
    }
  }, [open]);
  useEffect(() => setHi(0), [q]);

  if (!open) return null;
  const go = (i: Item) => {
    navigate(i.path);
    onClose();
  };
  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[8vh] px-3">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface border border-line rounded-2xl shadow-pop overflow-hidden anim-pop">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Search className="w-5 h-5 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(results.length - 1, h + 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(0, h - 1)));
              if (e.key === 'Enter' && results[hi]) go(results[hi]!);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search screens, sites, vehicles, materials, PO numbers…"
            className="flex-1 h-14 bg-transparent text-[15px] focus:outline-none"
          />
          <kbd className="hidden sm:block text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-3 text-muted">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 && <div className="py-10 text-center text-sm text-muted">No results for “{q}”</div>}
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? ((lastGroup = r.group), r.group) : null;
            return (
              <React.Fragment key={r.path + r.label}>
                {head && <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{head}</div>}
                <button onMouseEnter={() => setHi(i)} onClick={() => go(r)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', i === hi && 'bg-brand-soft')}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg truncate">{r.label}</span>
                    <span className="block text-[11px] text-muted truncate">{r.hint}</span>
                  </span>
                  {i === hi ? <CornerDownLeft className="w-4 h-4 text-brand-strong" /> : <ArrowRight className="w-4 h-4 text-muted" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
