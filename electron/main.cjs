const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {app, BrowserWindow, dialog, shell} = require('electron');

const appName = 'OmniGeo by Maodo — Geospatial Batch Processing Workbench';

function openExternalUrl(value) {
  const url = new URL(value);
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    void shell.openExternal(url.href).catch(error => {
      console.error(`Could not open external URL: ${url.href}`, error);
    });
  }
}

async function createWindow() {
  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: appName,
    backgroundColor: '#13110E',
    autoHideMenuBar: true,
    webPreferences: {
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
