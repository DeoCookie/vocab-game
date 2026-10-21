'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  CSP,
  SECURITY_HEADERS,
  START_URL,
  secureWebPreferences,
  isAppUrl,
  shouldBlockRequest,
  resolveAppPath,
  contentTypeFor
} = require('../../src/main/security');

const ROOT = path.resolve(__dirname, '../../src/renderer');

test('web preferences follow the Electron security checklist', () => {
  const prefs = secureWebPreferences(path.join(ROOT, 'preload.js'));
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.nodeIntegrationInWorker, false);
  assert.equal(prefs.nodeIntegrationInSubFrames, false);
  assert.equal(prefs.webSecurity, true);
  assert.equal(prefs.allowRunningInsecureContent, false);
  assert.equal(prefs.webviewTag, false);
  assert.equal(prefs.experimentalFeatures, false);
  assert.equal(prefs.devTools, false, 'devtools off unless explicitly allowed');
  assert.ok(Object.isFrozen(prefs));
});

test('web preferences require an absolute preload path', () => {
  assert.throws(() => secureWebPreferences('preload.js'), TypeError);
  assert.throws(() => secureWebPreferences(undefined), TypeError);
});

test('content security policy forbids remote and inline code', () => {
  assert.match(CSP, /default-src 'none'/);
  assert.match(CSP, /script-src 'self'(;|$)/);
  assert.match(CSP, /object-src 'none'/);
  assert.match(CSP, /base-uri 'none'/);
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
});

test('only the app origin is treated as trusted', () => {
  assert.equal(isAppUrl(START_URL), true);
  assert.equal(isAppUrl('app://vocab/js/main.js'), true);
  for (const bad of [
    'https://example.com',
    'http://vocab/index.html',
    'file:///C:/Windows/system32',
    'app://evil/index.html',
    'app://user:pass@vocab/index.html',
    // eslint-disable-next-line no-script-url -- deliberately hostile input
    'javascript:alert(1)',
    'not a url',
    '',
    null,
    `app://vocab/${'a'.repeat(3000)}`
  ]) {
    assert.equal(isAppUrl(bad), false, String(bad).slice(0, 60));
  }
});

test('all network traffic is blocked; bundled files are allowed', () => {
  assert.equal(shouldBlockRequest('https://example.com/tracker.js'), true);
  assert.equal(shouldBlockRequest('http://127.0.0.1:8080/'), true);
  assert.equal(shouldBlockRequest('wss://example.com/socket'), true);
  assert.equal(shouldBlockRequest('file:///etc/passwd'), true);
  assert.equal(shouldBlockRequest('app://vocab/data/words.json'), false);
  assert.equal(shouldBlockRequest('devtools://devtools/bundled/inspector.html'), false);
  assert.equal(shouldBlockRequest(undefined), true);
});

test('app URLs map to files inside the renderer folder', () => {
  assert.equal(resolveAppPath('app://vocab/', ROOT), path.join(ROOT, 'index.html'));
  assert.equal(resolveAppPath('app://vocab/css/app.css', ROOT), path.join(ROOT, 'css', 'app.css'));
  assert.equal(resolveAppPath('app://vocab/data/words.json?x=1#y', ROOT), path.join(ROOT, 'data', 'words.json'));
});

test('dot segments are normalised and can never escape the renderer folder', () => {
  for (const url of ['app://vocab/../main/main.js', 'app://vocab/css/../../../../preload/preload.js', 'app://vocab/./././index.html', 'app://vocab/%2e%2e/main/main.js']) {
    const resolved = resolveAppPath(url, ROOT);
    assert.ok(resolved === null || resolved.startsWith(ROOT + path.sep), `${url} -> ${resolved}`);
  }
});

test('path traversal and odd encodings are refused', () => {
  for (const bad of [
    'app://vocab/css/%2e%2e%2f%2e%2e%2fmain%2fmain.js',
    'app://vocab/..%5cmain%5cmain.js',
    'app://vocab/index.html%00.js',
    'app://vocab/%E0%A4%A',
    'app://vocab/package.json.exe',
    'app://vocab/secret.txt',
    'https://vocab/index.html'
  ]) {
    assert.equal(resolveAppPath(bad, ROOT), null, bad);
  }
  assert.equal(resolveAppPath('app://vocab/index.html', 'relative/root'), null);
});

test('content types are explicit', () => {
  assert.equal(contentTypeFor('a.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentTypeFor('a.JSON'), 'application/json; charset=utf-8');
  assert.equal(contentTypeFor('a.exe'), 'application/octet-stream');
});
