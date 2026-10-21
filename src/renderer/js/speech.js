/**
 * Pronunciation through the operating system's speech engine (on Windows,
 * the built-in SAPI voices). Works offline and never sends audio anywhere.
 */

function isEnglish(voice) {
  return /^en([-_]|$)/i.test(voice.lang || '');
}

function rankVoice(voice) {
  let score = 0;
  if (/^en[-_]US/i.test(voice.lang)) score += 3;
  else if (/^en[-_]GB/i.test(voice.lang)) score += 2;
  if (/natural|neural/i.test(voice.name)) score += 2;
  if (voice.localService) score += 1;
  if (voice.default) score += 1;
  return score;
}

export function createSpeech(synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined) {
  const Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined;
  const supported = Boolean(synth && Utterance);
  let voices = [];
  let settings = { voiceURI: null, rate: 0.9 };
  const listeners = new Set();

  function refresh() {
    if (!supported) return;
    voices = synth
      .getVoices()
      .filter(isEnglish)
      .sort((a, b) => rankVoice(b) - rankVoice(a) || a.name.localeCompare(b.name));
    listeners.forEach((fn) => fn(voices));
  }

  if (supported) {
    refresh();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refresh);
  }

  function chosenVoice() {
    return voices.find((v) => v.voiceURI === settings.voiceURI) || voices[0] || null;
  }

  return {
    get supported() {
      return supported;
    },
    get voices() {
      return voices.slice();
    },
    onVoices(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    configure(next) {
      settings = { ...settings, ...next };
    },
    /** Speak text. `slow` halves the speed to help hear each syllable. */
    speak(text, { slow = false } = {}) {
      if (!supported || !text) return false;
      synth.cancel();
      const u = new Utterance(String(text).slice(0, 300));
      const voice = chosenVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = 'en-US';
      }
      u.rate = Math.min(1.5, Math.max(0.3, slow ? settings.rate * 0.55 : settings.rate));
      synth.speak(u);
      return true;
    },
    cancel() {
      if (supported) synth.cancel();
    }
  };
}
