/**
 * One shared tooltip for synonym/antonym chips. It appears on hover and on
 * keyboard focus, is announced to screen readers via aria-describedby, and
 * closes with Escape. Text is set with textContent only.
 */
import { el } from './dom.js';

let tip = null;
let owner = null;

function ensure() {
  if (tip) return tip;
  tip = el('div', { class: 'tooltip', id: 'gloss-tooltip', role: 'tooltip', hidden: true },
    el('span', { class: 'tooltip-term' }),
    el('span', { class: 'tooltip-text' }),
    el('span', { class: 'tooltip-meta' })
  );
  document.body.append(tip);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  return tip;
}

function place(target) {
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const margin = 8;
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - t.width - margin));
  let top = r.top - t.height - 10;
  let below = false;
  if (top < margin) {
    top = r.bottom + 10;
    below = true;
  }
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.classList.toggle('is-below', below);
}

export function show(target, { term, text, meta }) {
  ensure();
  owner = target;
  tip.querySelector('.tooltip-term').textContent = term;
  tip.querySelector('.tooltip-text').textContent = text || 'No definition available.';
  tip.querySelector('.tooltip-meta').textContent = meta || '';
  tip.hidden = false;
  target.setAttribute('aria-describedby', 'gloss-tooltip');
  place(target);
}

export function hide() {
  if (!tip || tip.hidden) return;
  tip.hidden = true;
  if (owner) owner.removeAttribute('aria-describedby');
  owner = null;
}

/** Attach tooltip behaviour to an element. `info` is called lazily when shown. */
export function attachTooltip(target, info) {
  const open = () => show(target, info());
  target.addEventListener('mouseenter', open);
  target.addEventListener('focus', open);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('blur', hide);
  return target;
}
