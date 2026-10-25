// End-to-end tests: drive the real UI in Chromium (the engine inside Electron).
// Speech is replaced by a recorder so tests can "hear" what the app says.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from '../helpers/server.mjs';

const { words } = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));
const { glosses } = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/glosses.json', import.meta.url), 'utf8'));
const byWord = new Map(words.map((w) => [w.word, w]));
const setWords = (tier, n) => words.filter((w) => w.tier === tier && w.order > (n - 1) * 10 && w.order <= n * 10);

let server;
let browser;
let page;
let problems;
let external;

function installFakeSpeech() {
  window.__spoken = [];
  const voice = { name: 'Test Voice', lang: 'en-US', voiceURI: 'test-voice', localService: true, default: true };
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (u) => window.__spoken.push(u.text), cancel: () => {}, getVoices: () => [voice], addEventListener: () => {} }
  });
}

async function open(initialSave) {
  page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  problems = [];
  external = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    if (!r.url().startsWith(server.url)) external.push(r.url());
  });
  await page.addInitScript(installFakeSpeech);
  if (initialSave) {
    await page.addInitScript((save) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('vocab-quest-progress', save);
        sessionStorage.setItem('seeded', '1');
      }
    }, JSON.stringify(initialSave));
  }
  await page.goto(`${server.url}/index.html`);
  await page.waitForSelector('body[data-ready="true"]');
}

before(async () => {
  server = await startServer();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

beforeEach(async () => {
  page = null;
});

afterEach(async () => {
  assert.deepEqual(problems, [], 'no console errors, warnings or CSP violations');
  assert.deepEqual(external, [], 'no requests leave the app');
  await page?.close();
});

const lastSpoken = () => page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
const go = (route) => page.click(`.nav-link[data-route="${route}"]`);
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('vocab-quest-progress') || 'null'));
const flush = () => page.waitForTimeout(600); // debounced save

/** Answer whatever question is on screen correctly (or wrongly). */
async function answerCurrent({ right = true } = {}) {
  if (await page.$('#spell-input')) {
    const word = await lastSpoken();
    await page.fill('#spell-input', right ? word : 'qqqq');
    await page.click('#check');
    if (!right) {
      await page.fill('#spell-input', 'qqqqq');
      await page.click('#check');
    }
  } else if (await page.$('.relation-badge')) {
    const word = await page.textContent('.headword');
    const syn = (await page.textContent('.relation-badge')).includes('synonym');
    const answers = syn ? byWord.get(word).synonyms : byWord.get(word).antonyms;
    const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
    const idx = options.findIndex((o) => answers.includes(o) === right);
    await page.click(`.option >> nth=${idx}`);
  } else if (await page.$('.option')) {
    const word = await page.textContent('.headword');
    const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
    const def = byWord.get(word).definition;
    const idx = options.findIndex((o) => (o === def) === right);
    await page.click(`.option >> nth=${idx}`);
  }
  await page.click('#next');
}

test('first run: Beginner set 1 is suggested and the placement quiz is offered', async () => {
  await open();
  assert.equal(await page.getAttribute('.tier-tab[aria-checked="true"]', 'data-tier'), 'beginner');
  assert.match(await page.textContent('.continue-title'), /Set 1/);
  const listed = (await page.textContent('.continue-words')).split(', ');
  assert.deepEqual(listed, setWords('beginner', 1).map((w) => w.word));
  assert.ok(await page.isVisible('#start-placement'));
  await page.click('#skip-placement');
  assert.equal(await page.$('#start-placement'), null);
});

test('a full set lesson: every word learned, set bonus paid, next set suggested', async () => {
  await open();
  await page.click('#continue-set');
  // Meet the words
  for (let i = 0; i < 10; i += 1) {
    const word = await page.textContent('.headword');
    assert.equal(await lastSpoken(), word, 'card is read aloud');
    await page.click('#next');
  }
  // Meaning, spelling and synonym/antonym rounds, all answered correctly
  for (let i = 0; i < 30; i += 1) await answerCurrent();
  await page.waitForSelector('.result-score');
  assert.equal(await page.textContent('.result-score'), '30/30');
  assert.match(await page.textContent('.set-outcome-title'), /Set 1 learned/);
  await flush();
  const doc = await saved();
  const p = doc.profiles[0].progress;
  assert.ok(p.sets['beginner-1'].learned > 0);
  for (const w of setWords('beginner', 1)) assert.equal(p.words[w.word].checks, 7, w.word);
  await page.click('#next-set');
  assert.match(await page.textContent('.session-title'), /Beginner set 2/);
});

test('a missed question comes back at the end of its round', async () => {
  await open();
  await page.click('#continue-set');
  for (let i = 0; i < 10; i += 1) await page.click('#next');
  const first = await page.textContent('.headword');
  await answerCurrent({ right: false });
  assert.match(await page.textContent('.session-count'), /2 of 41/, 'one extra question was added');
  for (let i = 0; i < 9; i += 1) await answerCurrent();
  assert.equal(await page.textContent('.headword'), first, 'the missed word is asked again');
});

