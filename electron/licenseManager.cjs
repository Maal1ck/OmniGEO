/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Offline-First Desktop Licensing Manager for OmniGeo (Electron Main Process).
 * - Computes a deterministic hardware-bound Machine ID (OMNI-XXXX-XXXX-XXXX)
 * - Verifies Ed25519 signed licenses (trial, annual 1-year, lifetime/indefinite)
 * - Supports one-time 14-day offline trial per machine
 * - Protects against system clock rollback using machine-bound HMAC state + safeStorage
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execSync} = require('node:child_process');
const {LICENSE_PUBLIC_KEY_PEM, IS_PRODUCTION_KEY_CONFIGURED} = require('./licensePublicKey.cjs');

const LICENSE_PREFIX = 'OMNIGEO-LIC-V1';
const HARDWARE_SALT = 'OMNIGEO::DESKTOP::HWID::V1::2026';
const STATE_HMAC_SALT = 'OMNIGEO::STATE::INTEGRITY::V1';
const DEFAULT_LOCAL_TRIAL_DAYS = 14;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance for NTP drift
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function safeExec(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Reads OS-level hardware/machine identifiers so each desktop installation has
 * a stable, unique fingerprint that survives app upgrades.
 */
function readRawHardwareSignals() {
  const signals = [];
  const platform = process.platform;

  if (platform === 'win32') {
    const regOut = safeExec(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
    );
    const guidMatch = regOut.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    if (guidMatch?.[1]) {
      signals.push(`win-guid:${guidMatch[1].trim().toLowerCase()}`);
    }

    const psUuid = safeExec(
      'powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"'
    );
    if (psUuid && !/^f{8}-/i.test(psUuid)) {
      signals.push(`win-uuid:${psUuid.trim().toLowerCase()}`);
    } else {
      const wmicOut = safeExec('wmic csproduct get uuid');
      const lines = wmicOut
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && l.toLowerCase() !== 'uuid');
      if (lines[0] && !/^f{8}-/i.test(lines[0])) {
        signals.push(`win-uuid:${lines[0].toLowerCase()}`);
      }
    }
  } else if (platform === 'darwin') {
    const ioregOut = safeExec('ioreg -rd1 -c IOPlatformExpertDevice');
    const uuidMatch = ioregOut.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (uuidMatch?.[1]) {
      signals.push(`mac-uuid:${uuidMatch[1].trim().toLowerCase()}`);
    }
  } else {
    const linuxPaths = ['/etc/machine-id', '/var/lib/dbus/machine-id'];
    for (const p of linuxPaths) {
      try {
        if (fs.existsSync(p)) {
          const val = fs.readFileSync(p, 'utf8').trim();
          if (val) {
            signals.push(`linux-id:${val.toLowerCase()}`);
            break;
          }
        }
      } catch {
        // Ignore unreadable paths
      }
    }
  }

  // Fallback fingerprint components if OS queries are restricted
  if (signals.length === 0) {
    signals.push(`fallback:${os.hostname()}:${os.platform()}:${os.arch()}:${os.userInfo().username}`);
  } else {
    signals.push(`platform:${platform}:${os.arch()}`);
  }

  return signals.join('|');
}

function computeMachineId() {
  const raw = readRawHardwareSignals();
  const digest = crypto
    .createHash('sha256')
    .update(`${HARDWARE_SALT}|${raw}`)
    .digest('hex')
    .toUpperCase();

  // Format as OMNI-XXXX-XXXX-XXXX (12 hex chars = 48 bits of entropy)
  return `OMNI-${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}`;
}

function deriveStateHmacKey(machineId) {
  return crypto
    .createHash('sha256')
    .update(`${STATE_HMAC_SALT}|${machineId}|${LICENSE_PUBLIC_KEY_PEM}`)
    .digest();
}

function signStatePayload(stateObj, machineId) {
  const canonical = JSON.stringify(stateObj);
  return crypto
    .createHmac('sha256', deriveStateHmacKey(machineId))
    .update(canonical)
    .digest('hex');
}

