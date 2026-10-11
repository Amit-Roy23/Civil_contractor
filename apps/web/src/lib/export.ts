/**
 * Report export helpers (TEC-07): real .xlsx files (minimal OOXML writer, no dependency)
 * and PDF via the browser's print-to-PDF with a clean print layout.
 */

export type ExportCell = string | number | null | undefined;
export interface ExportTable {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: ExportCell[][];
  /** column indexes that are numeric (right aligned in PDF) */
  numeric?: number[];
  totals?: ExportCell[];
}

/* ---------------- XLSX ---------------- */

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

/** Builds a ZIP archive using the STORE method (no compression). */
function zip(files: Array<{ name: string; data: string }>): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, data);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
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
  return new Blob([...chunks, ...central, end] as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i: number): string {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function cellXml(v: ExportCell, ref: string, style = 0): string {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

export function downloadXlsx(t: ExportTable) {
  const rows: string[] = [];
  let r = 1;
  rows.push(`<row r="${r}">${cellXml(t.title, `A${r}`, 1)}</row>`);
  r++;
  if (t.subtitle) {
    rows.push(`<row r="${r}">${cellXml(t.subtitle, `A${r}`)}</row>`);
    r++;
  }
  r++;
  rows.push(`<row r="${r}">${t.headers.map((h, i) => cellXml(h, `${colName(i)}${r}`, 2)).join('')}</row>`);
  r++;
  for (const row of t.rows) {
    rows.push(`<row r="${r}">${row.map((v, i) => cellXml(v, `${colName(i)}${r}`)).join('')}</row>`);
    r++;
  }
  if (t.totals) {
    rows.push(`<row r="${r}">${t.totals.map((v, i) => cellXml(v, `${colName(i)}${r}`, 2)).join('')}</row>`);
  }
  const widths = t.headers
    .map((h, i) => {
      const max = Math.max(h.length, ...t.rows.slice(0, 200).map((row) => String(row[i] ?? '').length));
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(10, max + 2))}" customWidth="1"/>`;
    })
    .join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E2"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf fontId="2" fillId="2" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;
  const blob = zip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/styles.xml', data: styles },
  ]);
  saveBlob(blob, `${slug(t.title)}.xlsx`);
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'report';
}

/* ---------------- PDF (print) ---------------- */

export const COMPANY_PRINT_HEADER = {
  name: 'Arohon Infra Projects Pvt. Ltd.',
  line: 'GSTIN 18AAKCA4821N1ZQ · Khanapara, Guwahati, Assam 781022',
};

function printHtml(title: string, body: string) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) {
    alert('Please allow pop-ups to export PDF.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:28px;font-size:11px}
  .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #f08c00;padding-bottom:10px;margin-bottom:14px}
  .co{font-size:16px;font-weight:700} .sub{color:#555;font-size:10px;margin-top:2px}
  h1{font-size:15px;margin:0 0 4px} table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#fff4e2;text-align:left;font-weight:600;border:1px solid #e3d3b5;padding:5px 6px;font-size:10px}
  td{border:1px solid #e4e4e4;padding:4px 6px;vertical-align:top} td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;background:#fafafa} .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:10px 0}
  .meta div span{color:#666} .foot{margin-top:28px;display:flex;justify-content:space-between;color:#555}
  .sig{border-top:1px solid #999;padding-top:4px;width:180px;text-align:center}
  @page{size:A4;margin:12mm}
</style></head><body>
<div class="hd"><div><div class="co">${COMPANY_PRINT_HEADER.name}</div><div class="sub">${COMPANY_PRINT_HEADER.line}</div></div>
<div class="sub">Printed ${new Date().toLocaleString('en-IN')}</div></div>
${body}
<script>window.onload=()=>{setTimeout(()=>window.print(),150)}</script>
</body></html>`);
  w.document.close();
}

function tableHtml(t: ExportTable) {
  const isNum = (i: number) => t.numeric?.includes(i);
  const fmt = (v: ExportCell) =>
    typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : esc(String(v ?? ''));
  return `<table><thead><tr>${t.headers.map((h, i) => `<th class="${isNum(i) ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${t.rows.map((r) => `<tr>${r.map((v, i) => `<td class="${isNum(i) ? 'n' : ''}">${fmt(v)}</td>`).join('')}</tr>`).join('')}</tbody>
${t.totals ? `<tfoot><tr>${t.totals.map((v, i) => `<td class="${isNum(i) ? 'n' : ''}">${fmt(v)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}

export function printTable(t: ExportTable) {
  printHtml(t.title, `<h1>${esc(t.title)}</h1>${t.subtitle ? `<div class="sub">${esc(t.subtitle)}</div>` : ''}${tableHtml(t)}`);
}

/** Printable document (PO, payslip, tax invoice) with a meta block and line table. */
export function printDocument(opts: {
  title: string;
  meta: Array<[string, string]>;
  table: ExportTable;
  summary?: Array<[string, string]>;
  footerNote?: string;
}) {
  const meta = `<div class="meta">${opts.meta.map(([k, v]) => `<div><span>${esc(k)}:</span> <b>${esc(v)}</b></div>`).join('')}</div>`;
  const summary = opts.summary
    ? `<table style="width:320px;margin-left:auto">${opts.summary
        .map(([k, v], i) => `<tr><td${i === opts.summary!.length - 1 ? ' style="font-weight:700"' : ''}>${esc(k)}</td><td class="n"${i === opts.summary!.length - 1 ? ' style="font-weight:700"' : ''}>${esc(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  printHtml(
    opts.title,
    `<h1>${esc(opts.title)}</h1>${meta}${tableHtml(opts.table)}${summary}
     ${opts.footerNote ? `<p class="sub" style="margin-top:12px">${esc(opts.footerNote)}</p>` : ''}
     <div class="foot"><div class="sig">Prepared by</div><div class="sig">Checked by</div><div class="sig">Authorised signatory</div></div>`,
  );
}

export function shareWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
