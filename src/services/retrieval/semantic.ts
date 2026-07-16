/* ================================================
   Semantic retriever — embeddings-based relevance. Interface-only seam.
   Not implemented yet: this is the documented extension point for adding an
   embeddings index (build vectors for repo chunks, embed the query, cosine-
   rank). It satisfies the `Retriever` contract so `getRetriever('semantic')`
   can swap in without touching call sites once implemented.
   ================================================ */

import type { Retriever, RetrieveOptions, RetrievedChunk } from './types';

export const semanticRetriever: Retriever = {
  id: 'semantic',

  async retrieve(_query: string, _opts: RetrieveOptions): Promise<RetrievedChunk[]> {
    // TODO: build/refresh an embeddings index of the project, embed the query
    // via the configured provider, cosine-rank chunks. Requires an embeddings
    // API key + a persisted index. Until then, callers should use 'lexical'.
    throw new Error('Semantic retrieval is not implemented yet — use the lexical retriever.');
  },
};
