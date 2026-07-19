/* ================================================
   AIOS CLI — Node tool transport
   A headless, dependency-free re-implementation of the workspace
   tools the agent can call. It mirrors the logic in electron/ipc/*
   (fs.ts / shell.ts / git.ts) but runs directly on Node — no
   Electron, no window.aios bridge. This is the CLI's OS surface.
   ================================================ */

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import simpleGit from 'simple-git';

/* ---- read_file ---------------------------------------------------- */

const READ_MAX_LINES = 2000;

export interface ReadFileOptions {
  offset?: number;
  limit?: number;
  numbered?: boolean;
}

export async function readFile(
  root: string,
  relPath: string,
  opts: ReadFileOptions = {},
): Promise<string> {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  const all = raw.split('\n');
  const total = all.length;
  const truncatedFull = total > READ_MAX_LINES;
  const safe = truncatedFull ? all.slice(0, READ_MAX_LINES) : all;

  const offset = Math.max(0, Math.min(opts.offset ?? 0, safe.length));
  const limit = opts.limit != null ? Math.max(1, opts.limit) : safe.length - offset;
  const windowed = safe.slice(offset, offset + limit);

  const numbered = opts.numbered ?? true;
  const body = numbered
    ? windowed.map((line, i) => `${offset + i + 1}\t${line}`).join('\n')
    : windowed.join('\n');

  const end = offset + windowed.length;
  const header = `<file path="${relPath}" lines="${total}" showing="${offset + 1}-${end}">\n`;
  const footer = truncatedFull
    ? `\n... (file truncated at ${READ_MAX_LINES} lines; use offset/limit to read more) ...`
    : '';
  return header + body + footer + '\n</file>';
}

/* ---- write_file --------------------------------------------------- */

export interface FileDiff {
  linesAdded: number;
  linesRemoved: number;
  created: boolean;
}

export async function writeFile(
  root: string,
  relPath: string,
  content: string,
): Promise<FileDiff> {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  let linesRemoved = 0;
  let created = false;
  try {
    const existing = await fs.readFile(abs, 'utf-8');
    linesRemoved = existing.split('\n').length;
  } catch {
    created = true;
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
  return { linesAdded: content.split('\n').length, linesRemoved, created };
}

/* ---- patch_file --------------------------------------------------- */
/* Surgical find-and-replace inside an existing file.  Safer than
   write_file for edits because it touches only the target span. */

export async function patchFile(
  root: string,
  relPath: string,
  oldStr: string,
  newStr: string,
): Promise<FileDiff> {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  const original = await fs.readFile(abs, 'utf-8').catch(() => {
    throw new Error(`patch_file: file not found: ${relPath}`);
  });
  if (!original.includes(oldStr)) {
    throw new Error(
      `patch_file: target string not found in ${relPath}. ` +
      `Make sure old_str matches exactly (whitespace included).`,
    );
  }
  // Only replace the FIRST occurrence to be predictable.
  const updated = original.replace(oldStr, newStr);
  await fs.writeFile(abs, updated, 'utf-8');
  return {
    linesAdded: newStr.split('\n').length,
    linesRemoved: oldStr.split('\n').length,
    created: false,
  };
}


/* ---- append_file -------------------------------------------------- */
/* Appends content to the END of an existing file (or creates it).  Never
   overwrites.  Use this to write large files in safe chunks:
     1. write_file  → first chunk (creates file)
     2. append_file → each subsequent chunk
   Returns the final total line count so the agent can verify nothing
   was lost. */

export async function appendFile(
  root: string,
  relPath: string,
  content: string,
): Promise<{ totalLines: number; appended: number }> {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.appendFile(abs, content, 'utf-8');
  const full = await fs.readFile(abs, 'utf-8');
  const totalLines = full.split('\n').length;
  return { totalLines, appended: content.split('\n').length };
}


interface FsTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FsTreeNode[];
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'release', 'build', '.next', '.cache',
]);
const MAX_ENTRIES = 5000;

