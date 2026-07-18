import { ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { CHANNELS } from './channels.js';

let activeWatcher: FSWatcher | null = null;

export interface FsTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  size?: number;
  children?: FsTreeNode[];
}

export interface FsSearchMatch {
  /** Repo-relative POSIX path, e.g. "/src/foo.ts". */
  path: string;
  /** 1-based line number of the match. */
  line: number;
  /** 1-based column of the first match on the line. */
  column: number;
  /** Trimmed source line containing the match (length-capped). */
  preview: string;
}

export interface FsSearchOptions {
  maxResults?: number;
  caseSensitive?: boolean;
  isRegex?: boolean;
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'release', 'build', '.next', '.cache',
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.css': 'css', '.scss': 'css',
  '.json': 'json',
  '.md': 'markdown', '.mdx': 'markdown',
  '.html': 'html',
  '.yml': 'yaml', '.yaml': 'yaml',
};

function languageFor(name: string): string | undefined {
  return LANGUAGE_BY_EXT[path.extname(name).toLowerCase()];
}

const MAX_ENTRIES = 5000;
let entryCount = 0;

async function readDir(dirPath: string, rootPath: string): Promise<FsTreeNode[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: FsTreeNode[] = [];
  for (const entry of entries) {
    if (entryCount >= MAX_ENTRIES) break;
    if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env') continue;
    const absPath = path.join(dirPath, entry.name);
    const relPath = '/' + path.relative(rootPath, absPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      entryCount++;
      nodes.push({
        id: relPath,
        name: entry.name,
        path: relPath,
        type: 'directory',
        children: await readDir(absPath, rootPath),
      });
    } else if (entry.isFile()) {
      entryCount++;
      let size: number | undefined;
      try {
        size = (await fs.stat(absPath)).size;
      } catch {
        size = undefined;
      }
      nodes.push({
        id: relPath,
        name: entry.name,
        path: relPath,
        type: 'file',
        language: languageFor(entry.name),
        size,
      });
    }
  }
  return nodes;
}

/* ---- Content search ------------------------------------------------ */

const SEARCH_MAX_FILES = 4000;
const SEARCH_MAX_FILE_BYTES = 512 * 1024;
const SEARCH_PREVIEW_MAX = 200;
const SEARCH_DEFAULT_MAX_RESULTS = 200;

/** Recursively collect scannable file paths, skipping ignored/hidden/large. */
async function collectSearchFiles(
  dirPath: string,
  rootPath: string,
  acc: string[],
): Promise<void> {
  if (acc.length >= SEARCH_MAX_FILES) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (acc.length >= SEARCH_MAX_FILES) return;
    if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env') continue;
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await collectSearchFiles(absPath, rootPath, acc);
    } else if (entry.isFile()) {
      acc.push(absPath);
    }
  }
}

function buildSearchMatcher(query: string, opts: FsSearchOptions): RegExp {
  const flags = opts.caseSensitive ? 'g' : 'gi';
  if (opts.isRegex) {
    try {
      return new RegExp(query, flags);
    } catch {
      /* fall through to literal on invalid regex */
    }
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, flags);
}

async function searchInFiles(
  rootPath: string,
  query: string,
  opts: FsSearchOptions,
): Promise<FsSearchMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const maxResults = Math.max(1, Math.min(opts.maxResults ?? SEARCH_DEFAULT_MAX_RESULTS, 1000));
  const matcher = buildSearchMatcher(trimmed, opts);

  const files: string[] = [];
  await collectSearchFiles(rootPath, rootPath, files);

  const results: FsSearchMatch[] = [];
  for (const absPath of files) {
    if (results.length >= maxResults) break;

    let stat: import('node:fs').Stats;
    try {
      stat = await fs.stat(absPath);
    } catch {
      continue;
    }
    if (stat.size > SEARCH_MAX_FILE_BYTES) continue;

    let content: string;
    try {
      content = await fs.readFile(absPath, 'utf-8');
    } catch {
      continue;
    }
    if (content.includes('\u0000')) continue; // binary heuristic

    const relPath = '/' + path.relative(rootPath, absPath).split(path.sep).join('/');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (results.length >= maxResults) break;
      const line = lines[i];
      matcher.lastIndex = 0;
      const m = matcher.exec(line);
      if (!m) continue;
      const preview = line.trim().slice(0, SEARCH_PREVIEW_MAX);
      results.push({ path: relPath, line: i + 1, column: m.index + 1, preview });
    }
  }
  return results;
}

