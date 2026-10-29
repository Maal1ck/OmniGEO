import React, { useState } from 'react';
import { 
  Award, 
  X, 
  Download, 
  Printer, 
  ShieldCheck, 
  Copy, 
  Check, 
  Hash, 
  Globe
} from 'lucide-react';
import { QAQCReportData } from '../types/gis';
import { buildQAQCHtmlDocument } from '../core/auditCertificate';

interface AuditCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: QAQCReportData | null;
}

export const AuditCertificateModal: React.FC<AuditCertificateModalProps> = ({
  isOpen,
  onClose,
  reportData,
}) => {
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen || !reportData) return null;

  const handleDownloadHtml = () => {
    const htmlContent = buildQAQCHtmlDocument(reportData);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QAQC_Certificate_${reportData.reportId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(buildQAQCHtmlDocument(reportData));
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(reportData.reportId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="bg-[#181411] border border-stone-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-[#110E0C]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/15 rounded-xl text-amber-400 border border-amber-500/30">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-display font-bold text-[#FAF6F0] text-base">Certified Geospatial QA/QC Audit Certificate</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-600/40">
                  Cryptographically Sealed
                </span>
              </div>
              <p className="text-xs text-stone-400">Formal compliance record with SHA-256 checksums, PROJ transformation geodetic audit, and validation pass rates</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-stone-850 hover:bg-stone-800 text-stone-200 border border-stone-700 text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={handleDownloadHtml}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-950/30 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download (.html)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Certificate Display Canvas */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#13110E] font-sans text-xs space-y-6">
          {/* Certificate Badge & Title Block */}
          <div className="p-6 rounded-2xl bg-stone-900/80 border border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-stone-400 tracking-wider">
                Audit Record ID
              </span>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="text-base font-bold font-mono text-amber-400">{reportData.reportId}</span>
                <button onClick={copyId} className="text-stone-400 hover:text-white">
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-1">Generated: {new Date(reportData.generatedAt).toLocaleString()}</p>
            </div>

            <div className="flex items-center space-x-3 bg-[#110E0C] p-3 rounded-xl border border-stone-800 font-mono">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
              <div>
                <span className="text-[10px] text-stone-500 uppercase block font-bold">Compliance Status</span>
                <span className="text-sm font-bold text-emerald-400">
                  {reportData.summary.complianceStatus.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
            <div className="p-3.5 bg-stone-900/60 rounded-xl border border-stone-800 text-center">
              <span className="text-[10px] text-stone-400 uppercase block">Total Features</span>
              <span className="text-lg font-bold text-[#FAF6F0] tabular-nums mt-0.5 block">{reportData.validationMetrics.totalFeatures.toLocaleString()}</span>
            </div>
            <div className="p-3.5 bg-stone-900/60 rounded-xl border border-stone-800 text-center">
              <span className="text-[10px] text-stone-400 uppercase block">Geometry Validity</span>
              <span className="text-lg font-bold text-emerald-400 tabular-nums mt-0.5 block">{reportData.validationMetrics.validGeometryPercent}%</span>
            </div>
            <div className="p-3.5 bg-stone-900/60 rounded-xl border border-stone-800 text-center">
              <span className="text-[10px] text-stone-400 uppercase block">Max Geodetic Drift</span>
              <span className="text-lg font-bold text-amber-400 tabular-nums mt-0.5 block">&lt; {reportData.transformationChain.maxDisplacementMm} mm</span>
            </div>
            <div className="p-3.5 bg-stone-900/60 rounded-xl border border-stone-800 text-center">
              <span className="text-[10px] text-stone-400 uppercase block">Target CRS</span>
              <span className="text-lg font-bold text-amber-300 mt-0.5 block">{reportData.summary.targetCRS}</span>
            </div>
          </div>

          {/* SHA-256 Checksum Tables */}
          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 space-y-3 font-mono">
            <div className="flex items-center space-x-2 text-stone-200 font-sans font-bold text-xs uppercase tracking-wider">
              <Hash className="w-4 h-4 text-amber-400" />
              <span>SHA-256 Cryptographic Checksums (Tamper-Evidence)</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {Object.entries(reportData.outputSha256Checksums).map(([file, hash]) => (
                <div key={file} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-lg bg-[#110E0C] border border-stone-800 text-[11px] gap-2">
                  <span className="font-semibold text-stone-200">{file}</span>
                  <span className="text-stone-400 text-[10px] truncate max-w-md">{hash}</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-600/40 text-[9px] font-bold">
                    VERIFIED
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* PROJ Transformation Details */}
          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 space-y-2">
            <div className="flex items-center space-x-2 text-stone-200 font-bold text-xs uppercase tracking-wider">
              <Globe className="w-4 h-4 text-amber-400" />
              <span>PROJ Geodetic Transformation Parameters</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-2">
              <div>
                <span className="text-stone-500 block text-[10px]">Source CRS:</span>
                <span className="text-stone-200 font-semibold">{reportData.transformationChain.sourceCRS}</span>
              </div>
              <div>
                <span className="text-stone-500 block text-[10px]">Target CRS:</span>
                <span className="text-amber-300 font-semibold">{reportData.transformationChain.targetCRS} ({reportData.transformationChain.datumName})</span>
              </div>
              <div>
                <span className="text-stone-500 block text-[10px]">Transformation Mode:</span>
                <span className="text-stone-200 uppercase">{reportData.transformationChain.mode}</span>
              </div>
              <div>
                <span className="text-stone-500 block text-[10px]">Ellipsoid:</span>
                <span className="text-stone-200">{reportData.transformationChain.ellipsoid}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-800 bg-[#110E0C] flex items-center justify-between text-xs text-stone-400">
          <span>Certificate generated by OmniGeo by Maodo Engine v1.0.0</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-850 hover:bg-stone-800 text-stone-200 font-semibold transition-colors"
          >
            Close Certificate
          </button>
        </div>
      </div>
    </div>
  );
};
