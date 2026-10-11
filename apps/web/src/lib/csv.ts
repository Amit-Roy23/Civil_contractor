/** Minimal CSV parser for Excel "Save as CSV" imports (TEC-07). Handles quotes and commas in fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur.trim());
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  row.push(cur.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** rows → objects keyed by lower-cased header */
export function csvObjects(text: string): Array<Record<string, string>> {
  const [head, ...rest] = parseCsv(text.replace(/^﻿/, ''));
  if (!head) return [];
  const keys = head.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

export function pickFile(accept = '.csv'): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.readAsText(f);
    };
    inp.click();
  });
}
