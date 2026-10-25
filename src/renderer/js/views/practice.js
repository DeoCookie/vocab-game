import { el, clear } from '../dom.js';
import { pickWords, dueWords } from '../srs.js';
import { runSession } from '../session.js';
import { entry } from './entry.js';

const SESSION = 10;

function pool(ctx) {
  return ctx.data.byTier[ctx.progress.tier];
}

function practiceSession(root, ctx, { route, title, type }) {
  const words = pickWords(pool(ctx), ctx.progress.words, { count: SESSION, rng: ctx.rng });
  return runSession(root, ctx, {
    title,
    stages: [{ id: type, title, tasks: words.map((w) => ({ type, word: w, kind: w.antonyms.length && ctx.rng() < 0.5 ? 'antonym' : 'synonym' })) }],
    again: () => ctx.navigate(route, { force: true })
  });
}

export function mountMeaning(root, ctx) {
  return practiceSession(root, ctx, { route: 'meaning', title: 'Meaning match', type: 'meaning' });
}

export function mountSpelling(root, ctx) {
  return practiceSession(root, ctx, { route: 'spelling', title: 'Spelling bee', type: 'spelling' });
}

/** Mixed review of words that are due, across every tier. */
export function mountReview(root, ctx) {
  const due = dueWords(ctx.data.words, ctx.progress.words).slice(0, 20);
  if (!due.length) {
    root.append(
      el(
        'div',
        { class: 'page' },
        el('header', { class: 'page-head' }, el('h1', { class: 'page-title', text: 'Review' }), el('p', { class: 'page-lede', text: 'No words are due right now. Words come back for review at growing intervals after you answer them: ten minutes, a day, three days, a week.' })),
        el('button', { type: 'button', class: 'btn btn-primary', text: 'Back to today', on: { click: () => ctx.navigate('home') } })
      )
    );
    return null;
  }
  const types = ['meaning', 'relation', 'spelling'];
  return runSession(root, ctx, {
    title: 'Review',
    stages: [{ id: 'review', title: 'Review', tasks: due.map((w, i) => ({ type: types[i % 3], word: w, kind: w.antonyms.length && ctx.rng() < 0.5 ? 'antonym' : 'synonym' })) }],
    again: () => ctx.navigate('review', { force: true }),
    againLabel: 'Review more'
  });
}

/** Flash cards with self-rating, for quick practice in the current tier. */
export function mountCards(root, ctx) {
  const words = pickWords(pool(ctx), ctx.progress.words, { count: SESSION, rng: ctx.rng });
  const outcome = [];
  let index = 0;
  let xp = 0;
  let revealed = false;

  function rate(known) {
    const w = words[index];
    const gained = known ? 4 : 2;
    xp += gained;
    outcome[index] = known;
    ctx.answer({ word: w.word, correct: known, mode: 'learn', xp: gained });
    index += 1;
    show();
  }

  function show() {
    clear(root);
    if (index >= words.length) {
      ctx.finishSession();
      ctx.setKeys(null);
      root.append(
        el(
          'section',
          { class: 'page result' },
          el('h1', { class: 'page-title', text: 'Flash cards done' }),
          el('p', { class: 'result-score', text: `${outcome.filter(Boolean).length}/${words.length}` }),
          el('p', { class: 'result-caption', text: `known, +${xp} XP` }),
          el(
            'div',
            { class: 'btn-row', style: { 'justify-content': 'center' } },
            el('button', { type: 'button', class: 'btn btn-primary', id: 'again', text: 'More cards', on: { click: () => ctx.navigate('cards', { force: true }) } }),
            el('button', { type: 'button', class: 'btn btn-quiet', text: 'Back to today', on: { click: () => ctx.navigate('home') } })
          )
        )
      );
      return;
    }
    const w = words[index];
    revealed = false;
    const back = el('div', { class: 'card-back', hidden: true });
    const flip = el('button', { type: 'button', class: 'btn btn-primary', id: 'flip' }, 'Show meaning ', el('span', { class: 'kbd', text: 'Space' }));
    const rateRow = el(
      'div',
      { class: 'btn-row', hidden: true },
      el('button', { type: 'button', class: 'btn btn-quiet', id: 'still-learning', on: { click: () => rate(false) } }, 'Still learning ', el('span', { class: 'kbd', text: '1' })),
      el('button', { type: 'button', class: 'btn btn-primary', id: 'i-know-it', on: { click: () => rate(true) } }, 'I knew it ', el('span', { class: 'kbd', text: '2' }))
    );
    function reveal() {
      if (revealed) return;
      revealed = true;
      back.hidden = false;
      flip.hidden = true;
      rateRow.hidden = false;
      rateRow.querySelector('#i-know-it').focus();
    }
    flip.addEventListener('click', reveal);
    back.append(entry(ctx, w));
    root.append(
      el(
        'div',
        { class: 'page' },
        el('div', { class: 'session-bar' }, el('span', { class: 'session-title' }, el('b', { text: 'Flash cards' })), el('span', { class: 'session-count', text: `${index + 1} of ${words.length}` })),
        el('div', { class: 'card-front' }, el('p', { class: 'card-word', text: w.word }), el('p', { class: 'card-hint', text: 'Do you know what it means? Think of it, then check.' })),
        back,
        el('div', { class: 'next-row' }, flip, rateRow)
      )
    );
    ctx.say(w.word);
    ctx.setKeys((e) => {
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) reveal();
      else if (revealed && e.key === '1') rate(false);
      else if (revealed && e.key === '2') rate(true);
      else return false;
      return true;
    });
    flip.focus();
  }

  show();
  return null;
}
