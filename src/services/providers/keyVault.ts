/* ================================================
   API Key Vault — local-first credential storage
   In the Electron desktop build, keys are encrypted at rest via the OS
   keychain (see electron/ipc/secrets.ts, backed by Electron's
   safeStorage — DPAPI / Keychain / libsecret). In a plain browser tab
   (no window.aios bridge) keys fall back to localStorage so the app
   stays fully usable there too, just without at-rest encryption.
   ================================================ */

import type { ProviderType } from '@/core/types';
import { useSettingsStore } from '@/store/useSettingsStore';

const STORAGE_KEY = 'aios-provider-keys';

type KeyMap = Partial<Record<ProviderType, string>>;

/** A value that is present and not one of the seeded placeholder strings. */
export function isRealKey(value: string | undefined | null): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 12) return false;
  if (v.includes('xxxx') || v.includes('...')) return false;
  return true;
}

function readLocalStorageMap(): KeyMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KeyMap) : {};
  } catch {
    return {};
  }
}

function writeLocalStorageMap(map: KeyMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/* ------------------------------------------------------------------ */
/*  Synchronous, in-memory cache                                       */
/*  Providers call getApiKey()/hasApiKey() synchronously mid-request, */
/*  so the Electron (async IPC) path is mirrored into memory on load  */
/*  and every write, rather than making every call-site async.        */
/* ------------------------------------------------------------------ */

let cache: KeyMap = readLocalStorageMap();

async function hydrateFromElectron(): Promise<void> {
  if (!window.aios) return;
  // Read secrets for every configured provider (built-ins + custom ones the
  // user added), not just a hardcoded list, so custom provider keys survive.
  const providers: ProviderType[] = useSettingsStore.getState().providers.map((p) => p.id);
  const entries = await Promise.all(
    providers.map(async (p) => [p, await window.aios!.secrets.get(p)] as const),
  );
  const next: KeyMap = { ...cache };
  for (const [provider, value] of entries) {
    if (value) next[provider] = value;
  }
  cache = next;
}

void hydrateFromElectron();

export function getApiKey(provider: ProviderType): string | null {
  const val = cache[provider];
  return isRealKey(val) ? val : null;
}

export function setApiKey(provider: ProviderType, key: string): void {
  cache = { ...cache, [provider]: key };
  if (window.aios) {
    void window.aios.secrets.set(provider, key);
  } else {
    writeLocalStorageMap(cache);
  }
}

export function clearApiKey(provider: ProviderType): void {
  const next = { ...cache };
  delete next[provider];
  cache = next;
  if (window.aios) {
    void window.aios.secrets.clear(provider);
  } else {
    writeLocalStorageMap(cache);
  }
}

export function hasApiKey(provider: ProviderType): boolean {
  return getApiKey(provider) !== null;
}

/**
 * Whether a provider requires an API key to serve a request. Local/offline
 * providers (Ollama) and self-hosted openai-compatible endpoints on localhost
 * never need a key. Used by the Director to decide whether its optional LLM
 * planner can run, and by the chat to block keyless sends early.
 */
export function providerNeedsKey(id: ProviderType): boolean {
  if (id === 'ollama') return false;
  const provider = useSettingsStore.getState().providers.find((p) => p.id === id);
  if (provider?.baseUrl && /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(provider.baseUrl)) {
    return false;
  }
  return true;
}
