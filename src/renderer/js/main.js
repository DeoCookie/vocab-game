import { el, clear, icon } from './dom.js';
import { createRng } from './rng.js';
import { createStorage } from './storage.js';
import { createSpeech } from './speech.js';
import { createSound } from './sound.js';
import { createProgress, hydrate, recordAnswer, levelInfo, currentStreak, unlockAchievements, clone } from './state.js';
import { mountHome } from './views/home.js';
import { mountLearn } from './views/learn.js';
import { mountMeaning } from './views/meaning.js';
import { mountSpelling } from './views/spelling.js';
import { mountSprint } from './views/sprint.js';
import { mountBook } from './views/book.js';
import { mountProgress } from './views/progress.js';
import { mountSettings } from './views/settings.js';

const ROUTES = [
  { id: 'home', label: 'Today', icon: 'home', mount: mountHome },
  { id: 'learn', label: 'Study cards', icon: 'cards', mount: mountLearn },
  { id: 'meaning', label: 'Meaning match', icon: 'target', mount: mountMeaning },
  { id: 'spelling', label: 'Spelling bee', icon: 'spell', mount: mountSpelling },
  { id: 'sprint', label: 'Word sprint', icon: 'bolt', mount: mountSprint },
  { id: 'book', label: 'Word book', icon: 'book', mount: mountBook },
  { id: 'progress', label: 'Progress', icon: 'chart', mount: mountProgress },
  { id: 'settings', label: 'Settings', icon: 'gear', mount: mountSettings }
];

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const playerCard = document.getElementById('player-card');
const toasts = document.getElementById('toasts');

function showFatal(message) {
  clear(view).append(
    el('div', { class: 'page' }, el('h1', { class: 'page-title', text: 'Vocab Quest could not start' }), el('p', { class: 'page-lede', text: message }))
  );
}

async function loadWords() {
  const res = await fetch('data/words.json');
  if (!res.ok) throw new Error(`Word list failed to load (${res.status}).`);
  const data = await res.json();
  if (!data || !Array.isArray(data.words) || data.words.length === 0) throw new Error('Word list is empty or damaged.');
  return data.words;
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

  let words;
  try {
    words = await loadWords();
  } catch (err) {
    showFatal(err.message);
    return;
  }

  let progress = hydrate(await storage.load());
  let current = null;
  let cleanup = null;
  let keyHandler = null;

  function applySettings() {
    applyTheme(progress.settings.theme);
    speech.configure({ voiceURI: progress.settings.voiceURI, rate: progress.settings.rate });
    sound.setEnabled(progress.settings.sound);
  }

  function renderPlayer() {
    const info = levelInfo(progress.xp);
    const streak = currentStreak(progress);
    clear(playerCard).append(
      el(
        'div',
        { class: 'player-row' },
        el('span', { class: 'player-level', text: `Level ${info.level}` }),
        el('span', { class: 'streak', title: 'Daily streak', 'aria-label': `${streak} day streak` }, icon('flame', { size: 16 }), String(streak))
      ),
      el('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Progress to next level', 'aria-valuemin': '0', 'aria-valuemax': String(info.needed), 'aria-valuenow': String(info.current) },
        el('span', { style: { width: `${Math.round(info.progress * 100)}%` } })
      ),
      el('span', { class: 'meter-caption', text: `${info.current} / ${info.needed} XP` })
    );
  }

  function commit(next) {
    progress = next;
    storage.save(progress);
    renderPlayer();
  }

  const ctx = {
    words,
    rng,
    speech,
    sound,
    get progress() {
      return progress;
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
      return { name: 'Vocab Quest', version: '1.0.0' };
    },
    answer({ word, correct, mode, xp }) {
      const result = recordAnswer(progress, words, { word, correct, mode, xp });
      commit(result.progress);
      if (mode !== 'learn') sound.play(correct ? 'correct' : 'wrong');
      if (result.leveledUp) {
        sound.play('level');
        toast(`Level ${levelInfo(progress.xp).level}`, 'You levelled up. Keep going!');
      }
      for (const a of result.unlocked) toast(`Achievement: ${a.title}`, a.description);
      return result;
    },
    finishSession({ sprintScore } = {}) {
      const next = clone(progress);
      next.stats.sessions += 1;
      if (typeof sprintScore === 'number') next.stats.sprintBest = Math.max(next.stats.sprintBest, sprintScore);
      const result = unlockAchievements(next, words);
      commit(result.progress);
      for (const a of result.unlocked) toast(`Achievement: ${a.title}`, a.description);
    },
    updateSettings(patch) {
      const next = clone(progress);
      next.settings = { ...next.settings, ...patch };
      commit(next);
      applySettings();
    },
    resetProgress() {
      const fresh = createProgress();
      fresh.settings = { ...progress.settings };
      commit(fresh);
      toast('Progress reset', 'Every word is new again.');
      navigate('home', { force: true });
    }
  };

  function renderNav() {
    clear(nav).append(
      ...ROUTES.map((r) =>
        el(
          'li',
          {},
          el(
            'button',
            {
              type: 'button',
              class: 'nav-link',
              dataset: { route: r.id },
              'aria-current': r.id === current ? 'page' : 'false',
              title: r.label,
              on: { click: () => navigate(r.id, { force: r.id === current }) }
            },
            icon(r.icon),
            el('span', { class: 'nav-label', text: r.label })
          )
        )
      )
    );
  }

  function navigate(id, { force = false } = {}) {
    const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
    if (route.id === current && !force) return;
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    keyHandler = null;
    speech.cancel();
    current = route.id;
    renderNav();
    clear(view);
    view.scrollTop = 0;
    cleanup = route.mount(view, ctx) || null;
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

  window.addEventListener('beforeunload', () => {
    storage.flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') storage.flush();
  });

  applySettings();
  renderPlayer();
  navigate('home');
  document.body.dataset.ready = 'true';
}

start().catch((err) => showFatal(err && err.message ? err.message : 'Unexpected error.'));
