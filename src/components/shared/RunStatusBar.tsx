import { useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  Activity,
  CheckCircle2,
  CircleSlash,
} from 'lucide-react';
import { useOrchestratorStore } from '@/store/useOrchestratorStore';
import { Badge } from './Badge';
import { IconButton } from './IconButton';
import './RunStatusBar.css';

/**
 * Slim status strip for the Fleet Director run. Reflects live progress from
 * `useOrchestratorStore` and exposes pause / resume / stop controls.
 */
export function RunStatusBar() {
  const plan = useOrchestratorStore((s) => s.plan);
  const isRunning = useOrchestratorStore((s) => s.isRunning);
  const setRunning = useOrchestratorStore((s) => s.setRunning);
  const abort = useOrchestratorStore((s) => s.abort);

  const { total, completed, errored, pct } = useMemo(() => {
    const subtasks = plan?.subtasks ?? [];
    const done = subtasks.filter((t) => t.status === 'completed').length;
    const err = subtasks.filter((t) => t.status === 'error').length;
    const p = subtasks.length === 0 ? 0 : Math.round((done / subtasks.length) * 100);
    return { total: subtasks.length, completed: done, errored: err, pct: p };
  }, [plan]);

  if (!plan) return null;

  const isPaused = !isRunning && total > 0 && completed < total;

  return (
    <div className="run-status-bar glass-panel">
      <div className="run-status-bar__lead">
        <Activity size={16} className="run-status-bar__glyph" />
        <div className="run-status-bar__meta">
          <span className="run-status-bar__goal" title={plan.goal}>
            {plan.goal}
          </span>
          <span className="run-status-bar__counts">
            <CheckCircle2 size={12} /> {completed}/{total}
            {errored > 0 && (
              <span className="run-status-bar__err">
                <CircleSlash size={12} /> {errored}
              </span>
            )}
            {plan.llmAssisted && <span className="run-status-bar__llm">LLM</span>}
          </span>
        </div>
      </div>

      <div className="run-status-bar__track">
        <div
          className="run-status-bar__fill"
          style={{ width: `${pct}%` }}
          data-state={isPaused ? 'paused' : isRunning ? 'running' : 'idle'}
        />
      </div>

      <div className="run-status-bar__actions">
        {isRunning ? (
          <Badge variant="accent" dot>
            Running
          </Badge>
        ) : isPaused ? (
          <Badge variant="warning" dot>
            Paused
          </Badge>
        ) : (
          <Badge variant="default" dot>
            Idle
          </Badge>
        )}

        {isRunning ? (
          <IconButton
            icon={<Pause size={15} />}
            tooltip="Pause run"
            variant="ghost"
            size="sm"
            onClick={() => setRunning(false)}
          />
        ) : (
          <IconButton
            icon={<Play size={15} />}
            tooltip="Resume run"
            variant="ghost"
            size="sm"
            disabled={completed >= total}
            onClick={() => setRunning(true)}
          />
        )}

        <IconButton
          icon={<Square size={15} />}
          tooltip="Stop run"
          variant="ghost"
          size="sm"
          onClick={abort}
        />
      </div>
    </div>
  );
}