function readDir(dir: string, root: string): FsTreeNode[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = fssync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const nodes: FsTreeNode[] = [];
  let count = 0;
  for (const e of entries) {
    if (count >= MAX_ENTRIES) break;
    if (e.name.startsWith('.') && e.name !== '.gitignore' && e.name !== '.env') continue;
    const abs = path.join(dir, e.name);
    const rel = '/' + path.relative(root, abs).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      count++;
      nodes.push({ id: rel, name: e.name, path: rel, type: 'directory', children: readDir(abs, root) });
    } else if (e.isFile()) {
      count++;
      nodes.push({ id: rel, name: e.name, path: rel, type: 'file' });
    }
  }
  return nodes;
}

export function readTree(root: string): FsTreeNode[] {
  return readDir(root, root);
}

/* ---- search_code -------------------------------------------------- */

interface SearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

const SEARCH_MAX_FILES = 4000;
const SEARCH_MAX_FILE_BYTES = 512 * 1024;
const SEARCH_PREVIEW_MAX = 200;

function collectSearchFiles(dir: string, root: string, acc: string[]): void {
  if (acc.length >= SEARCH_MAX_FILES) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = fssync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (acc.length >= SEARCH_MAX_FILES) return;
    if (e.name.startsWith('.') && e.name !== '.gitignore' && e.name !== '.env') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      collectSearchFiles(abs, root, acc);
    } else if (e.isFile()) {
      acc.push(abs);
    }
  }
}

function buildMatcher(query: string, isRegex: boolean): RegExp {
  const flags = 'gi';
  if (isRegex) {
    try {
      return new RegExp(query, flags);
    } catch {
      /* fall through to literal */
    }
  }
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
}

export function search(
  root: string,
  query: string,
  opts: { isRegex?: boolean; maxResults?: number } = {},
): SearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const maxResults = Math.max(1, Math.min(opts.maxResults ?? 200, 1000));
  const matcher = buildMatcher(trimmed, !!opts.isRegex);

  const files: string[] = [];
  collectSearchFiles(root, root, files);

  const results: SearchMatch[] = [];
  for (const abs of files) {
    if (results.length >= maxResults) break;
    let stat: import('node:fs').Stats;
    try {
      stat = fssync.statSync(abs);
    } catch {
      continue;
    }
    if (stat.size > SEARCH_MAX_FILE_BYTES) continue;
    let content: string;
    try {
      content = fssync.readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    if (content.includes('\u0000')) continue;
    const rel = '/' + path.relative(root, abs).split(path.sep).join('/');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (results.length >= maxResults) break;
      const line = lines[i];
      matcher.lastIndex = 0;
      const m = matcher.exec(line);
      if (!m) continue;
      results.push({
        path: rel,
        line: i + 1,
        column: m.index + 1,
        preview: line.trim().slice(0, SEARCH_PREVIEW_MAX),
      });
    }
  }
  return results;
}

/* ---- run_command -------------------------------------------------- */

const EXEC_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 16 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 40_000;

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const head = output.slice(0, MAX_OUTPUT_CHARS / 2);
  const tail = output.slice(output.length - MAX_OUTPUT_CHARS / 2);
  return `${head}\n… (output truncated, ${output.length} chars total) …\n${tail}`;
}

export function runCommand(
  command: string,
  cwd?: string,
  timeoutSec?: number,
): Promise<{ output: string; exitCode: number; error?: string }> {
  return new Promise((resolve) => {
    if (!command || typeof command !== 'string') {
      resolve({ output: '', exitCode: 1, error: 'Missing command.' });
      return;
    }
    const resolvedCwd = cwd && path.isAbsolute(cwd) ? cwd : process.cwd();
    const timeoutMs =
      timeoutSec && Number.isFinite(timeoutSec)
        ? Math.min(Math.max(1, Math.round(timeoutSec)) * 1000, 600_000)
        : EXEC_TIMEOUT_MS;

    const child = exec(command, {
      cwd: resolvedCwd,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
      timeout: timeoutMs,
      env: process.env as Record<string, string>,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) =>
      resolve({ output: truncateOutput(stdout + stderr), exitCode: 1, error: err.message }),
    );
    child.on('close', (code, signal) => {
      const combined = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
      resolve({
        output: truncateOutput(combined),
        exitCode: signal ? 1 : code ?? 0,
        error: signal ? `Killed by signal ${signal}` : undefined,
      });
    });
  });
}

