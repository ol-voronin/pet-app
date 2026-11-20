/**
 * Helpers for forgiving search: what people type is rarely what is on the signboard.
 */

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const UK = 'йцукенгшщзхїфівапролджєячсмитьбюʼ';
const EN_CHARS = Array.from(EN);
const UK_CHARS = Array.from(UK);
const EN_TO_UK = new Map(EN_CHARS.map((ch, i) => [ch, UK_CHARS[i] ?? ch]));
const UK_TO_EN = new Map(UK_CHARS.map((ch, i) => [ch, EN_CHARS[i] ?? ch]));

/** Lower case, one kind of apostrophe, single spaces. */
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[’'`ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function remap(text: string, table: Map<string, string>): string {
  return Array.from(text, (ch) => table.get(ch) ?? ch).join('');
}

/**
 * The query as typed plus what it would be on the other keyboard layout:
 * `dtnfgntrf` → `ветаптека`, `муе` → `vet`. Russian-only letters land close enough for fuzzy matching.
 */
export function queryVariants(q: string): string[] {
  const base = normalizeQuery(q);
  if (!base) return [];
  const variants = new Set([base]);
  const hasLatin = /[a-z]/.test(base);
  const hasCyrillic = /[а-яіїєґё]/.test(base);
  // A mixed query is deliberate («Zoo маркет»); remapping it would only produce noise.
  if (hasLatin && !hasCyrillic) variants.add(remap(base, EN_TO_UK));
  if (hasCyrillic && !hasLatin) variants.add(remap(base.replace(/'/g, 'ʼ'), UK_TO_EN));
  return [...variants];
}

function trigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

/**
 * How well `query` matches some part of `text`, 0…1. A JavaScript stand-in for Postgres
 * `word_similarity` (pg_trgm), used by the in-memory repository in tests.
 */
export function similarity(query: string, text: string): number {
  const q = normalizeQuery(query);
  const t = normalizeQuery(text);
  if (!q || !t) return 0;
  if (t.includes(q)) return 1;
  const wanted = trigrams(q);
  let best = 0;
  const words = t.split(' ');
  // Compare with every word and every pair of neighbours, like word_similarity's sliding extent.
  const candidates = [...words, ...words.slice(1).map((w, i) => `${words[i] ?? ''} ${w}`)];
  for (const candidate of candidates) {
    const have = trigrams(candidate);
    let shared = 0;
    for (const g of wanted) if (have.has(g)) shared += 1;
    best = Math.max(best, shared / wanted.size);
  }
  return best;
}

/** Below this a result is noise. Tuned on real names: «ветклиника» must find «Ветклініка». */
export const MIN_SIMILARITY = 0.45;
