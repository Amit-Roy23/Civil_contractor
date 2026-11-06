/**
 * Vercel build: the web app (server mode) + the API as one Node function, written in Vercel's
 * Build Output API format (.vercel/output). Run by Vercel (see vercel.json) or locally:
 *   node scripts/vercel-build.mjs            → .vercel/output   (deploy with `vercel deploy --prebuilt`)
 *   node scripts/vercel-build.mjs --local    → dist + dist-server/local.mjs (run anywhere with Node)
 */
import { build as esbuild } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = process.argv.includes('--local');

// 1. the web app, always talking to the real server (no demo data)
process.env.VITE_DATA_MODE = 'api';
// the API is deployed with the app, on the same address: an old VITE_API_URL left in the hosting
// settings (e.g. from a separate API server) must not send the app somewhere else
if (process.env.VITE_API_URL && process.env.VITE_API_URL !== '/api') console.warn(`! Ignoring VITE_API_URL=${process.env.VITE_API_URL} — this build serves its own API at /api`);
process.env.VITE_API_URL = process.env.WCM_EXTERNAL_API_URL || '/api';
const { build: vite } = await import('vite');
await vite({ root: web, mode: 'production', logLevel: 'warn' });
console.log('✓ web app built (server mode)');

// 2. the API, bundled with the business rules from packages/domain
const bundle = (entry, outfile) =>
  esbuild({
    entryPoints: [join(web, 'server', entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    alias: { '@civil/domain': join(web, '..', '..', 'packages', 'domain', 'src') },
    // optional MongoDB driver add-ons that WCM does not use
    external: ['kerberos', '@mongodb-js/zstd', '@aws-sdk/credential-providers', 'gcp-metadata', 'snappy', 'socks', 'aws4', 'mongodb-client-encryption'],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  });

if (local) {
  await bundle('local.ts', join(web, 'dist-server', 'local.mjs'));
  console.log('✓ server built: node dist-server/local.mjs');
  process.exit(0);
}

// Vercel reads .vercel/output from the folder the build runs in (the project's Root Directory)
const out = join(process.cwd(), '.vercel', 'output');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'static'), { recursive: true });
await cp(join(web, 'dist'), join(out, 'static'), { recursive: true });
const fn = join(out, 'functions', 'api.func');
await bundle('vercel.ts', join(fn, 'index.mjs'));
await writeFile(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
await writeFile(join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2));

const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
const config = {
  version: 3,
  routes: [
    { src: '/(.*)', headers: { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()', 'Content-Security-Policy': csp }, continue: true },
    { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '/(sw\\.js|theme\\.js|index\\.html|manifest\\.webmanifest)?', headers: { 'Cache-Control': 'no-cache' }, continue: true },
    { src: '/health', dest: '/api?__p=health' },
    { src: '/api/(.*)', dest: '/api?__p=$1' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
  // daily backup of every company at 02:30 IST (21:00 UTC); needs CRON_SECRET set in Vercel
  crons: [{ path: '/api/v2/cron/daily', schedule: '0 21 * * *' }],
};
await writeFile(join(out, 'config.json'), JSON.stringify(config, null, 2));
console.log('✓ Vercel output written to .vercel/output (static app + /api function + daily backup cron)');
