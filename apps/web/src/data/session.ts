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
  const role = db.roles.find((r) => r.id === user.roleId)!;
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
