const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const PORT = 3000;
let mainWindow = null;
let server = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'KuroSeed',
    icon: path.join(__dirname, 'public', 'favicon.svg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

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
  // Start the Express backend
  const { startServer } = require('./index');
  server = await startServer(PORT);

  createWindow();

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
