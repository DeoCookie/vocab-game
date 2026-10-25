/** Player progress, profiles, XP, streaks and achievements. Pure functions, no DOM. */
import { reviewWord, addCheck, wordStatus, MASTERED_BOX } from './srs.js';
import { setEvents, tierSummary } from './sets.js';
import { TIER_IDS } from './data.js';

export const SCHEMA_VERSION = 2;
export const MAX_PROFILES = 8;
export const PROFILE_COLORS = Object.freeze(['navy', 'teal', 'plum', 'rust', 'olive', 'slate']);
export const NAME_MAX = 24;

export function defaultSettings() {
  return { voiceURI: null, rate: 0.9, sound: true, theme: 'system' };
}

export function createProgress() {
  return {
    xp: 0,
    streak: { count: 0, best: 0, lastDay: null },
    words: {},
    stats: { answered: 0, correct: 0, spellingCorrect: 0, sprintBest: 0, sessions: 0 },
    achievements: [],
    settings: defaultSettings(),
    tier: 'beginner',
    start: { beginner: 1, expert: 1, master: 1 },
    sets: {},
    placementDone: false
  };
}

/** Fill in anything missing from an older or partial progress object. */
export function hydrate(saved) {
  const base = createProgress();
  if (!saved || typeof saved !== 'object') return base;
  const settings = { ...base.settings, ...(saved.settings || {}) };
  delete settings.level;
  const out = {
    ...base,
    ...saved,
    streak: { ...base.streak, ...(saved.streak || {}) },
    stats: { ...base.stats, ...(saved.stats || {}) },
    settings,
    words: { ...(saved.words || {}) },
    achievements: Array.isArray(saved.achievements) ? [...saved.achievements] : [],
    start: { ...base.start, ...(saved.start || {}) },
    sets: { ...(saved.sets || {}) },
    tier: TIER_IDS.includes(saved.tier) ? saved.tier : 'beginner'
  };
  delete out.version;
  return out;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ---------- Save document and profiles ---------- */

export function sanitizeName(value) {
  if (typeof value !== 'string') return 'Player';
  const cleaned = value
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- deliberately removing control characters
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, NAME_MAX).join('').trim() || 'Player';
}

function nextProfileId(doc) {
  let n = doc.profiles.length + 1;
  const ids = new Set(doc.profiles.map((p) => p.id));
  while (ids.has(`p${n}`)) n += 1;
  return `p${n}`;
}

export function createDocument() {
  return { version: SCHEMA_VERSION, activeProfileId: null, profiles: [] };
}

/**
 * Turn whatever was saved into a version 2 document. A version 1 save (one
 * player's progress at the top level) becomes a profile called "Player 1".
 */
export function hydrateDocument(saved) {
  if (saved && typeof saved === 'object' && !Array.isArray(saved.profiles) && (saved.words || 'xp' in saved)) {
    const progress = hydrate(saved);
    for (const [k, e] of Object.entries(progress.words)) {
      if (e && e.box >= MASTERED_BOX) progress.words[k] = { ...e, checks: 7 };
    }
    return {
      version: SCHEMA_VERSION,
      activeProfileId: 'p1',
      profiles: [{ id: 'p1', name: 'Player 1', color: 'navy', createdAt: 0, progress }]
    };
  }
  const doc = createDocument();
  if (saved && Array.isArray(saved.profiles)) {
    for (const p of saved.profiles.slice(0, MAX_PROFILES)) {
      if (!p || typeof p !== 'object') continue;
      doc.profiles.push({
        id: typeof p.id === 'string' ? p.id : nextProfileId(doc),
        name: sanitizeName(p.name),
        color: PROFILE_COLORS.includes(p.color) ? p.color : PROFILE_COLORS[doc.profiles.length % PROFILE_COLORS.length],
        createdAt: Number(p.createdAt) || 0,
        progress: hydrate(p.progress)
      });
    }
  }
  const active = saved && doc.profiles.some((p) => p.id === saved.activeProfileId) ? saved.activeProfileId : null;
  doc.activeProfileId = active || (doc.profiles[0] ? doc.profiles[0].id : null);
  return doc;
}