test('hovering a synonym or antonym shows its definition', async () => {
  await open();
  await page.click('#continue-set');
  const chip = page.locator('.chip-syn').first();
  const term = await chip.textContent();
  await chip.hover();
  await page.waitForSelector('#gloss-tooltip:not([hidden])');
  const expected = glosses[term] || byWord.get(term).definition;
  assert.equal(await page.textContent('.tooltip-term'), term);
  assert.equal(await page.textContent('.tooltip-text'), expected);
  assert.equal(await chip.getAttribute('aria-describedby'), 'gloss-tooltip');
  await page.mouse.move(5, 5);
  await page.waitForSelector('#gloss-tooltip', { state: 'hidden' });
  await page.locator('.chip-ant').first().focus();
  assert.ok(await page.isVisible('#gloss-tooltip'), 'keyboard focus shows it too');
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#gloss-tooltip'));
});

test('switching tiers changes the suggested set and the practice pool', async () => {
  await open();
  await page.click('.tier-tab[data-tier="master"]');
  assert.equal(await page.getAttribute('.tier-tab[aria-checked="true"]', 'data-tier'), 'master');
  const listed = (await page.textContent('.continue-words')).split(', ');
  assert.deepEqual(listed, setWords('master', 1).map((w) => w.word));
  await go('meaning');
  for (let i = 0; i < 3; i += 1) {
    const word = await page.textContent('.headword');
    assert.equal(byWord.get(word).tier, 'master');
    await answerCurrent();
  }
});

test('sets page lists 50 sets and opens any of them', async () => {
  await open();
  await go('sets');
  assert.equal(await page.$$eval('.set-tile', (els) => els.length), 50);
  assert.equal(await page.getAttribute('.set-tile.is-next', 'data-set'), '1');
  await page.click('.set-tile[data-set="37"]');
  assert.match(await page.textContent('.page-title'), /Set 37/);
  const shown = await page.$$eval('.set-word b', (els) => els.map((e) => e.textContent));
  assert.deepEqual(shown, setWords('beginner', 37).map((w) => w.word));
  await page.click('#start-lesson');
  assert.match(await page.textContent('.session-title'), /Beginner set 37/);
});

test('placement quiz: acing Beginner moves on; the result sets tier and start', async () => {
  await open();
  await page.click('#start-placement');
  await page.click('#begin-placement');
  for (let i = 0; i < 10; i += 1) {
    const word = await page.textContent('.headword');
    assert.equal(byWord.get(word).tier, 'beginner');
    const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
    await page.click(`.option >> nth=${options.indexOf(byWord.get(word).definition)}`);
  }
  for (let i = 0; i < 10; i += 1) {
    const word = await page.textContent('.headword');
    assert.equal(byWord.get(word).tier, 'expert', 'moved up to Expert');
    if (i < 5) {
      const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
      await page.click(`.option >> nth=${options.indexOf(byWord.get(word).definition)}`);
    } else {
      await page.click('#skip-question');
    }
  }
  assert.equal(await page.textContent('#placement-result'), 'Expert, set 16');
  await page.click('#accept-placement');
  assert.equal(await page.getAttribute('.tier-tab[aria-checked="true"]', 'data-tier'), 'expert');
  assert.match(await page.textContent('.continue-title'), /Set 16/);
  await flush();
  const p = (await saved()).profiles[0].progress;
  assert.equal(p.start.expert, 16);
  assert.equal(Object.keys(p.words).length, 0, 'placement answers do not change progress');
});

