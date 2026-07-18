/* ================================================
   AIOS CLI — credential & config loader
   The desktop app stores keys in the OS keychain (Electron
   safeStorage). The CLI has no such bridge, so it loads
   credentials from environment variables and/or a JSON config
   file (~/.aios/config.json). The shape mirrors useSettingsStore
   so the same provider drivers work unchanged.
   ================================================ */

import os from 'node:os';
import fssync from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

export type ProviderKind = 'anthropic' | 'openai' | 'openai-compatible' | 'ollama';

export interface CliProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  nativeTools?: boolean;
  apiKey?: string;
  models?: string[];
}

export interface CliConfig {
  providers?: CliProvider[];
}

const CONFIG_PATH = path.join(homedir(), '.aios', 'config.json');

const ENV_KEY_PREFIX = 'AIOS_API_KEY_'; // AIOS_API_KEY_OPENAI
const ENV_URL_PREFIX = 'AIOS_BASE_URL_'; // AIOS_BASE_URL_OPENROUTER

/** Built-in provider ids → conventional environment variable. */
const PROVIDER_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: '',
};

function readConfigFile(): CliConfig {
  try {
    const raw = fssync.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

function envKeyFor(id: string): string | undefined {
  if (PROVIDER_ENV[id]) return PROVIDER_ENV[id];
  return `${ENV_KEY_PREFIX}${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/** Resolve the API key for a provider from env, then config file. */
export function resolveApiKey(id: string): string | null {
  const envName = envKeyFor(id);
  const fromEnv = envName ? process.env[envName] : undefined;
  if (fromEnv && fromEnv.trim().length >= 12) return fromEnv.trim();

  const cfg = readConfigFile();
  const provider = cfg.providers?.find((p) => p.id === id);
  if (provider?.apiKey && provider.apiKey.trim().length >= 12) return provider.apiKey.trim();
  return null;
}

/** Resolve custom (openai-compatible) providers from env + config file. */
export function resolveProviders(): CliProvider[] {
  const cfg = readConfigFile();
  const out = new Map<string, CliProvider>();

  // From config file.
  for (const p of cfg.providers ?? []) {
    out.set(p.id, { ...p, apiKey: resolveApiKey(p.id) ?? p.apiKey });
  }

  // From AIOS_BASE_URL_* env (openai-compatible).
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(ENV_URL_PREFIX)) {
      const id = key.slice(ENV_URL_PREFIX.length).toLowerCase();
      const existing = out.get(id) ?? { id, name: id, kind: 'openai-compatible' as ProviderKind };
      existing.kind = 'openai-compatible';
      existing.baseUrl = process.env[key]!;
      existing.apiKey = resolveApiKey(id) ?? existing.apiKey;
      out.set(id, existing);
    }
  }
  return [...out.values()];
}

export function configPath(): string {
  return CONFIG_PATH;
}

/**
 * Persist a provider (with optional API key) to ~/.aios/config.json.
 * Used by the `/provider add` slash command so connections survive
 * across CLI runs. Merges with any existing providers in the file.
 */
export function saveProvider(provider: CliProvider): void {
  const cfg = readConfigFile();
  const providers = cfg.providers ? [...cfg.providers] : [];
  const idx = providers.findIndex((p) => p.id === provider.id);
  if (idx >= 0) providers[idx] = { ...providers[idx], ...provider };
  else providers.push(provider);
  fssync.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fssync.writeFileSync(CONFIG_PATH, JSON.stringify({ ...cfg, providers }, null, 2), 'utf-8');
}

/** Remove a provider (and its stored key) from ~/.aios/config.json. */
export function deleteProvider(id: string): void {
  const cfg = readConfigFile();
  const providers = (cfg.providers ?? []).filter((p) => p.id !== id);
  fssync.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fssync.writeFileSync(CONFIG_PATH, JSON.stringify({ ...cfg, providers }, null, 2), 'utf-8');
}

/** Return a masked preview like "sk-or-v1-fbb…3b3e" for display. */
export function maskKey(key: string): string {
  if (key.length <= 12) return '***';
  return key.slice(0, 10) + '…' + key.slice(-4);
}


export interface ActiveSelection {
  provider?: string;
  model?: string;
}

/** Read the last provider · model the user actively selected (persisted
 *  separately from credentials so the REPL remembers the brain across runs). */
export function loadActive(): ActiveSelection {
  try {
    const cfg = readConfigFile() as CliConfig & { active?: ActiveSelection };
    return cfg.active ?? {};
  } catch {
    return {};
  }
}

/** Persist the active provider · model selection. */
export function saveActive(sel: ActiveSelection): void {
  const cfg = readConfigFile() as CliConfig & { active?: ActiveSelection };
  cfg.active = { ...cfg.active, ...sel };
  fssync.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fssync.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

export interface ThemeConfig {
  userColor?: string;
  agentColor?: string;
}

export function loadTheme(): ThemeConfig {
  try {
    const cfg = readConfigFile() as CliConfig & { theme?: ThemeConfig };
    return cfg.theme ?? {};
  } catch {
    return {};
  }
}

export function saveTheme(theme: ThemeConfig): void {
  const cfg = readConfigFile() as CliConfig & { theme?: ThemeConfig };
  cfg.theme = { ...cfg.theme, ...theme };
  fssync.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fssync.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

export const __osTmp = os.tmpdir(); // re-exported in case callers need it

import crypto from 'node:crypto';

export function getHistoryPath(root: string): string {
  const abs = path.resolve(root);
  const hash = crypto.createHash('sha256').update(abs).digest('hex');
  return path.join(homedir(), '.aios', 'sessions', `${hash}.json`);
}

export function loadHistory(root: string): any[] {
  try {
    const file = getHistoryPath(root);
    if (!fssync.existsSync(file)) return [];
    const raw = fssync.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as any[];
  } catch {
    return [];
  }
}

export function saveHistory(root: string, history: any[]): void {
  try {
    const file = getHistoryPath(root);
    fssync.mkdirSync(path.dirname(file), { recursive: true });
    fssync.writeFileSync(file, JSON.stringify(history, null, 2), 'utf-8');
  } catch (err) {
    // ignore
  }
}
