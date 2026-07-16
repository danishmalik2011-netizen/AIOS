/* ================================================
   Retrieval entry point — pick a retriever and assemble an automatic
   context block (a compact repo map + the most relevant file snippets) that
   the chat injects ahead of the user's message, à la Cursor / Claude Code.
   ================================================ */

import type { ProjectFile } from '@/core/types';
import type { Retriever, RetrievedChunk } from './types';
import { lexicalRetriever } from './lexical';
import { semanticRetriever } from './semantic';

export type RetrievalMode = 'lexical' | 'semantic';

export function getRetriever(mode: RetrievalMode = 'lexical'): Retriever {
  return mode === 'semantic' ? semanticRetriever : lexicalRetriever;
}

const REPO_MAP_MAX_ENTRIES = 200;

/** A compact indented listing of the project tree (capped), for orientation. */
export function buildRepoMap(tree: ProjectFile[], maxEntries = REPO_MAP_MAX_ENTRIES): string {
  const lines: string[] = [];
  let count = 0;
  const walk = (nodes: ProjectFile[], depth: number) => {
    for (const node of nodes) {
      if (count >= maxEntries) return;
      count++;
      lines.push(`${'  '.repeat(depth)}${node.name}${node.type === 'directory' ? '/' : ''}`);
      if (node.type === 'directory' && node.children) walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  if (count >= maxEntries) lines.push('… (tree truncated)');
  return lines.join('\n');
}

interface GatherContextArgs {
  query: string;
  projectRoot: string | null;
  fileTree: ProjectFile[];
  mode?: RetrievalMode;
  maxChunks?: number;
  signal?: AbortSignal;
}

/**
 * Build the automatic-context block for a turn: a repo map plus ranked
 * snippets. Returns an empty string when there's no open project (browser /
 * demo mode) so callers can inject unconditionally.
 */
export async function gatherContext(args: GatherContextArgs): Promise<string> {
  const { query, projectRoot, fileTree, mode = 'lexical', maxChunks = 8, signal } = args;
  if (!projectRoot) return '';

  const repoMap = buildRepoMap(fileTree);

  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await getRetriever(mode).retrieve(query, { projectRoot, maxChunks, signal });
  } catch {
    chunks = [];
  }

  const parts: string[] = [];
  parts.push('=== Workspace Context (auto-retrieved) ===');
  if (repoMap) {
    parts.push('\nProject structure:\n' + repoMap);
  }
  if (chunks.length > 0) {
    parts.push(
      '\nRelevant locations (use read_file / search_code to inspect further):\n' +
        chunks
          .map((c) => `- ${c.path}:${c.line ?? 1} — ${c.preview}`)
          .join('\n'),
    );
  }
  parts.push(
    '\nThe user has an open project. Prefer calling read_file / search_code to gather exact context before answering or editing.',
  );
  return parts.join('\n');
}
