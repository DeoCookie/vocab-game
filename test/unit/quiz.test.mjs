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
  meaningClusters,
  xpFor,
  OPTION_COUNT
} from '../../src/renderer/js/quiz.js';
import { createRng } from '../../src/renderer/js/rng.js';

const { words } = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));
const byWord = new Map(words.map((w) => [w.word, w]));
const related = meaningClusters(words);
const near = (a, b) => (related.get(a) || new Set()).has(b);

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
  const close = checkSpelling('ubiquitus', 'ubiquitous');
  assert.equal(close.correct, false);
  assert.equal(close.close, true);
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

test('meaning questions: four distinct options, one right answer, no near-synonym distractors', () => {
  const rng = createRng(42);
  const defOwner = new Map(words.map((w) => [w.definition, w.word]));
  for (const w of words) {
    const q = makeMeaningQuestion(w, words, rng);
    assert.equal(q.options.length, OPTION_COUNT);
    assert.equal(new Set(q.options).size, OPTION_COUNT);
    assert.equal(q.options[q.answerIndex], w.definition);
    for (const opt of q.options) {
      const owner = defOwner.get(opt);
      if (owner === w.word) continue;
      assert.ok(!near(w.word, owner), `"${owner}" is too close to "${w.word}" to be a distractor`);
      assert.ok(!w.synonyms.some((s) => near(s, owner)), `"${owner}" shares meaning with a synonym of "${w.word}"`);
    }
  }
});

test('synonym and antonym questions have exactly one correct option', () => {
  const rng = createRng(7);
  for (const w of words) {
    for (const kind of ['synonym', 'antonym']) {
      const q = makeRelationQuestion(w, words, rng, kind);
      const answers = q.type === 'synonym' ? w.synonyms : w.antonyms;
      assert.equal(q.options.length, OPTION_COUNT, `${w.word} ${kind}`);
      assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, OPTION_COUNT);
      assert.ok(answers.includes(q.options[q.answerIndex]));
      const wrong = q.options.filter((_, i) => i !== q.answerIndex);
      for (const o of wrong) {
        assert.ok(!answers.includes(o), `${w.word} ${kind}: second answer ${o}`);
        assert.ok(!answers.some((a) => near(a, o)), `${w.word} ${kind}: "${o}" is close in meaning to an answer`);
      }
      assert.ok(!q.options.includes(w.word));
    }
  }
});

test('asking for an antonym of a word without one gives a synonym question', () => {
  const w = words.find((x) => x.antonyms.length === 0);
  assert.ok(w);
  const q = makeRelationQuestion(w, words, createRng(1), 'antonym');
  assert.equal(q.type, 'synonym');
  assert.ok(w.synonyms.includes(q.options[q.answerIndex]));
});

test('meaning clusters group headwords with their synonyms', () => {
  assert.ok(near('abundant', 'plentiful'));
  assert.ok(byWord.get('abundant').synonyms.every((s) => near('abundant', s)));
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
