import { useMemo } from 'react';
import type { DB, ID, ModuleKey, Perm, Role, User } from './types';
import { getCurrentUserId, useDB } from './store';

export interface Session {
  user: User;
  role: Role;
  can: (m: ModuleKey, p?: Perm) => boolean;
  showRates: boolean;
  allSites: boolean;
  siteIds: ID[]; // visible sites
  storeIds: ID[]; // visible stores
  plantIds: ID[];
  seesSite: (siteId?: ID) => boolean;
  seesStore: (storeId?: ID) => boolean;
  isAdmin: boolean;
}

export function buildSession(db: DB, userId: ID): Session | null {
  const user = db.users.find((u) => u.id === userId && u.active);
  if (!user) return null;
  const r0 = db.roles.find((r) => r.id === user.roleId)!;
  // Infinity does not survive JSON (journal) — treat a missing limit as unlimited
  const role = { ...r0, approvalLimit: r0.approvalLimit ?? Infinity };
  const allSites = role.allSites;
  const siteIds = allSites ? db.sites.map((s) => s.id) : user.siteIds;
  const plantIds = allSites || role.id === 'plant' ? (user.plantIds.length ? user.plantIds : db.plants.map((p) => p.id)) : user.plantIds;
  const storeIds = db.stores
    .filter((s) => allSites || (s.siteId && siteIds.includes(s.siteId)) || (s.plantId && plantIds.includes(s.plantId)) || (s.type === 'CENTRAL' && (role.id === 'store' || role.id === 'accountant')))
    .map((s) => s.id);
  return {
    user,
    role,
    can: (m, p = 'view') => role.perms[m]?.includes(p) ?? false,
    showRates: role.ratesVisible,
    allSites,
    siteIds,
    storeIds,
    plantIds,
    seesSite: (id) => !id || allSites || siteIds.includes(id),
    seesStore: (id) => !id || storeIds.includes(id),
    isAdmin: role.id === 'owner',
  };
}

export function useSession(): Session {
  const db = useDB();
  const id = getCurrentUserId();
  const s = useMemo(() => buildSession(db, id), [db, id]);
  return s!;
}

/** which pending approvals a role should see (2.3 role table: who approves what) */
export function approvalVisible(s: Session, a: { module: string; siteId?: ID }): boolean {
  switch (s.role.id) {
    case 'owner':
    case 'accountant':
      return true;
    case 'store':
      return !a.siteId && (a.module === 'Inventory' || a.module === 'Purchase');
    case 'engineer':
      return !!a.siteId && s.siteIds.includes(a.siteId) && ['Inventory', 'Expenses', 'Labour', 'Fleet'].includes(a.module);
    case 'plant':
      return !a.siteId && (a.module === 'Inventory' || a.module === 'Purchase');
    case 'fleet':
      return a.module === 'Fleet';
    default:
      return s.seesSite(a.siteId);
  }
}
