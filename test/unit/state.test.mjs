import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  createProgress,
  hydrate,
  levelInfo,
  xpForLevel,
  touchStreak,
  currentStreak,
  recordAnswer,
  summarize,
  ACHIEVEMENTS,
  dayString
} from '../../src/renderer/js/state.js';

const require = createRequire(import.meta.url);
const { sanitizeProgress } = require('../../src/main/progress-schema.js');
const { words } = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));

test('a new player starts at level 1 with nothing learned', () => {
  const p = createProgress();
  assert.equal(levelInfo(p.xp).level, 1);
  assert.deepEqual(summarize(p, words), { total: 500, seen: 0, mastered: 0, learning: 0, accuracy: 0 });
});

test('the renderer and the main-process validator agree on the save format', () => {
  const p = createProgress();
  assert.deepEqual(sanitizeProgress(p), p);
  const played = recordAnswer(p, words, { word: words[0].word, correct: true, mode: 'meaning', xp: 12, now: Date.now() }).progress;
  assert.deepEqual(sanitizeProgress(played), played);
});

test('level thresholds grow steadily', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 60);
  assert.equal(levelInfo(59).level, 1);
  assert.equal(levelInfo(60).level, 2);
  assert.equal(levelInfo(180).level, 3);
  const info = levelInfo(90);
  assert.equal(info.current, 30);
  assert.equal(info.needed, 120);
});

test('streaks continue on consecutive days and reset after a gap', () => {
  let p = createProgress();
  p = touchStreak(p, '2026-03-01');
  p = touchStreak(p, '2026-03-01');
  assert.equal(p.streak.count, 1);
  p = touchStreak(p, '2026-03-02');
  p = touchStreak(p, '2026-03-03');
  assert.equal(p.streak.count, 3);
  assert.equal(currentStreak(p, '2026-03-04'), 3, 'still alive the next day');
  assert.equal(currentStreak(p, '2026-03-05'), 0, 'lost after a missed day');
  p = touchStreak(p, '2026-03-06');
  assert.equal(p.streak.count, 1);
  assert.equal(p.streak.best, 3);
});

test('streaks cross month and year boundaries', () => {
  let p = touchStreak(createProgress(), '2025-12-31');
  p = touchStreak(p, '2026-01-01');
  assert.equal(p.streak.count, 2);
});

test('recording an answer updates stats, xp and unlocks achievements without mutating input', () => {
  const p = createProgress();
  const r = recordAnswer(p, words, { word: 'serene', correct: true, mode: 'spelling', xp: 70 });
  assert.equal(p.xp, 0, 'input untouched');
  assert.equal(r.progress.xp, 70);
  assert.equal(r.progress.stats.answered, 1);
  assert.equal(r.progress.stats.spellingCorrect, 1);
  assert.equal(r.progress.words.serene.box, 1);
  assert.equal(r.leveledUp, true);
  assert.ok(r.unlocked.some((a) => a.id === 'first-word'));
  assert.equal(r.progress.streak.lastDay, dayString());
});

test('study-card answers do not count toward quiz accuracy', () => {
  const r = recordAnswer(createProgress(), words, { word: 'serene', correct: false, mode: 'learn', xp: 2 });
  assert.equal(r.progress.stats.answered, 0);
  assert.equal(r.progress.words.serene.seen, 1);
});

test('achievement ids are unique and valid for the save format', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]{0,39}$/);
});

test('hydrate repairs partial or missing saves', () => {
  assert.deepEqual(hydrate(null), createProgress());
  const h = hydrate({ xp: 5, settings: { sound: false } });
  assert.equal(h.xp, 5);
  assert.equal(h.settings.sound, false);
  assert.equal(h.settings.theme, 'system');
  assert.deepEqual(h.words, {});
});
