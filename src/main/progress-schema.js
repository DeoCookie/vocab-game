'use strict';

/**
 * Validates and normalises saved progress. Anything the renderer sends is
 * treated as untrusted: unknown keys are dropped, numbers are clamped, strings
 * are length-limited, and object keys are restricted to a safe pattern so
 * prototype-pollution keys such as "__proto__" can never be written.
 *
 * Save file layout (version 2):
 *   { version: 2, activeProfileId, profiles: [{ id, name, color, createdAt, progress }] }
 * A version 1 file (a single player's progress at the top level) is upgraded
 * to version 2 automatically, keeping every word the player has learned.
 */

const SCHEMA_VERSION = 2;
const MAX_PROFILES = 8;
const MAX_WORD_ENTRIES = 3000;
const MAX_ACHIEVEMENTS = 100;
const MAX_SET_ENTRIES = 150;
const WORD_KEY = /^[a-z][a-z'-]{0,39}$/;
const ACHIEVEMENT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const PROFILE_ID = /^p[a-z0-9]{1,15}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIERS = Object.freeze(['beginner', 'expert', 'master']);
const SET_KEY = /^(beginner|expert|master)-([1-9]|[1-4][0-9]|50)$/;
const THEMES = new Set(['system', 'light', 'dark']);
const COLORS = Object.freeze(['navy', 'teal', 'plum', 'rust', 'olive', 'slate']);
const NAME_MAX = 24;
const SETS_PER_TIER = 50;

const MAX_INT = 1e9;
const MAX_TIME = 8.64e15;

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
  return { voiceURI: null, rate: 0.9, sound: true, theme: 'system' };
}

function defaultProgress() {
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

function sanitizeWord(entry) {
  const e = isPlainObject(entry) ? entry : {};
  return {
    box: int(e.box, 0, 5),
    seen: int(e.seen, 0, MAX_INT),
    correct: int(e.correct, 0, MAX_INT),
    wrong: int(e.wrong, 0, MAX_INT),
    due: int(e.due, 0, MAX_TIME),
    last: int(e.last, 0, MAX_TIME),
    checks: int(e.checks, 0, 7)
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
    theme: THEMES.has(s.theme) ? s.theme : d.theme
  };
}

/** Returns a fresh, valid progress object for one player, built only from trusted fields. */
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
  out.tier = TIERS.includes(src.tier) ? src.tier : 'beginner';

  const start = isPlainObject(src.start) ? src.start : {};
  for (const t of TIERS) out.start[t] = int(start[t], 1, SETS_PER_TIER, 1);

  if (isPlainObject(src.sets)) {
    let count = 0;
    for (const key of Object.keys(src.sets)) {
      if (count >= MAX_SET_ENTRIES) break;
      if (!SET_KEY.test(key)) continue;
      const s = isPlainObject(src.sets[key]) ? src.sets[key] : {};
      out.sets[key] = { learned: int(s.learned, 0, MAX_TIME), mastered: int(s.mastered, 0, MAX_TIME) };
      count += 1;
    }
  }

  out.placementDone = src.placementDone === true;
  return out;
}

/** Strip control and direction-override characters, collapse spaces, limit length. */
function sanitizeName(value) {
  if (typeof value !== 'string') return 'Player';
  const cleaned = value
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- deliberately removing control characters
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, NAME_MAX).join('').trim() || 'Player';
}

function sanitizeProfile(input, index) {
  const p = isPlainObject(input) ? input : {};
  return {
    id: typeof p.id === 'string' && PROFILE_ID.test(p.id) ? p.id : `p${index + 1}`,
    name: sanitizeName(p.name),
    color: COLORS.includes(p.color) ? p.color : COLORS[index % COLORS.length],
    createdAt: int(p.createdAt, 0, MAX_TIME),
    progress: sanitizeProgress(p.progress)
  };
}

function defaultDocument() {
  return { version: SCHEMA_VERSION, activeProfileId: null, profiles: [] };
}

/** True when the input looks like a version 1 save (one player's progress at the top level). */
function isLegacyProgress(input) {
  return isPlainObject(input) && !Array.isArray(input.profiles) && (isPlainObject(input.words) || 'xp' in input);
}

/** Returns a valid version 2 save document, upgrading a version 1 save if needed. */
function sanitizeDocument(input) {
  if (isLegacyProgress(input)) {
    const legacy = { ...input };
    if (isPlainObject(input.settings)) legacy.settings = { ...input.settings };
    // Version 1 had no per-skill checks. Words already mastered there were
    // answered correctly many times, so they count as fully learned.
    if (isPlainObject(input.words)) {
      legacy.words = {};
      for (const key of Object.keys(input.words)) {
        const w = input.words[key];
        legacy.words[key] = isPlainObject(w) && Number(w.box) >= 4 ? { ...w, checks: 7 } : w;
      }
    }
    return {
      version: SCHEMA_VERSION,
      activeProfileId: 'p1',
      profiles: [sanitizeProfile({ id: 'p1', name: 'Player 1', color: 'navy', createdAt: 0, progress: legacy }, 0)]
    };
  }
  const src = isPlainObject(input) ? input : {};
  const out = defaultDocument();
  const ids = new Set();
  if (Array.isArray(src.profiles)) {
    for (const raw of src.profiles) {
      if (out.profiles.length >= MAX_PROFILES) break;
      const profile = sanitizeProfile(raw, out.profiles.length);
      let n = out.profiles.length + 1;
      while (ids.has(profile.id)) profile.id = `p${(n += 1)}`;
      ids.add(profile.id);
      out.profiles.push(profile);
    }
  }
  const active = typeof src.activeProfileId === 'string' && ids.has(src.activeProfileId) ? src.activeProfileId : null;
  out.activeProfileId = active || (out.profiles[0] ? out.profiles[0].id : null);
  return out;
}

module.exports = {
  SCHEMA_VERSION,
  MAX_PROFILES,
  MAX_WORD_ENTRIES,
  TIERS,
  COLORS,
  NAME_MAX,
  defaultProgress,
  defaultDocument,
  sanitizeProgress,
  sanitizeDocument,
  sanitizeName,
  isLegacyProgress,
  isPlainObject
};