function extractKeyString(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const trimmed = rawInput.trim();

  // Support importing a JSON .omnigeo-lic file wrapper
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.licenseKey === 'string') {
        return parsed.licenseKey.replace(/\s+/g, '');
      }
      if (typeof parsed.key === 'string') {
        return parsed.key.replace(/\s+/g, '');
      }
    } catch {
      // Fall through to raw token parsing
    }
  }

  // Extract token even if surrounded by email text or line breaks
  const compact = trimmed.replace(/\s+/g, '');
  const match = compact.match(/OMNIGEO-LIC-V1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return match ? match[0] : compact;
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

/**
 * Cryptographically verifies an Ed25519 signed OmniGeo license key.
 */
function verifySignedLicenseKey(rawKeyInput, currentMachineId, nowMs = Date.now(), publicKeyPem = LICENSE_PUBLIC_KEY_PEM) {
  const token = extractKeyString(rawKeyInput);
  if (!token) {
    return {valid: false, code: 'EMPTY_KEY', error: 'No license key provided.'};
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    return {
      valid: false,
      code: 'INVALID_FORMAT',
      error: `Invalid license format. Expected ${LICENSE_PREFIX}.<payload>.<signature>.`,
    };
  }

  const [, payloadB64, sigB64] = parts;
  let signatureBuf;
  let payload;
  try {
    signatureBuf = fromBase64Url(sigB64);
    const payloadJson = fromBase64Url(payloadB64).toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch {
    return {valid: false, code: 'MALFORMED_PAYLOAD', error: 'License key data is corrupted or truncated.'};
  }

  // Verify Ed25519 signature over the exact Base64URL payload bytes
  let isSignatureValid = false;
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    isSignatureValid = crypto.verify(
      null,
      Buffer.from(payloadB64, 'utf8'),
      publicKey,
      signatureBuf
    );
  } catch (err) {
    return {
      valid: false,
      code: 'PUBLIC_KEY_ERROR',
      error: `Public key verification failed: ${err.message}`,
    };
  }

  if (!isSignatureValid) {
    return {
      valid: false,
      code: 'INVALID_SIGNATURE',
      error: 'License cryptographic signature is invalid. Key may be forged or issued for a different build.',
    };
  }

  // Validate schema fields
  if (!payload || typeof payload !== 'object') {
    return {valid: false, code: 'INVALID_PAYLOAD', error: 'Invalid license payload.'};
  }

  const validTiers = new Set(['trial', 'annual', 'lifetime']);
  if (!validTiers.has(payload.tier)) {
    return {valid: false, code: 'INVALID_TIER', error: `Unsupported license tier: ${payload.tier}`};
  }

  const licenseMachineId = String(payload.machineId || '').trim().toUpperCase();
  const isMasterKey = licenseMachineId === '*';

  if (!isMasterKey && licenseMachineId !== currentMachineId.toUpperCase()) {
    return {
      valid: false,
      code: 'MACHINE_MISMATCH',
      error: `This license is bound to machine ${licenseMachineId}, but this computer is ${currentMachineId}.`,
      payload,
    };
  }

  const isLifetime = payload.tier === 'lifetime' || payload.expiresAt === null;
  let daysRemaining = null;
  let isExpired = false;

  if (!isLifetime) {
    const expiresMs = Date.parse(payload.expiresAt);
    if (!Number.isFinite(expiresMs)) {
      return {valid: false, code: 'INVALID_EXPIRY', error: 'License expiration date is invalid.'};
    }
    const diffMs = expiresMs - nowMs;
    if (diffMs <= 0) {
      isExpired = true;
      daysRemaining = 0;
    } else {
      daysRemaining = Math.ceil(diffMs / MS_PER_DAY);
    }
  }

  return {
    valid: !isExpired,
    code: isExpired ? 'EXPIRED' : 'OK',
    error: isExpired ? `License expired on ${payload.expiresAt.slice(0, 10)}.` : null,
    normalizedKey: token,
    payload: {
      licenseId: String(payload.licenseId || 'LIC-UNKNOWN'),
      customer: String(payload.customer || 'Licensed User'),
      email: payload.email ? String(payload.email) : undefined,
      tier: payload.tier,
      machineId: licenseMachineId,
      issuedAt: String(payload.issuedAt || ''),
      expiresAt: isLifetime ? null : String(payload.expiresAt),
      isLifetime,
      isMasterKey,
      daysRemaining,
    },
  };
}

/**
 * Creates a desktop LicenseManager instance backed by Electron userData + safeStorage.
 */
function createLicenseManager({userDataPath, safeStorage, publicKeyPem = LICENSE_PUBLIC_KEY_PEM} = {}) {
  const machineId = computeMachineId();
  const baseDir = userDataPath || path.join(os.homedir(), '.omnigeo-license');
  const primaryStatePath = path.join(baseDir, 'license-state.dat');
  // Secondary anchor outside install dir to survive reinstalls and detect resets
  const secondaryAnchorDir = path.join(os.homedir(), '.omnigeo-meta');
  const secondaryAnchorPath = path.join(secondaryAnchorDir, '.anchor.dat');

  function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
  }

  function encryptBuffer(str) {
    try {
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        const enc = safeStorage.encryptString(str);
        return Buffer.concat([Buffer.from('SAFE1:'), enc]);
      }
    } catch {
      // Fallback to plain HMAC-protected envelope
    }
    return Buffer.from(`PLAIN1:${str}`, 'utf8');
  }

  function decryptBuffer(buf) {
    const prefixSafe = buf.subarray(0, 6).toString('utf8');
    if (prefixSafe === 'SAFE1:' && safeStorage && typeof safeStorage.decryptString === 'function') {
      return safeStorage.decryptString(buf.subarray(6));
    }
    const text = buf.toString('utf8');
    if (text.startsWith('PLAIN1:')) {
      return text.slice(7);
    }
    return text;
  }

  function readSignedState(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = decryptBuffer(fs.readFileSync(filePath));
      const envelope = JSON.parse(raw);
      if (!envelope || !envelope.data || !envelope.hmac) return null;
      const expected = signStatePayload(envelope.data, machineId);
      if (expected !== envelope.hmac) {
        return {tampered: true};
      }
      return envelope.data;
    } catch {
      return null;
    }
  }

  function writeSignedState(filePath, data) {
    try {
      ensureDir(path.dirname(filePath));
      const envelope = {
        data,
        hmac: signStatePayload(data, machineId),
      };
      fs.writeFileSync(filePath, encryptBuffer(JSON.stringify(envelope)));
    } catch (err) {
      console.error(`Failed to persist license state to ${filePath}:`, err);
    }
  }

  function loadMergedState() {
    const primary = readSignedState(primaryStatePath);
    const secondary = readSignedState(secondaryAnchorPath);

    const stateTampered = Boolean((primary && primary.tampered) || (secondary && secondary.tampered));
    const pData = primary && !primary.tampered ? primary : {};
    const sData = secondary && !secondary.tampered ? secondary : {};

    const lastSeenUtcMs = Math.max(
      Number(pData.lastSeenUtcMs || 0),
      Number(sData.lastSeenUtcMs || 0)
    );

    const trialStartedAt = pData.trialStartedAt || sData.trialStartedAt || null;
    const trialExpiresAt = pData.trialExpiresAt || sData.trialExpiresAt || null;
    const licenseKey = pData.licenseKey || null;

    return {
      licenseKey,
      trialStartedAt,
      trialExpiresAt,
      lastSeenUtcMs,
      stateTampered,
    };
  }

  function persistState(nextState) {
    writeSignedState(primaryStatePath, {
      licenseKey: nextState.licenseKey || null,
      trialStartedAt: nextState.trialStartedAt || null,
      trialExpiresAt: nextState.trialExpiresAt || null,
      lastSeenUtcMs: nextState.lastSeenUtcMs,
    });
    // Secondary anchor persists trial history + monotonic clock even if userData is wiped
    writeSignedState(secondaryAnchorPath, {
      trialStartedAt: nextState.trialStartedAt || null,
      trialExpiresAt: nextState.trialExpiresAt || null,
      lastSeenUtcMs: nextState.lastSeenUtcMs,
    });
  }

  function getStatus(nowMs = Date.now()) {
    const stored = loadMergedState();
    const clockRolledBack =
      stored.lastSeenUtcMs > 0 && nowMs < stored.lastSeenUtcMs - CLOCK_ROLLBACK_TOLERANCE_MS;

    const effectiveNowMs = Math.max(nowMs, stored.lastSeenUtcMs);
    if (!clockRolledBack && nowMs > stored.lastSeenUtcMs) {
      persistState({...stored, lastSeenUtcMs: nowMs});
    }

    const trialEligible = !stored.trialStartedAt;

    if (clockRolledBack) {
      return {
        state: 'clock_tampered',
        machineId,
        tier: null,
        customer: null,
        licenseId: null,
        issuedAt: null,
        expiresAt: null,
        daysRemaining: 0,
        isLifetime: false,
        isMasterKey: false,
        clockTampered: true,
        trialEligible,
        isDesktopElectron: true,
        isProductionKeyConfigured: IS_PRODUCTION_KEY_CONFIGURED,
        error: 'System clock rollback detected. Restore your system date and time to continue using OmniGeo.',
      };
    }

    // 1. Check installed signed license key first
    if (stored.licenseKey) {
      const check = verifySignedLicenseKey(stored.licenseKey, machineId, effectiveNowMs, publicKeyPem);
      if (check.valid && check.payload) {
        return {
          state: 'active',
          machineId,
          tier: check.payload.tier,
          customer: check.payload.customer,
          licenseId: check.payload.licenseId,
          issuedAt: check.payload.issuedAt,
          expiresAt: check.payload.expiresAt,
          daysRemaining: check.payload.daysRemaining,
          isLifetime: check.payload.isLifetime,
          isMasterKey: check.payload.isMasterKey,
          clockTampered: false,
          trialEligible,
          isDesktopElectron: true,
          isProductionKeyConfigured: IS_PRODUCTION_KEY_CONFIGURED,
          error: null,
        };
      }

      if (check.code === 'EXPIRED' && check.payload) {
        return {
          state: 'expired',
          machineId,
          tier: check.payload.tier,
          customer: check.payload.customer,
          licenseId: check.payload.licenseId,
          issuedAt: check.payload.issuedAt,
          expiresAt: check.payload.expiresAt,
          daysRemaining: 0,
          isLifetime: false,
          isMasterKey: check.payload.isMasterKey,
          clockTampered: false,
          trialEligible,
          isDesktopElectron: true,
          isProductionKeyConfigured: IS_PRODUCTION_KEY_CONFIGURED,
          error: check.error,
        };
      }

      return {
        state: 'invalid',
        machineId,
        tier: check.payload?.tier || null,
        customer: check.payload?.customer || null,
        licenseId: check.payload?.licenseId || null,
        issuedAt: check.payload?.issuedAt || null,
        expiresAt: check.payload?.expiresAt || null,
        daysRemaining: 0,
        isLifetime: false,
        isMasterKey: false,
        clockTampered: false,
        trialEligible,
        isDesktopElectron: true,
        isProductionKeyConfigured: IS_PRODUCTION_KEY_CONFIGURED,
        error: check.error || 'Stored license is no longer valid.',
      };
    }

    // 2. Check active offline local trial
    if (stored.trialStartedAt && stored.trialExpiresAt) {
      const trialExpMs = Date.parse(stored.trialExpiresAt);
      const diffMs = trialExpMs - effectiveNowMs;
      if (Number.isFinite(trialExpMs) && diffMs > 0) {
        return {
          state: 'active',
          machineId,
          tier: 'trial',
          customer: 'Evaluation User (Local Trial)',
          licenseId: `TRIAL-${machineId.slice(-4)}`,
          issuedAt: stored.trialStartedAt,
          expiresAt: stored.trialExpiresAt,
          daysRemaining: Math.ceil(diffMs / MS_PER_DAY),
          isLifetime: false,
          isMasterKey: false,
          clockTampered: false,
          trialEligible: false,
          isDesktopElectron: true,
          isProductionKeyConfigured: IS_PRODUCTION_KEY_CONFIGURED,
          error: null,
        };
      }

      return {
        state: 'expired',
        machineId,
        tier: 'trial',
        customer: 'Evaluation User (Local Trial)',
        licenseId: `TRIAL-${machineId.slice(-4)}`,
        issuedAt: stored.trialStartedAt,
        expiresAt: stored.trialExpiresAt,
        daysRemaining: 0,
        isLifetime: false,
        isMasterKey: false,
        clockTampered: false,
        trialEligible: false,
        isDesktopElectron: true,
        isProductionKeyConfigured: IS_PRODUCTION_KEY_CONFIGURED,
        error: `Your ${DEFAULT_LOCAL_TRIAL_DAYS}-day free trial expired on ${stored.trialExpiresAt.slice(0, 10)}. Activate a 1-year or lifetime license to continue.`,
      };
    }

    // 3. Unlicensed fresh install
    return {
      state: 'unlicensed',
      machineId,
      tier: null,
      customer: null,
      licenseId: null,
      issuedAt: null,
      expiresAt: null,
      daysRemaining: null,
      isLifetime: false,
      isMasterKey: false,
      clockTampered: false,
      trialEligible: true,
      isDesktopElectron: true,
      isProductionKeyConfigured: IS_PRODUCTION_KEY_CONFIGURED,
      error: null,
    };
  }

  function activateLicense(rawKeyInput, nowMs = Date.now()) {
    const stored = loadMergedState();
    const effectiveNowMs = Math.max(nowMs, stored.lastSeenUtcMs);
    const check = verifySignedLicenseKey(rawKeyInput, machineId, effectiveNowMs, publicKeyPem);

    if (!check.valid) {
      return {
        ok: false,
        error: check.error || 'License activation failed.',
        status: getStatus(nowMs),
      };
    }

    persistState({
      ...stored,
      licenseKey: check.normalizedKey,
      lastSeenUtcMs: effectiveNowMs,
    });

    return {
      ok: true,
      error: null,
      status: getStatus(nowMs),
    };
  }

  function startLocalTrial(trialDays = DEFAULT_LOCAL_TRIAL_DAYS, nowMs = Date.now()) {
    const stored = loadMergedState();
    if (stored.trialStartedAt) {
      return {
        ok: false,
        error: 'A free trial has already been used on this computer.',
        status: getStatus(nowMs),
      };
    }

    const startIso = new Date(nowMs).toISOString();
    const expIso = new Date(nowMs + trialDays * MS_PER_DAY).toISOString();

    persistState({
      ...stored,
      trialStartedAt: startIso,
      trialExpiresAt: expIso,
      lastSeenUtcMs: Math.max(nowMs, stored.lastSeenUtcMs),
    });

    return {
      ok: true,
      error: null,
      status: getStatus(nowMs),
    };
  }

  function deactivateLicense(nowMs = Date.now()) {
    const stored = loadMergedState();
    persistState({
      ...stored,
      licenseKey: null,
      lastSeenUtcMs: Math.max(nowMs, stored.lastSeenUtcMs),
    });
    return {
      ok: true,
      status: getStatus(nowMs),
    };
  }

  return {
    machineId,
    getStatus,
    activateLicense,
    startLocalTrial,
    deactivateLicense,
  };
}

module.exports = {
  LICENSE_PREFIX,
  computeMachineId,
  extractKeyString,
  verifySignedLicenseKey,
  createLicenseManager,
};
