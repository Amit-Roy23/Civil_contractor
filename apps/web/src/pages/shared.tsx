import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { NAV } from '../components/layout/nav';
import { navigate, setQuery, useLocation } from '../lib/router';
import { Badge, Button, Callout, Tabs } from '../components/ui/core';
import { Combo, Field, NumberInput, presets, type DateRange } from '../components/ui/fields';
import { useDB } from '../data/store';
import { useSession } from '../data/session';
import { availability, avgRate } from '../data/ledger';
import { lookup } from '../data/selectors';
import type { DB, ID, Material, ModuleKey } from '../data/types';
import { daysBetween, inr, qty as fq, today } from '../lib/format';
import { cn, round } from '../lib/utils';

/* ---------- module tabs bound to the URL ---------- */
export function useModuleTab(module: ModuleKey) {
  const { segs } = useLocation();
  const nav = NAV.find((n) => n.key === module)!;
  const tabs = nav.tabs || [];
  const tab = tabs.find((t) => t.key === segs[1])?.key || tabs[0]?.key || '';
  const el = (
    <Tabs
      tabs={tabs.map((t) => ({ key: t.key, label: t.label }))}
      value={tab}
      onChange={(k) => navigate(`${nav.path}/${k}`)}
      className="mb-5"
    />
  );
  return { tab, tabsEl: el, nav };
}

/** opens a form when the URL carries ?new=… (from quick-entry / command palette) */
export function useNewParam(): [string | null, (v: string | null) => void] {
  const { query } = useLocation();
  const v = query.get('new');
  return [v, (x) => setQuery('new', x)];
}

export function useQueryParam(key: string) {
  const { query } = useLocation();
  return query.get(key);
}

export function useRange(preset = '30d'): [DateRange, (r: DateRange) => void] {
  const [r, setR] = useState<DateRange>(() => presets().find((p) => p.key === preset)!.range);
  return [r, setR];
}

/* ---------- money that respects ROLE-03 ---------- */
export function Money({ v, compact, className }: { v: number; compact?: boolean; className?: string }) {
  const { showRates } = useSession();
  if (!showRates) return <span className="text-muted">••••</span>;
  return <span className={cn('num', className)}>{compact ? inrCompactLocal(v) : inr(v)}</span>;
}
function inrCompactLocal(v: number) {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return inr(v);
}

/* ---------- names ---------- */
export function useNames() {
  const db = useDB();
  const lk = lookup(db);
  return {
    lk,
    site: (id?: ID) => (id ? lk.site[id]?.short || id : '—'),
    store: (id?: ID) => (id ? lk.store[id]?.name || id : '—'),
    mat: (id?: ID) => (id ? lk.material[id]?.name || id : '—'),
    unit: (id?: ID) => (id ? lk.material[id]?.unit || '' : ''),
    sup: (id?: ID) => (id ? lk.supplier[id]?.name || id : '—'),
    veh: (id?: ID) => (id ? lk.vehicle[id]?.code || id : '—'),
    user: (id?: ID) => (id ? lk.user[id]?.name || id : '—'),
  };
}

