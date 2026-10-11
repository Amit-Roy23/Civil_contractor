import { createPortal } from 'react-dom';
import { ArrowLeftRight, ClipboardList, Factory, Fuel, HardHat, PackageCheck, Receipt, Ruler, Truck, Users } from 'lucide-react';
import { navigate } from '../../lib/router';
import { useSession } from '../../data/session';
import type { ModuleKey } from '../../data/types';

/** Daily entry launcher (TEC-02): the screens site, plant and fleet staff use every day. */
const ENTRIES: Array<{ label: string; sub: string; path: string; icon: any; module: ModuleKey; color: string }> = [
  { label: 'Consumption', sub: 'MAT-04', path: '/inventory/transactions?new=CONSUMPTION', icon: ClipboardList, module: 'inventory', color: 'from-orange-500 to-amber-500' },
  { label: 'Receive material', sub: 'MAT-01/02', path: '/inventory/transactions?new=RECEIVE', icon: PackageCheck, module: 'inventory', color: 'from-emerald-500 to-teal-500' },
  { label: 'Transfer', sub: 'MAT-05', path: '/inventory/transactions?new=TRANSFER', icon: ArrowLeftRight, module: 'inventory', color: 'from-sky-500 to-blue-600' },
  { label: 'Attendance', sub: 'LAB-01', path: '/labour/attendance?new=1', icon: Users, module: 'labour', color: 'from-violet-500 to-purple-600' },
  { label: 'Expense', sub: 'EXP-02', path: '/expenses/entries?new=1', icon: Receipt, module: 'expenses', color: 'from-rose-500 to-pink-600' },
  { label: 'Fuel issue', sub: 'FUEL-04', path: '/fleet/fuel?new=1', icon: Fuel, module: 'fleet', color: 'from-amber-500 to-yellow-500' },
  { label: 'Logbook', sub: 'VEH-01', path: '/fleet/logbook?new=1', icon: Truck, module: 'fleet', color: 'from-slate-600 to-slate-800' },
  { label: 'Production', sub: 'PLT-05', path: '/plant/production?new=1', icon: Factory, module: 'plant', color: 'from-cyan-500 to-sky-600' },
  { label: 'Dispatch', sub: 'PLT-10', path: '/plant/dispatch?new=1', icon: HardHat, module: 'plant', color: 'from-lime-500 to-green-600' },
  { label: 'Measurement', sub: 'BOQ-02', path: '/contract/measurements?new=1', icon: Ruler, module: 'contract', color: 'from-indigo-500 to-blue-700' },
];

export function QuickEntry({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSession();
  if (!open) return null;
  const items = ENTRIES.filter((e) => s.can(e.module, 'add'));
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45 anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] anim-sheet">
        <div className="w-10 h-1 rounded-full bg-line-strong mx-auto mb-4" />
        <h3 className="text-base font-semibold mb-1">New daily entry</h3>
        <p className="text-xs text-muted mb-4">Quick forms built for site, plant and fleet staff.</p>
        <div className="grid grid-cols-3 gap-3 stagger">
          {items.map((e) => {
            const I = e.icon;
            return (
              <button
                key={e.label}
                onClick={() => {
                  navigate(e.path);
                  onClose();
                }}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-surface-3 active:scale-95 transition-all"
              >
                <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${e.color} text-white flex items-center justify-center shadow-md`}>
                  <I className="w-6 h-6" />
                </span>
                <span className="text-xs font-semibold text-fg text-center leading-tight">{e.label}</span>
                <span className="text-[10px] text-muted -mt-1.5">{e.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
