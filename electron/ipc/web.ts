import { ipcMain } from 'electron';
import { CHANNELS } from './channels.js';

/* ================================================
   Web search, executed in the MAIN process (Node).

   The renderer must not talk to search engines directly — that risks CORS /
   egress blocking and leaks any API endpoint or token into renderer memory.
   Running here means:
     • unrestricted Node fetch (no CORS),
     • a single source of truth for config (AIOS_SEARCH_API env / token),
     • easy future proxy support.

   Logic mirrors the agent runtime's `search_net` tool.
   ================================================ */

export type WebSearchEngine = 'ddg' | 'bing' | 'url';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchParams {
  query: string;
  engine?: WebSearchEngine;
  limit?: number;
  timeout?: number;
  url?: string;
  token?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  error?: string;
  engine: WebSearchEngine;
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const DEFAULT_TIMEOUT = 15;
const MAX_TIMEOUT = 60;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Decode DuckDuckGo / Bing redirect wrappers back to the real destination. */
function decodeUrl(raw: string): string {
  try {
    const u = new URL(raw, 'https://html.duckduckgo.com');
    if (u.searchParams.has('uddg')) {
      return decodeURIComponent(u.searchParams.get('uddg') as string);
    }
    if (u.hostname.includes('bing.com') && u.pathname.includes('/ck/a')) {
      const dest = u.searchParams.get('u');
      if (dest) return decodeURIComponent(dest);
    }
  } catch {
    /* fall through to raw */
  }
  return raw;
}

async function searchDdg(query: string, limit: number, timeoutMs: number): Promise<WebSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      body: new URLSearchParams({ q: query, kl: 'us-en' }).toString(),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`DuckDuckGo responded ${res.status}`);
    const html = await res.text();
    const results: WebSearchResult[] = [];
    const blockRe = /<div class="result[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const titleRe = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) && results.length < limit) {
      const block = m[1];
      const t = titleRe.exec(block);
      const s = snippetRe.exec(block);
      if (t) {
        results.push({
          title: stripHtml(t[2]),
          url: decodeUrl(t[1]),
          snippet: s ? stripHtml(s[1]) : '',
        });
      }
    }
    if (results.length === 0) {
      return await searchDdgInstant(query, limit, timeoutMs);
    }
    return results;
  } finally {
    clearTimeout(timer);
  }
}

async function searchDdgInstant(query: string, limit: number, timeoutMs: number): Promise<WebSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    const results: WebSearchResult[] = [];
    if (data.AbstractText && data.AbstractURL) {
      results.push({ title: data.AbstractSource || 'DuckDuckGo', url: data.AbstractURL, snippet: data.AbstractText });
    }
    for (const topic of data.RelatedTopics || []) {
      if (results.length >= limit) break;
      if (topic.Text && topic.FirstURL) {
        results.push({ title: stripHtml(topic.Text.split(' - ')[0]), url: topic.FirstURL, snippet: topic.Text });
      }
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function searchBing(query: string, limit: number, timeoutMs: number): Promise<WebSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Bing responded ${res.status}`);
    const html = await res.text();
    const results: WebSearchResult[] = [];
    const blockRe = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
    const titleRe = /<h2>([\s\S]*?)<\/h2>/;
    const urlRe = /<h2>\s*<a[^>]+href="([^"]+)"[^>]*>/;
    const snippetRe = /<p[^>]*>([\s\S]*?)<\/p>/;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) && results.length < limit) {
      const block = m[1];
      const t = titleRe.exec(block);
      const u = urlRe.exec(block);
      const s = snippetRe.exec(block);
      if (t && u) {
        results.push({
          title: stripHtml(t[1]),
          url: decodeUrl(u[1]),
          snippet: s ? stripHtml(s[1]) : '',
        });
      }
    }
    return results;
  } finally {
    clearTimeout(timer);
  }
}

async function searchCustom(
  query: string,
  endpoint: string,
  token: string | undefined,
  limit: number,
  timeoutMs: number,
): Promise<WebSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = endpoint.replace('{q}', encodeURIComponent(query));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`Search endpoint responded ${res.status}`);
    const data: unknown = await res.json();
    const rawItems = Array.isArray(data)
      ? data
      : (data as { results?: unknown; items?: unknown }).results ??
        (data as { items?: unknown }).items ??
        [];
    const items: Array<{ title?: string; name?: string; url?: string; link?: string; snippet?: string; description?: string }> =
      Array.isArray(rawItems) ? (rawItems as Array<Record<string, unknown>>) : [];
    return items.slice(0, limit).map((it) => ({
      title: stripHtml(it.title || it.name || it.url || '(untitled)'),
      url: it.url || it.link || '',
      snippet: stripHtml(it.snippet || it.description || ''),
    }));
  } finally {
    clearTimeout(timer);
  }
}

export function registerWebHandlers(): void {
  ipcMain.handle(CHANNELS.webSearch, async (_event, params: WebSearchParams): Promise<WebSearchResponse> => {
    const query = (params?.query || '').toString().trim();
    if (!query) {
      return { results: [], error: 'Empty query.', engine: params?.engine || 'ddg' };
    }

    const engine: WebSearchEngine = params.engine || 'ddg';
    const limit = Math.min(Math.max(1, Math.round(params.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
    const timeoutMs = Math.min(Math.max(1, Math.round(params.timeout ?? DEFAULT_TIMEOUT)), MAX_TIMEOUT) * 1000;

    try {
      if (engine === 'ddg') {
        return { results: await searchDdg(query, limit, timeoutMs), engine };
      }
      if (engine === 'bing') {
        return { results: await searchBing(query, limit, timeoutMs), engine };
      }
      // url — fall back to AIOS_SEARCH_API env if no explicit endpoint given
      const endpoint = params.url || process.env.AIOS_SEARCH_API;
      if (!endpoint) {
        return { results: [], error: 'No custom search URL provided (and AIOS_SEARCH_API is unset).', engine };
      }
      const token = params.token || (process.env.AIOS_SEARCH_API_TOKEN || undefined);
      return { results: await searchCustom(query, endpoint, token, limit, timeoutMs), engine };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { results: [], error: message, engine };
    }
  });
}
