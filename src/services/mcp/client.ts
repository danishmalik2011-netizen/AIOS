/* ================================================
   MCP Streamable HTTP client — minimal JSON-RPC transport.

   Implements just enough of the MCP spec to:
     - initialize a session (handshake)
     - listTools
     - callTool

   Transport details (MCP Streamable HTTP):
     - One POST endpoint (the server URL) for every JSON-RPC request.
     - `Accept: application/json, text/event-stream`.
     - Server may reply with `Mcp-Session-Id` (a session we must echo on
       subsequent requests) and may stream SSE; we parse both `application/json`
       and `text/event-stream` bodies.
   ================================================ */

import type { MCPServerConfig, MCPToolDefinition } from './types';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Parse either a JSON body or an SSE stream into a single JSON-RPC response. */
async function parseBody(res: Response): Promise<JsonRpcResponse> {
  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('text/event-stream')) {
    const text = await res.text();
    // The relevant payload is the last `data:` line.
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('data:'));
    const last = lines[lines.length - 1]?.slice(5).trim();
    if (!last) throw new Error('MCP: empty SSE stream');
    return JSON.parse(last) as JsonRpcResponse;
  }
  return (await res.json()) as JsonRpcResponse;
}

export class MCPClient {
  private cfg: MCPServerConfig;
  private sessionId: string | null = null;
  private nextId = 1;
  private protocolVersion = '2025-06-18';

  constructor(cfg: MCPServerConfig) {
    this.cfg = cfg;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...extra,
    };
    if (this.sessionId) h['mcp-session-id'] = this.sessionId;
    if (this.cfg.token) h['authorization'] = `Bearer ${this.cfg.token}`;
    return h;
  }

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    // Capture the session id the server hands back (initialize only).
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`MCP ${method} failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const json = await parseBody(res);
    if (json.error) {
      throw new Error(`MCP ${method} error ${json.error.code}: ${json.error.message}`);
    }
    return json.result;
  }

  /** Handshake. Idempotent — safe to call before any other method. */
  async initialize(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: { tools: {} },
      clientInfo: { name: 'aios', version: '1.2.2' },
    });
    // Notify the server we're ready (fire-and-forget; ignore failures).
    try {
      await this.rpc('notifications/initialized', undefined);
    } catch {
      /* non-fatal */
    }
  }

  /** List the server's tools, normalised to MCPToolDefinition form. */
  async listTools(): Promise<MCPToolDefinition[]> {
    const result = (await this.rpc('tools/list', {})) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
    };
    const tools = result.tools ?? [];
    return tools.map((t) => ({
      name: `mcp__${this.cfg.name}__${t.name}`,
      serverToolName: t.name,
      serverId: this.cfg.id,
      serverName: this.cfg.name,
      description: t.description ?? `MCP tool ${t.name} (${this.cfg.name})`,
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    }));
  }

  /** Invoke a tool on the server. `args` is an already-parsed object. */
  async callTool(serverToolName: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.rpc('tools/call', {
      name: serverToolName,
      arguments: args,
    })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    const parts = (result.content ?? [])
      .map((c) => (c.type === 'text' ? c.text ?? '' : JSON.stringify(c)))
      .join('\n')
      .trim();
    return parts || '(tool returned no output)';
  }
}
