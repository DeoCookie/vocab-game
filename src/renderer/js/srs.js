/**
 * Leitner-style spaced repetition. Each word sits in a box 0-5; a correct
 * answer moves it up a box and pushes its next review further out, a wrong
 * answer sends it back to the start.
 */
import { shuffle } from './rng.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const BOX_INTERVALS = Object.freeze([0, 10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY]);
export const MAX_BOX = BOX_INTERVALS.length - 1;
export const MASTERED_BOX = 4;

export function emptyEntry() {
  return { box: 0, seen: 0, correct: 0, wrong: 0, due: 0, last: 0 };
}

export function reviewWord(entry, correct, now = Date.now()) {
  const prev = entry ? { ...emptyEntry(), ...entry } : emptyEntry();
  const box = correct ? Math.min(MAX_BOX, prev.box + 1) : 0;
  return {
    box,
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    due: now + BOX_INTERVALS[box],
    last: now
  };
}

export function wordStatus(entry) {
  if (!entry || entry.seen === 0) return 'new';
  if (entry.box >= MASTERED_BOX) return 'mastered';
  return 'learning';
}

export function filterByLevel(words, level) {
  if (level === undefined || level === null || level === 'all') return words;
  const n = Number(level);
  const filtered = words.filter((w) => w.level === n);
  return filtered.length >= 4 ? filtered : words;
}

/**
 * Choose the next words to study: overdue reviews first (most overdue first),
 * then brand-new words (easier levels first), then the weakest words.
 */
export function pickWords(words, progressWords, { count = 10, now = Date.now(), rng = Math.random, level = 'all' } = {}) {
  const pool = filterByLevel(words, level);
  const known = progressWords || {};
  const due = [];
  const fresh = [];
  const later = [];
  for (const w of pool) {
    const entry = known[w.word];
    if (!entry || entry.seen === 0) fresh.push(w);
    else if (entry.due <= now) due.push(w);
    else later.push(w);
  }
  due.sort((a, b) => known[a.word].due - known[b.word].due);
  const freshByLevel = [1, 2, 3].flatMap((lvl) => shuffle(fresh.filter((w) => w.level === lvl), rng));
  later.sort((a, b) => known[a.word].box - known[b.word].box || known[a.word].due - known[b.word].due);

  // Mix a few new words into review-heavy sessions so learners keep growing.
  const newShare = due.length > 0 ? Math.max(2, Math.floor(count * 0.3)) : count;
  const chosen = [];
  const take = (list, n) => {
    for (const w of list) {
      if (chosen.length >= count || n <= 0) break;
      if (!chosen.includes(w)) {
        chosen.push(w);
        n -= 1;
      }
    }
  };
  take(due, count - Math.min(newShare, freshByLevel.length));
  take(freshByLevel, count - chosen.length);
  take(due, count - chosen.length);
  take(later, count - chosen.length);
  return shuffle(chosen, rng);
}
