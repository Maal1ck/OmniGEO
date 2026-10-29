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
        className="w-full h-full drop-shadow-md"
      >
        <defs>
          <linearGradient id="omniGoldRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
          <linearGradient id="omniGemCore" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="40%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="omniInnerFacet" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#78350F" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1C1917" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Outer Circular Geodetic Dial */}
        <circle
          cx="24"
          cy="24"
          r="21.5"
          stroke="url(#omniGoldRing)"
          strokeWidth="1.2"
          strokeDasharray="1.5 2"
          opacity="0.85"
        />

        {/* Fine Reticle Outer Rim */}
        <circle
          cx="24"
          cy="24"
          r="19"
          stroke="#F59E0B"
          strokeWidth="0.75"
          opacity="0.4"
        />

        {/* Cardinal Meridian Crosshairs */}
        <line x1="24" y1="2" x2="24" y2="7" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24" y1="41" x2="24" y2="46" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="24" x2="7" y2="24" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="41" y1="24" x2="46" y2="24" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />

        {/* 45-degree Geodetic Azimuth Marks */}
        <line x1="10" y1="10" x2="13" y2="13" stroke="#D97706" strokeWidth="0.8" opacity="0.6" />
        <line x1="38" y1="10" x2="35" y2="13" stroke="#D97706" strokeWidth="0.8" opacity="0.6" />
        <line x1="10" y1="38" x2="13" y2="35" stroke="#D97706" strokeWidth="0.8" opacity="0.6" />
        <line x1="38" y1="38" x2="35" y2="35" stroke="#D97706" strokeWidth="0.8" opacity="0.6" />

        {/* Faceted Geodetic Prism Diamond */}
        <polygon
          points="24,8 37,24 24,40 11,24"
          fill="url(#omniInnerFacet)"
          stroke="url(#omniGoldRing)"
          strokeWidth="1.2"
        />

        {/* Inner Facet Splitting Meridians */}
        <polygon
          points="24,8 37,24 24,24"
          fill="url(#omniGemCore)"
          opacity="0.35"
        />
        <polygon
          points="24,24 11,24 24,40"
          fill="url(#omniGemCore)"
          opacity="0.2"
        />

        {/* Central Precision Target Node */}
        <circle cx="24" cy="24" r="3" fill="#FDE68A" />
        <circle cx="24" cy="24" r="1.2" fill="#1C1917" />
      </svg>
    </div>
  );
};