/** stores the current user may post to (ROLE-02) */
export function useStoreOptions(types: Array<'CENTRAL' | 'SITE' | 'PLANT'> = ['CENTRAL', 'SITE', 'PLANT']) {
  const db = useDB();
  const s = useSession();
  return useMemo(
    () =>
      db.stores
        .filter((x) => types.includes(x.type) && s.seesStore(x.id))
        .map((x) => ({ value: x.id, label: x.name, hint: x.type === 'CENTRAL' ? 'Central store' : x.type === 'PLANT' ? 'Plant yard' : 'Site store' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, s, types.join()],
  );
}

export function materialOptions(db: DB, filter?: (m: Material) => boolean) {
  return db.materials.filter((m) => m.active !== false && (!filter || filter(m))).map((m) => ({ value: m.id, label: m.name, hint: `${m.code} · ${m.category} · ${m.unit}${m.altUnit ? ` / ${m.altUnit}` : ''}` }));
}

/* ---------- back-dating & approval rules ---------- */
/** MAT-14 / ROLE-04 — returns status the entry must take, or an error */
export function entryDateRule(db: DB, d: string, isAdmin: boolean): { error?: string; needsApproval?: string } {
  const t = today();
  if (d > t) return { error: 'Future dates are not allowed.' };
  const back = daysBetween(d, t);
  if (back > db.settings.backdateDays && !isAdmin) return { needsApproval: `Back-dated by ${back} days (limit ${db.settings.backdateDays}) — will go for approval.` };
  return {};
}

export function DateRuleNote({ date }: { date: string }) {
  const db = useDB();
  const s = useSession();
  const r = entryDateRule(db, date, s.isAdmin);
  if (r.error) return <Callout tone="bad" icon={<TriangleAlert className="w-4 h-4" />}>{r.error}</Callout>;
  if (r.needsApproval) return <Callout tone="warn" icon={<TriangleAlert className="w-4 h-4" />}>{r.needsApproval}</Callout>;
  return null;
}

/* ---------- material lines editor (MAT-12 unit conversion, MAT-10 stock check) ---------- */
export interface LineDraft {
  materialId: ID;
  qty: number | '';
  unit: string; // entered unit
  rate?: number | '';
}

export function toBase(db: DB, l: LineDraft): number {
  const m = lookup(db).material[l.materialId];
  if (!m || l.qty === '') return 0;
  return l.unit && m.altUnit === l.unit && m.altFactor ? round(Number(l.qty) * m.altFactor, 4) : Number(l.qty);
}

export function LinesEditor({
  lines,
  onChange,
  storeId,
  date,
  withRate,
  checkStock,
  filter,
  rateLabel = 'Rate',
}: {
  lines: LineDraft[];
  onChange: (l: LineDraft[]) => void;
  storeId?: ID;
  date: string;
  withRate?: boolean;
  checkStock?: boolean;
  filter?: (m: Material) => boolean;
  rateLabel?: string;
}) {
  const db = useDB();
  const s = useSession();
  const lk = lookup(db);
  const opts = useMemo(() => materialOptions(db, filter), [db, filter]);
  const set = (i: number, p: Partial<LineDraft>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <div className="space-y-3">
      {lines.map((l, i) => {
        const m = lk.material[l.materialId];
        const base = toBase(db, l);
        const av = checkStock && storeId && l.materialId ? availability(db, storeId, l.materialId, date) : null;
        const short = av && base > 0 && (base > av.onDate + 1e-6 || base > av.minAfter + 1e-6);
        return (
          <div key={i} className={cn('rounded-xl border p-3 bg-surface anim-pop', short ? 'border-bad/50' : 'border-line')}>
            <div className="grid grid-cols-12 gap-2.5 items-end">
              <Field label={i === 0 ? 'Material' : undefined} className="col-span-12 md:col-span-5">
                <Combo value={l.materialId} onChange={(v) => set(i, { materialId: v, unit: lk.material[v]?.unit || '', rate: withRate ? round(lk.material[v]?.stdRate || 0, 2) : l.rate })} options={opts} placeholder="Choose material" />
              </Field>
              <Field label={i === 0 ? 'Quantity' : undefined} className={cn(withRate ? 'col-span-5 md:col-span-3' : 'col-span-8 md:col-span-5')}>
                <div className="flex gap-1.5">
                  <NumberInput value={l.qty} onChange={(v) => set(i, { qty: v })} placeholder="0" min={0} />
                  {m?.altUnit ? (
                    <select value={l.unit || m.unit} onChange={(e) => set(i, { unit: e.target.value })} className="h-10 px-2 rounded-xl border border-line bg-surface-2 text-xs font-semibold">
                      <option value={m.unit}>{m.unit}</option>
                      <option value={m.altUnit}>{m.altUnit}</option>
                    </select>
                  ) : (
                    <span className="h-10 px-2.5 rounded-xl bg-surface-3 text-xs font-semibold flex items-center text-fg-2 min-w-[44px] justify-center">{m?.unit || '—'}</span>
                  )}
                </div>
              </Field>
              {withRate && s.showRates && (
                <Field label={i === 0 ? rateLabel : undefined} className="col-span-5 md:col-span-3">
                  <NumberInput value={l.rate ?? ''} onChange={(v) => set(i, { rate: v })} prefix="₹" />
                </Field>
              )}
              <div className={cn('flex justify-end', withRate ? 'col-span-2 md:col-span-1' : 'col-span-4 md:col-span-2')}>
                <Button variant="ghost" size="icon" onClick={() => onChange(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Remove line">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {(m || av) && (
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                {m?.altUnit && l.unit === m.altUnit && base > 0 && <Badge tone="info">= {fq(base, m.unit)}</Badge>}
                {av && (
                  <Badge tone={short ? 'bad' : 'neutral'}>
                    Available {fq(av.onDate, m?.unit)}
                    {av.minAfter < av.onDate - 1e-6 ? ` · later min ${fq(av.minAfter, m?.unit)}` : ''}
                  </Badge>
                )}
                {short && <span className="text-bad font-medium">Stock cannot go negative (MAT-10)</span>}
                {checkStock && storeId && m && s.showRates && base > 0 && <span className="text-muted">≈ {inr(base * avgRate(db, storeId, m.id))} at avg rate</span>}
              </div>
            )}
          </div>
        );
      })}
      <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => onChange([...lines, { materialId: '', qty: '', unit: '' }])}>
        Add line
      </Button>
    </div>
  );
}

export function linesShort(db: DB, lines: LineDraft[], storeId: ID | undefined, date: string) {
  if (!storeId) return false;
  return lines.some((l) => {
    if (!l.materialId) return false;
    const av = availability(db, storeId, l.materialId, date);
    const b = toBase(db, l);
    return b > av.onDate + 1e-6 || b > av.minAfter + 1e-6;
  });
}

export function useAutoOpen(trigger: string | null, open: (v: string) => void, clear: () => void) {
  useEffect(() => {
    if (trigger) {
      open(trigger);
      clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

export function Filters({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
