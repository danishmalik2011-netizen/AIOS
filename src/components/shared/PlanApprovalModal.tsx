/* ================================================================
   PlanApprovalModal — the "explore → propose → approve" gate for the
   Fleet Director. When the user asks the Director to decompose a goal,
   we show the proposed task graph here and DO NOT touch the workspace
   until they approve. This is the GUI counterpart of the CLI's
   `/plan` + `/run` flow, and it brings the orphaned useOrchestratorStore
   into play.
   ================================================================ */

import { useMemo } from 'react';
import { Check, Pencil, X, GitBranch } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import type { OrchestrationPlan, SubTask } from '@/core/types';

interface PlanApprovalModalProps {
  plan: OrchestrationPlan | null;
  goal: string;
  onApprove: () => void;
  onEdit: (newGoal: string) => void;
  onCancel: () => void;
}

const ROLE_GLYPH: Record<string, string> = {
  planner: '◈',
  builder: '⚒',
  reviewer: '✶',
  tester: '✓',
  deployer: '⤴',
  custom: '•',
};

function depthOf(task: SubTask, all: SubTask[]): number {
  let d = 0;
  let cur: SubTask | undefined = task;
  const seen = new Set<string>();
  while (cur && cur.dependsOn.length > 0 && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parent = all.find((t) => cur!.dependsOn.includes(t.id));
    if (!parent) break;
    d += 1;
    cur = parent;
  }
  return d;
}

export function PlanApprovalModal({
  plan,
  goal,
  onApprove,
  onEdit,
  onCancel,
}: PlanApprovalModalProps) {
  // Indent each subtask by its dependency depth so the DAG reads as a tree.
  const ordered = useMemo(() => {
    if (!plan) return [];
    return [...plan.subtasks].sort(
      (a, b) => depthOf(a, plan.subtasks) - depthOf(b, plan.subtasks),
    );
  }, [plan]);

  if (!plan) return null;

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Director's proposed plan"
      size="lg"
    >
      <div className="plan-approval">
        <div className="plan-approval__goal">
          <GitBranch size={15} />
          <span className="plan-approval__goal-label">Goal</span>
          <span className="plan-approval__goal-text">{goal || plan.goal}</span>
        </div>

        <p className="plan-approval__hint">
          The Fleet Director decomposed this into {plan.subtasks.length} step
          {plan.subtasks.length === 1 ? '' : 's'}
          {plan.llmAssisted ? ' (LLM-assisted)' : ' (heuristic)'}. Approve to load
          it onto the canvas, or edit the goal to re-decompose.
        </p>

        <ul className="plan-approval__tree">
          {ordered.map((t) => {
            const indent = depthOf(t, plan.subtasks);
            return (
              <li
                key={t.id}
                className="plan-approval__node"
                style={{ marginLeft: `${indent * 22}px` }}
              >
                <span className={`plan-approval__role plan-approval__role--${t.role}`}>
                  {ROLE_GLYPH[t.role] ?? '•'}
                </span>
                <div className="plan-approval__node-body">
                  <span className="plan-approval__node-label">{t.label}</span>
                  {t.dependsOn.length > 0 && (
                    <span className="plan-approval__node-deps">
                      depends on {t.dependsOn.length} prior step
                      {t.dependsOn.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="plan-approval__actions">
          <Button variant="ghost" size="sm" icon={<X size={15} />} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil size={15} />}
            onClick={() => onEdit(goal || plan.goal)}
          >
            Edit goal
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Check size={15} />}
            onClick={onApprove}
          >
            Approve &amp; load
          </Button>
        </div>
      </div>
    </Modal>
  );
}
