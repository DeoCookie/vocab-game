'use strict';

/**
 * Loads the real main-process entry point against a recording fake of the
 * Electron API, then checks every security-relevant call it makes. This runs
 * without downloading Electron, so it works in any CI environment.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { START_URL, APP_SCHEME } = require('../../src/main/security');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-main-'));
const calls = { windows: [], ipc: new Map(), appEvents: new Map(), protocolHandlers: new Map(), schemes: [], menu: undefined };

function makeSession() {
  return {
    permissionRequest: null,
    permissionCheck: null,
    deviceCheck: null,
    beforeRequest: null,
    events: new Map(),
    setPermissionRequestHandler(fn) {
      this.permissionRequest = fn;
    },
    setPermissionCheckHandler(fn) {
      this.permissionCheck = fn;
    },
    setDevicePermissionHandler(fn) {
      this.deviceCheck = fn;
    },
    on(name, fn) {
      this.events.set(name, fn);
    },
    webRequest: {
      onBeforeRequest(fn) {
        fakeSession.beforeRequest = fn;
      }
    }
  };
}
const fakeSession = makeSession();

class FakeBrowserWindow {
  constructor(options) {
    this.options = options;
    this.loaded = null;
    this.events = new Map();
    calls.windows.push(this);
  }
  once(name, fn) {
    this.events.set(name, fn);
  }
  on(name, fn) {
    this.events.set(name, fn);
  }
  loadURL(url) {
    this.loaded = url;
    return Promise.resolve();
  }
  show() {}
  static getAllWindows() {
    return calls.windows;
  }
}

const fakeElectron = {
  app: {
    isPackaged: true,
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: (name, fn) => calls.appEvents.set(name, fn),
    quit: () => {},
    setAppUserModelId: () => {},
    getPath: (name) => (name === 'userData' ? userData : os.tmpdir()),
    getName: () => 'Vocab Quest',
    getVersion: () => '1.0.0'
  },
  BrowserWindow: FakeBrowserWindow,
  Menu: { setApplicationMenu: (m) => (calls.menu = m) },
  ipcMain: { handle: (channel, fn) => calls.ipc.set(channel, fn) },
  protocol: {
    registerSchemesAsPrivileged: (schemes) => calls.schemes.push(...schemes),
    handle: (scheme, fn) => calls.protocolHandlers.set(scheme, fn)
  },
  session: { defaultSession: fakeSession }
};

const originalLoad = Module._load;
let mainModule;

before(async () => {
  Module._load = function load(request, ...rest) {
    if (request === 'electron') return fakeElectron;
    return originalLoad.call(this, request, ...rest);
  };
  mainModule = require('../../src/main/main.js');
  await new Promise((r) => setImmediate(r));
});

after(() => {
  Module._load = originalLoad;
  fs.rmSync(userData, { recursive: true, force: true });
});

const trusted = { senderFrame: { url: START_URL, parent: null } };

test('registers a secure, standard custom scheme', () => {
  const scheme = calls.schemes.find((s) => s.scheme === APP_SCHEME);
  assert.ok(scheme);
  assert.equal(scheme.privileges.secure, true);
  assert.equal(scheme.privileges.standard, true);
  assert.ok(!scheme.privileges.bypassCSP, 'must not bypass CSP');
});

test('creates one sandboxed, context-isolated window loading the app', () => {
  assert.equal(calls.windows.length, 1);
  const win = calls.windows[0];
  const prefs = win.options.webPreferences;
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.devTools, false);
  assert.ok(path.isAbsolute(prefs.preload));
  assert.ok(fs.existsSync(prefs.preload), 'preload exists');
  assert.equal(win.loaded, START_URL);
  assert.equal(calls.menu, null, 'no application menu in production');
});

test('denies every permission request and check', () => {
  let granted = 'unset';
  fakeSession.permissionRequest(null, 'media', (v) => (granted = v));
  assert.equal(granted, false);
  assert.equal(fakeSession.permissionCheck(null, 'notifications'), false);
  assert.equal(fakeSession.deviceCheck({}), false);
});

test('blocks network requests and downloads', () => {
  const check = (url) => {
    let result;
    fakeSession.beforeRequest({ url }, (r) => (result = r));
    return result.cancel;
  };
  assert.equal(check('https://example.com/'), true);
  assert.equal(check('app://vocab/index.html'), false);
  let prevented = false;
  fakeSession.events.get('will-download')({ preventDefault: () => (prevented = true) });
  assert.equal(prevented, true);
});

test('locks down navigation, popups and webviews on every web contents', () => {
  const handlers = new Map();
  let openHandler;
  const contents = {
    on: (name, fn) => handlers.set(name, fn),
    setWindowOpenHandler: (fn) => (openHandler = fn)
  };
  calls.appEvents.get('web-contents-created')({}, contents);

  const nav = (name, url) => {
    let prevented = false;
    handlers.get(name)({ preventDefault: () => (prevented = true) }, url);
    return prevented;
  };
  assert.equal(nav('will-navigate', 'https://evil.example'), true);
  assert.equal(nav('will-navigate', 'app://vocab/index.html'), false);
  assert.equal(nav('will-redirect', 'file:///C:/'), true);
  assert.equal(nav('will-attach-webview', 'app://vocab/'), true);
  assert.deepEqual(openHandler({ url: 'https://example.com' }), { action: 'deny' });
});

test('IPC only answers the app page, never other frames or origins', async () => {
  const load = calls.ipc.get('progress:load');
  await assert.rejects(() => load({ senderFrame: { url: 'https://evil.example', parent: null } }), /untrusted/);
  await assert.rejects(() => load({ senderFrame: { url: START_URL, parent: {} } }), /untrusted/);
  await assert.rejects(() => load({}), /untrusted/);
  assert.equal(await load(trusted), null);
});

test('progress saves through IPC are validated and persisted', async () => {
  const save = calls.ipc.get('progress:save');
  const load = calls.ipc.get('progress:load');
  assert.equal(await save(trusted, { xp: 42, junk: 'x', words: { serene: { box: 1, seen: 1 } } }), true);
  const loaded = await load(trusted);
  assert.equal(loaded.xp, 42);
  assert.equal(loaded.junk, undefined);
  assert.equal(loaded.words.serene.box, 1);
  assert.ok(fs.existsSync(path.join(userData, 'progress.json')));
  assert.deepEqual(await calls.ipc.get('app:info')(trusted), { name: 'Vocab Quest', version: '1.0.0' });
});

test('the app protocol serves bundled files with security headers and nothing else', async () => {
  const handler = calls.protocolHandlers.get(APP_SCHEME);
  assert.equal(handler, mainModule.handleAppRequest);
  const ok = await handler({ url: 'app://vocab/index.html', method: 'GET' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(ok.headers.get('content-type'), /text\/html/);
  assert.match(await ok.text(), /<title>Vocab Quest<\/title>/);

  assert.equal((await handler({ url: 'app://vocab/../main/main.js', method: 'GET' })).status, 404);
  assert.equal((await handler({ url: 'app://vocab/missing.js', method: 'GET' })).status, 404);
  assert.equal((await handler({ url: 'app://vocab/index.html', method: 'POST' })).status, 405);
});
