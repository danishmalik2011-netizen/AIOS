import { ipcMain } from 'electron';
import { exec } from 'node:child_process';
import path from 'node:path';
import { CHANNELS } from './channels.js';

/* ================================================
   One-shot command execution for the agent's `run_command` tool.

   Unlike the interactive PTY (used by the Terminal view), this captures the
   combined stdout/stderr and resolves with the output so the model can read
   the result and react to it — the missing half of a Claude-Code-style CLI
   loop. A generous timeout + buffer keep long builds from hanging the agent.
   ================================================ */

const EXEC_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 16 * 1024 * 1024;
/** Truncate very long output before handing it back to the model. */
const MAX_OUTPUT_CHARS = 40_000;

function truncate(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const head = output.slice(0, MAX_OUTPUT_CHARS / 2);
  const tail = output.slice(output.length - MAX_OUTPUT_CHARS / 2);
  return `${head}\n… (output truncated, ${output.length} chars total) …\n${tail}`;
}

export interface ShellExecResult {
  output: string;
  exitCode: number;
  error?: string;
}

export function registerShellHandlers(): void {
  ipcMain.handle(
    CHANNELS.shellExec,
    async (_event, command: string, cwd?: string, timeoutSec?: number): Promise<ShellExecResult> => {
      if (!command || typeof command !== 'string') {
        return { output: '', exitCode: 1, error: 'Missing command.' };
      }

      const resolvedCwd = cwd && path.isAbsolute(cwd) ? cwd : process.cwd();
      // Allow the agent to request a longer timeout for big builds/tests, but
      // keep it bounded so a runaway command can't hang the agent forever.
      const timeoutMs =
        timeoutSec && Number.isFinite(timeoutSec)
          ? Math.min(Math.max(1, Math.round(timeoutSec)) * 1000, 600_000)
          : EXEC_TIMEOUT_MS;

      return new Promise<ShellExecResult>((resolve) => {
        const child = exec(command, {
          cwd: resolvedCwd,
          windowsHide: true,
          maxBuffer: MAX_BUFFER,
          timeout: timeoutMs,
          env: process.env as Record<string, string>,
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr?.on('data', (d) => {
          stderr += d.toString();
        });

        child.on('error', (err) => {
          resolve({
            output: truncate(stdout + stderr),
            exitCode: 1,
            error: err.message,
          });
        });

        child.on('close', (code, signal) => {
          const combined = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
          resolve({
            output: truncate(combined),
            exitCode: signal ? 1 : code ?? 0,
            error: signal ? `Killed by signal ${signal}` : undefined,
          });
        });
      });
    },
  );
}
