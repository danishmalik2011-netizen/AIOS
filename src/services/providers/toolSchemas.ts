/* ================================================
   Agent tool definitions — the single source of truth for the tools the
   chat agent can call. Consumed two ways:
     1. As provider-native function/tool schemas (`AGENT_TOOLS` → request.tools).
     2. As a text prompt block for models without native tool-calling
        (`toolsToXmlPromptDoc` → appended to the system prompt), so the XML
        `<tool_call>` fallback stays in lock-step with the real schemas.
   ================================================ */

import type { ToolDefinition } from './types';

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file in the workspace. By default returns up to 2000 lines with 1-based line numbers. Use offset/limit to read only the targeted section you need to inspect or fix — this keeps context small and avoids re-reading the whole file. Output is wrapped in <file path lines=... showing=A-B> ... </file>.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root, e.g. "src/index.ts".' },
        offset: {
          type: 'number',
          description:
            '0-based line index to start reading from (e.g. 0 for the top, 120 to skip the first 120 lines). Defaults to 0. Use this to read only the part of the file you care about.',
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of lines to return from the offset. Defaults to the remainder of the file (capped at 2000). Use a small value (e.g. 40) to read only the targeted block.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Create a NEW file or fully replace an EXISTING file. ' +
      'For edits to existing files (bug fixes, refactors, adding sections) prefer patch_file ' +
      'which is safer — it only touches the changed span. Use write_file only when creating a ' +
      'new file or when the change is large enough to rewrite the whole file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root.' },
        content: { type: 'string', description: 'The full new file contents.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'patch_file',
    description:
      'Surgically edit an existing file by replacing an exact string span with new content. ' +
      'Safer than write_file for targeted changes — only the matched region is touched. ' +
      'The old_str must match the file EXACTLY (including whitespace/indentation). ' +
      'Only the FIRST occurrence is replaced. Use write_file if the file does not exist yet.',
    parameters: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Path to the file, relative to the project root.' },
        old_str: { type: 'string', description: 'The exact string to find and replace. Must match exactly.' },
        new_str: { type: 'string', description: 'The replacement string.' },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },
  {
    name: 'append_file',
    description:
      'Append content to the END of an existing file without overwriting it. ' +
      'Use this for writing LARGE files in safe chunks: ' +
      '(1) write_file for the first chunk, (2) append_file for each subsequent chunk. ' +
      'Returns the new total line count so you can verify nothing was truncated. ' +
      'Also use this to add new sections, functions, or CSS blocks to an existing file.',
    parameters: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Path to the file, relative to the project root.' },
        content: { type: 'string', description: 'The content to append at the end of the file.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'List the workspace file tree (all files and directories from the project root).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional subdirectory to list, relative to the root.' },
      },
    },
  },
  {
    name: 'search_code',
    description: 'Search the codebase for a substring or regular expression and return matching file paths with line numbers and previews. Use this to find where things are defined or used.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The text or regular expression to search for.' },
        isRegex: { type: 'boolean', description: 'Treat the query as a regular expression. Defaults to false.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_net',
    description:
      'Perform a LIVE WEB search (the network counterpart to search_code, which only searches local files). ' +
      'Returns a compact list of results — title, URL, and snippet — for the given query. ' +
      'Default backend is DuckDuckGo\'s keyless Instant Answer API (no API key required). ' +
      'Use this to look up current documentation, library APIs, error messages, or anything not in the local codebase. ' +
      'For a self-hosted or custom search endpoint, set engine to "url" and pass a `url` (or rely on the AIOS_SEARCH_API env var).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query / question.' },
        limit: { type: 'number', description: 'Max results to return (1–20). Defaults to 8.' },
        engine: {
          type: 'string',
          description: "Search backend: 'ddg' (default, keyless) or 'url' (custom endpoint).",
          enum: ['ddg', 'url'],
        },
        url: {
          type: 'string',
          description:
            "When engine='url', the endpoint to GET. Use '{q}' as a placeholder for the encoded query (e.g. 'https://my-proxy.example/search?q={q}'). Falls back to the AIOS_SEARCH_API env var.",
        },
        token: { type: 'string', description: "Optional bearer token sent when engine='url'." },
        timeout: { type: 'number', description: 'Per-request timeout in seconds (1–60). Defaults to 15.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command in a new terminal tab (e.g. run tests, install deps, build).',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute.' },
        timeout: {
          type: 'number',
          description:
            'Optional max wait time in seconds for the command to finish (e.g. 300 for a long build). Defaults to 120s. Estimate the duration from the command\'s complexity so the run is not killed early.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'wait',
    description:
      'Pause the workflow for a number of seconds before the next step. Use this after launching a long-running or background command (build, install, test suite, dev server) so its output is ready before you continue. Estimate the duration from the command\'s complexity and expected runtime.',
    parameters: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Seconds to wait (e.g. 30). Clamped to 1–600.',
        },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'git_status',
    description: 'Get the current git status of the workspace (branch, staged, unstaged, untracked).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'git_commit',
    description: 'Create a git commit with the given message (stages all changes first if needed).',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The commit message.' },
      },
      required: ['message'],
    },
  },
  {
    name: 'create_artifact',
    description:
      'Record a deliverable in the Agent Canvas panel the user is watching (a spec, doc, design notes, diagram, or code snippet). Use this for anything worth keeping beyond the chat transcript.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the artifact, e.g. "Auth flow spec".' },
        type: {
          type: 'string',
          description: 'Artifact kind: "spec" | "doc" | "diagram" | "code".',
          enum: ['spec', 'doc', 'diagram', 'code'],
        },
        content: { type: 'string', description: 'The full artifact body (markdown/text/code).' },
      },
      required: ['title', 'type', 'content'],
    },
  },
  {
    name: 'update_plan',
    description:
      'Define or replace the implementation plan / todo checklist shown in the Agent Canvas. Pass the COMPLETE list of steps each time (the canvas replaces the whole plan). Mark status as "pending", "active" (in progress), or "done".',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional plan title, e.g. "Implement login".' },
        steps: {
          type: 'array',
          description: 'The full ordered list of plan steps / todos.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'What this step accomplishes.' },
              status: {
                type: 'string',
                description: 'Step status: "pending" | "active" | "done".',
                enum: ['pending', 'active', 'done'],
              },
            },
            required: ['text'],
          },
        },
      },
      required: ['steps'],
    },
  },
];

interface JsonSchemaLike {
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
}

/**
 * Render the tool set as an XML `<tool_call>` prompt block, for models that
 * don't support native tool-calling. A tool whose params include a `content`
 * field puts that field in the tag body; every other param is an attribute.
 */
export function toolsToXmlPromptDoc(tools: ToolDefinition[]): string {
  const lines: string[] = [];
  for (const tool of tools) {
    const schema = tool.parameters as JsonSchemaLike;
    const props = schema.properties ?? {};
    const keys = Object.keys(props);
    const hasBody = keys.includes('content');
    const attrs = keys
      .filter((k) => k !== 'content')
      .map((k) => `${k}="..."`)
      .join(' ');
    const open = `<tool_call name="${tool.name}"${attrs ? ' ' + attrs : ''}`;
    if (hasBody) {
      lines.push(`- ${open}>file contents here</tool_call> — ${tool.description}`);
    } else {
      lines.push(`- ${open}/> — ${tool.description}`);
    }
  }
  return lines.join('\n');
}
