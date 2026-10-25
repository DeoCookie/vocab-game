import { el, clear, icon } from './dom.js';
import { createRng } from './rng.js';
import { createStorage } from './storage.js';
import { createSpeech } from './speech.js';
import { createSound } from './sound.js';
import { loadData } from './data.js';
import { hide as hideTooltip } from './tooltip.js';
import {
  createProgress,
  hydrateDocument,
  addProfile,
  renameProfile,
  removeProfile,
  setActiveProfile,
  activeProfile,
  withProgress,
  recordAnswer,
  levelInfo,
  currentStreak,
  unlockAchievements,
  clone
} from './state.js';
import { mountHome } from './views/home.js';
import { mountSets, mountSet } from './views/sets.js';
import { mountLesson } from './views/lesson.js';
import { mountMeaning, mountSpelling, mountReview, mountCards } from './views/practice.js';
import { mountSprint } from './views/sprint.js';
import { mountBook } from './views/book.js';
import { mountProgress } from './views/progress.js';
import { mountSettings } from './views/settings.js';
import { mountPlacement } from './views/placement.js';
import { mountPlayers, avatar } from './views/players.js';

const ROUTES = [
  { id: 'home', label: 'Today', icon: 'home', mount: mountHome, nav: 'main' },
  { id: 'sets', label: 'Sets', icon: 'grid', mount: mountSets, nav: 'main' },
  { id: 'review', label: 'Review', icon: 'refresh', mount: mountReview, nav: 'main' },
  { id: 'cards', label: 'Flash cards', icon: 'cards', mount: mountCards, nav: 'practice' },
  { id: 'meaning', label: 'Meaning match', icon: 'target', mount: mountMeaning, nav: 'practice' },
  { id: 'spelling', label: 'Spelling bee', icon: 'spell', mount: mountSpelling, nav: 'practice' },
  { id: 'sprint', label: 'Word sprint', icon: 'bolt', mount: mountSprint, nav: 'practice' },
  { id: 'book', label: 'Word book', icon: 'book', mount: mountBook, nav: 'more' },
  { id: 'progress', label: 'Progress', icon: 'chart', mount: mountProgress, nav: 'more' },
  { id: 'settings', label: 'Settings', icon: 'gear', mount: mountSettings, nav: 'more' },
  { id: 'set', mount: mountSet, parent: 'sets' },
  { id: 'lesson', mount: mountLesson, parent: 'sets' },
  { id: 'placement', mount: mountPlacement, parent: 'home' },
  { id: 'players', mount: mountPlayers, parent: 'players' }
];
const NAV_GROUPS = [
  { id: 'main', label: null },
  { id: 'practice', label: 'Practice' },
  { id: 'more', label: null }
];

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const playerCard = document.getElementById('player-card');
const toasts = document.getElementById('toasts');

