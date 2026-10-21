/** Short synthesized sound effects (no audio files, no network). */

export function createSound() {
  let ctx = null;
  let enabled = true;

  function context() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, start, duration, { type = 'sine', gain = 0.08 } = {}) {
    const ac = context();
    if (!ac) return;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    const t0 = ac.currentTime + start;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  const effects = {
    correct: () => {
      tone(660, 0, 0.12, { type: 'triangle' });
      tone(990, 0.09, 0.18, { type: 'triangle' });
    },
    wrong: () => tone(180, 0, 0.25, { type: 'sawtooth', gain: 0.04 }),
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, { type: 'triangle' })),
    tick: () => tone(1200, 0, 0.04, { type: 'square', gain: 0.02 })
  };

  return {
    setEnabled(value) {
      enabled = Boolean(value);
    },
    play(name) {
      if (!enabled || !effects[name]) return;
      try {
        effects[name]();
      } catch {
        /* audio is optional */
      }
    }
  };
}
