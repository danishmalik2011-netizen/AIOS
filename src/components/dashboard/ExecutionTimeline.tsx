import { useMemo, type CSSProperties } from 'react';
import { GanttChartSquare } from 'lucide-react';
import type { AgentRole } from '@/core/types';
import { useChatStore } from '@/store/useChatStore';
import { useAgentStore } from '@/store/useAgentStore';
import './ExecutionTimeline.css';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const WINDOW_MINUTES = 60;

const ROLE_COLOR: Record<AgentRole, string> = {
  planner: '#7c5cff',
  builder: '#5e9dff',
  reviewer: '#00d4aa',
  tester: '#ffb347',
  deployer: '#ff6b6b',
  custom: '#6c6888',
};

const ROLE_LABEL: Record<AgentRole, string> = {
  planner: 'Planner',
  builder: 'Builder',
  reviewer: 'Reviewer',
  tester: 'Tester',
  deployer: 'Deployer',
  custom: 'Custom',
};

interface Execution {
  id: string;
  agent: string;
  role: AgentRole;
  task: string;
  /** Minutes ago the execution started (0 = now). */
  startMinAgo: number;
  /** Duration in minutes. */
  durationMin: number;
  running?: boolean;
}

const AXIS_TICKS = [60, 45, 30, 15, 0];

function formatDuration(min: number): string {
  return min >= 1 ? `${min}m` : '<1m';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ExecutionTimeline() {
  const sessions = useChatStore((s) => s.sessions);
  const agents = useAgentStore((s) => s.agents);

  /* Derive execution bars from real conversation activity within the last
     hour. Each active conversation becomes a bar spanning its first→last
     message inside the window; the agent + role come from its active agent. */
  const executions = useMemo<Execution[]>(() => {
    const now = Date.now();
    const windowMs = WINDOW_MINUTES * 60000;
    const list: Execution[] = [];

    for (const session of sessions) {
      if (session.isArchived) continue;
      if (session.messages.length === 0) continue;

      const inWindow = session.messages.filter(
        (m) =>
          (m.role === 'assistant' || m.role === 'user') &&
          now - m.timestamp <= windowMs,
      );
      if (inWindow.length === 0) continue;

      const first = inWindow[0].timestamp;
      const last = inWindow[inWindow.length - 1].timestamp;
      const startMinAgo = Math.min((now - first) / 60000, WINDOW_MINUTES);
      const durationMin = Math.max((last - first) / 60000, 0.5);

      const agent = agents.find((a) => a.id === session.activeAgentId);
      const lastMsg = session.messages[session.messages.length - 1];

      list.push({
        id: session.id,
        agent: agent?.name || session.title || 'Conversation',
        role: agent?.role ?? 'custom',
        task: session.title || 'Untitled conversation',
        startMinAgo,
        durationMin,
        running: lastMsg?.status === 'streaming',
      });
    }

    return list.sort((a, b) => b.startMinAgo - a.startMinAgo);
  }, [sessions, agents]);

  const rows = useMemo(
    () =>
      executions.map((exec) => {
        const start = ((WINDOW_MINUTES - exec.startMinAgo) / WINDOW_MINUTES) * 100;
        const rawWidth = (exec.durationMin / WINDOW_MINUTES) * 100;
        const width = Math.min(rawWidth, 100 - start);
        return { exec, left: start, width };
      }),
    [executions],
  );

  const legendRoles = useMemo(() => {
    const seen = new Set<AgentRole>();
    const order: AgentRole[] = [];
    for (const e of executions) {
      if (!seen.has(e.role)) {
        seen.add(e.role);
        order.push(e.role);
      }
    }
    return order;
  }, [executions]);

  return (
    <section
      className="execution-timeline glass-panel"
      aria-label="Execution timeline"
    >
      <header className="execution-timeline__header">
        <div className="execution-timeline__title-group">
          <GanttChartSquare size={16} className="execution-timeline__title-icon" />
          <h2 className="execution-timeline__title">Execution Timeline</h2>
        </div>

        <ul className="execution-timeline__legend" role="list">
          {legendRoles.map((role) => (
            <li key={role} className="execution-timeline__legend-item">
              <span
                className="execution-timeline__legend-swatch"
                style={{ background: ROLE_COLOR[role] }}
                aria-hidden="true"
              />
              {ROLE_LABEL[role]}
            </li>
          ))}
        </ul>
      </header>

      <div className="execution-timeline__scroll">
        {executions.length === 0 ? (
          <div className="execution-timeline__empty">
            <GanttChartSquare size={28} className="execution-timeline__empty-icon" />
            <p className="execution-timeline__empty-title">No recent executions</p>
            <p className="execution-timeline__empty-desc">
              Agent activity from the last hour will appear here as you chat.
            </p>
          </div>
        ) : (
          <div className="execution-timeline__grid">
          {/* Axis */}
          <div className="execution-timeline__axis" aria-hidden="true">
            <span className="execution-timeline__axis-spacer" />
            <div className="execution-timeline__axis-track">
              {AXIS_TICKS.map((t) => (
                <span key={t} className="execution-timeline__tick">
                  {t === 0 ? 'now' : `${t}m`}
                </span>
              ))}
            </div>
          </div>

          {/* Rows */}
          <ul className="execution-timeline__rows" role="list">
            {rows.map(({ exec, left, width }) => (
              <li key={exec.id} className="execution-timeline__row">
                <span className="execution-timeline__row-label" title={exec.agent}>
                  <span
                    className="execution-timeline__row-dot"
                    style={{ background: ROLE_COLOR[exec.role] }}
                    aria-hidden="true"
                  />
                  {exec.agent}
                </span>

                <div className="execution-timeline__track">
                  <div
                    className={`execution-timeline__bar ${exec.running ? 'is-running' : ''}`}
                    style={
                      {
                        left: `${left}%`,
                        width: `${width}%`,
                        '--bar-color': ROLE_COLOR[exec.role],
                      } as CSSProperties
                    }
                    title={`${exec.agent} · ${exec.task} · ${formatDuration(exec.durationMin)}`}
                  >
                    <span className="execution-timeline__bar-label">
                      {exec.task}
                    </span>
                    <span className="execution-timeline__bar-duration">
                      {formatDuration(exec.durationMin)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        )}
      </div>
    </section>
  );
}
