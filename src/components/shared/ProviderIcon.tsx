import { useEffect, useState, type CSSProperties } from 'react';

/* Brand colours + short marks for known providers. We render the real brand
 * logo from the Simple Icons CDN (used for identification) and gracefully fall
 * back to a coloured monogram badge when a provider has no known logo, the
 * network is unavailable, or the fetch fails. */
const BRAND_COLORS: Record<string, string> = {
  anthropic: '#d4a27f',
  claude: '#d4a27f',
  openai: '#10a37f',
  chatgpt: '#10a37f',
  openrouter: '#6467f2',
  ollama: '#6b4f3a',
  groq: '#f55036',
  deepseek: '#4d6bfe',
  together: '#0b9b8a',
  nvidia: '#76b900',
  'nvidianim': '#76b900',
  mistral: '#ff7000',
  meta: '#0668e1',
  llama: '#0668e1',
  qwen: '#615ced',
  google: '#4285f4',
  gemini: '#4285f4',
  xai: '#000000',
  grok: '#000000',
  perplexity: '#1fb8cd',
  cohere: '#39594d',
  fireworks: '#ff5c00',
  replicate: '#d634ff',
  huggingface: '#ffd21e',
};

const BRAND_INITIALS: Record<string, string> = {
  anthropic: 'An',
  claude: 'Cl',
  openai: 'AI',
  chatgpt: 'CG',
  openrouter: 'OR',
  ollama: 'Ol',
  groq: 'Gq',
  deepseek: 'DS',
  together: 'Tg',
  nvidia: 'NV',
  'nvidianim': 'NV',
  mistral: 'Mi',
  meta: 'Me',
  llama: 'La',
  qwen: 'Qw',
  google: 'G',
  gemini: 'Ge',
  xai: 'xA',
  grok: 'Gk',
  perplexity: 'Px',
  cohere: 'Co',
  fireworks: 'Fw',
  replicate: 'Rp',
  huggingface: 'HF',
};

/* Simple Icons slugs for the real brand logos. Providers without a known slug
 * (or not in the icon set) simply fall back to the monogram badge. */
const BRAND_SLUGS: Record<string, string> = {
  anthropic: 'anthropic',
  claude: 'claude',
  openai: 'openai',
  chatgpt: 'openai',
  openrouter: 'openrouter',
  ollama: 'ollama',
  groq: 'groq',
  deepseek: 'deepseek',
  nvidia: 'nvidia',
  nvidianim: 'nvidia',
  mistral: 'mistralai',
  meta: 'meta',
  llama: 'ollama',
  qwen: 'qwen',
  google: 'google',
  gemini: 'googlegemini',
  xai: 'x',
  grok: 'x',
  perplexity: 'perplexity',
  cohere: 'cohere',
  replicate: 'replicate',
  huggingface: 'huggingface',
};

function normalizeId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveKey(id: string): string {
  const n = normalizeId(id);
  if (BRAND_COLORS[n]) return n;
  // Match by substring (e.g. "my-anthropic" → anthropic).
  for (const key of Object.keys(BRAND_COLORS)) {
    if (n.includes(key) || key.includes(n)) return key;
  }
  return n;
}

export interface ProviderIconProps {
  /** Provider id (used for colour + mark lookup). */
  id: string;
  /** Optional display name; its first letter seeds the monogram fallback. */
  name?: string;
  size?: number;
  className?: string;
}

export function ProviderIcon({ id, name, size = 18, className }: ProviderIconProps) {
  const key = resolveKey(id);
  const color = BRAND_COLORS[key] ?? '#7c8aa5';
  const slug = BRAND_SLUGS[key];
  const mark =
    BRAND_INITIALS[key] ?? (name ? name.trim().slice(0, 2) : id.slice(0, 2)).toUpperCase();

  const [logoFailed, setLogoFailed] = useState(false);
  // Reset the failure flag if the provider changes.
  useEffect(() => setLogoFailed(false), [slug]);

  // Real brand logo (Simple Icons CDN serves the SVG in the brand's colour).
  if (slug && !logoFailed) {
    const inner = Math.round(size * 0.72);
    return (
      <span
        className={`provider-icon provider-icon--logo${className ? ` ${className}` : ''}`}
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(4, size * 0.28),
          // Light chip so dark/monochrome brand marks (e.g. X, OpenAI) stay
          // legible against the app's dark surfaces.
          background: '#ffffff',
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
        title={name ?? id}
      >
        <img
          src={`https://cdn.simpleicons.org/${slug}`}
          alt={name ?? id}
          width={inner}
          height={inner}
          loading="lazy"
          draggable={false}
          onError={() => setLogoFailed(true)}
          style={{ width: inner, height: inner, objectFit: 'contain', display: 'block' }}
        />
      </span>
    );
  }

  // Fallback: coloured monogram badge (offline / unknown providers).
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.max(4, size * 0.28),
    background: `linear-gradient(160deg, ${color}, ${color}cc)`,
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: Math.max(9, size * 0.46),
    fontWeight: 700,
    lineHeight: 1,
    flexShrink: 0,
    letterSpacing: '-0.02em',
    boxShadow: `inset 0 0 0 1px ${color}66`,
  };

  return (
    <span
      className={`provider-icon${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
      title={name ?? id}
    >
      {mark}
    </span>
  );
}
