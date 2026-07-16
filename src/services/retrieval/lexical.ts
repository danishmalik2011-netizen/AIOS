/* ================================================
   Lexical retriever — offline, dependency-free codebase context.
   Extracts salient terms from the query, greps the real project via the
   Electron `fs.search` backend, and ranks files by how many distinct query
   terms they match. No embeddings, no API cost.
   ================================================ */

import type { Retriever, RetrieveOptions, RetrievedChunk } from './types';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was',
  'one', 'our', 'out', 'his', 'has', 'how', 'its', 'who', 'get', 'use', 'this',
  'that', 'with', 'from', 'have', 'what', 'when', 'where', 'which', 'would',
  'could', 'should', 'about', 'into', 'your', 'they', 'them', 'then', 'than',
  'file', 'files', 'code', 'does', 'make', 'need', 'want', 'find', 'show',
  'please', 'help', 'add', 'fix', 'change', 'update', 'implement', 'create',
]);

/** Pull distinctive identifier-like terms out of a natural-language query. */
export function extractTerms(query: string, max = 6): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  const tokens = query.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [];
  // Prefer longer / camelCase / snake_case identifiers first.
  const ranked = [...tokens].sort((a, b) => {
    const score = (t: string) => t.length + (/[A-Z_]/.test(t.slice(1)) ? 5 : 0);
    return score(b) - score(a);
  });
  for (const raw of ranked) {
    const term = raw;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    if (STOPWORDS.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= max) break;
  }
  return terms;
}

export const lexicalRetriever: Retriever = {
  id: 'lexical',

  async retrieve(query: string, opts: RetrieveOptions): Promise<RetrievedChunk[]> {
    const bridge = typeof window !== 'undefined' ? window.aios : undefined;
    if (!bridge || !opts.projectRoot) return [];

    const terms = extractTerms(query);
    if (terms.length === 0) return [];

    // path → { distinct term count, total hits, best match line/preview }
    const files = new Map<
      string,
      { terms: Set<string>; hits: number; line: number; preview: string }
    >();

    for (const term of terms) {
      if (opts.signal?.aborted) break;
      let matches;
      try {
        matches = await bridge.fs.search(opts.projectRoot, term, { maxResults: 40 });
      } catch {
        continue;
      }
      for (const m of matches) {
        const entry =
          files.get(m.path) ?? { terms: new Set<string>(), hits: 0, line: m.line, preview: m.preview };
        entry.terms.add(term.toLowerCase());
        entry.hits += 1;
        // Keep the earliest match as the representative preview.
        if (m.line < entry.line) {
          entry.line = m.line;
          entry.preview = m.preview;
        }
        files.set(m.path, entry);
      }
    }

    const chunks: RetrievedChunk[] = [...files.entries()].map(([path, e]) => ({
      path,
      line: e.line,
      preview: e.preview,
      // Distinct-term coverage dominates; raw hit count is a light tiebreaker.
      score: e.terms.size * 10 + Math.min(e.hits, 10),
    }));

    chunks.sort((a, b) => b.score - a.score);
    return chunks.slice(0, opts.maxChunks ?? 8);
  },
};
