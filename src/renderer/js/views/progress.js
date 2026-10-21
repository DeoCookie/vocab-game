import { el, icon } from '../dom.js';
import { ACHIEVEMENTS, levelInfo, summarize, currentStreak } from '../state.js';
import { wordStatus } from '../srs.js';
import { LEVEL_NAMES } from './entry.js';

function figure(value, label) {
  return el('div', { class: 'figure' }, el('span', { class: 'figure-value', text: String(value) }), el('span', { class: 'figure-label', text: label }));
}

export function mountProgress(root, ctx) {
  const p = ctx.progress;
  const s = summarize(p, ctx.words);
  const lvl = levelInfo(p.xp);
  const pct = (n) => `${((n / s.total) * 100).toFixed(2)}%`;
  const have = new Set(p.achievements);

  const perLevel = [1, 2, 3].map((n) => {
    const list = ctx.words.filter((w) => w.level === n);
    const mastered = list.filter((w) => wordStatus(p.words[w.word]) === 'mastered').length;
    return { n, total: list.length, mastered };
  });

  root.append(
    el(
      'div',
      { class: 'page' },
      el(
        'header',
        { class: 'page-head' },
        el('h1', { class: 'page-title', text: 'Your progress' }),
        el('p', { class: 'page-lede', text: `Level ${lvl.level}. ${lvl.needed - lvl.current} XP to level ${lvl.level + 1}.` })
      ),
      el(
        'div',
        { class: 'figures' },
        figure(p.xp, 'total XP'),
        figure(currentStreak(p), `day streak (best ${p.streak.best})`),
        figure(`${s.accuracy}%`, `accuracy over ${p.stats.answered} answers`),
        figure(p.stats.sessions, 'sessions finished')
      ),
      el('h2', { class: 'section-title', text: `${s.mastered} of ${s.total} words mastered` }),
      el(
        'div',
        { class: 'mastery-bar', role: 'img', 'aria-label': `${s.mastered} mastered, ${s.learning} learning, ${s.total - s.seen} not started` },
        el('span', { class: 'is-mastered', style: { width: pct(s.mastered) } }),
        el('span', { class: 'is-learning', style: { width: pct(s.learning) } })
      ),
      el(
        'div',
        { class: 'legend' },
        el('span', {}, el('i', { style: { background: 'var(--right)' } }), `Mastered ${s.mastered}`),
        el('span', {}, el('i', { style: { background: 'var(--gilt)' } }), `Learning ${s.learning}`),
        el('span', {}, el('i', { style: { background: 'var(--line)' } }), `Not started ${s.total - s.seen}`),
        ...perLevel.map((l) => el('span', { text: `${LEVEL_NAMES[l.n]}: ${l.mastered}/${l.total}` }))
      ),
      el('h2', { class: 'section-title', text: `Achievements (${have.size} of ${ACHIEVEMENTS.length})` }),
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
