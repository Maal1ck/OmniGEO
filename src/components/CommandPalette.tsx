import React, { useEffect, useState } from 'react';
import { 
  Search, 
  Layers, 
  Settings2, 
  Map as MapIcon, 
  Activity, 
  Play, 
  Sparkles, 
  Trash2, 
  Globe, 
  FileCode, 
  Terminal, 
  CheckCircle2, 
  X, 
  Stethoscope, 
  TableProperties, 
  Award 
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Format' | 'CRS' | 'Action';
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: 'craft' | 'workspace' | 'lab' | 'map' | 'monitor') => void;
  onStartBatch: () => void;
  onLoadSampleData: () => void;
  onSetFormat: (format: any) => void;
  onSetCRS: (crsCode: string) => void;
  onToggleDryRun: () => void;
  onClearDatasets: () => void;
  onOpenPythonModal: () => void;
  onOpenSpatialDoctor: () => void;
  onOpenSchemaHarmonizer: () => void;
  onOpenAuditCertificate: () => void;
  onCalculateSurfaces?: (unit: any) => void;
  onOpenAggregationModal?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  setActiveTab,
  onStartBatch,
  onLoadSampleData,
  onSetFormat,
  onSetCRS,
  onToggleDryRun,
  onClearDatasets,
  onOpenPythonModal,
  onOpenSpatialDoctor,
  onOpenSchemaHarmonizer,
  onOpenAuditCertificate,
}) => {
  const [query, setQuery] = useState('');

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands: CommandItem[] = [
    // Navigation
    {
      id: 'nav-craft',
      title: 'Go to Craft Studio ("What do you want to craft?")',
      category: 'Navigation',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      run: () => { setActiveTab('craft'); onClose(); },
    },
    {
      id: 'nav-workspace',
      title: 'Go to Batch Workspace',
      category: 'Navigation',
      icon: <Layers className="w-4 h-4 text-amber-400" />,
      run: () => { setActiveTab('workspace'); onClose(); },
    },
    {
      id: 'nav-lab',
      title: 'Go to Conversion Lab',
      category: 'Navigation',
      icon: <Settings2 className="w-4 h-4 text-amber-400" />,
      run: () => { setActiveTab('lab'); onClose(); },
    },
    {
      id: 'nav-map',
      title: 'Go to Map Preview & Visual Legends',
      category: 'Navigation',
      icon: <MapIcon className="w-4 h-4 text-amber-400" />,
      run: () => { setActiveTab('map'); onClose(); },
    },
    {
      id: 'nav-monitor',
      title: 'Go to Job Monitor',
      category: 'Navigation',
      icon: <Activity className="w-4 h-4 text-amber-400" />,
      run: () => { setActiveTab('monitor'); onClose(); },
    },

    // Actions
    {
      id: 'act-run',
      title: 'Process Batch / Run Execution',
      category: 'Action',
      icon: <Play className="w-4 h-4 text-indigo-400" />,
      shortcut: '↵',
      run: () => { onStartBatch(); onClose(); },
    },
    {
      id: 'act-samples',
      title: 'Load Sample GIS Datasets (Parcels, Sensors, Transit, Shapefiles)',
      category: 'Action',
      icon: <Sparkles className="w-4 h-4 text-indigo-400" />,
      run: () => { onLoadSampleData(); onClose(); },
    },
    {
      id: 'act-dryrun',
      title: 'Toggle Dry-Run Validation Mode',
      category: 'Action',
      icon: <CheckCircle2 className="w-4 h-4 text-amber-400" />,
      run: () => { onToggleDryRun(); onClose(); },
    },
    {
      id: 'act-doctor',
      title: 'Open Spatial Pre-Flight Doctor (Axis Swap & Auto-Repair)',
      category: 'Action',
      icon: <Stethoscope className="w-4 h-4 text-amber-400" />,
      run: () => { onOpenSpatialDoctor(); onClose(); },
    },
    {
      id: 'act-harmonizer',
      title: 'Open Batch Schema Harmonizer (Field Mapping Matrix)',
      category: 'Action',
      icon: <TableProperties className="w-4 h-4 text-violet-400" />,
      run: () => { onOpenSchemaHarmonizer(); onClose(); },
    },
    {
      id: 'act-cert',
      title: 'Open Certified QA/QC Audit Certificate',
      category: 'Action',
      icon: <Award className="w-4 h-4 text-emerald-400" />,
      run: () => { onOpenAuditCertificate(); onClose(); },
    },
    {
      id: 'act-python',
      title: 'Open Python Desktop Backend & Packaging Architecture',
      category: 'Action',
      icon: <Terminal className="w-4 h-4 text-indigo-400" />,
      run: () => { onOpenPythonModal(); onClose(); },
    },
    {
      id: 'act-clear',
      title: 'Clear All Datasets from Queue',
      category: 'Action',
      icon: <Trash2 className="w-4 h-4 text-rose-400" />,
      run: () => { onClearDatasets(); onClose(); },
    },

    // Formats
    {
      id: 'fmt-gpkg',
      title: 'Set Target Format: GeoPackage (.gpkg)',
      category: 'Format',
      icon: <FileCode className="w-4 h-4 text-indigo-400" />,
      run: () => { onSetFormat('geopackage'); onClose(); },
    },
    {
      id: 'fmt-shp',
      title: 'Set Target Format: ESRI Shapefile (.zip suite)',
      category: 'Format',
      icon: <FileCode className="w-4 h-4 text-amber-400" />,
      run: () => { onSetFormat('shapefile'); onClose(); },
    },
    {
      id: 'fmt-geojson',
      title: 'Set Target Format: RFC 7946 GeoJSON (.geojson)',
      category: 'Format',
      icon: <FileCode className="w-4 h-4 text-emerald-400" />,
      run: () => { onSetFormat('geojson'); onClose(); },
    },

    // CRS
    {
      id: 'crs-4326',
      title: 'Set Target CRS: WGS 84 (EPSG:4326)',
      category: 'CRS',
      icon: <Globe className="w-4 h-4 text-sky-400" />,
      run: () => { onSetCRS('EPSG:4326'); onClose(); },
    },
    {
      id: 'crs-3857',
      title: 'Set Target CRS: Web Mercator (EPSG:3857)',
      category: 'CRS',
      icon: <Globe className="w-4 h-4 text-sky-400" />,
      run: () => { onSetCRS('EPSG:3857'); onClose(); },
    },
    {
      id: 'crs-27700',
      title: 'Set Target CRS: British National Grid (EPSG:27700)',
      category: 'CRS',
      icon: <Globe className="w-4 h-4 text-sky-400" />,
      run: () => { onSetCRS('EPSG:27700'); onClose(); },
    },
    {
      id: 'crs-2154',
      title: 'Set Target CRS: Lambert-93 France (EPSG:2154)',
      category: 'CRS',
      icon: <Globe className="w-4 h-4 text-sky-400" />,
      run: () => { onSetCRS('EPSG:2154'); onClose(); },
    },
  ];

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-20 bg-black/85 backdrop-blur-md p-4">
      <div className="bg-[#181411] border border-stone-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-stone-800 bg-[#110E0C]">
          <Search className="w-4 h-4 text-stone-400 mr-3" />
          <input
            type="text"
            placeholder="Type a command, format, CRS, or action..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-stone-100 placeholder-stone-500 focus:outline-none"
            autoFocus
          />
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 font-sans">
          {filtered.length > 0 ? (
            filtered.map((cmd) => (
              <div
                key={cmd.id}
                onClick={cmd.run}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-stone-800/80 cursor-pointer text-xs text-stone-200 transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-1.5 rounded-lg bg-stone-800 group-hover:bg-amber-950/60 group-hover:text-amber-300 transition-colors">
                    {cmd.icon}
                  </div>
                  <div>
                    <span className="font-semibold text-[#FAF6F0]">{cmd.title}</span>
                    <span className="ml-2 text-[10px] text-stone-400 font-mono uppercase">{cmd.category}</span>
                  </div>
                </div>
                {cmd.shortcut && (
                  <kbd className="font-mono text-[10px] bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700 text-stone-400">
                    {cmd.shortcut}
                  </kbd>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-stone-500 text-xs">
              No matching commands found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#110E0C] border-t border-stone-800 text-[11px] text-stone-500 flex justify-between font-mono">
          <span>Navigate with <b>↑</b> <b>↓</b>, select with <b>Enter</b></span>
          <span><b>ESC</b> to close</span>
        </div>
      </div>
    </div>
  );
};
