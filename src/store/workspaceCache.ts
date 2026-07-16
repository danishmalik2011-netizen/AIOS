/* ================================================================
   Per-session workspace tab cache. The Files view keeps its
   open tabs / active file / dirty drafts / read contents in a
   single slice of useProjectStore. To let each chat remember
   its own open tabs when you switch conversations, we stash
   that slice keyed by session id on the way out and restore
   it on the way in. (Not persisted across app restarts —
   same as the pre-existing behaviour.)
   ================================================================ */

import type { ProjectFile } from '@/core/types';

export interface TabState {
  openFiles: ProjectFile[];
  activeFileId: string | null;
  fileContents: Record<string, string>;
  dirtyFileIds: Set<string>;
}

const cache = new Map<string, TabState>();

export function cacheTabs(sessionId: string, state: TabState): void {
  cache.set(sessionId, state);
}

export function getCachedTabs(sessionId: string): TabState | undefined {
  return cache.get(sessionId);
}
