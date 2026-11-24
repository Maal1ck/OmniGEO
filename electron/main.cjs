const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {app, BrowserWindow, dialog, ipcMain, safeStorage, shell} = require('electron');
const {createLicenseManager} = require('./licenseManager.cjs');

const appName = 'OmniGeo by Maodo — Geospatial Batch Processing Workbench';
let licenseManager = null;

function openExternalUrl(value) {
  const url = new URL(value);
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    void shell.openExternal(url.href).catch(error => {
      console.error(`Could not open external URL: ${url.href}`, error);
    });
  }
}

function registerLicenseIpcHandlers() {
  licenseManager = createLicenseManager({
    userDataPath: app.getPath('userData'),
    safeStorage,
  });

  ipcMain.handle('license:get-status', () => {
    return licenseManager.getStatus();
  });

  ipcMain.handle('license:activate', (_event, rawKey) => {
    return licenseManager.activateLicense(rawKey);
  });

  ipcMain.handle('license:start-trial', () => {
    return licenseManager.startLocalTrial();
  });

  ipcMain.handle('license:deactivate', () => {
    return licenseManager.deactivateLicense();
  });

  ipcMain.handle('license:import-file', async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(ownerWindow || undefined, {
      title: 'Import OmniGeo License File',
      properties: ['openFile'],
      filters: [
        {name: 'OmniGeo License Files', extensions: ['omnigeo-lic', 'lic', 'txt', 'json']},
        {name: 'All Files', extensions: ['*']},
      ],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return {ok: false, canceled: true, error: null, status: licenseManager.getStatus()};
    }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      return licenseManager.activateLicense(content);
    } catch (err) {
      return {
        ok: false,
        canceled: false,
        error: `Could not read license file: ${err.message}`,
        status: licenseManager.getStatus(),
      };
    }
  });
}

async function createWindow() {
  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: appName,
    backgroundColor: '#0D1413',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({url}) => {
    openExternalUrl(url);
    return {action: 'deny'};
  });

  window.webContents.on('will-navigate', (event, value) => {
    let url;
    try {
      url = new URL(value);
    } catch (error) {
      event.preventDefault();
      console.error(`Blocked invalid navigation URL: ${value}`, error);
      return;
    }

    if (
      url.protocol === 'file:' &&
      path.resolve(fileURLToPath(url)).toLowerCase() === indexPath.toLowerCase()
    ) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url.href);
  });

  try {
    await window.loadFile(indexPath);
  } catch (error) {
    console.error(`Could not load the OmniGeo workbench: ${indexPath}`, error);
    dialog.showErrorBox(
      'OmniGeo could not start',
      `The workbench could not be loaded from:\n${indexPath}\n\n${error.message}`,
    );
    window.close();
  }
}

app.whenReady().then(() => {
  registerLicenseIpcHandlers();
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}).catch(error => {
  console.error('OmniGeo failed to initialize:', error);
  dialog.showErrorBox('OmniGeo could not start', error.message);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
