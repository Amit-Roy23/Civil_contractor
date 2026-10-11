import { useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Factory,
  Fuel,
  HardHat,
  IndianRupee,
  Landmark,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { useDB } from '../data/store';
import { approvalVisible, useSession } from '../data/session';
import {
  alerts,
  costEntries,
  lookup,
  payablesAgeing,
  pendingApprovals,
  receivablesAgeing,
  siteCards,
  todaySummary,
  vehicleEfficiencySummary,
  COST_HEADS,
  COST_HEAD_LABEL,
} from '../data/selectors';
import { useSiteFilter } from '../components/layout/AppShell';
import { Badge, Button, Card, CardHeader, Progress, Stat } from '../components/ui/core';
import { BarList, ColumnChart, Donut, Sparkline } from '../components/ui/charts';
import { addDays, date, dateShort, inr, inrCompact, num, qty, today } from '../lib/format';
import { navigate } from '../lib/router';
import { cn, groupBy, sum } from '../lib/utils';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const db = useDB();
  const s = useSession();
  const { siteId } = useSiteFilter();
  const lk = lookup(db);
  const money = s.showRates;
  const t = today();

  const cards = useMemo(() => siteCards(db).filter((c) => s.seesSite(c.site.id) && (!siteId || c.site.id === siteId)), [db, s, siteId]);
  const tot = useMemo(
    () => ({
      contract: sum(cards, (c) => c.site.contractValue),
      workDone: sum(cards, (c) => c.workDone),
      billed: sum(cards, (c) => c.billed),
      received: sum(cards, (c) => c.received),
      cost: sum(cards, (c) => c.cost),
      profit: sum(cards, (c) => c.profit),
      stock: sum(cards, (c) => c.stockValue),
    }),
    [cards],
  );
  const visibleSites = new Set(cards.map((c) => c.site.id));

  // today across sites
  const todayStats = useMemo(() => {
    const ts = todaySummary(db, t);
    return ts;
  }, [db, t]);

  // last 30 days cost by head (stacked)
  const trend = useMemo(() => {
    const from = addDays(t, -29);
    const entries = costEntries(db).filter((c) => c.date >= from && c.date <= t && visibleSites.has(c.siteId) && c.head !== 'OVERHEAD');
    const byDay = groupBy(entries, (c) => c.date);
    const days: Array<{ label: string; values: Record<string, number> }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDays(t, -i);
      const vals: Record<string, number> = {};
      for (const e of byDay[d] || []) vals[e.head] = (vals[e.head] || 0) + e.amount;
      days.push({ label: dateShort(d), values: vals });
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, t, siteId]);

  const costMix = useMemo(() => COST_HEADS.map((h) => ({ label: COST_HEAD_LABEL[h], value: sum(cards, (c) => c.heads[h]) })).filter((x) => x.value > 0), [cards]);

  const approvals = useMemo(() => pendingApprovals(db).filter((a) => approvalVisible(s, a) && (!siteId || !a.siteId || a.siteId === siteId)), [db, s, siteId]);
  const al = useMemo(() => alerts(db).filter((a) => s.seesSite(a.siteId) && (!siteId || !a.siteId || a.siteId === siteId)), [db, s, siteId]);
  const payables = useMemo(() => payablesAgeing(db), [db]);
  const receivables = useMemo(() => receivablesAgeing(db).filter((r) => visibleSites.has(r.siteId)), [db, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // plant today
  const prodToday = todayStats.production;
  const dispToday = todayStats.dispatches.filter((d) => !d.siteId || visibleSites.has(d.siteId));
  const dispBySite = Object.entries(groupBy(dispToday.filter((d) => d.siteId), (d) => `${d.siteId}|${d.productId}`)).map(([k, rows]) => {
    const [sid, pid] = k.split('|');
    return { site: lk.site[sid!]?.short, product: lk.material[pid!]?.name, unit: lk.material[pid!]?.unit, qty: sum(rows, (r) => r.qty), trips: rows.length };
  });

  // vehicles
  const veh = db.vehicles.filter((v) => !siteId || v.siteId === siteId);
  const vCount = { WORKING: veh.filter((v) => v.status === 'WORKING').length, IDLE: veh.filter((v) => v.status === 'IDLE').length, BREAKDOWN: veh.filter((v) => v.status === 'BREAKDOWN').length };
  const outliers = useMemo(() => vehicleEfficiencySummary(db, { from: addDays(t, -30), to: t }).filter((e) => e.variancePct > db.settings.tolerance.fuel).sort((a, b) => b.variancePct - a.variancePct), [db, t]);

  // today's checklist for site engineers (ALT-05 prevention)
  const mySite = !s.allSites && s.siteIds.length ? (siteId || s.siteIds[0]) : null;
  const checklist = mySite
    ? [
        { label: 'Attendance', done: db.attendance.some((a) => a.siteId === mySite && a.date === t), path: '/labour/attendance?new=1', icon: Users },
        { label: 'Material consumption', done: db.stockTxns.some((x) => x.type === 'CONSUMPTION' && x.date === t && lk.store[x.fromStoreId!]?.siteId === mySite), path: '/inventory/transactions?new=CONSUMPTION', icon: ClipboardList },
        { label: 'Logbook (yesterday)', done: db.logs.some((l) => l.siteId === mySite && l.date === addDays(t, -1)), path: '/fleet/logbook?new=1', icon: Truck },
        { label: 'Expenses', done: db.expenses.some((e) => e.siteId === mySite && e.date === t), path: '/expenses/entries?new=1', icon: Receipt },
        { label: 'Confirm receipts', done: !db.dispatches.some((d) => d.siteId === mySite && d.status === 'DISPATCHED'), path: '/inventory/transit', icon: Boxes },
      ]
    : null;

  const spark = (head?: string) => trend.slice(-14).map((d) => (head ? d.values[head] || 0 : Object.values(d.values).reduce((a, b) => a + b, 0)));

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{date(t)} · FY {db.company.fy}</p>
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight mt-1">
            {greeting()}, {s.user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-fg-2 mt-1">
            {siteId ? lk.site[siteId]?.name : `${cards.length} sites · ${cards.filter((c) => c.site.status === 'ACTIVE').length} active`} · {approvals.length} approvals waiting · {al.filter((a) => a.severity === 'critical').length} critical alerts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.can('approvals', 'approve') && approvals.length > 0 && (
            <Button variant="primary" icon={<ShieldCheck className="w-4 h-4" />} onClick={() => navigate('/approvals')}>
              Review {approvals.length} approvals
            </Button>
          )}
          {s.can('reports') && (
            <Button icon={<ArrowUpRight className="w-4 h-4" />} onClick={() => navigate('/reports')}>
              Reports
            </Button>
          )}
        </div>
      </div>

      {checklist && (
        <Card className="p-4 sm:p-5 border-brand/40 bg-gradient-to-br from-brand-soft to-surface">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <div className="font-semibold">Today’s entries — {lk.site[mySite!]?.short}</div>
              <div className="text-xs text-fg-2">Finish these before {db.settings.attendanceLockHour}:00 tomorrow, when entries lock.</div>
            </div>
            <Badge tone={checklist.every((c) => c.done) ? 'good' : 'warn'}>
              {checklist.filter((c) => c.done).length}/{checklist.length} done
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 stagger">
            {checklist.map((c) => {
              const I = c.icon;
              return (
                <button key={c.label} onClick={() => navigate(c.path)} className={cn('flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all hover:shadow-card active:scale-[0.98]', c.done ? 'bg-good-soft border-transparent' : 'bg-surface border-line')}>
                  <I className={cn('w-4 h-4 shrink-0', c.done ? 'text-good' : 'text-muted')} />
                  <span className="text-[13px] font-medium flex-1 leading-tight">{c.label}</span>
                  {c.done ? <CircleCheck className="w-4 h-4 text-good" /> : <CircleDashed className="w-4 h-4 text-muted" />}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* headline KPIs */}
      {money ? (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 stagger">
          <Stat label="Contract value" value={tot.contract} format={inrCompact} icon={<Landmark className="w-[18px] h-[18px]" />} tone="info" sub={`${cards.length} work orders`} />
          <Stat label="Work done" value={tot.workDone} format={inrCompact} icon={<HardHat className="w-[18px] h-[18px]" />} tone="brand" sub={`${((tot.workDone / (tot.contract || 1)) * 100).toFixed(1)}% of contract value`} />
          <Stat label="Billed · received" value={tot.billed} format={inrCompact} icon={<IndianRupee className="w-[18px] h-[18px]" />} tone="violet" sub={`${inrCompact(tot.received)} received · ${inrCompact(tot.billed - tot.received)} due`} />
          <Stat label="Cost to date" value={tot.cost} format={inrCompact} icon={<Wallet className="w-[18px] h-[18px]" />} tone="warn" trend={<Sparkline values={spark()} color="var(--s2)" height={30} />} />
          <Stat
            label="Profit / loss"
            value={tot.profit}
            format={inrCompact}
            icon={tot.profit >= 0 ? <TrendingUp className="w-[18px] h-[18px]" /> : <TrendingDown className="w-[18px] h-[18px]" />}
            tone={tot.profit >= 0 ? 'good' : 'bad'}
            sub={`${((tot.profit / (tot.workDone || 1)) * 100).toFixed(1)}% margin on work done`}
            className="col-span-2 xl:col-span-1"
          />
        </div>
      ) : null}

      {/* today strip */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fg-2 uppercase tracking-wider">Today across {siteId ? 'the site' : 'all sites'}</h2>
          <span className="text-xs text-muted">Live from entries made today</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
          <Stat label="Labour on site" value={todayStats.headcount} format={(n) => num(n)} icon={<Users className="w-[18px] h-[18px]" />} tone="violet" sub={money ? `${inr(todayStats.labourCost)} wages today` : 'own + contractor headcount'} onClick={() => navigate('/labour/daily')} />
          <Stat label="Material consumed" value={money ? todayStats.consumedValue : db.stockTxns.filter((x) => x.type === 'CONSUMPTION' && x.date === t).length} format={money ? inrCompact : (n) => `${Math.round(n)} entries`} icon={<Boxes className="w-[18px] h-[18px]" />} tone="brand" sub={money ? `${inrCompact(todayStats.receivedValue)} received` : 'consumption vouchers'} onClick={() => navigate('/inventory/daily')} />
          <Stat label="Fuel issued" value={todayStats.fuelLitres} format={(n) => `${num(n)} L`} icon={<Fuel className="w-[18px] h-[18px]" />} tone="warn" sub={money ? inr(todayStats.fuelValue) : `${db.fuelIssues.filter((f) => f.date === t).length} fills`} onClick={() => navigate('/fleet/fuel')} />
          <Stat label="Site expenses" value={todayStats.expenses} format={money ? inr : (n) => `${Math.round(n) ? 'Entered' : '—'}`} icon={<Receipt className="w-[18px] h-[18px]" />} tone="bad" sub={`${db.expenses.filter((e) => e.date === t).length} bills today`} onClick={() => navigate('/expenses/entries')} />
        </div>
      </div>

      {/* site cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fg-2 uppercase tracking-wider">Site-wise position</h2>
          <button onClick={() => navigate('/contract/costing')} className="text-xs font-semibold text-brand-strong hover:underline inline-flex items-center gap-1">
            Profitability <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 stagger">
          {cards.map((c) => (
            <Card key={c.site.id} hover className="p-4 sm:p-5 cursor-pointer" onClick={() => navigate(`/contract/costing?site=${c.site.id}`)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-surface-3 text-fg-2">{c.site.code}</span>
                    <Badge tone={c.site.status === 'ACTIVE' ? 'good' : 'warn'} dot>
                      {c.site.status === 'ACTIVE' ? 'Active' : 'On hold'}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-[15px] mt-2 leading-snug">{c.site.name}</h3>
                  <p className="text-xs text-muted mt-0.5 truncate">{c.client?.name}</p>
                </div>
                {money && (
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-muted">Contract</div>
                    <div className="text-sm font-bold">{inrCompact(c.site.contractValue)}</div>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-fg-2">Work done</span>
                  <span className="font-semibold num">{c.workDonePct.toFixed(1)}%</span>
                </div>
                <Progress value={c.workDonePct} tone="brand" />
              </div>
              {money ? (
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-line">
                  <div>
                    <div className="text-[11px] text-muted">Billed</div>
                    <div className="text-sm font-semibold num">{inrCompact(c.billed)}</div>
                    <div className="text-[10px] text-muted">rcvd {inrCompact(c.received)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Cost to date</div>
                    <div className="text-sm font-semibold num">{inrCompact(c.cost)}</div>
                    <div className="text-[10px] text-muted">stock {inrCompact(c.stockValue)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Profit / loss</div>
                    <div className={cn('text-sm font-bold num inline-flex items-center gap-1', c.profit >= 0 ? 'text-good' : 'text-bad')}>
                      {c.profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {inrCompact(c.profit)}
                    </div>
                    <div className="text-[10px] text-muted">{c.margin.toFixed(1)}% margin</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted mt-4 pt-3 border-t border-line">Engineer: {lk.user[c.site.engineerId || '']?.name} · {c.site.location}</div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* trend + mix */}
      {money && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader title="Daily site cost — last 30 days" subtitle="Charged from consumption, labour, sub-contract, vehicles and expenses" />
            <div className="px-4 sm:px-5 pb-5">
              <ColumnChart
                data={trend}
                stacked
                height={240}
                format={inrCompact}
                series={COST_HEADS.filter((h) => h !== 'OVERHEAD').map((h) => ({ key: h, label: COST_HEAD_LABEL[h] }))}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Cost mix to date" subtitle="All cost heads incl. allocated overheads" />
            <div className="px-4 sm:px-5 pb-5">
              <Donut segments={costMix} format={inrCompact} center={<><div className="text-[11px] text-muted">Total cost</div><div className="text-lg font-bold">{inrCompact(tot.cost)}</div></>} />
            </div>
          </Card>
        </div>
      )}

      {/* plant + fleet + approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Plants today" subtitle="Production and dispatch by site" icon={<Factory className="w-[18px] h-[18px]" />} action={<Button size="sm" variant="ghost" onClick={() => navigate('/plant/overview')}>Open</Button>} />
          <div className="px-4 sm:px-5 pb-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {db.plants.map((p) => {
                const q = sum(prodToday.filter((x) => x.plantId === p.id), (x) => x.qty);
                return (
                  <div key={p.id} className="rounded-xl bg-surface-2 border border-line p-2.5">
                    <div className="text-[11px] text-muted">{p.code}</div>
                    <div className="text-base font-bold num">{num(q)}</div>
                    <div className="text-[10px] text-muted">{p.type === 'BATCHING' ? 'cum' : 'MT'} produced</div>
                  </div>
                );
              })}
            </div>
            {dispBySite.length ? (
              <BarList rows={dispBySite.map((d) => ({ label: `${d.site} · ${d.product}`, value: d.qty, sub: `${d.trips} trips` }))} format={(n) => num(n, 1)} />
            ) : (
              <p className="text-xs text-muted">No dispatches yet today.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Fleet" subtitle={`${veh.length} vehicles & machines`} icon={<Truck className="w-[18px] h-[18px]" />} action={<Button size="sm" variant="ghost" onClick={() => navigate('/fleet/overview')}>Open</Button>} />
          <div className="px-4 sm:px-5 pb-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['Working', vCount.WORKING, 'text-good bg-good-soft'],
                  ['Idle', vCount.IDLE, 'text-warn bg-warn-soft'],
                  ['Breakdown', vCount.BREAKDOWN, 'text-bad bg-bad-soft'],
                ] as const
              ).map(([l, n, c]) => (
                <div key={l} className={cn('rounded-xl p-2.5 text-center', c)}>
                  <div className="text-xl font-bold">{n}</div>
                  <div className="text-[11px] font-medium">{l}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold text-fg-2 mb-2">Fuel variance outliers (30 days)</div>
              {outliers.length ? (
                <div className="space-y-2">
                  {outliers.slice(0, 4).map((o) => (
                    <button key={o.vehicleId} onClick={() => navigate('/fleet/efficiency')} className="w-full flex items-center justify-between text-[13px] p-2 rounded-lg hover:bg-surface-3">
                      <span className="text-left">
                        <span className="font-medium">{lk.vehicle[o.vehicleId]?.code}</span> <span className="text-muted">{lk.vehicle[o.vehicleId]?.type}</span>
                      </span>
                      <Badge tone="bad">+{o.variancePct.toFixed(1)}%</Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">All vehicles within {db.settings.tolerance.fuel}% of standard.</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Waiting on you" subtitle="Approvals, payables and receivables" icon={<ShieldCheck className="w-[18px] h-[18px]" />} />
          <div className="px-4 sm:px-5 pb-5 space-y-2">
            <button onClick={() => navigate('/approvals')} className="w-full flex items-center justify-between p-3 rounded-xl bg-brand-soft hover:brightness-95 transition">
              <span className="text-sm font-medium">Pending approvals</span>
              <span className="text-lg font-bold text-brand-strong">{approvals.length}</span>
            </button>
            {money && (
              <>
                <button onClick={() => navigate('/purchase/payables')} className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line hover:border-line-strong">
                  <span className="text-left">
                    <span className="block text-sm font-medium">Payables overdue</span>
                    <span className="block text-[11px] text-muted">{inrCompact(sum(payables, (p) => p.dueSoon))} due this week</span>
                  </span>
                  <span className="text-base font-bold text-bad">{inrCompact(sum(payables, (p) => p.overdue))}</span>
                </button>
                <button onClick={() => navigate('/contract/receivables')} className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line hover:border-line-strong">
                  <span className="text-left">
                    <span className="block text-sm font-medium">Receivables from clients</span>
                    <span className="block text-[11px] text-muted">{receivables.filter((r) => r.age > 45).length} bills older than 45 days</span>
                  </span>
                  <span className="text-base font-bold text-good">{inrCompact(sum(receivables, (r) => r.outstanding))}</span>
                </button>
              </>
            )}
            <div className="pt-2">
              {approvals.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 py-2 border-b border-line last:border-0">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{a.title}</div>
                    <div className="text-[11px] text-muted truncate">{a.detail}</div>
                  </div>
                  {money && a.amount ? <span className="text-xs font-semibold num shrink-0">{inr(a.amount)}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* alerts */}
      <Card>
        <CardHeader title="Alerts" subtitle="Stock, consumption, documents, pending work, budget and dues" action={<Button size="sm" variant="ghost" onClick={() => navigate('/alerts')}>View all {al.length}</Button>} />
        <div className="px-2 sm:px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-1">
          {al.slice(0, 8).map((a) => (
            <button key={a.id} onClick={() => navigate(a.link)} className="flex items-start gap-3 p-3 rounded-xl hover:bg-surface-2 text-left">
              <span className={cn('mt-1 w-2.5 h-2.5 rounded-full shrink-0', a.severity === 'critical' ? 'bg-bad' : a.severity === 'serious' ? 'bg-orange-500' : 'bg-warn')} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{a.title}</span>
                <span className="block text-[11px] text-muted truncate">
                  {a.code} · {a.detail}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      <p className="text-center text-[11px] text-muted">
        Stock valued at weighted average · {qty(db.stockTxns.length)} stock vouchers · {qty(db.dispatches.length)} plant trips · dashboard computed in your browser
      </p>
    </div>
  );
}
