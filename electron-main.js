const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let server = null;
let serverPort = null;

function logLine(line) {
  try {
    const logPath = path.join(app.getPath('userData'), 'kuroseed.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
  } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'KuroSeed',
    icon: path.join(__dirname, 'build', 'icon-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hide menu bar (optional: show with Alt on Windows)
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // In packaged builds, avoid hardcoding :3000 (often already in use).
    // Port 0 lets the OS choose a free port.
    const preferredPort = app.isPackaged ? 0 : 3000;
    const { startServer } = require('./index');
    const started = await startServer(preferredPort);
    server = started.server;
    serverPort = started.port;
    logLine(`Server started on port ${serverPort} (packaged=${app.isPackaged})`);

    createWindow();
  } catch (err) {
    const msg = err?.message || String(err);
    logLine(`Startup error: ${msg}`);
    dialog.showErrorBox('KuroSeed - Error al iniciar', msg);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
  }
});
