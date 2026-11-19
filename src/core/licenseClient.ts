/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LicenseTier = 'trial' | 'annual' | 'lifetime';

export type LicenseState =
  | 'loading'
  | 'active'
  | 'unlicensed'
  | 'expired'
  | 'invalid'
  | 'clock_tampered'
  | 'web_preview';

export interface LicenseStatus {
  state: LicenseState;
  machineId: string;
  tier: LicenseTier | null;
  customer: string | null;
  licenseId: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  isLifetime: boolean;
  isMasterKey: boolean;
  clockTampered: boolean;
  trialEligible: boolean;
  isDesktopElectron: boolean;
  isProductionKeyConfigured: boolean;
  error: string | null;
}

export interface LicenseActionResult {
  ok: boolean;
  canceled?: boolean;
  error: string | null;
  status: LicenseStatus;
}

export interface OmniGeoLicenseBridge {
  getStatus: () => Promise<LicenseStatus>;
  activate: (licenseKey: string) => Promise<LicenseActionResult>;
  importFile: () => Promise<LicenseActionResult>;
  startTrial: () => Promise<LicenseActionResult>;
  deactivate: () => Promise<{ ok: boolean; status: LicenseStatus }>;
}

declare global {
  interface Window {
    omniGeoLicense?: OmniGeoLicenseBridge;
  }
}

export function isElectronDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.omniGeoLicense);
}

const WEB_PREVIEW_STATUS: LicenseStatus = {
  state: 'web_preview',
  machineId: 'OMNI-WEB0-PREV-IEW1',
  tier: 'lifetime',
  customer: 'Web Development Preview',
  licenseId: 'WEB-PREVIEW',
  issuedAt: null,
  expiresAt: null,
  daysRemaining: null,
  isLifetime: true,
  isMasterKey: false,
  clockTampered: false,
  trialEligible: true,
  isDesktopElectron: false,
  isProductionKeyConfigured: false,
  error: null,
};

export async function fetchLicenseStatus(): Promise<LicenseStatus> {
  if (typeof window !== 'undefined' && window.omniGeoLicense) {
    return window.omniGeoLicense.getStatus();
  }
  return WEB_PREVIEW_STATUS;
}

export async function activateDesktopLicense(licenseKey: string): Promise<LicenseActionResult> {
  if (typeof window !== 'undefined' && window.omniGeoLicense) {
    return window.omniGeoLicense.activate(licenseKey);
  }
  return {
    ok: false,
    error: 'Offline desktop activation runs inside the packaged Electron desktop application.',
    status: WEB_PREVIEW_STATUS,
  };
}

export async function importDesktopLicenseFile(): Promise<LicenseActionResult> {
  if (typeof window !== 'undefined' && window.omniGeoLicense) {
    return window.omniGeoLicense.importFile();
  }
  return {
    ok: false,
    canceled: true,
    error: 'Native .omnigeo-lic file import runs inside the Electron desktop application.',
    status: WEB_PREVIEW_STATUS,
  };
}

export async function startDesktopTrial(): Promise<LicenseActionResult> {
  if (typeof window !== 'undefined' && window.omniGeoLicense) {
    return window.omniGeoLicense.startTrial();
  }
  return {
    ok: false,
    error: 'Hardware-bound 14-day trials run inside the Electron desktop application.',
    status: WEB_PREVIEW_STATUS,
  };
}

export async function deactivateDesktopLicense(): Promise<{ ok: boolean; status: LicenseStatus }> {
  if (typeof window !== 'undefined' && window.omniGeoLicense) {
    return window.omniGeoLicense.deactivate();
  }
  return { ok: true, status: WEB_PREVIEW_STATUS };
}
