import { el, clear, icon } from '../dom.js';
import { pickWords } from '../srs.js';
import { checkSpelling, compareLetters, hintPattern, normalizeAnswer, xpFor } from '../quiz.js';
import { entry, pips, results, feedback } from './entry.js';

const SESSION = 10;
const MAX_ATTEMPTS = 2;

function tilesFor(word, typed, revealed) {
  const letters = normalizeAnswer(typed);
  return Array.from(word, (_, i) => {
    const ch = letters[i] || (i < revealed ? word[i] : '');
    return el('span', { class: `tile${ch ? '' : ' is-empty'}`, text: ch });
  });
}

function resultTiles(word, typed) {
  return compareLetters(typed, word).map((t) => el('span', { class: `tile ${t.ok ? 'is-right' : 'is-wrong'}`, text: t.letter }));
}

export function mountSpelling(root, ctx) {
  const words = pickWords(ctx.words, ctx.progress.words, { count: SESSION, level: ctx.progress.settings.level, rng: ctx.rng });
  const outcome = [];
  let index = 0;
  let xp = 0;
  let combo = 0;

  function finish() {
    ctx.finishSession();
    clear(root);
    root.append(
      results(ctx, {
        title: 'Spelling bee complete',
        score: outcome.filter(Boolean).length,
        total: words.length,
        xp,
        missed: words.filter((_, i) => !outcome[i]),
        again: () => ctx.navigate('spelling', { force: true })
      })
    );
    ctx.setKeys(null);
  }

  function show() {
    if (index >= words.length) return finish();
    const word = words[index];
    const target = word.word;
    let attempts = 0;
    let revealed = 0;
    let done = false;
    clear(root);

    const tiles = el('div', { class: 'tiles', 'aria-hidden': 'true' }, tilesFor(target, '', 0));
    const hint = el('p', { class: 'hint-line', 'aria-live': 'polite', text: `${target.length} letters` });
    const input = el('input', {
      class: 'spell-input',
      id: 'spell-input',
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      maxlength: '40',
      'aria-label': 'Type the word you hear'
    });
    const message = el('div', { class: 'after' });
    const checkBtn = el('button', { type: 'button', class: 'btn btn-primary', id: 'check', text: 'Check spelling' });
    const revealBtn = el('button', { type: 'button', class: 'btn btn-quiet', id: 'reveal', text: 'Reveal a letter' });

    input.addEventListener('input', () => {
      clear(tiles).append(...tilesFor(target, input.value, revealed));
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        check();
      }
    });
    revealBtn.addEventListener('click', () => {
      if (done || revealed >= target.length - 1) return;
      revealed += 1;
      hint.textContent = hintPattern(target, revealed);
      clear(tiles).append(...tilesFor(target, input.value, revealed));
      if (revealed >= target.length - 1) revealBtn.disabled = true;
      input.focus();
    });
    checkBtn.addEventListener('click', check);

    function check() {
      if (done) return;
      const result = checkSpelling(input.value, target);
      if (!result.given) {
        clear(message).append(feedback(false, 'Type the word first', 'Listen again if you need to.'));
        input.focus();
        return;
      }
      attempts += 1;
      if (result.correct) return complete(true);
      if (attempts < MAX_ATTEMPTS) {
        clear(message).append(
          feedback(false, result.close ? 'Very close, try once more' : 'Not quite, try once more', 'Letters in red are in the wrong place.')
        );
        clear(tiles).append(...resultTiles(target, input.value));
        input.select();
        return;
      }
      complete(false);
    }

    function complete(correct) {
      done = true;
      combo = correct ? combo + 1 : 0;
      const gained = xpFor('spelling', correct, { combo: Math.max(0, combo - 1), hintsUsed: revealed + (attempts - 1) });
      xp += gained;
      outcome[index] = correct;
      input.disabled = true;
      checkBtn.disabled = true;
      revealBtn.disabled = true;
      clear(tiles).append(...(correct ? resultTiles(target, target) : resultTiles(target, input.value)));
      ctx.answer({ word: target, correct, mode: 'spelling', xp: gained });
      clear(message).append(
        feedback(correct, correct ? `Spelled perfectly, +${gained} XP` : `The spelling is "${target}"`, null),
        el('div', { class: 'after' }, entry(ctx, word)),
        el(
          'div',
          { class: 'next-row' },
          el(
            'button',
            { type: 'button', class: 'btn btn-primary', id: 'next', on: { click: next } },
            index + 1 < words.length ? 'Next word ' : 'See results ',
            el('span', { class: 'kbd', text: 'Enter' })
          )
        )
      );
      root.querySelector('#next')?.focus();
    }

    function next() {
      index += 1;
      show();
    }

    root.append(
      el(
        'div',
        { class: 'page' },
        el('div', { class: 'session-bar' }, el('span', { text: `Word ${index + 1} of ${words.length}` }), pips(words.length, outcome, index)),
        el(
          'div',
          { class: 'entry' },
          el(
            'div',
            { class: 'entry-top' },
            el('div', {}, el('h1', { class: 'page-title', text: 'Spell the word you hear' }), el('p', { class: 'headword-meta' }, el('span', { class: 'pos', text: word.pos }))),
            el(
              'div',
              { class: 'say-group' },
              el('button', { type: 'button', class: 'say-btn is-primary', id: 'hear', 'aria-label': 'Hear the word', title: 'Hear the word', on: { click: () => ctx.say(target) } }, icon('speaker')),
              el('button', { type: 'button', class: 'say-btn', 'aria-label': 'Hear the word slowly', title: 'Hear it slowly', on: { click: () => ctx.say(target, { slow: true }) } }, icon('slow'))
            )
          ),
          el('hr', { class: 'entry-rule' }),
          el('p', { class: 'clue', text: `Clue: ${word.definition}` }),
          tiles,
          hint,
          el('div', { style: { 'margin-top': '16px' } }, input),
          el('div', { class: 'btn-row', style: { 'margin-top': '14px' } }, checkBtn, revealBtn)
        ),
        message
      )
    );
    ctx.setKeys((e) => {
      if (done && e.key === 'Enter') {
        next();
        return true;
      }
      return false;
    });
    ctx.say(target);
    input.focus();
  }

  show();
}
