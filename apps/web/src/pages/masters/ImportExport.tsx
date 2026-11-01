import { useState } from 'react';
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import { TEMPLATES, checkImport, exportSheet, templateSheets, type ImportResult, type ImportTemplate } from '@civil/domain/imports';
import { readXlsx, writeXlsx, type Cell } from '@civil/domain/xlsx';
import { useDB, runCommand } from '../../data/store';
import { useSession } from '../../data/session';
import { Badge, Button, Callout, Card, Modal, toast } from '../../components/ui/core';
import { parseCsv } from '../../lib/csv';
import { saveBlob } from '../../lib/export';
import { today } from '../../lib/format';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const download = (sheets: Parameters<typeof writeXlsx>[0], name: string) => saveBlob(new Blob([writeXlsx(sheets) as BlobPart], { type: XLSX }), name);

export function downloadTemplate(t: ImportTemplate) {
  download(templateSheets(t), `WCM template - ${t.title}.xlsx`);
}
export function exportTemplate(db: Parameters<typeof exportSheet>[0], t: ImportTemplate) {
  download([exportSheet(db, t)], `${t.title} - ${today()}.xlsx`);
}

/** choose an .xlsx or .csv file and return the rows of its first sheet that has data */
async function pickSheet(): Promise<{ name: string; rows: Cell[][] } | null> {
  const file = await new Promise<File | null>((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.csv';
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.click();
  });
  if (!file) return null;
  if (/\.csv$/i.test(file.name)) return { name: file.name, rows: parseCsv((await file.text()).replace(/^﻿/, '')) };
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files cannot be read — open it in Excel and "Save as" .xlsx');
  const sheets = await readXlsx(new Uint8Array(await file.arrayBuffer()));
  const first = sheets.find((s) => !s.hidden && s.rows.some((r) => r.some((c) => c !== null && c !== ''))) || sheets[0];
  if (!first) throw new Error('The file has no sheets');
  return { name: `${file.name} › ${first.name}`, rows: first.rows };
}

/** Import one template: pick a file, show every problem, save only when clean (all or nothing) */
export function ImportDialog({ template, onClose }: { template: ImportTemplate; onClose: () => void }) {
  const db = useDB();
  const [file, setFile] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const choose = async () => {
    try {
      const s = await pickSheet();
      if (!s) return;
      setFile(s.name);
      setRes(checkImport(db, template, s.rows));
    } catch (e) {
      toast.error('Could not read the file', (e as Error).message);
    }
  };
  const save = async () => {
    if (!res || res.errors.length || !res.ops.length) return;
    setBusy(true);
    try {
      await runCommand({ kind: 'import', template: template.id, ops: res.ops }, `${template.title} import`);
      toast.success(`${res.ops.length} ${template.title.toLowerCase()} saved`, `${res.rows} rows from ${file}`);
      onClose();
    } catch (e) {
      toast.error('Nothing was imported', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="max-w-2xl"
      title={`Import ${template.title.toLowerCase()} from Excel`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button icon={<FileUp className="w-4 h-4" />} onClick={choose}>{res ? 'Choose another file' : 'Choose file'}</Button>
          <Button variant="primary" loading={busy} disabled={!res || !!res.errors.length || !res.ops.length} icon={<CircleCheck className="w-4 h-4" />} onClick={save}>
            {res && !res.errors.length ? `Save ${res.ops.length}` : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-fg-2">{template.description}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={<Download className="w-4 h-4" />} onClick={() => downloadTemplate(template)}>Download the template</Button>
        </div>
        {!res && <Callout>Fill the template in Excel and choose it here (.xlsx or .csv). Every row is checked first — nothing is saved until the whole file is correct.</Callout>}
        {res && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{file}</Badge>
              <Badge>{res.rows} rows</Badge>
              {res.errors.length ? <Badge tone="bad">{res.errors.length} problems</Badge> : <Badge tone="good">All rows are correct</Badge>}
            </div>
            {res.ignored.length > 0 && <p className="text-xs text-muted">Columns not used: {res.ignored.join(', ')}</p>}
            {res.errors.length > 0 ? (
              <div className="rounded-xl border border-line max-h-72 overflow-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-surface-3 sticky top-0">
                    <tr><th className="text-left px-3 py-2 w-16">Row</th><th className="text-left px-3 py-2">Column</th><th className="text-left px-3 py-2">Problem</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {res.errors.slice(0, 300).map((e, i) => (
                      <tr key={i}><td className="px-3 py-1.5 num">{e.row}</td><td className="px-3 py-1.5">{e.column || '—'}</td><td className="px-3 py-1.5 text-bad">{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Callout tone="good">{res.ops.length} record(s) ready. Press Save to add them — or correct the file and choose it again.</Callout>
            )}
            {res.errors.length > 0 && <p className="text-xs text-muted flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" /> Correct these rows in Excel and choose the file again. Nothing has been saved.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Masters › Import & export: every template in one place (XL-04, PF-06) */
export function ImportExportTab() {
  const db = useDB();
  const s = useSession();
  const [open, setOpen] = useState<ImportTemplate | null>(null);
  const exportAll = () => {
    download(TEMPLATES.filter((t) => !t.adminOnly || s.isAdmin).map((t) => exportSheet(db, t)), `WCM masters - ${today()}.xlsx`);
  };
  return (
    <>
      <Callout className="mb-4">
        Download a template, fill it in Excel with the same column names, and import it. Each file is checked row by row and saved only when every row is correct. Export gives the saved records in the same layout, so a sheet can be corrected and imported again.
      </Callout>
      <div className="flex justify-end mb-3">
        <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={exportAll}>Export all masters</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 stagger">
        {TEMPLATES.map((t) => {
          const locked = (t.adminOnly && !s.isAdmin) || !s.can('masters', 'add');
          const count = (t.rows ? t.rows(db) : (db[t.coll] as any[])).length;
          return (
            <Card key={t.id} className="p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{t.title}</div>
                <Badge>{count} saved</Badge>
              </div>
              <p className="text-xs text-fg-2 mt-1 flex-1">{t.description}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" icon={<Download className="w-4 h-4" />} onClick={() => downloadTemplate(t)}>Template</Button>
                <Button size="sm" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => exportTemplate(db, t)}>Export</Button>
                {!locked && <Button size="sm" variant="primary" icon={<Upload className="w-4 h-4" />} onClick={() => setOpen(t)}>Import</Button>}
              </div>
            </Card>
          );
        })}
      </div>
      {open && <ImportDialog template={open} onClose={() => setOpen(null)} />}
    </>
  );
}
