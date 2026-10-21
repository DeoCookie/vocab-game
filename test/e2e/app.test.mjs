// End-to-end tests: drive the real UI in Chromium (the engine inside Electron).
// Speech is replaced by a recorder so tests can "hear" what the app says.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from '../helpers/server.mjs';

const { words } = JSON.parse(fs.readFileSync(new URL('../../src/renderer/data/words.json', import.meta.url), 'utf8'));
const byWord = new Map(words.map((w) => [w.word, w]));

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
    value: {
      speak: (u) => window.__spoken.push(u.text),
      cancel: () => {},
      getVoices: () => [voice],
      addEventListener: () => {}
    }
  });
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
  await page.goto(`${server.url}/index.html`);
  await page.waitForSelector('body[data-ready="true"]');
});

afterEach(async () => {
  assert.deepEqual(problems, [], 'no console errors, warnings or CSP violations');
  assert.deepEqual(external, [], 'no requests leave the app');
  await page.close();
});

const lastSpoken = () => page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
const go = (route) => page.click(`.nav-link[data-route="${route}"]`);

test('home shows the word of the day with pronunciation and relations', async () => {
  const headword = await page.textContent('.entry .headword');
  const entry = byWord.get(headword);
  assert.ok(entry, `${headword} is from the list`);
  assert.equal(await page.textContent('.entry .definition'), entry.definition);
  const chips = await page.$$eval('.chip-syn', (els) => els.map((e) => e.textContent));
  assert.deepEqual(chips, entry.synonyms);
  await page.click('.entry .say-btn.is-primary');
  assert.equal(await lastSpoken(), headword);
  await page.click('.chip-ant >> nth=0');
  assert.equal(await lastSpoken(), entry.antonyms[0]);
  assert.equal(await page.$$eval('.mode', (els) => els.length), 4);
});

test('study cards: a full session awards XP and saves progress', async () => {
  await go('learn');
  for (let i = 0; i < 10; i += 1) {
    const word = await page.textContent('.entry .headword');
    assert.equal(await lastSpoken(), word, 'card is read aloud');
    await page.keyboard.press('2');
  }
  await page.waitForSelector('.result-score');
  assert.equal(await page.textContent('.result-score'), '10/10');
  assert.match(await page.textContent('.meter-caption'), /^40 \/ 60 XP$/);
  await page.waitForTimeout(600); // debounced save
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.match(await page.textContent('.meter-caption'), /^40 \/ 60 XP$/, 'progress survives a restart');
});

test('meaning match: choosing the right definitions scores 10/10', async () => {
  await go('meaning');
  for (let i = 0; i < 10; i += 1) {
    const word = await page.textContent('.headword');
    const def = byWord.get(word).definition;
    const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
    assert.equal(options.length, 4);
    await page.keyboard.press(String(options.indexOf(def) + 1));
    await page.waitForSelector('.feedback.is-right');
    assert.ok(await page.isVisible('.relations'), 'synonyms and antonyms shown after answering');
    await page.click('#next');
  }
  assert.equal(await page.textContent('.result-score'), '10/10');
});

test('meaning match: a wrong answer is explained', async () => {
  await go('meaning');
  const word = await page.textContent('.headword');
  const def = byWord.get(word).definition;
  const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
  const wrong = options.findIndex((o) => o !== def);
  await page.click(`.option >> nth=${wrong}`);
  await page.waitForSelector('.feedback.is-wrong');
  assert.match(await page.textContent('.feedback'), new RegExp(word));
  assert.ok(await page.$('.option.is-right'));
});

test('spelling bee: the word is spoken, never shown, and correct spelling wins', async () => {
  await go('spelling');
  for (let i = 0; i < 10; i += 1) {
    const word = await lastSpoken();
    assert.ok(byWord.has(word));
    const visible = await page.textContent('.page');
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(visible), `"${word}" must not appear before answering`);
    await page.fill('#spell-input', word.toUpperCase());
    await page.keyboard.press('Enter');
    await page.waitForSelector('.feedback.is-right');
    await page.keyboard.press('Enter');
  }
  await page.waitForSelector('.result-score');
  assert.equal(await page.textContent('.result-score'), '10/10');
});

test('spelling bee: two misses reveal the answer; hints reveal letters', async () => {
  await go('spelling');
  const word = await lastSpoken();
  await page.click('#reveal');
  assert.ok((await page.textContent('.hint-line')).startsWith(`${word[0]} _`));
  await page.fill('#spell-input', 'zzzz');
  await page.click('#check');
  await page.waitForSelector('.feedback.is-wrong');
  assert.equal(await page.isEnabled('#spell-input'), true, 'second attempt allowed');
  await page.fill('#spell-input', 'zzzzz');
  await page.click('#check');
  await page.waitForSelector('#next');
  assert.match(await page.textContent('.feedback'), new RegExp(`"${word}"`));
});

test('word sprint: answers synonyms and antonyms against the clock', async () => {
  await page.clock.install();
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await go('sprint');
  await page.click('#start-sprint');
  for (let i = 0; i < 5; i += 1) {
    await page.waitForSelector('.option:not([disabled])');
    const word = await page.textContent('.sprint-word');
    const synonym = (await page.textContent('.relation-badge')).includes('synonym');
    const answers = synonym ? byWord.get(word).synonyms : byWord.get(word).antonyms;
    const options = await page.$$eval('.option', (els) => els.map((e) => e.textContent.slice(1)));
    const idx = options.findIndex((o) => answers.includes(o));
    assert.ok(idx >= 0);
    await page.keyboard.press(String(idx + 1));
    await page.clock.runFor(400);
  }
  assert.match(await page.textContent('.session-bar'), /Score 5/);
  await page.clock.runFor(61000);
  await page.waitForSelector('.result-score');
  assert.equal(await page.textContent('.result-score'), '5');
  await go('progress');
  assert.match(await page.textContent('.figures'), /1\s*sessions finished/);
});

test('word book searches all 500 words', async () => {
  await go('book');
  assert.equal(await page.textContent('.list-count'), '500 words');
  await page.fill('#book-search', 'ubiquitous');
  assert.equal(await page.textContent('.list-count'), '1 word');
  await page.click('.word-item');
  assert.equal(await page.textContent('.entry .headword'), 'ubiquitous');
  await page.fill('#book-search', '<img src=x onerror=alert(1)>');
  assert.equal(await page.textContent('.list-count'), '0 words');
});

test('settings change the theme and reset progress after confirmation', async () => {
  await go('learn');
  await page.keyboard.press('2');
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
  for (const route of ['home', 'learn', 'meaning', 'spelling', 'sprint', 'book', 'progress', 'settings']) {
    await go(route);
    const unnamed = await page.$$eval('button, input, select', (els) =>
      els
        .filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`))))
        .map((e) => e.outerHTML.slice(0, 80))
    );
    assert.deepEqual(unnamed, [], route);
  }
});

test('layout fits a small window without horizontal scrolling', async () => {
  await page.setViewportSize({ width: 960, height: 660 });
  for (const route of ['home', 'meaning', 'book', 'settings']) {
    await go(route);
    const overflow = await page.$eval('#view', (v) => v.scrollWidth - v.clientWidth);
    assert.ok(overflow <= 1, `${route} overflows by ${overflow}px`);
  }
});
