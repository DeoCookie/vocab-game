import { el, icon } from '../dom.js';
import { setStatus, suggestedSet, tierSummary, SETS_PER_TIER } from '../sets.js';
import { wordStatus } from '../srs.js';
import { tierTabs } from './home.js';

const STATE_TEXT = { new: 'Not started', started: 'In progress', learned: 'Learned', mastered: 'Mastered' };
const WORD_STATUS = { new: 'New', learning: 'Learning', learned: 'Learned', mastered: 'Mastered' };

/** The 50 sets of the current tier, with the suggested one highlighted. */
export function mountSets(root, ctx) {
  const tier = ctx.progress.tier;
  const suggested = suggestedSet(ctx.progress, ctx.data, tier);
  const sum = tierSummary(ctx.progress, ctx.data, tier);
  const tiles = [];
  for (let n = 1; n <= SETS_PER_TIER; n += 1) {
    const st = setStatus(ctx.progress, ctx.data.setWords(tier, n));
    const isNext = n === suggested;
    const label = `Set ${n}, ${STATE_TEXT[st.state]}, ${st.learned} of ${st.total} words learned${isNext ? ', suggested next' : ''}`;
    tiles.push(
      el(
        'li',
        {},
        el(
          'button',
          {
            type: 'button',
            class: `set-tile is-${st.state}${isNext ? ' is-next' : ''}`,
            dataset: { set: String(n) },
            'aria-label': label,
            title: label,
            on: { click: () => ctx.navigate('set', { params: { tier, number: n } }) }
          },
          el('span', { class: 'set-num', text: String(n) }),
          st.state === 'mastered'
            ? icon('star', { size: 14 })
            : el('span', { class: 'set-meter' }, el('span', { style: { width: `${(st.learned / st.total) * 100}%` } }))
        )
      )
    );
  }
  root.append(
    el(
      'div',
      { class: 'page', style: { 'max-width': '940px' } },
      el(
        'header',
        { class: 'page-head' },
        el('h1', { class: 'page-title', text: 'Sets' }),
        el('p', { class: 'page-lede', text: 'Each tier has 50 sets of ten words, ordered from most to least common. Start with the highlighted set, or pick any set you like.' })
      ),
      el('div', { class: 'today-top' }, tierTabs(ctx, (t) => ctx.setTier(t, 'sets'))),
      el('p', { class: 'set-summary', text: `${sum.learnedSets} of ${SETS_PER_TIER} sets learned, ${sum.masteredSets} mastered.` }),
      el('ol', { class: 'set-grid', 'aria-label': `${ctx.data.tierName(tier)} sets` }, tiles),
      el(
        'div',
        { class: 'legend' },
        el('span', {}, el('i', { class: 'swatch is-next' }), 'Suggested next'),
        el('span', {}, el('i', { class: 'swatch is-started' }), 'In progress'),
        el('span', {}, el('i', { class: 'swatch is-learned' }), 'Learned'),
        el('span', {}, el('i', { class: 'swatch is-mastered' }), 'Mastered (remembered over several days)')
      )
    )
  );
}

/** One set: its ten words and what to do next. */
export function mountSet(root, ctx) {
  const { tier = ctx.progress.tier, number = 1 } = ctx.params || {};
  const words = ctx.data.setWords(tier, number);
  const st = setStatus(ctx.progress, words);
  const go = (n) => ctx.navigate('set', { params: { tier, number: n } });
  const primary =
    st.state === 'learned' || st.state === 'mastered'
      ? el('button', { type: 'button', class: 'btn btn-primary', id: 'practice-set', text: 'Practice this set', on: { click: () => ctx.navigate('lesson', { params: { tier, number, practice: true } }) } })
      : el('button', {
          type: 'button',
          class: 'btn btn-primary',
          id: 'start-lesson',
          text: st.state === 'started' ? `Continue set ${number}` : `Start set ${number}`,
          on: { click: () => ctx.navigate('lesson', { params: { tier, number } }) }
        });

  root.append(
    el(
      'div',
      { class: 'page' },
      el(
        'header',
        { class: 'page-head' },
        el('p', { class: 'continue-kicker', text: ctx.data.tierName(tier) }),
        el('h1', { class: 'page-title', text: `Set ${number}` }),
        el('p', { class: 'page-lede', text: `${STATE_TEXT[st.state]}. ${st.learned} of ${st.total} words learned, ${st.mastered} mastered.` })
      ),
      el(
        'div',
        { class: 'btn-row', style: { 'margin-bottom': '22px' } },
        primary,
        el('button', { type: 'button', class: 'btn btn-quiet', text: 'Previous set', disabled: number <= 1, on: { click: () => go(number - 1) } }),
        el('button', { type: 'button', class: 'btn btn-quiet', text: 'Next set', disabled: number >= SETS_PER_TIER, on: { click: () => go(number + 1) } }),
        el('button', { type: 'button', class: 'btn btn-quiet', text: 'All sets', on: { click: () => ctx.navigate('sets') } })
      ),
      el(
        'ol',
        { class: 'set-words' },
        words.map((w) => {
          const s = wordStatus(ctx.progress.words[w.word]);
          return el(
            'li',
            { class: 'set-word' },
            el('span', { class: `status-dot is-${s}`, title: WORD_STATUS[s], 'aria-label': WORD_STATUS[s] }),
            el('div', {}, el('b', { text: w.word }), el('span', { class: 'set-word-def', text: ` ${w.pos}. ${w.definition}` })),
            el('button', { type: 'button', class: 'say-btn is-small', 'aria-label': `Hear "${w.word}"`, title: `Hear "${w.word}"`, on: { click: () => ctx.say(w.word) } }, icon('speaker', { size: 16 }))
          );
        })
      ),
      el('p', { class: 'about', text: 'A word is learned once you have answered its meaning, spelling and a synonym or antonym question correctly. It is mastered once you still remember it in reviews over the following days.' })
    )
  );
}
