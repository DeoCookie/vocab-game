import { el, icon } from '../dom.js';
import { createRng, randomInt, seedFromString } from '../rng.js';
import { dayString, levelInfo, currentStreak } from '../state.js';
import { dueWords, isLearned } from '../srs.js';
import { suggestedSet, setStatus, tierSummary, SETS_PER_TIER } from '../sets.js';
import { entry } from './entry.js';

export const MODES = Object.freeze([
  { route: 'cards', icon: 'cards', name: 'Flash cards', desc: 'Flip through words and rate how well you know them.' },
  { route: 'meaning', icon: 'target', name: 'Meaning match', desc: 'Pick the right definition from four choices.' },
  { route: 'spelling', icon: 'spell', name: 'Spelling bee', desc: 'Listen to a word, then spell it out.' },
  { route: 'sprint', icon: 'bolt', name: 'Word sprint', desc: 'Synonyms and antonyms against a 60-second clock.' }
]);

export function wordOfTheDay(words, today = dayString()) {
  const rng = createRng(seedFromString(today));
  return words[randomInt(rng, words.length)];
}

/** Segmented control to switch between Beginner, Expert and Master. */
export function tierTabs(ctx, onChange) {
  const current = ctx.progress.tier;
  return el(
    'div',
    { class: 'tier-tabs', role: 'radiogroup', 'aria-label': 'Word tier' },
    ctx.data.tiers.map((t) =>
      el('button', {
        type: 'button',
        class: 'tier-tab',
        role: 'radio',
        'aria-checked': t.id === current ? 'true' : 'false',
        dataset: { tier: t.id },
        text: t.name,
        title: t.description,
        on: { click: () => onChange(t.id) }
      })
    )
  );
}

function setDots(ctx, words) {
  return el(
    'ol',
    { class: 'set-dots', 'aria-hidden': 'true' },
    words.map((w) => {
      const e = ctx.progress.words[w.word];
      const state = isLearned(e) ? 'is-learned' : e && e.seen > 0 ? 'is-started' : '';
      return el('li', { class: `dot ${state}` });
    })
  );
}

function continueCard(ctx) {
  const tier = ctx.progress.tier;
  const tierName = ctx.data.tierName(tier);
  const n = suggestedSet(ctx.progress, ctx.data, tier);
  if (n === null) {
    return el(
      'section',
      { class: 'continue', 'aria-labelledby': 'continue-title' },
      el('p', { class: 'continue-kicker', text: tierName }),
      el('h1', { class: 'continue-title', id: 'continue-title', text: 'Every set learned' }),
      el('p', { class: 'continue-lede', text: 'Keep reviewing to master them, or move up a tier.' }),
      el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn btn-primary', text: 'See all sets', on: { click: () => ctx.navigate('sets') } }))
    );
  }
  const words = ctx.data.setWords(tier, n);
  const st = setStatus(ctx.progress, words);
  const verb = st.state === 'started' ? 'Continue' : 'Start';
  return el(
    'section',
    { class: 'continue', 'aria-labelledby': 'continue-title' },
    el('p', { class: 'continue-kicker', text: `${tierName}, suggested next` }),
    el('h1', { class: 'continue-title', id: 'continue-title' }, `Set ${n}`, el('span', { class: 'continue-of', text: ` of ${SETS_PER_TIER}` })),
    setDots(ctx, words),
    el('p', { class: 'continue-words', text: words.map((w) => w.word).join(', ') }),
    el(
      'div',
      { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn btn-primary btn-large', id: 'continue-set', text: `${verb} set ${n}`, on: { click: () => ctx.navigate('lesson', { params: { tier, number: n } }) } }),
      el('button', { type: 'button', class: 'btn btn-quiet', text: 'Choose another set', on: { click: () => ctx.navigate('sets') } })
    ),
    el('p', { class: 'continue-note', text: `${st.learned} of ${st.total} words learned. Learn all ten to earn the set bonus.` })
  );
}

function placementPrompt(ctx) {
  const p = ctx.progress;
  const untouched = Object.keys(p.words).length === 0;
  if (p.placementDone || !untouched) return null;
  return el(
    'section',
    { class: 'notice notice-action' },
    el('div', {}, el('b', { text: 'Already know a lot of words?' }), el('p', { text: 'A short quiz suggests where to start so you skip what you know.' })),
    el(
      'div',
      { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn btn-primary', id: 'start-placement', text: 'Take the placement quiz', on: { click: () => ctx.navigate('placement') } }),
      el('button', {
        type: 'button',
        class: 'btn btn-quiet',
        id: 'skip-placement',
        text: 'Start from set 1',
        on: {
          click: () => {
            ctx.updateProgress((pr) => ({ ...pr, placementDone: true }));
            ctx.navigate('home', { force: true });
          }
        }
      })
    )
  );
}

function reviewStrip(ctx) {
  const due = dueWords(ctx.data.words, ctx.progress.words);
  if (!due.length) return null;
  return el(
    'section',
    { class: 'review-strip' },
    icon('flame', { size: 20 }),
    el('p', {}, el('b', { text: `${due.length} ${due.length === 1 ? 'word is' : 'words are'} due for review.` }), ' Reviews keep words from slipping and move sets toward mastery.'),
    el('button', { type: 'button', class: 'btn btn-quiet', id: 'review-now', text: 'Review now', on: { click: () => ctx.navigate('review') } })
  );
}

export function mountHome(root, ctx) {
  const p = ctx.progress;
  const tier = p.tier;
  const today = wordOfTheDay(ctx.data.byTier[tier]);
  const lvl = levelInfo(p.xp);
  const sum = tierSummary(p, ctx.data, tier);

  root.append(
    el(
      'div',
      { class: 'page today' },
      el('div', { class: 'today-top' }, tierTabs(ctx, (t) => ctx.setTier(t))),
      placementPrompt(ctx),
      continueCard(ctx),
      reviewStrip(ctx),
      el(
        'ul',
        { class: 'stat-line', 'aria-label': 'Your progress' },
        el('li', {}, el('b', { text: `Level ${lvl.level}` })),
        el('li', {}, el('b', { text: String(currentStreak(p)) }), 'day streak'),
        el('li', {}, el('b', { text: String(sum.learnedSets) }), `of ${sum.totalSets} ${ctx.data.tierName(tier)} sets learned`),
        el('li', {}, el('b', { text: String(sum.masteredSets) }), 'sets mastered')
      ),
      el('section', { 'aria-labelledby': 'wotd' }, el('h2', { class: 'section-title', id: 'wotd', text: 'Word of the day' }), entry(ctx, today, { headingLevel: 'h3' })),
      el(
        'section',
        { 'aria-labelledby': 'practice' },
        el('h2', { class: 'section-title', id: 'practice', text: 'Practice' }),
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
