import { useMemo } from 'react';
import { GitBranch, ListTree, Sparkles } from 'lucide-react';
import { useOrchestratorStore } from '@/store/useOrchestratorStore';
import { Badge } from './Badge';
import { PlanStepCard } from './PlanStepCard';
import { RunStatusBar } from './RunStatusBar';
import './PlanView.css';

interface PlanViewProps {
  /** Called when a step card is clicked (e.g. to focus the workflow node). */
  onSelectStep?: (id: string) => void;
  selectedId?: string | null;
  className?: string;
}

/**
 * Composed plan surface: the goal header, a live run-status strip, and the
 * list of subtasks rendered as PlanStepCards. Reads the active plan from the
 * orchestrator store so it stays in sync with the running fleet.
 */
export function PlanView({ onSelectStep, selectedId, className = '' }: PlanViewProps) {
  const plan = useOrchestratorStore((s) => s.plan);

  const ordered = useMemo(
    () => (plan ? [...plan.subtasks] : []),
    [plan],
  );

  if (!plan) {
    return (
      <div className={`plan-view plan-view--empty glass-panel ${className}`}>
        <Sparkles size={18} className="plan-view__empty-glyph" />
        <p className="plan-view__empty-text">
          No plan yet. Describe a goal and hit <strong>Decompose</strong> to let
          the Director break it into agent-assigned steps.
        </p>
      </div>
    );
  }

  return (
    <section className={`plan-view glass-panel ${className}`}>
      <header className="plan-view__header">
        <div className="plan-view__heading">
          <GitBranch size={16} className="plan-view__glyph" />
          <div>
            <span className="plan-view__eyebrow">Fleet Director Plan</span>
            <h2 className="plan-view__title" title={plan.goal}>
              {plan.goal}
            </h2>
          </div>
        </div>
        <div className="plan-view__badges">
          <Badge variant="default" dot>
            {ordered.length} steps
          </Badge>
          {plan.llmAssisted && <Badge variant="accent">LLM-assisted</Badge>}
        </div>
      </header>

      <RunStatusBar />

      <div className="plan-view__list-head">
        <ListTree size={14} />
        <span>Steps</span>
      </div>

      <div className="plan-view__list">
        {ordered.map((subtask, i) => (
          <PlanStepCard
            key={subtask.id}
            subtask={subtask}
            index={i}
            selected={selectedId === subtask.id}
            onSelect={onSelectStep}
          />
        ))}
      </div>
    </section>
  );
}