test('players: add, switch and remove, each with separate progress', async () => {
  await open();
  await page.click('#continue-set');
  await page.click('#next');
  await page.click('#player-chip');
  await page.fill('#new-player-name', 'Sam');
  await page.click('#add-player');
  assert.match(await page.textContent('.player-chip-name'), /Sam/);
  assert.match(await page.textContent('.meter-caption'), /^0 \//, 'new player starts fresh');
  await page.click('#player-chip');
  await page.click('text=Play as Player 1');
  assert.match(await page.textContent('.player-chip-name'), /Player 1/);
  assert.match(await page.textContent('.meter-caption'), /^4 \//, 'two cards seen, 2 XP each');
  await page.click('#player-chip');
  await page.click('button[aria-label="Remove Sam"]');
  await page.click('#confirm-ok');
  assert.equal(await page.$$eval('.player-card', (els) => els.length), 1);
  await flush();
  assert.equal((await saved()).profiles.length, 1);
});

test('with two or more players the app opens on "Who\'s playing?"', async () => {
  const progress = { xp: 0, words: {} };
  await open({ version: 2, activeProfileId: 'p2', profiles: [{ id: 'p1', name: 'Ana', color: 'teal', progress }, { id: 'p2', name: 'Ben', color: 'plum', progress }] });
  assert.equal(await page.textContent('.page-title'), "Who's playing?");
  assert.equal(await page.$$eval('.player-card', (els) => els.length), 2);
});

test('a version 1 save from the first release is upgraded with nothing lost', async () => {
  const v1 = { version: 1, xp: 250, words: { patient: { box: 4, seen: 6, correct: 6, wrong: 0, due: 1, last: 1 } }, streak: { count: 0, best: 4, lastDay: null }, stats: { answered: 6, correct: 6, spellingCorrect: 2, sprintBest: 3, sessions: 2 }, achievements: ['first-word'], settings: { theme: 'dark', rate: 1, sound: true, voiceURI: null, level: 'all' } };
  await open(v1);
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  assert.match(await page.textContent('.meter-caption'), /^70 \/ 180 XP$/, '250 XP is level 3');
  assert.match(await page.textContent('.player-chip-name'), /Player 1/);
  await go('review');
  assert.match(await page.textContent('.session-count'), /1 of 1/, 'the one due word is offered for review');
  await flush();
  const doc = await saved();
  assert.equal(doc.version, 2);
  assert.equal(doc.profiles[0].progress.words.patient.checks, 7);
});

test('spelling: the word is spoken, never shown, and revealing a letter does not count as learned', async () => {
  await open();
  await go('spelling');
  const word = await lastSpoken();
  assert.ok(byWord.has(word));
  assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(await page.textContent('.page')), 'word hidden before answering');
  await page.click('#reveal');
  assert.ok((await page.textContent('.hint-line')).startsWith(`${word[0]} _`));
  await page.fill('#spell-input', word);
  await page.click('#check');
  await page.waitForSelector('.feedback.is-right');
  assert.match(await page.textContent('.feedback'), /without hints/);
  await flush();
  const e = (await saved()).profiles[0].progress.words[word];
  assert.equal(e.checks & 2, 0);
});

test('word sprint answers synonyms and antonyms against the clock', async () => {
  await open();
  await page.clock.install();
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await go('sprint');
  await page.click('#start-sprint');
  for (let i = 0; i < 5; i += 1) {
    await page.waitForSelector('.option:not([disabled])');
    const word = await page.textContent('.sprint-word');
    const syn = (await page.textContent('.relation-badge')).includes('synonym');
    const answers = syn ? byWord.get(word).synonyms : byWord.get(word).antonyms;
    const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
    await page.keyboard.press(String(options.findIndex((o) => answers.includes(o)) + 1));
    await page.clock.runFor(400);
  }
  assert.match(await page.textContent('.session-bar'), /Score 5/);
  await page.clock.runFor(61000);
  await page.waitForSelector('.result-score');
  assert.equal(await page.textContent('.result-score'), '5');
});

test('flash cards reveal the meaning, then take a self-rating', async () => {
  await open();
  await go('cards');
  assert.ok(await page.isHidden('.card-back'));
  await page.click('#flip');
  assert.ok(await page.isVisible('.card-back .definition'));
  await page.click('#i-know-it');
  assert.match(await page.textContent('.session-count'), /2 of 10/);
});

test('word book searches all 1,500 words and filters by tier', async () => {
  await open();
  await go('book');
  assert.equal(await page.textContent('.list-count'), '500 words', 'starts on the current tier');
  await page.selectOption('#book-tier', 'all');
  assert.equal(await page.textContent('.list-count'), '1,500 words');
  await page.fill('#book-search', 'ubiquitous');
  assert.equal(await page.textContent('.list-count'), '1 word');
  await page.click('.word-item');
  assert.equal(await page.textContent('.entry .headword'), 'ubiquitous');
  await page.fill('#book-search', '<img src=x onerror=alert(1)>');
  assert.equal(await page.textContent('.list-count'), '0 words');
});

test('settings: theme change and progress reset for this player only', async () => {
  await open();
  await page.click('#continue-set');
  await page.click('#next');
  await go('settings');
  await page.selectOption('#theme', 'dark');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.click('#reset');
  await page.click('#confirm-cancel');
  assert.match(await page.textContent('.meter-caption'), /^4 \//, 'cancel keeps progress');
  await page.click('#reset');
  await page.click('#confirm-ok');
  assert.match(await page.textContent('.meter-caption'), /^0 \//);
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark', 'settings survive a reset');
});

test('every control has an accessible name', async () => {
  await open();
  for (const route of ['home', 'sets', 'review', 'cards', 'meaning', 'spelling', 'sprint', 'book', 'progress', 'settings']) {
    await go(route);
    const unnamed = await page.$$eval('button, input, select', (els) =>
      els.filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)))).map((e) => e.outerHTML.slice(0, 80))
    );
    assert.deepEqual(unnamed, [], route);
  }
});

test('layout fits a small window without horizontal scrolling', async () => {
  await open();
  await page.setViewportSize({ width: 960, height: 660 });
  for (const route of ['home', 'sets', 'meaning', 'book', 'progress', 'settings']) {
    await go(route);
    const overflow = await page.$eval('#view', (v) => v.scrollWidth - v.clientWidth);
    assert.ok(overflow <= 1, `${route} overflows by ${overflow}px`);
  }
});
