/* ================================================
   AIOS CLI — tool executor
   Implements the ToolExecutor contract used by runAgentTurn
   (src/services/agentRuntime.ts). It maps tool names to the
   Node transport (transport.ts) and applies a non-interactive
   permission policy (deny-blocks, ask auto-allows under --yes).
   ================================================ */

import * as t from './transport';

export interface ExecutorOptions {
  /** Workspace root the agent operates in. */
  root: string;
  /** Auto-approve mutating tools (write_file / run_command / git_commit). */
  autoApprove: boolean;
  /** Denied tools (never run). */
  deny?: string[];
  /** Ask (prompt) before mutating tools instead of auto-allowing. */
  prompt?: (label: string) => Promise<boolean>;
  /** Log a tool action for the TUI. */
  onTool?: (name: string, detail: string, extra?: unknown) => void;
}

class ToolRejectedError extends Error {}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function createExecutor(opts: ExecutorOptions) {
  /** Mutable working directory.  Starts at opts.root; the agent can move
   *  it with the 'change_dir' / 'cd' tool.  Every tool resolves paths
   *  relative to this so directory changes propagate through the session. */
  let currentDir = opts.root;

  /** Resolve a relative path against currentDir, or return currentDir when
   *  no path arg is given (useful for list_dir / run_command with no cwd). */
  const resolve = (rel?: string): string => {
    if (!rel) return currentDir;
    const nodePath = require('node:path') as typeof import('node:path');
    return nodePath.isAbsolute(rel)
      ? rel
      : nodePath.resolve(currentDir, rel);
  };

  const executeTool = async function executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    if (opts.deny?.includes(name)) {
      throw new ToolRejectedError(
        `Tool "${name}" is disabled by your permission settings (deny).`,
      );
    }

    const mutating = ['write_file', 'patch_file', 'append_file', 'run_command', 'git_commit'].includes(name);
    if (mutating && opts.prompt && !opts.autoApprove) {
      const label = describe(name, args);
      const ok = await opts.prompt(label);
      if (!ok) throw new ToolRejectedError(`Tool "${name}" was rejected.`);
    }

