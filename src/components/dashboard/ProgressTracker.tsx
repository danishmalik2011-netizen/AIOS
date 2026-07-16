import { useMemo } from 'react';
import { GitBranch } from 'lucide-react';
import type { AgentStatus } from '@/core/types';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { Progress } from '@/components/shared/Progress';
import './ProgressTracker.css';

/* ------------------------------------------------------------------ */
/*  Status maps                                                        */
/* ------------------------------------------------------------------ */

type ProgressVariant = 'default' | 'accent' | 'success';

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Queued',
  running: 'Running',
  paused: 'Paused',
  error: 'Failed',
  completed: 'Done',
};

const STATUS_BADGE: Record<AgentStatus, string> = {
  idle: 'glass-badge',
  running: 'glass-badge-accent',
  paused: 'glass-badge-warning',
  error: 'glass-badge-error',
  completed: 'glass-badge-success',
};

const STATUS_VARIANT: Record<AgentStatus, ProgressVariant> = {
  idle: 'default',
  running: 'accent',
  paused: 'default',
  error: 'default',
  completed: 'success',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ProgressTracker() {
  const nodes = useWorkflowStore((s) => s.nodes);

  const overall = useMemo(() => {
    if (nodes.length === 0) return 0;
    const sum = nodes.reduce((acc, n) => acc + (n.data.progress ?? 0), 0);
    return Math.round(sum / nodes.length);
  }, [nodes]);

  const dashOffset =
    RING_CIRCUMFERENCE - (overall / 100) * RING_CIRCUMFERENCE;

  return (
    <section
      className="progress-tracker glass-panel"
      aria-label="Pipeline progress"
    >
      <header className="progress-tracker__header">
        <div className="progress-tracker__title-group">
          <GitBranch size={16} className="progress-tracker__title-icon" />
          <h2 className="progress-tracker__title">Pipeline Progress</h2>
        </div>

        <div
          className="progress-tracker__ring"
          role="img"
          aria-label={`Overall completion ${overall} percent`}
        >
          <svg viewBox="0 0 64 64" className="progress-tracker__ring-svg">
            <defs>
              <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--accent-primary)" />
                <stop offset="100%" stopColor="var(--accent-secondary)" />
              </linearGradient>
            </defs>
            <circle
              className="progress-tracker__ring-track"
              cx="32"
              cy="32"
              r={RING_RADIUS}
            />
            <circle
              className="progress-tracker__ring-fill"
              cx="32"
              cy="32"
              r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <span className="progress-tracker__ring-label">{overall}%</span>
        </div>
      </header>

      <ul className="progress-tracker__list" role="list">
        {nodes.map((node) => {
          const status = node.data.status;
          const progress = Math.round(node.data.progress ?? 0);
          return (
            <li key={node.id} className="progress-tracker__stage">
              <div className="progress-tracker__stage-head">
                <span className="progress-tracker__stage-label">
                  {node.data.label}
                </span>
                <span
                  className={`glass-badge ${STATUS_BADGE[status]} progress-tracker__stage-badge`}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>

              <div className="progress-tracker__stage-bar">
                <Progress
                  value={progress}
                  variant={STATUS_VARIANT[status]}
                  size="sm"
                  animated={status === 'running'}
                />
                <span className="progress-tracker__stage-pct">{progress}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
