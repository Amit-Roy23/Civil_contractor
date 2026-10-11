import React from 'react';
import {
  Menu,
  Bell,
  MapPin,
  Calendar,
  Wifi,
  WifiOff,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
}) => {
  const {
    user,
    activeLocationId,
    setActiveLocationId,
    activeFyCode,
    isOnline,
    loginAsDemoUser,
  } = useAuth();

  // Locations available for switching
  const locationOptions = [
    { id: '', label: 'All Scoped Locations' },
    { id: 'CS-01', label: 'Central Godown (CS-01)' },
    { id: 'ST-NH31', label: 'NH-31 Site Store (ST-NH31)' },
    { id: 'ST-GANGA', label: 'Ganga Bridge Store (ST-GANGA)' },
    { id: 'ST-HMP01', label: 'Hot Mix Plant Yard (ST-HMP01)' },
  ];

  return (
    <header className="h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 flex items-center justify-between sticky top-0 z-10">
      {/* Left: Sidebar Toggle + Location Switcher */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Location Picker (ROLE-02 scoped) */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <select
            value={activeLocationId || ''}
            onChange={(e) => setActiveLocationId(e.target.value || null)}
            className="bg-transparent border-none text-slate-200 focus:outline-none cursor-pointer text-xs font-medium"
          >
            {locationOptions.map((loc) => (
              <option key={loc.id} value={loc.id} className="bg-slate-900 text-slate-200">
                {loc.label}
              </option>
            ))}
          </select>
        </div>

        {/* Financial Year Tag */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>FY {activeFyCode}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        </div>
      </div>

      {/* Right: Online Status, Role Switcher Demo, Alerts */}
      <div className="flex items-center gap-3">
        {/* Connection Status Indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
            isOnline
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
              : 'bg-rose-950/60 border-rose-800/60 text-rose-400 animate-pulse'
          }`}
          title={isOnline ? 'Online: Live sync enabled' : 'Offline: Changes saved to IndexedDB'}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline Draft Mode'}</span>
        </div>

        {/* Instant Role Switcher for Pair-Programming Demo */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-950/70 p-1 rounded-lg border border-slate-800 text-[11px]">
          <span className="px-2 text-slate-400 font-mono flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-amber-400" /> Role:
          </span>
          <button
            onClick={() => loginAsDemoUser('OWNER')}
            className={`px-2 py-0.5 rounded font-medium transition-all ${
              user?.roles?.includes('ADMIN')
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Owner
          </button>
          <button
            onClick={() => loginAsDemoUser('ENGINEER')}
            className={`px-2 py-0.5 rounded font-medium transition-all ${
              user?.roles?.includes('SITE_ENGINEER')
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Site Eng.
          </button>
          <button
            onClick={() => loginAsDemoUser('ACCOUNTANT')}
            className={`px-2 py-0.5 rounded font-medium transition-all ${
              user?.roles?.includes('ACCOUNTANT')
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Accounts
          </button>
          <button
            onClick={() => loginAsDemoUser('STORE')}
            className={`px-2 py-0.5 rounded font-medium transition-all ${
              user?.roles?.includes('STORE_KEEPER')
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Store
          </button>
        </div>

        {/* Notifications */}
        <button
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 relative"
          title="Notifications & Alerts"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-slate-900"></span>
        </button>
      </div>
    </header>
  );
};
