import { useEffect, useMemo, useState } from 'react';
import {
  GitBranch,
  GitCommit as GitCommitIcon,
  ArrowUp,
  ArrowDown,
  Plus,
  Minus,
  Sparkles,
  Check,
  FileQuestion,
  FilePlus,
  History,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { IconButton } from '@/components/shared/IconButton';
import { useGitStore } from '@/store/useGitStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { toast } from '@/store/useNotificationStore';
import { complete } from '@/services/providers/registry';
import { getApiKey } from '@/services/providers/keyVault';
import type { GitFileChange, ProviderType } from '@/core/types';
import './GitView.css';

type ChangeStatus = GitFileChange['status'];

const STATUS_META: Record<ChangeStatus, { letter: string; label: string; className: string }> = {
  added: { letter: 'A', label: 'Added', className: 'is-added' },
  modified: { letter: 'M', label: 'Modified', className: 'is-modified' },
  deleted: { letter: 'D', label: 'Deleted', className: 'is-deleted' },
  renamed: { letter: 'R', label: 'Renamed', className: 'is-renamed' },
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}

function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf('/');
  if (idx === -1) return { dir: '', name: path };
  return { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
}

/** Synthesize a plausible Conventional Commits message from staged file paths. */
function generateCommitMessage(files: GitFileChange[]): string {
  if (files.length === 0) return 'chore: update project files';

  const paths = files.map((f) => f.path.toLowerCase());
  const hasNew = files.some((f) => f.status === 'added');
  const hasDeleted = files.some((f) => f.status === 'deleted');
  const onlyTests = paths.every((p) => /(\.test\.|\.spec\.|__tests__)/.test(p));
  const onlyStyles = paths.every((p) => /\.(css|scss|sass|less)$/.test(p));
  const onlyDocs = paths.every((p) => /\.(md|mdx|txt)$/.test(p) || p.includes('docs/'));

  // Derive a scope from the deepest shared directory segment.
  const segments = files.map((f) => {
    const parts = f.path.split('/').filter(Boolean);
    const fileIdx = parts.length - 1;
    return parts.slice(0, fileIdx).filter((s) => s !== 'src');
  });
  let scope = '';
  if (segments.length > 0) {
    const candidate = segments[0][segments[0].length - 1];
    if (candidate && segments.every((s) => s[s.length - 1] === candidate)) {
      scope = candidate.replace(/[^a-z0-9-]/gi, '').toLowerCase();
    }
  }

  let type = 'chore';
  if (onlyDocs) type = 'docs';
  else if (onlyTests) type = 'test';
  else if (onlyStyles) type = 'style';
  else if (hasNew) type = 'feat';
  else if (hasDeleted) type = 'refactor';
  else type = 'fix';

  const primary = splitPath(files[0].path).name.replace(/\.[a-z0-9]+$/i, '');
  let subject: string;
  if (files.length === 1) {
    const verb = type === 'feat' ? 'add' : type === 'refactor' ? 'remove' : 'update';
    subject = `${verb} ${primary}`;
  } else {
    const verb = type === 'feat' ? 'add' : 'update';
    subject = `${verb} ${primary} and ${files.length - 1} related file${files.length - 1 > 1 ? 's' : ''}`;
  }

  const header = scope ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`;
  const body = files.map((f) => `- ${STATUS_META[f.status].label} ${f.path}`).join('\n');
  return `${header}\n\n${body}`;
}

interface ChangeRowProps {
  change: GitFileChange;
  action: 'stage' | 'unstage';
  onAction: (path: string) => void;
}

function ChangeRow({ change, action, onAction }: ChangeRowProps) {
  const meta = STATUS_META[change.status];
  const { dir, name } = splitPath(change.path);
  return (
    <li className="git-change-row">
      <span className={`git-change-row__badge ${meta.className}`} title={meta.label}>
        {meta.letter}
      </span>
      <span className="git-change-row__path" title={change.path}>
        {dir && <span className="git-change-row__dir">{dir}</span>}
        <span className="git-change-row__name">{name}</span>
      </span>
      <span className="git-change-row__stats">
        {change.additions != null && change.additions > 0 && (
          <span className="git-change-row__add">+{change.additions}</span>
        )}
        {change.deletions != null && change.deletions > 0 && (
          <span className="git-change-row__del">-{change.deletions}</span>
        )}
      </span>
      <IconButton
        className="git-change-row__action"
        icon={action === 'stage' ? <Plus size={14} /> : <Minus size={14} />}
        tooltip={action === 'stage' ? 'Stage file' : 'Unstage file'}
        variant="ghost"
        size="sm"
        onClick={() => onAction(change.path)}
      />
    </li>
  );
}

export function GitView() {
  const status = useGitStore((s) => s.status);
  const commits = useGitStore((s) => s.commits);
  const commitMessage = useGitStore((s) => s.commitMessage);
  const isCommitting = useGitStore((s) => s.isCommitting);
  const isLoading = useGitStore((s) => s.isLoading);
  const isRealRepo = useGitStore((s) => s.isRealRepo);
  const setCommitMessage = useGitStore((s) => s.setCommitMessage);
  const refresh = useGitStore((s) => s.refresh);
  const stageFile = useGitStore((s) => s.stageFile);
  const unstageFile = useGitStore((s) => s.unstageFile);
  const stageAll = useGitStore((s) => s.stageAll);
  const unstageAll = useGitStore((s) => s.unstageAll);
  const commit = useGitStore((s) => s.commit);
  const projectRoot = useProjectStore((s) => s.projectRoot);

  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { staged, unstaged, untracked, branch, ahead, behind } = status;

  const untrackedChanges: GitFileChange[] = useMemo(
    () => untracked.map((path) => ({ path, status: 'added' as const })),
    [untracked],
  );

  const canCommit = commitMessage.trim().length > 0 && staged.length > 0;

  const handleGenerate = async () => {
    if (staged.length === 0) {
      toast.warning('Nothing staged', 'Stage some changes before generating a message.');
      return;
    }

    setIsGenerating(true);
    try {
      const providers = useSettingsStore.getState().providers;
      const fb =
        providers.find((p) => getApiKey(p.id)) ??
        providers.find((p) => p.isConnected) ??
        providers[0];
      const model =
        fb?.models?.[0] ?? (fb?.id === 'ollama' ? 'llama3' : 'gpt-4o-mini');

      const diffSummary = staged
        .map((f) => `${f.status}: ${f.path}${f.additions ? ` (+${f.additions}/-${f.deletions ?? 0})` : ''}`)
        .join('\n');
      const result = await complete(
        {
          model,
          system: 'You write a single Conventional Commits message (type(scope): subject, then a bulleted body) for a git diff. Reply with only the commit message.',
          messages: [{ role: 'user', content: `Staged changes:\n${diffSummary}` }],
          maxTokens: 200,
        },
        { preferred: fb?.id as ProviderType | undefined },
      );
      setCommitMessage(result.content.trim());
      toast.success('Commit message drafted', 'Review the AI-generated message before committing.');
    } catch (err) {
      toast.error('Draft failed', err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCommit = async () => {
    if (!canCommit) return;
    const count = staged.length;
    const subject = commitMessage.split('\n')[0];
    await commit();
    toast.success('Changes committed', `${count} file${count > 1 ? 's' : ''} · ${subject}`);
  };

  return (
    <div className="git-view animate-fade-in">
      {/* LEFT — Changes panel */}
      <section className="git-view__changes glass-panel">
        <header className="git-view__header">
          <div className="git-view__branch">
            <GitBranch size={16} className="git-view__branch-icon" />
            <span className="git-view__branch-name">{branch}</span>
            {!isRealRepo && projectRoot && (
              <span className="git-pill git-pill--muted" title="This folder has no .git repository">
                No repo
              </span>
            )}
            {!projectRoot && window.aios && (
              <span className="git-pill git-pill--muted" title="Open a project folder from Files to see live git status">
                Demo data
              </span>
            )}
          </div>
          <div className="git-view__pills">
            {ahead > 0 && (
              <span className="git-pill git-pill--ahead" title={`${ahead} ahead of remote`}>
                <ArrowUp size={11} />
                {ahead}
              </span>
            )}
            {behind > 0 && (
              <span className="git-pill git-pill--behind" title={`${behind} behind remote`}>
                <ArrowDown size={11} />
                {behind}
              </span>
            )}
            {ahead === 0 && behind === 0 && (
              <span className="git-pill git-pill--synced">
                <Check size={11} />
                Up to date
              </span>
            )}
            <IconButton
              icon={<RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />}
              tooltip="Refresh status"
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
            />
          </div>
        </header>

        <div className="git-view__scroll">
          {/* Staged */}
          <div className="git-section">
            <div className="git-section__head">
              <span className="git-section__title">
                Staged Changes
                <span className="git-section__count">{staged.length}</span>
              </span>
              {staged.length > 0 && (
                <button className="git-section__action" onClick={unstageAll} type="button">
                  Unstage all
                </button>
              )}
            </div>
            {staged.length > 0 ? (
              <ul className="git-list">
                {staged.map((change) => (
                  <ChangeRow
                    key={change.path}
                    change={change}
                    action="unstage"
                    onAction={unstageFile}
                  />
                ))}
              </ul>
            ) : (
              <p className="git-section__empty">No staged changes.</p>
            )}
          </div>

          {/* Unstaged */}
          <div className="git-section">
            <div className="git-section__head">
              <span className="git-section__title">
                Changes
                <span className="git-section__count">{unstaged.length}</span>
              </span>
              {unstaged.length > 0 && (
                <button className="git-section__action" onClick={stageAll} type="button">
                  Stage all
                </button>
              )}
            </div>
            {unstaged.length > 0 ? (
              <ul className="git-list">
                {unstaged.map((change) => (
                  <ChangeRow
                    key={change.path}
                    change={change}
                    action="stage"
                    onAction={stageFile}
                  />
                ))}
              </ul>
            ) : (
              <p className="git-section__empty">No unstaged changes.</p>
            )}
          </div>

          {/* Untracked */}
          {untrackedChanges.length > 0 && (
            <div className="git-section">
              <div className="git-section__head">
                <span className="git-section__title">
                  <FileQuestion size={13} className="git-section__title-icon" />
                  Untracked
                  <span className="git-section__count">{untrackedChanges.length}</span>
                </span>
              </div>
              <ul className="git-list">
                {untrackedChanges.map((change) => (
                  <ChangeRow
                    key={change.path}
                    change={change}
                    action="stage"
                    onAction={stageFile}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Commit box */}
        <footer className="git-commit">
          <textarea
            className="git-commit__input glass-input"
            placeholder="Commit message (summary)…"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            rows={3}
            spellCheck={false}
          />
          <div className="git-commit__actions">
            <Button
              variant="secondary"
              size="sm"
              icon={<Sparkles size={14} />}
              loading={isGenerating}
              onClick={handleGenerate}
            >
              Generate with AI
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Check size={14} />}
              loading={isCommitting}
              disabled={!canCommit}
              onClick={handleCommit}
            >
              Commit{staged.length > 0 ? ` (${staged.length})` : ''}
            </Button>
          </div>
        </footer>
      </section>

      {/* RIGHT — Commit history timeline */}
      <section className="git-view__history glass-panel">
        <header className="git-view__header">
          <div className="git-view__branch">
            <History size={16} className="git-view__branch-icon" />
            <span className="git-view__branch-name">Commit History</span>
          </div>
          <span className="git-pill git-pill--muted">{commits.length}</span>
        </header>

        <div className="git-view__scroll">
          {commits.length > 0 ? (
            <ol className="git-timeline stagger-children">
              {commits.map((c, i) => (
                <li className="git-timeline__item" key={c.hash}>
                  <div className="git-timeline__marker">
                    <span
                      className={`git-timeline__dot${i === 0 ? ' is-latest' : ''}`}
                      aria-hidden="true"
                    />
                    {i < commits.length - 1 && (
                      <span className="git-timeline__line" aria-hidden="true" />
                    )}
                  </div>
                  <div className="git-timeline__body glass-card">
                    <p className="git-timeline__message">{c.message.split('\n')[0]}</p>
                    <div className="git-timeline__meta">
                      <span className="git-timeline__hash">
                        <GitCommitIcon size={11} />
                        {c.hash.slice(0, 7)}
                      </span>
                      <span className="git-timeline__author">{c.author}</span>
                      <span className="git-timeline__dot-sep" aria-hidden="true">
                        ·
                      </span>
                      <span className="git-timeline__time">{relativeTime(c.date)}</span>
                      <span className="git-timeline__files">
                        <FilePlus size={11} />
                        {c.files} file{c.files === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="git-empty">
              <History size={28} className="git-empty__icon" />
              <p className="git-empty__title">No commits yet</p>
              <p className="git-empty__hint">Stage changes and create your first commit.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
