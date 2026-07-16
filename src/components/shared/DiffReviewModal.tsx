import { useMemo } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Check, X, FileDiff } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useDiffReviewStore } from '@/store/useDiffReviewStore';
import './DiffReviewModal.css';

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  css: 'css', scss: 'scss', json: 'json',
  md: 'markdown', mdx: 'markdown', html: 'html',
  yml: 'yaml', yaml: 'yaml', py: 'python', go: 'go', rs: 'rust', sh: 'shell',
};

function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_BY_EXT[ext] ?? 'plaintext';
}

/** Approximate line add/remove counts via a line-level LCS (capped for size). */
function lineDiffStats(original: string, proposed: string): { additions: number; deletions: number } {
  const a = original.length ? original.split('\n') : [];
  const b = proposed.length ? proposed.split('\n') : [];
  if (a.length > 4000 || b.length > 4000) {
    return { additions: Math.max(0, b.length - a.length), deletions: Math.max(0, a.length - b.length) };
  }
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const common = dp[0][0];
  return { additions: n - common, deletions: m - common };
}

export function DiffReviewModal() {
  const pending = useDiffReviewStore((s) => s.pending);
  const resolve = useDiffReviewStore((s) => s.resolve);

  const stats = useMemo(
    () => (pending ? lineDiffStats(pending.original, pending.proposed) : { additions: 0, deletions: 0 }),
    [pending],
  );

  if (!pending) return null;

  const isNewFile = pending.original.length === 0;

  return (
    <Modal isOpen onClose={() => resolve('rejected')} title="Review edit" size="xl" rawBody>
      <div className="diff-review">
        <header className="diff-review__header">
          <div className="diff-review__title">
            <FileDiff size={16} className="diff-review__title-icon" />
            <span className="diff-review__path" title={pending.path}>
              {pending.path}
            </span>
            {isNewFile && <span className="diff-review__badge">new file</span>}
          </div>
          <div className="diff-review__stats">
            <span className="diff-review__stat diff-review__stat--add">+{stats.additions}</span>
            <span className="diff-review__stat diff-review__stat--del">−{stats.deletions}</span>
          </div>
        </header>

        <div className="diff-review__editor">
          <DiffEditor
            theme="vs-dark"
            language={languageForPath(pending.path)}
            original={pending.original}
            modified={pending.proposed}
            options={{
              readOnly: true,
              renderSideBySide: true,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              minimap: { enabled: false },
              fontSize: 13,
              renderOverviewRuler: false,
            }}
          />
        </div>

        <footer className="diff-review__footer">
          <p className="diff-review__hint">
            The agent proposed this edit. Nothing is written until you accept.
          </p>
          <div className="diff-review__actions">
            <Button variant="ghost" icon={<X size={14} />} onClick={() => resolve('rejected')}>
              Reject
            </Button>
            <Button variant="primary" icon={<Check size={14} />} onClick={() => resolve('accepted')}>
              Accept &amp; apply
            </Button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}