function showFatal(message) {
  clear(view).append(el('div', { class: 'page' }, el('h1', { class: 'page-title', text: 'Vocab Quest could not start' }), el('p', { class: 'page-lede', text: message })));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function toast(title, body) {
  const node = el('div', { class: 'toast' }, el('b', { text: title }), body ? el('span', { text: body }) : null);
  toasts.append(node);
  setTimeout(() => node.remove(), 4200);
}

function confirmDialog(title, body, okLabel = 'Confirm') {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent = body;
  const ok = document.getElementById('confirm-ok');
  const cancel = document.getElementById('confirm-cancel');
  ok.textContent = okLabel;
  return new Promise((resolve) => {
    const done = (value) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onOk = () => done(true);
    const onCancel = (e) => {
      if (e) e.preventDefault();
      done(false);
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
    cancel.focus();
  });
}

async function start() {
  const storage = createStorage({ onError: () => toast('Progress could not be saved', 'Your latest answers may be lost if you close the app now.') });
  const speech = createSpeech();
  const sound = createSound();
  const rng = createRng();

  let data;
  try {
    data = await loadData();
  } catch (err) {
    showFatal(err.message);
    return;
  }

  let doc = hydrateDocument(await storage.load());
  if (!doc.profiles.length) doc = addProfile(doc, { name: 'Player 1', color: 'navy' }).doc;
  let current = null;
  let params = {};
  let cleanup = null;
  let keyHandler = null;

  const progress = () => activeProfile(doc).progress;

  function applySettings() {
    const s = progress().settings;
    applyTheme(s.theme);
    speech.configure({ voiceURI: s.voiceURI, rate: s.rate });
    sound.setEnabled(s.sound);
  }

  function renderPlayer() {
    const profile = activeProfile(doc);
    const info = levelInfo(profile.progress.xp);
    const streak = currentStreak(profile.progress);
    clear(playerCard).append(
      el(
        'button',
        { type: 'button', class: 'player-chip', id: 'player-chip', title: 'Switch player', 'aria-label': `Playing as ${profile.name}. Switch player`, on: { click: () => navigate('players') } },
        avatar(profile, 'sm'),
        el('span', { class: 'player-chip-name', text: profile.name })
      ),
      el(
        'div',
        { class: 'player-row' },
        el('span', { class: 'player-level', text: `Level ${info.level}` }),
        el('span', { class: 'streak', title: 'Daily streak', 'aria-label': `${streak} day streak` }, icon('flame', { size: 16 }), String(streak))
      ),
      el(
        'div',
        { class: 'meter', role: 'progressbar', 'aria-label': 'Progress to next level', 'aria-valuemin': '0', 'aria-valuemax': String(info.needed), 'aria-valuenow': String(info.current) },
        el('span', { style: { width: `${Math.round(info.progress * 100)}%` } })
      ),
      el('span', { class: 'meter-caption', text: `${info.current} / ${info.needed} XP` })
    );
  }

  function save() {
    storage.save(doc);
  }

  function commit(next) {
    doc = withProgress(doc, next);
    save();
    renderPlayer();
  }

  function celebrate(result) {
    for (const e of result.sets || []) {
      if (e.type === 'learned') toast(`Set ${e.number} learned`, `+${e.xp} XP bonus. Its words will come back for review.`);
      else toast(`Gold star for set ${e.number}`, `+${e.xp} XP. You've mastered all ten words.`);
    }
    if (result.leveledUp) {
      sound.play('level');
      toast(`Level ${levelInfo(progress().xp).level}`, 'You levelled up. Keep going!');
    }
    for (const a of result.unlocked || []) toast(`Achievement: ${a.title}`, a.description);
  }

  const ctx = {
    data,
    rng,
    speech,
    sound,
    get progress() {
      return progress();
    },
    get profile() {
      return activeProfile(doc);
    },
    get doc() {
      return doc;
    },
    get params() {
      return params;
    },
    say(text, opts) {
      speech.speak(text, opts);
    },
    navigate,
    toast,
    confirm: confirmDialog,
    setKeys(fn) {
      keyHandler = fn;
    },
    appInfo: async () => {
      try {
        if (window.vocabAPI && typeof window.vocabAPI.getAppInfo === 'function') return await window.vocabAPI.getAppInfo();
      } catch {
        /* fall through */
      }
      return { name: 'Vocab Quest', version: '1.1.0' };
    },
    answer({ word, correct, mode, xp, check }) {
      const result = recordAnswer(progress(), data, { word, correct, mode, xp, check });
      commit(result.progress);
      if (mode !== 'learn' && mode !== 'card') sound.play(correct ? 'correct' : 'wrong');
      celebrate(result);
      return result;
    },
    finishSession({ sprintScore } = {}) {
      const next = clone(progress());
      next.stats.sessions += 1;
      if (typeof sprintScore === 'number') next.stats.sprintBest = Math.max(next.stats.sprintBest, sprintScore);
      const result = unlockAchievements(next, data.words, data);
      commit(result.progress);
      celebrate(result);
    },
    updateProgress(fn) {
      commit(fn(clone(progress())));
      applySettings();
    },
    setTier(tier, route = 'home') {
      ctx.updateProgress((p) => ({ ...p, tier }));
      navigate(route, { force: true });
    },
    updateSettings(patch) {
      const next = clone(progress());
      next.settings = { ...next.settings, ...patch };
      commit(next);
      applySettings();
    },
    resetProgress() {
      const fresh = createProgress();
      fresh.settings = { ...progress().settings };
      commit(fresh);
      toast('Progress reset', 'Every word is new again.');
      navigate('home', { force: true });
    },
    switchProfile(id) {
      doc = setActiveProfile(doc, id);
      save();
      applySettings();
      renderPlayer();
      toast(`Playing as ${activeProfile(doc).name}`);
      navigate('home', { force: true });
    },
    addProfile(details) {
      try {
        doc = addProfile(doc, details).doc;
      } catch (err) {
        toast('Could not add player', err.message);
        return;
      }
      save();
      applySettings();
      renderPlayer();
      toast(`Welcome, ${activeProfile(doc).name}`, 'A fresh start. Take the placement quiz or begin at set 1.');
      navigate('home', { force: true });
    },
    renameProfile(id, name) {
      doc = renameProfile(doc, id, name);
      save();
      renderPlayer();
    },
    removeProfile(id) {
      try {
        doc = removeProfile(doc, id);
      } catch (err) {
        toast('Could not remove player', err.message);
        return;
      }
      save();
      applySettings();
      renderPlayer();
      navigate('players', { force: true });
    }
  };

  function renderNav() {
    const active = ROUTES.find((r) => r.id === current);
    const highlight = active && active.parent ? active.parent : current;
    clear(nav);
    for (const group of NAV_GROUPS) {
      if (group.label) nav.append(el('li', { class: 'nav-group', 'aria-hidden': 'true', text: group.label }));
      for (const r of ROUTES.filter((x) => x.nav === group.id)) {
        nav.append(
          el(
            'li',
            {},
            el(
              'button',
              {
                type: 'button',
                class: 'nav-link',
                dataset: { route: r.id },
                'aria-current': r.id === highlight ? 'page' : 'false',
                title: r.label,
                on: { click: () => navigate(r.id, { force: r.id === current }) }
              },
              icon(r.icon),
              el('span', { class: 'nav-label', text: r.label })
            )
          )
        );
      }
    }
  }

  function navigate(id, { force = false, params: nextParams = {} } = {}) {
    const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
    if (route.id === current && !force && JSON.stringify(nextParams) === JSON.stringify(params)) return;
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    keyHandler = null;
    hideTooltip();
    speech.cancel();
    current = route.id;
    params = nextParams || {};
    renderNav();
    clear(view);
    view.scrollTop = 0;
    cleanup = route.mount(view, ctx) || null;
    document.body.dataset.route = current;
    if (!view.contains(document.activeElement)) view.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', (e) => {
    if (!keyHandler || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const t = e.target;
    const typing = t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
    if (typing) return;
    // Let focused buttons handle Enter/Space natively so actions never fire twice.
    if (t instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
    if (keyHandler(e)) e.preventDefault();
  });

  window.addEventListener('beforeunload', () => storage.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') storage.flush();
  });

  save();
  applySettings();
  renderPlayer();
  navigate(doc.profiles.length > 1 ? 'players' : 'home');
  document.body.dataset.ready = 'true';
}

start().catch((err) => showFatal(err && err.message ? err.message : 'Unexpected error.'));