export function registerFsHandlers(): void {
  ipcMain.handle(CHANNELS.fsReadTree, async (_event, rootPath: string) => {
    entryCount = 0;

    if (activeWatcher) {
      try {
        activeWatcher.close();
      } catch {}
      activeWatcher = null;
    }

    try {
      activeWatcher = watch(rootPath, { recursive: true }, () => {
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send('fs:tree-changed');
        });
      });
    } catch (err) {
      console.error('Failed to setup fs watcher:', err);
    }

    return readDir(rootPath, rootPath);
  });

  ipcMain.handle(
    CHANNELS.fsReadFile,
    async (
      _event,
      rootPath: string,
      relPath: string,
      opts?: { offset?: number; limit?: number; numbered?: boolean },
    ) => {
      const absPath = path.join(rootPath, relPath);
      const raw = await fs.readFile(absPath, 'utf-8');
      const allLines = raw.split('\n');

      // Cap the total lines returned so a single read can't blow the model
      // context (which causes re-read loops and runaway token usage).
      const MAX_LINES = 2000;
      const total = allLines.length;
      const truncatedFull = total > MAX_LINES;
      const safeLines = truncatedFull ? allLines.slice(0, MAX_LINES) : allLines;

      const offset = Math.max(0, Math.min(opts?.offset ?? 0, safeLines.length));
      const limit = opts?.limit != null ? Math.max(1, opts.limit) : safeLines.length - offset;
      const windowed = safeLines.slice(offset, offset + limit);

      const numbered = opts?.numbered ?? true;
      const body = numbered
        ? windowed.map((line, i) => `${offset + i + 1}\t${line}`).join('\n')
        : windowed.join('\n');

      const readEnd = offset + windowed.length;
      const header = `<file path="${relPath}" lines="${total}" showing="${offset + 1}-${readEnd}">\n`;
      const footer = truncatedFull
        ? `\n... (file truncated at ${MAX_LINES} lines; use offset/limit to read more) ...`
        : '';
      return header + body + footer + '\n</file>';
    },
  );

  ipcMain.handle(
    CHANNELS.fsSearch,
    async (
      _event,
      rootPath: string,
      query: string,
      opts?: FsSearchOptions,
    ): Promise<FsSearchMatch[]> => searchInFiles(rootPath, query, opts ?? {}),
  );

  ipcMain.handle(CHANNELS.fsWriteFile, async (_event, rootPath: string, relPath: string, content: string) => {
    const absPath = path.join(rootPath, relPath);
    await fs.writeFile(absPath, content, 'utf-8');
    return true;
  });

  ipcMain.handle(
    CHANNELS.fsCreateEntry,
    async (
      _event,
      rootPath: string,
      dirPath: string,
      name: string,
      type: 'file' | 'directory',
    ): Promise<FsTreeNode[]> => {
      /* Reject obviously unsafe names (path traversal, empties, separators). */
      const cleanName = String(name).trim();
      if (!cleanName || /[\\/]/.test(cleanName) || cleanName === '.' || cleanName === '..') {
        throw new Error('Invalid name — may not be empty or contain path separators.');
      }

      const absDir = path.join(rootPath, dirPath);
      const absTarget = path.join(absDir, cleanName);

      if (type === 'directory') {
        await fs.mkdir(absTarget, { recursive: true });
      } else {
        await fs.mkdir(absDir, { recursive: true });
        try {
          await fs.access(absTarget);
          /* File already exists — leave it untouched rather than truncating. */
        } catch {
          await fs.writeFile(absTarget, '', 'utf-8');
        }
      }

      entryCount = 0;
      return readDir(rootPath, rootPath);
    },
  );
}
