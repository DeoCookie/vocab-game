/**
 * Tiny DOM builder. Text is always set through textContent, never parsed as
 * HTML, so word data can never inject markup or script.
 */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    } else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') {
      for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
    } else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = Boolean(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** SVG icon from a fixed internal set (paths are constants, never user data). */
const ICONS = {
  speaker: 'M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  slow: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z',
  home: 'M12 3 2 12h3v8h6v-5h2v5h6v-8h3L12 3z',
  cards: 'M4 6h12v14H4V6zm2 2v10h8V8H6zm12-4v14h-2V6H8V4h10z',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  spell: 'M3 17h2l1-3h4l1 3h2L9 6H7L3 17zm3.6-5L8 8l1.4 4H6.6zM14 10h7v2h-7v-2zm0 4h7v2h-7v-2zm0-8h7v2h-7V6z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  book: 'M6 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h11V4H6zm2 2h7v2H8V6zm0 4h7v2H8v-2z',
  grid: 'M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z',
  refresh: 'M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4l-2.3 2.3z',
  chart: 'M4 20V10h3v10H4zm6 0V4h3v16h-3zm6 0v-7h3v7h-3z',
  gear: 'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  flame: 'M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 11 11c0-4 1-9 1-9z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  cross: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  lock: 'M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 1 1 4 0v2h-4V7z',
  star: 'M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.4L12 18l-6.6 3.8 1.8-7.4L1.5 9.5 9 8.9z'
};

export function icon(name, { size = 20, label } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'icon');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.star);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/** Example sentence with the headword (or its inflection) emphasised. */
export function highlightWord(sentence, word) {
  const stem = word.length <= 4 ? word : word.slice(0, Math.max(4, word.length - 2));
  const lower = sentence.toLowerCase();
  const start = lower.indexOf(stem.toLowerCase());
  if (start < 0) return [sentence];
  let end = start + stem.length;
  while (end < sentence.length && /[a-z]/i.test(sentence[end])) end += 1;
  return [sentence.slice(0, start), el('mark', { class: 'headword-mark', text: sentence.slice(start, end) }), sentence.slice(end)];
}
