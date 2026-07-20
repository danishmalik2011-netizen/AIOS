import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  PauseCircle,
  Link2,
} from 'lucide-react';
import type { AgentRole, AgentStatus, SubTask } from '@/core/types';
import { Badge } from './Badge';
import './PlanStepCard.css';

/** Maps an agent role to a human label + badge variant for the card header. */
const ROLE_META: Record<AgentRole, { label: string; variant: 'default' | 'accent' | 'success' | 'warning' | 'error' }> = {
  planner: { label: 'Planner', variant: 'accent' },
  builder: { label: 'Builder', variant: 'default' },
  reviewer: { label: 'Reviewer', variant: 'success' },
  tester: { label: 'Tester', variant: 'warning' },
  deployer: { label: 'Deployer', variant: 'error' },
  custom: { label: 'Custom', variant: 'default' },
};

/** Maps a subtask status to an icon + badge variant for the status pill. */
const STATUS_META: Record<
  AgentStatus,
  { label: string; variant: 'default' | 'accent' | 'success' | 'warning' | 'error'; Icon: typeof Circle }
> = {
  idle: { label: 'Idle', variant: 'default', Icon: Circle },
  running: { label: 'Running', variant: 'accent', Icon: Loader2 },
  paused: { label: 'Paused', variant: 'warning', Icon: PauseCircle },
  error: { label: 'Error', variant: 'error', Icon: AlertTriangle },
  completed: { label: 'Done', variant: 'success', Icon: CheckCircle2 },
};

interface PlanStepCardProps {
  subtask: SubTask;
  index: number;
  onSelect?: (id: string) => void;
  selected?: boolean;
}

export function PlanStepCard({ subtask, index, onSelect, selected }: PlanStepCardProps) {
  const role = ROLE_META[subtask.role] ?? ROLE_META.custom;
  const status = STATUS_META[subtask.status] ?? STATUS_META.idle;
  const StatusIcon = status.Icon;
  const isActive = subtask.status === 'running';

  return (
    <button
      type="button"
      className={[
        'plan-step-card glass-card',
        isActive ? 'plan-step-card--active' : '',
        selected ? 'plan-step-card--selected' : '',
        `plan-step-card--${subtask.status}`,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect?.(subtask.id)}
    >
      <div className="plan-step-card__head">
        <span className="plan-step-card__index">{index + 1}</span>
        <Badge variant={role.variant}>{role.label}</Badge>
        <Badge variant={status.variant} dot>
          <span className="plan-step-card__status-label">
            <StatusIcon size={12} className={isActive ? 'plan-step-card__spin' : ''} />
            {status.label}
          </span>
        </Badge>
      </div>

      <div className="plan-step-card__body">
        <h4 className="plan-step-card__label">{subtask.label}</h4>
        <p className="plan-step-card__intent">{subtask.intent}</p>
      </div>

      {subtask.dependsOn.length > 0 && (
        <div className="plan-step-card__deps">
          <Link2 size={12} className="plan-step-card__dep-glyph" />
          <span>Depends on:</span>
          <span className="plan-step-card__dep-list">
            {subtask.dependsOn.map((d) => (
              <code key={d} className="plan-step-card__dep-chip">
                {d}
              </code>
            ))}
          </span>
        </div>
      )}

      {subtask.error && <p className="plan-step-card__error">{subtask.error}</p>}
    </button>
  );
}
