/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Secure Electron Preload Bridge (contextIsolation: true, sandbox: true).
 * Exposes only explicit license IPC methods to the renderer process.
 */

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('omniGeoLicense', {
  getStatus: () => ipcRenderer.invoke('license:get-status'),
  activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
  importFile: () => ipcRenderer.invoke('license:import-file'),
  startTrial: () => ipcRenderer.invoke('license:start-trial'),
  deactivate: () => ipcRenderer.invoke('license:deactivate'),
});
