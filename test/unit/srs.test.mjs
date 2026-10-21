import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewWord, wordStatus, pickWords, filterByLevel, BOX_INTERVALS, MAX_BOX } from '../../src/renderer/js/srs.js';
import { createRng } from '../../src/renderer/js/rng.js';

const NOW = 1_700_000_000_000;
const make = (n, level = 1) => Array.from({ length: n }, (_, i) => ({ word: `w${level}x${i}`, level }));

test('a correct answer moves a word up one box and schedules it later', () => {
  const e = reviewWord(undefined, true, NOW);
  assert.equal(e.box, 1);
  assert.equal(e.due, NOW + BOX_INTERVALS[1]);
  assert.equal(e.seen, 1);
  assert.equal(e.correct, 1);
});

test('a wrong answer sends the word back to the first box', () => {
  const e = reviewWord({ box: 4, seen: 6, correct: 5, wrong: 1, due: 0, last: 0 }, false, NOW);
  assert.equal(e.box, 0);
  assert.equal(e.wrong, 2);
  assert.equal(e.due, NOW);
});

test('boxes never go past the top', () => {
  let e;
  for (let i = 0; i < 20; i += 1) e = reviewWord(e, true, NOW);
  assert.equal(e.box, MAX_BOX);
});

test('word status follows the box', () => {
  assert.equal(wordStatus(undefined), 'new');
  assert.equal(wordStatus({ seen: 1, box: 1 }), 'learning');
  assert.equal(wordStatus({ seen: 9, box: 4 }), 'mastered');
});

test('overdue words are picked before new ones, and new words fill the rest', () => {
  const words = make(30);
  const progress = {
    [words[0].word]: { box: 2, seen: 2, correct: 2, wrong: 0, due: NOW - 1000, last: 0 },
    [words[1].word]: { box: 2, seen: 2, correct: 2, wrong: 0, due: NOW + 99999, last: 0 }
  };
  const picked = pickWords(words, progress, { count: 10, now: NOW, rng: createRng(1) });
  assert.equal(picked.length, 10);
  assert.ok(picked.some((w) => w.word === words[0].word), 'due word included');
  assert.ok(!picked.some((w) => w.word === words[1].word), 'not-yet-due word skipped while new words remain');
  assert.equal(new Set(picked).size, 10, 'no duplicates');
});

test('when everything has been seen, the weakest words come back', () => {
  const words = make(12);
  const progress = Object.fromEntries(words.map((w, i) => [w.word, { box: i % 5, seen: 1, correct: 0, wrong: 0, due: NOW + 1e9, last: 0 }]));
  const picked = pickWords(words, progress, { count: 5, now: NOW, rng: createRng(2) });
  assert.equal(picked.length, 5);
  assert.ok(picked.every((w) => progress[w.word].box <= 1));
});

test('new words are introduced easiest level first', () => {
  const words = [...make(20, 3), ...make(20, 1)];
  const picked = pickWords(words, {}, { count: 10, now: NOW, rng: createRng(3) });
  assert.ok(picked.every((w) => w.level === 1));
});

test('level filter limits the pool but never empties it', () => {
  const words = [...make(10, 1), ...make(2, 2)];
  assert.equal(filterByLevel(words, '1').length, 10);
  assert.equal(filterByLevel(words, '2').length, 12, 'falls back to all words when too few');
  assert.equal(filterByLevel(words, 'all').length, 12);
});
