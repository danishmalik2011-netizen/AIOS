/* ================================================
   Fleet tool dispatcher — lets a background (headless) fleet run actually
   invoke tools the model requests.

   The chat composer has its own UI-coupled `executeLocalTool` (diff review,
   approval popups). The fleet runs in the background and needs a non-interactive
   equivalent: read-only + command + git tools via the OS bridge, plus routing
   to any MCP server. Writes are allowed (background automation) but gated by the
   same Tool Permissions policy (Deny blocks, Allow bypasses).
   ================================================ */

import { usePermissionsStore } from '@/store/usePermissionsStore';
import { executeMCPTool, isMCPToolName } from '@/services/mcp/registry';

/** Coerce a possibly-unknown arg into a string (tool args arrive untyped). */
const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

/**
 * Execute a single tool call for a fleet agent. Returns the tool result text.
 * Throws on hard failure (the caller surfaces it as a tool error).
 */
export async function executeFleetTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  // MCP tools are namespaced (mcp__<server>__<tool>) — route them out first.
  if (isMCPToolName(name)) {
    return executeMCPTool(name, args);
  }

  // Permission policy: Deny blocks outright.
  const permMode = usePermissionsStore.getState().getMode(name);
  if (permMode === 'deny') {
    throw new Error(`Tool "${name}" is disabled by Tool Permissions (Deny).`);
  }

  if (!window.aios) {
    throw new Error('OS bridge not available (requires AIOS desktop app).');
  }
  const root = (window as any).__aiosProjectRoot || '';

  switch (name) {
    case 'wait': {
      const seconds = Math.min(600, Math.max(1, Math.round(Number(args.seconds) || 5)));
      await new Promise((r) => setTimeout(r, seconds * 1000));
      return `Waited ${seconds}s.`;
    }
    case 'read_file': {
      const p = str(args.path);
      if (!p) throw new Error('Missing file path parameter.');
      return await window.aios.fs.readFile(root, p);
    }
    case 'search_code': {
      const q = str(args.query);
      if (!q) throw new Error('Missing query parameter.');
      const matches = await window.aios.fs.search(root, q, {
        isRegex: !!args.isRegex,
        maxResults: 40,
      });
      if (!matches.length) return `No matches found for "${q}".`;
      return `Found ${matches.length} match(es):\n${matches
        .slice(0, 40)
        .map((m) => `${m.path}:${m.line}:${m.preview}`)
        .join('\n')}`;
    }
    case 'list_dir': {
      const files = await window.aios.fs.readTree(root);
      return JSON.stringify(files, null, 2);
    }
    case 'write_file': {
      const p = str(args.path);
      const content = str(args.content);
      if (!p) throw new Error('Missing file path parameter.');
      const ok = await window.aios.fs.writeFile(root, p, content);
      if (!ok) throw new Error('Failed to write file.');
      return `Successfully wrote ${content.length} characters to ${p}`;
    }
    case 'run_command': {
      const command = str(args.command);
      if (!command) throw new Error('Missing command parameter.');
      const timeout = typeof args.timeout === 'number' ? args.timeout : undefined;
      const res = await window.aios.shell.exec(
        command,
        root || undefined,
        timeout ? { timeout } : undefined,
      );
      const out = (str(res.output) || '(no output)').trim();
      return `Ran: ${command}\nExit code: ${res.exitCode ?? 0}${
        res.error ? `\nError: ${res.error}` : ''
      }\n\nOutput:\n${out}`;
    }
    case 'git_status': {
      return JSON.stringify(await window.aios.git.status(root), null, 2);
    }
    case 'git_commit': {
      const msg = str(args.message);
      if (!msg) throw new Error('Missing commit message.');
      return `Successfully created git commit: ${await window.aios.git.commit(root, msg)}`;
    }
    default:
      throw new Error(`Tool "${name}" is not supported by the fleet runtime.`);
  }
}
