import { useMemo } from 'react';
import { buildSession, type Session } from '@civil/domain/session';
import { getCurrentUserId, useDB } from './store';

export { buildSession, approvalVisible } from '@civil/domain/session';
export type { Session } from '@civil/domain/session';

export function useSession(): Session {
  const db = useDB();
  const id = getCurrentUserId();
  const s = useMemo(() => buildSession(db, id), [db, id]);
  return s!;
}
