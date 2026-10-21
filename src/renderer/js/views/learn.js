import { el, clear } from '../dom.js';
import { pickWords } from '../srs.js';
import { entry, pips, results } from './entry.js';

const SESSION = 10;

export function mountLearn(root, ctx) {
  const words = pickWords(ctx.words, ctx.progress.words, {
    count: SESSION,
    level: ctx.progress.settings.level,
    rng: ctx.rng
  });
  const outcome = [];
  let index = 0;
  let xp = 0;

  function answer(known) {
    const word = words[index];
    const gained = known ? 4 : 2;
    xp += gained;
    outcome[index] = known;
    ctx.answer({ word: word.word, correct: known, mode: 'learn', xp: gained });
    index += 1;
    show();
  }

  function show() {
    clear(root);
    if (index >= words.length) {
      ctx.finishSession();
      const missed = words.filter((_, i) => outcome[i] === false);
      root.append(
        results(ctx, {
          title: 'Cards done',
          score: outcome.filter(Boolean).length,
          total: words.length,
          xp,
          missed,
          again: () => ctx.navigate('learn', { force: true })
        })
      );
      ctx.setKeys(null);
      return;
    }
    const word = words[index];
    root.append(
      el(
        'div',
        { class: 'page' },
        el(
          'div',
          { class: 'session-bar' },
          el('span', { text: `Card ${index + 1} of ${words.length}` }),
          pips(words.length, outcome, index)
        ),
        entry(ctx, word),
        el(
          'div',
          { class: 'next-row btn-row' },
          el(
            'button',
            { type: 'button', class: 'btn btn-quiet', id: 'still-learning', on: { click: () => answer(false) } },
            'Still learning ',
            el('span', { class: 'kbd', text: '1' })
          ),
          el(
            'button',
            { type: 'button', class: 'btn btn-primary', id: 'i-know-it', on: { click: () => answer(true) } },
            'I know this word ',
            el('span', { class: 'kbd', text: '2' })
          )
        )
      )
    );
    ctx.say(word.word);
    ctx.setKeys((e) => {
      if (e.key === '1') answer(false);
      else if (e.key === '2') answer(true);
      else if (e.key === ' ') {
        e.preventDefault();
        ctx.say(word.word);
      } else return false;
      return true;
    });
  }

  show();
}
