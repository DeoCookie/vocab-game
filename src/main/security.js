'use strict';

/**
 * Pure, dependency-free security helpers for the main process.
 * Kept separate from Electron wiring so they can be unit tested in plain Node.
 */

const path = require('node:path');

const APP_SCHEME = 'app';
const APP_HOST = 'vocab';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const START_URL = `${APP_ORIGIN}/index.html`;

/** Strict Content-Security-Policy: no remote code, no inline script, no network. */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "manifest-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), payment=()'
});

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
});

/**
 * Web preferences for every BrowserWindow. Follows the Electron security checklist:
 * context isolation, OS-level sandbox, no Node.js in the renderer, no webview.
 */
function secureWebPreferences(preloadPath, { allowDevTools = false } = {}) {
  if (typeof preloadPath !== 'string' || !path.isAbsolute(preloadPath)) {
    throw new TypeError('preloadPath must be an absolute path');
  }
  return Object.freeze({
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    spellcheck: false,
    devTools: Boolean(allowDevTools)
  });
}

function parseUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** True only for URLs served by this application's own protocol. */
function isAppUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST && !url.username && !url.password);
}

/**
 * Every request the renderer makes is checked here. The app is fully offline,
 * so anything other than its own bundled files is cancelled.
 */
function shouldBlockRequest(value) {
  if (typeof value !== 'string') return true;
  if (value.startsWith('devtools://')) return false;
  if (value.startsWith('data:image/')) return false;
  return !isAppUrl(value);
}

/**
 * Map an app:// URL to a file inside rootDir. Returns null for anything that
 * would escape the root (path traversal, encoded separators, NUL bytes, etc).
 */
function resolveAppPath(value, rootDir) {
  if (!isAppUrl(value) || typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) return null;
  const url = parseUrl(value);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\') || /(^|\/)\.\.(\/|$)/.test(pathname)) return null;
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, `.${pathname}`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  if (!Object.prototype.hasOwnProperty.call(CONTENT_TYPES, path.extname(resolved).toLowerCase())) return null;
  return resolved;
}

function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(String(filePath)).toLowerCase()] || 'application/octet-stream';
}

module.exports = {
  APP_SCHEME,
  APP_HOST,
  APP_ORIGIN,
  START_URL,
  CSP,
  SECURITY_HEADERS,
  CONTENT_TYPES,
  secureWebPreferences,
  isAppUrl,
  shouldBlockRequest,
  resolveAppPath,
  contentTypeFor
};
