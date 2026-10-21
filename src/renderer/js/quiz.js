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
  const samePos = allWords.filter((w) => w.word !== word.word && w.pos === word.pos);
  const others = allWords.filter((w) => w.word !== word.word);
  const candidates = [...shuffle(samePos, rng), ...shuffle(others, rng)].map((w) => w.definition);
  const { options, answerIndex } = uniqueOptions(word.definition, candidates, rng, []);
  return { type: 'meaning', word, prompt: `What does "${word.word}" mean?`, options, answerIndex };
}

/**
 * "Pick a synonym/antonym of WORD". The word's own opposites make the best
 * distractors, so they are used first, and anything that would also be a
 * correct answer is excluded.
 */
export function makeRelationQuestion(word, allWords, rng, kind = 'synonym') {
  if (kind !== 'synonym' && kind !== 'antonym') throw new TypeError(`Unknown relation: ${kind}`);
  const answers = kind === 'synonym' ? word.synonyms : word.antonyms;
  const opposites = kind === 'synonym' ? word.antonyms : word.synonyms;
  const correct = pick(answers, rng);
  const fromOthers = shuffle(
    allWords.filter((w) => w.word !== word.word).flatMap((w) => (kind === 'synonym' ? w.synonyms : w.antonyms)),
    rng
  );
  const candidates = [...shuffle(opposites, rng).slice(0, 2), ...fromOthers];
  const exclude = [word.word.toLowerCase(), ...answers.map((a) => a.toLowerCase())];
  const { options, answerIndex } = uniqueOptions(correct, candidates, rng, exclude);
  const label = kind === 'synonym' ? 'similar in meaning to' : 'opposite in meaning to';
  return { type: kind, word, prompt: `Which word is ${label} "${word.word}"?`, options, answerIndex };
}

const BASE_XP = Object.freeze({ learn: 4, meaning: 10, synonym: 10, antonym: 10, spelling: 15 });

/** XP for an answer: base points, a combo bonus, and a penalty for hints. */
export function xpFor(mode, correct, { combo = 0, hintsUsed = 0 } = {}) {
  if (!correct) return 0;
  const base = BASE_XP[mode] ?? 5;
  const multiplier = 1 + Math.min(combo, 10) * 0.1;
  return Math.max(1, Math.round(base * multiplier) - hintsUsed * 3);
}
