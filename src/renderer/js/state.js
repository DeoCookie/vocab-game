/** Player progress: XP, levels, streaks and achievements. Pure functions, no DOM. */
import { reviewWord, wordStatus, MASTERED_BOX } from './srs.js';

export const SCHEMA_VERSION = 1;

export function defaultSettings() {
  return { voiceURI: null, rate: 0.9, sound: true, theme: 'system', level: 'all' };
}

export function createProgress() {
  return {
    version: SCHEMA_VERSION,
    xp: 0,
    streak: { count: 0, best: 0, lastDay: null },
    words: {},
    stats: { answered: 0, correct: 0, spellingCorrect: 0, sprintBest: 0, sessions: 0 },
    achievements: [],
    settings: defaultSettings()
  };
}

/** Fill in anything missing from an older or partial save. */
export function hydrate(saved) {
  const base = createProgress();
  if (!saved || typeof saved !== 'object') return base;
  return {
    ...base,
    ...saved,
    streak: { ...base.streak, ...(saved.streak || {}) },
    stats: { ...base.stats, ...(saved.stats || {}) },
    settings: { ...base.settings, ...(saved.settings || {}) },
    words: { ...(saved.words || {}) },
    achievements: Array.isArray(saved.achievements) ? [...saved.achievements] : []
  };
}

export function clone(progress) {
  return JSON.parse(JSON.stringify(progress));
}

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
  for (const w of words) {
    const status = wordStatus(progress.words[w.word]);
    if (status !== 'new') seen += 1;
    if (status === 'mastered') mastered += 1;
    if (status === 'learning') learning += 1;
  }
  const { answered, correct } = progress.stats;
  return {
    total: words.length,
    seen,
    mastered,
    learning,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0
  };
}

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-word', title: 'First word', description: 'Answer your first question.', test: (p) => p.stats.answered >= 1 },
  { id: 'ten-right', title: 'Warming up', description: 'Get 10 answers right.', test: (p) => p.stats.correct >= 10 },
  { id: 'hundred-right', title: 'Century', description: 'Get 100 answers right.', test: (p) => p.stats.correct >= 100 },
  { id: 'explorer-50', title: 'Explorer', description: 'Meet 50 different words.', test: (p, s) => s.seen >= 50 },
  { id: 'explorer-250', title: 'Voyager', description: 'Meet 250 different words.', test: (p, s) => s.seen >= 250 },
  { id: 'master-10', title: 'Ten in the bank', description: 'Master 10 words.', test: (p, s) => s.mastered >= 10 },
  { id: 'master-100', title: 'Wordsmith', description: 'Master 100 words.', test: (p, s) => s.mastered >= 100 },
  { id: 'spelling-25', title: 'Spelling bee', description: 'Spell 25 words correctly.', test: (p) => p.stats.spellingCorrect >= 25 },
  { id: 'sprint-15', title: 'Quick thinker', description: 'Score 15 or more in one sprint.', test: (p) => p.stats.sprintBest >= 15 },
  { id: 'streak-3', title: 'Three-day habit', description: 'Play three days in a row.', test: (p) => p.streak.best >= 3 },
  { id: 'streak-7', title: 'Week of words', description: 'Play seven days in a row.', test: (p) => p.streak.best >= 7 },
  { id: 'level-5', title: 'Rising star', description: 'Reach level 5.', test: (p) => levelInfo(p.xp).level >= 5 },
  { id: 'all-500', title: 'Lexicon complete', description: 'Meet every word in the list.', test: (p, s) => s.total > 0 && s.seen >= s.total }
]);

export function unlockAchievements(progress, words) {
  const summary = summarize(progress, words);
  const have = new Set(progress.achievements);
  const unlocked = ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(progress, summary));
  if (!unlocked.length) return { progress, unlocked: [] };
  return {
    progress: { ...progress, achievements: [...progress.achievements, ...unlocked.map((a) => a.id)] },
    unlocked
  };
}

/**
 * Apply one answer: update the word's review schedule, stats, XP and streak,
 * then check achievements. Returns a new progress object (input is untouched).
 */
export function recordAnswer(progress, words, { word, correct, mode, xp = 0, now = Date.now() }) {
  let next = clone(progress);
  next.words[word] = reviewWord(next.words[word], correct, now);
  if (mode !== 'learn') {
    next.stats.answered += 1;
    if (correct) next.stats.correct += 1;
  }
  if (mode === 'spelling' && correct) next.stats.spellingCorrect += 1;
  const before = levelInfo(next.xp).level;
  next.xp += Math.max(0, Math.round(xp));
  next = touchStreak(next, dayString(new Date(now)));
  const result = unlockAchievements(next, words);
  return {
    progress: result.progress,
    unlocked: result.unlocked,
    leveledUp: levelInfo(result.progress.xp).level > before
  };
}

export function isMastered(progress, word) {
  const entry = progress.words[word];
  return Boolean(entry && entry.box >= MASTERED_BOX);
}
