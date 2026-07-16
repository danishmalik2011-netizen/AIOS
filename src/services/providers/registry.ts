/* ================================================
   Provider Registry — the single entry point the app uses to reach a
   model. Resolves the best available real provider and surfaces real
   errors (missing key, host unreachable) instead of silently
   rerouting to a different provider.
   ================================================ */

import type { ProviderType } from '@/core/types';
import type {
  ProviderDriver, CompletionRequest, CompletionResult, StreamCallbacks,
} from './types';
import { anthropicDriver } from './anthropic';
import { openaiDriver } from './openai';
import { ollamaDriver } from './ollama';
import { createOpenAICompatibleDriver } from './openaiCompatible';
import { useSettingsStore } from '@/store/useSettingsStore';

/** Cache one generic OpenAI-compatible driver per custom provider id. */
const compatibleCache = new Map<string, ProviderDriver>();

/** NVIDIA NIM (vLLM-backed) rejects `tool_choice: "auto"` unless the server
 *  was launched with --enable-auto-tool-choice, which the hosted NIM is not.
 *  Auto-detect it so users don't have to flip the toggle manually. */
function isNvidiaNim(baseUrl: string): boolean {
  return /nvidianim\.com|nvidia\.com|integrate\.api\.nvidia/.test(baseUrl);
}

/** Resolve a custom `openai-compatible` provider (with a base URL) to its driver. */
function getCompatibleDriver(id: string): ProviderDriver | null {
  const provider = useSettingsStore.getState().providers.find((p) => p.id === id);
  if (!provider || provider.kind !== 'openai-compatible' || !provider.baseUrl) return null;
  const cached = compatibleCache.get(id);
  if (cached) return cached;
  // Explicit per-provider setting wins; otherwise NVIDIA NIM is assumed to
  // lack native tool calling and falls back to the XML `<tool_call>` format.
  const nativeTools = provider.nativeTools ?? !isNvidiaNim(provider.baseUrl);
  const driver = createOpenAICompatibleDriver({
    id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    nativeTools,
  });
  compatibleCache.set(id, driver);
  return driver;
}

const drivers: Record<ProviderType, ProviderDriver> = {
  anthropic: anthropicDriver,
  openai: openaiDriver,
  ollama: ollamaDriver,
};

/** Preference order when auto-resolving a provider for a task. */
const PREFERENCE: ProviderType[] = ['anthropic', 'openai', 'ollama'];

export function getDriver(id: ProviderType): ProviderDriver | null {
  return drivers[id] ?? getCompatibleDriver(id as string);
}

export function listDrivers(): ProviderDriver[] {
  return [anthropicDriver, openaiDriver, ollamaDriver];
}

/** True when at least one real provider reports availability. */
export async function hasLiveProvider(): Promise<boolean> {
  for (const id of PREFERENCE) {
    if (await drivers[id].isAvailable()) return true;
  }
  return false;
}

/**
 * Return the full list of model ids a provider exposes, fetched live from its
 * `/models` (or Ollama `/api/tags`) endpoint. No curated subset — free and
 * paid models are returned together so the composer can offer the complete set.
 * Falls back to the driver's built-in list when the network/key is unavailable.
 */
export async function listProviderModels(id: ProviderType): Promise<string[]> {
  const driver = getDriver(id) ?? getCompatibleDriver(id as string);
  if (!driver) return [];
  try {
    const models = await driver.listModels();
    return Array.from(new Set((models ?? []).filter(Boolean))).sort();
  } catch {
    return [];
  }
}

/**
 * Resolve a driver for a request.
 *
 * - `strict` (user-driven flows like the chat composer): honour the caller's
 *   explicit `preferred` choice and return it directly. Real errors (missing
 *   key, host unreachable) then surface to the caller instead of silently
 *   rerouting to a different provider/model.
 * - Non-strict (autonomous flows like the orchestration engine): if `preferred`
 *   is available use it, otherwise walk the preference order, otherwise fall
 *   back to the first real driver (which will surface a clear error if no
 *   key is configured).
 */
export async function resolveDriver(
  preferred?: ProviderType,
  strict = false,
): Promise<ProviderDriver> {
  if (strict && preferred) {
    const d = getDriver(preferred);
    if (d) return d;
  }
  if (preferred) {
    const d = drivers[preferred];
    if (d && (await d.isAvailable())) return d;
  }
  for (const id of PREFERENCE) {
    const d = drivers[id];
    if (await d.isAvailable()) return d;
  }
  return openaiDriver;
}

/**
 * High-level convenience: run a completion against the best provider.
 * With `strict: true` the call binds to the exact provider requested (used by
 * the chat composer so the user's selection and API key from Settings are
 * authoritative) and surfaces real errors instead of a silent fallback.
 */
export async function complete(
  req: CompletionRequest,
  opts?: StreamCallbacks & { preferred?: ProviderType; strict?: boolean },
): Promise<CompletionResult> {
  const driver = await resolveDriver(opts?.preferred, opts?.strict);
  return await driver.complete(req, opts);
}

export type { ProviderDriver, CompletionRequest, CompletionResult } from './types';