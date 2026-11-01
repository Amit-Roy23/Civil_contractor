/**
 * Backups from the command line (disaster recovery).
 *
 *   pnpm --filter @civil/api backup -- create --code sd --out sd.json.gz
 *   pnpm --filter @civil/api backup -- restore --file sd.json.gz --code sd-copy            (into a new company)
 *   pnpm --filter @civil/api backup -- restore --file sd.json.gz --code sd --replace       (overwrite — careful)
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { V2Store } from './store.js';
import { BackupService } from './backup.service.js';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] || '' : '';
};

async function main() {
  const action = process.argv.find((a) => a === 'create' || a === 'restore');
  const code = arg('code').toLowerCase();
  if (!action || !code) throw new Error('Use: backup create --code X [--out file] | backup restore --file F --code X [--replace]');
  const store = new V2Store();
  await store.ensureSchema();
  const svc = new BackupService(store);
  await svc.onApplicationBootstrap().catch(() => undefined);
  svc.onModuleDestroy();
  try {
    if (action === 'create') {
      const b = await svc.build(code);
      const out = arg('out') || `wcm-backup-${code}-${b.createdAt.slice(0, 10)}.json.gz`;
      writeFileSync(out, BackupService.encode(b));
      console.log(`✅ ${out} written (rev ${b.rev})`);
    } else {
      const b = BackupService.decode(readFileSync(arg('file')));
      const r = await svc.restore(b, code, { replace: process.argv.includes('--replace') });
      console.log(r.ok ? `✅ Restored into ${code}: every collection matches the backup` : `⚠️ Restored into ${code} with differences: ${r.mismatches.join(', ')}`);
    }
  } finally {
    await store.sql.end();
  }
}
main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
