/** Sets of ten words: progress, the suggested next set, lessons and placement. Pure functions. */
import { SET_SIZE, SETS_PER_TIER } from './data.js';
import { CHECK, isLearned, isMasteredEntry } from './srs.js';
import { shuffle } from './rng.js';

export { SET_SIZE, SETS_PER_TIER };

export function setKey(tier, number) {
  return `${tier}-${number}`;
}

export function setNumberOf(word) {
  return Math.ceil(word.order / SET_SIZE);
}

/** Learned and mastered counts for the ten words of a set. */
export function setStatus(progress, setWords) {
  let learned = 0;
  let mastered = 0;
  let seen = 0;
  for (const w of setWords) {
    const e = progress.words[w.word];
    if (e && e.seen > 0) seen += 1;
    if (isLearned(e)) learned += 1;
    if (isMasteredEntry(e) && isLearned(e)) mastered += 1;
  }
  const total = setWords.length;
  let state = 'new';
  if (total > 0 && mastered === total) state = 'mastered';
  else if (total > 0 && learned === total) state = 'learned';
  else if (seen > 0) state = 'started';
  return { learned, mastered, seen, total, state };
}

/**
 * The set we suggest next in a tier: the first unfinished set at or after the
 * player's starting point, otherwise the first unfinished set anywhere.
 * Returns null when every set in the tier has been learned.
 */
export function suggestedSet(progress, data, tier) {
  const start = (progress.start && progress.start[tier]) || 1;
  const order = [];
  for (let n = start; n <= SETS_PER_TIER; n += 1) order.push(n);
  for (let n = 1; n < start; n += 1) order.push(n);
  for (const n of order) {
    const st = setStatus(progress, data.setWords(tier, n));
    if (st.state === 'new' || st.state === 'started') return n;
  }
  return null;
}

export function tierSummary(progress, data, tier) {
  let learnedSets = 0;
  let masteredSets = 0;
  for (let n = 1; n <= SETS_PER_TIER; n += 1) {
    const st = setStatus(progress, data.setWords(tier, n));
    if (st.state === 'learned' || st.state === 'mastered') learnedSets += 1;
    if (st.state === 'mastered') masteredSets += 1;
  }
  return { learnedSets, masteredSets, totalSets: SETS_PER_TIER };
}

/**
 * Build the stages of a set lesson. Only the checks a word still needs are
 * asked, so returning to a half-finished set picks up where you left off.
 */
export function lessonStages(progress, setWords, rng = Math.random) {
  const need = (w, check) => !(((progress.words[w.word] || {}).checks || 0) & CHECK[check]);
  const unlearned = setWords.filter((w) => !isLearned(progress.words[w.word]));
  const stages = [
    { id: 'cards', title: 'Meet the words', tasks: unlearned.map((w) => ({ type: 'card', word: w })) },
    { id: 'meaning', title: 'Match the meaning', tasks: shuffle(setWords.filter((w) => need(w, 'meaning')), rng).map((w) => ({ type: 'meaning', word: w })) },
    { id: 'spelling', title: 'Spell it', tasks: shuffle(setWords.filter((w) => need(w, 'spelling')), rng).map((w) => ({ type: 'spelling', word: w })) },
    {
      id: 'relation',
      title: 'Synonyms and antonyms',
      tasks: shuffle(setWords.filter((w) => need(w, 'relation')), rng).map((w) => ({
        type: 'relation',
        word: w,
        kind: w.antonyms.length && rng() < 0.5 ? 'antonym' : 'synonym'
      }))
    }
  ];
  return stages.filter((s) => s.tasks.length > 0);
}

/** XP bonus for finishing a set, larger for harder tiers. */
export const SET_BONUS = Object.freeze({
  learned: { beginner: 50, expert: 75, master: 100 },
  mastered: { beginner: 75, expert: 110, master: 150 }
});

/**
 * Compare set states before and after an answer and report newly learned or
 * mastered sets, so the caller can award bonuses exactly once.
 */
export function setEvents(progress, data, word, now = Date.now()) {
  const tier = word.tier;
  const number = setNumberOf(word);
  const key = setKey(tier, number);
  const record = progress.sets[key] || { learned: 0, mastered: 0 };
  const st = setStatus(progress, data.setWords(tier, number));
  const events = [];
  const next = { ...record };
  if (!record.learned && (st.state === 'learned' || st.state === 'mastered')) {
    next.learned = now;
    events.push({ type: 'learned', tier, number, xp: SET_BONUS.learned[tier] || 50 });
  }
  if (!record.mastered && st.state === 'mastered') {
    next.mastered = now;
    events.push({ type: 'mastered', tier, number, xp: SET_BONUS.mastered[tier] || 75 });
  }
  return { key, record: next, events };
}

/* ---------- Placement quiz ---------- */

export const PLACEMENT_PER_TIER = 10;
export const PLACEMENT_PASS = 8;

/** One word from each fifth set (5, 10, ... 50), so questions grow harder. */
export function placementWords(data, tier, rng = Math.random) {
  const out = [];
  for (let n = 5; n <= SETS_PER_TIER; n += 5) {
    const pool = data.setWords(tier, n);
    if (pool.length) out.push(pool[Math.floor(rng() * pool.length)]);
  }
  return out;
}

/** Suggested starting set within a tier, from the number answered correctly out of ten. */
export function placementStart(correct) {
  if (correct <= 2) return 1;
  return Math.min(SETS_PER_TIER, 5 * (correct - 2) + 1);
}

/**
 * Decide where to start after the placement quiz. `scores` maps each tier
 * attempted to its number correct (tiers are attempted in order and the quiz
 * stops at the first tier not passed).
 */
export function placementResult(scores) {
  const tiers = ['beginner', 'expert', 'master'];
  for (const t of tiers) {
    if (!(t in scores)) break;
    if (scores[t] < PLACEMENT_PASS || t === 'master') return { tier: t, start: placementStart(scores[t]) };
  }
  const attempted = tiers.filter((t) => t in scores);
  const last = attempted[attempted.length - 1] || 'beginner';
  return { tier: last, start: placementStart(scores[last] || 0) };
}