    switch (name) {
      /* ── Navigation ───────────────────────────────────────────────── */
      case 'cd':
      case 'change_dir': {
        const nodePath = require('node:path') as typeof import('node:path');
        const nodeFs   = require('node:fs')   as typeof import('node:fs');
        const target = str(args.path || args.directory || args.dir);
        if (!target) return `Current directory: ${currentDir}`;
        const next = nodePath.isAbsolute(target)
          ? target
          : nodePath.resolve(currentDir, target);
        if (!nodeFs.existsSync(next)) {
          return `Directory not found: ${next}`;
        }
        if (!nodeFs.statSync(next).isDirectory()) {
          return `Not a directory: ${next}`;
        }
        currentDir = next;
        opts.onTool?.('change_dir', next);
        return `Changed directory to: ${currentDir}`;
      }

      case 'pwd':
        return currentDir;

      /* ── File tools ───────────────────────────────────────────────── */
      case 'wait': {
        const seconds = Math.min(600, Math.max(1, Math.round(Number(args.seconds) || 5)));
        await new Promise((r) => setTimeout(r, seconds * 1000));
        return `Waited ${seconds}s.`;
      }

      case 'read_file':
        return t.readFile(
          currentDir,
          str(args.path),
          {
            offset: typeof args.offset === 'number' ? args.offset : undefined,
            limit:  typeof args.limit  === 'number' ? args.limit  : undefined,
          },
        );

      case 'search_code': {
        const searchRoot = resolve(str(args.root || ''));
        const matches = t.search(searchRoot, str(args.query), {
          isRegex: !!args.isRegex,
          maxResults: 40,
        });
        if (!matches.length) return `No matches found for "${str(args.query)}" in ${searchRoot}`;
        return `Found ${matches.length} match(es) in ${searchRoot}:\n${matches
          .slice(0, 40)
          .map((m) => `${m.path}:${m.line}:${m.preview}`)
          .join('\n')}`;
      }

      case 'search_net': {
        const results = await t.searchNet(str(args.query), {
          limit: typeof args.limit === 'number' ? args.limit : undefined,
          engine: (str(args.engine, 'ddg') as 'ddg' | 'url') || 'ddg',
          url: args.url ? str(args.url) : undefined,
          token: args.token ? str(args.token) : undefined,
          timeout: typeof args.timeout === 'number' ? args.timeout : undefined,
        });
        if (!results.length) {
          return `No web results found for "${str(args.query)}" (engine: ${str(args.engine, 'ddg')}).`;
        }
        return `Web search for "${str(args.query)}" — ${results.length} result(s):\n${results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
          .join('\n')}`;
      }

      case 'list_dir': {
        // Compact indented tree — never dumps raw JSON that fills the context.
        const listRoot = resolve(str(args.path || args.directory || ''));
        const tree = t.readTree(listRoot);
        const lines: string[] = [`${listRoot}/`];
        let entryCount = 0;
        const LIMIT = 200;
        const walk = (nodes: ReturnType<typeof t.readTree>, depth: number): void => {
          for (const node of nodes) {
            if (entryCount >= LIMIT) {
              if (entryCount === LIMIT)
                lines.push('  ... (capped at 200 entries — use a sub-path to see more)');
              entryCount++;
              return;
            }
            const indent = '  '.repeat(depth + 1);
            const suffix = node.type === 'directory' ? '/' : '';
            lines.push(`${indent}${node.name}${suffix}`);
            entryCount++;
            if (node.type === 'directory' && (node as any).children?.length) {
              walk((node as any).children, depth + 1);
            }
          }
        };
        walk(tree, 0);
        return lines.join('\n');
      }

      case 'write_file': {
        const content = str(args.content);
        const filePath = str(args.path);
        const diff = await t.writeFile(currentDir, filePath, content);
        // Format: "path  +added -removed" — parsed by toolBadge for coloured display
        const diffTag = diff.created
          ? `+${diff.linesAdded}`
          : `+${diff.linesAdded} -${diff.linesRemoved}`;
        opts.onTool?.(name, `${filePath}  ${diffTag}`, { content, diff });
        const verb = diff.created ? 'Created' : 'Wrote';
        return `${verb} ${resolve(filePath)} (${diffTag} lines, ${content.length} chars)`;
      }

      case 'patch_file': {
        const filePath = str(args.path);
        const diff = await t.patchFile(
          currentDir,
          filePath,
          str(args.old_str),
          str(args.new_str),
        );
        const diffTag = `+${diff.linesAdded} -${diff.linesRemoved}`;
        opts.onTool?.('write_file', `${filePath}  ${diffTag}`, {
          patch: true,
          old_str: str(args.old_str),
          new_str: str(args.new_str),
          diff
        });
        return `Patched ${resolve(filePath)} (${diffTag} lines)`;
      }

      case 'append_file': {
        const filePath = str(args.path);
        const content  = str(args.content);
        const res = await t.appendFile(currentDir, filePath, content);
        const diffTag = `+${res.appended}`;
        opts.onTool?.('write_file', `${filePath}  ${diffTag}`, {
          append: true,
          content,
          res
        });
        // Return total line count so agent can verify nothing was truncated.
        return `Appended to ${resolve(filePath)} (+${res.appended} lines, ${res.totalLines} total in file)`;
      }

      case 'run_command': {
        const cwd = resolve(str(args.cwd || ''));
        const res = await t.runCommand(
          str(args.command),
          cwd,
          typeof args.timeout === 'number' ? args.timeout : undefined,
        );
        const out     = (res.output || '').trim() || '(no output)';
        const exitTag = res.exitCode === 0 ? 'exit 0 ✓' : `exit ${res.exitCode ?? 1} ✗`;
        const errLine = res.error ? `\n[stderr] ${res.error}` : '';
        opts.onTool?.(name, str(args.command));
        return `[${cwd}] $ ${str(args.command)}\n[${exitTag}]${errLine}\n\n${out}`;
      }

      /* ── Git ──────────────────────────────────────────────────────── */
      case 'git_status':
        return JSON.stringify(await t.gitStatus(currentDir), null, 2);

      case 'git_commit': {
        const hash = await t.gitCommit(currentDir, str(args.message));
        opts.onTool?.('git_commit', str(args.message));
        return `Committed: ${hash}`;
      }

      /* ── Meta ─────────────────────────────────────────────────────── */
      case 'create_artifact':  return `Artifact "${str(args.title)}" recorded.`;
      case 'update_plan':      return `Plan updated.`;
      case 'respond_to_user':  return '[respond_to_user]';

      default:
        throw new Error(`Tool "${name}" is not supported by the CLI runtime.`);
    }
  };
  (executeTool as any).getCwd = () => currentDir;
  return executeTool;
}

function describe(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'write_file':  return `write ${str(args.path)}`;
    case 'patch_file':  return `patch ${str(args.path)}`;
    case 'run_command': return `run: ${str(args.command)}`;
    case 'git_commit':  return `commit: ${str(args.message)}`;
    default:            return name;
  }
}

export { ToolRejectedError };
