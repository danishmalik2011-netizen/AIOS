/* ================================================
   Retrieval abstraction — the seam behind automatic codebase context.
   A `Retriever` turns a natural-language query into ranked source chunks.
   The lexical implementation ships today; a semantic (embeddings) one can
   slot in behind the same interface later.
   ================================================ */

export interface RetrievedChunk {
  /** Repo-relative path, e.g. "/src/foo.ts". */
  path: string;
  /** 1-based line number of the anchor match, if known. */
  line?: number;
  /** A short excerpt of the matching line/region. */
  preview: string;
  /** Higher = more relevant. */
  score: number;
}

export interface RetrieveOptions {
  /** Absolute project root the retriever operates against. */
  projectRoot: string;
  /** Maximum chunks to return. */
  maxChunks?: number;
  signal?: AbortSignal;
}

export interface Retriever {
  readonly id: 'lexical' | 'semantic';
  retrieve(query: string, opts: RetrieveOptions): Promise<RetrievedChunk[]>;
}
