import { useMemo, useState } from 'react';
import { ArrowRight, BellRing, Boxes, CalendarClock, ClipboardX, FileWarning, Fuel, IndianRupee, TrendingDown } from 'lucide-react';
import { useDB } from '../data/store';
import { useSession } from '../data/session';
import { alerts, type Alert } from '../data/selectors';
import { useSiteFilter } from '../components/layout/AppShell';
import { Badge, Card, Empty, PageHeader } from '../components/ui/core';
import { navigate } from '../lib/router';
import { cn } from '../lib/utils';
import { useNames } from './shared';

const CODES: Record<Alert['code'], { label: string; icon: any }> = {
  'ALT-01': { label: 'Stock below minimum', icon: Boxes },
  'ALT-02': { label: 'Consumption variance', icon: Fuel },
  'ALT-03': { label: 'Documents & service due', icon: FileWarning },
  'ALT-04': { label: 'Approvals pending > 24 h', icon: CalendarClock },
  'ALT-05': { label: 'Daily entries missing', icon: ClipboardX },
  'ALT-06': { label: 'Cost over budget / work done', icon: TrendingDown },
  'ALT-07': { label: 'Payments & receivables due', icon: IndianRupee },
};

export default function Alerts() {
  const db = useDB();
  const s = useSession();
  const n = useNames();
  const { siteId } = useSiteFilter();
  const [code, setCode] = useState<string>('all');
  const [sev, setSev] = useState<string>('all');
  const all = useMemo(() => alerts(db).filter((a) => s.seesSite(a.siteId) && (!siteId || !a.siteId || a.siteId === siteId)), [db, s, siteId]);
  const shown = all.filter((a) => (code === 'all' || a.code === code) && (sev === 'all' || a.severity === sev));
  const ch = db.settings.notify;
  return (
    <div>
      <PageHeader title="Alerts" subtitle={`Raised automatically from live data. Delivered in-app${ch.whatsapp ? ', on WhatsApp' : ''}${ch.sms ? ', by SMS' : ''}${ch.email ? ' and by email' : ''} where configured.`} tags={['ALT-01…07']} />
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 mb-4 stagger">
        {(Object.keys(CODES) as Alert['code'][]).map((c) => {
          const I = CODES[c].icon;
          const count = all.filter((a) => a.code === c).length;
          return (
            <button key={c} onClick={() => setCode(code === c ? 'all' : c)} className={cn('text-left p-3 rounded-2xl border transition-all', code === c ? 'bg-brand-soft border-brand' : 'bg-surface border-line hover:border-line-strong')}>
              <div className="flex items-center justify-between">
                <I className="w-4 h-4 text-brand-strong" />
                <span className={cn('text-lg font-bold', count ? 'text-fg' : 'text-muted')}>{count}</span>
              </div>
              <div className="text-[11px] font-semibold mt-1.5 leading-tight">{CODES[c].label}</div>
              <div className="text-[10px] text-muted font-mono">{c}</div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 mb-3">
        {[
          ['all', 'All'],
          ['critical', 'Critical'],
          ['serious', 'Serious'],
          ['warning', 'Warning'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setSev(k!)} className={cn('px-3 h-8 rounded-full text-[13px] font-medium border', sev === k ? 'bg-fg text-bg border-fg' : 'bg-surface border-line text-fg-2')}>
            {l} <span className="opacity-60">{k === 'all' ? all.length : all.filter((a) => a.severity === k).length}</span>
          </button>
        ))}
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {shown.length === 0 && <Empty icon={<BellRing className="w-6 h-6" />} title="No alerts" body="Everything is within limits." />}
        <div className="stagger">
          {shown.map((a) => {
            const I = CODES[a.code].icon;
            return (
              <button key={a.id} onClick={() => navigate(a.link)} className="w-full flex items-start gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-surface-2 border-b border-line last:border-0 group">
                <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', a.severity === 'critical' ? 'bg-bad-soft text-bad' : a.severity === 'serious' ? 'bg-orange-500/15 text-orange-600' : 'bg-warn-soft text-warn')}>
                  <I className="w-[18px] h-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{a.title}</span>
                    <Badge tone={a.severity === 'critical' ? 'bad' : a.severity === 'serious' ? 'brand' : 'warn'}>{a.severity}</Badge>
                    {a.siteId && <Badge>{n.site(a.siteId)}</Badge>}
                  </span>
                  <span className="block text-[13px] text-fg-2 mt-0.5">{a.detail}</span>
                  <span className="block text-[10px] font-mono text-muted mt-1">{a.code}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-muted mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