export function addProfile(doc, { name, color } = {}, now = Date.now()) {
  if (doc.profiles.length >= MAX_PROFILES) throw new RangeError(`You can have up to ${MAX_PROFILES} players.`);
  const next = clone(doc);
  const profile = {
    id: nextProfileId(next),
    name: sanitizeName(name || `Player ${next.profiles.length + 1}`),
    color: PROFILE_COLORS.includes(color) ? color : PROFILE_COLORS[next.profiles.length % PROFILE_COLORS.length],
    createdAt: now,
    progress: createProgress()
  };
  next.profiles.push(profile);
  next.activeProfileId = profile.id;
  return { doc: next, profile };
}

export function renameProfile(doc, id, name) {
  const next = clone(doc);
  const p = next.profiles.find((x) => x.id === id);
  if (p) p.name = sanitizeName(name);
  return next;
}

export function removeProfile(doc, id) {
  if (doc.profiles.length <= 1) throw new RangeError('There must always be at least one player.');
  const next = clone(doc);
  next.profiles = next.profiles.filter((p) => p.id !== id);
  if (next.activeProfileId === id) next.activeProfileId = next.profiles[0].id;
  return next;
}

export function setActiveProfile(doc, id) {
  if (!doc.profiles.some((p) => p.id === id)) return doc;
  return { ...doc, activeProfileId: id };
}

export function activeProfile(doc) {
  return doc.profiles.find((p) => p.id === doc.activeProfileId) || null;
}

/** Replace the active profile's progress, returning a new document. */
export function withProgress(doc, progress) {
  return {
    ...doc,
    profiles: doc.profiles.map((p) => (p.id === doc.activeProfileId ? { ...p, progress } : p))
  };
}

/* ---------- Days, levels and streaks ---------- */

export function dayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return dayString(new Date(y, m - 1, d - 1));
}

/** Total XP needed to reach a level: 0, 60, 180, 360, 600 ... */
export function xpForLevel(level) {
  return 30 * (level - 1) * level;
}

export function levelInfo(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - floor, needed: next - floor, progress: (xp - floor) / (next - floor) };
}

/** Count today's activity toward the daily streak. */
export function touchStreak(progress, today = dayString()) {
  const streak = { ...progress.streak };
  if (streak.lastDay === today) return progress;
  streak.count = streak.lastDay === previousDay(today) ? streak.count + 1 : 1;
  streak.best = Math.max(streak.best, streak.count);
  streak.lastDay = today;
  return { ...progress, streak };
}

/** The streak as it stands today: it is lost once a whole day has been missed. */
export function currentStreak(progress, today = dayString()) {
  const { lastDay, count } = progress.streak;
  if (lastDay === today || lastDay === previousDay(today)) return count;
  return 0;
}

export function summarize(progress, words) {
  let seen = 0;
  let mastered = 0;
  let learning = 0;
  let learned = 0;
  for (const w of words) {
    const status = wordStatus(progress.words[w.word]);
    if (status !== 'new') seen += 1;
    if (status === 'mastered') mastered += 1;
    else if (status === 'learned') learned += 1;
    else if (status === 'learning') learning += 1;
  }
  const { answered, correct } = progress.stats;
  return {
    total: words.length,
    seen,
    mastered,
    learned,
    learning,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0
  };
}

/* ---------- Achievements ---------- */

function setsLearned(progress) {
  return Object.values(progress.sets).filter((s) => s.learned).length;
}

