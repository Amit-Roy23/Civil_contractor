import { useEffect, useState } from 'react';
import { CircleCheck, DatabaseBackup, Download, FileSpreadsheet, FlaskConical, Trash2, TriangleAlert } from 'lucide-react';
import { writeXlsx, type Cell } from '@civil/domain/xlsx';
import { useDB } from '../../data/store';
import { useSession } from '../../data/session';
import { API_MODE, api, type BackupInfo, type RestoreCheck } from '../../data/api';
import { Badge, Button, Callout, Card, CardHeader, toast } from '../../components/ui/core';
import { DataTable } from '../../components/ui/DataTable';
import { dateTime, today } from '../../lib/format';
import { saveBlob } from '../../lib/export';
import type { DB } from '../../data/types';

/** every collection as a sheet; nested values as JSON text (PF-07 "full data export to Excel at any time") */
export function exportAllData(db: DB) {
  const sheets = Object.entries(db)
    .filter(([, v]) => Array.isArray(v) && v.length)
    .map(([name, rows]) => {
      const list = rows as Array<Record<string, unknown>>;
      const keys = [...new Set(list.flatMap((r) => Object.keys(r)))];
      const cell = (v: unknown): Cell => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : (v as Cell));
      return { name, rows: [keys, ...list.map((r) => keys.map((k) => cell(r[k])))], headerRows: [0] };
    });
  sheets.unshift({ name: 'About', rows: [[`${db.company.name} — all data`], [`Exported ${new Date().toLocaleString('en-IN')}`], ['One sheet per record type. Lists inside a record are written as JSON text.']], headerRows: [] });
  saveBlob(new Blob([writeXlsx(sheets) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `WCM all data - ${today()}.xlsx`);
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function BackupsTab() {
  const db = useDB();
  const s = useSession();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.backups>> | null>(null);
  const [busy, setBusy] = useState('');
  const [check, setCheck] = useState<RestoreCheck | null>(null);
  const load = () => api.backups().then(setInfo, (e) => toast.error('Could not load backups', e.message));
  useEffect(() => {
    if (API_MODE && s.isAdmin) void load();
  }, [s.isAdmin]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error('Failed', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4">
        {!API_MODE ? (
          <Callout tone="warn" icon={<TriangleAlert className="w-4 h-4" />}>This is the demo — data stays in this browser. Daily server backups run when WCM is connected to the server.</Callout>
        ) : !s.isAdmin ? (
          <Callout>Only Admin can see backups.</Callout>
        ) : (
          <>
            <Callout tone="good" icon={<DatabaseBackup className="w-4 h-4" />}>
              {info?.daily === false ? 'Daily backup is switched off on the server.' : 'A full backup is taken automatically every day and kept for 30 days.'}
              {info?.offsite ? ' A copy of each backup is also kept off-site.' : ''} Test a backup any time with “Restore to a test copy” — your live data is not touched.
            </Callout>
            <DataTable<BackupInfo>
              title="Backups"
              rows={info?.backups || []}
              rowKey={(r) => String(r.id)}
              columns={[
                { key: 'at', header: 'Taken', primary: true, value: (r) => r.created_at, cell: (r) => dateTime(r.created_at) },
                { key: 'kind', header: 'Type', value: (r) => r.kind, cell: (r) => <Badge tone={r.kind === 'daily' ? 'info' : 'brand'}>{r.kind === 'daily' ? 'Daily' : 'Manual'}</Badge> },
                { key: 'rec', header: 'Records', align: 'right', value: (r) => r.records, cell: (r) => r.records.toLocaleString('en-IN') },
                { key: 'size', header: 'Size', align: 'right', value: (r) => r.size, cell: (r) => kb(r.size), hideMobile: true },
                {
                  key: 'act',
                  header: '',
                  sortable: false,
                  cell: (r) => (
                    <div className="flex gap-1.5 justify-end">
                      <Button size="sm" variant="ghost" icon={<Download className="w-3.5 h-3.5" />} onClick={() => run(`d${r.id}`, async () => saveBlob(await api.downloadBackup(r.id), `wcm-backup-${r.created_at.slice(0, 10)}-${r.id}.json.gz`))} loading={busy === `d${r.id}`}>Download</Button>
                      <Button size="sm" icon={<FlaskConical className="w-3.5 h-3.5" />} loading={busy === `t${r.id}`} onClick={() => run(`t${r.id}`, async () => (setCheck(await api.restoreTest(r.id)), await load()))}>Restore to a test copy</Button>
                    </div>
                  ),
                },
              ]}
              toolbar={<Button variant="primary" icon={<DatabaseBackup className="w-4 h-4" />} loading={busy === 'now'} onClick={() => run('now', async () => (await api.backupNow(), toast.success('Backup taken'), await load()))}>Back up now</Button>}
              empty={<div className="p-8 text-center text-sm text-muted">No backup yet — the first daily backup runs within the hour, or press “Back up now”.</div>}
            />
            {check && (
              <Card className="p-5">
                <div className="flex items-center gap-2 font-semibold">
                  {check.ok ? <CircleCheck className="w-5 h-5 text-good" /> : <TriangleAlert className="w-5 h-5 text-bad" />}
                  {check.ok ? 'Restore test passed' : 'Restore test found differences'}
                </div>
                <p className="text-sm text-fg-2 mt-1">
                  Backup of {dateTime(check.backupAt)} was restored into a separate test company <b className="font-mono">{check.company}</b>. {check.ok ? `All ${check.records.toLocaleString('en-IN')} records match, collection by collection.` : `Different: ${check.mismatches.join(', ')}.`}
                </p>
                <p className="text-sm text-fg-2 mt-1">To look inside it, sign out and sign in with company code <b className="font-mono">{check.company}</b> and your usual username and password. Your live data was not changed.</p>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                  {Object.entries(check.expected).map(([k, n]) => (
                    <div key={k} className="rounded-lg bg-surface-3 px-2.5 py-1.5 flex justify-between"><span className="text-fg-2">{k}</span><span className="num font-semibold">{n} / {check.actual[k] ?? 0}</span></div>
                  ))}
                </div>
              </Card>
            )}
            {!!info?.testCopies.length && (
              <Card>
                <CardHeader title="Test copies" subtitle="Restored backups kept for checking — remove them when done" />
                <div className="px-5 pb-5 space-y-2">
                  {info.testCopies.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                      <div className="min-w-0"><div className="text-sm font-medium truncate">{c.name}</div><div className="text-[11px] text-muted font-mono">company code: {c.id}</div></div>
                      <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} loading={busy === c.id} onClick={() => run(c.id, async () => (await api.dropTestCopy(c.id), toast.success('Test copy removed'), await load()))}>Remove</Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
      <Card className="self-start">
        <CardHeader title="Export everything to Excel" subtitle="All your data in one workbook — one sheet per record type" />
        <div className="px-5 pb-5 space-y-3">
          <p className="text-sm text-fg-2">Works, masters, stock vouchers, purchases, labour, expenses, fuel, plant, billing and the audit log as they are now. Keep it as your own copy at any time.</p>
          <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => exportAllData(db)}>Export all data</Button>
          {!s.showRates && <p className="text-xs text-muted">Rates and amounts you cannot see are exported as 0.</p>}
        </div>
      </Card>
    </div>
  );
}
