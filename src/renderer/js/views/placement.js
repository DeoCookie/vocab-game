import { el, clear } from '../dom.js';
import { makeMeaningQuestion } from '../quiz.js';
import { placementWords, placementResult, PLACEMENT_PER_TIER, PLACEMENT_PASS } from '../sets.js';
import { sayButtons } from './entry.js';

/**
 * Placement quiz: ten meaning questions per tier, getting harder through the
 * tier. Passing a tier (8 or more right) moves on to the next one. Answers do
 * not affect progress; the result only sets the suggested starting point.
 */
export function mountPlacement(root, ctx) {
  const tiers = ctx.data.tiers.map((t) => t.id);
  const scores = {};
  let tierIndex = 0;
  let questions = [];
  let qIndex = 0;
  let correct = 0;

  function intro() {
    clear(root);
    root.append(
      el(
        'div',
        { class: 'page' },
        el(
          'header',
          { class: 'page-head' },
          el('h1', { class: 'page-title', text: 'Placement quiz' }),
          el('p', {
            class: 'page-lede',
            text: `Answer up to ${PLACEMENT_PER_TIER} questions per tier. Get ${PLACEMENT_PASS} or more right and you move up a tier. It takes about three minutes and does not change your progress. If you are not sure, guess or skip.`
          })
        ),
        el(
          'div',
          { class: 'btn-row' },
          el('button', { type: 'button', class: 'btn btn-primary', id: 'begin-placement', text: 'Begin', on: { click: startTier } }),
          el('button', { type: 'button', class: 'btn btn-quiet', text: 'Not now', on: { click: () => ctx.navigate('home') } })
        )
      )
    );
    ctx.setKeys(null);
  }

  function startTier() {
    questions = placementWords(ctx.data, tiers[tierIndex], ctx.rng).map((w) => makeMeaningQuestion(w, ctx.data.words, ctx.rng));
    qIndex = 0;
    correct = 0;
    ask();
  }

  function answer(isRight) {
    if (isRight) correct += 1;
    qIndex += 1;
    if (qIndex < questions.length) return ask();
    const tier = tiers[tierIndex];
    scores[tier] = correct;
    if (correct >= PLACEMENT_PASS && tierIndex < tiers.length - 1) {
      tierIndex += 1;
      return startTier();
    }
    finish();
  }

  function ask() {
    clear(root);
    const q = questions[qIndex];
    const tierName = ctx.data.tierName(tiers[tierIndex]);
    const buttons = q.options.map((text, i) =>
      el('button', { type: 'button', class: 'option', dataset: { index: String(i) }, on: { click: () => answer(i === q.answerIndex) } }, el('span', { class: 'option-key', text: String(i + 1) }), el('span', { text }))
    );
    root.append(
      el(
        'div',
        { class: 'page' },
        el(
          'div',
          { class: 'session-bar' },
          el('span', { class: 'session-title' }, el('b', { text: 'Placement quiz' }), ` ${tierName}`),
          el('span', { class: 'session-count', text: `${qIndex + 1} of ${questions.length}` })
        ),
        el(
          'div',
          { class: 'entry' },
          el('div', { class: 'entry-top' }, el('div', {}, el('h1', { class: 'headword', text: q.word.word }), el('p', { class: 'headword-meta' }, el('span', { class: 'pos', text: q.word.pos }))), sayButtons(ctx, q.word.word)),
          el('hr', { class: 'entry-rule' }),
          el('p', { class: 'prompt', text: 'Choose the meaning' }),
          el('ul', { class: 'options' }, buttons.map((b) => el('li', {}, b))),
          el('div', { class: 'next-row' }, el('button', { type: 'button', class: 'btn btn-quiet', id: 'skip-question', text: "I don't know", on: { click: () => answer(false) } }))
        )
      )
    );
    ctx.setKeys((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) {
        answer(n - 1 === q.answerIndex);
        return true;
      }
      return false;
    });
  }

  function finish() {
    ctx.setKeys(null);
    const result = placementResult(scores);
    const tierName = ctx.data.tierName(result.tier);
    clear(root);
    root.append(
      el(
        'section',
        { class: 'page result' },
        el('h1', { class: 'page-title', text: 'Your starting point' }),
        el('p', { class: 'result-score', id: 'placement-result', text: `${tierName}, set ${result.start}` }),
        el(
          'p',
          { class: 'result-caption' },
          Object.entries(scores)
            .map(([t, s]) => `${ctx.data.tierName(t)}: ${s} of ${PLACEMENT_PER_TIER}`)
            .join('. ') + '.'
        ),
        el('p', { class: 'about', text: 'Earlier sets stay open, so you can go back to any of them at any time.' }),
        el(
          'div',
          { class: 'btn-row', style: { 'justify-content': 'center' } },
          el('button', {
            type: 'button',
            class: 'btn btn-primary',
            id: 'accept-placement',
            text: `Start at ${tierName}, set ${result.start}`,
            on: {
              click: () => {
                ctx.updateProgress((p) => ({ ...p, tier: result.tier, start: { ...p.start, [result.tier]: result.start }, placementDone: true }));
                ctx.navigate('home');
              }
            }
          }),
          el('button', {
            type: 'button',
            class: 'btn btn-quiet',
            text: 'Start from Beginner, set 1',
            on: {
              click: () => {
                ctx.updateProgress((p) => ({ ...p, tier: 'beginner', placementDone: true }));
                ctx.navigate('home');
              }
            }
          })
        )
      )
    );
  }

  intro();
  return null;
}
