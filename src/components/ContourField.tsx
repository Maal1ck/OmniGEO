/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { useI18n } from '../core/i18n';

/** Closed, smooth contour around (cx,cy): radius wobbles with a few harmonics. */
function contour(cx: number, cy: number, R: number, seed: number, n = 18): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    const w =
      0.09 * Math.sin(2 * th + seed) +
      0.06 * Math.sin(3 * th + seed * 1.7) +
      0.035 * Math.sin(5 * th + seed * 2.3);
    const r = R * (1 + w);
    pts.push([cx + r * Math.cos(th), cy + r * 0.82 * Math.sin(th)]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

const W = 520, H = 380;
// Bounding box of the artwork = Senegal river valley → Atlas, purely decorative but plausible.
const LON0 = -17.5, LON1 = -4.5, LAT0 = 12.5, LAT1 = 22.5;

/**
 * Decorative topographic field. Moving the pointer reads out coordinates
 * (a survey-desk detail that also hints at what the tool is for).
 */
export const ContourField: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useI18n();
  const ref = useRef<SVGSVGElement>(null);
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);

  const paths = useMemo(() => {
    const out: Array<{ d: string; major: boolean }> = [];
    for (let k = 1; k <= 15; k++) out.push({ d: contour(185, 205, k * 13.5, 0.6 + k * 0.11), major: k % 5 === 0 });
    for (let k = 1; k <= 8; k++) out.push({ d: contour(385, 140, k * 12.5, 2.4 + k * 0.14), major: k % 4 === 0 });
    return out;
  }, []);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    setCur({ x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H });
  };

  const lon = cur ? LON0 + (cur.x / W) * (LON1 - LON0) : 0;
  const lat = cur ? LAT1 - (cur.y / H) * (LAT1 - LAT0) : 0;
  const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full h-auto touch-none ${className}`}
      onPointerMove={onMove}
      onPointerLeave={() => setCur(null)}
      role="img"
      aria-label="Topographic contour illustration"
    >
      {/* graticule */}
      <g stroke="var(--og-line)" strokeWidth="1">
        {[1, 2, 3, 4, 5].map((i) => <line key={`v${i}`} x1={(W / 6) * i} y1="0" x2={(W / 6) * i} y2={H} />)}
        {[1, 2, 3, 4].map((i) => <line key={`h${i}`} x1="0" y1={(H / 5) * i} x2={W} y2={(H / 5) * i} />)}
      </g>
      {/* contours */}
      <g fill="none" strokeLinejoin="round">
        {paths.map((p, i) => (
          <path key={i} d={p.d} stroke={p.major ? 'var(--og-accent)' : 'var(--og-contour)'} strokeWidth={p.major ? 1.5 : 1} opacity={p.major ? 0.85 : 1} />
        ))}
      </g>
      {/* summits */}
      <g fill="var(--og-accent)">
        <circle cx="190" cy="200" r="3.2" /><circle cx="390" cy="130" r="3.2" />
      </g>
      {/* crosshair + readout */}
      {cur && (
        <g pointerEvents="none">
          <line x1={cur.x} y1="0" x2={cur.x} y2={H} stroke="var(--og-accent)" strokeWidth="1" strokeDasharray="3 4" />
          <line x1="0" y1={cur.y} x2={W} y2={cur.y} stroke="var(--og-accent)" strokeWidth="1" strokeDasharray="3 4" />
          <circle cx={cur.x} cy={cur.y} r="4.5" fill="none" stroke="var(--og-accent)" strokeWidth="1.5" />
        </g>
      )}
      <g fontFamily="JetBrains Mono, monospace" fontSize="11">
        <rect x="12" y={H - 34} width="226" height="22" rx="5" fill="var(--og-surface)" stroke="var(--og-line-strong)" />
        <text x="22" y={H - 19} fill={cur ? 'var(--og-fg)' : 'var(--og-fg-3)'}>
          {cur ? `${fmt(lat, 'N', 'S')}  ${fmt(lon, 'E', 'W')}` : t.shell.heroHint}
        </text>
      </g>
    </svg>
  );
};
