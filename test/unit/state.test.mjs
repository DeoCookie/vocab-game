import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildData } from '../../src/renderer/js/data.js';
import {
  createProgress,
  hydrate,
  hydrateDocument,
  addProfile,
  renameProfile,
  removeProfile,
  setActiveProfile,
  activeProfile,
  withProgress,
  sanitizeName,
  levelInfo,
  xpForLevel,
  touchStreak,
  currentStreak,
  recordAnswer,
  summarize,
  ACHIEVEMENTS,
  MAX_PROFILES,
  dayString
} from '../../src/renderer/js/state.js';

const require = createRequire(import.meta.url);
const schema = require('../../src/main/progress-schema.js');
const wordDoc = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));
const glossDoc = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/glosses.json', import.meta.url), 'utf8'));
const data = buildData(wordDoc, glossDoc);

test('a new player starts at level 1 in Beginner with nothing learned', () => {
  const p = createProgress();
  assert.equal(levelInfo(p.xp).level, 1);
  assert.equal(p.tier, 'beginner');
  assert.deepEqual(summarize(p, data.words), { total: 1500, seen: 0, mastered: 0, learned: 0, learning: 0, accuracy: 0 });
});

test('the renderer and the main-process validator agree on the save format', () => {
  let doc = addProfile(hydrateDocument(null), { name: 'Ana' }, 5).doc;
  doc = addProfile(doc, { name: 'Ben', color: 'plum' }, 6).doc;
  const played = recordAnswer(activeProfile(doc).progress, data, { word: 'patient', correct: true, mode: 'meaning', xp: 12, check: 'meaning', now: Date.now() }).progress;
  doc = withProgress(doc, played);
  assert.deepEqual(schema.sanitizeDocument(doc), doc);
  assert.deepEqual(hydrateDocument(schema.sanitizeDocument(doc)), doc);
});

test('a version 1 save becomes "Player 1" and keeps every word', () => {
  const v1 = {
    version: 1,
    xp: 300,
    streak: { count: 2, best: 5, lastDay: '2026-10-20' },
    words: { calm: { box: 4, seen: 9, correct: 8, wrong: 1, due: 1, last: 1 }, bold: { box: 1, seen: 2, correct: 1, wrong: 1, due: 1, last: 1 } },
    stats: { answered: 20, correct: 15, spellingCorrect: 3, sprintBest: 7, sessions: 4 },
    achievements: ['first-word', 'all-500'],
    settings: { voiceURI: null, rate: 1, sound: false, theme: 'dark', level: '2' }
  };
  for (const doc of [hydrateDocument(v1), schema.sanitizeDocument(v1)]) {
    assert.equal(doc.version, 2);
    assert.equal(doc.profiles.length, 1);
    const p = doc.profiles[0];
    assert.equal(p.name, 'Player 1');
    assert.equal(doc.activeProfileId, p.id);
    assert.equal(p.progress.xp, 300);
    assert.equal(p.progress.words.calm.checks, 7, 'mastered words count as learned');
    assert.equal(p.progress.words.bold.checks || 0, 0);
    assert.equal(p.progress.settings.theme, 'dark');
    assert.equal(p.progress.settings.level, undefined, 'old level setting is dropped');
    assert.equal(p.progress.tier, 'beginner');
  }
});

test('profiles can be added, renamed, switched and removed', () => {
  let doc = hydrateDocument(null);
  const a = addProfile(doc, { name: '  Mia  ' });
  doc = a.doc;
  assert.equal(a.profile.name, 'Mia');
  assert.equal(doc.activeProfileId, a.profile.id);
  const b = addProfile(doc, { name: 'Leo' });
  doc = b.doc;
  assert.equal(activeProfile(doc).name, 'Leo');
  doc = setActiveProfile(doc, a.profile.id);
  assert.equal(activeProfile(doc).name, 'Mia');
  doc = renameProfile(doc, a.profile.id, 'Mia R');
  assert.equal(activeProfile(doc).name, 'Mia R');
  doc = removeProfile(doc, a.profile.id);
  assert.equal(doc.profiles.length, 1);
  assert.equal(activeProfile(doc).name, 'Leo');
  assert.throws(() => removeProfile(doc, b.profile.id), /at least one/);
});

