import { app, BrowserWindow, Menu, shell, ipcMain, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerDialogHandlers } from './ipc/dialog.js';
import { registerFsHandlers } from './ipc/fs.js';
import { registerGitHandlers } from './ipc/git.js';
import { registerPtyHandlers, killAllPtys } from './ipc/pty.js';
import { registerShellHandlers } from './ipc/shell.js';
import { registerSecretsHandlers } from './ipc/secrets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* vite-plugin-electron injects this env var when running under `vite dev`. */
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  let iconPath = DEV_SERVER_URL
    ? path.join(__dirname, '../public/logo.png')
    : path.join(__dirname, '../dist/logo.png');

  if (!DEV_SERVER_URL) {
    iconPath = iconPath.replace('app.asar', 'app.asar.unpacked');
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#07070d',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Approve media/audioCapture requests for speech-to-text to work
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  /* Open external links (docs, deployed previews) in the OS browser, not inside the app shell. */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdater(getWindow: () => BrowserWindow | null) {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

  if (isDev) {
    let downloadInterval: NodeJS.Timeout | null = null;

    ipcMain.handle('updater:check', () => {
      const win = getWindow();
      if (!win) return;
      win.webContents.send('updater:status', { status: 'checking' });
      setTimeout(() => {
          win.webContents.send('updater:status', {
            status: 'available',
            version: app.getVersion(),
          });
      }, 1500);
    });

    ipcMain.handle('updater:download', () => {
      const win = getWindow();
      if (!win) return;
      win.webContents.send('updater:status', { status: 'downloading', percent: 0 });

      let percent = 0;
      if (downloadInterval) clearInterval(downloadInterval);
      downloadInterval = setInterval(() => {
        percent += 20;
        if (percent >= 100) {
          if (downloadInterval) clearInterval(downloadInterval);
          win.webContents.send('updater:status', { status: 'downloaded', version: app.getVersion() });
        } else {
          win.webContents.send('updater:status', { status: 'downloading', percent });
        }
      }, 1000);
    });

    ipcMain.handle('updater:install', () => {
      app.relaunch();
      app.exit(0);
    });
  } else {
    autoUpdater.autoDownload = true;

    autoUpdater.on('checking-for-update', () => {
      getWindow()?.webContents.send('updater:status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      getWindow()?.webContents.send('updater:status', {
        status: 'available',
        version: info.version,
      });
    });

    autoUpdater.on('update-not-available', () => {
      getWindow()?.webContents.send('updater:status', { status: 'not-available' });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      getWindow()?.webContents.send('updater:status', {
        status: 'downloading',
        percent: Math.round(progressObj.percent),
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      getWindow()?.webContents.send('updater:status', {
        status: 'downloaded',
        version: info.version,
      });
    });

    autoUpdater.on('error', (err) => {
      getWindow()?.webContents.send('updater:status', {
        status: 'error',
        error: err.message || String(err),
      });
    });

    ipcMain.handle('updater:check', () => {
      void autoUpdater.checkForUpdates();
    });

    ipcMain.handle('updater:download', () => {
      void autoUpdater.downloadUpdate();
    });

    ipcMain.handle('updater:install', () => {
      autoUpdater.quitAndInstall(false, true);
    });
  }
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  registerDialogHandlers(() => mainWindow);
  registerFsHandlers();
  registerGitHandlers();
  registerPtyHandlers();
  registerShellHandlers();
  registerSecretsHandlers();
  setupAutoUpdater(() => mainWindow);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killAllPtys();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => killAllPtys());
