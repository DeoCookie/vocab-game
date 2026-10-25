import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildData } from '../../src/renderer/js/data.js';
import { setStatus, suggestedSet, lessonStages, setEvents, tierSummary, placementWords, placementStart, placementResult, SET_BONUS } from '../../src/renderer/js/sets.js';
import { createProgress } from '../../src/renderer/js/state.js';
import { createRng } from '../../src/renderer/js/rng.js';

const wordDoc = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));
const glossDoc = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/glosses.json', import.meta.url), 'utf8'));
const data = buildData(wordDoc, glossDoc);
const NOW = 1_700_000_000_000;

function learn(progress, words, { box = 1 } = {}) {
  for (const w of words) progress.words[w.word] = { box, seen: 3, correct: 3, wrong: 0, due: NOW + 1e9, last: NOW, checks: 7 };
  return progress;
}

test('a new set is "new", a touched set "started", a finished set "learned" then "mastered"', () => {
  const words = data.setWords('beginner', 3);
  const p = createProgress();
  assert.equal(setStatus(p, words).state, 'new');
  p.words[words[0].word] = { box: 0, seen: 1, correct: 0, wrong: 0, due: 0, last: 0, checks: 0 };
  assert.equal(setStatus(p, words).state, 'started');
  learn(p, words);
  assert.equal(setStatus(p, words).state, 'learned');
  learn(p, words, { box: 4 });
  assert.equal(setStatus(p, words).state, 'mastered');
});

test('the suggested set is the first unfinished set from the starting point', () => {
  const p = createProgress();
  assert.equal(suggestedSet(p, data, 'beginner'), 1);
  learn(p, data.setWords('beginner', 1));
  assert.equal(suggestedSet(p, data, 'beginner'), 2);
  p.start.beginner = 20;
  assert.equal(suggestedSet(p, data, 'beginner'), 20);
  for (let n = 20; n <= 50; n += 1) learn(p, data.setWords('beginner', n));
  assert.equal(suggestedSet(p, data, 'beginner'), 2, 'wraps around to earlier unfinished sets');
  for (let n = 1; n <= 50; n += 1) learn(p, data.setWords('beginner', n));
  assert.equal(suggestedSet(p, data, 'beginner'), null);
  assert.equal(tierSummary(p, data, 'beginner').learnedSets, 50);
});

test('a lesson only asks what each word still needs', () => {
  const words = data.setWords('expert', 1);
  const p = createProgress();
  let stages = lessonStages(p, words, createRng(1));
  assert.deepEqual(stages.map((s) => s.id), ['cards', 'meaning', 'spelling', 'relation']);
  assert.ok(stages.every((s) => s.tasks.length === 10));
  p.words[words[0].word] = { box: 1, seen: 2, correct: 2, wrong: 0, due: 0, last: 0, checks: 1 | 2 };
  stages = lessonStages(p, words, createRng(1));
  assert.equal(stages.find((s) => s.id === 'meaning').tasks.length, 9);
  assert.equal(stages.find((s) => s.id === 'relation').tasks.length, 10);
  learn(p, words);
  assert.deepEqual(lessonStages(p, words, createRng(1)), []);
});

test('relation tasks never ask for an antonym the word does not have', () => {
  const master = data.byTier.master.filter((w) => w.antonyms.length === 0);
  assert.ok(master.length > 0);
  for (const w of master) {
    const n = data.setNumber(w);
    const stages = lessonStages(createProgress(), data.setWords('master', n), createRng(n));
    const task = stages.find((s) => s.id === 'relation').tasks.find((t) => t.word.word === w.word);
    assert.equal(task.kind, 'synonym', w.word);
  }
});

test('set bonuses are reported exactly once', () => {
  const words = data.setWords('master', 2);
  const p = createProgress();
  learn(p, words);
  const first = setEvents(p, data, words[0], NOW);
  assert.deepEqual(first.events.map((e) => e.type), ['learned']);
  assert.equal(first.events[0].xp, SET_BONUS.learned.master);
  p.sets[first.key] = first.record;
  assert.deepEqual(setEvents(p, data, words[0], NOW).events, []);
  learn(p, words, { box: 4 });
  const later = setEvents(p, data, words[5], NOW);
  assert.deepEqual(later.events.map((e) => e.type), ['mastered']);
});

test('placement draws one word from every fifth set, getting harder', () => {
  const picked = placementWords(data, 'beginner', createRng(4));
  assert.equal(picked.length, 10);
  picked.forEach((w, i) => assert.equal(data.setNumber(w), (i + 1) * 5));
});

test('placement result moves up a tier only after 8 or more correct', () => {
  assert.equal(placementStart(0), 1);
  assert.equal(placementStart(2), 1);
  assert.equal(placementStart(5), 16);
  assert.equal(placementStart(10), 41);
  assert.deepEqual(placementResult({ beginner: 4 }), { tier: 'beginner', start: 11 });
  assert.deepEqual(placementResult({ beginner: 9, expert: 3 }), { tier: 'expert', start: 6 });
  assert.deepEqual(placementResult({ beginner: 10, expert: 8, master: 1 }), { tier: 'master', start: 1 });
  assert.deepEqual(placementResult({ beginner: 10, expert: 10, master: 10 }), { tier: 'master', start: 41 });
});
