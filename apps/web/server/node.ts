import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { handle } from './app.js';
import type { Req } from './http.js';

const LIMIT = 10 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > LIMIT) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

/** the visitor's IP: on Vercel the platform sets x-forwarded-for; elsewhere only behind a trusted proxy */
function clientIp(req: IncomingMessage) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0]!.trim();
  if (fwd && (process.env.VERCEL || process.env.TRUST_PROXY === 'on')) return fwd;
  return req.socket.remoteAddress || 'unknown';
}

/** Node (req, res) handler for the API — used by the Vercel function and the local server */
export async function nodeHandler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://local');
  // Vercel routes /api/<path> to the function as /api?__p=<path>
  const routed = url.searchParams.get('__p');
  const path = routed !== null ? `/api/${routed}` : url.pathname;
  url.searchParams.delete('__p');
  let body: any = undefined;
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const raw = await readBody(req);
      if (raw.length) body = JSON.parse(raw.toString('utf8'));
    }
  } catch (e: any) {
    res.writeHead(e?.status === 413 ? 413 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ statusCode: e?.status === 413 ? 413 : 400, message: e?.status === 413 ? 'The upload is too large' : 'The request is not valid JSON' }));
    return;
  }
  const r: Req = { method: req.method || 'GET', path, query: url.searchParams, headers: req.headers, body, ip: clientIp(req) };
  const out = await handle(r);
  const headers: Record<string, string> = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(out.headers || {}) };
  let payload: Buffer;
  if (out.raw) payload = out.raw;
  else {
    payload = Buffer.from(JSON.stringify(out.json ?? null));
    headers['content-type'] = 'application/json; charset=utf-8';
  }
  // compress JSON: a full company snapshot stays far below the platform's response size limit
  if (!out.raw && payload.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    payload = gzipSync(payload);
    headers['content-encoding'] = 'gzip';
    headers['vary'] = 'accept-encoding';
  }
  headers['content-length'] = String(payload.length);
  res.writeHead(out.status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}
