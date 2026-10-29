import React, { useState } from 'react';
import { Search, Globe, Check, X, ShieldAlert } from 'lucide-react';
import { CRSInfo } from '../types/gis';
import { searchCRS } from '../core/crsDefinitions';

interface CRSModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCRS: string;
  onSelectCRS: (crs: CRSInfo) => void;
}

export const CRSModal: React.FC<CRSModalProps> = ({
  isOpen,
  onClose,
  selectedCRS,
  onSelectCRS,
}) => {
  const [query, setQuery] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customProj4, setCustomProj4] = useState('');

  if (!isOpen) return null;

  const results = searchCRS(query);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCode.trim() || !customProj4.trim()) return;

    const customCRS: CRSInfo = {
      code: customCode.trim().toUpperCase(),
      name: `Custom CRS (${customCode.trim()})`,
      area: 'User Defined',
      proj4: customProj4.trim(),
      isGeographic: customProj4.includes('longlat'),
      unit: customProj4.includes('units=m') ? 'meters' : customProj4.includes('units=us-ft') ? 'feet' : 'degrees',
    };

    onSelectCRS(customCRS);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="bg-[#181411] border border-stone-700/80 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-[#110E0C]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/15 rounded-xl text-amber-400 border border-amber-500/30">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-[#FAF6F0] text-base">Coordinate Reference System (CRS) Registry</h3>
              <p className="text-xs text-stone-400">Search authority codes, EPSG definitions, or configure custom Proj4 strings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-stone-800 bg-[#13110E]">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by EPSG code or name (e.g. WGS 84, British National Grid, Lambert, UTM)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-[#181411] border border-stone-700 rounded-xl pl-10 pr-4 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              autoFocus
            />
          </div>
        </div>

        {/* List of CRS */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {results.length > 0 ? (
            results.map((crs) => {
              const isSelected = selectedCRS.toUpperCase() === crs.code.toUpperCase();
              return (
                <div
                  key={crs.code}
                  onClick={() => {
                    onSelectCRS(crs);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between ${
                    isSelected
                      ? 'border-amber-500 bg-amber-950/40 text-white ring-1 ring-amber-500/40 shadow-sm'
                      : 'border-stone-800 bg-stone-900/40 hover:border-stone-700 hover:bg-stone-900/80 text-stone-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-stone-800 text-amber-400 border border-stone-700">
                        {crs.code}
                      </span>
                      <span className="font-display font-bold text-sm text-[#FAF6F0]">{crs.name}</span>
                    </div>
                    <p className="text-xs text-stone-400">{crs.area} · Units: {crs.unit}</p>
                    <p className="text-[11px] font-mono text-stone-500 truncate max-w-lg">{crs.proj4}</p>
                  </div>
                  {isSelected && (
                    <span className="p-1 text-amber-400">
                      <Check className="w-5 h-5" />
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-stone-500 text-sm">
              No matching standard CRS definitions found for "{query}".
            </div>
          )}

          {/* Custom Proj4 input section */}
          <div className="mt-6 pt-4 border-t border-stone-800">
            <div className="flex items-center space-x-2 mb-2 text-stone-300 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Define Custom CRS (PROJ string)</span>
            </div>
            <form onSubmit={handleCustomSubmit} className="space-y-3 bg-[#110E0C] p-3 rounded-xl border border-stone-800">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Code (e.g. USER:1001)"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  className="bg-[#181411] border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 font-mono focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="+proj=... +datum=... +units=m"
                  value={customProj4}
                  onChange={(e) => setCustomProj4(e.target.value)}
                  className="col-span-2 bg-[#181411] border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!customCode || !customProj4}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs text-stone-950 rounded-lg font-bold transition-colors"
                >
                  Register Custom CRS
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-800 bg-[#110E0C] flex items-center justify-between text-xs text-stone-400">
          <span>PROJ 9.3+ geodetic definitions</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-850 hover:bg-stone-800 text-stone-200 font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