test('profile progress is kept separate', () => {
  let doc = addProfile(hydrateDocument(null), { name: 'A' }).doc;
  const aId = doc.activeProfileId;
  doc = withProgress(doc, recordAnswer(activeProfile(doc).progress, data, { word: 'reveal', correct: true, mode: 'meaning', xp: 10 }).progress);
  doc = addProfile(doc, { name: 'B' }).doc;
  assert.equal(activeProfile(doc).progress.xp, 0);
  assert.equal(doc.profiles.find((p) => p.id === aId).progress.xp, 10);
});

test('there can be at most eight players', () => {
  let doc = hydrateDocument(null);
  for (let i = 0; i < MAX_PROFILES; i += 1) doc = addProfile(doc, { name: `P${i}` }).doc;
  assert.throws(() => addProfile(doc, { name: 'one too many' }), RangeError);
});

test('player names are cleaned of control and direction characters', () => {
  assert.equal(sanitizeName('A‮evil\u0007'), 'Aevil');
  assert.equal(sanitizeName('   '), 'Player');
  assert.equal(sanitizeName('x'.repeat(100)).length, 24);
  assert.equal(sanitizeName(42), 'Player');
  assert.equal(schema.sanitizeName('A‮evil\u0007'), 'Aevil');
});

test('level thresholds grow steadily', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 60);
  assert.equal(levelInfo(59).level, 1);
  assert.equal(levelInfo(60).level, 2);
  assert.equal(levelInfo(180).level, 3);
});

test('streaks continue on consecutive days and reset after a gap', () => {
  let p = createProgress();
  p = touchStreak(p, '2026-03-01');
  p = touchStreak(p, '2026-03-02');
  p = touchStreak(p, '2026-03-03');
  assert.equal(p.streak.count, 3);
  assert.equal(currentStreak(p, '2026-03-04'), 3);
  assert.equal(currentStreak(p, '2026-03-05'), 0);
  p = touchStreak(p, '2025-12-31');
  p = touchStreak(p, '2026-01-01');
  assert.equal(p.streak.count, 2, 'crosses year boundaries');
});

test('answers record checks, and learning all ten words of a set pays the set bonus once', () => {
  const words = data.setWords('beginner', 1);
  let p = createProgress();
  let bonus = 0;
  for (const w of words) {
    for (const check of ['meaning', 'spelling', 'relation']) {
      const r = recordAnswer(p, data, { word: w.word, correct: true, mode: check === 'relation' ? 'synonym' : check, xp: 10, check });
      p = r.progress;
      bonus += r.sets.filter((e) => e.type === 'learned').length;
    }
  }
  assert.equal(bonus, 1);
  assert.ok(p.sets['beginner-1'].learned > 0);
  assert.ok(p.achievements.includes('first-set'));
  assert.equal(p.xp, 300 + 50);
});

test('reading a card marks a word as seen without testing it', () => {
  const r = recordAnswer(createProgress(), data, { word: 'reveal', correct: true, mode: 'card', xp: 2 });
  const e = r.progress.words.reveal;
  assert.equal(e.seen, 1);
  assert.equal(e.box, 0);
  assert.equal(e.correct, 0);
  assert.equal(r.progress.stats.answered, 0);
});

test('recording an answer never mutates its input', () => {
  const p = createProgress();
  const r = recordAnswer(p, data, { word: 'reveal', correct: true, mode: 'spelling', xp: 70, check: 'spelling' });
  assert.equal(p.xp, 0);
  assert.equal(r.progress.stats.spellingCorrect, 1);
  assert.equal(r.leveledUp, true);
  assert.equal(r.progress.streak.lastDay, dayString());
});

test('achievement ids are unique and valid for the save format', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]{0,39}$/);
});

test('hydrate repairs partial or missing progress', () => {
  assert.deepEqual(hydrate(null), createProgress());
  const h = hydrate({ xp: 5, settings: { sound: false }, tier: 'nonsense' });
  assert.equal(h.xp, 5);
  assert.equal(h.settings.sound, false);
  assert.equal(h.tier, 'beginner');
  assert.deepEqual(h.start, { beginner: 1, expert: 1, master: 1 });
});
