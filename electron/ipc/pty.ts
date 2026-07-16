import { ipcMain, BrowserWindow, utilityProcess, type UtilityProcess, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { CHANNELS } from './channels.js';

let worker: UtilityProcess | null = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPAWN_TIMEOUT_MS = 8000;

function getWorker(): UtilityProcess {
  if (worker) return worker;

  /* main.cjs and pty-worker.cjs are sibling files in the SAME output
     directory (both are top-level vite-plugin-electron entries) — do
     not add an extra '..' here, that was pointing one directory too
     high and made the worker fail to launch in dev. */
  const workerPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'pty-worker.cjs')
    : path.join(__dirname, 'pty-worker.cjs');

  const unpackedModulesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : path.join(app.getAppPath(), 'node_modules');

  const w = utilityProcess.fork(workerPath, [], {
    env: { ...process.env, PTY_MODULES_PATH: unpackedModulesDir },
    stdio: 'pipe',
  });

  w.stdout?.on('data', (data) => console.log(`[PTY STDOUT] ${data.toString()}`));
  w.stderr?.on('data', (data) => console.error(`[PTY STDERR] ${data.toString()}`));

  w.on('message', (msg: { type: string; sessionId: string; data?: string; exitCode?: number }) => {
    if (msg.type === 'data') {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(CHANNELS.ptyData, msg.sessionId, msg.data);
      }
    }
    if (msg.type === 'exit') {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(CHANNELS.ptyExit, msg.sessionId, msg.exitCode);
      }
    }
  });

  w.on('exit', (code) => {
    console.error(`[PTY] worker process exited (code ${code})`);
    worker = null;
  });

  worker = w;
  return w;
}

export function registerPtyHandlers(): void {
  ipcMain.handle(
    CHANNELS.ptySpawn,
    async (_event, sessionId: string, cwd: string | undefined, cols: number, rows: number) => {
      let w: UtilityProcess;
      try {
        w = getWorker();
      } catch (err) {
        return { ok: false, error: `Failed to launch terminal worker: ${err instanceof Error ? err.message : String(err)}` };
      }

      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        let settled = false;
        const finish = (result: { ok: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          w.off('message', onMessage);
          resolve(result);
        };

        const timer = setTimeout(() => {
          finish({ ok: false, error: 'Timed out waiting for the terminal worker to start (node-pty may have failed to load — check it was rebuilt for this Electron version).' });
        }, SPAWN_TIMEOUT_MS);

        const onMessage = (msg: { type: string; sessionId: string; error?: string }) => {
          if (msg.sessionId !== sessionId) return;
          if (msg.type === 'spawn-success') finish({ ok: true });
          if (msg.type === 'spawn-error') finish({ ok: false, error: msg.error });
        };

        w.on('message', onMessage);
        w.postMessage({ type: 'spawn', sessionId, cwd, cols, rows });
      });
    },
  );

  ipcMain.handle(
    CHANNELS.ptyAttach,
    async (_event, sessionId: string, cols: number, rows: number) => {
      let w: UtilityProcess;
      try {
        w = getWorker();
      } catch (err) {
        return { ok: false, error: `Failed to launch terminal worker: ${err instanceof Error ? err.message : String(err)}` };
      }

      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        let settled = false;
        const finish = (result: { ok: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          w.off('message', onMessage);
          resolve(result);
        };

        const timer = setTimeout(() => {
          finish({ ok: false, error: 'Timed out attaching to existing terminal session.' });
        }, 5000);

        const onMessage = (msg: { type: string; sessionId: string; error?: string }) => {
          if (msg.sessionId !== sessionId) return;
          if (msg.type === 'attach-success') finish({ ok: true });
          if (msg.type === 'attach-error') finish({ ok: false, error: msg.error });
        };

        w.on('message', onMessage);
        w.postMessage({ type: 'attach', sessionId, cols, rows });
      });
    },
  );

  ipcMain.on(CHANNELS.ptyWrite, (_event, sessionId: string, data: string) => {
    worker?.postMessage({ type: 'write', sessionId, data });
  });

  ipcMain.on(CHANNELS.ptyResize, (_event, sessionId: string, cols: number, rows: number) => {
    worker?.postMessage({ type: 'resize', sessionId, cols, rows });
  });

  ipcMain.on(CHANNELS.ptyKill, (_event, sessionId: string) => {
    worker?.postMessage({ type: 'kill', sessionId });
  });
}

export function killAllPtys(): void {
  if (worker) {
    worker.kill();
    worker = null;
  }
}
