/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 36, className = '' }) => {
  return (
    <div 
      className={`relative flex items-center justify-center flex-shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-sm transition-transform duration-200"
      >
        <defs>
          {/* Subtle Outer Atmosphere Glow */}
          <linearGradient id="omniAura" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#EA580C" stopOpacity="0.08" />
          </linearGradient>

          {/* Minimalist Celestial Sphere Ring */}
          <linearGradient id="omniRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* Sweeping Geodetic Orbit */}
          <linearGradient id="omniOrbit" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>

          {/* Facet Light / Dark gradients */}
          <linearGradient id="facetLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>

          <linearGradient id="facetDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
        </defs>

        {/* Backdrop Disc for Universal Contrast across Light and Dark Themes */}
        <circle
          cx="24"
          cy="24"
          r="22"
          fill="url(#omniAura)"
          stroke="#F59E0B"
          strokeWidth="0.8"
          strokeOpacity="0.35"
        />

        {/* Minimalist Primary Planetary Meridian Ring */}
        <circle
          cx="24"
          cy="24"
          r="17"
          stroke="url(#omniRing)"
          strokeWidth="1.8"
        />

        {/* Dynamic Inclined Geodetic Orbital Arc */}
        <ellipse
          cx="24"
          cy="24"
          rx="17"
          ry="6"
          transform="rotate(-26 24 24)"
          stroke="url(#omniOrbit)"
          strokeWidth="1.4"
        />

        {/* Minimalist Prime Meridian Arc */}
        <path
          d="M 24 7 C 18 13, 18 35, 24 41"
          stroke="#F59E0B"
          strokeWidth="1"
          strokeOpacity="0.4"
          strokeDasharray="2 2"
        />

        {/* Refined 4-Point Cartographic Prism Diamond */}
        {/* Top-Right Facet (highlight) */}
        <polygon
          points="24,14 31.5,24 24,24"
          fill="url(#facetLight)"
        />
        {/* Bottom-Left Facet (highlight) */}
        <polygon
          points="24,24 16.5,24 24,34"
          fill="url(#facetLight)"
          opacity="0.85"
        />

        {/* Top-Left Facet (shadow) */}
        <polygon
          points="24,14 24,24 16.5,24"
          fill="url(#facetDark)"
        />
        {/* Bottom-Right Facet (shadow) */}
        <polygon
          points="24,24 31.5,24 24,34"
          fill="url(#facetDark)"
          opacity="0.95"
        />

        {/* Precision Central Geodetic Pinpoint */}
        <circle cx="24" cy="24" r="2.2" fill="#FFFFFF" />
        <circle cx="24" cy="24" r="1.1" fill="#92400E" />
      </svg>
    </div>
  );
};
