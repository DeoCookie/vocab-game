import { el } from '../dom.js';
import { lessonStages, setStatus, suggestedSet, SET_BONUS } from '../sets.js';
import { shuffle } from '../rng.js';
import { runSession } from '../session.js';

/** A set lesson: meet the ten words, then meaning, spelling and synonym/antonym rounds. */
export function mountLesson(root, ctx) {
  const { tier = ctx.progress.tier, number = 1, practice = false } = ctx.params || {};
  const words = ctx.data.setWords(tier, number);
  const before = setStatus(ctx.progress, words);

  let stages;
  if (practice || before.state === 'learned' || before.state === 'mastered') {
    // Practice a finished set: one mixed round across all ten words.
    const types = ['meaning', 'spelling', 'relation'];
    stages = [
      {
        id: 'practice',
        title: 'Practice',
        tasks: shuffle(words, ctx.rng).map((w, i) => ({
          type: types[i % 3],
          word: w,
          kind: w.antonyms.length && ctx.rng() < 0.5 ? 'antonym' : 'synonym'
        }))
      }
    ];
  } else {
    stages = lessonStages(ctx.progress, words, ctx.rng);
  }

  const title = `${ctx.data.tierName(tier)} set ${number}`;
  return runSession(root, ctx, {
    title,
    stages,
    requeue: !practice,
    finishTitle: `${title} done`,
    again: () => ctx.navigate('lesson', { params: { tier, number, practice }, force: true }),
    againLabel: 'Go again',
    onFinish() {
      const after = setStatus(ctx.progress, words);
      const next = suggestedSet(ctx.progress, ctx.data, tier);
      const learnedNow = (after.state === 'learned' || after.state === 'mastered') && before.state !== 'learned' && before.state !== 'mastered';
      return el(
        'div',
        { class: `set-outcome${learnedNow ? ' is-celebration' : ''}` },
        learnedNow
          ? el('p', { class: 'set-outcome-title', text: `Set ${number} learned. +${SET_BONUS.learned[tier]} XP bonus` })
          : el('p', { class: 'set-outcome-title', text: `${after.learned} of ${after.total} words learned in this set.` }),
        el(
          'p',
          { class: 'set-outcome-text' },
          learnedNow
            ? 'Its words will come back for review over the next few days. Remember them to earn a gold star.'
            : after.learned < after.total
              ? 'Words you missed will be asked again next time you open this set.'
              : ''
        ),
        next && next !== number
          ? el('button', { type: 'button', class: 'btn btn-primary', id: 'next-set', text: `Start set ${next}`, on: { click: () => ctx.navigate('lesson', { params: { tier, number: next } }) } })
          : null
      );
    }
  });
}
