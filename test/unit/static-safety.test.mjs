// Source-level guard rails: fail the build if risky patterns creep in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function filesUnder(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full, exts));
    else if (exts.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const rendererJs = filesUnder(path.join(ROOT, 'src/renderer'), ['.js']);
const allSrc = filesUnder(path.join(ROOT, 'src'), ['.js', '.html', '.css']);

test('renderer never parses strings as HTML or code', () => {
  const banned = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/, /setTimeout\(\s*['"`]/];
  for (const file of rendererJs) {
    const src = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) assert.doesNotMatch(src, pattern, `${path.relative(ROOT, file)} uses ${pattern}`);
  }
});

test('no remote URLs are loaded anywhere in the app', () => {
  const allowed = new Set(['http://www.w3.org/2000/svg']);
  for (const file of allSrc) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
      assert.ok(allowed.has(match[0]), `${path.relative(ROOT, file)} references ${match[0]}`);
    }
  }
});

test('index.html has a strict CSP and no inline script or handlers', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'inline <script>');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'inline event handler');
  assert.doesNotMatch(html, /\sstyle=/i, 'inline style attribute');
});

test('the preload exposes only the fixed API and never raw ipcRenderer', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/preload/preload.js'), 'utf8');
  assert.match(src, /contextBridge\.exposeInMainWorld\(/);
  assert.doesNotMatch(src, /exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/);
  assert.doesNotMatch(src, /\bipcRenderer\.(on|send|sendSync)\b/);
  const channels = [...src.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(channels, ['app:info', 'progress:load', 'progress:save']);
});

test('main process never enables insecure Electron options', () => {
  for (const file of filesUnder(path.join(ROOT, 'src/main'), ['.js'])) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /nodeIntegration:\s*true/);
    assert.doesNotMatch(src, /contextIsolation:\s*false/);
    assert.doesNotMatch(src, /sandbox:\s*false/);
    assert.doesNotMatch(src, /webSecurity:\s*false/);
    assert.doesNotMatch(src, /bypassCSP/);
    assert.doesNotMatch(src, /shell\.openExternal/);
    assert.doesNotMatch(src, /child_process/);
  }
});

test('the app is released under the MIT license', () => {
  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.license, 'MIT');
  assert.ok(pkg.build.files.includes('LICENSE'), 'license ships with the installer');
});

test('production dependencies are empty (nothing third-party runs in the app)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
});