function setsMastered(progress) {
  return Object.values(progress.sets).filter((s) => s.mastered).length;
}

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-word', title: 'First word', description: 'Answer your first question.', test: (p) => p.stats.answered >= 1 },
  { id: 'first-set', title: 'Set complete', description: 'Learn your first set of ten words.', test: (p) => setsLearned(p) >= 1 },
  { id: 'ten-sets', title: 'Hundred words', description: 'Learn ten sets.', test: (p) => setsLearned(p) >= 10 },
  { id: 'first-star', title: 'Gold star', description: 'Master a set by remembering it over several days.', test: (p) => setsMastered(p) >= 1 },
  { id: 'master-set', title: 'Into the deep end', description: 'Learn a set from the Master tier.', test: (p) => Object.entries(p.sets).some(([k, s]) => k.startsWith('master-') && s.learned) },
  { id: 'tier-complete', title: 'Tier complete', description: 'Learn all 50 sets in a tier.', test: (p, s, data) => Boolean(data) && TIER_IDS.some((t) => tierSummary(p, data, t).learnedSets === 50) },
  { id: 'ten-right', title: 'Warming up', description: 'Get 10 answers right.', test: (p) => p.stats.correct >= 10 },
  { id: 'hundred-right', title: 'Century', description: 'Get 100 answers right.', test: (p) => p.stats.correct >= 100 },
  { id: 'master-10', title: 'Ten in the bank', description: 'Master 10 words.', test: (p, s) => s.mastered >= 10 },
  { id: 'master-100', title: 'Wordsmith', description: 'Master 100 words.', test: (p, s) => s.mastered >= 100 },
  { id: 'spelling-25', title: 'Spelling bee', description: 'Spell 25 words correctly.', test: (p) => p.stats.spellingCorrect >= 25 },
  { id: 'sprint-15', title: 'Quick thinker', description: 'Score 15 or more in one sprint.', test: (p) => p.stats.sprintBest >= 15 },
  { id: 'streak-3', title: 'Three-day habit', description: 'Play three days in a row.', test: (p) => p.streak.best >= 3 },
  { id: 'streak-7', title: 'Week of words', description: 'Play seven days in a row.', test: (p) => p.streak.best >= 7 },
  { id: 'level-5', title: 'Rising star', description: 'Reach level 5.', test: (p) => levelInfo(p.xp).level >= 5 },
  { id: 'all-words', title: 'Lexicon complete', description: 'Meet every word in the game.', test: (p, s) => s.total > 0 && s.seen >= s.total }
]);

export function unlockAchievements(progress, words, data) {
  const summary = summarize(progress, words);
  const have = new Set(progress.achievements);
  const unlocked = ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(progress, summary, data));
  if (!unlocked.length) return { progress, unlocked: [] };
  return {
    progress: { ...progress, achievements: [...progress.achievements, ...unlocked.map((a) => a.id)] },
    unlocked
  };
}

/**
 * Apply one answer: update the word's review schedule and which skills it has
 * been checked on, stats, XP and streak; award set bonuses; then check
 * achievements. Returns a new progress object (input is untouched).
 */
export function recordAnswer(progress, data, { word, correct, mode, xp = 0, check = null, now = Date.now() }) {
  const words = data.words;
  let next = clone(progress);
  let entry;
  if (mode === 'card') {
    // Reading a card is not a test: note that the word was seen, leave its schedule alone.
    const prev = next.words[word] || { box: 0, seen: 0, correct: 0, wrong: 0, due: 0, last: 0, checks: 0 };
    entry = { ...prev, seen: prev.seen + 1, last: now };
  } else {
    entry = reviewWord(next.words[word], correct, now);
  }
  if (correct && check) entry = addCheck(entry, check);
  next.words[word] = entry;
  if (mode !== 'learn' && mode !== 'card') {
    next.stats.answered += 1;
    if (correct) next.stats.correct += 1;
  }
  if (mode === 'spelling' && correct) next.stats.spellingCorrect += 1;
  const before = levelInfo(next.xp).level;
  next.xp += Math.max(0, Math.round(xp));

  const entryWord = data.byWord ? data.byWord.get(word) : null;
  let sets = [];
  if (entryWord && entryWord.tier) {
    const result = setEvents(next, data, entryWord, now);
    sets = result.events;
    if (sets.length) {
      next.sets[result.key] = result.record;
      for (const e of sets) next.xp += e.xp;
    }
  }

  next = touchStreak(next, dayString(new Date(now)));
  const result = unlockAchievements(next, words, data);
  return {
    progress: result.progress,
    unlocked: result.unlocked,
    sets,
    leveledUp: levelInfo(result.progress.xp).level > before
  };
}
