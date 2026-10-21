import { el, clear } from '../dom.js';
import { pickWords } from '../srs.js';
import { makeMeaningQuestion, xpFor } from '../quiz.js';
import { entry, pips, results, feedback, sayButtons } from './entry.js';

const SESSION = 10;

export function mountMeaning(root, ctx) {
  const words = pickWords(ctx.words, ctx.progress.words, { count: SESSION, level: ctx.progress.settings.level, rng: ctx.rng });
  const questions = words.map((w) => makeMeaningQuestion(w, ctx.words, ctx.rng));
  const outcome = [];
  let index = 0;
  let combo = 0;
  let xp = 0;

  function finish() {
    ctx.finishSession();
    clear(root);
    root.append(
      results(ctx, {
        title: 'Meaning match complete',
        score: outcome.filter(Boolean).length,
        total: questions.length,
        xp,
        missed: questions.filter((_, i) => !outcome[i]).map((q) => q.word),
        again: () => ctx.navigate('meaning', { force: true })
      })
    );
    ctx.setKeys(null);
  }

  function show() {
    if (index >= questions.length) return finish();
    const q = questions[index];
    let answered = false;
    clear(root);
    const after = el('div', { class: 'after' });
    const buttons = q.options.map((text, i) =>
      el(
        'button',
        { type: 'button', class: 'option', dataset: { index: String(i) }, on: { click: () => choose(i) } },
        el('span', { class: 'option-key', text: String(i + 1) }),
        el('span', { text })
      )
    );
    const comboLabel = el('span', { class: 'combo', text: combo > 1 ? `Combo x${combo}` : '' });

    function choose(i) {
      if (answered) return;
      answered = true;
      const correct = i === q.answerIndex;
      combo = correct ? combo + 1 : 0;
      const gained = xpFor('meaning', correct, { combo: Math.max(0, combo - 1) });
      xp += gained;
      outcome[index] = correct;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === q.answerIndex) b.classList.add('is-right');
        else if (j === i) b.classList.add('is-wrong');
      });
      ctx.answer({ word: q.word.word, correct, mode: 'meaning', xp: gained });
      after.append(
        feedback(correct, correct ? `Correct, +${gained} XP` : 'Not quite', correct ? null : `"${q.word.word}" means: ${q.word.definition}.`),
        el('div', { class: 'after' }, entry(ctx, q.word, { headingLevel: 'h2' })),
        el(
          'div',
          { class: 'next-row' },
          el(
            'button',
            { type: 'button', class: 'btn btn-primary', id: 'next', on: { click: next } },
            index + 1 < questions.length ? 'Next question ' : 'See results ',
            el('span', { class: 'kbd', text: 'Enter' })
          )
        )
      );
      root.querySelector('#next')?.focus();
    }

    function next() {
      index += 1;
      show();
    }

    root.append(
      el(
        'div',
        { class: 'page' },
        el(
          'div',
          { class: 'session-bar' },
          el('span', {}, `Question ${index + 1} of ${questions.length} `, comboLabel),
          pips(questions.length, outcome, index)
        ),
        el(
          'div',
          { class: 'entry' },
          el(
            'div',
            { class: 'entry-top' },
            el('div', {}, el('h1', { class: 'headword', text: q.word.word }), el('p', { class: 'headword-meta' }, el('span', { class: 'pos', text: q.word.pos }))),
            sayButtons(ctx, q.word.word)
          ),
          el('hr', { class: 'entry-rule' }),
          el('p', { class: 'prompt', text: 'Choose the meaning' }),
          el('ul', { class: 'options' }, buttons.map((b) => el('li', {}, b)))
        ),
        after
      )
    );
    ctx.say(q.word.word);
    ctx.setKeys((e) => {
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= q.options.length) choose(n - 1);
      else if (answered && e.key === 'Enter') next();
      else return false;
      return true;
    });
  }

  show();
}