/* ---- git ---------------------------------------------------------- */

const gitCache = new Map<string, ReturnType<typeof simpleGit>>();
function getGit(repo: string) {
  let g = gitCache.get(repo);
  if (!g) {
    g = simpleGit(repo);
    gitCache.set(repo, g);
  }
  return g;
}

export async function gitStatus(repo: string): Promise<unknown> {
  const git = getGit(repo);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) return null;
  const s = await git.status();
  return {
    branch: s.current ?? 'HEAD',
    ahead: s.ahead,
    behind: s.behind,
    staged: s.staged.map((f) => ({ path: f, status: 'modified' })),
    unstaged: [
      ...s.modified.map((f) => ({ path: f, status: 'modified' })),
      ...s.created.map((f) => ({ path: f, status: 'added' })),
      ...s.deleted.map((f) => ({ path: f, status: 'deleted' })),
      ...s.renamed.map((f) => ({ path: f.to, status: 'renamed' })),
    ],
    untracked: s.not_added,
  };
}

export async function gitCommit(repo: string, message: string): Promise<string> {
  const git = getGit(repo);
  const res = await git.commit(message);
  const log = await git.log({ maxCount: 1 });
  return res.commit || log.latest?.hash || '';
}

/* ---- search_net -------------------------------------------------- */

export interface NetSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface NetSearchOptions {
  /** Max number of results to return. Clamped to 1–20. */
  limit?: number;
  /**
   * Search backend.
   *  - 'ddg'   (default): DuckDuckGo Instant Answer API — keyless, no auth.
   *  - 'url'   : treat `query` as a fully-formed GET URL that returns JSON
   *              with a `results` array (or any object the caller parses).
   *              Useful for a self-hosted search proxy or a custom endpoint.
   */
  engine?: 'ddg' | 'bing' | 'url';
  /** When engine='url', the endpoint to GET. `{q}` is replaced with the
   *  encoded query. Ignored for the default 'ddg' engine. */
  url?: string;
  /** Optional bearer token sent as `Authorization: Bearer <token>` when
   *  engine='url' and a token is supplied. */
  token?: string;
  /** Per-request timeout in seconds. Defaults to 15. */
  timeout?: number;
}

/**
 * Perform a live web search and return a compact list of results.
 *
 * This is the network counterpart to `search` (which only searches local
 * files). It is dependency-free — it uses the global `fetch` available in
 * Node 18+. Backends:
 *   - 'ddg'  (default): DuckDuckGo HTML results (real results), with the
 *     keyless Instant Answer API as a fallback when the HTML endpoint is
 *     blocked. No API key required.
 *   - 'bing': Bing HTML results (keyless; may return [] if Bing serves a
 *     bot-challenge page to scripted requests).
 *   - 'url' : a custom endpoint. Set `AIOS_SEARCH_API` in the environment to
 *     point it at an endpoint without hard-coding it in tool calls.
 *
 * Note: some networks/proxies block these endpoints (e.g. returning 403 or an
 * empty page). In that case the function returns [] and the caller should
 * surface a "no results / possibly blocked" message.
 */
