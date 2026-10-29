import React, { useState } from 'react';
import { 
  Stethoscope, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeftRight, 
  Wrench, 
  Sparkles, 
  Globe, 
  ShieldCheck, 
  Check
} from 'lucide-react';
import { CRSInfo, SpatialDataset } from '../types/gis';
import { autoRepairGeometries, diagnoseDataset, swapDatasetCoordinates } from '../core/spatialDoctor';
import { computeGeoJSONBounds, validateDatasetGeometries } from '../core/geometryValidation';

interface SpatialDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  onUpdateDataset: (updated: SpatialDataset) => void;
}

export const SpatialDoctorModal: React.FC<SpatialDoctorModalProps> = ({
  isOpen,
  onClose,
  datasets,
  onUpdateDataset,
}) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => datasets[0]?.id || '');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentDataset = datasets.find(d => d.id === selectedDatasetId) || datasets[0];
  if (!currentDataset) return null;

  const diagnosis = diagnoseDataset(currentDataset);

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleSwapAxes = () => {
    const swapped = swapDatasetCoordinates(currentDataset.geojson);
    const newBounds = computeGeoJSONBounds(swapped);
    const newIssues = validateDatasetGeometries(swapped, currentDataset.detectedCRS?.code);

    const updated: SpatialDataset = {
      ...currentDataset,
      geojson: swapped,
      bounds: newBounds,
      validationIssues: newIssues,
      status: newIssues.some(i => i.severity === 'error') ? 'invalid' : newIssues.length > 0 ? 'warning' : 'ready',
    };

    onUpdateDataset(updated);
    showNotification('Coordinate axes inverted successfully (X ↔ Y swapped).');
  };

  const handleApplySuggestedCRS = (crs: CRSInfo) => {
    const updated: SpatialDataset = {
      ...currentDataset,
      detectedCRS: crs,
      crsStatus: 'verified',
    };
    onUpdateDataset(updated);
    showNotification(`Assigned fingerprinted CRS: ${crs.code} (${crs.name})`);
  };

  const handleAutoRepair = () => {
    const { repairedGeojson, stats } = autoRepairGeometries(currentDataset.geojson);
    const newBounds = computeGeoJSONBounds(repairedGeojson);
    const newIssues = validateDatasetGeometries(repairedGeojson, currentDataset.detectedCRS?.code);

    const updated: SpatialDataset = {
      ...currentDataset,
      geojson: repairedGeojson,
      bounds: newBounds,
      validationIssues: newIssues,
      status: newIssues.some(i => i.severity === 'error') ? 'invalid' : newIssues.length > 0 ? 'warning' : 'ready',
    };

    onUpdateDataset(updated);
    showNotification(`Auto-repair complete! Closed ${stats.ringsClosed} ring(s), removed ${stats.duplicatesRemoved} duplicate vertex(es).`);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="bg-[#181411] border border-stone-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-[#110E0C]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/15 rounded-xl text-amber-400 border border-amber-500/30">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-display font-bold text-[#FAF6F0] text-base">Spatial Pre-Flight Doctor & Auto-Repair</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-600/40">
                  Pre-Flight
                </span>
              </div>
              <p className="text-xs text-stone-400">Heuristic coordinate inspection, axis-inversion detection, and 1-click topology repair</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dataset Selector Bar */}
        <div className="px-6 py-2.5 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-stone-400 font-medium">Dataset to Inspect:</span>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="bg-[#13110E] border border-stone-700 rounded-lg px-3 py-1 text-stone-100 font-medium focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id} className="bg-stone-900 text-stone-100">
                  {d.name} ({d.featureCount} feats, {d.detectedCRS?.code || 'No CRS'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-stone-400">Health Index:</span>
            <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#13110E] border border-stone-700 font-mono font-bold">
              <span className={`w-2 h-2 rounded-full ${diagnosis.healthScore > 80 ? 'bg-emerald-400' : diagnosis.healthScore > 50 ? 'bg-amber-400' : 'bg-rose-400'}`} />
              <span className={diagnosis.healthScore > 80 ? 'text-emerald-400' : diagnosis.healthScore > 50 ? 'text-amber-400' : 'text-rose-400'}>
                {diagnosis.healthScore}%
              </span>
            </div>
          </div>
        </div>

        {/* Success Toast */}
        {successToast && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-600/60 text-emerald-300 text-xs flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Diagnostic Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Diagnostic 1: Axis Inversion (Lat vs Lon Swap) */}
          <div className={`p-4 rounded-xl border ${diagnosis.hasInvertedCoordinates ? 'bg-amber-950/30 border-amber-500/70' : 'bg-stone-900/40 border-stone-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <ArrowLeftRight className={`w-4 h-4 ${diagnosis.hasInvertedCoordinates ? 'text-amber-400' : 'text-emerald-400'}`} />
                <span className="font-display font-bold text-sm text-[#FAF6F0]">Coordinate Axis Inversion Anomaly (X ↔ Y)</span>
              </div>
              {diagnosis.hasInvertedCoordinates ? (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/50 font-mono text-[10px] font-bold">
                  {diagnosis.axisInversionConfidence}% Swap Confidence
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px]">
                  Axes Normal
                </span>
              )}
            </div>

            {diagnosis.hasInvertedCoordinates ? (
              <div className="space-y-3">
                <p className="text-amber-200/90 leading-relaxed font-sans">{diagnosis.inversionReason}</p>
                <button
                  onClick={handleSwapAxes}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/30 transition-colors"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Execute 1-Click Axis Swap (Flip X ↔ Y)</span>
                </button>
              </div>
            ) : (
              <p className="text-stone-400 font-sans">
                Longitude and Latitude coordinate axes follow standard right-hand GIS conventions (Easting/X first, Northing/Y second).
              </p>
            )}
          </div>

          {/* Diagnostic 2: CRS Fingerprinting */}
          <div className="p-4 rounded-xl bg-stone-900/40 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-amber-400" />
                <span className="font-display font-bold text-sm text-[#FAF6F0]">CRS Bounding Box Fingerprinting</span>
              </div>
              <span className="text-[11px] font-mono text-stone-400">
                Current: <b className="text-amber-400">{currentDataset.detectedCRS?.code || 'Undefined'}</b>
              </span>
            </div>

            <p className="text-stone-400 font-sans">
              The engine analyzed coordinate magnitudes [X: {currentDataset.bounds[0].toFixed(2)} to {currentDataset.bounds[2].toFixed(2)}, Y: {currentDataset.bounds[1].toFixed(2)} to {currentDataset.bounds[3].toFixed(2)}] against global projection envelopes.
            </p>

            {diagnosis.suggestedCRS.length > 0 ? (
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold text-stone-300 uppercase tracking-wider block">Recommended Candidate CRSs:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {diagnosis.suggestedCRS.map((crs) => (
                    <div
                      key={crs.code}
                      className="p-3 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-500/50 flex items-center justify-between transition-colors"
                    >
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-xs font-bold text-amber-400">{crs.code}</span>
                          <span className="text-stone-200 text-xs font-semibold">{crs.name}</span>
                        </div>
                        <span className="text-[10px] text-stone-400 block mt-0.5">{crs.area}</span>
                      </div>
                      <button
                        onClick={() => handleApplySuggestedCRS(crs)}
                        className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900/70 text-amber-300 border border-amber-600/50 text-[11px] font-semibold transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-stone-500 text-xs">No higher-confidence alternative CRS candidates matched.</div>
            )}
          </div>

          {/* Diagnostic 3: Topology & Vertex Integrity */}
          <div className="p-4 rounded-xl bg-stone-900/40 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wrench className="w-4 h-4 text-amber-400" />
                <span className="font-display font-bold text-sm text-[#FAF6F0]">Topological Integrity & Vertex Audit</span>
              </div>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${diagnosis.repairAvailable ? 'bg-amber-950/50 text-amber-300 border border-amber-600/40' : 'bg-emerald-950/50 text-emerald-300 border border-emerald-600/40'}`}>
                {diagnosis.repairAvailable ? 'Repairs Available' : 'Clean Topology'}
              </span>
            </div>

            <p className="text-stone-400 font-sans">
              Checks for unclosed polygon rings, duplicate consecutive vertices, self-intersecting polygon borders, and NaN coordinates.
            </p>

            {diagnosis.repairAvailable ? (
              <div className="space-y-3 pt-1">
                <div className="p-3 bg-amber-950/30 rounded-xl border border-amber-800/40 text-amber-200/90 text-xs space-y-1">
                  <p className="font-semibold text-amber-300">Detected Geometric Defects:</p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                    {currentDataset.validationIssues.map((issue, idx) => (
                      <li key={idx}><span className="font-mono">{issue.code}</span>: {issue.message}</li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={handleAutoRepair}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-stone-950 font-bold shadow-md shadow-amber-950/40 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Execute Auto-Repair (Close Rings & Deduplicate Vertices)</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-emerald-400 font-medium pt-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Geometries adhere strictly to OGC Simple Features specifications.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-800 bg-[#110E0C] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-850 hover:bg-stone-800 text-xs font-semibold text-stone-200 transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
