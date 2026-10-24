import { describe, expect, it } from 'vitest';
import { buildDemoDB } from '../src/demo.js';
import { schemas } from '../src/schemas.js';
import type { CollectionKey } from '../src/types.js';

describe('schemas accept the demo dataset', () => {
  const db = buildDemoDB('2026-10-24');
  for (const coll of Object.keys(schemas) as CollectionKey[]) {
    if (coll === 'audit') continue;
    it(coll, () => {
      const bad: string[] = [];
      for (const r of db[coll] as any[]) {
        const p = schemas[coll].safeParse(r);
        if (!p.success) bad.push(`${r.id}: ${p.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
  }
});
