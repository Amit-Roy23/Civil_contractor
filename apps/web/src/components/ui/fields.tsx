import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { addDays, today, date as fmtDate } from '../../lib/format';

const inputBase =
  'w-full h-10 px-3 rounded-xl bg-surface border border-line text-sm text-fg placeholder:text-muted transition-colors focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-surface-3 disabled:text-muted';

export function Field({ label, hint, error, required, children, className }: { label?: string; hint?: React.ReactNode; error?: string | null; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      {label && (
        <span className="block text-[13px] font-medium text-fg-2 mb-1.5">
          {label}
          {required && <span className="text-bad ml-0.5">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="block text-xs text-bad mt-1 anim-fade">{error}</span> : hint ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string }>(({ className, prefix, suffix, ...rest }, ref) => {
  if (!prefix && !suffix) return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">{prefix}</span>}
      <input ref={ref} className={cn(inputBase, prefix && 'pl-7', suffix && 'pr-14', className)} {...rest} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted pointer-events-none">{suffix}</span>}
    </div>
  );
});

export function NumberInput({ value, onChange, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'> & { value: number | '' | undefined; onChange: (v: number | '') => void; prefix?: string; suffix?: string }) {
  return <Input type="number" inputMode="decimal" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...rest} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, 'h-auto min-h-[80px] py-2.5 resize-y', props.className)} />;
}

export function Select({ value, onChange, options, placeholder, className, disabled }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; className?: string; disabled?: boolean }) {
  return (
    <div className={cn('relative', className)}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn(inputBase, 'appearance-none pr-9 cursor-pointer')}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

/** Searchable combobox — fast picking from long master lists */
export function Combo({ value, onChange, options, placeholder = 'Select…', className, disabled }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; hint?: string; group?: string }>; placeholder?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, up: false });
  const id = useId();
  const sel = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? options.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(s)) : options).slice(0, 80);
  }, [q, options]);
  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 300 && r.top > 300;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 260), up });
    setHi(0);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (!document.getElementById(id)?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', () => setOpen(false));
    return () => window.removeEventListener('mousedown', close);
  }, [open, id]);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  return (
    <>
      <button type="button" ref={btn} disabled={disabled} onClick={() => setOpen((o) => !o)} className={cn(inputBase, 'flex items-center justify-between text-left gap-2', className)}>
        <span className={cn('truncate', !sel && 'text-muted')}>{sel ? sel.label : placeholder}</span>
        <ChevronDown className={cn('w-4 h-4 text-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open &&
        createPortal(
          <div id={id} className="fixed z-[80] bg-surface border border-line rounded-xl shadow-pop overflow-hidden anim-pop" style={{ left: Math.min(pos.left, window.innerWidth - pos.width - 8), width: Math.min(pos.width, window.innerWidth - 16), ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
            <div className="p-2 border-b border-line">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setHi(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') setHi((h) => Math.min(filtered.length - 1, h + 1));
                    if (e.key === 'ArrowUp') setHi((h) => Math.max(0, h - 1));
                    if (e.key === 'Enter' && filtered[hi]) {
                      e.preventDefault();
                      pick(filtered[hi]!.value);
                    }
                    if (e.key === 'Escape') setOpen(false);
                  }}
                  placeholder="Type to search…"
                  className="w-full h-9 pl-8 pr-2 rounded-lg bg-surface-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted">No matches</div>}
              {filtered.map((o, i) => (
                <button
                  type="button"
                  key={o.value}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o.value)}
                  className={cn('w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2', i === hi ? 'bg-brand-soft' : '')}
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-fg truncate">{o.label}</span>
                    {o.hint && <span className="block text-[11px] text-muted truncate">{o.hint}</span>}
                  </span>
                  {o.value === value && <Check className="w-4 h-4 text-brand-strong shrink-0" />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left group">
      <span className={cn('mt-0.5 relative w-10 h-6 rounded-full transition-colors shrink-0', checked ? 'bg-brand' : 'bg-line-strong')}>
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200', checked && 'translate-x-4')} />
      </span>
      {label && (
        <span>
          <span className="block text-sm font-medium text-fg">{label}</span>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      )}
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputBase, 'pl-9 pr-8')} />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-fg">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** Segmented control */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; className?: string }) {
  return (
    <div className={cn('inline-flex p-1 rounded-xl bg-surface-3/70 gap-1', className)}>
      {options.map((o) => (
        <button type="button" key={o.value} onClick={() => onChange(o.value)} className={cn('flex-1 px-3 h-8 rounded-lg text-[13px] font-medium transition-all', value === o.value ? 'bg-surface text-fg shadow-card' : 'text-fg-2 hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- date range with presets (11. reports filter) ---------- */
export interface DateRange {
  from: string;
  to: string;
}
export const presets = () => {
  const t = today();
  const d = new Date(t + 'T00:00:00');
  const mStart = `${t.slice(0, 7)}-01`;
  const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const pmStart = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}-01`;
  const pmEnd = addDays(mStart, -1);
  const fyStart = d.getMonth() >= 3 ? `${d.getFullYear()}-04-01` : `${d.getFullYear() - 1}-04-01`;
  return [
    { key: 'today', label: 'Today', range: { from: t, to: t } },
    { key: '7d', label: 'Last 7 days', range: { from: addDays(t, -6), to: t } },
    { key: '30d', label: 'Last 30 days', range: { from: addDays(t, -29), to: t } },
    { key: 'mtd', label: 'This month', range: { from: mStart, to: t } },
    { key: 'pm', label: 'Last month', range: { from: pmStart, to: pmEnd } },
    { key: '90d', label: 'Last 90 days', range: { from: addDays(t, -89), to: t } },
    { key: 'fy', label: 'This financial year', range: { from: fyStart, to: t } },
  ];
};

export function DateRangePicker({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ps = presets();
  const active = ps.find((p) => p.range.from === value.from && p.range.to === value.to);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn(inputBase, 'flex items-center gap-2 pr-8 whitespace-nowrap')}>
        <Calendar className="w-4 h-4 text-muted shrink-0" />
        <span className="truncate">{active ? active.label : `${fmtDate(value.from)} – ${fmtDate(value.to)}`}</span>
        <ChevronDown className="w-4 h-4 text-muted absolute right-3" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1.5 right-0 sm:left-0 sm:right-auto w-72 bg-surface border border-line rounded-xl shadow-pop p-1.5 anim-pop">
          {ps.map((p) => (
            <button
              type="button"
              key={p.key}
              onClick={() => {
                onChange(p.range);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-surface-3"
            >
              <span className={cn(active?.key === p.key && 'font-semibold')}>{p.label}</span>
              {active?.key === p.key && <Check className="w-4 h-4 text-brand-strong" strokeWidth={3} />}
            </button>
          ))}
          <div className="border-t border-line mt-1.5 pt-2 px-2 pb-1 grid grid-cols-2 gap-2">
            <Field label="From">
              <Input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className="h-9 text-xs px-2" />
            </Field>
            <Field label="To">
              <Input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className="h-9 text-xs px-2" />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

/** Photo / document attach (MAT-13) — demo stores only count + names; compresses images in-browser (TEC-06) */
export function AttachField({ count, onChange, label = 'Photos / challan' }: { count: number; onChange: (n: number) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  return (
    <div>
      <span className="block text-[13px] font-medium text-fg-2 mb-1.5">{label}</span>
      <button type="button" onClick={() => ref.current?.click()} className="w-full border-2 border-dashed border-line rounded-xl px-3 py-3 text-sm text-fg-2 hover:border-brand hover:bg-brand-soft/40 transition-colors flex items-center justify-center gap-2">
        <span>📷</span>
        {count ? `${count} file${count > 1 ? 's' : ''} attached` : 'Tap to add photo / scan (max 10 MB)'}
      </button>
      {names.length > 0 && <div className="text-[11px] text-muted mt-1 truncate">{names.join(', ')}</div>}
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []).filter((f) => f.size <= 10 * 1024 * 1024);
          setNames(files.map((f) => f.name));
          onChange(count + files.length);
        }}
      />
    </div>
  );
}
