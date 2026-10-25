/**
 * Runs a sequence of tasks in stages (e.g. meet the words, then meanings,
 * then spelling). Wrong answers can be re-queued at the end of the stage so a
 * lesson finishes with every word answered correctly at least once.
 */
import { el, clear } from './dom.js';
import { xpFor } from './quiz.js';
import { TASK_RENDERERS } from './tasks.js';
import { progressBar, results } from './views/entry.js';

const GRADED = new Set(['meaning', 'relation', 'spelling']);

export function runSession(root, ctx, { title, stages, requeue = false, maxRetries = 2, again, againLabel, finishTitle, onFinish }) {
  const queues = stages.map((s) => s.tasks.map((t) => ({ ...t, tries: 0 })));
  const firstTry = new Map();
  const missed = new Map();
  let stageIndex = 0;
  let combo = 0;
  let xpTotal = 0;
  let completed = 0;
  let finished = false;
  const totalPlanned = () => queues.reduce((n, q) => n + q.length, 0) + completed;

  function current() {
    while (stageIndex < queues.length && queues[stageIndex].length === 0) stageIndex += 1;
    return stageIndex < queues.length ? queues[stageIndex][0] : null;
  }

  function finish() {
    if (finished) return;
    finished = true;
    ctx.setKeys(null);
    ctx.finishSession();
    const graded = [...firstTry.values()];
    const summary = {
      score: graded.filter(Boolean).length,
      total: graded.length,
      xp: xpTotal,
      missed: [...missed.values()]
    };
    clear(root);
    const extra = onFinish ? onFinish(summary) : null;
    root.append(
      results(ctx, {
        title: finishTitle || `${title} complete`,
        score: summary.score,
        total: summary.total,
        xp: summary.xp,
        missed: summary.missed,
        again,
        againLabel,
        extra
      })
    );
    root.querySelector('#again')?.focus();
  }

  function show() {
    const task = current();
    if (!task) return finish();
    clear(root);
    const stage = stages[stageIndex];
    const body = el('div', {});
    const remainingInStage = queues[stageIndex].length;
    const nextLabel = remainingInStage > 1 || queues.slice(stageIndex + 1).some((q) => q.length) ? 'Next' : 'Finish';
    root.append(
      el(
        'div',
        { class: 'page' },
        el(
          'div',
          { class: 'session-bar' },
          el('span', { class: 'session-title' }, el('b', { text: title }), stages.length > 1 ? ` ${stage.title}` : ''),
          el('span', { class: 'combo', text: combo > 1 ? `Combo x${combo}` : '' }),
          el('span', { class: 'session-count', text: `${completed + 1} of ${totalPlanned()}` })
        ),
        progressBar(completed, totalPlanned(), `${title} progress`),
        body
      )
    );
    let answeredOnce = false;
    const api = {
      nextLabel,
      answer(correct, { mode = task.type, check = null, hintsUsed = 0 } = {}) {
        if (answeredOnce) return 0;
        answeredOnce = true;
        const isGraded = GRADED.has(task.type);
        if (isGraded) {
          combo = correct ? combo + 1 : 0;
          const key = `${task.type}:${task.word.word}`;
          if (!firstTry.has(key)) firstTry.set(key, correct);
          if (!correct) missed.set(task.word.word, task.word);
        }
        const gained = task.type === 'card' ? xpFor('card', true) : xpFor(mode === 'antonym' || mode === 'synonym' ? 'relation' : mode, correct, { combo: Math.max(0, combo - 1), hintsUsed });
        xpTotal += gained;
        ctx.answer({ word: task.word.word, correct, mode: task.type === 'card' ? 'card' : mode, xp: gained, check });
        if (isGraded && !correct && requeue && task.tries < maxRetries) {
          queues[stageIndex].push({ ...task, tries: task.tries + 1 });
        }
        return gained;
      },
      next() {
        queues[stageIndex].shift();
        completed += 1;
        show();
      }
    };
    TASK_RENDERERS[task.type](body, ctx, task, api);
  }

  show();
  return () => {
    finished = true;
  };
}
