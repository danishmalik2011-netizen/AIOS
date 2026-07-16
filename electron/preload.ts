import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from './ipc/channels.js';
import type { FsSearchMatch, FsSearchOptions } from './ipc/fs.js';

const api = {
  isElectron: true as const,

  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke(CHANNELS.dialogOpenFolder),
  },

  fs: {
    readTree: (rootPath: string) => ipcRenderer.invoke(CHANNELS.fsReadTree, rootPath),
    readFile: (rootPath: string, relPath: string): Promise<string> =>
      ipcRenderer.invoke(CHANNELS.fsReadFile, rootPath, relPath),
    search: (rootPath: string, query: string, opts?: FsSearchOptions): Promise<FsSearchMatch[]> =>
      ipcRenderer.invoke(CHANNELS.fsSearch, rootPath, query, opts),
    writeFile: (rootPath: string, relPath: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.fsWriteFile, rootPath, relPath, content),
    createEntry: (
      rootPath: string,
      dirPath: string,
      name: string,
      type: 'file' | 'directory',
    ): Promise<unknown> => ipcRenderer.invoke(CHANNELS.fsCreateEntry, rootPath, dirPath, name, type),
    onTreeChanged: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('fs:tree-changed', handler);
      return () => ipcRenderer.removeListener('fs:tree-changed', handler);
    },
  },

  git: {
    status: (repoPath: string) => ipcRenderer.invoke(CHANNELS.gitStatus, repoPath),
    stage: (repoPath: string, filePath: string) => ipcRenderer.invoke(CHANNELS.gitStage, repoPath, filePath),
    unstage: (repoPath: string, filePath: string) => ipcRenderer.invoke(CHANNELS.gitUnstage, repoPath, filePath),
    stageAll: (repoPath: string) => ipcRenderer.invoke(CHANNELS.gitStageAll, repoPath),
    unstageAll: (repoPath: string) => ipcRenderer.invoke(CHANNELS.gitUnstageAll, repoPath),
    commit: (repoPath: string, message: string) => ipcRenderer.invoke(CHANNELS.gitCommit, repoPath, message),
    log: (repoPath: string, maxCount?: number) => ipcRenderer.invoke(CHANNELS.gitLog, repoPath, maxCount),
  },

  pty: {
    spawn: (sessionId: string, cwd: string | undefined, cols: number, rows: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(CHANNELS.ptySpawn, sessionId, cwd, cols, rows),
    attach: (sessionId: string, cols: number, rows: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(CHANNELS.ptyAttach, sessionId, cols, rows),
    write: (sessionId: string, data: string): void => ipcRenderer.send(CHANNELS.ptyWrite, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): void =>
      ipcRenderer.send(CHANNELS.ptyResize, sessionId, cols, rows),
    kill: (sessionId: string): void => ipcRenderer.send(CHANNELS.ptyKill, sessionId),
    onData: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_e: unknown, sessionId: string, data: string) => callback(sessionId, data);
      ipcRenderer.on(CHANNELS.ptyData, handler);
      return () => ipcRenderer.removeListener(CHANNELS.ptyData, handler);
    },
    onExit: (callback: (sessionId: string, exitCode: number) => void) => {
      const handler = (_e: unknown, sessionId: string, exitCode: number) => callback(sessionId, exitCode);
      ipcRenderer.on(CHANNELS.ptyExit, handler);
      return () => ipcRenderer.removeListener(CHANNELS.ptyExit, handler);
    },
  },

  shell: {
    /** Run a command once and resolve with its captured output (stdout+stderr).
     *  `options.timeout` (seconds) overrides the default command timeout so the
     *  agent can run longer builds/tests without being killed early. */
    exec: (
      command: string,
      cwd?: string,
      options?: { timeout?: number },
    ): Promise<{ output: string; exitCode: number; error?: string }> =>
      ipcRenderer.invoke(CHANNELS.shellExec, command, cwd, options?.timeout),
  },

  secrets: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke(CHANNELS.secretsGet, key),
    set: (key: string, value: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.secretsSet, key, value),
    clear: (key: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.secretsClear, key),
    has: (key: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.secretsHas, key),
  },

  updater: {
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    onUpdateStatus: (callback: (payload: any) => void) => {
      const handler = (_e: unknown, payload: any) => callback(payload);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
  },
};

export type AiosBridge = typeof api;

contextBridge.exposeInMainWorld('aios', api);
