/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  FileKey2,
  FolderOpen,
  Infinity as InfinityIcon,
  KeyRound,
  LogOut,
  Monitor,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  LicenseStatus,
  activateDesktopLicense,
  deactivateDesktopLicense,
  importDesktopLicenseFile,
  startDesktopTrial,
} from '../core/licenseClient';
import { useTheme } from '../core/theme';
import { useI18n } from '../core/i18n';
import { Logo } from './Logo';

interface LicenseGateModalProps {
  status: LicenseStatus;
  /** True when Electron enforces activation before using the workbench */
  isBlockingGate: boolean;
  /** True when user opened License Manager from Header / Tools */
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (nextStatus: LicenseStatus) => void;
  /** Allows previewing the blocking desktop gate from the browser dev preview */
  onToggleGatePreview?: () => void;
  isGatePreviewActive?: boolean;
}

export const LicenseGateModal: React.FC<LicenseGateModalProps> = ({
  status,
  isBlockingGate,
  isOpen,
  onClose,
  onStatusChange,
  onToggleGatePreview,
  isGatePreviewActive = false,
}) => {
  const { theme } = useTheme();
  const { lang } = useI18n();
  const isFr = lang === 'fr';
  const isLight = theme === 'light';

  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const visible = isBlockingGate || isOpen;
  if (!visible) return null;

  const showActivationForm =
    isBlockingGate ||
    status.state === 'unlicensed' ||
    status.state === 'expired' ||
    status.state === 'invalid' ||
    status.state === 'clock_tampered';

  const handleCopyMachineId = async () => {
    try {
      await navigator.clipboard.writeText(status.machineId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = status.machineId;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    }
  };

  const handleActivate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyInput.trim()) return;
    setBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const res = await activateDesktopLicense(keyInput.trim());
      onStatusChange(res.status);
      if (res.ok) {
        setKeyInput('');
        setFeedbackSuccess(
          isFr
            ? 'Licence activée et vérifiée hors ligne avec succès.'
            : 'License verified and activated offline.'
        );
      } else {
        setFeedbackError(res.error || (isFr ? 'Clé de licence invalide.' : 'Invalid license key.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async () => {
    setBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const res = await importDesktopLicenseFile();
      if (!res.canceled) {
        onStatusChange(res.status);
        if (res.ok) {
          setFeedbackSuccess(
            isFr
              ? 'Fichier de licence (.omnigeo-lic) importé et activé.'
              : 'License file (.omnigeo-lic) imported and activated.'
          );
        } else if (res.error) {
          setFeedbackError(res.error);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStartTrial = async () => {
    setBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const res = await startDesktopTrial();
      onStatusChange(res.status);
      if (res.ok) {
        setFeedbackSuccess(
          isFr
            ? 'Essai gratuit de 14 jours activé pour ce poste.'
            : '14-day free trial activated for this desktop.'
        );
      } else if (res.error) {
        setFeedbackError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    setBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const res = await deactivateDesktopLicense();
      onStatusChange(res.status);
    } finally {
      setBusy(false);
    }
  };

  const tierLabel =
    status.tier === 'lifetime'
      ? status.isMasterKey
        ? isFr
          ? 'Licence Maître (Accès Illimité Permanent)'
          : 'Owner Master License (Indefinite)'
        : isFr
          ? 'Licence Perpétuelle (Accès Illimité)'
          : 'Lifetime License (Indefinite)'
      : status.tier === 'annual'
        ? isFr
          ? 'Licence Annuelle (1 an)'
          : '1-Year Annual License'
        : status.tier === 'trial'
          ? isFr
            ? 'Essai Gratuit'
            : 'Free Trial'
          : isFr
            ? 'Aucune licence active'
            : 'Unlicensed';

  const cardCls = isLight
    ? 'bg-white border-[#E2DBD0] text-stone-900'
    : 'bg-[#181411] border-white/[0.08] text-stone-100';
  const subSurface = isLight
    ? 'bg-[#F8F6F1] border-[#E2DBD0]'
    : 'bg-[#120F0D] border-white/[0.08]';
  const mutedText = isLight ? 'text-stone-500' : 'text-stone-400';
  const inputCls = isLight
    ? 'bg-white border-[#D6CEBE] text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none'
    : 'bg-[#110E0C] border-stone-700/80 text-stone-100 placeholder-stone-500 focus:border-amber-500 focus:outline-none';

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${
        isBlockingGate
          ? isLight
            ? 'bg-[#F4F0E8]'
            : 'bg-[#0E0C0A]'
          : 'bg-black/75 backdrop-blur-xs'
      }`}
    >
      <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden ${cardCls}`}>
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between gap-3 ${
            isLight ? 'border-[#EBE5DC] bg-[#FAF8F5]' : 'border-white/[0.07] bg-[#14110E]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <div>
              <h2 className="font-display text-sm font-bold tracking-tight">
                {showActivationForm
                  ? isFr
                    ? 'Activation de Licence Desktop — OmniGeo'
                    : 'OmniGeo Desktop License Activation'
                  : isFr
                    ? 'Gestionnaire de Licence Desktop'
                    : 'Desktop License Manager'}
              </h2>
              <p className={`text-[11px] ${mutedText}`}>
                {isFr
                  ? 'Vérification cryptographique Ed25519 hors ligne · Liée au poste'
                  : 'Offline Ed25519 cryptographic verification · Per-machine binding'}
              </p>
            </div>
          </div>

          {!isBlockingGate && (
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLight ? 'text-stone-500 hover:bg-[#EFEAE0]' : 'text-stone-400 hover:bg-white/[0.06]'
              }`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {isBlockingGate && isGatePreviewActive && onToggleGatePreview && (
            <button
              type="button"
              onClick={onToggleGatePreview}
              className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
            >
              {isFr ? 'Quitter l\'aperçu' : 'Exit preview'}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Web Preview Notice */}
          {!status.isDesktopElectron && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-start justify-between gap-3 ${
                isLight
                  ? 'bg-[#FAF6EE] border-[#E2DBD0] text-stone-700'
                  : 'bg-amber-950/25 border-amber-700/30 text-amber-200/90'
              }`}
            >
              <div>
                <div className="font-semibold">
                  {isFr ? 'Mode Aperçu Navigateur' : 'Browser Preview Mode'}
                </div>
                <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                  {isFr
                    ? 'Le verrouillage matériel par poste est actif automatiquement dans l\'exécutable Desktop Electron (.exe / .dmg).'
                    : 'Hardware machine-ID locking is enforced automatically inside the packaged Electron desktop build (.exe / .dmg).'}
                </p>
              </div>
              {onToggleGatePreview && !isBlockingGate && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onToggleGatePreview();
                  }}
                  className="shrink-0 rounded-lg border border-amber-600/40 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                >
                  {isFr ? 'Simuler l\'écran de blocage' : 'Preview Lock Screen'}
                </button>
              )}
            </div>
          )}

          {/* Error / Warning Status Banner */}
          {(status.error || feedbackError) && (
            <div className="rounded-xl border border-rose-500/35 bg-rose-950/25 px-3.5 py-2.5 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{feedbackError || status.error}</span>
            </div>
          )}

          {feedbackSuccess && (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-3.5 py-2.5 text-xs text-emerald-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{feedbackSuccess}</span>
            </div>
          )}

          {/* Machine ID Card (Always visible so user can copy & email it to you) */}
          <div className={`rounded-xl border p-4 ${subSurface}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <Monitor className="w-3.5 h-3.5" />
                <span>{isFr ? 'Identifiant Unique de ce Poste (Machine ID)' : 'Unique Desktop Machine ID'}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white border-[#D6CEBE] text-stone-700 hover:text-stone-950'
                    : 'bg-white/[0.04] border-white/[0.1] text-stone-300 hover:text-white'
                }`}
              >
                {copiedId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
              </button>
            </div>
            <div className="font-mono text-base font-bold tracking-wider tabular-nums select-all">
              {status.machineId}
            </div>
            <p className={`text-[11px] mt-1 ${mutedText}`}>
              {isFr
                ? 'Transmettez cet identifiant à votre administrateur OmniGeo pour recevoir une clé signée (Essai, 1 an ou Perpétuelle) liée à cette machine.'
                : 'Send this Machine ID to your OmniGeo administrator to receive a signed offline license (Trial, 1-Year, or Lifetime) bound to this desktop.'}
            </p>
          </div>

          {/* Active License Details Summary (when licensed) */}
          {status.state === 'active' && (
            <div className={`rounded-xl border p-4 space-y-3 ${subSurface}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {status.isLifetime ? (
                    <InfinityIcon className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-500" />
                  )}
                  <span className="text-xs font-bold">{tierLabel}</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  {isFr ? 'ACTIVE' : 'ACTIVE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-white/[0.06]">
                <div>
                  <div className={`text-[10px] uppercase tracking-wider ${mutedText}`}>
                    {isFr ? 'Titulaire' : 'Licensed To'}
                  </div>
                  <div className="font-medium mt-0.5 truncate">{status.customer || '—'}</div>
                </div>
                <div>
                  <div className={`text-[10px] uppercase tracking-wider ${mutedText}`}>
                    {isFr ? 'ID de Licence' : 'License ID'}
                  </div>
                  <div className="font-mono mt-0.5">{status.licenseId || '—'}</div>
                </div>
                <div>
                  <div className={`text-[10px] uppercase tracking-wider ${mutedText}`}>
                    {isFr ? 'Expiration' : 'Expires'}
                  </div>
                  <div className="font-mono tabular-nums mt-0.5">
                    {status.isLifetime
                      ? isFr
                        ? 'Jamais (Illimitée)'
                        : 'Never (Indefinite)'
                      : status.expiresAt
                        ? status.expiresAt.slice(0, 10)
                        : '—'}
                  </div>
                </div>
                <div>
                  <div className={`text-[10px] uppercase tracking-wider ${mutedText}`}>
                    {isFr ? 'Jours restants' : 'Days Remaining'}
                  </div>
                  <div className="font-mono tabular-nums font-semibold mt-0.5">
                    {status.isLifetime
                      ? '∞'
                      : status.daysRemaining !== null
                        ? `${status.daysRemaining} ${isFr ? 'jours' : 'days'}`
                        : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* License Key Activation Form */}
          <form onSubmit={handleActivate} className="space-y-3">
            <label className="block text-xs font-semibold">
              {status.state === 'active'
                ? isFr
                  ? 'Mettre à niveau ou remplacer la clé de licence'
                  : 'Upgrade or replace license key'
                : isFr
                  ? 'Entrer votre clé de licence signée (OMNIGEO-LIC-V1...)'
                  : 'Enter your signed license key (OMNIGEO-LIC-V1...)'}
            </label>
            <textarea
              rows={3}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="OMNIGEO-LIC-V1.eyJ2IjoxLCJsaWNlbnNlSWQiOiJMSUMtMjAyNi0..."
              className={`w-full rounded-xl border px-3 py-2.5 text-xs font-mono resize-none ${inputCls}`}
            />

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                disabled={busy || !keyInput.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#A87945] px-4 py-2 text-xs font-semibold text-stone-950 hover:bg-[#B98953] transition-colors disabled:opacity-40 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isFr ? 'Activer la licence' : 'Activate License'}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleImportFile}
                className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer ${
                  isLight
                    ? 'bg-white border-[#D6CEBE] text-stone-800 hover:bg-[#F5EFE6]'
                    : 'bg-white/[0.04] border-white/[0.1] text-stone-200 hover:bg-white/[0.08]'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                <span>{isFr ? 'Importer un fichier .omnigeo-lic' : 'Import .omnigeo-lic File'}</span>
              </button>
            </div>
          </form>

          {/* Local Free Trial Option (shown if eligible and not already on annual/lifetime) */}
          {status.trialEligible && status.tier !== 'annual' && status.tier !== 'lifetime' && !status.clockTampered && (
            <div className={`pt-4 border-t flex flex-wrap items-center justify-between gap-3 ${isLight ? 'border-[#EBE5DC]' : 'border-white/[0.07]'}`}>
              <div>
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <FileKey2 className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isFr ? 'Démarrer un essai gratuit de 14 jours' : 'Start a 14-Day Free Trial'}</span>
                </div>
                <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                  {isFr
                    ? 'Accès complet hors ligne pendant 14 jours, utilisable une seule fois sur ce poste.'
                    : 'Full offline access for 14 days, available once per desktop installation.'}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleStartTrial}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  isLight
                    ? 'border-amber-600/50 bg-[#FAF6EE] text-amber-900 hover:bg-[#F3E9D4]'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                }`}
              >
                {isFr ? 'Lancer l\'essai 14 jours' : 'Start 14-Day Trial'}
              </button>
            </div>
          )}

          {/* Deactivate License Button (Electron desktop only when active) */}
          {status.isDesktopElectron && status.state === 'active' && status.tier !== 'trial' && (
            <div className={`pt-3 border-t flex items-center justify-between text-xs ${isLight ? 'border-[#EBE5DC]' : 'border-white/[0.07]'}`}>
              <span className={mutedText}>
                {isFr
                  ? 'Retirer la licence stockée sur ce poste'
                  : 'Remove stored license from this computer'}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={handleDeactivate}
                className="inline-flex items-center gap-1.5 text-rose-500 hover:text-rose-400 font-medium cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isFr ? 'Désactiver' : 'Deactivate'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
