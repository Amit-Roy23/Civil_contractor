import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, EyeOff, FileSpreadsheet, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { downloadXlsx, printTable, type ExportCell } from '../../lib/export';
import { useSession } from '../../data/session';
import { Button, Empty } from './core';
import { SearchBox } from './fields';

export interface Column<T> {
  key: string;
  header: string;
  cell?: (row: T) => React.ReactNode;
  /** raw value used for sort, search & export */
  value?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** amount / rate column hidden from roles without rate visibility (ROLE-03) */
  rate?: boolean;
  hideMobile?: boolean;
  primary?: boolean;
  className?: string;
  sortable?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  title = 'Report',
  subtitle,
  toolbar,
  searchable = true,
  pageSize = 15,
  totals,
  empty,
  initialSort,
  compact,
  className,
  exportable = true,
  rowClassName,
}: {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (r: T, i: number) => string;
  onRowClick?: (r: T) => void;
  title?: string;
  subtitle?: string;
  toolbar?: React.ReactNode;
  searchable?: boolean;
  pageSize?: number;
  /** footer cells by column key; `__export` holds raw numbers for Excel/PDF */
  totals?: Record<string, any>;
  empty?: React.ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  compact?: boolean;
  className?: string;
  exportable?: boolean;
  rowClassName?: (r: T) => string | undefined;
}) {
  const { showRates } = useSession();
  const cols = useMemo(() => columns.filter((c) => showRates || !c.rate), [columns, showRates]);
  const hiddenRates = columns.length !== cols.length;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const val = (c: Column<T>, r: T) => (c.value ? c.value(r) : ((r as any)[c.key] as any));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = s ? rows.filter((r) => cols.some((c) => String(val(c, r) ?? '').toLowerCase().includes(s))) : rows;
    if (sort) {
      const c = cols.find((x) => x.key === sort.key);
      if (c) {
        out = [...out].sort((a, b) => {
          const va = val(c, a);
          const vb = val(c, b);
          const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'en', { numeric: true });
          return sort.dir === 'asc' ? r : -r;
        });
      }
    }
    return out;
  }, [rows, q, sort, cols]);

  useEffect(() => setPage(0), [q, rows]);
  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [menu]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const exportData = () => ({
    title,
    subtitle,
    headers: cols.map((c) => c.header),
    rows: filtered.map((r) => cols.map((c) => {
      const v = val(c, r);
      return typeof v === 'number' ? Math.round(v * 100) / 100 : (v as ExportCell);
    })),
    numeric: cols.map((c, i) => (c.align === 'right' ? i : -1)).filter((i) => i >= 0),
    totals: totals?.__export ? cols.map((c, i) => (i === 0 ? 'Total' : (totals.__export![c.key] ?? ''))) : undefined,
  });

  const toggleSort = (c: Column<T>) => {
    if (c.sortable === false) return;
    setSort((s) => (s?.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : undefined) : { key: c.key, dir: c.align === 'right' ? 'desc' : 'asc' }));
  };

  const primary = cols.find((c) => c.primary) || cols[0]!;
  const others = cols.filter((c) => c !== primary && !c.hideMobile).slice(0, 5);

  return (
    <div className={cn('bg-surface border border-line rounded-2xl shadow-card overflow-hidden', className)}>
      {(searchable || toolbar || exportable) && (
        <div className="flex flex-col md:flex-row md:items-center gap-2 p-3 border-b border-line">
          {searchable && <SearchBox value={q} onChange={setQ} placeholder={`Search ${rows.length.toLocaleString('en-IN')} records…`} className="md:w-72" />}
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            {toolbar}
            {hiddenRates && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted px-2" title="Rates & amounts are hidden for your role (ROLE-03)">
                <EyeOff className="w-3.5 h-3.5" /> Rates hidden
              </span>
            )}
            {exportable && (
              <div ref={menuRef} className="relative">
                <Button size="md" icon={<Download className="w-4 h-4" />} onClick={() => setMenu((m) => !m)}>
                  <span className="hidden sm:inline">Export</span>
                </Button>
                {menu && (
                  <div className="absolute right-0 mt-1.5 z-30 w-48 bg-surface border border-line rounded-xl shadow-pop p-1.5 anim-pop">
                    <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-surface-3" onClick={() => (downloadXlsx(exportData()), setMenu(false))}>
                      <FileSpreadsheet className="w-4 h-4 text-good" /> Excel (.xlsx)
                    </button>
                    <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-surface-3" onClick={() => (printTable(exportData()), setMenu(false))}>
                      <Printer className="w-4 h-4 text-bad" /> PDF / Print
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        empty || <Empty title={q ? 'No matching records' : 'Nothing here yet'} body={q ? 'Try a different search.' : undefined} />
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-line">
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c)}
                      className={cn('px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap select-none', c.sortable !== false && 'cursor-pointer hover:text-fg', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.header}
                        {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="stagger">
                {shown.map((r, i) => (
                  <tr key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('border-b border-line last:border-0 transition-colors', onRowClick && 'cursor-pointer hover:bg-brand-soft/40', rowClassName?.(r))}>
                    {cols.map((c) => (
                      <td key={c.key} className={cn('px-4 align-middle', compact ? 'py-2' : 'py-2.5', c.align === 'right' ? 'text-right num whitespace-nowrap' : c.align === 'center' ? 'text-center' : 'text-left', c.className)}>
                        {c.cell ? c.cell(r) : (val(c, r) as React.ReactNode) ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-surface-2 border-t-2 border-line font-semibold">
                    {cols.map((c, i) => (
                      <td key={c.key} className={cn('px-4 py-2.5', c.align === 'right' && 'text-right num whitespace-nowrap')}>
                        {i === 0 ? 'Total' : (totals[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* mobile cards */}
          <div className="md:hidden divide-y divide-line stagger">
            {shown.map((r, i) => (
              <div key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('px-4 py-3 active:bg-surface-2', onRowClick && 'cursor-pointer')}>
                <div className="text-sm font-semibold text-fg mb-1.5">{primary.cell ? primary.cell(r) : (val(primary, r) as React.ReactNode)}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {others.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted">{c.header}</div>
                      <div className="text-[13px] text-fg truncate num">{c.cell ? c.cell(r) : (val(c, r) as React.ReactNode) ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {totals && (
              <div className="px-4 py-3 bg-surface-2 grid grid-cols-2 gap-2">
                {cols.filter((c) => totals[c.key] !== undefined).map((c) => (
                  <div key={c.key}>
                    <div className="text-[10px] uppercase tracking-wide text-muted">Total {c.header}</div>
                    <div className="text-sm font-semibold num">{totals[c.key]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-line text-xs text-muted">
              <span>
                {page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length.toLocaleString('en-IN')}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="w-4 h-4" />} aria-label="Previous page" />
                <span className="px-2 font-medium text-fg-2">
                  {page + 1} / {pages}
                </span>
                <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} icon={<ChevronRight className="w-4 h-4" />} aria-label="Next page" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
