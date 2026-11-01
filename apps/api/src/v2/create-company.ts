/**
 * Set up a real client company — an empty start (no sample works or entries) with standard roles,
 * units, expense heads and settings.
 *
 * From the client's own masters (recommended):
 *   pnpm --filter @civil/api company:create -- --code sd --from setup/saurajit-deb.json --owner-password '********'
 *
 * Or a bare company:
 *   pnpm --filter @civil/api company:create -- --code acme --name "Acme Infra Pvt Ltd" \
 *     --owner-name "Owner Name" --owner-username owner --owner-phone 9800000000 --owner-password '********'
 *
 * Add --dry-run to check the setup file without saving anything.
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { buildCompanyDB, type SetupSpec } from '@civil/domain/setup';
import { V2Store } from './store.js';
import { clock } from './clock.js';

function arg(name: string, required = true) {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v && required) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return v || '';
}

async function main() {
  const code = arg('code').toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(code)) throw new Error('--code: 2–30 lowercase letters, digits or dashes');
  const dry = process.argv.includes('--dry-run');
  const password = dry ? '' : arg('owner-password');
  if (!dry && password.length < 8) throw new Error('--owner-password: at least 8 characters');
  const from = arg('from', false);
  const spec: SetupSpec = from
    ? JSON.parse(readFileSync(from, 'utf8'))
    : {
        company: { name: arg('name'), gstin: arg('gstin', false), pan: arg('pan', false), address: arg('address', false), phone: arg('owner-phone', false), email: arg('email', false), banks: [] },
        owner: { name: arg('owner-name'), username: arg('owner-username'), phone: arg('owner-phone', false), email: arg('email', false) },
      };
  const { db, errors } = buildCompanyDB(spec, clock().today);
  if (errors.length) throw new Error(`The setup has ${errors.length} problem(s) — nothing was saved:\n  - ${errors.join('\n  - ')}`);
  const summary = (['firms', 'clients', 'stores', 'plants', 'materials', 'vehicles', 'sites'] as const).map((k) => `${db[k].length} ${k}`).join(', ');
  if (dry) {
    console.log(`✅ Setup is valid: ${summary}. Nothing saved (--dry-run).`);
    return;
  }
  const store = new V2Store();
  await store.ensureSchema();
  if (await store.company(code)) throw new Error(`Company ${code} already exists`);
  await store.replaceAll(code, db.company.name, false, db);
  await store.setPassword(code, 'u1', await argon2.hash(password, { type: argon2.argon2id }));
  console.log(`✅ Company "${code}" created (${summary}). Sign in as ${db.users[0]!.username}.`);
  await store.sql.end();
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
