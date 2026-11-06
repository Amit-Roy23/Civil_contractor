/**
 * Run the MongoDB version on any machine (or a VPS / Render / Railway):
 *   MONGODB_URI=... JWT_SECRET=... SETUP_KEY=... node dist-server/local.mjs
 * Serves the built web app from ./dist and the API under /api on PORT (default 8080).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { nodeHandler } from './node.js';

const ROOT = process.env.WEB_ROOT || join(process.cwd(), 'dist');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://x').pathname;
  if (path.startsWith('/api/') || path === '/api' || path === '/health') return nodeHandler(req, res);
  let file = normalize(join(ROOT, decodeURIComponent(path)));
  if (!file.startsWith(ROOT)) file = join(ROOT, 'index.html');
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
  } catch {
    file = join(ROOT, 'index.html');
  }
  const body = await readFile(file);
  const hashed = path.startsWith('/assets/');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' });
  res.end(body);
}).listen(Number(process.env.PORT || 8080), () => console.log(`WCM (MongoDB) on http://localhost:${process.env.PORT || 8080}`));
