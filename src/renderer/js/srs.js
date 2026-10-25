/**
 * Leitner-style spaced repetition. Each word sits in a box 0-5. A correct
 * answer given when the word is due moves it up a box and pushes its next
 * review further out; answering again before it is due does not count twice,
 * so cramming cannot fake long-term mastery. A wrong answer sends it back to
 * the start.
 */
import { shuffle } from './rng.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const BOX_INTERVALS = Object.freeze([0, 10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY]);
export const MAX_BOX = BOX_INTERVALS.length - 1;
export const MASTERED_BOX = 4;

/** Bits recording which kinds of question a word has been answered correctly in. */
export const CHECK = Object.freeze({ meaning: 1, spelling: 2, relation: 4 });
export const ALL_CHECKS = 7;

export function emptyEntry() {
  return { box: 0, seen: 0, correct: 0, wrong: 0, due: 0, last: 0, checks: 0 };
}

export function reviewWord(entry, correct, now = Date.now()) {
  const prev = entry ? { ...emptyEntry(), ...entry } : emptyEntry();
  let box = prev.box;
  let due = prev.due;
  if (!correct) {
    box = 0;
    due = now;
  } else if (prev.seen === 0 || prev.due <= now) {
    box = Math.min(MAX_BOX, prev.box + 1);
    due = now + BOX_INTERVALS[box];
  }
  return {
    ...prev,
    box,
    due,
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    last: now
  };
}

export function addCheck(entry, check) {
  const bit = CHECK[check] || 0;
  return { ...emptyEntry(), ...entry, checks: ((entry && entry.checks) || 0) | bit };
}

export function isLearned(entry) {
  return Boolean(entry && entry.checks === ALL_CHECKS);
}

export function isMasteredEntry(entry) {
  return Boolean(entry && entry.box >= MASTERED_BOX);
}

export function wordStatus(entry) {
  if (!entry || entry.seen === 0) return 'new';
  if (entry.box >= MASTERED_BOX) return 'mastered';
  if (entry.checks === ALL_CHECKS) return 'learned';
  return 'learning';
}

/** True once a word has been tested at least once (reading a card does not count). */
export function isTested(entry) {
  return Boolean(entry && (entry.correct || 0) + (entry.wrong || 0) > 0);
}

export function isDue(entry, now = Date.now()) {
  return isTested(entry) && entry.due <= now;
}

/** Words that have been studied and are due for review, most overdue first. */
export function dueWords(words, progressWords, now = Date.now()) {
  const known = progressWords || {};
  return words.filter((w) => isDue(known[w.word], now)).sort((a, b) => known[a.word].due - known[b.word].due);
}

/**
 * Choose words for a practice game from a pool (usually one tier): overdue
 * reviews first, then words already being learned, then new words in the
 * suggested order, so practice follows the same path as the sets.
 */
export function pickWords(pool, progressWords, { count = 10, now = Date.now(), rng = Math.random } = {}) {
  const known = progressWords || {};
  const due = [];
  const learning = [];
  const fresh = [];
  const later = [];
  for (const w of pool) {
    const entry = known[w.word];
    if (!isTested(entry)) fresh.push(w);
    else if (entry.due <= now) due.push(w);
    else if (entry.box < MASTERED_BOX) learning.push(w);
    else later.push(w);
  }
  due.sort((a, b) => known[a.word].due - known[b.word].due);
  learning.sort((a, b) => known[a.word].box - known[b.word].box || (a.order || 0) - (b.order || 0));
  fresh.sort((a, b) => (a.order || 0) - (b.order || 0));
  later.sort((a, b) => known[a.word].due - known[b.word].due);

  const chosen = [];
  for (const list of [due, learning, fresh, later]) {
    for (const w of list) {
      if (chosen.length >= count) break;
      chosen.push(w);
    }
  }
  return shuffle(chosen, rng);
}
