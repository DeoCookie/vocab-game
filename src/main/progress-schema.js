'use strict';

/**
 * Validates and normalises saved progress. Anything the renderer sends is
 * treated as untrusted: unknown keys are dropped, numbers are clamped, strings
 * are length-limited, and object keys are restricted to a safe pattern so
 * prototype-pollution keys such as "__proto__" can never be written.
 */

const SCHEMA_VERSION = 1;
const MAX_WORD_ENTRIES = 2000;
const MAX_ACHIEVEMENTS = 100;
const WORD_KEY = /^[a-z][a-z'-]{0,39}$/;
const ACHIEVEMENT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const THEMES = new Set(['system', 'light', 'dark']);
const LEVELS = new Set(['all', '1', '2', '3']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function int(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function num(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function defaultSettings() {
  return { voiceURI: null, rate: 0.9, sound: true, theme: 'system', level: 'all' };
}

function defaultProgress() {
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

const MAX_INT = 1e9;
const MAX_TIME = 8.64e15;

function sanitizeWord(entry) {
  const e = isPlainObject(entry) ? entry : {};
  return {
    box: int(e.box, 0, 5),
    seen: int(e.seen, 0, MAX_INT),
    correct: int(e.correct, 0, MAX_INT),
    wrong: int(e.wrong, 0, MAX_INT),
    due: int(e.due, 0, MAX_TIME),
    last: int(e.last, 0, MAX_TIME)
  };
}

function sanitizeSettings(input) {
  const s = isPlainObject(input) ? input : {};
  const d = defaultSettings();
  const voice = typeof s.voiceURI === 'string' && s.voiceURI.length > 0 && s.voiceURI.length <= 300 ? s.voiceURI : null;
  return {
    voiceURI: voice,
    rate: Math.round(num(s.rate, 0.5, 1.5, d.rate) * 100) / 100,
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
    theme: THEMES.has(s.theme) ? s.theme : d.theme,
    level: LEVELS.has(String(s.level)) ? String(s.level) : d.level
  };
}

/** Returns a fresh, valid progress object built only from trusted fields. */
function sanitizeProgress(input) {
  const src = isPlainObject(input) ? input : {};
  const out = defaultProgress();

  out.xp = int(src.xp, 0, MAX_INT);

  const streak = isPlainObject(src.streak) ? src.streak : {};
  out.streak = {
    count: int(streak.count, 0, 100000),
    best: int(streak.best, 0, 100000),
    lastDay: typeof streak.lastDay === 'string' && DAY.test(streak.lastDay) ? streak.lastDay : null
  };
  out.streak.best = Math.max(out.streak.best, out.streak.count);

  if (isPlainObject(src.words)) {
    let count = 0;
    for (const key of Object.keys(src.words)) {
      if (count >= MAX_WORD_ENTRIES) break;
      if (!WORD_KEY.test(key)) continue;
      out.words[key] = sanitizeWord(src.words[key]);
      count += 1;
    }
  }

  const stats = isPlainObject(src.stats) ? src.stats : {};
  for (const key of Object.keys(out.stats)) out.stats[key] = int(stats[key], 0, MAX_INT);
  out.stats.correct = Math.min(out.stats.correct, out.stats.answered);

  if (Array.isArray(src.achievements)) {
    const seen = new Set();
    for (const id of src.achievements) {
      if (seen.size >= MAX_ACHIEVEMENTS) break;
      if (typeof id === 'string' && ACHIEVEMENT_ID.test(id)) seen.add(id);
    }
    out.achievements = [...seen];
  }

  out.settings = sanitizeSettings(src.settings);
  return out;
}

module.exports = {
  SCHEMA_VERSION,
  MAX_WORD_ENTRIES,
  defaultProgress,
  sanitizeProgress,
  isPlainObject
};
