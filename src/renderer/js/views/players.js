import { el, clear } from '../dom.js';
import { levelInfo, MAX_PROFILES, NAME_MAX, PROFILE_COLORS } from '../state.js';
import { tierSummary } from '../sets.js';

export function avatar(profile, size = 'md') {
  const initial = Array.from(profile.name.trim())[0] || '?';
  return el('span', { class: `avatar avatar-${size} color-${profile.color}`, 'aria-hidden': 'true', text: initial.toUpperCase() });
}

/** "Who's playing?" — pick, add, rename or remove players. */
export function mountPlayers(root, ctx) {
  const doc = ctx.doc;
  let editing = null;

  function render() {
    clear(root);
    const cards = doc.profiles.map((p) => {
      const active = p.id === doc.activeProfileId;
      const sum = tierSummary(p.progress, ctx.data, p.progress.tier);
      const lvl = levelInfo(p.progress.xp);
      const isEditing = editing === p.id;
      const nameInput = el('input', { class: 'text-input', id: `rename-${p.id}`, type: 'text', value: p.name, maxlength: String(NAME_MAX), 'aria-label': `New name for ${p.name}` });
      return el(
        'li',
        { class: `player-card${active ? ' is-active' : ''}`, dataset: { profile: p.id } },
        avatar(p, 'lg'),
        el(
          'div',
          { class: 'player-info' },
          isEditing ? nameInput : el('b', { class: 'player-name', text: p.name }),
          el('span', { class: 'player-meta', text: `Level ${lvl.level}. ${ctx.data.tierName(p.progress.tier)}: ${sum.learnedSets} of 50 sets learned.` })
        ),
        el(
          'div',
          { class: 'player-actions' },
          isEditing
            ? [
                el('button', {
                  type: 'button',
                  class: 'btn btn-primary',
                  text: 'Save name',
                  on: {
                    click: () => {
                      ctx.renameProfile(p.id, nameInput.value);
                      editing = null;
                      render();
                    }
                  }
                }),
                el('button', { type: 'button', class: 'btn btn-quiet', text: 'Cancel', on: { click: () => ((editing = null), render()) } })
              ]
            : [
                active
                  ? el('span', { class: 'playing-now', text: 'Playing now' })
                  : el('button', { type: 'button', class: 'btn btn-primary', text: `Play as ${p.name}`, on: { click: () => ctx.switchProfile(p.id) } }),
                el('button', { type: 'button', class: 'btn btn-quiet', text: 'Rename', 'aria-label': `Rename ${p.name}`, on: { click: () => ((editing = p.id), render()) } }),
                el('button', {
                  type: 'button',
                  class: 'btn btn-quiet',
                  text: 'Remove',
                  'aria-label': `Remove ${p.name}`,
                  disabled: doc.profiles.length <= 1,
                  on: {
                    click: async () => {
                      const ok = await ctx.confirm(`Remove ${p.name}?`, `This deletes ${p.name}'s progress on this computer. It cannot be undone.`, 'Remove player');
                      if (ok) ctx.removeProfile(p.id);
                    }
                  }
                })
              ]
        )
      );
    });

    const name = el('input', { class: 'text-input', id: 'new-player-name', type: 'text', maxlength: String(NAME_MAX), placeholder: 'Name', 'aria-label': 'New player name', autocomplete: 'off' });
    let color = PROFILE_COLORS[doc.profiles.length % PROFILE_COLORS.length];
    const swatches = el(
      'div',
      { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' },
      PROFILE_COLORS.map((c) =>
        el('button', {
          type: 'button',
          class: `swatch-btn color-${c}`,
          role: 'radio',
          'aria-checked': c === color ? 'true' : 'false',
          'aria-label': c,
          on: {
            click: (e) => {
              color = c;
              swatches.querySelectorAll('.swatch-btn').forEach((b) => b.setAttribute('aria-checked', 'false'));
              e.currentTarget.setAttribute('aria-checked', 'true');
            }
          }
        })
      )
    );
    const full = doc.profiles.length >= MAX_PROFILES;
    const form = el(
      'form',
      {
        class: 'add-player',
        on: {
          submit: (e) => {
            e.preventDefault();
            if (full) return;
            ctx.addProfile({ name: name.value, color });
          }
        }
      },
      el('label', { class: 'setting-label', for: 'new-player-name', text: 'Add a player' }),
      el('div', { class: 'add-player-row' }, name, swatches, el('button', { type: 'submit', class: 'btn btn-primary', id: 'add-player', text: 'Add player', disabled: full })),
      full ? el('p', { class: 'setting-help', text: `You can have up to ${MAX_PROFILES} players.` }) : null
    );

    root.append(
      el(
        'div',
        { class: 'page' },
        el(
          'header',
          { class: 'page-head' },
          el('h1', { class: 'page-title', text: "Who's playing?" }),
          el('p', { class: 'page-lede', text: 'Each player has their own progress, settings and streak. Everything stays on this computer.' })
        ),
        el('ul', { class: 'player-list' }, cards),
        form
      )
    );
  }

  render();
  return null;
}
