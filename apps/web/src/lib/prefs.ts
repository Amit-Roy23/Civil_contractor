import { useSyncExternalStore } from 'react';

/** Small persisted UI preferences: theme, site filter, sidebar state. */
type Prefs = { theme: 'light' | 'dark'; site: string; collapsed: boolean };
const KEY = 'wcm-prefs';
const listeners = new Set<() => void>();

function load(): Prefs {
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { theme: p.theme || (dark ? 'dark' : 'light'), site: p.site || '', collapsed: !!p.collapsed };
  } catch {
    return { theme: dark ? 'dark' : 'light', site: '', collapsed: false };
  }
}
let prefs = load();

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', prefs.theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.theme === 'dark' ? '#070b14' : '#0e1626');
}

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  prefs = { ...prefs, [k]: v };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  if (k === 'theme') applyTheme();
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
    () => prefs,
  );
}
