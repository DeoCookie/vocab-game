import { el, icon, highlightWord } from '../dom.js';

export const LEVEL_NAMES = Object.freeze({ 1: 'Everyday', 2: 'Intermediate', 3: 'Advanced' });

export function sayButtons(ctx, text) {
  return el(
    'div',
    { class: 'say-group' },
    el(
      'button',
      {
        type: 'button',
        class: 'say-btn is-primary',
        title: `Hear "${text}"`,
        'aria-label': `Hear "${text}"`,
        on: { click: () => ctx.say(text) }
      },
      icon('speaker')
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'say-btn',
        title: 'Hear it slowly',
        'aria-label': `Hear "${text}" slowly`,
        on: { click: () => ctx.say(text, { slow: true }) }
      },
      icon('slow')
    )
  );
}

function chipList(ctx, items, kind) {
  return el(
    'div',
    { class: 'chips' },
    items.map((item) =>
      el('button', {
        type: 'button',
        class: `chip chip-${kind}`,
        text: item,
        title: `Hear "${item}"`,
        on: { click: () => ctx.say(item) }
      })
    )
  );
}

export function relations(ctx, word) {
  return el(
    'div',
    { class: 'relations' },
    el('div', {}, el('h3', { class: 'relation-title', text: 'Synonyms' }), chipList(ctx, word.synonyms, 'syn')),
    el('div', {}, el('h3', { class: 'relation-title', text: 'Antonyms' }), chipList(ctx, word.antonyms, 'ant'))
  );
}

/** A full dictionary entry for one word. */
export function entry(ctx, word, { showExample = true, showRelations = true, headingLevel = 'h2' } = {}) {
  return el(
    'article',
    { class: 'entry', 'aria-label': `Entry for ${word.word}` },
    el(
      'div',
      { class: 'entry-top' },
      el(
        'div',
        {},
        el(headingLevel, { class: 'headword', text: word.word }),
        el(
          'p',
          { class: 'headword-meta' },
          el('span', { class: 'pos', text: word.pos }),
          el('span', { class: 'level-tag', text: LEVEL_NAMES[word.level] })
        )
      ),
      sayButtons(ctx, word.word)
    ),
    el('hr', { class: 'entry-rule' }),
    el('p', { class: 'definition', text: word.definition }),
    showExample ? el('p', { class: 'example' }, highlightWord(word.example, word.word)) : null,
    showRelations ? relations(ctx, word) : null
  );
}

/** Row of progress pips for a session. */
export function pips(total, results, current) {
  return el(
    'div',
    { class: 'pips', 'aria-label': `Question ${Math.min(current + 1, total)} of ${total}` },
    Array.from({ length: total }, (_, i) => {
      let state = '';
      if (results[i] === true) state = ' is-right';
      else if (results[i] === false) state = ' is-wrong';
      else if (i === current) state = ' is-current';
      return el('span', { class: `pip${state}` });
    })
  );
}

export function feedback(correct, title, detail) {
  return el(
    'div',
    { class: `feedback ${correct ? 'is-right' : 'is-wrong'}`, role: 'status' },
    icon(correct ? 'check' : 'cross', { size: 22 }),
    el('div', {}, el('strong', { text: title }), detail ? el('p', { text: detail }) : null)
  );
}

/** End-of-session summary with the words that need another look. */
export function results(ctx, { title, score, total, xp, missed, again }) {
  return el(
    'section',
    { class: 'page result' },
    el('h1', { class: 'page-title', text: title }),
    el('p', { class: 'result-score', text: `${score}/${total}` }),
    el('p', { class: 'result-caption', text: `+${xp} XP this round` }),
    el(
      'div',
      { class: 'btn-row', style: { 'justify-content': 'center' } },
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Play again', on: { click: again } }),
      el('button', { type: 'button', class: 'btn btn-quiet', text: 'Back to today', on: { click: () => ctx.navigate('home') } })
    ),
    missed.length
      ? el(
          'div',
          {},
          el('h2', { class: 'section-title', text: 'Worth another look' }),
          el(
            'ul',
            { class: 'review-list' },
            missed.map((w) =>
              el(
                'li',
                { class: 'review-item' },
                el('b', { text: w.word }),
                el('span', { text: ` — ${w.definition}. Similar: ${w.synonyms.join(', ')}. Opposite: ${w.antonyms.join(', ')}.` })
              )
            )
          )
        )
      : null
  );
}
