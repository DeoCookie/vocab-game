/**
 * Renderers for single questions ("tasks"). Each draws into a container,
 * reports the answer through api.answer(correct, details) as soon as it is
 * given, and calls api.next() when the player chooses to continue.
 */
import { el, clear, icon } from './dom.js';
import { makeMeaningQuestion, makeRelationQuestion, checkSpelling, compareLetters, hintPattern, normalizeAnswer } from './quiz.js';
import { entry, feedback, sayButtons } from './views/entry.js';

function nextButton(api, label) {
  return el(
    'div',
    { class: 'next-row' },
    el('button', { type: 'button', class: 'btn btn-primary', id: 'next', on: { click: () => api.next() } }, `${label} `, el('span', { class: 'kbd', text: 'Enter' }))
  );
}

function optionButtons(options, onChoose, { big = false } = {}) {
  return options.map((text, i) =>
    el(
      'button',
      { type: 'button', class: `option${big ? ' is-big' : ''}`, dataset: { index: String(i) }, on: { click: () => onChoose(i) } },
      el('span', { class: 'option-key', text: String(i + 1) }),
      el('span', { text })
    )
  );
}

function markOptions(buttons, answerIndex, chosen) {
  buttons.forEach((b, j) => {
    b.disabled = true;
    if (j === answerIndex) b.classList.add('is-right');
    else if (j === chosen) b.classList.add('is-wrong');
  });
}

/* ---------- Card: meet a word ---------- */
function renderCard(container, ctx, task, api) {
  const w = task.word;
  container.append(entry(ctx, w, { headingLevel: 'h1' }), nextButton(api, api.nextLabel));
  api.answer(true, { mode: 'card' });
  ctx.say(w.word);
  ctx.setKeys((e) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      api.next();
      return true;
    }
    if (e.key === ' ') {
      ctx.say(w.word);
      return true;
    }
    return false;
  });
  container.querySelector('#next')?.focus();
}

/* ---------- Multiple choice: meaning or synonym/antonym ---------- */
function renderChoice(container, ctx, task, api) {
  const w = task.word;
  const isMeaning = task.type === 'meaning';
  const q = isMeaning ? makeMeaningQuestion(w, ctx.data.words, ctx.rng) : makeRelationQuestion(w, ctx.data.words, ctx.rng, task.kind || 'synonym');
  const after = el('div', { class: 'after' });
  let answered = false;
  const buttons = optionButtons(q.options, choose, { big: !isMeaning });

  function choose(i) {
    if (answered) return;
    answered = true;
    const correct = i === q.answerIndex;
    markOptions(buttons, q.answerIndex, i);
    const gained = api.answer(correct, { mode: isMeaning ? 'meaning' : q.type, check: isMeaning ? 'meaning' : 'relation' });
    let detail = null;
    if (!correct) {
      detail = isMeaning
        ? `"${w.word}" means: ${w.definition}.`
        : `"${q.options[q.answerIndex]}" is ${q.type === 'synonym' ? 'similar in meaning to' : 'the opposite of'} "${w.word}".`;
    }
    after.append(
      feedback(correct, correct ? `Correct, +${gained} XP` : 'Not quite', detail),
      el('div', { class: 'after' }, entry(ctx, w)),
      nextButton(api, api.nextLabel)
    );
    container.querySelector('#next')?.focus();
  }

  const badge = isMeaning
    ? null
    : el('span', { class: `relation-badge ${q.type === 'synonym' ? 'is-syn' : 'is-ant'}`, text: q.type === 'synonym' ? 'Find a synonym' : 'Find an antonym' });

  container.append(
    el(
      'div',
      { class: 'entry' },
      el(
        'div',
        { class: 'entry-top' },
        el('div', {}, badge, el('h1', { class: 'headword', text: w.word }), el('p', { class: 'headword-meta' }, el('span', { class: 'pos', text: w.pos }))),
        sayButtons(ctx, w.word)
      ),
      el('hr', { class: 'entry-rule' }),
      el('p', { class: 'prompt', text: isMeaning ? 'Choose the meaning' : q.type === 'synonym' ? 'Which word means the same?' : 'Which word means the opposite?' }),
      el('ul', { class: `options${isMeaning ? '' : ' is-grid'}` }, buttons.map((b) => el('li', {}, b)))
    ),
    after
  );
  ctx.say(w.word);
  ctx.setKeys((e) => {
    const n = Number(e.key);
    if (!answered && n >= 1 && n <= q.options.length) choose(n - 1);
    else if (answered && e.key === 'Enter') api.next();
    else return false;
    return true;
  });
}

/* ---------- Spelling ---------- */
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

function renderSpelling(container, ctx, task, api) {
  const w = task.word;
  const target = w.word;
  let attempts = 0;
  let revealed = 0;
  let done = false;

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

  input.addEventListener('input', () => clear(tiles).append(...tilesFor(target, input.value, revealed)));
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
      clear(message).append(feedback(false, result.close ? 'Very close, try once more' : 'Not quite, try once more', 'Letters in red are in the wrong place.'));
      clear(tiles).append(...resultTiles(target, input.value));
      input.select();
      return;
    }
    complete(false);
  }

  function complete(correct) {
    done = true;
    input.disabled = true;
    checkBtn.disabled = true;
    revealBtn.disabled = true;
    clear(tiles).append(...(correct ? resultTiles(target, target) : resultTiles(target, input.value)));
    // A word only counts as spelled if no letters were revealed.
    const counts = correct && revealed === 0;
    const gained = api.answer(correct, { mode: 'spelling', check: counts ? 'spelling' : null, hintsUsed: revealed + (attempts - 1) });
    clear(message).append(
      feedback(correct, correct ? `Spelled perfectly, +${gained} XP` : `The spelling is "${target}"`, correct && revealed ? 'Try it again without hints to count it as learned.' : null),
      el('div', { class: 'after' }, entry(ctx, w)),
      nextButton(api, api.nextLabel)
    );
    container.querySelector('#next')?.focus();
  }

  container.append(
    el(
      'div',
      { class: 'entry' },
      el(
        'div',
        { class: 'entry-top' },
        el('div', {}, el('h1', { class: 'page-title', text: 'Spell the word you hear' }), el('p', { class: 'headword-meta' }, el('span', { class: 'pos', text: w.pos }))),
        el(
          'div',
          { class: 'say-group' },
          el('button', { type: 'button', class: 'say-btn is-primary', id: 'hear', 'aria-label': 'Hear the word', title: 'Hear the word', on: { click: () => ctx.say(target) } }, icon('speaker')),
          el('button', { type: 'button', class: 'say-btn', 'aria-label': 'Hear the word slowly', title: 'Hear it slowly', on: { click: () => ctx.say(target, { slow: true }) } }, icon('slow'))
        )
      ),
      el('hr', { class: 'entry-rule' }),
      el('p', { class: 'clue', text: `Clue: ${w.definition}` }),
      tiles,
      hint,
      el('div', { style: { 'margin-top': '16px' } }, input),
      el('div', { class: 'btn-row', style: { 'margin-top': '14px' } }, checkBtn, revealBtn)
    ),
    message
  );
  ctx.setKeys((e) => {
    if (done && e.key === 'Enter') {
      api.next();
      return true;
    }
    return false;
  });
  ctx.say(target);
  input.focus();
}

export const TASK_RENDERERS = Object.freeze({
  card: renderCard,
  meaning: renderChoice,
  relation: renderChoice,
  spelling: renderSpelling
});
