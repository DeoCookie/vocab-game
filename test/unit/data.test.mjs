import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));
const words = data.words;

test('the vocabulary list has exactly 500 words', () => {
  assert.equal(words.length, 500);
});

test('every word is unique', () => {
  const seen = new Set(words.map((w) => w.word.toLowerCase()));
  assert.equal(seen.size, words.length);
});

test('every entry has a complete, well-formed shape', () => {
  for (const w of words) {
    assert.match(w.word, /^[a-z]+$/, `headword should be lowercase letters: ${w.word}`);
    assert.ok(['noun', 'verb', 'adjective'].includes(w.pos), `part of speech for ${w.word}`);
    assert.ok([1, 2, 3].includes(w.level), `level for ${w.word}`);
    assert.ok(w.definition.length >= 8 && w.definition.length <= 120, `definition length for ${w.word}`);
    assert.ok(w.example.length >= 10 && w.example.length <= 140, `example length for ${w.word}`);
    assert.ok(Array.isArray(w.synonyms) && w.synonyms.length >= 2, `synonyms for ${w.word}`);
    assert.ok(Array.isArray(w.antonyms) && w.antonyms.length >= 1, `antonyms for ${w.word}`);
    for (const r of [...w.synonyms, ...w.antonyms]) assert.match(r, /^[a-z][a-z' -]*[a-z]$/, `relation "${r}" for ${w.word}`);
  }
});

test('no definition gives away its own headword (keeps quizzes fair)', () => {
  for (const w of words) {
    assert.doesNotMatch(w.definition, new RegExp(`\\b${w.word}\\b`, 'i'), w.word);
  }
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

test('all three difficulty levels are well represented', () => {
  for (const level of [1, 2, 3]) {
    assert.ok(words.filter((w) => w.level === level).length >= 100, `level ${level}`);
  }
});

test('the list is sorted alphabetically for the word book', () => {
  const sorted = [...words].sort((a, b) => a.word.localeCompare(b.word));
  assert.deepEqual(words.map((w) => w.word), sorted.map((w) => w.word));
});
