// Cats Office — desktop shell. Serves the built web app (desktop/app) over a private app:// scheme
// so fetch(), modules and dynamic imports behave exactly like on the web.
// API base URL: put a config.js next to the executable (or in the user-data folder) to override the bundled one.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const APP_DIR = path.join(__dirname, 'app');
const ICON = path.join(APP_DIR, 'icons', 'icon-512.png');

function userConfig() {
  const cands = [path.join(path.dirname(process.execPath), 'config.js'), path.join(app.getPath('userData'), 'config.js')];
  return cands.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 720, minHeight: 480, resizable: true,
    backgroundColor: '#1b1410', title: 'بيت القطط الدافئ', icon: ICON, show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  // external links open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://office/index.html' + (process.env.CATS_QUERY || ''));
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    let rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    if (rel === 'config.js') { const c = userConfig(); if (c) return net.fetch(pathToFileURL(c).toString()); }
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = createWindow();
  if (process.env.CATS_SHOT) { // test hook: save a screenshot and quit
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.CATS_SHOT, img.toPNG()); app.quit();
    }, Number(process.env.CATS_SHOT_DELAY || 6000)));
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
