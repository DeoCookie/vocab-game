import { el, clear } from '../dom.js';
import { makeRelationQuestion, xpFor } from '../quiz.js';
import { pick } from '../rng.js';

const DURATION = 60;

export function mountSprint(root, ctx) {
  const pool = ctx.data.byTier[ctx.progress.tier];
  let timer = null;
  let ended = false;

  function intro() {
    clear(root);
    root.append(
      el(
        'div',
        { class: 'page' },
        el(
          'header',
          { class: 'page-head' },
          el('h1', { class: 'page-title', text: 'Word sprint' }),
          el('p', {
            class: 'page-lede',
            text: `You have ${DURATION} seconds. Each round asks for a synonym (same meaning) or an antonym (opposite meaning) of a ${ctx.data.tierName(ctx.progress.tier)} word. Answer with the mouse or keys 1 to 4.`
          })
        ),
        el('p', { class: 'notice', text: `Your best score so far: ${ctx.progress.stats.sprintBest}` }),
        el('button', { type: 'button', class: 'btn btn-primary', id: 'start-sprint', text: 'Start the clock', on: { click: start } })
      )
    );
    ctx.setKeys((e) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        start();
        return true;
      }
      return false;
    });
  }

  function start() {
    let remaining = DURATION;
    let score = 0;
    let combo = 0;
    let xp = 0;
    let locked = false;
    const missed = new Map();
    ended = false;
    clear(root);

    const clock = el('div', { class: 'timer', role: 'timer', 'aria-label': 'Seconds left', text: String(remaining) });
    const bar = el('span', { style: { width: '100%' } });
    const scoreLabel = el('span', { text: 'Score 0' });
    const stage = el('div', {});
    root.append(
      el(
        'div',
        { class: 'page' },
        el('div', { class: 'session-bar' }, clock, scoreLabel),
        el('div', { class: 'timer-track' }, bar),
        stage
      )
    );

    function round() {
      if (ended) return;
      locked = false;
      const word = pick(pool, ctx.rng);
      const kind = ctx.rng() < 0.5 ? 'synonym' : 'antonym';
      const q = makeRelationQuestion(word, ctx.data.words, ctx.rng, kind);
      const buttons = q.options.map((text, i) =>
        el('button', { type: 'button', class: 'option is-big', dataset: { index: String(i) }, on: { click: () => choose(i) } },
          el('span', { class: 'option-key', text: String(i + 1) }),
          el('span', { text })
        )
      );
      clear(stage).append(
        el('span', { class: `relation-badge ${q.type === 'synonym' ? 'is-syn' : 'is-ant'}`, text: q.type === 'synonym' ? 'Find a synonym' : 'Find an antonym' }),
        el('p', { class: 'sprint-word', text: word.word }),
        el('ul', { class: 'options is-grid' }, buttons.map((b) => el('li', {}, b)))
      );

      function choose(i) {
        if (locked || ended) return;
        locked = true;
        const correct = i === q.answerIndex;
        combo = correct ? combo + 1 : 0;
        const gained = xpFor(q.type, correct, { combo: Math.max(0, combo - 1) });
        xp += gained;
        if (correct) score += 1;
        else missed.set(word.word, word);
        buttons.forEach((b, j) => {
          b.disabled = true;
          if (j === q.answerIndex) b.classList.add('is-right');
          else if (j === i) b.classList.add('is-wrong');
        });
        scoreLabel.textContent = combo > 1 ? `Score ${score}, combo x${combo}` : `Score ${score}`;
        ctx.answer({ word: word.word, correct, mode: q.type, xp: gained, check: 'relation' });
        setTimeout(() => {
          if (!ended) round();
        }, correct ? 350 : 1100);
      }

      ctx.setKeys((e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= q.options.length) {
          choose(n - 1);
          return true;
        }
        return false;
      });
    }

    timer = setInterval(() => {
      remaining -= 1;
      clock.textContent = String(Math.max(0, remaining));
      clock.classList.toggle('is-low', remaining <= 10);
      bar.style.width = `${(Math.max(0, remaining) / DURATION) * 100}%`;
      if (remaining <= 5 && remaining > 0) ctx.sound.play('tick');
      if (remaining <= 0) finish();
    }, 1000);

    function finish() {
      ended = true;
      clearInterval(timer);
      timer = null;
      const best = ctx.progress.stats.sprintBest;
      ctx.finishSession({ sprintScore: score });
      clear(root);
      const words = [...missed.values()];
      root.append(
        el(
          'section',
          { class: 'page result' },
          el('h1', { class: 'page-title', text: score > best ? 'New personal best' : 'Time is up' }),
          el('p', { class: 'result-score', text: String(score) }),
          el('p', { class: 'result-caption', text: `correct answers, +${xp} XP` }),
          el(
            'div',
            { class: 'btn-row', style: { 'justify-content': 'center' } },
            el('button', { type: 'button', class: 'btn btn-primary', text: 'Sprint again', on: { click: start } }),
            el('button', { type: 'button', class: 'btn btn-quiet', text: 'Back to today', on: { click: () => ctx.navigate('home') } })
          ),
          words.length
            ? el(
                'ul',
                { class: 'review-list' },
                words.map((w) =>
                  el('li', { class: 'review-item' }, el('b', { text: w.word }), el('span', { text: ` — similar: ${w.synonyms.join(', ')}${w.antonyms.length ? `; opposite: ${w.antonyms.join(', ')}` : ''}` }))
                )
              )
            : null
        )
      );
      ctx.setKeys(null);
    }

    round();
  }

  intro();
  return () => {
    ended = true;
    if (timer) clearInterval(timer);
  };
}
