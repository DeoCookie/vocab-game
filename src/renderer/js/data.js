/** Loads the word list and synonym/antonym definitions, and builds lookups. */

export const TIER_IDS = Object.freeze(['beginner', 'expert', 'master']);
export const SET_SIZE = 10;
export const SETS_PER_TIER = 50;

/** Build all indexes from the raw data files. Pure, so it can be unit tested. */
export function buildData(wordDoc, glossDoc) {
  if (!wordDoc || !Array.isArray(wordDoc.words) || wordDoc.words.length === 0) {
    throw new Error('Word list is empty or damaged.');
  }
  const words = wordDoc.words;
  const tiers = Array.isArray(wordDoc.tiers) ? wordDoc.tiers : TIER_IDS.map((id) => ({ id, name: id }));
  const byWord = new Map(words.map((w) => [w.word, w]));
  const byTier = {};
  for (const t of TIER_IDS) {
    byTier[t] = words.filter((w) => w.tier === t).sort((a, b) => a.order - b.order);
  }
  const glosses = new Map(Object.entries((glossDoc && glossDoc.glosses) || {}));

  return {
    words,
    tiers,
    byWord,
    byTier,
    tierName(id) {
      const t = tiers.find((x) => x.id === id);
      return t ? t.name : id;
    },
    setNumber(word) {
      return Math.ceil(word.order / SET_SIZE);
    },
    setWords(tier, number) {
      const lo = (number - 1) * SET_SIZE + 1;
      return (byTier[tier] || []).filter((w) => w.order >= lo && w.order < lo + SET_SIZE);
    },
    /** Short definition for a synonym or antonym (falls back to the full entry). */
    gloss(term) {
      if (glosses.has(term)) return glosses.get(term);
      const entry = byWord.get(term);
      return entry ? entry.definition : null;
    }
  };
}

export async function loadData(fetchImpl = fetch) {
  const [wordsRes, glossRes] = await Promise.all([fetchImpl('data/words.json'), fetchImpl('data/glosses.json')]);
  if (!wordsRes.ok) throw new Error(`Word list failed to load (${wordsRes.status}).`);
  const wordDoc = await wordsRes.json();
  const glossDoc = glossRes.ok ? await glossRes.json() : { glosses: {} };
  return buildData(wordDoc, glossDoc);
}
