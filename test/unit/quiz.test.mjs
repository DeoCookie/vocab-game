import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeAnswer,
  levenshtein,
  checkSpelling,
  compareLetters,
  hintPattern,
  makeMeaningQuestion,
  makeRelationQuestion,
  xpFor,
  OPTION_COUNT
} from '../../src/renderer/js/quiz.js';
import { createRng } from '../../src/renderer/js/rng.js';

const { words } = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));

test('answers are normalised before comparing', () => {
  assert.equal(normalizeAnswer('  Serene! '), 'serene');
  assert.equal(normalizeAnswer('ＡＢＣ'), 'abc');
  assert.equal(normalizeAnswer(null), '');
});

test('levenshtein distance', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('same', 'same'), 0);
});

test('spelling checks accept exact answers and flag near misses', () => {
  assert.equal(checkSpelling('Ubiquitous', 'ubiquitous').correct, true);
  const near = checkSpelling('ubiquitus', 'ubiquitous');
  assert.equal(near.correct, false);
  assert.equal(near.close, true);
  assert.equal(checkSpelling('', 'ubiquitous').correct, false);
  assert.equal(checkSpelling('banana', 'ubiquitous').close, false);
});

test('letter comparison and hint pattern', () => {
  assert.deepEqual(
    compareLetters('cst', 'cat').map((t) => t.ok),
    [true, false, true]
  );
  assert.equal(hintPattern('serene', 2), 's e _ _ _ _');
});

test('meaning questions always have four distinct options with exactly one right answer', () => {
  const rng = createRng(42);
  for (const w of words) {
    const q = makeMeaningQuestion(w, words, rng);
    assert.equal(q.options.length, OPTION_COUNT);
    assert.equal(new Set(q.options).size, OPTION_COUNT);
    assert.equal(q.options[q.answerIndex], w.definition);
    assert.equal(q.options.filter((o) => o === w.definition).length, 1);
  }
});

test('synonym and antonym questions never include a second correct answer', () => {
  const rng = createRng(7);
  for (const w of words) {
    for (const kind of ['synonym', 'antonym']) {
      const q = makeRelationQuestion(w, words, rng, kind);
      const answers = kind === 'synonym' ? w.synonyms : w.antonyms;
      assert.equal(q.options.length, OPTION_COUNT, `${w.word} ${kind}`);
      assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, OPTION_COUNT);
      assert.ok(answers.includes(q.options[q.answerIndex]));
      const correctCount = q.options.filter((o) => answers.includes(o)).length;
      assert.equal(correctCount, 1, `${w.word} ${kind}: ${q.options.join(', ')}`);
      assert.ok(!q.options.includes(w.word));
    }
  }
});

test('unknown relation kinds are rejected', () => {
  assert.throws(() => makeRelationQuestion(words[0], words, createRng(1), 'hyponym'), TypeError);
});

test('xp rewards combos and penalises hints, never negative', () => {
  assert.equal(xpFor('meaning', false), 0);
  assert.equal(xpFor('meaning', true), 10);
  assert.ok(xpFor('meaning', true, { combo: 5 }) > 10);
  assert.ok(xpFor('spelling', true, { hintsUsed: 2 }) < 15);
  assert.equal(xpFor('spelling', true, { hintsUsed: 50 }), 1);
});

test('seeded random numbers are reproducible', () => {
  const a = createRng(99);
  const b = createRng(99);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
});
