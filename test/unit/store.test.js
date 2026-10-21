'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProgressStore } = require('../../src/main/store');
const { sanitizeProgress, defaultProgress } = require('../../src/main/progress-schema');

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-store-'));
  file = path.join(dir, 'nested', 'progress.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loading before anything is saved returns null', async () => {
  assert.equal(await new ProgressStore(file).load(), null);
});

test('save then load round-trips sanitised data', async () => {
  const store = new ProgressStore(file);
  const data = defaultProgress();
  data.xp = 120;
  data.words.serene = { box: 2, seen: 3, correct: 2, wrong: 1, due: 5, last: 4 };
  await store.save(data);
  assert.deepEqual(await store.load(), data);
  assert.equal(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')).length, 0, 'no temp files left');
});

test('rapid saves are serialised and the last one wins', async () => {
  const store = new ProgressStore(file);
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.save({ ...defaultProgress(), xp: i })));
  assert.equal((await store.load()).xp, 19);
});

test('a corrupt file is quarantined instead of crashing the app', async () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json');
  const store = new ProgressStore(file);
  assert.equal(await store.load(), null);
  assert.ok(fs.readdirSync(path.dirname(file)).some((f) => f.startsWith('progress.json.corrupt-')));
});

test('oversized files are refused', async () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x'.repeat(2048));
  assert.equal(await new ProgressStore(file, { maxBytes: 1024 }).load(), null);
});

test('the store needs an absolute path', () => {
  assert.throws(() => new ProgressStore('progress.json'), TypeError);
});

test('sanitiser drops unknown keys, clamps numbers and blocks prototype pollution', () => {
  const evil = JSON.parse(
    '{"xp":-5,"__proto__":{"polluted":true},"extra":"x","words":{"__proto__":{"box":9},"constructor":{"box":1},"Bad Key":{},"ok":{"box":99,"seen":"7","due":1e30}},' +
      '"stats":{"answered":3,"correct":10},"achievements":["first-word","first-word","<script>",42],' +
      '"settings":{"rate":9,"theme":"neon","level":7,"sound":"yes","voiceURI":"' + 'v'.repeat(400) + '"}}'
  );
  const clean = sanitizeProgress(evil);
  assert.equal(clean.xp, 0);
  assert.equal(clean.extra, undefined);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(clean.words), ['constructor', 'ok']);
  assert.equal(Object.getPrototypeOf(clean.words), Object.prototype);
  assert.equal(clean.words.ok.box, 5);
  assert.equal(clean.words.ok.seen, 7);
  assert.ok(clean.words.ok.due <= 8.64e15);
  assert.equal(clean.stats.correct, 3, 'correct can never exceed answered');
  assert.deepEqual(clean.achievements, ['first-word']);
  assert.deepEqual(clean.settings, { voiceURI: null, rate: 1.5, sound: true, theme: 'system', level: 'all' });
});

test('sanitiser handles garbage input', () => {
  for (const junk of [null, undefined, 42, 'str', [], new Date()]) {
    assert.deepEqual(sanitizeProgress(junk), defaultProgress());
  }
});
