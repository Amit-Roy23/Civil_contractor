import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  ChevronDown,
  ChevronsLeft,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Sun,
  UserCog,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { NAV, type NavModule } from './nav';
import { navigate, useLocation } from '../../lib/router';
import { setPref, usePrefs } from '../../lib/prefs';
import { cn, initials } from '../../lib/utils';
import { useDB, setCurrentUser, markNotificationsRead, resetDemo } from '../../data/store';
import { approvalVisible, useSession } from '../../data/session';
import { alerts, pendingApprovals } from '../../data/selectors';
import { Badge, Button, Modal, toast } from '../ui/core';
import { relTime } from '../../lib/format';
import { CommandPalette } from './CommandPalette';
import { QuickEntry } from './QuickEntry';

/* ---------- site filter (every screen honours it; ROLE-02 limits the choices) ---------- */
export function useSiteFilter() {
  const { site } = usePrefs();
  const s = useSession();
  const db = useDB();
  const sites = db.sites.filter((x) => s.seesSite(x.id));
  const siteId = site && sites.some((x) => x.id === site) ? site : !s.allSites && sites.length === 1 ? sites[0]!.id : '';
  return { siteId, setSite: (id: string) => setPref('site', id), sites };
}

function SitePicker({ compact }: { compact?: boolean }) {
  const { siteId, setSite, sites } = useSiteFilter();
  const s = useSession();
  return (
    <div className={cn('relative flex items-center gap-2 h-10 rounded-xl border border-line bg-surface pl-3 pr-8 text-sm hover:border-line-strong transition-colors', compact ? 'max-w-[170px]' : 'max-w-[280px]')}>
      <MapPin className="w-4 h-4 text-brand-strong shrink-0" />
      <select value={siteId} onChange={(e) => setSite(e.target.value)} className="appearance-none bg-transparent w-full truncate focus:outline-none cursor-pointer font-medium text-fg" aria-label="Site filter">
        {(s.allSites || sites.length > 1) && <option value="">{s.allSites ? 'All sites' : 'All my sites'}</option>}
        {sites.map((x) => (
          <option key={x.id} value={x.id}>
            {x.short}
            {x.status !== 'ACTIVE' ? ' (on hold)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 text-muted absolute right-2.5 pointer-events-none" />
    </div>
  );
}

/* ---------- sidebar ---------- */
function NavLinks({ onNav, collapsed }: { onNav?: () => void; collapsed?: boolean }) {
  const { segs } = useLocation();
  const s = useSession();
  const db = useDB();
  const approvals = useMemo(() => pendingApprovals(db).filter((a) => approvalVisible(s, a)).length, [db, s]);
  const alertCount = useMemo(() => alerts(db).filter((a) => s.seesSite(a.siteId)).length, [db, s]);
  const groups = ['Overview', 'Operations', 'Commercial', 'Control'] as const;
  const active = (n: NavModule) => (n.path === '/' ? segs.length === 0 : `/${segs[0]}` === n.path);
  return (
    <nav className="space-y-5">
      {groups.map((g) => {
        const items = NAV.filter((n) => n.group === g && s.can(n.key));
        if (!items.length) return null;
        return (
          <div key={g}>
            {!collapsed && <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-side-fg/50">{g}</div>}
            <div className="space-y-0.5">
              {items.map((n) => {
                const Icon = n.icon;
                const on = active(n);
                const count = n.key === 'approvals' ? approvals : n.key === 'alerts' ? alertCount : 0;
                return (
                  <a
                    key={n.key}
                    href={n.path}
                    title={collapsed ? n.label : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(n.path);
                      onNav?.();
                    }}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl text-[13.5px] font-medium transition-all duration-150',
                      collapsed ? 'justify-center h-10 w-10 mx-auto' : 'px-3 h-10',
                      on ? 'bg-white/10 text-white' : 'text-side-fg hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-brand" />}
                    <Icon className={cn('w-[18px] h-[18px] shrink-0 transition-colors', on ? 'text-brand' : 'text-side-fg/70 group-hover:text-white')} />
                    {!collapsed && <span className="truncate flex-1">{n.label}</span>}
                    {count > 0 &&
                      (collapsed ? (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand" />
                      ) : (
                        <span className={cn('min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center', n.key === 'alerts' ? 'bg-bad/90 text-white' : 'bg-brand text-brand-ink')}>{count}</span>
                      ))}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const db = useDB();
  return (
    <div className={cn('flex items-center gap-3 h-16 shrink-0', collapsed ? 'justify-center' : 'px-4')}>
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/30 shrink-0">
        <Building2 className="w-5 h-5 text-white" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="text-white font-bold text-[15px] leading-tight tracking-tight">WCM</div>
          <div className="text-[11px] text-side-fg/60 truncate">{db.company.name.replace(' Pvt. Ltd.', '')}</div>
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  const { collapsed } = usePrefs();
  return (
    <aside className={cn('hidden lg:flex flex-col bg-side shrink-0 h-full transition-[width] duration-300 ease-out relative z-20', collapsed ? 'w-[76px]' : 'w-[248px]')}>
      <Brand collapsed={collapsed} />
      <div className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')} style={{ scrollbarColor: '#334155 transparent' }}>
        <NavLinks collapsed={collapsed} />
      </div>
      <button onClick={() => setPref('collapsed', !collapsed)} className="m-3 h-9 rounded-xl text-side-fg/70 hover:text-white hover:bg-white/5 flex items-center justify-center gap-2 text-xs" aria-label="Collapse sidebar">
        <ChevronsLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 anim-fade" onClick={onClose} />
      <aside className="absolute left-0 top-0 bottom-0 w-[82%] max-w-[300px] bg-side flex flex-col anim-drawer-left">
        <div className="flex items-center justify-between pr-3">
          <Brand />
          <button onClick={onClose} className="p-2 text-side-fg rounded-lg hover:bg-white/10" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks onNav={onClose} />
        </div>
      </aside>
    </div>
  );
}

/* ---------- notifications ---------- */
function Notifications() {
  const db = useDB();
  const s = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const al = useMemo(() => alerts(db).filter((a) => s.seesSite(a.siteId)), [db, s]);
  const ap = useMemo(() => pendingApprovals(db).filter((a) => approvalVisible(s, a)), [db, s]);
  const notes = db.notifications.slice().reverse();
  const unread = notes.filter((n) => !n.read).length + al.filter((a) => a.severity === 'critical').length;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const go = (link: string) => {
    navigate(link);
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" onClick={() => (setOpen((o) => !o), notes.length && markNotificationsRead())} aria-label="Notifications" className="relative">
        <Bell className="w-5 h-5" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-bad ring-2 ring-surface pulse-ring" />}
      </Button>
      {open && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-96 z-40 bg-surface border border-line rounded-2xl shadow-pop anim-pop overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="font-semibold text-sm">Notifications</div>
            <span className="text-[11px] text-muted">In-app · WhatsApp / SMS where configured</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-line">
            {ap.length > 0 && (
              <button onClick={() => go('/approvals')} className="w-full text-left px-4 py-3 hover:bg-surface-2 flex gap-3">
                <span className="w-2 h-2 rounded-full bg-brand mt-1.5 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">{ap.length} entries waiting for your approval</span>
                  <span className="block text-xs text-muted">{ap.slice(-2).map((a) => a.title).join(' · ')}</span>
                </span>
              </button>
            )}
            {notes.slice(0, 6).map((n) => (
              <button key={n.id} onClick={() => go(n.link)} className="w-full text-left px-4 py-3 hover:bg-surface-2 flex gap-3">
                <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', n.tone === 'good' ? 'bg-good' : n.tone === 'bad' ? 'bg-bad' : n.tone === 'warn' ? 'bg-warn' : 'bg-info')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="block text-xs text-muted truncate">
                    {n.body} · {relTime(n.at)}
                  </span>
                </span>
              </button>
            ))}
            {al.slice(0, 8).map((a) => (
              <button key={a.id} onClick={() => go(a.link)} className="w-full text-left px-4 py-3 hover:bg-surface-2 flex gap-3">
                <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', a.severity === 'critical' ? 'bg-bad' : a.severity === 'serious' ? 'bg-orange-500' : 'bg-warn')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.title}</span>
                  <span className="block text-xs text-muted truncate">
                    {a.code} · {a.detail}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => go('/alerts')} className="w-full py-2.5 text-[13px] font-semibold text-brand-strong border-t border-line hover:bg-surface-2">
            View all alerts
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- user menu (demo role switch) ---------- */
function UserMenu() {
  const db = useDB();
  const s = useSession();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const switchTo = (id: string) => {
    setCurrentUser(id);
    setOpen(false);
    const u = db.users.find((x) => x.id === id)!;
    toast.info(`Signed in as ${u.name}`, db.roles.find((r) => r.id === u.roleId)?.name);
    navigate('/');
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-xl hover:bg-surface-3 transition-colors">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-white text-xs font-bold flex items-center justify-center">{initials(s.user.name)}</span>
        <span className="hidden xl:block text-left leading-tight">
          <span className="block text-[13px] font-semibold text-fg">{s.user.name}</span>
          <span className="block text-[11px] text-muted">{s.role.name}</span>
        </span>
        <ChevronDown className="w-4 h-4 text-muted hidden sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 z-40 bg-surface border border-line rounded-2xl shadow-pop anim-pop overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <div className="font-semibold text-sm">{s.user.name}</div>
            <div className="text-xs text-muted">
              {s.role.name} · {s.allSites ? 'All sites' : `${s.siteIds.length || s.plantIds.length} assigned`}
            </div>
          </div>
          <div className="px-2 pt-2 text-[10px] uppercase tracking-wider text-muted font-semibold px-4">Demo: switch user / role</div>
          <div className="p-2 max-h-72 overflow-y-auto">
            {db.users.map((u) => (
              <button key={u.id} onClick={() => switchTo(u.id)} className={cn('w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-surface-3', u.id === s.user.id && 'bg-brand-soft')}>
                <span className="w-8 h-8 rounded-lg bg-surface-3 text-[11px] font-bold flex items-center justify-center shrink-0">{initials(u.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate">{u.name}</span>
                  <span className="block text-[11px] text-muted truncate">
                    {db.roles.find((r) => r.id === u.roleId)?.name}
                    {u.siteIds.length ? ` · ${u.siteIds.map((id) => db.sites.find((x) => x.id === id)?.short).join(', ')}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-line p-2">
            <button onClick={() => (navigate('/admin/settings'), setOpen(false))} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-surface-3" hidden={!s.can('admin')}>
              <UserCog className="w-4 h-4" /> Settings
            </button>
            <button onClick={() => setConfirmReset(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-surface-3">
              <RotateCcw className="w-4 h-4" /> Reset demo data
            </button>
            <button onClick={() => setCurrentUser('')} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-bad hover:bg-bad-soft">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => (resetDemo(), setConfirmReset(false), setOpen(false), toast.success('Demo data restored'))}>
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">Every entry you added or changed in this browser will be discarded and the original sample data for all sites will be restored.</p>
      </Modal>
    </div>
  );
}

function OnlineDot() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <span title={online ? 'Online' : 'Offline — entries are kept on this device and synced later'} className={cn('hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[11px] font-semibold', online ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad pulse-ring')}>
      {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { theme } = usePrefs();
  const db = useDB();
  return (
    <header className="h-16 shrink-0 bg-surface/85 backdrop-blur-md border-b border-line flex items-center gap-2 sm:gap-3 px-3 sm:px-5 sticky top-0 z-30">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="w-5 h-5" />
      </Button>
      <SitePicker compact />
      <button onClick={onSearch} className="hidden md:flex items-center gap-2 h-10 px-3 rounded-xl border border-line bg-surface-2 text-sm text-muted hover:border-line-strong w-64 xl:w-80 transition-colors">
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface border border-line">Ctrl K</kbd>
      </button>
      <div className="flex-1" />
      <span className="hidden sm:block">
        <Badge tone="neutral">FY {db.company.fy}</Badge>
      </span>
      <OnlineDot />
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onSearch} aria-label="Search">
        <Search className="w-5 h-5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setPref('theme', theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </Button>
      <Notifications />
      <UserMenu />
    </header>
  );
}

/* ---------- bottom nav (phones) ---------- */
function BottomNav({ onMenu, onQuick }: { onMenu: () => void; onQuick: () => void }) {
  const { segs } = useLocation();
  const s = useSession();
  const db = useDB();
  const ap = useMemo(() => pendingApprovals(db).filter((a) => approvalVisible(s, a)).length, [db, s]);
  const items = [
    { path: '/', label: 'Home', icon: NAV[0]!.icon, on: segs.length === 0 },
    { path: '/approvals', label: 'Approve', icon: NAV[1]!.icon, on: segs[0] === 'approvals', count: ap },
  ];
  const right = [{ path: '/alerts', label: 'Alerts', icon: NAV[2]!.icon, on: segs[0] === 'alerts' }];
  const Item = ({ it }: { it: { path: string; label: string; icon: any; on: boolean; count?: number } }) => {
    const I = it.icon;
    return (
      <button onClick={() => navigate(it.path)} className={cn('relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium', it.on ? 'text-brand-strong' : 'text-muted')}>
        <I className="w-5 h-5" />
        {it.label}
        {!!it.count && <span className="absolute top-1 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-brand text-brand-ink text-[9px] font-bold flex items-center justify-center">{it.count}</span>}
      </button>
    );
  };
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-md border-t border-line flex items-stretch h-16 pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => (
        <Item key={it.path} it={it} />
      ))}
      <div className="flex-1 flex items-center justify-center">
        <button onClick={onQuick} className="w-12 h-12 -mt-6 rounded-2xl bg-brand text-brand-ink shadow-lg shadow-brand/40 flex items-center justify-center active:scale-95 transition-transform" aria-label="New entry">
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>
      {right.map((it) => (
        <Item key={it.path} it={it} />
      ))}
      <button onClick={onMenu} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted">
        <Menu className="w-5 h-5" />
        Menu
      </button>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [quick, setQuick] = useState(false);
  const { path } = useLocation();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar />
      <MobileDrawer open={menu} onClose={() => setMenu(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setMenu(true)} onSearch={() => setSearch(true)} />
        <main id="main-scroll" className="flex-1 overflow-y-auto overflow-x-hidden">
          <div key={path} className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-28 lg:pb-10 anim-page">
            {children}
          </div>
        </main>
      </div>
      <BottomNav onMenu={() => setMenu(true)} onQuick={() => setQuick(true)} />
      <CommandPalette open={search} onClose={() => setSearch(false)} />
      <QuickEntry open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}
