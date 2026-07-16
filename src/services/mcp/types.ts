/* ================================================
   MCP (Model Context Protocol) — shared contracts

   Lets the fleet and chat composer call tools exposed by external MCP servers
   (browsers, databases, deploy hooks, custom integrations) without recompiling
   AIOS. An MCP server advertises a list of tools; we surface them as ordinary
   `ToolDefinition`s so every provider driver (which already accepts
   `ToolDefinition[]`) can offer them to the model.

   Transport: MCP Streamable HTTP (JSON-RPC over fetch). No external SDK — the
   official transport is just POST JSON-RPC with the right Accept header, which
   works from the Electron renderer / browser.
   ================================================ */

/** A configured MCP server the user has registered in Settings. */
export interface MCPServerConfig {
  id: string;
  name: string;
  /** Base URL of the server's Streamable HTTP endpoint (…/mcp). */
  url: string;
  /** Optional bearer token sent as `Authorization: Bearer <token>`. */
  token?: string;
  enabled: boolean;
}

/** A tool from an MCP server, namespaced so it can't collide with built-ins. */
export interface MCPToolDefinition {
  /** Namespaced name actually sent to the model, e.g. `mcp__github__search`. */
  name: string;
  /** The bare tool name on the server (before namespacing). */
  serverToolName: string;
  serverId: string;
  serverName: string;
  description: string;
  /** JSON Schema (object) for the tool's input. */
  parameters: Record<string, unknown>;
}
