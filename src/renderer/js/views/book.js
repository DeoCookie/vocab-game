import { el, clear } from '../dom.js';
import { wordStatus } from '../srs.js';
import { entry, LEVEL_NAMES } from './entry.js';

const STATUS_LABEL = { new: 'New', learning: 'Learning', mastered: 'Mastered' };

export function mountBook(root, ctx) {
  let selected = ctx.words[0];
  const search = el('input', {
    class: 'search',
    type: 'search',
    id: 'book-search',
    placeholder: 'Search 500 words, meanings, synonyms…',
    'aria-label': 'Search words',
    maxlength: '60',
    autocomplete: 'off',
    spellcheck: 'false'
  });
  const level = el(
    'select',
    { class: 'select', 'aria-label': 'Filter by level' },
    el('option', { value: 'all', text: 'All levels' }),
    [1, 2, 3].map((n) => el('option', { value: String(n), text: LEVEL_NAMES[n] }))
  );
  const status = el(
    'select',
    { class: 'select', 'aria-label': 'Filter by progress' },
    el('option', { value: 'all', text: 'Any progress' }),
    Object.entries(STATUS_LABEL).map(([value, text]) => el('option', { value, text }))
  );
  const count = el('p', { class: 'list-count', 'aria-live': 'polite' });
  const list = el('ul', { class: 'word-list', 'aria-label': 'Words' });
  const detail = el('div', {});

  function matches(w, q) {
    if (!q) return true;
    return (
      w.word.includes(q) ||
      w.definition.toLowerCase().includes(q) ||
      w.synonyms.some((s) => s.includes(q)) ||
      w.antonyms.some((s) => s.includes(q))
    );
  }

  function renderDetail() {
    clear(detail).append(entry(ctx, selected));
    const e = ctx.progress.words[selected.word];
    if (e && e.seen) {
      detail.append(
        el('p', { class: 'about', text: `Seen ${e.seen} times, ${e.correct} right, ${e.wrong} wrong. Status: ${STATUS_LABEL[wordStatus(e)]}.` })
      );
    }
  }

  function renderList() {
    const q = search.value.trim().toLowerCase().slice(0, 60);
    const lv = level.value;
    const st = status.value;
    const filtered = ctx.words.filter(
      (w) => (lv === 'all' || String(w.level) === lv) && (st === 'all' || wordStatus(ctx.progress.words[w.word]) === st) && matches(w, q)
    );
    count.textContent = filtered.length === 1 ? '1 word' : `${filtered.length} words`;
    clear(list).append(
      ...filtered.map((w) => {
        const s = wordStatus(ctx.progress.words[w.word]);
        return el(
          'li',
          {},
          el(
            'button',
            {
              type: 'button',
              class: 'word-item',
              'aria-current': w === selected ? 'true' : 'false',
              on: {
                click: () => {
                  selected = w;
                  renderList();
                  renderDetail();
                }
              }
            },
            el('span', { text: w.word }),
            el('span', { class: `status-dot is-${s}`, title: STATUS_LABEL[s], 'aria-label': STATUS_LABEL[s] })
          )
        );
      })
    );
  }

  search.addEventListener('input', renderList);
  level.addEventListener('change', renderList);
  status.addEventListener('change', renderList);

  root.append(
    el(
      'div',
      { class: 'page', style: { 'max-width': '1040px' } },
      el(
        'header',
        { class: 'page-head' },
        el('h1', { class: 'page-title', text: 'Word book' }),
        el('p', { class: 'page-lede', text: 'Every word in the game, with its meaning, an example, synonyms and antonyms. Select a word to hear it.' })
      ),
      el('div', { class: 'book-tools' }, search, level, status),
      el('div', { class: 'book-layout' }, el('div', {}, count, list), detail)
    )
  );
  renderList();
  renderDetail();
}
