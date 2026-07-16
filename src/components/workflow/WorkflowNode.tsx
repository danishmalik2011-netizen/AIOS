import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ClipboardList,
  Hammer,
  ScanEye,
  FlaskConical,
  Rocket,
  Boxes,
  GitBranch,
  GitFork,
  type LucideIcon,
} from 'lucide-react';
import { Progress } from '@/components/shared/Progress';
import { Badge } from '@/components/shared/Badge';
import type { AgentStatus, WorkflowNodeData, WorkflowNodeType } from '@/core/types';
import './WorkflowNode.css';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error';
type ProgressVariant = 'default' | 'accent' | 'success';

interface RoleMeta {
  icon: LucideIcon;
  accent: string;
}

const ROLE_META: Record<WorkflowNodeType, RoleMeta> = {
  planner: { icon: ClipboardList, accent: 'var(--accent-secondary)' },
  builder: { icon: Hammer, accent: 'var(--accent-primary)' },
  reviewer: { icon: ScanEye, accent: 'var(--accent-tertiary)' },
  tester: { icon: FlaskConical, accent: 'var(--accent-amber)' },
  deployer: { icon: Rocket, accent: 'var(--accent-warm)' },
  condition: { icon: GitBranch, accent: 'var(--accent-secondary)' },
  parallel: { icon: GitFork, accent: 'var(--accent-tertiary)' },
  custom: { icon: Boxes, accent: 'var(--accent-primary)' },
};

const STATUS_BADGE: Record<AgentStatus, BadgeVariant> = {
  idle: 'default',
  running: 'accent',
  paused: 'warning',
  error: 'error',
  completed: 'success',
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  error: 'Error',
  completed: 'Done',
};

const PROGRESS_VARIANT: Record<AgentStatus, ProgressVariant> = {
  idle: 'default',
  running: 'accent',
  paused: 'default',
  error: 'default',
  completed: 'success',
};

function WorkflowNodeComponent(props: NodeProps) {
  const data = props.data as unknown as WorkflowNodeData;
  const meta = ROLE_META[data.type] ?? ROLE_META.custom;
  const Icon = meta.icon;

  const classes = [
    'workflow-node',
    `workflow-node--${data.status}`,
    props.selected ? 'workflow-node--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={{ '--node-accent': meta.accent } as CSSProperties}>
      <Handle
        type="target"
        position={Position.Top}
        className="workflow-node__handle workflow-node__handle--target"
      />

      <div className="workflow-node__header">
        <span className="workflow-node__icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="workflow-node__label" title={data.label}>
          {data.label}
        </span>
        <Badge variant={STATUS_BADGE[data.status]} dot className="workflow-node__badge">
          {STATUS_LABEL[data.status]}
        </Badge>
      </div>

      <p className="workflow-node__description" title={data.description}>
        {data.description}
      </p>

      <div className="workflow-node__footer">
        <Progress
          value={data.progress}
          variant={PROGRESS_VARIANT[data.status]}
          size="sm"
          animated={data.status === 'running'}
        />
        <span className="workflow-node__progress-value">{Math.round(data.progress)}%</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="workflow-node__handle workflow-node__handle--source"
      />
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
