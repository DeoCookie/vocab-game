'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, protocol, session } = require('electron');
const {
  APP_SCHEME,
  START_URL,
  SECURITY_HEADERS,
  secureWebPreferences,
  isAppUrl,
  shouldBlockRequest,
  resolveAppPath,
  contentTypeFor
} = require('./security');
const { ProgressStore } = require('./store');

const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'preload.js');
const IS_DEV = !app.isPackaged && process.env.VOCAB_DEV === '1';

// The custom scheme must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true }
  }
]);

let mainWindow = null;
let store = null;

/** Only accept IPC from our own top-level page. */
function assertTrustedSender(event) {
  const frame = event && event.senderFrame;
  if (!frame || !isAppUrl(frame.url) || (frame.parent !== null && frame.parent !== undefined)) {
    throw new Error('Blocked IPC from an untrusted sender');
  }
}

async function handleAppRequest(request) {
  const notFound = () => new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: SECURITY_HEADERS });
  const filePath = resolveAppPath(request.url, RENDERER_ROOT);
  if (!filePath) return notFound();
  try {
    const body = await fs.readFile(filePath);
    return new Response(body, {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': contentTypeFor(filePath) }
    });
  } catch {
    return notFound();
  }
}

function hardenSession(ses) {
  // The app never needs camera, microphone, notifications, USB, etc.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  if (typeof ses.setDevicePermissionHandler === 'function') ses.setDevicePermissionHandler(() => false);
  // Fully offline: cancel every request that is not one of our bundled files.
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: shouldBlockRequest(details.url) });
  });
  ses.on('will-download', (event) => event.preventDefault());
}

function registerIpc() {
  ipcMain.handle('progress:load', async (event) => {
    assertTrustedSender(event);
    return store.load();
  });
  ipcMain.handle('progress:save', async (event, data) => {
    assertTrustedSender(event);
    await store.save(data);
    return true;
  });
  ipcMain.handle('app:info', async (event) => {
    assertTrustedSender(event);
    return { name: app.getName(), version: app.getVersion() };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 960,
    minHeight: 660,
    show: false,
    title: 'Vocab Quest',
    backgroundColor: '#e8edf4',
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(PRELOAD_PATH, { allowDevTools: IS_DEV })
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(START_URL);
}

// Lock down every web contents ever created (windows, devtools, anything).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('io.github.vocabquest.app');
    if (!IS_DEV) Menu.setApplicationMenu(null);
    store = new ProgressStore(path.join(app.getPath('userData'), 'progress.json'));
    hardenSession(session.defaultSession);
    protocol.handle(APP_SCHEME, handleAppRequest);
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { handleAppRequest, assertTrustedSender, hardenSession };
