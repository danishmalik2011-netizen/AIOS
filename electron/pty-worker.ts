import os from 'node:os';
import path from 'path';

let pty: any;
try {
  const modulesDir = process.env.PTY_MODULES_PATH;
  const ptyModulePath = modulesDir
    ? path.join(modulesDir, 'node-pty')
    : 'node-pty';
  
  // require dynamically so it doesn't get resolved from inside the ASAR during packaging
  pty = require(ptyModulePath);
} catch (e) {
  console.error("Failed to load node-pty:", e);
}

const spawn = pty?.spawn;

const sessions = new Map<string, any>();

function defaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

process.parentPort.on('message', (event) => {
  const msg = event.data;
  const { type, sessionId, data, cols, rows, cwd } = msg;

  if (type === 'spawn') {
    try {
      const shell = defaultShell();
      const ptyProcess = spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd || os.homedir(),
        env: process.env as Record<string, string>,
      });

      sessions.set(sessionId, ptyProcess);

      ptyProcess.onData((out: string) => {
        process.parentPort.postMessage({ type: 'data', sessionId, data: out });
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        process.parentPort.postMessage({ type: 'exit', sessionId, exitCode });
        sessions.delete(sessionId);
      });

      process.parentPort.postMessage({ type: 'spawn-success', sessionId });
    } catch (err) {
      process.parentPort.postMessage({
        type: 'spawn-error',
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (type === 'write') {
    sessions.get(sessionId)?.write(data);
  }

  if (type === 'resize') {
    try {
      sessions.get(sessionId)?.resize(cols, rows);
    } catch (e) {
      // ignore
    }
  }

  if (type === 'kill') {
    sessions.get(sessionId)?.kill();
    sessions.delete(sessionId);
  }

  if (type === 'attach') {
    const ptyProcess = sessions.get(sessionId);
    if (ptyProcess) {
      // Resize to new dimensions
      try {
        ptyProcess.resize(cols, rows);
      } catch (e) {
        // ignore
      }
      // Re-establish data/exit listeners
      ptyProcess.onData((out: string) => {
        process.parentPort.postMessage({ type: 'data', sessionId, data: out });
      });
      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        process.parentPort.postMessage({ type: 'exit', sessionId, exitCode });
        sessions.delete(sessionId);
      });
      process.parentPort.postMessage({ type: 'attach-success', sessionId });
    } else {
      process.parentPort.postMessage({
        type: 'attach-error',
        sessionId,
        error: 'Session not found',
      });
    }
  }
});
