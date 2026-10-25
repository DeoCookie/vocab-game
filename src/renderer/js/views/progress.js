import { el, icon } from '../dom.js';
import { ACHIEVEMENTS, levelInfo, summarize, currentStreak } from '../state.js';
import { tierSummary } from '../sets.js';

function figure(value, label) {
  return el('div', { class: 'figure' }, el('span', { class: 'figure-value', text: String(value) }), el('span', { class: 'figure-label', text: label }));
}

function tierRow(ctx, tier) {
  const p = ctx.progress;
  const words = ctx.data.byTier[tier.id];
  const s = summarize(p, words);
  const sets = tierSummary(p, ctx.data, tier.id);
  const pct = (n) => `${((n / s.total) * 100).toFixed(2)}%`;
  return el(
    'div',
    { class: 'tier-row' },
    el('div', { class: 'tier-row-head' }, el('b', { text: tier.name }), el('span', { text: `${sets.learnedSets} of ${sets.totalSets} sets learned, ${sets.masteredSets} mastered` })),
    el(
      'div',
      { class: 'mastery-bar', role: 'img', 'aria-label': `${tier.name}: ${s.mastered} words mastered, ${s.learned} learned, ${s.learning} learning, ${s.total - s.seen} not started` },
      el('span', { class: 'is-mastered', style: { width: pct(s.mastered) } }),
      el('span', { class: 'is-learned', style: { width: pct(s.learned) } }),
      el('span', { class: 'is-learning', style: { width: pct(s.learning) } })
    )
  );
}

export function mountProgress(root, ctx) {
  const p = ctx.progress;
  const s = summarize(p, ctx.data.words);
  const lvl = levelInfo(p.xp);
  const have = new Set(p.achievements);
  const known = ACHIEVEMENTS.filter((a) => have.has(a.id)).length;

  root.append(
    el(
      'div',
      { class: 'page' },
      el(
        'header',
        { class: 'page-head' },
        el('h1', { class: 'page-title', text: `${ctx.profile.name}'s progress` }),
        el('p', { class: 'page-lede', text: `Level ${lvl.level}. ${lvl.needed - lvl.current} XP to level ${lvl.level + 1}.` })
      ),
      el(
        'div',
        { class: 'figures' },
        figure(p.xp, 'total XP'),
        figure(currentStreak(p), `day streak (best ${p.streak.best})`),
        figure(`${s.accuracy}%`, `accuracy over ${p.stats.answered} answers`),
        figure(s.mastered + s.learned, `of ${s.total.toLocaleString('en-US')} words learned`)
      ),
      el('h2', { class: 'section-title', text: 'By tier' }),
      ctx.data.tiers.map((t) => tierRow(ctx, t)),
      el(
        'div',
        { class: 'legend' },
        el('span', {}, el('i', { style: { background: 'var(--right)' } }), 'Mastered'),
        el('span', {}, el('i', { style: { background: 'var(--learned)' } }), 'Learned'),
        el('span', {}, el('i', { style: { background: 'var(--gilt)' } }), 'Learning'),
        el('span', {}, el('i', { style: { background: 'var(--line)' } }), 'Not started')
      ),
      el('h2', { class: 'section-title', text: `Achievements (${known} of ${ACHIEVEMENTS.length})` }),
      el(
        'ul',
        { class: 'badges' },
        ACHIEVEMENTS.map((a) => {
          const unlocked = have.has(a.id);
          return el(
            'li',
            { class: `badge${unlocked ? '' : ' is-locked'}` },
            el('span', { class: 'badge-icon' }, icon(unlocked ? 'star' : 'lock', { size: 18 })),
            el('span', {}, el('span', { class: 'badge-title', text: a.title }), el('span', { class: 'badge-desc', text: a.description })),
            el('span', { class: 'visually-hidden', text: unlocked ? 'Unlocked' : 'Locked' })
          );
        })
      )
    )
  );
}
