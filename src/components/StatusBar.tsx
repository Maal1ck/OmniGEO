/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WifiOff, FlaskConical } from 'lucide-react';
import { useI18n } from '../core/i18n';
import type { RailMeta } from './SideRail';

interface StatusBarProps {
  meta: RailMeta;
  crsMode: 'reproject' | 'assign' | 'preserve';
  isDryRun: boolean;
  workers: number;
}

/** Always-visible run context, like the footer of a desktop GIS. */
export const StatusBar: React.FC<StatusBarProps> = ({ meta, crsMode, isDryRun, workers }) => {
  const { t } = useI18n();
  const s = t.shell;
  const Sep = () => <span aria-hidden="true" className="h-3 w-px bg-[var(--og-line-strong)]" />;

  return (
    <footer
      role="contentinfo"
      className="h-7 shrink-0 flex items-center gap-3 px-4 border-t border-[var(--og-line)] bg-[var(--og-surface)] text-[11px] font-mono text-[var(--og-fg-3)] select-none overflow-hidden whitespace-nowrap"
    >
      <span className="flex items-center gap-1.5 text-[var(--og-ok)]">
        <WifiOff className="w-3 h-3" />
        <span className="hidden sm:inline">{s.offlineReady}</span>
      </span>
      <Sep />
      <span>
        <b className="font-semibold text-[var(--og-fg-2)]">{meta.datasetCount}</b> {s.files}
        {meta.datasetCount > 0 && <> · <b className="font-semibold text-[var(--og-fg-2)]">{meta.readyCount}</b> {s.ready}</>}
      </span>
      <Sep />
      <span className="hidden md:inline">
        {meta.format.toUpperCase()} <span className="text-[var(--og-fg-3)]">→</span>{' '}
        <b className="font-semibold text-[var(--og-accent)]">{meta.crs}</b>
      </span>
      <span className="hidden lg:inline-flex items-center gap-3">
        <Sep />
        <span>{s.mode}: <span className="text-[var(--og-fg-2)]">{crsMode === 'reproject' ? s.reproject : crsMode === 'assign' ? s.assign : 'Preserve'}</span></span>
      </span>
      {isDryRun && (
        <span className="flex items-center gap-1 rounded px-1.5 py-px bg-[var(--og-accent-soft)] text-[var(--og-accent)]">
          <FlaskConical className="w-3 h-3" /> {s.dryRun}
        </span>
      )}
      <span className="ms-auto flex items-center gap-3">
        {meta.running > 0 && (
          <span className="flex items-center gap-1.5 text-[var(--og-accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--og-accent)] animate-pulse" />
            {meta.running} {s.running}
          </span>
        )}
        <span className="hidden md:inline">{workers} {s.workers}</span>
        <span className="hidden md:inline"><kbd className="og-kbd">{t.header.commandsKbd}</kbd></span>
      </span>
    </footer>
  );
};
