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
    throw new ApiError('Cannot reach the server — check the internet connection', 0);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
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

export const api = {
  config: () => call<LoginConfig>('/auth/config'),
  login: (username: string, password: string, company?: string) => call<SignedIn | OtpNeeded>('/auth/login', { username, password, company }),
  otpRequest: (login: string, company?: string) => call<{ ticket: string; phone: string; demo: boolean }>('/auth/otp/request', { login, company }),
  otpVerify: (ticket: string, code: string) => call<SignedIn>('/auth/otp/verify', { ticket, code }),
  demoLogin: (userId: ID) => call<SignedIn>('/auth/demo', { userId }),
  changePassword: (current: string, next: string) => call<{ ok: true }>('/auth/password', { current, next }),
  snapshot: () => call<Snapshot>('/data/snapshot'),
  rev: () => call<{ rev: number }>('/data/rev'),
  command: (cmd: unknown) => call<CommandResult>('/data/commands', { cmd }),
  setUserPassword: (userId: ID, password: string) => call<{ ok: true }>(`/admin/users/${encodeURIComponent(userId)}/password`, { password }),
  resetDemo: () => call<{ ok: true }>('/admin/reset-demo', {}),
};
