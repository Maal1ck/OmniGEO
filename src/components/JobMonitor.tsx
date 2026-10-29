import React, { useState } from 'react';
import { 
  Activity, 
  Play, 
  Square, 
  RefreshCw, 
  Download, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check, 
  FileSpreadsheet, 
  Award, 
  Layers,
  Terminal,
  Cpu
} from 'lucide-react';
import JSZip from 'jszip';
import { ConversionJob, BatchManifest } from '../types/gis';

interface JobMonitorProps {
  jobs: ConversionJob[];
  isProcessing: boolean;
  onStartBatch: () => void;
  onCancelBatch: () => void;
  onRetryFailed: () => void;
  manifest: BatchManifest | null;
  onExportManifest: (format: 'json' | 'csv') => void;
  onOpenAuditCertificate?: () => void;
  hasCertificate?: boolean;
  onDownloadConsolidated?: () => void;
  hasConsolidated?: boolean;
}

export const JobMonitor: React.FC<JobMonitorProps> = ({
  jobs,
  isProcessing,
  onStartBatch,
  onCancelBatch,
  onRetryFailed,
  manifest,
  onExportManifest,
  onOpenAuditCertificate,
  hasCertificate,
  onDownloadConsolidated,
  hasConsolidated,
}) => {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const total = jobs.length;
  const completed = jobs.filter(j => j.status === 'completed' || j.status === 'dry_run_passed').length;
  const completedWarnings = jobs.filter(j => j.status === 'completed_warnings' || j.status === 'dry_run_warning').length;
  const failed = jobs.filter(j => j.status === 'failed' || j.status === 'dry_run_failed').length;
  const running = jobs.filter(j => j.status === 'running').length;
  const queued = jobs.filter(j => j.status === 'queued').length;

  const progressPercent = total > 0 ? Math.round(((completed + completedWarnings + failed) / total) * 100) : 0;

  // Single file download
  const handleDownloadSingle = (job: ConversionJob) => {
    if (!job.outputBlob) return;
    const url = URL.createObjectURL(job.outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = job.outputFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download All as ZIP
  const handleDownloadAllZip = async () => {
    const zip = new JSZip();
    const readyJobs = jobs.filter(j => j.outputBlob);
    if (!readyJobs.length) return;

    for (const job of readyJobs) {
      if (job.outputBlob) {
        zip.file(job.outputFileName, job.outputBlob);
      }
    }

    if (manifest) {
      zip.file('batch_manifest.json', JSON.stringify(manifest, null, 2));
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnigeo_batch_export_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyLogText = (job: ConversionJob) => {
    const text = job.logs.map(l => `[${l.timestamp}] [${l.stage.toUpperCase()}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogId(job.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#13110E] p-6 space-y-6 text-[#F5EBE1]">
      {/* Top Batch Execution Overview */}
      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-display font-bold text-[#FAF6F0] flex items-center space-x-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Batch Execution Monitor & Pipeline Telemetry</span>
              </h1>
              {isProcessing && (
                <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-amber-950 border border-amber-700/60 text-amber-300 text-[10px] font-mono animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>EXECUTING WORKERS</span>
                </span>
              )}
            </div>
            <p className="text-xs text-stone-400 mt-1">
              Real-time multi-threaded PROJ transformation stream, per-dataset stage logging, and SHA-256 audited delivery
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isProcessing ? (
              <button
                onClick={onCancelBatch}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-950/70 text-rose-300 border border-rose-800/80 hover:bg-rose-900/70 transition-colors shadow-sm"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Halt Batch</span>
              </button>
            ) : (
              <button
                onClick={onStartBatch}
                disabled={jobs.length === 0}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-stone-950 shadow-lg shadow-amber-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Batch Queue</span>
              </button>
            )}

            {failed > 0 && !isProcessing && (
              <button
                onClick={onRetryFailed}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-stone-850 hover:bg-stone-800 text-amber-300 border border-amber-600/50 transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Failed ({failed})</span>
              </button>
            )}

            {jobs.some(j => j.outputBlob) && (
              <>
                <button
                  onClick={handleDownloadAllZip}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-stone-850 hover:bg-stone-800 text-amber-300 border border-stone-700 transition-all shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download ZIP Bundle</span>
                </button>

                {hasConsolidated && onDownloadConsolidated && (
                  <button
                    onClick={onDownloadConsolidated}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-600/60 transition-all shadow-sm ring-1 ring-amber-500/30"
                    title="Download consolidated multi-layer GeoPackage + QGIS project bundle"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Multi-Layer GPKG Handoff</span>
                  </button>
                )}

                {hasCertificate && onOpenAuditCertificate && (
                  <button
                    onClick={onOpenAuditCertificate}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-600/60 transition-all shadow-sm ring-1 ring-emerald-500/30"
                    title="Open certified QA/QC Compliance Report"
                  >
                    <Award className="w-3.5 h-3.5 text-emerald-400" />
                    <span>QA/QC Audit Certificate</span>
                  </button>
                )}
              </>
            )}

            {/* Export Manifest buttons */}
            <div className="flex items-center bg-stone-900 border border-stone-800 rounded-xl p-0.5 shadow-inner">
              <button
                onClick={() => onExportManifest('json')}
                disabled={jobs.length === 0}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs text-stone-300 hover:text-amber-300 hover:bg-stone-800 rounded-lg disabled:opacity-40 transition-colors"
                title="Export Batch Manifest (JSON)"
              >
                <FileText className="w-3 h-3" />
                <span>JSON</span>
              </button>
              <button
                onClick={() => onExportManifest('csv')}
                disabled={jobs.length === 0}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs text-stone-300 hover:text-amber-300 hover:bg-stone-800 rounded-lg disabled:opacity-40 transition-colors"
                title="Export Batch Manifest (CSV)"
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar with glow */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-stone-400">
              Batch Progress: <span className="text-[#FAF6F0] font-bold tabular-nums">{progressPercent}%</span> ({completed + completedWarnings + failed} / {total} files completed)
            </span>
            <span className="text-amber-400 font-semibold flex items-center space-x-1.5">
              {running > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>{running} worker thread(s) running</span>
                </>
              ) : isProcessing ? (
                'Initializing pipeline...'
              ) : (
                <span className="text-stone-500">Pipeline ready</span>
              )}
            </span>
          </div>
          <div className="h-3 w-full bg-[#100D0B] rounded-full overflow-hidden border border-stone-800 p-0.5 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                failed > 0
                  ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-rose-500'
                  : 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-400 shadow-sm shadow-amber-500/40'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Moderate Color Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
          <div className="p-3 bg-stone-900/60 border border-stone-800 border-t-2 border-t-amber-500 rounded-xl text-center font-mono shadow-sm">
            <span className="text-stone-400 text-[10px] block uppercase tracking-wider">Total Files</span>
            <span className="text-base font-bold text-[#FAF6F0] mt-0.5 block tabular-nums">{total}</span>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 border-t-2 border-t-emerald-500 rounded-xl text-center font-mono shadow-sm">
            <span className="text-stone-400 text-[10px] block uppercase tracking-wider">Completed</span>
            <span className="text-base font-bold text-emerald-400 mt-0.5 block tabular-nums">{completed}</span>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 border-t-2 border-t-amber-500 rounded-xl text-center font-mono shadow-sm">
            <span className="text-stone-400 text-[10px] block uppercase tracking-wider">Warnings</span>
            <span className="text-base font-bold text-amber-400 mt-0.5 block tabular-nums">{completedWarnings}</span>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 border-t-2 border-t-rose-500 rounded-xl text-center font-mono shadow-sm">
            <span className="text-stone-400 text-[10px] block uppercase tracking-wider">Failed</span>
            <span className="text-base font-bold text-rose-400 mt-0.5 block tabular-nums">{failed}</span>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 border-t-2 border-t-stone-600 rounded-xl text-center font-mono shadow-sm">
            <span className="text-stone-400 text-[10px] block uppercase tracking-wider">Queued</span>
            <span className="text-base font-bold text-stone-400 mt-0.5 block tabular-nums">{queued}</span>
          </div>
        </div>
      </div>

      {/* Jobs Execution List */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-stone-800">
        <div className="px-5 py-3.5 border-b border-stone-800 bg-stone-900/80 flex items-center justify-between">
          <h2 className="text-xs font-display font-bold text-stone-200 uppercase tracking-wider">
            Job Execution Queue & Artifacts
          </h2>
          <span className="text-[11px] text-stone-400 font-mono">
            {jobs.length} jobs tracked
          </span>
        </div>

        <div className="divide-y divide-stone-850/60 font-mono text-xs">
          {jobs.length > 0 ? (
            jobs.map((job) => {
              const isExpanded = expandedJobId === job.id;
              return (
                <div key={job.id} className="transition-colors hover:bg-stone-900/40">
                  <div
                    onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer"
                  >
                    {/* Left: Indicator, Name, Transformation */}
                    <div className="flex items-center space-x-3">
                      <button className="text-stone-400 hover:text-stone-200">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-[#FAF6F0] font-sans text-xs">{job.inputDatasetName}</span>
                          <span className="text-[10px] text-stone-500">→</span>
                          <span className="text-amber-400 font-mono text-[11px] font-semibold">{job.outputFileName}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] text-stone-400">
                          <span className="uppercase px-1 py-0.2 rounded bg-stone-800 text-stone-300">{job.inputFormat}</span>
                          <span>→</span>
                          <span className="uppercase px-1 py-0.2 rounded bg-amber-950/70 text-amber-300 border border-amber-700/40">{job.targetFormat}</span>
                          <span>·</span>
                          <span>{job.sourceCRS} → {job.targetCRS} ({job.crsMode})</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Stage, Status, Duration, Download */}
                    <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                      {/* Current Stage */}
                      <span className="hidden md:inline text-[11px] text-stone-400 font-sans">
                        {job.stage}
                      </span>

                      {/* Status Badge */}
                      {job.status === 'completed' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-600/40">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Completed</span>
                        </span>
                      )}
                      {job.status === 'completed_warnings' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/50 text-amber-300 border border-amber-600/40">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>Warnings</span>
                        </span>
                      )}
                      {job.status === 'failed' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/50 text-rose-300 border border-rose-600/40">
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                          <span>Failed</span>
                        </span>
                      )}
                      {job.status === 'running' && (
                        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/50 text-amber-300 border border-amber-600/40 animate-pulse">
                          <Activity className="w-3 h-3 text-amber-400 animate-spin" />
                          <span>Running</span>
                        </span>
                      )}
                      {job.status === 'queued' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-stone-800 text-stone-400">
                          <Clock className="w-3 h-3" />
                          <span>Queued</span>
                        </span>
                      )}
                      {job.status === 'dry_run_passed' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/50 text-amber-300 border border-amber-600/40">
                          <CheckCircle2 className="w-3 h-3 text-amber-400" />
                          <span>Dry-Run OK</span>
                        </span>
                      )}

                      {/* Duration */}
                      {job.durationMs !== undefined && (
                        <span className="text-[11px] text-stone-400 tabular-nums">
                          {job.durationMs}ms
                        </span>
                      )}

                      {/* Download */}
                      {job.outputBlob && (
                        <button
                          onClick={() => handleDownloadSingle(job)}
                          className="p-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-stone-950 border border-amber-500/30 transition-colors"
                          title="Download converted file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Execution Logs */}
                  {isExpanded && (
                    <div className="bg-[#100D0B] border-t border-stone-800 p-4 space-y-3 font-mono text-xs">
                      <div className="flex items-center justify-between text-stone-400 pb-2 border-b border-stone-800">
                        <span className="text-[11px] uppercase font-bold text-stone-300">
                          Execution Pipeline Log ({job.logs.length} events)
                        </span>
                        <button
                          onClick={() => copyLogText(job)}
                          className="flex items-center space-x-1 text-stone-400 hover:text-stone-200 text-[11px]"
                        >
                          {copiedLogId === job.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedLogId === job.id ? 'Copied' : 'Copy Log'}</span>
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {job.logs.map((log, idx) => (
                          <div key={idx} className="flex items-start space-x-2 text-[11px]">
                            <span className="text-stone-500 tabular-nums">{log.timestamp}</span>
                            <span className={`px-1.5 rounded text-[9px] uppercase font-bold ${
                              log.level === 'error'
                                ? 'bg-rose-950/70 text-rose-300 border border-rose-800/50'
                                : log.level === 'warn'
                                ? 'bg-amber-950/70 text-amber-300 border border-amber-800/50'
                                : 'bg-stone-800 text-stone-400'
                            }`}>
                              {log.stage}
                            </span>
                            <span className={`flex-1 ${
                              log.level === 'error'
                                ? 'text-rose-300'
                                : log.level === 'warn'
                                ? 'text-amber-300'
                                : 'text-stone-300'
                            }`}>
                              {log.message}
                            </span>
                          </div>
                        ))}
                      </div>

                      {job.error && (
                        <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                          <span className="font-bold">Error Details: </span>{job.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-stone-400 font-sans space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto text-amber-400/60">
                <Activity className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-display font-bold text-stone-200">No Active Batch Processing Jobs</p>
                <p className="text-xs text-stone-400 max-w-md mx-auto">
                  Load files in the Workspace or adjust geodetic target parameters in the Conversion Lab, then click "Run Batch Queue" or "Process Batch" to initiate PROJ transforms.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
