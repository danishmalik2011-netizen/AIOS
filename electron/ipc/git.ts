import { ipcMain } from 'electron';
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';
import { CHANNELS } from './channels.js';

export interface GitFileChangeDTO {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions?: number;
  deletions?: number;
}

export interface GitStatusDTO {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChangeDTO[];
  unstaged: GitFileChangeDTO[];
  untracked: string[];
}

export interface GitCommitDTO {
  hash: string;
  message: string;
  author: string;
  date: number;
  files: number;
}

const gitCache = new Map<string, SimpleGit>();

function getGit(repoPath: string): SimpleGit {
  let git = gitCache.get(repoPath);
  if (!git) {
    git = simpleGit(repoPath);
    gitCache.set(repoPath, git);
  }
  return git;
}

async function buildStatusDTO(git: SimpleGit): Promise<GitStatusDTO> {
  const status: StatusResult = await git.status();

  const staged: GitFileChangeDTO[] = [];
  const unstaged: GitFileChangeDTO[] = [];

  for (const f of status.staged) staged.push({ path: f, status: 'modified' });
  for (const f of status.created) staged.push({ path: f, status: 'added' });
  for (const f of status.deleted) unstaged.push({ path: f, status: 'deleted' });
  for (const f of status.modified) {
    if (!staged.some((s) => s.path === f)) unstaged.push({ path: f, status: 'modified' });
  }
  for (const f of status.renamed) staged.push({ path: f.to, status: 'renamed' });

  return {
    branch: status.current ?? 'HEAD',
    ahead: status.ahead,
    behind: status.behind,
    staged,
    unstaged,
    untracked: status.not_added,
  };
}

export function registerGitHandlers(): void {
  ipcMain.handle(CHANNELS.gitStatus, async (_event, repoPath: string): Promise<GitStatusDTO | null> => {
    const git = getGit(repoPath);
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) return null;
    return buildStatusDTO(git);
  });

  ipcMain.handle(CHANNELS.gitStage, async (_event, repoPath: string, filePath: string) => {
    await getGit(repoPath).add(filePath);
    return buildStatusDTO(getGit(repoPath));
  });

  ipcMain.handle(CHANNELS.gitUnstage, async (_event, repoPath: string, filePath: string) => {
    await getGit(repoPath).reset(['HEAD', '--', filePath]);
    return buildStatusDTO(getGit(repoPath));
  });

  ipcMain.handle(CHANNELS.gitStageAll, async (_event, repoPath: string) => {
    await getGit(repoPath).add('.');
    return buildStatusDTO(getGit(repoPath));
  });

  ipcMain.handle(CHANNELS.gitUnstageAll, async (_event, repoPath: string) => {
    await getGit(repoPath).reset(['HEAD']);
    return buildStatusDTO(getGit(repoPath));
  });

  ipcMain.handle(CHANNELS.gitCommit, async (_event, repoPath: string, message: string): Promise<GitCommitDTO> => {
    const git = getGit(repoPath);
    const result = await git.commit(message);
    const log = await git.log({ maxCount: 1 });
    const latest = log.latest;
    return {
      hash: result.commit || latest?.hash || '',
      message,
      author: latest?.author_name ?? 'You',
      date: latest?.date ? new Date(latest.date).getTime() : Date.now(),
      files: result.summary.changes,
    };
  });

  ipcMain.handle(CHANNELS.gitLog, async (_event, repoPath: string, maxCount = 50): Promise<GitCommitDTO[]> => {
    const git = getGit(repoPath);
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) return [];
    const log = await git.log({ maxCount });
    return log.all.map((c) => ({
      hash: c.hash,
      message: c.message,
      author: c.author_name,
      date: new Date(c.date).getTime(),
      files: 0,
    }));
  });
}
