/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * OmniGeo mark — three nested topographic contour lines that read as an "O",
 * a survey pin at the summit and four graticule ticks. Strokes use currentColor
 * so the mark follows the theme; only the pin carries the accent.
 */
const RINGS = ["M44.55 24.00C44.66 26.88 43.70 30.27 42.30 32.81C40.91 35.36 38.51 37.61 36.17 39.26C33.83 40.90 31.01 42.11 28.27 42.69C25.52 43.27 22.42 43.38 19.72 42.75C17.02 42.12 14.22 40.69 12.09 38.93C9.96 37.18 8.20 34.70 6.94 32.22C5.68 29.73 4.78 26.85 4.56 24.00C4.33 21.15 4.50 17.83 5.59 15.13C6.68 12.44 8.77 9.54 11.11 7.83C13.45 6.13 16.82 5.20 19.65 4.93C22.47 4.65 25.44 5.41 28.06 6.21C30.68 7.01 33.13 8.17 35.39 9.72C37.65 11.27 40.09 13.14 41.61 15.52C43.14 17.90 44.43 21.12 44.55 24.00Z", "M39.32 23.60C39.51 25.69 39.03 28.34 37.98 30.14C36.93 31.94 34.82 33.47 33.02 34.41C31.22 35.35 29.08 35.55 27.18 35.79C25.28 36.02 23.50 36.08 21.61 35.85C19.71 35.61 17.54 35.37 15.79 34.39C14.05 33.42 12.11 31.80 11.12 30.00C10.12 28.20 9.70 25.68 9.81 23.60C9.93 21.52 10.80 19.32 11.81 17.54C12.82 15.76 14.28 14.10 15.88 12.92C17.48 11.73 19.48 10.77 21.39 10.41C23.30 10.05 25.48 10.25 27.33 10.75C29.19 11.25 30.96 12.25 32.54 13.40C34.12 14.54 35.69 15.92 36.82 17.62C37.95 19.32 39.12 21.51 39.32 23.60Z", "M34.06 23.20C34.01 24.45 33.31 25.92 32.55 26.89C31.80 27.85 30.52 28.44 29.51 28.98C28.50 29.52 27.54 29.80 26.48 30.12C25.42 30.45 24.32 30.93 23.13 30.93C21.95 30.94 20.41 30.80 19.35 30.16C18.29 29.52 17.26 28.27 16.78 27.11C16.30 25.95 16.31 24.43 16.47 23.20C16.63 21.97 17.13 20.77 17.72 19.74C18.30 18.71 19.07 17.73 19.98 17.03C20.88 16.33 22.05 15.78 23.15 15.55C24.26 15.32 25.50 15.40 26.63 15.63C27.76 15.85 28.90 16.26 29.94 16.88C30.97 17.51 32.15 18.32 32.84 19.38C33.53 20.43 34.11 21.95 34.06 23.20Z"];

export const Logo: React.FC<LogoProps> = ({ size = 36, className = '' }) => {
  return (
    <div
      className={`relative flex items-center justify-center flex-shrink-0 select-none text-[var(--og-fg)] ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* graticule ticks */}
        <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55">
          <path d="M24 0.8v3.6M24 43.6v3.6M0.8 24h3.6M43.6 24h3.6" />
        </g>
        {/* contours, outermost → summit */}
        <path d={RINGS[0]} stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <path d={RINGS[1]} stroke="currentColor" strokeWidth="1.7" opacity="0.78" />
        <path d={RINGS[2]} stroke="currentColor" strokeWidth="1.9" />
        {/* survey pin */}
        <circle cx="25" cy="23.2" r="3.1" fill="var(--og-accent)" />
        <circle cx="25" cy="23.2" r="1.1" fill="var(--og-bg)" />
      </svg>
    </div>
  );
};
