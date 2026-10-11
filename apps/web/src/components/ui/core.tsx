import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/* ---------------- Button ---------------- */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';
export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' | 'icon'; icon?: React.ReactNode; loading?: boolean }
>(({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest }, ref) => {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand text-brand-ink hover:brightness-105 shadow-sm shadow-brand/25 font-semibold',
    secondary: 'bg-surface text-fg border border-line hover:bg-surface-2 hover:border-line-strong',
    ghost: 'text-fg-2 hover:bg-surface-3 hover:text-fg',
    subtle: 'bg-surface-3 text-fg hover:bg-line',
    danger: 'bg-bad text-white hover:brightness-110 font-semibold',
    success: 'bg-good text-white hover:brightness-110 font-semibold',
  };
  const s = { sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg', md: 'h-10 px-3.5 text-sm gap-2 rounded-xl', lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl', icon: 'h-9 w-9 justify-center rounded-xl' }[size];
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn('inline-flex items-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 select-none', v[variant], s, className)}
      {...rest}
    >
      {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* ---------------- Card ---------------- */
export function Card({ className, children, hover, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn('bg-surface border border-line rounded-2xl shadow-card', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  );
}
export function CardHeader({ title, subtitle, icon, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-strong flex items-center justify-center shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-fg leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

/* ---------------- Badge ---------------- */
export type Tone = 'neutral' | 'brand' | 'good' | 'warn' | 'bad' | 'info' | 'violet';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-2',
  brand: 'bg-brand-soft text-brand-strong',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
};
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', toneCls[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [Tone, string]> = {
  POSTED: ['good', 'Posted'],
  APPROVED: ['good', 'Approved'],
  PAID: ['good', 'Paid'],
  RECEIVED: ['good', 'Received'],
  CLOSED: ['neutral', 'Closed'],
  ACTIVE: ['good', 'Active'],
  WORKING: ['good', 'Working'],
  OK: ['good', 'OK'],
  ORDERED: ['info', 'Ordered'],
  OPEN: ['info', 'Open'],
  CERTIFIED: ['info', 'Certified'],
  SUBMITTED: ['violet', 'Submitted'],
  DISPATCHED: ['info', 'In transit'],
  IN_TRANSIT: ['info', 'In transit'],
  PARTIAL: ['warn', 'Partial'],
  PARTLY_PAID: ['warn', 'Partly paid'],
  PENDING: ['warn', 'Pending approval'],
  DRAFT: ['neutral', 'Draft'],
  SENT_BACK: ['warn', 'Sent back'],
  IDLE: ['warn', 'Idle'],
  ON_HOLD: ['warn', 'On hold'],
  'DUE SOON': ['warn', 'Due soon'],
  REJECTED: ['bad', 'Rejected'],
  RETURNED: ['bad', 'Returned'],
  CANCELLED: ['neutral', 'Cancelled'],
  BREAKDOWN: ['bad', 'Breakdown'],
  OVERDUE: ['bad', 'Overdue'],
  COMPLETED: ['neutral', 'Completed'],
};
export function StatusBadge({ status }: { status: string }) {
  const [tone, label] = STATUS[status] || ['neutral', status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

/* ---------------- Animated number ---------------- */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), duration = 800 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/* ---------------- Stat tile ---------------- */
export function Stat({
  label,
  value,
  format,
  icon,
  tone = 'brand',
  sub,
  trend,
  onClick,
  className,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  icon?: React.ReactNode;
  tone?: Tone;
  sub?: React.ReactNode;
  trend?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Card hover={!!onClick} onClick={onClick} className={cn('p-4 sm:p-5 relative overflow-hidden', onClick && 'cursor-pointer', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-2">{label}</span>
        {icon && <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', toneCls[tone])}>{icon}</span>}
      </div>
      <div className="text-2xl sm:text-[28px] font-bold tracking-tight text-fg mt-1 leading-none">
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div className="text-xs text-muted mt-2">{sub}</div>}
      {trend && <div className="mt-3 -mx-1">{trend}</div>}
    </Card>
  );
}

/* ---------------- Progress ---------------- */
export function Progress({ value, tone, className, thin }: { value: number; tone?: 'brand' | 'good' | 'warn' | 'bad' | 'info'; className?: string; thin?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone || (v >= 100 ? 'bad' : 'brand');
  const bg = { brand: 'bg-brand', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info' }[t];
  return (
    <div className={cn('w-full rounded-full bg-surface-3 overflow-hidden', thin ? 'h-1.5' : 'h-2', className)}>
      <div className={cn('h-full rounded-full bar-grow', bg)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ key: T; label: string; icon?: React.ReactNode; count?: number }>; value: T; onChange: (k: T) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-k="${value}"]`);
    if (el) {
      setInd({ left: el.offsetLeft, width: el.offsetWidth });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [value, tabs.length]);
  return (
    <div className={cn('relative -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar', className)}>
      <div ref={ref} className="relative inline-flex gap-1 p-1 bg-surface-3/70 rounded-xl min-w-max">
        <span className="absolute top-1 bottom-1 rounded-lg bg-surface shadow-card transition-all duration-300 ease-out" style={{ left: ind.left, width: ind.width }} />
        {tabs.map((t) => (
          <button
            key={t.key}
            data-k={t.key}
            onClick={() => onChange(t.key)}
            className={cn('relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap', value === t.key ? 'text-fg' : 'text-fg-2 hover:text-fg')}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className={cn('ml-0.5 min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center', value === t.key ? 'bg-brand text-brand-ink' : 'bg-line text-fg-2')}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Drawer / Modal ---------------- */
function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}
function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-2xl' }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: string }) {
  useLockScroll(open);
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div className={cn('relative w-full h-full bg-bg flex flex-col shadow-pop anim-drawer', width)}>
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-line bg-surface">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-fg leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">{children}</div>
        {footer && <div className="px-4 sm:px-6 py-3 border-t border-line bg-surface flex flex-wrap items-center justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'max-w-md' }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: string }) {
  useLockScroll(open);
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div className={cn('relative w-full bg-surface rounded-t-3xl sm:rounded-2xl shadow-pop anim-pop max-h-[90vh] flex flex-col', size)}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Toasts ---------------- */
type ToastT = { id: number; tone: 'good' | 'bad' | 'warn' | 'info'; title: string; body?: string };
let pushToast: (t: Omit<ToastT, 'id'>) => void = () => {};
export const toast = {
  success: (title: string, body?: string) => pushToast({ tone: 'good', title, body }),
  error: (title: string, body?: string) => pushToast({ tone: 'bad', title, body }),
  warn: (title: string, body?: string) => pushToast({ tone: 'warn', title, body }),
  info: (title: string, body?: string) => pushToast({ tone: 'info', title, body }),
};
export function Toaster() {
  const [items, setItems] = useState<ToastT[]>([]);
  useEffect(() => {
    let n = 0;
    pushToast = (t) => {
      const id = ++n;
      setItems((x) => [...x.slice(-3), { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
    };
  }, []);
  const icon = { good: <CircleCheck className="w-5 h-5 text-good" />, bad: <CircleX className="w-5 h-5 text-bad" />, warn: <TriangleAlert className="w-5 h-5 text-warn" />, info: <Info className="w-5 h-5 text-info" /> };
  return createPortal(
    <div className="fixed z-[70] bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 lg:left-auto lg:right-6 lg:translate-x-0 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto bg-surface border border-line rounded-2xl shadow-pop px-4 py-3 flex gap-3 anim-pop">
          {icon[t.tone]}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg">{t.title}</div>
            {t.body && <div className="text-xs text-fg-2 mt-0.5">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ---------------- Empty / skeleton ---------------- */
export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 anim-fade">
      <div className="w-14 h-14 rounded-2xl bg-surface-3 text-muted flex items-center justify-center mb-3 float">{icon || <Info className="w-6 h-6" />}</div>
      <div className="text-sm font-semibold text-fg">{title}</div>
      {body && <div className="text-xs text-muted mt-1 max-w-sm">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-5 anim-fade">
      <div className="skeleton h-9 w-64 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-80 rounded-2xl" />
    </div>
  );
}

/* ---------------- Page header ---------------- */
export function PageHeader({ title, subtitle, actions, tags }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; tags?: string[] }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="text-sm text-fg-2 mt-1">{subtitle}</p>}
        {tags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((t) => (
              <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-surface-3 text-muted">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Key/value list ---------------- */
export function KV({ items, cols = 2 }: { items: Array<[string, React.ReactNode]>; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wide text-muted font-medium">{k}</dt>
          <dd className="text-sm text-fg mt-0.5 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Callout({ tone = 'info', icon, children, className }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-2.5 items-start rounded-xl px-3.5 py-2.5 text-[13px]', toneCls[tone], className)}>
      <span className="mt-0.5 shrink-0">{icon || <Info className="w-4 h-4" />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
