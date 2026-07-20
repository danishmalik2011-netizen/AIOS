/* ================================================================
   webSearch — the GUI counterpart of the agent runtime's `search_net`
   tool. Same logic, same backends, but callable from React:

     • ddg  — DuckDuckGo HTML results (keyless), with an Instant Answer
              API fallback when the HTML scrape yields nothing.
     • bing — Bing HTML results (keyless).
     • url  — a custom endpoint; `{q}` is replaced with the encoded query.
              Falls back to the AIOS_SEARCH_API env var when `url` is omitted.

   Results are normalized to { title, url, snippet }. Redirect URLs
   (e.g. DuckDuckGo's //duckduckgo.com/l/?uddg=…) are decoded back to
   the real destination, mirroring the agent tool's behaviour.

   This runs in the Electron renderer via the standard `fetch` API, so
   no Node-only APIs are used.
   ================================================================ */

export type SearchEngine = 'ddg' | 'bing' | 'url';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOptions {
  query: string;
  limit?: number; // 1–20, default 8
  engine?: SearchEngine;
  url?: string; // required when engine === 'url'
  token?: string; // optional bearer token for engine === 'url'
  timeout?: number; // seconds, 1–60, default 15
}

/** Decode DuckDuckGo / Bing redirect wrappers back to the real URL. */
function decodeRedirect(raw: string): string {
  try {
    if (!raw) return raw;
    // DuckDuckGo: //duckduckgo.com/l/?uddg=<encoded>&...
    const ddg = raw.match(/[?&]uddg=([^&]+)/i);
    if (ddg) return decodeURIComponent(ddg[1]);
    // Bing: sometimes wraps in https://www.bing.com/ck/a?u=<encoded>
    const bing = raw.match(/[?&]u=a1([^&]+)/i) || raw.match(/[?&]u=([^&]+)/i);
    if (bing && /bing\.com\/ck\/a/i.test(raw)) return decodeURIComponent(bing[1]);
    // Already a real URL
    return raw;
  } catch {
    return raw;
  }
}

/** Strip HTML tags and collapse whitespace from a snippet. */
function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ----------------------------- DuckDuckGo ----------------------------- */

async function searchDdg(query: string, limit: number, timeoutMs: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  }, timeoutMs);

  if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];
  // Each result block: class="result__a" (title+link) and class="result__snippet"
  const blockRe = /class="result[^"]*?"[^>]*>([\s\S]*?)(?=class="result[^"]*?"|class="results--main"|$)/gi;
  const titleRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null && results.length < limit) {
    const block = m[1];
    const t = titleRe.exec(block);
    const s = snippetRe.exec(block);
    if (t) {
      results.push({
        title: cleanText(t[2]),
        url: decodeRedirect(t[1]),
        snippet: s ? cleanText(s[1]) : '',
      });
    }
  }

  if (results.length > 0) return results.slice(0, limit);

  // Fallback: Instant Answer API (single concise answer).
  try {
    const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const iaRes = await fetchWithTimeout(iaUrl, { headers: { Accept: 'application/json' } }, timeoutMs);
    if (iaRes.ok) {
      const data = (await iaRes.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        AbstractSource?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      if (data.AbstractText) {
        results.push({
          title: data.AbstractSource || 'DuckDuckGo Instant Answer',
          url: data.AbstractURL || '',
          snippet: data.AbstractText,
        });
      } else if (Array.isArray(data.RelatedTopics) && data.RelatedTopics.length) {
        for (const rt of data.RelatedTopics.slice(0, limit)) {
          if (rt.Text) {
            results.push({ title: rt.Text.slice(0, 80), url: rt.FirstURL || '', snippet: rt.Text });
          }
        }
      }
    }
  } catch {
    /* instant-answer fallback is best-effort */
  }

  return results.slice(0, limit);
}

/* ------------------------------- Bing -------------------------------- */

async function searchBing(query: string, limit: number, timeoutMs: number): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  }, timeoutMs);

  if (!res.ok) throw new Error(`Bing returned ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];
  // Bing result: <li class="b_algo"> ... <h2><a href="...">title</a></h2> ... <p>snippet</p>
  const algoRe = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  const linkRe = /<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const capRe = /<p[^>]*>([\s\S]*?)<\/p>/i;

  let m: RegExpExecArray | null;
  while ((m = algoRe.exec(html)) !== null && results.length < limit) {
    const block = m[1];
    const l = linkRe.exec(block);
    const c = capRe.exec(block);
    if (l) {
      results.push({
        title: cleanText(l[2]),
        url: decodeRedirect(l[1]),
        snippet: c ? cleanText(c[1]) : '',
      });
    }
  }

  return results.slice(0, limit);
}

/* --------------------------- Custom URL ----------------------------- */

async function searchCustom(
  query: string,
  limit: number,
  timeoutMs: number,
  endpoint: string,
  token?: string,
): Promise<SearchResult[]> {
  const url = endpoint.replace('{q}', encodeURIComponent(query));
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetchWithTimeout(url, { headers }, timeoutMs);
  if (!res.ok) throw new Error(`Search endpoint returned ${res.status}`);
  const data = await res.json();

  // Accept either an array of {title,url,snippet} or {results:[...]}.
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { results?: unknown[] }).results)
      ? (data as { results: unknown[] }).results
      : [];

  return arr
    .slice(0, limit)
    .map((item) => {
      const r = item as Record<string, unknown>;
      return {
        title: String(r.title ?? r.name ?? r.headline ?? '(untitled)'),
        url: String(r.url ?? r.link ?? r.href ?? ''),
        snippet: String(r.snippet ?? r.description ?? r.body ?? r.text ?? ''),
      };
    });
}

/* ------------------------------ Public ------------------------------- */

export async function webSearch(opts: WebSearchOptions): Promise<SearchResult[]> {
  const limit = Math.max(1, Math.min(20, opts.limit ?? 8));
  const timeoutMs = Math.max(1000, Math.min(60000, (opts.timeout ?? 15) * 1000));
  const engine = opts.engine ?? 'ddg';

  switch (engine) {
    case 'bing':
      return searchBing(opts.query, limit, timeoutMs);
    case 'url': {
      const endpoint = opts.url || (typeof process !== 'undefined' ? process.env?.AIOS_SEARCH_API : undefined);
      if (!endpoint) throw new Error('engine "url" requires a `url` option or AIOS_SEARCH_API env var');
      return searchCustom(opts.query, limit, timeoutMs, endpoint, opts.token);
    }
    case 'ddg':
    default:
      return searchDdg(opts.query, limit, timeoutMs);
  }
}
