/* ================================================
   MCP Registry — the single seam between external MCP servers and AIOS.

   - Stores user-configured server URLs (persisted to localStorage).
   - Lazily connects + caches a client per server, then caches its tool list.
   - Exposes `getActiveToolDefinitions()` — the merged list of built-in tools
     plus every enabled server's tools — which both the chat composer and the
     fleet feed into `complete({ tools })`.
   - Executes an MCP tool call by namespaced name.
   ================================================ */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MCPClient } from './client';
import type { MCPServerConfig, MCPToolDefinition } from './types';
import { AGENT_TOOLS } from '@/services/providers/toolSchemas';
import type { ToolDefinition } from '@/services/providers/types';

interface MCPState {
  servers: MCPServerConfig[];
  addServer: (cfg: Omit<MCPServerConfig, 'id' | 'enabled'> & Partial<Pick<MCPServerConfig, 'enabled'>>) => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, patch: Partial<MCPServerConfig>) => void;
}

export const useMCPStore = create<MCPState>()(
  persist(
    (set) => ({
      servers: [],
      addServer: (cfg) =>
        set((s) => ({
          servers: [
            ...s.servers,
            { enabled: true, id: `mcp-${Date.now().toString(36)}`, ...cfg },
          ],
        })),
      removeServer: (id) => set((s) => ({ servers: s.servers.filter((x) => x.id !== id) })),
      updateServer: (id, patch) =>
        set((s) => ({ servers: s.servers.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
    }),
    { name: 'aios-mcp-servers' },
  ),
);

/** Lazily-built client per server id (not persisted — connections are live). */
const clientCache = new Map<string, MCPClient>();
/** Cached tool lists per server id, refreshed on connect / manual refresh. */
const toolCache = new Map<string, MCPToolDefinition[]>();

function getClient(cfg: MCPServerConfig): MCPClient {
  let client = clientCache.get(cfg.id);
  if (!client) {
    client = new MCPClient(cfg);
    clientCache.set(cfg.id, client);
  }
  return client;
}

/**
 * Connect to a server (initialize) and cache its tool list. Safe to call
 * repeatedly; subsequent calls reuse the cached tools unless `force`.
 */
export async function connectServer(
  cfg: MCPServerConfig,
  force = false,
): Promise<MCPToolDefinition[]> {
  if (!force && toolCache.has(cfg.id)) return toolCache.get(cfg.id)!;
  const client = getClient(cfg);
  await client.initialize();
  const tools = await client.listTools();
  toolCache.set(cfg.id, tools);
  return tools;
}

/** Drop cached connection + tools for a server (e.g. after disable/remove). */
export function disconnectServer(id: string): void {
  clientCache.delete(id);
  toolCache.delete(id);
}

/** All tool definitions from every enabled, reachable server (best effort). */
export async function getMCPToolDefinitions(): Promise<MCPToolDefinition[]> {
  const enabled = useMCPStore.getState().servers.filter((s) => s.enabled && s.url);
  const all: MCPToolDefinition[] = [];
  await Promise.all(
    enabled.map(async (cfg) => {
      try {
        const tools = await connectServer(cfg);
        all.push(...tools);
      } catch {
        // A dead server should never block the rest of the fleet's tools.
      }
    }),
  );
  return all;
}

/**
 * The full tool list offered to any model call: built-in `AGENT_TOOLS` plus
 * every MCP server's tools. Used by BOTH the chat composer and the fleet, so
 * external MCP tools are available everywhere without code changes.
 */
export async function getActiveToolDefinitions(): Promise<ToolDefinition[]> {
  const mcp = await getMCPToolDefinitions();
  return [
    ...AGENT_TOOLS,
    ...mcp.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  ];
}

/** Execute an MCP tool by its namespaced model name (e.g. `mcp__git__search`). */
export async function executeMCPTool(
  namespacedName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const def = await findTool(namespacedName);
  if (!def) return `MCP tool "${namespacedName}" is not available (server offline?).`;
  const cfg = useMCPStore.getState().servers.find((s) => s.id === def.serverId);
  if (!cfg) return `MCP server for "${namespacedName}" not found.`;
  const client = getClient(cfg);
  // Ensure the session exists (cheap if already initialised).
  await client.initialize();
  return client.callTool(def.serverToolName, args);
}

async function findTool(name: string): Promise<MCPToolDefinition | undefined> {
  const list = await getMCPToolDefinitions();
  return list.find((t) => t.name === name);
}

/** True when a tool name belongs to an MCP server (namespaced) vs built-in. */
export function isMCPToolName(name: string): boolean {
  return name.startsWith('mcp__');
}

/** Strip the `mcp__<server>__` prefix back to the bare server tool name. */
export function parseMCPToolName(name: string): { server: string; tool: string } | null {
  const m = name.match(/^mcp__([^_]+)__(.+)$/);
  if (!m) return null;
  return { server: m[1], tool: m[2] };
}
