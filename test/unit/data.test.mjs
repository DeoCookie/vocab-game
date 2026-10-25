import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildData } from '../../src/renderer/js/data.js';

const wordDoc = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));
const glossDoc = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/glosses.json', import.meta.url), 'utf8'));
const words = wordDoc.words;
const TIERS = ['beginner', 'expert', 'master'];

test('there are 1,500 words: 500 in each of Beginner, Expert and Master', () => {
  assert.equal(words.length, 1500);
  assert.deepEqual(wordDoc.tiers.map((t) => t.id), TIERS);
  for (const t of TIERS) assert.equal(words.filter((w) => w.tier === t).length, 500, t);
});

test('every word, definition and example is unique', () => {
  assert.equal(new Set(words.map((w) => w.word.toLowerCase())).size, words.length);
  assert.equal(new Set(words.map((w) => w.definition.toLowerCase())).size, words.length, 'two words share a definition');
  assert.equal(new Set(words.map((w) => w.example.toLowerCase())).size, words.length, 'two words share an example');
});

test('each tier is numbered 1 to 500 in suggested order, forming 50 sets of 10', () => {
  const data = buildData(wordDoc, glossDoc);
  for (const t of TIERS) {
    const orders = words.filter((w) => w.tier === t).map((w) => w.order).sort((a, b) => a - b);
    assert.deepEqual(orders, Array.from({ length: 500 }, (_, i) => i + 1), t);
    for (let n = 1; n <= 50; n += 1) assert.equal(data.setWords(t, n).length, 10, `${t} set ${n}`);
  }
});

test('every entry has a complete, well-formed shape', () => {
  for (const w of words) {
    assert.match(w.word, /^[a-z]+$/, `headword should be lowercase letters: ${w.word}`);
    assert.ok(['noun', 'verb', 'adjective', 'adverb'].includes(w.pos), `part of speech for ${w.word}`);
    assert.ok(w.definition.length >= 8 && w.definition.length <= 120, `definition length for ${w.word}`);
    assert.ok(w.example.length >= 10 && w.example.length <= 140, `example length for ${w.word}`);
    assert.ok(Array.isArray(w.synonyms) && w.synonyms.length >= 2, `synonyms for ${w.word}`);
    assert.ok(Array.isArray(w.antonyms), `antonyms for ${w.word}`);
    for (const r of [...w.synonyms, ...w.antonyms]) assert.match(r, /^[a-z][a-z' -]*[a-z]$/, `relation "${r}" for ${w.word}`);
  }
});

test('Beginner and Expert words always have antonyms; only some Master words may not', () => {
  for (const w of words) {
    if (w.tier !== 'master') assert.ok(w.antonyms.length >= 1, `${w.word} (${w.tier}) needs an antonym`);
  }
  const without = words.filter((w) => w.antonyms.length === 0).length;
  assert.ok(without <= 50, `too many words without antonyms: ${without}`);
});

test('no definition gives away its own headword (keeps quizzes fair)', () => {
  for (const w of words) assert.doesNotMatch(w.definition, new RegExp(`\\b${w.word}\\b`, 'i'), w.word);
});

test('each example sentence uses the word', () => {
  for (const w of words) {
    const stem = w.word.length <= 4 ? w.word : w.word.slice(0, Math.max(4, w.word.length - 2));
    assert.ok(w.example.toLowerCase().includes(stem), `example for ${w.word}`);
  }
});

test('synonyms and antonyms never overlap or repeat the word itself', () => {
  for (const w of words) {
    const syn = new Set(w.synonyms);
    assert.equal(syn.size, w.synonyms.length, `duplicate synonym in ${w.word}`);
    assert.equal(new Set(w.antonyms).size, w.antonyms.length, `duplicate antonym in ${w.word}`);
    for (const a of w.antonyms) assert.ok(!syn.has(a), `"${a}" is both synonym and antonym of ${w.word}`);
    assert.ok(!syn.has(w.word) && !w.antonyms.includes(w.word), `self reference in ${w.word}`);
  }
});

test('every synonym and antonym has a definition to show on hover', () => {
  const data = buildData(wordDoc, glossDoc);
  const missing = [];
  for (const w of words) for (const r of [...w.synonyms, ...w.antonyms]) if (!data.gloss(r)) missing.push(`${w.word}: ${r}`);
  assert.deepEqual(missing, []);
});

test('hover definitions are short, unique and only for words that are used', () => {
  const used = new Set(words.flatMap((w) => [...w.synonyms, ...w.antonyms]));
  for (const [term, gloss] of Object.entries(glossDoc.glosses)) {
    assert.ok(used.has(term), `unused gloss: ${term}`);
    assert.ok(gloss.length >= 3 && gloss.length <= 80, `gloss length for ${term}`);
    assert.doesNotMatch(gloss, new RegExp(`\\b${term.replace(/[^a-z]/g, '.')}\\b`, 'i'), `gloss for ${term} uses the word itself`);
  }
});

test('buildData rejects an empty word list', () => {
  assert.throws(() => buildData({ words: [] }, {}), /empty/);
});
