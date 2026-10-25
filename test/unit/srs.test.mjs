import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewWord, wordStatus, pickWords, dueWords, addCheck, isLearned, isDue, BOX_INTERVALS, MAX_BOX } from '../../src/renderer/js/srs.js';
import { createRng } from '../../src/renderer/js/rng.js';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const make = (n, offset = 0) => Array.from({ length: n }, (_, i) => ({ word: `w${i + offset}`, order: i + offset + 1 }));

test('a first correct answer moves a word up one box and schedules it', () => {
  const e = reviewWord(undefined, true, NOW);
  assert.equal(e.box, 1);
  assert.equal(e.due, NOW + BOX_INTERVALS[1]);
  assert.equal(e.seen, 1);
  assert.equal(e.correct, 1);
});

test('answering again before a word is due does not advance it (no cramming)', () => {
  let e = reviewWord(undefined, true, NOW);
  e = reviewWord(e, true, NOW + 1000);
  e = reviewWord(e, true, NOW + 2000);
  assert.equal(e.box, 1);
  assert.equal(e.correct, 3);
});

test('correct answers on schedule climb to mastery over days', () => {
  let e = reviewWord(undefined, true, NOW);
  let t = NOW;
  for (let i = 0; i < 3; i += 1) {
    t = e.due;
    e = reviewWord(e, true, t);
  }
  assert.equal(e.box, 4);
  assert.equal(wordStatus(e), 'mastered');
  assert.ok(t - NOW >= 4 * DAY - 1, 'mastery takes at least four days');
});

test('a wrong answer sends the word back to the first box', () => {
  const e = reviewWord({ box: 4, seen: 6, correct: 5, wrong: 1, due: 0, last: 0, checks: 7 }, false, NOW);
  assert.equal(e.box, 0);
  assert.equal(e.wrong, 2);
  assert.equal(e.due, NOW);
  assert.equal(e.checks, 7, 'learned checks are kept');
});

test('boxes never go past the top', () => {
  let e;
  let t = NOW;
  for (let i = 0; i < 20; i += 1) {
    e = reviewWord(e, true, t);
    t = e.due;
  }
  assert.equal(e.box, MAX_BOX);
});

test('checks record meaning, spelling and synonym/antonym separately', () => {
  let e = addCheck(undefined, 'meaning');
  assert.equal(isLearned(e), false);
  e = addCheck(e, 'spelling');
  e = addCheck(e, 'relation');
  assert.equal(isLearned(e), true);
  assert.equal(wordStatus({ ...e, seen: 3, box: 1 }), 'learned');
});

test('only tested words are due; reading a card is not a test', () => {
  assert.equal(isDue({ seen: 1, correct: 0, wrong: 0, due: 0 }, NOW), false);
  assert.equal(isDue({ seen: 1, correct: 1, wrong: 0, due: NOW - 1 }, NOW), true);
  const words = make(3);
  const progress = { w0: { seen: 2, correct: 1, wrong: 1, due: NOW - 10, box: 0 }, w1: { seen: 1, correct: 0, wrong: 0, due: 0, box: 0 } };
  assert.deepEqual(dueWords(words, progress, NOW).map((w) => w.word), ['w0']);
});

test('practice picks due words first, then words in progress, then new words in order', () => {
  const words = make(30);
  const progress = {
    w5: { box: 2, seen: 2, correct: 2, wrong: 0, due: NOW - 1000 },
    w6: { box: 1, seen: 2, correct: 2, wrong: 0, due: NOW + 99999 },
    w7: { box: 5, seen: 9, correct: 9, wrong: 0, due: NOW + 99999 }
  };
  const picked = pickWords(words, progress, { count: 5, now: NOW, rng: createRng(1) }).map((w) => w.word).sort();
  assert.deepEqual(picked, ['w0', 'w1', 'w2', 'w5', 'w6'].sort());
});
