import React, { Suspense, lazy, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Button, PageSkeleton, Toaster, toast } from './components/ui/core';
import { useLocation, navigate } from './lib/router';
import { getCurrentUserId, setCurrentUser, useApiState, useDB } from './data/store';
import { API_MODE } from './data/api';
import { buildSession } from './data/session';
import { navByPath } from './components/layout/nav';
import Login from './pages/Login';

const pages: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: lazy(() => import('./pages/Dashboard')),
  approvals: lazy(() => import('./pages/Approvals')),
  alerts: lazy(() => import('./pages/Alerts')),
  inventory: lazy(() => import('./pages/inventory/Inventory')),
  purchase: lazy(() => import('./pages/purchase/Purchase')),
  labour: lazy(() => import('./pages/labour/Labour')),
  staff: lazy(() => import('./pages/staff/Staff')),
  expenses: lazy(() => import('./pages/expenses/Expenses')),
  fleet: lazy(() => import('./pages/fleet/Fleet')),
  plant: lazy(() => import('./pages/plant/Plant')),
  contract: lazy(() => import('./pages/contract/Contract')),
  reports: lazy(() => import('./pages/Reports')),
  masters: lazy(() => import('./pages/masters/Masters')),
  admin: lazy(() => import('./pages/admin/Admin')),
};

/** one screen failing must not take the whole app down; the rest of the menu keeps working */
class ScreenBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3 px-4">
        <div className="text-lg font-semibold">This screen could not open</div>
        <p className="text-sm text-fg-2">Your data is safe. Try again, or use another screen from the menu. If it keeps happening, tell us what you clicked.</p>
        <p className="text-xs text-muted font-mono break-words">{this.state.error.message}</p>
        <Button variant="primary" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}

/** SEC-02: sign out after the configured idle time */
function useIdleTimeout(minutes: number, active: boolean) {
  useEffect(() => {
    if (!active) return;
    let t: number;
    const reset = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        setCurrentUser('');
        toast.warn('Signed out', `No activity for ${minutes} minutes.`);
      }, minutes * 60000);
    };
    const evs = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, active]);
}

export default function App() {
  const db = useDB();
  const { segs } = useLocation();
  const conn = useApiState();
  const session = buildSession(db, getCurrentUserId());
  useIdleTimeout(db.settings.sessionTimeoutMin, !!session);

  if (API_MODE && conn.phase === 'loading') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-3 bg-bg text-fg-2 text-sm">
        <span className="w-10 h-10 rounded-full border-[3px] border-line border-t-brand animate-spin" />
        Loading your company data…
      </div>
    );
  }
  if (API_MODE && conn.phase === 'error') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <div className="text-lg font-semibold">Can't reach the server</div>
        <p className="text-sm text-fg-2 max-w-sm">{conn.error}</p>
        <div className="flex gap-2">
          <Button onClick={() => setCurrentUser('')}>Sign out</Button>
          <Button variant="primary" onClick={() => location.reload()}>Try again</Button>
        </div>
        <Toaster />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Login />
        <Toaster />
      </>
    );
  }
  const mod = navByPath(segs[0]);
  const allowed = mod && session.can(mod.key);
  if (!allowed && segs.length) {
    setTimeout(() => navigate('/', true));
  }
  const Page = pages[allowed ? mod!.key : 'dashboard']!;
  return (
    <>
      <AppShell>
        <ScreenBoundary key={segs.join('/')}>
          <Suspense fallback={<PageSkeleton />}>
            <Page />
          </Suspense>
        </ScreenBoundary>
      </AppShell>
      <Toaster />
    </>
  );
}