export async function searchNet(
  query: string,
  opts: NetSearchOptions = {},
): Promise<NetSearchResult[]> {
  const q = (query || '').trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 20));
  const engine = opts.engine ?? 'ddg';
  const timeoutMs = Math.min(Math.max(1, opts.timeout ?? 15), 60) * 1000;

  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const withTimeout = async (p: Promise<Response>): Promise<Response> => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await p;
    } finally {
      clearTimeout(id);
    }
  };

  // Strip HTML tags and decode the few entities we care about.
  const clean = (s: string): string =>
    (s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

  try {
    if (engine === 'url') {
      const endpoint = opts.url || process.env.AIOS_SEARCH_API || '';
      if (!endpoint) return [];
      const target = endpoint.includes('{q}')
        ? endpoint.replace('{q}', encodeURIComponent(q))
        : `${endpoint}${endpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(q)}`;
      const headers: Record<string, string> = { accept: 'application/json' };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      const res = await withTimeout(fetch(target, { headers }));
      if (!res.ok) return [];
      const data = (await res.json().catch(() => null)) as any;
      const arr: any[] = Array.isArray(data)
        ? data
        : (data?.results ?? data?.items ?? data?.webPages?.value ?? []);
      return arr.slice(0, limit).map((r) => ({
        title: String(r.title ?? r.name ?? '(untitled)'),
        url: String(r.url ?? r.link ?? r.href ?? ''),
        snippet: String(r.snippet ?? r.description ?? r.body ?? ''),
      }));
    }

    if (engine === 'bing') {
      // Bing HTML (keyless). Note: Bing sometimes serves a bot-challenge page
      // to scripted requests, in which case this returns [].
      const res = await withTimeout(
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': UA, accept: 'text/html' },
        }),
      );
      if (!res.ok) return [];
      const html = await res.text();
      const out: NetSearchResult[] = [];
      const re = /<li class="b_algo"[^>]*>.*?<h2>(.*?)<\/h2>.*?<p[^>]*>(.*?)<\/p>/gs;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && out.length < limit) {
        const title = clean(m[1]);
        const snippet = clean(m[2]);
        const hrefM = /href="([^"]+)"/.exec(m[0]);
        const url = hrefM ? hrefM[1] : '';
        if (title) out.push({ title, url, snippet });
      }
      return out;
    }

    // Default: DuckDuckGo HTML results page (keyless, returns real results).
    // Falls back to the Instant Answer API if the HTML endpoint is blocked.
    const ddgHtml = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    try {
      const res = await withTimeout(
        fetch(ddgHtml, { headers: { 'User-Agent': UA, accept: 'text/html' } }),
      );
      if (res.ok) {
        const html = await res.text();
        const out: NetSearchResult[] = [];
        // Each result: <a class="result__a" href="...">title</a> ... <a class="result__snippet">snippet</a>
        const titleRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
        const snipRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;
        const blocks = html.split(/<div class="result[^"]*"/).slice(1);
        for (const b of blocks) {
          if (out.length >= limit) break;
          const tm = titleRe.exec(b);
          if (!tm) continue;
          const sm = snipRe.exec(b);
          // DDG wraps result links in a redirector (//duckduckgo.com/l/?uddg=<real>).
          // Decode to the real destination when present.
          let url = tm[1];
          const uddg = /[?&]uddg=([^&]+)/.exec(url);
          if (uddg) {
            try {
              url = decodeURIComponent(uddg[1]);
            } catch {
              /* keep raw */
            }
          }
          const title = clean(tm[2]);
          const snippet = sm ? clean(sm[1]) : '';
          if (title) out.push({ title, url, snippet });
        }
        if (out.length) return out;
      }
    } catch {
      // fall through to Instant Answer API
    }

    // Fallback: DuckDuckGo Instant Answer API (keyless, curated answers only).
    const ddg = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await withTimeout(fetch(ddg));
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as any;
    const out: NetSearchResult[] = [];

    if (data?.AbstractText) {
      out.push({
        title: data.Heading || q,
        url: data.AbstractURL || '',
        snippet: data.AbstractText,
      });
    }
    const topics: any[] = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
    for (const t of topics) {
      if (out.length >= limit) break;
      if (Array.isArray(t?.Topics)) {
        for (const sub of t.Topics) {
          if (out.length >= limit) break;
          if (sub?.Text) {
            out.push({
              title: (sub.Text.split(' — ')[0] || q).slice(0, 120),
              url: sub.FirstURL || '',
              snippet: sub.Text || '',
            });
          }
        }
        continue;
      }
      if (t?.Text) {
        out.push({
          title: (t.Text.split(' — ')[0] || q).slice(0, 120),
          url: t.FirstURL || '',
          snippet: t.Text || '',
        });
      }
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}
