/**
 * Minimal .xlsx writer and reader with no dependencies (TEC-07, XL-04/05/07).
 * Writer: STORE-method zip of SpreadsheetML (any number of sheets).
 * Reader: unzips with the platform's DecompressionStream (browsers and Node 18+), reads every sheet
 * including hidden ones, shared and inline strings, numbers and booleans.
 */

export type Cell = string | number | boolean | null | undefined;
export interface SheetIn {
  name: string;
  rows: Cell[][];
  /** rows (0-based) printed bold with a tinted fill, e.g. the header */
  headerRows?: number[];
  /** first row printed as a title */
  title?: boolean;
}
export interface SheetOut {
  name: string;
  hidden: boolean;
  rows: Array<Array<string | number | boolean | null>>;
}

/* ---------------- zip ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: Array<{ name: string; data: string | Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true); // UTF-8 names
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as any).DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** read every file of a zip archive */
export async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not an Excel (.xlsx) file — save it as .xlsx and try again');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged Excel file');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* ---------------- writer ---------------- */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
export function colName(i: number): string {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
function cellXml(v: Cell, ref: string, style: number): string {
  if (v === null || v === undefined || v === '') return style ? `<c r="${ref}" s="${style}"/>` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" s="${style}" t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}
const sheetName = (n: string, used: Set<string>) => {
  let base = n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name.toLowerCase());
  return name;
};

export function writeXlsx(sheets: SheetIn[]): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));
  const sheetXml = sheets.map((s) => {
    const head = new Set(s.headerRows || []);
    const rows = s.rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(v, `${colName(c)}${r + 1}`, s.title && r === 0 ? 1 : head.has(r) ? 2 : 0)).join('')}</row>`).join('');
    const ncol = Math.max(1, ...s.rows.map((r) => r.length));
    const widths = Array.from({ length: ncol }, (_, i) => {
      const max = Math.max(4, ...s.rows.slice(0, 300).map((row, r) => (s.title && r === 0 ? 0 : String(row[i] ?? '').length)));
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, max + 2)}" customWidth="1"/>`;
    }).join('');
    const freeze = (s.headerRows || []).length ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${Math.max(...s.headerRows!) + 1}" topLeftCell="A${Math.max(...s.headerRows!) + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<cols>${widths}</cols><sheetData>${rows}</sheetData></worksheet>`;
  });
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E2"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf fontId="2" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
  const files: Array<{ name: string; data: string }> = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    ...sheetXml.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data })),
    { name: 'xl/styles.xml', data: styles },
  ];
  return zipStore(files);
}

/* ---------------- reader ---------------- */
const unesc = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (_m, e: string, d?: string, h?: string) =>
    d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' } as Record<string, string>)[e.toLowerCase()]!,
  );
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
/** text of all <t> runs inside a fragment (rich text has several) */
const texts = (frag: string) => [...frag.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unesc(m[1]!)).join('');
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(bytes: Uint8Array): Promise<SheetOut[]> {
  const files = await unzip(bytes);
  const dec = new TextDecoder();
  const get = (n: string) => {
    const f = files.get(n) || files.get(n.replace(/^\//, ''));
    return f ? dec.decode(f) : '';
  };
  const wb = get('xl/workbook.xml');
  if (!wb) throw new Error('Not an Excel workbook — save the file as .xlsx (Excel 2007 or later)');
  const rels = get('xl/_rels/workbook.xml.rels');
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id')!, attr(m[0], 'Target')!]));
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!));
  const out: SheetOut[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0];
    const name = unesc(attr(tag, 'name') || 'Sheet');
    const state = attr(tag, 'state');
    const rid = tag.match(/r:id="([^"]+)"/)?.[1] || '';
    let path = target.get(rid) || '';
    path = path.startsWith('/') ? path.slice(1) : `xl/${path}`;
    const xml = get(path);
    const rows: SheetOut['rows'] = [];
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rIdx = Number(attr(`<x ${rm[1]}>`, 'r') || rows.length + 1) - 1;
      const row: SheetOut['rows'][number] = [];
      let next = 0;
      for (const cm of rm[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = `<x ${cm[1]}>`;
        const ref = attr(a, 'r');
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const t = attr(a, 't');
        const body = cm[2] || '';
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val: string | number | boolean | null = null;
        if (t === 's') val = v !== undefined ? shared[Number(v)] ?? '' : null;
        else if (t === 'inlineStr') val = texts(body);
        else if (t === 'str') val = v !== undefined ? unesc(v) : null;
        else if (t === 'b') val = v === '1';
        else if (t === 'e') val = null;
        else if (v !== undefined) val = Number(v);
        row[ci] = val;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
      while (rows.length < rIdx) rows.push([]);
      rows[rIdx] = row;
    }
    out.push({ name, hidden: state === 'hidden' || state === 'veryHidden', rows });
  }
  return out;
}

/** Excel serial date (1900 system) → YYYY-MM-DD */
export function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}
