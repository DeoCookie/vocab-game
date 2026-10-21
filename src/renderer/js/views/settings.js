import { el, clear } from '../dom.js';
import { LEVEL_NAMES } from './entry.js';

function setting(label, help, control, id) {
  return el(
    'div',
    { class: 'setting' },
    el('label', { class: 'setting-label', for: id, text: label }),
    el('span', { class: 'setting-help', text: help }),
    el('div', { class: 'setting-control' }, control)
  );
}

export function mountSettings(root, ctx) {
  const s = ctx.progress.settings;
  const update = (patch) => ctx.updateSettings(patch);

  const voice = el('select', { class: 'select', id: 'voice' });
  function fillVoices() {
    const voices = ctx.speech.voices;
    clear(voice);
    if (!voices.length) {
      voice.append(el('option', { value: '', text: ctx.speech.supported ? 'System default' : 'Speech not available' }));
      return;
    }
    for (const v of voices) {
      voice.append(el('option', { value: v.voiceURI, text: `${v.name} (${v.lang})`, selected: v.voiceURI === ctx.progress.settings.voiceURI }));
    }
  }
  fillVoices();
  const stopListening = ctx.speech.onVoices(fillVoices);
  voice.addEventListener('change', () => update({ voiceURI: voice.value || null }));

  const rateLabel = el('span', { text: `${s.rate.toFixed(2)}x` });
  const rate = el('input', { class: 'range', id: 'rate', type: 'range', min: '0.5', max: '1.5', step: '0.05', value: String(s.rate) });
  rate.addEventListener('input', () => {
    rateLabel.textContent = `${Number(rate.value).toFixed(2)}x`;
  });
  rate.addEventListener('change', () => update({ rate: Number(rate.value) }));

  const test = el('button', { type: 'button', class: 'btn btn-quiet', text: 'Test voice', on: { click: () => ctx.say('Serendipity is a delightful word.') } });

  const sound = el('input', { class: 'switch', id: 'sound', type: 'checkbox', role: 'switch', checked: s.sound });
  sound.addEventListener('change', () => update({ sound: sound.checked }));

  const theme = el(
    'select',
    { class: 'select', id: 'theme' },
    [
      ['system', 'Match Windows'],
      ['light', 'Light'],
      ['dark', 'Dark']
    ].map(([value, text]) => el('option', { value, text, selected: s.theme === value }))
  );
  theme.addEventListener('change', () => update({ theme: theme.value }));

  const level = el(
    'select',
    { class: 'select', id: 'level' },
    el('option', { value: 'all', text: 'All 500 words', selected: s.level === 'all' }),
    [1, 2, 3].map((n) => el('option', { value: String(n), text: `${LEVEL_NAMES[n]} only`, selected: s.level === String(n) }))
  );
  level.addEventListener('change', () => update({ level: level.value }));

  const reset = el('button', {
    type: 'button',
    class: 'btn btn-danger',
    id: 'reset',
    text: 'Reset progress',
    on: {
      click: async () => {
        const ok = await ctx.confirm('Reset all progress?', 'This clears your XP, streak, achievements and the review history for every word. Settings are kept. This cannot be undone.', 'Reset progress');
        if (ok) ctx.resetProgress();
      }
    }
  });

  const about = el(
    'div',
    { class: 'about' },
    el('p', { id: 'about-version', text: 'Vocab Quest' }),
    el('p', { text: 'Free and open-source software, released under the MIT License.' }),
    el('p', { text: 'Runs fully offline. Your progress is stored only on this computer, and nothing is sent over the internet.' })
  );
  ctx.appInfo().then((info) => {
    const node = about.querySelector('#about-version');
    if (node && info) node.textContent = `${info.name} version ${info.version}`;
  });

  root.append(
    el(
      'div',
      { class: 'page' },
      el('header', { class: 'page-head' }, el('h1', { class: 'page-title', text: 'Settings' })),
      ctx.speech.supported ? null : el('p', { class: 'notice', text: 'No speech voices were found. Install an English voice in Windows Settings > Time & language > Speech.' }),
      el(
        'div',
        { class: 'settings' },
        setting('Voice', 'English voices installed on this computer.', voice, 'voice'),
        setting('Speaking speed', 'How fast words are read aloud.', el('span', { class: 'setting-control' }, rate, rateLabel, test), 'rate'),
        setting('Sound effects', 'Short tones for right and wrong answers.', sound, 'sound'),
        setting('Appearance', 'Light, dark, or follow your Windows setting.', theme, 'theme'),
        setting('Word level', 'Which words the games draw from.', level, 'level'),
        setting('Start over', 'Clear your progress and begin again.', reset, 'reset')
      ),
      about
    )
  );

  return () => stopListening();
}
