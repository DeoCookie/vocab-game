/** Question generators and answer checking. Pure functions, no DOM. */
import { pick, shuffle } from './rng.js';

export const OPTION_COUNT = 4;

export function normalizeAnswer(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z'-]/g, '');
}

export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[t.length];
}

export function checkSpelling(input, target) {
  const given = normalizeAnswer(input);
  const expected = normalizeAnswer(target);
  const distance = levenshtein(given, expected);
  return {
    correct: given.length > 0 && distance === 0,
    close: given.length > 0 && distance > 0 && distance <= Math.max(1, Math.floor(expected.length / 5)),
    distance,
    given
  };
}

/** Letter-by-letter comparison used to colour spelling tiles. */
export function compareLetters(input, target) {
  const given = normalizeAnswer(input);
  const expected = normalizeAnswer(target);
  return Array.from(expected, (ch, i) => ({ letter: ch, ok: given[i] === ch }));
}

/** Pattern like "a _ _ _ _ _" with the first `revealed` letters shown. */
export function hintPattern(word, revealed = 0) {
  return Array.from(word, (ch, i) => (i < revealed ? ch : '_')).join(' ');
}

/* ---------- Meaning clusters ----------
 * Words that appear together in any synonym list (or together as antonyms of
 * the same word) are treated as close in meaning. Distractors are never drawn
 * from a target's cluster, so a question can never have two right answers. */

const clusterCache = new WeakMap();

export function meaningClusters(allWords) {
  if (clusterCache.has(allWords)) return clusterCache.get(allWords);
  const related = new Map();
  const link = (group) => {
    for (const a of group) {
      if (!related.has(a)) related.set(a, new Set());
      for (const b of group) related.get(a).add(b);
    }
  };
  for (const w of allWords) {
    link([w.word, ...w.synonyms]);
    if (w.antonyms.length) link(w.antonyms);
  }
  clusterCache.set(allWords, related);
  return related;
}

/** Everything close in meaning to any of `terms` (one hop through the clusters). */
function closeTo(related, terms) {
  const out = new Set();
  for (const t of terms) {
    out.add(t.toLowerCase());
    for (const r of related.get(t) || []) out.add(r.toLowerCase());
  }
  return out;
}

function uniqueOptions(correct, candidates, rng, exclude) {
  const seen = new Set([correct.toLowerCase(), ...exclude]);
  const picked = [];
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(c);
    if (picked.length >= OPTION_COUNT - 1) break;
  }
  const options = shuffle([correct, ...picked], rng);
  return { options, answerIndex: options.indexOf(correct) };
}

/** "What does WORD mean?" with four definitions. */
export function makeMeaningQuestion(word, allWords, rng) {
  const related = meaningClusters(allWords);
  const near = closeTo(related, [word.word, ...word.synonyms]);
  const allowed = (w) => w.word !== word.word && !near.has(w.word) && !w.synonyms.some((s) => near.has(s));
  const samePos = allWords.filter((w) => w.pos === word.pos && allowed(w));
  const others = allWords.filter((w) => w.pos !== word.pos && allowed(w));
  const candidates = [...shuffle(samePos, rng), ...shuffle(others, rng)].map((w) => w.definition);
  const { options, answerIndex } = uniqueOptions(word.definition, candidates, rng, []);
  return { type: 'meaning', word, prompt: `What does "${word.word}" mean?`, options, answerIndex };
}

/**
 * "Pick a synonym/antonym of WORD". The word's own opposites make the best
 * distractors, so they are used first. Anything close in meaning to a correct
 * answer is excluded. Words with no antonym always get a synonym question.
 */
export function makeRelationQuestion(word, allWords, rng, kind = 'synonym') {
  if (kind !== 'synonym' && kind !== 'antonym') throw new TypeError(`Unknown relation: ${kind}`);
  const actual = kind === 'antonym' && word.antonyms.length === 0 ? 'synonym' : kind;
  const answers = actual === 'synonym' ? word.synonyms : word.antonyms;
  const opposites = actual === 'synonym' ? word.antonyms : word.synonyms;
  const correct = pick(answers, rng);
  const related = meaningClusters(allWords);
  const exclude = closeTo(related, actual === 'synonym' ? [word.word, ...answers] : answers);
  if (actual === 'antonym') exclude.add(word.word.toLowerCase());
  const fromOthers = shuffle(
    allWords.filter((w) => w.word !== word.word).flatMap((w) => (actual === 'synonym' ? w.synonyms : w.antonyms)),
    rng
  );
  const candidates = [...shuffle(opposites, rng).slice(0, 2), ...fromOthers];
  const { options, answerIndex } = uniqueOptions(correct, candidates, rng, [...exclude]);
  const label = actual === 'synonym' ? 'similar in meaning to' : 'opposite in meaning to';
  return { type: actual, word, prompt: `Which word is ${label} "${word.word}"?`, options, answerIndex };
}

const BASE_XP = Object.freeze({ learn: 4, card: 2, meaning: 10, synonym: 10, antonym: 10, relation: 10, spelling: 15 });

/** XP for an answer: base points, a combo bonus, and a penalty for hints. */
export function xpFor(mode, correct, { combo = 0, hintsUsed = 0 } = {}) {
  if (!correct) return 0;
  const base = BASE_XP[mode] ?? 5;
  const multiplier = 1 + Math.min(combo, 10) * 0.1;
  return Math.max(1, Math.round(base * multiplier) - hintsUsed * 3);
}
