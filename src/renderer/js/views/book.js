import { el, clear } from '../dom.js';
import { wordStatus } from '../srs.js';
import { entry } from './entry.js';

const STATUS_LABEL = { new: 'New', learning: 'Learning', learned: 'Learned', mastered: 'Mastered' };

export function mountBook(root, ctx) {
  const all = [...ctx.data.words].sort((a, b) => a.word.localeCompare(b.word));
  let selected = ctx.data.byTier[ctx.progress.tier][0];
  const search = el('input', {
    class: 'search',
    type: 'search',
    id: 'book-search',
    placeholder: `Search ${all.length.toLocaleString('en-US')} words, meanings, synonyms…`,
    'aria-label': 'Search words',
    maxlength: '60',
    autocomplete: 'off',
    spellcheck: 'false'
  });
  const tier = el(
    'select',
    { class: 'select', id: 'book-tier', 'aria-label': 'Filter by tier' },
    el('option', { value: 'all', text: 'All tiers' }),
    ctx.data.tiers.map((t) => el('option', { value: t.id, text: t.name, selected: t.id === ctx.progress.tier }))
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
    return w.word.includes(q) || w.definition.toLowerCase().includes(q) || w.synonyms.some((s) => s.includes(q)) || w.antonyms.some((s) => s.includes(q));
  }

  function renderDetail() {
    clear(detail).append(entry(ctx, selected));
    const e = ctx.progress.words[selected.word];
    if (e && e.seen) {
      detail.append(el('p', { class: 'about', text: `Seen ${e.seen} times, ${e.correct} right, ${e.wrong} wrong. Status: ${STATUS_LABEL[wordStatus(e)]}.` }));
    }
  }

  function renderList() {
    const q = search.value.trim().toLowerCase().slice(0, 60);
    const t = tier.value;
    const st = status.value;
    const filtered = all.filter((w) => (t === 'all' || w.tier === t) && (st === 'all' || wordStatus(ctx.progress.words[w.word]) === st) && matches(w, q));
    count.textContent = filtered.length === 1 ? '1 word' : `${filtered.length.toLocaleString('en-US')} words`;
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
  tier.addEventListener('change', renderList);
  status.addEventListener('change', renderList);

  root.append(
    el(
      'div',
      { class: 'page', style: { 'max-width': '1040px' } },
      el(
        'header',
        { class: 'page-head' },
        el('h1', { class: 'page-title', text: 'Word book' }),
        el('p', { class: 'page-lede', text: 'Every word in the game, with its meaning, an example, synonyms and antonyms. Point at a synonym or antonym to see what it means.' })
      ),
      el('div', { class: 'book-tools' }, search, tier, status),
      el('div', { class: 'book-layout' }, el('div', {}, count, list), detail)
    )
  );
  renderList();
  renderDetail();
}
