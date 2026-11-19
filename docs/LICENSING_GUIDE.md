# OmniGeo Offline-First Electron Licensing Guide

OmniGeo Desktop uses **Ed25519 asymmetric cryptographic licensing** running inside Electron's main process (`electron/licenseManager.cjs`) with a hardware-bound **Machine ID** (`OMNI-XXXX-XXXX-XXXX`) and monotonic clock-rollback protection.

It requires **zero external server**, **zero monthly fees**, and works 100% offline in air-gapped institutional environments.

---

## 1. One-Time Setup: Generate Your Private Signing Key

Run this **once** on your private build computer:

```bash
npm run license:init-keys
```

What this does:
1. Creates your secret Ed25519 private key at `.license-secrets/omnigeo-private.pem` (already in `.gitignore` — **back it up in a password manager / encrypted USB and NEVER share or ship it**).
2. Automatically writes your matching public key into `electron/licensePublicKey.cjs` (safe to bundle inside the Electron desktop installer).

---

## 2. Issuing Licenses for Each Tier

When a user installs OmniGeo Desktop, the activation screen displays their unique **Machine ID** (for example: `OMNI-7F3A-9C12-4B8E`).

### A. Free Trial License
Users can either click **"Start 14-Day Free Trial"** directly offline on first launch (one-time per computer), **OR** you can issue a custom signed trial (e.g. 30 days) for a specific client:

```bash
npm run license:issue -- --tier trial --days 30 --machine OMNI-7F3A-9C12-4B8E --customer "Direction Hydraulique" --out trial_client.omnigeo-lic
```

### B. 1-Year (Annual) License
Valid for 365 days on that exact desktop installation:

```bash
npm run license:issue -- --tier annual --machine OMNI-7F3A-9C12-4B8E --customer "Bureau Etudes SIG" --email "contact@client.com" --out annual_client.omnigeo-lic
```

### C. Indefinite / Lifetime License (Single Desktop)
Never expires (`expiresAt: null`), bound to one desktop installation:

```bash
npm run license:issue -- --tier lifetime --machine OMNI-7F3A-9C12-4B8E --customer "Client VIP" --out lifetime_client.omnigeo-lic
```

### D. Your Personal Owner Master Key (Indefinite, Any Machine)
Issue one master key for yourself using `--machine "*"` so you have permanent full access on any desktop you use:

```bash
npm run license:issue -- --tier lifetime --machine "*" --customer "Maodo (Owner Master)" --out maodo_master.omnigeo-lic
```

### Verify Any Key Locally
```bash
npm run license:verify -- --key "OMNIGEO-LIC-V1...." --machine OMNI-7F3A-9C12-4B8E
```

---

## 3. Packaging Electron Safely

When building your desktop installer (`electron-builder` or `electron-packager`):

1. Run `npm run build` first so `dist/` is fresh.
2. Ensure your Electron packager **excludes** `.license-secrets/`, `scripts/license-cli.mjs`, and `*.omnigeo-lic`:
   ```json
   "build": {
     "files": [
       "dist/**/*",
       "electron/**/*",
       "package.json",
       "!.license-secrets",
       "!scripts/license-cli.mjs",
       "!*.omnigeo-lic"
     ]
   }
   ```
3. Only `electron/licensePublicKey.cjs` is bundled—never the private `.pem` key.

---

## 4. Security Architecture Summary

- **Per-Machine Binding**: Windows (`MachineGuid` + BIOS/Motherboard UUID), macOS (`IOPlatformUUID`), Linux (`/etc/machine-id`) hashed with SHA-256 into `OMNI-XXXX-XXXX-XXXX`.
- **Tamper-Proof Verification**: Runs strictly inside Electron's Node main process via `contextIsolation: true` + `sandbox: true` preload bridge (`electron/preload.cjs`).
- **Anti-Rollback Protection**: Uses OS-level `safeStorage` encryption + dual HMAC-signed state anchors to detect system clock rollbacks (>5 min) and prevent trial resets after reinstalling.
