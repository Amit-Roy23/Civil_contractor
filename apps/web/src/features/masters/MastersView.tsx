import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  Plus,
  Package,
  MapPin,
  Building2,
  Users,
  Layers,
} from 'lucide-react';

export const MastersView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'items' | 'locations' | 'suppliers' | 'sites' | 'plants'>('items');

  const { data: masters, isLoading } = useQuery({
    queryKey: ['masters-all'],
    queryFn: () => api.get<any>('/masters'),
  });

  const { items = [], locations = [], suppliers = [], sites = [], plants = [] } = masters || {};

  const handleDownloadTemplate = (type: string) => {
    window.open(`/api/masters/excel/template/${type}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Master Data Configuration (Section 5)</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/30">
              MST-01 to MST-15
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Materials with unit conversions (MAT-12), location nodes, suppliers, project sites, and Excel templates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadTemplate(activeTab)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Download Excel Template</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('items')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'items'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Materials & Conversions (MST-05)</span>
        </button>

        <button
          onClick={() => setActiveTab('locations')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'locations'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Locations & Stores (MST-03)</span>
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'suppliers'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Suppliers & Vendors (MST-06)</span>
        </button>

        <button
          onClick={() => setActiveTab('sites')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'sites'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Project Sites (MST-02)</span>
        </button>

        <button
          onClick={() => setActiveTab('plants')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'plants'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Asphalt & Crusher Plants (MST-04)</span>
        </button>
      </div>

      {/* Tab Content: Materials */}
      {activeTab === 'items' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3.5 border-b border-slate-800 text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span>Seeded Materials ({items.length} Realistic Construction Items)</span>
            <span className="text-slate-400 text-[11px] font-mono">MAT-12 Dual-Unit Ready</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Item Code</th>
                  <th className="p-3">Material Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-center">Base Unit</th>
                  <th className="p-3">Unit Conversion Multiplier (MAT-12)</th>
                  <th className="p-3 text-right">Reorder Level</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Loading materials...
                    </td>
                  </tr>
                ) : (
                  items.map((it: any) => (
                    <tr key={it.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-semibold text-amber-400">{it.code}</td>
                      <td className="p-3 font-medium text-slate-100">{it.name}</td>
                      <td className="p-3 text-slate-400">{it.category}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-200">
                        {it.baseUnitCode}
                      </td>
                      <td className="p-3 text-slate-300 font-mono text-[11px]">
                        {it.conversions && it.conversions.length > 0 ? (
                          it.conversions.map((c: any, i: number) => (
                            <span key={i} className="mr-2 px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                              1 {c.unitCode} = {c.conversionFactor} {it.baseUnitCode}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">1 {it.baseUnitCode} (Direct)</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300 font-semibold">
                        {it.reorderLevel} {it.baseUnitCode}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Locations */}
      {activeTab === 'locations' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Location Code</th>
                  <th className="p-3">Location Name</th>
                  <th className="p-3">Type (Section 4.1)</th>
                  <th className="p-3">Assigned Site / Plant</th>
                  <th className="p-3">Physical Address</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {locations.map((loc: any) => (
                  <tr key={loc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-semibold text-amber-400">{loc.code}</td>
                    <td className="p-3 font-medium text-slate-100">{loc.name}</td>
                    <td className="p-3 font-mono text-xs text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                        {loc.type}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{loc.siteId || loc.plantId || 'Company Core'}</td>
                    <td className="p-3 text-slate-400">{loc.address || '—'}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Suppliers */}
      {activeTab === 'suppliers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Vendor Code</th>
                  <th className="p-3">Supplier Name</th>
                  <th className="p-3">GSTIN</th>
                  <th className="p-3">PAN</th>
                  <th className="p-3">Contact Person & Phone</th>
                  <th className="p-3 text-right">Payment Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {suppliers.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-semibold text-amber-400">{s.code}</td>
                    <td className="p-3 font-medium text-slate-100">{s.name}</td>
                    <td className="p-3 font-mono text-slate-300">{s.gstin || '—'}</td>
                    <td className="p-3 font-mono text-slate-300">{s.pan || '—'}</td>
                    <td className="p-3 text-slate-400">
                      {s.contactPerson} ({s.phone})
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {s.paymentTermsDays} Days
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Sites */}
      {activeTab === 'sites' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Site Code</th>
                  <th className="p-3">Project Site Name</th>
                  <th className="p-3">Client Department</th>
                  <th className="p-3">Location / Stretch</th>
                  <th className="p-3 text-right">Contract Value (₹)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {sites.map((st: any) => (
                  <tr key={st.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-semibold text-amber-400">{st.code}</td>
                    <td className="p-3 font-medium text-slate-100">{st.name}</td>
                    <td className="p-3 text-slate-400">{st.clientDepartment || 'NHAI'}</td>
                    <td className="p-3 text-slate-400">{st.location || 'West Bengal'}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-100">
                      ₹ {st.contractValue || '0.00'}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Plants */}
      {activeTab === 'plants' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Plant Code</th>
                  <th className="p-3">Plant Name</th>
                  <th className="p-3">Plant Type</th>
                  <th className="p-3">Capacity (TPH)</th>
                  <th className="p-3">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {plants.map((pl: any) => (
                  <tr key={pl.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-semibold text-amber-400">{pl.code}</td>
                    <td className="p-3 font-medium text-slate-100">{pl.name}</td>
                    <td className="p-3 text-slate-300">{pl.type}</td>
                    <td className="p-3 font-mono text-slate-200">{pl.capacityTph} TPH</td>
                    <td className="p-3 text-slate-400">{pl.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
