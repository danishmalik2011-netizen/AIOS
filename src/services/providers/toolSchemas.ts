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
    description: 'Read the full text contents of a file in the workspace, given its path relative to the project root.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root, e.g. "src/index.ts".' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file with the given contents. The user reviews the diff before it is applied unless auto-apply is on.',
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
  {
    name: 'respond_to_user',
    description:
      'Deliver your final response to the user: an answer, a summary of what was done, remaining work, or that the task is complete. Call this whenever no further workspace action is needed. Put your full message in the "message" parameter. Never end a turn with bare narration — always route your reply through this tool.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The complete message to show the user (markdown/code/bullets are fine).',
        },
      },
      required: ['message'],
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
