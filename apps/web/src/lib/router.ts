import { useSyncExternalStore } from 'react';

/** Tiny history-API router: /module/tab?query */
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', emit);
}

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  emit();
  document.getElementById('main-scroll')?.scrollTo({ top: 0 });
}

function getSnapshot() {
  return location.pathname + location.search;
}

export function useLocation() {
  const href = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot,
    getSnapshot,
  );
  const [path, search = ''] = href.split('?');
  const segs = path!.split('/').filter(Boolean);
  return { path: path!, segs, query: new URLSearchParams(search) };
}

export function setQuery(key: string, value: string | null) {
  const q = new URLSearchParams(location.search);
  if (value === null || value === '') q.delete(key);
  else q.set(key, value);
  const s = q.toString();
  navigate(location.pathname + (s ? `?${s}` : ''), true);
}
