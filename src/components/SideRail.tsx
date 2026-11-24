/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Layers,
  Settings2,
  Map as MapIcon,
  Activity,
  FileCode2,
  BookOpen,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Logo } from './Logo';
import { useI18n } from '../core/i18n';
import type { NavTab } from './Header';

export interface RailMeta {
  datasetCount: number;
  readyCount: number;
  selectedName: string | null;
  format: string;
  crs: string;
  running: number;
  completed: number;
  failed: number;
}

interface SideRailProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  meta: RailMeta;
}

const STORAGE_KEY = 'omnigeo_rail_collapsed';

/**
 * The pipeline rail. OmniGeo is a workflow (import → configure → inspect → run),
 * so navigation shows where you are in it and what each stage currently holds,
 * instead of a flat row of tabs.
 */
export const SideRail: React.FC<SideRailProps> = ({ activeTab, setActiveTab, meta }) => {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) return saved === '1';
    } catch { /* storage unavailable */ }
    return typeof window !== 'undefined' && window.innerWidth < 1280;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const s = t.shell;
  const importMeta = meta.datasetCount > 0
    ? `${meta.datasetCount} ${s.files} · ${meta.readyCount} ${s.ready}`
    : s.dropToBegin;
  const runMeta = meta.running > 0
    ? `${meta.running} ${s.running}`
    : meta.completed + meta.failed > 0
      ? `${meta.completed} ${s.completed}${meta.failed ? ` · ${meta.failed} ${s.failed}` : ''}`
      : s.idle;

  const steps: Array<{
    id: NavTab; n: string; label: string; sub: string; Icon: React.ElementType; done: boolean; live: boolean;
  }> = [
    { id: 'workspace', n: '01', label: t.header.workspaceTab, sub: importMeta, Icon: Layers, done: meta.datasetCount > 0, live: false },
    { id: 'lab', n: '02', label: t.header.labTab, sub: `${meta.format.toUpperCase()} · ${meta.crs}`, Icon: Settings2, done: false, live: false },
    { id: 'map', n: '03', label: t.header.mapTab, sub: meta.selectedName ?? s.noSelection, Icon: MapIcon, done: false, live: false },
    { id: 'monitor', n: '04', label: t.header.monitorTab, sub: runMeta, Icon: Activity, done: meta.completed > 0 && meta.running === 0, live: meta.running > 0 },
  ];

  const toolkit: Array<{ id: NavTab; label: string; Icon: React.ElementType }> = [
    { id: 'scripts', label: t.header.scriptsTab, Icon: FileCode2 },
    { id: 'showcase', label: t.header.showcaseTab, Icon: BookOpen },
  ];

  const itemTitle = (label: string) => (collapsed ? label : undefined);

  return (
    <aside
      aria-label="OmniGeo"
      className={`hidden md:flex shrink-0 flex-col border-e border-[var(--og-line)] bg-[var(--og-surface)] transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[248px]'
      }`}
    >
      {/* Brand */}
      <button
        type="button"
        onClick={() => setActiveTab('craft')}
        title="OmniGeo by Maodo"
        className={`flex items-center gap-3 h-[60px] shrink-0 border-b border-[var(--og-line)] text-start ${collapsed ? 'justify-center px-0' : 'px-4'}`}
      >
        <Logo size={34} />
        {!collapsed && (
          <span className="leading-none min-w-0">
            <span className="block font-display text-[18px] font-extrabold tracking-[-0.03em] text-[var(--og-fg)]">OmniGeo</span>
            <span className="block mt-1 og-eyebrow !text-[9px] !tracking-[0.1em] truncate">{t.header.brandSubtitle}</span>
          </span>
        )}
      </button>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Primary">
        {/* Studio */}
        <button
          type="button"
          className="og-rail-item"
          aria-current={activeTab === 'craft' ? 'page' : undefined}
          onClick={() => setActiveTab('craft')}
          title={itemTitle(t.header.craftTab)}
        >
          <span className="grid place-items-center w-[26px] h-[26px] flex-none">
            <Sparkles className="w-[17px] h-[17px]" />
          </span>
          {!collapsed && <span className="text-[13px] font-semibold">{t.header.craftTab}</span>}
        </button>

        {/* Pipeline */}
        <div>
          {!collapsed && <div className="og-eyebrow px-2.5 mb-2">{s.pipeline}</div>}
          <ol className="relative space-y-1">
            {/* connecting survey line */}
            <span
              aria-hidden="true"
              className="absolute top-4 bottom-4 w-px bg-[var(--og-line-strong)]"
              style={{ insetInlineStart: collapsed ? 'calc(50% - 0.5px)' : '23px' }}
            />
            {steps.map(({ id, n, label, sub, Icon, done, live }) => (
              <li key={id}>
                <button
                  type="button"
                  className={`og-rail-item ${collapsed ? 'justify-center !px-0' : ''}`}
                  aria-current={activeTab === id ? 'page' : undefined}
                  onClick={() => setActiveTab(id)}
                  title={itemTitle(`${n} · ${label}`)}
                >
                  <span className="og-node" data-done={done && activeTab !== id} data-live={live}>
                    {done && activeTab !== id ? <Check className="w-3.5 h-3.5" strokeWidth={2.6} /> : n}
                  </span>
                  {!collapsed && (
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <Icon className="w-3.5 h-3.5 opacity-70" />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="block mt-0.5 truncate text-[11px] text-[var(--og-fg-3)] font-mono">{sub}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* Toolkit */}
        <div>
          {!collapsed && <div className="og-eyebrow px-2.5 mb-2">{s.toolkit}</div>}
          <ul className="space-y-1">
            {toolkit.map(({ id, label, Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  className={`og-rail-item ${collapsed ? 'justify-center !px-0' : ''}`}
                  aria-current={activeTab === id ? 'page' : undefined}
                  onClick={() => setActiveTab(id)}
                  title={itemTitle(label)}
                >
                  <span className="grid place-items-center w-[26px] h-[26px] flex-none">
                    <Icon className="w-[17px] h-[17px]" />
                  </span>
                  {!collapsed && <span className="text-[13px] font-medium truncate">{label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? s.expand : s.collapse}
        title={collapsed ? s.expand : s.collapse}
        className={`flex items-center gap-2 h-11 shrink-0 border-t border-[var(--og-line)] text-[12px] text-[var(--og-fg-3)] hover:text-[var(--og-fg)] transition-colors ${collapsed ? 'justify-center' : 'px-5'}`}
      >
        {collapsed ? <PanelLeftOpen className="w-4 h-4 rtl:-scale-x-100" /> : <PanelLeftClose className="w-4 h-4 rtl:-scale-x-100" />}
        {!collapsed && <span>{s.collapse}</span>}
      </button>
    </aside>
  );
};
