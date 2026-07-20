import { useState, useCallback } from 'react';
import {
  Search,
  Globe,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RotateCw,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { IconButton } from '@/components/shared/IconButton';
import { Badge } from '@/components/shared/Badge';
import { Spinner } from '@/components/shared/Spinner';
import type { SearchEngine, SearchResult } from '@/services/webSearch';
import { useNotificationStore, toast } from '@/store/useNotificationStore';
import './WebView.css';

const ENGINES: { id: SearchEngine; label: string }[] = [
  { id: 'ddg', label: 'DuckDuckGo' },
  { id: 'bing', label: 'Bing' },
  { id: 'url', label: 'Custom API' },
];

export function WebView() {
  const [query, setQuery] = useState('');
  const [engine, setEngine] = useState<SearchEngine>('ddg');
  const [customUrl, setCustomUrl] = useState('');
  const [limit, setLimit] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      toast.warning('Empty query', 'Type something to search the web.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Route through the main process (no CORS, config lives in Node env).
      const bridge = window.aios;
      if (!bridge?.web?.search) {
        throw new Error('Web search is unavailable in this environment.');
      }
      const res = await bridge.web.search({
        query: q,
        engine,
        limit,
        url: engine === 'url' ? customUrl.trim() || undefined : undefined,
      });
      if (res.error) {
        setError(res.error);
        setResults([]);
        setSearched(true);
        toast.error('Search failed', res.error);
      } else {
        setResults(res.results);
        setSearched(true);
        if (res.results.length === 0) {
          toast.info('No results', 'The search returned nothing — try a different query or engine.');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Web search failed.';
      setError(msg);
      setResults([]);
      setSearched(true);
      toast.error('Search failed', msg);
    } finally {
      setLoading(false);
    }
  }, [query, engine, customUrl, limit]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  };

  const openUrl = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="web-view animate-fade-in">
      <header className="web-view__header">
        <div className="web-view__title">
          <Globe size={20} />
          <h1>Web Search</h1>
          <Badge variant="default">
            search_net
          </Badge>
        </div>
        <p className="web-view__subtitle">
          Live web search — same logic as the agent&apos;s <code>search_net</code> tool. Keyless by default
          (DuckDuckGo / Bing), or point at your own endpoint.
        </p>
      </header>

      <div className="web-view__controls glass-panel">
        <div className="web-view__search-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search the web…  (e.g. React 19 useFormStatus)"
            icon={<Search size={16} />}
            className="web-view__input"
          />
          <Button onClick={runSearch} disabled={loading} icon={loading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}>
            {loading ? 'Searching…' : 'Search'}
          </Button>
        </div>

        <div className="web-view__options">
          <label className="web-view__field">
            <span>Engine</span>
            <select
              className="web-view__select"
              value={engine}
              onChange={(e) => setEngine(e.target.value as SearchEngine)}
            >
              {ENGINES.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.label}
                </option>
              ))}
            </select>
          </label>

          {engine === 'url' && (
            <label className="web-view__field web-view__field--grow">
              <span>Endpoint (use {'{q}'} for the query)</span>
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://my-proxy.example/search?q={q}"
              />
            </label>
          )}

          <label className="web-view__field">
            <span>Limit</span>
            <select
              className="web-view__select"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[5, 8, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="web-view__results">
        {loading && (
          <div className="web-view__state">
            <Spinner size="lg" />
            <p>Searching {ENGINES.find((e) => e.id === engine)?.label}…</p>
          </div>
        )}

        {!loading && error && (
          <div className="web-view__state web-view__state--error">
            <AlertTriangle size={28} />
            <p>{error}</p>
            <Button variant="secondary" size="sm" icon={<RotateCw size={15} />} onClick={runSearch}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && !searched && (
          <div className="web-view__state web-view__state--empty">
            <Globe size={28} />
            <p>Run a search to see live web results here.</p>
          </div>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <div className="web-view__state web-view__state--empty">
            <Search size={28} />
            <p>No results found. Try a different query or engine.</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <ul className="web-view__list">
            {results.map((r, i) => (
              <li key={`${r.url}-${i}`} className="web-view__result glass-panel">
                <a
                  className="web-view__result-title"
                  href={r.url || '#'}
                  onClick={(e) => {
                    if (!r.url) return;
                    e.preventDefault();
                    openUrl(r.url);
                  }}
                >
                  {r.title}
                  <ExternalLink size={14} />
                </a>
                {r.url && (
                  <div className="web-view__result-url">
                    <Link2 size={12} />
                    <span>{r.url}</span>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={<ExternalLink size={13} />}
                      onClick={() => openUrl(r.url)}
                      aria-label="Open in browser"
                    />
                  </div>
                )}
                {r.snippet && <p className="web-view__result-snippet">{r.snippet}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
