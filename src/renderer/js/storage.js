/**
 * Saves progress through the preload bridge when running in the desktop app.
 * Falls back to localStorage when the page is opened in a plain browser
 * (used for development and automated UI tests).
 */
const LOCAL_KEY = 'vocab-quest-progress';

function localBackend() {
  return {
    async load() {
      try {
        const raw = window.localStorage.getItem(LOCAL_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async save(data) {
      try {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      } catch {
        /* storage unavailable: progress lives for this session only */
      }
    }
  };
}

function bridgeBackend(api) {
  return {
    load: () => api.loadProgress(),
    save: (data) => api.saveProgress(data)
  };
}

export function createStorage({ delay = 400, onError = () => {} } = {}) {
  const api = typeof window !== 'undefined' ? window.vocabAPI : undefined;
  const backend = api && typeof api.loadProgress === 'function' ? bridgeBackend(api) : localBackend();
  let pending = null;
  let timer = null;

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const data = pending;
    pending = null;
    try {
      await backend.save(data);
    } catch (err) {
      onError(err);
    }
  }

  return {
    load: async () => {
      try {
        return await backend.load();
      } catch (err) {
        onError(err);
        return null;
      }
    },
    /** Debounced save: rapid answers are coalesced into one write. */
    save(data) {
      pending = data;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush
  };
}
