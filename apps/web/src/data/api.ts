import type { DB, ID } from './types';

/**
 * Talking to the WCM server (API mode). The app runs in API mode when built with VITE_DATA_MODE=api;
 * otherwise it is the self-contained demo that keeps changes in the browser.
 */
export const API_MODE = import.meta.env.VITE_DATA_MODE === 'api';
const BASE = String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '') + '/v2';
const TOKEN_KEY = 'wcm-token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let token = '';
try {
  token = localStorage.getItem(TOKEN_KEY) || '';
} catch {
  /* storage unavailable */
}
export const hasToken = () => !!token;
export function setToken(t: string) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function call<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(navigator.onLine ? `Cannot reach the server at ${BASE.replace(/\/v2$/, '')} — ${BASE.startsWith('/') ? 'check the internet connection' : 'this address is not this site; remove VITE_API_URL from the hosting settings and redeploy'}` : 'No internet connection', 0);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // an HTML page where JSON was expected: the server part is not deployed at this address
    if (/^\s*</.test(text)) throw new ApiError('The server is not running at /api on this site — the hosting is serving only the web pages. See docs/VERCEL_MONGODB.md, step 2.', res.status || 502);
  }
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(Array.isArray(m) ? m.join(', ') : m || `Server error (${res.status})`, res.status);
  }
  return data as T;
}

export interface SignedIn {
  token: string;
  companyId: string;
  userId: ID;
}
export interface OtpNeeded {
  otpRequired: true;
  ticket: string;
  phone: string;
}
export interface LoginConfig {
  demo: null | { companyId: string; users: Array<{ id: ID; name: string; username: string; roleId: ID; role?: string; sites: number }> };
  needsCompany: boolean;
  /** a new server with no company yet (MongoDB / serverless version) */
  setup?: null | { templates: Array<{ id: string; label: string }>; keyConfigured: boolean };
}
export interface Snapshot {
  rev: number;
  companyId: string;
  isDemo: boolean;
  userId: ID;
  db: DB;
}
export type ServerChange = { coll: string; id: ID; rec: any } | { single: 'settings' | 'company' | 'seq'; value: any };
export interface CommandResult {
  rev: number;
  record?: any;
  changes: ServerChange[];
}

export interface BackupInfo {
  id: number;
  created_at: string;
  kind: 'daily' | 'manual';
  size: number;
  rev: number;
  records: number;
}
export interface RestoreCheck {
  company: string;
  ok: boolean;
  mismatches: string[];
  expected: Record<string, number>;
  actual: Record<string, number>;
  backupId: number;
  backupAt: string;
  records: number;
}

export const api = {
  config: () => call<LoginConfig>('/auth/config'),
  setup: (b: Record<string, unknown>) => call<{ ok: true; company: string; username: string; name: string }>('/setup', b),
  login: (username: string, password: string, company?: string) => call<SignedIn | OtpNeeded>('/auth/login', { username, password, company }),
  otpRequest: (login: string, company?: string) => call<{ ticket: string; phone: string; demo: boolean }>('/auth/otp/request', { login, company }),
  otpVerify: (ticket: string, code: string) => call<SignedIn>('/auth/otp/verify', { ticket, code }),
  demoLogin: (userId: ID) => call<SignedIn>('/auth/demo', { userId }),
  changePassword: (current: string, next: string) => call<{ ok: true }>('/auth/password', { current, next }),
  snapshot: () => call<Snapshot>('/data/snapshot'),
  rev: () => call<{ rev: number }>('/data/rev'),
  /** cmdId makes a retry safe: the server answers a repeated id with the first result */
  command: (cmd: unknown, cmdId?: string) => call<CommandResult>('/data/commands', { cmd, cmdId }),
  setUserPassword: (userId: ID, password: string) => call<{ ok: true }>(`/admin/users/${encodeURIComponent(userId)}/password`, { password }),
  resetDemo: () => call<{ ok: true }>('/admin/reset-demo', {}),
  backups: () => call<{ backups: BackupInfo[]; testCopies: Array<{ id: string; name: string }>; daily: boolean; offsite: boolean }>('/admin/backups'),
  backupNow: () => call<BackupInfo>('/admin/backups', {}),
  restoreTest: (id: number) => call<RestoreCheck>(`/admin/backups/${id}/restore-test`, {}),
  dropTestCopy: (code: string) => call<{ ok: true }>(`/admin/test-copies/${encodeURIComponent(code)}`, undefined, 'DELETE'),
  downloadBackup: async (id: number): Promise<Blob> => {
    const res = await fetch(`${BASE}/admin/backups/${id}/download`, { headers: { authorization: `Bearer ${token}` } }).catch(() => {
      throw new ApiError('Cannot reach the server', 0);
    });
    if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
    return res.blob();
  },
};
