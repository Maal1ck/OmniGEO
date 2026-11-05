import React, { useState } from 'react';
import { Search, Globe, Check, X, ShieldAlert } from 'lucide-react';
import { CRSInfo } from '../types/gis';
import { searchCRS } from '../core/crsDefinitions';
import { useTheme } from '../core/theme';

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
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customProj4, setCustomProj4] = useState('');

  if (!isOpen) return null;

  const matchingResults = searchCRS(query);
  const results = matchingResults.slice(0, 100);

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

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in-0 duration-200">
      <div className={`border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden transition-all ${
        isLight
          ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-stone-400/20'
          : 'bg-[#181411] border-stone-700/80 text-stone-100 shadow-stone-950/90'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isLight ? 'bg-[#FAF8F5] border-[#E8E2D8]' : 'bg-[#110E0C] border-stone-800'
        }`}>
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-xl border ${
              isLight
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}>
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-display font-bold text-base ${isLight ? 'text-stone-900' : 'text-[#FAF6F0]'}`}>
                Coordinate Reference System (CRS) Registry
              </h3>
              <p className={`text-xs ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                Search 6,900+ EPSG codes, Moroccan Merchich datums, or configure custom Proj4 strings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight ? 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/60' : 'text-stone-400 hover:text-white hover:bg-stone-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className={`p-4 border-b ${isLight ? 'bg-[#F5F1EA] border-[#E8E2D8]' : 'bg-[#13110E] border-stone-800'}`}>
          <div className="relative">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-stone-500' : 'text-stone-400'}`} />
            <input
              type="text"
              placeholder="Search by EPSG code or name (e.g. Sud Maroc, Merchich, 26192, WGS 84, Lambert, UTM)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                isLight
                  ? 'bg-white border border-[#D5CDBD] text-stone-900 placeholder-stone-500 focus:border-amber-600'
                  : 'bg-[#181411] border border-stone-700 text-stone-100 placeholder-stone-500 focus:border-amber-500'
              }`}
              autoFocus
            />
          </div>
          {matchingResults.length > results.length && (
            <p className={`mt-2 text-[11px] ${isLight ? 'text-stone-600' : 'text-stone-500'}`}>
              Showing first {results.length} of {matchingResults.length.toLocaleString()} matches. Refine your query to narrow down.
            </p>
          )}
        </div>

        {/* Quick Suggestion Pills */}
        <div className={`px-4 py-2 border-b flex items-center space-x-1.5 overflow-x-auto text-[11px] font-mono ${
          isLight ? 'bg-[#FAF8F5] border-[#E8E2D8]' : 'bg-[#120F0D] border-stone-800'
        }`}>
          <span className={`text-[10px] font-sans uppercase font-bold shrink-0 ${isLight ? 'text-stone-500' : 'text-stone-500'}`}>
            Quick Pick:
          </span>
          {[
            { label: 'Sud_Maroc_degree (4261)', code: '4261' },
            { label: 'Sud Maroc Metric (26192)', code: '26192' },
            { label: 'Nord Maroc Metric (26191)', code: '26191' },
            { label: 'WGS 84 (4326)', code: '4326' },
            { label: 'Web Mercator (3857)', code: '3857' },
            { label: 'Lambert-93 (2154)', code: '2154' },
          ].map(p => (
            <button
              key={p.code}
              type="button"
              onClick={() => setQuery(p.code)}
              className={`px-2 py-0.5 rounded border shrink-0 transition-colors ${
                query === p.code
                  ? 'bg-amber-600 text-white border-amber-600 font-bold'
                  : isLight
                  ? 'bg-white border-[#E0D7C9] text-stone-700 hover:bg-stone-100 hover:border-amber-500'
                  : 'bg-stone-800/80 border-stone-700 text-stone-300 hover:bg-stone-700 hover:border-amber-500'
              }`}
            >
              {p.label}
            </button>
          ))}
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
                      ? isLight
                        ? 'border-amber-600 bg-amber-50 text-stone-900 ring-2 ring-amber-500/30 shadow-sm'
                        : 'border-amber-500 bg-amber-950/40 text-white ring-1 ring-amber-500/40 shadow-sm'
                      : isLight
                      ? 'border-[#E5DDD0] bg-[#FAF8F5] hover:border-amber-400 hover:bg-white text-stone-800'
                      : 'border-stone-800 bg-stone-900/40 hover:border-stone-700 hover:bg-stone-900/80 text-stone-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${
                        isLight
                          ? 'bg-[#EFE8DD] text-amber-900 border-[#DDD3C2]'
                          : 'bg-stone-800 text-amber-400 border-stone-700'
                      }`}>
                        {crs.code}
                      </span>
                      <span className={`font-display font-bold text-sm ${isLight ? 'text-stone-900' : 'text-[#FAF6F0]'}`}>
                        {crs.name}
                      </span>
                    </div>
                    <p className={`text-xs ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                      {crs.area} · Units: {crs.unit}
                    </p>
                    <p className={`text-[11px] font-mono truncate max-w-lg ${isLight ? 'text-stone-500' : 'text-stone-500'}`}>
                      {crs.proj4}
                    </p>
                    {crs.transformationWarning && (
                      <p className={`text-[11px] ${isLight ? 'text-amber-800 font-medium' : 'text-amber-400'}`}>
                        {crs.transformationWarning}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <span className={`p-1 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                      <Check className="w-5 h-5" />
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className={`text-center py-8 text-sm ${isLight ? 'text-stone-500' : 'text-stone-500'}`}>
              No matching CRS definitions found for &ldquo;{query}&rdquo;.
            </div>
          )}

          {/* Custom Proj4 input section */}
          <div className={`mt-6 pt-4 border-t ${isLight ? 'border-[#E8E2D8]' : 'border-stone-800'}`}>
            <div className={`flex items-center space-x-2 mb-2 text-xs font-bold uppercase tracking-wider ${
              isLight ? 'text-stone-800' : 'text-stone-300'
            }`}>
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>Define Custom CRS (PROJ string)</span>
            </div>
            <form onSubmit={handleCustomSubmit} className={`space-y-3 p-3 rounded-xl border ${
              isLight ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#110E0C] border-stone-800'
            }`}>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Code (e.g. USER:1001)"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-mono focus:border-amber-500 focus:outline-none border ${
                    isLight
                      ? 'bg-white border-[#D5CDBD] text-stone-900 placeholder-stone-500'
                      : 'bg-[#181411] border-stone-700 text-stone-100 placeholder-stone-500'
                  }`}
                />
                <input
                  type="text"
                  placeholder="+proj=... +datum=... +units=m"
                  value={customProj4}
                  onChange={(e) => setCustomProj4(e.target.value)}
                  className={`col-span-2 rounded-lg px-3 py-1.5 text-xs font-mono focus:border-amber-500 focus:outline-none border ${
                    isLight
                      ? 'bg-white border-[#D5CDBD] text-stone-900 placeholder-stone-500'
                      : 'bg-[#181411] border-stone-700 text-stone-100 placeholder-stone-500'
                  }`}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!customCode || !customProj4}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs text-white rounded-lg font-bold transition-colors shadow-sm"
                >
                  Register Custom CRS
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 border-t flex items-center justify-between text-xs ${
          isLight ? 'bg-[#FAF8F5] border-[#E8E2D8] text-stone-600' : 'bg-[#110E0C] border-stone-800 text-stone-400'
        }`}>
          <span>PROJ 9.3+ geodetic &amp; OGC EPSG registry (6,980+ entries)</span>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl font-semibold transition-colors ${
              isLight
                ? 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
