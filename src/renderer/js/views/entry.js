import { el, icon, highlightWord } from '../dom.js';
import { attachTooltip } from '../tooltip.js';

export function sayButtons(ctx, text, { label = text } = {}) {
  return el(
    'div',
    { class: 'say-group' },
    el(
      'button',
      {
        type: 'button',
        class: 'say-btn is-primary',
        title: `Hear "${label}"`,
        'aria-label': `Hear "${label}"`,
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
        'aria-label': `Hear "${label}" slowly`,
        on: { click: () => ctx.say(text, { slow: true }) }
      },
      icon('slow')
    )
  );
}

/** Where a word sits in the game, e.g. "Beginner, set 12". */
export function placeOf(ctx, word) {
  return `${ctx.data.tierName(word.tier)}, set ${ctx.data.setNumber(word)}`;
}

function chip(ctx, term, kind) {
  const button = el('button', {
    type: 'button',
    class: `chip chip-${kind}`,
    text: term,
    dataset: { term },
    on: { click: () => ctx.say(term) }
  });
  return attachTooltip(button, () => {
    const game = ctx.data.byWord.get(term);
    return {
      term,
      text: ctx.data.gloss(term),
      meta: game ? `In the game: ${placeOf(ctx, game)}` : 'Click to hear it'
    };
  });
}

function chipList(ctx, items, kind) {
  if (!items.length) return el('p', { class: 'chips-empty', text: 'No common opposite' });
  return el('div', { class: 'chips' }, items.map((item) => chip(ctx, item, kind)));
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
          el('span', { class: `level-tag tier-${word.tier}`, text: placeOf(ctx, word) })
        )
      ),
      sayButtons(ctx, word.word)
    ),
    el('hr', { class: 'entry-rule' }),
    el('p', { class: 'definition', text: word.definition }),
    showExample ? el('p', { class: 'example' }, highlightWord(word.example, word.word)) : null,
    showRelations ? relations(ctx, word) : null,
    showRelations ? el('p', { class: 'chips-hint', text: 'Point at a synonym or antonym to see what it means.' }) : null
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

/** Thin progress bar for a session. */
export function progressBar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return el(
    'div',
    { class: 'session-progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
    el('span', { style: { width: `${pct}%` } })
  );
}

/** End-of-session summary with the words that need another look. */
export function results(ctx, { title, score, total, xp, missed, again, againLabel = 'Play again', extra = null }) {
  return el(
    'section',
    { class: 'page result' },
    el('h1', { class: 'page-title', text: title }),
    total ? el('p', { class: 'result-score', text: `${score}/${total}` }) : null,
    el('p', { class: 'result-caption', text: total ? `right first time, +${xp} XP` : `+${xp} XP` }),
    extra,
    el(
      'div',
      { class: 'btn-row', style: { 'justify-content': 'center' } },
      again ? el('button', { type: 'button', class: 'btn btn-primary', id: 'again', text: againLabel, on: { click: again } }) : null,
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
                el('span', {
                  text: ` — ${w.definition}. Similar: ${w.synonyms.join(', ')}.${w.antonyms.length ? ` Opposite: ${w.antonyms.join(', ')}.` : ''}`
                })
              )
            )
          )
        )
      : null
  );
}
