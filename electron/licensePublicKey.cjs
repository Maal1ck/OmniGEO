/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ed25519 Public Key used by the OmniGeo Electron desktop app to verify
 * offline signed licenses.
 *
 * IMPORTANT:
 * Run `npm run license:init-keys` once on your private build machine before
 * shipping installers. That command generates your private signing key in
 * `.license-secrets/omnigeo-private.pem` (gitignored, NEVER ship it) and
 * overwrites this file with your production public key.
 */

const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
-----END PUBLIC KEY-----`;

const IS_PRODUCTION_KEY_CONFIGURED = false;

module.exports = {
  LICENSE_PUBLIC_KEY_PEM,
  IS_PRODUCTION_KEY_CONFIGURED,
};
