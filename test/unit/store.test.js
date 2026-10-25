'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProgressStore } = require('../../src/main/store');
const { sanitizeProgress, sanitizeDocument, defaultProgress, MAX_PROFILES } = require('../../src/main/progress-schema');

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-store-'));
  file = path.join(dir, 'nested', 'progress.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function docWith(progress, extra = {}) {
  return { version: 2, activeProfileId: 'p1', profiles: [{ id: 'p1', name: 'Ana', color: 'teal', createdAt: 1, progress }], ...extra };
}

test('loading before anything is saved returns null', async () => {
  assert.equal(await new ProgressStore(file).load(), null);
});

test('save then load round-trips a sanitised document', async () => {
  const store = new ProgressStore(file);
  const progress = defaultProgress();
  progress.xp = 120;
  progress.words.serene = { box: 2, seen: 3, correct: 2, wrong: 1, due: 5, last: 4, checks: 3 };
  progress.sets['expert-12'] = { learned: 9, mastered: 0 };
  const doc = docWith(progress);
  await store.save(doc);
  assert.deepEqual(await store.load(), doc);
  assert.equal(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')).length, 0, 'no temp files left');
});

test('rapid saves are serialised and the last one wins', async () => {
  const store = new ProgressStore(file);
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.save(docWith({ ...defaultProgress(), xp: i }))));
  assert.equal((await store.load()).profiles[0].progress.xp, 19);
});

test('a version 1 save is upgraded and a backup of the original is kept', async () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const v1 = { version: 1, xp: 77, words: { calm: { box: 4, seen: 5 } }, settings: { theme: 'dark', level: '3' } };
  fs.writeFileSync(file, JSON.stringify(v1));
  const loaded = await new ProgressStore(file).load();
  assert.equal(loaded.version, 2);
  assert.equal(loaded.profiles[0].progress.xp, 77);
  assert.equal(loaded.profiles[0].progress.words.calm.checks, 7);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.v1-backup`, 'utf8')), v1);
});

test('a corrupt file is quarantined instead of crashing the app', async () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json');
  assert.equal(await new ProgressStore(file).load(), null);
  assert.ok(fs.readdirSync(path.dirname(file)).some((f) => f.startsWith('progress.json.corrupt-')));
});

test('oversized files are refused', async () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x'.repeat(2048));
  assert.equal(await new ProgressStore(file, { maxBytes: 1024 }).load(), null);
});

test('eight players who have each met all 1,500 words still fit within the size limit', async () => {
  const words = {};
  for (let i = 0; i < 1500; i += 1) words[`word${String.fromCharCode(97 + (i % 26))}${i}`.replace(/\d/g, (d) => 'abcdefghij'[d])] = { box: 5, seen: 99999, correct: 99999, wrong: 99999, due: 8.6e15, last: 8.6e15, checks: 7 };
  const progress = { ...defaultProgress(), words };
  const profiles = Array.from({ length: MAX_PROFILES }, (_, i) => ({ id: `p${i + 1}`, name: 'x'.repeat(24), color: 'navy', createdAt: 1, progress }));
  const store = new ProgressStore(file);
  await store.save({ version: 2, activeProfileId: 'p1', profiles });
  assert.equal((await store.load()).profiles.length, MAX_PROFILES);
});

test('the store needs an absolute path', () => {
  assert.throws(() => new ProgressStore('progress.json'), TypeError);
});

test('sanitiser drops unknown keys, clamps numbers and blocks prototype pollution', () => {
  const evil = JSON.parse(
    '{"xp":-5,"__proto__":{"polluted":true},"extra":"x","words":{"__proto__":{"box":9},"constructor":{"box":1},"Bad Key":{},"ok":{"box":99,"seen":"7","due":1e30,"checks":99}},' +
      '"stats":{"answered":3,"correct":10},"achievements":["first-word","first-word","<script>",42],' +
      '"tier":"godmode","start":{"beginner":999,"expert":-3,"__proto__":{}},' +
      '"sets":{"beginner-1":{"learned":5},"beginner-51":{},"__proto__":{"learned":1},"expert-7":"x"},' +
      '"settings":{"rate":9,"theme":"neon","level":7,"sound":"yes","voiceURI":"' + 'v'.repeat(400) + '"}}'
  );
  const clean = sanitizeProgress(evil);
  assert.equal(clean.xp, 0);
  assert.equal(clean.extra, undefined);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(clean.words), ['constructor', 'ok']);
  assert.equal(Object.getPrototypeOf(clean.words), Object.prototype);
  assert.equal(clean.words.ok.box, 5);
  assert.equal(clean.words.ok.checks, 7);
  assert.ok(clean.words.ok.due <= 8.64e15);
  assert.equal(clean.stats.correct, 3, 'correct can never exceed answered');
  assert.deepEqual(clean.achievements, ['first-word']);
  assert.equal(clean.tier, 'beginner');
  assert.deepEqual(clean.start, { beginner: 50, expert: 1, master: 1 });
  assert.deepEqual(clean.sets, { 'beginner-1': { learned: 5, mastered: 0 }, 'expert-7': { learned: 0, mastered: 0 } });
  assert.deepEqual(clean.settings, { voiceURI: null, rate: 1.5, sound: true, theme: 'system' });
});

test('document sanitiser limits players, fixes ids and the active player', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: i < 2 ? 'p1' : `bad id ${i}`, name: `‮${i}`, color: 'rainbow', progress: {} }));
  const doc = sanitizeDocument({ version: 2, activeProfileId: '__proto__', profiles: many, junk: true });
  assert.equal(doc.profiles.length, MAX_PROFILES);
  assert.equal(new Set(doc.profiles.map((p) => p.id)).size, MAX_PROFILES, 'ids are unique');
  for (const p of doc.profiles) {
    assert.match(p.id, /^p[a-z0-9]{1,15}$/);
    assert.doesNotMatch(p.name, /‮/);
    assert.notEqual(p.color, 'rainbow');
  }
  assert.equal(doc.activeProfileId, doc.profiles[0].id);
  assert.equal(doc.junk, undefined);
});

test('sanitisers handle garbage input', () => {
  for (const junk of [null, undefined, 42, 'str', [], new Date()]) {
    assert.deepEqual(sanitizeProgress(junk), defaultProgress());
    assert.deepEqual(sanitizeDocument(junk), { version: 2, activeProfileId: null, profiles: [] });
  }
});
