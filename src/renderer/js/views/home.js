import { el, icon } from '../dom.js';
import { createRng, randomInt, seedFromString } from '../rng.js';
import { dayString, levelInfo, currentStreak, summarize } from '../state.js';
import { entry } from './entry.js';

export const MODES = Object.freeze([
  { route: 'learn', icon: 'cards', name: 'Study cards', desc: 'Meet new words and review the ones that are due.' },
  { route: 'meaning', icon: 'target', name: 'Meaning match', desc: 'Pick the right definition from four choices.' },
  { route: 'spelling', icon: 'spell', name: 'Spelling bee', desc: 'Listen to a word, then spell it out.' },
  { route: 'sprint', icon: 'bolt', name: 'Word sprint', desc: 'Synonyms and antonyms against a 60-second clock.' }
]);

export function wordOfTheDay(words, today = dayString()) {
  const rng = createRng(seedFromString(today));
  return words[randomInt(rng, words.length)];
}

export function mountHome(root, ctx) {
  const p = ctx.progress;
  const today = wordOfTheDay(ctx.words);
  const s = summarize(p, ctx.words);
  const lvl = levelInfo(p.xp);
  const now = Date.now();
  const due = Object.values(p.words).filter((e) => e.seen > 0 && e.due <= now).length;
  const streak = currentStreak(p);

  root.append(
    el(
      'div',
      { class: 'page today' },
      el(
        'section',
        { 'aria-labelledby': 'wotd' },
        el('p', { class: 'today-eyebrow', id: 'wotd', text: 'Word of the day' }),
        entry(ctx, today, { headingLevel: 'h1' })
      ),
      el(
        'ul',
        { class: 'stat-line', 'aria-label': 'Your progress' },
        el('li', {}, el('b', { text: `Level ${lvl.level}` })),
        el('li', {}, el('b', { text: String(streak) }), 'day streak'),
        el('li', {}, el('b', { text: `${s.mastered}` }), `of ${s.total} words mastered`),
        el('li', {}, el('b', { text: String(due) }), due === 1 ? 'word due for review' : 'words due for review')
      ),
      el(
        'section',
        { 'aria-label': 'Games' },
        el(
          'ul',
          { class: 'modes' },
          MODES.map((m) =>
            el(
              'li',
              {},
              el(
                'button',
                { type: 'button', class: 'mode', dataset: { route: m.route }, on: { click: () => ctx.navigate(m.route) } },
                el('span', { class: 'mode-icon' }, icon(m.icon, { size: 22 })),
                el('span', { class: 'mode-name', text: m.name }),
                el('span', { class: 'mode-desc', text: m.desc })
              )
            )
          )
        )
      )
    )
  );
}
