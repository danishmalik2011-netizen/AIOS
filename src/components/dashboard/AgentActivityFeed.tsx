import { useMemo } from 'react';
import {
  Activity,
  ListChecks,
  GitCommitHorizontal,
  ShieldCheck,
  FlaskConical,
  Rocket,
  AlertTriangle,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { AgentAvatar } from '@/components/shared/AgentAvatar';
import type { ActivityItem, ActivityType } from '@/core/types';
import './AgentActivityFeed.css';

/* ------------------------------------------------------------------ */
/*  Real activity synthesis (derived from chat sessions, no mock data)  */
/* ------------------------------------------------------------------ */

type ActivityTypeLocal = ActivityItem['type'];

const TYPE_ICON: Record<ActivityTypeLocal, LucideIcon> = {
  task: ListChecks,
  commit: GitCommitHorizontal,
  review: ShieldCheck,
  test: FlaskConical,
  deploy: Rocket,
  error: AlertTriangle,
  info: Info,
};

const TYPE_COLOR: Record<ActivityTypeLocal, string> = {
  task: 'var(--accent-primary)',
  commit: 'var(--accent-secondary)',
  review: 'var(--accent-tertiary)',
  test: 'var(--accent-amber)',
  deploy: 'var(--status-info)',
  error: 'var(--status-error)',
  info: 'var(--text-tertiary)',
};

/** Relative time formatting, e.g. "2m ago", "3h ago". */
function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/** Build a short, readable snippet from message content. */
function snippet(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}…` : cleaned || 'No content';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentActivityFeed() {
  const sessions = useChatStore((s) => s.sessions);
  const now = Date.now();

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const s of sessions) {
      if (s.messages.length === 0) continue;
      const last = s.messages[s.messages.length - 1];
      const type: ActivityType =
        last.role === 'assistant' ? 'task' : last.role === 'user' ? 'info' : 'info';
      items.push({
        id: `${s.id}-last`,
        agentId: last.agentId,
        agentName: s.title,
        action: last.role === 'assistant' ? 'replied in' : 'messaged in',
        detail: snippet(last.content),
        timestamp: last.timestamp,
        type,
      });
    }
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [sessions]);

  const runningAgents = useMemo(
    () => sessions.filter((s) => !s.isArchived).slice(0, 3),
    [sessions],
  );

  return (
    <section className="activity-feed glass-panel" aria-label="Agent activity feed">
      <header className="activity-feed__header">
        <div className="activity-feed__title-group">
          <Activity size={16} className="activity-feed__title-icon" />
          <h2 className="activity-feed__title">Recent Activity</h2>
        </div>
        <span className="glass-badge activity-feed__count">
          {activities.length} event{activities.length === 1 ? '' : 's'}
        </span>
      </header>

      {runningAgents.length > 0 && (
        <div className="activity-feed__live" aria-label="Active conversations">
          {runningAgents.map((session) => (
            <div key={session.id} className="activity-feed__live-item">
              <span className="activity-feed__pulse" aria-hidden="true">
                <span className="activity-feed__pulse-dot" />
              </span>
              <AgentAvatar role="planner" size={26} />
              <span className="activity-feed__live-text">
                <strong>{session.title}</strong> has {session.messages.length} message
                {session.messages.length === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}

      {activities.length === 0 ? (
        <div className="activity-feed__empty">
          <Activity size={28} className="activity-feed__empty-icon" />
          <p className="activity-feed__empty-title">No activity yet</p>
          <p className="activity-feed__empty-desc">
            Start a conversation and your agent's activity will appear here.
          </p>
        </div>
      ) : (
        <ul className="activity-feed__list" role="list">
          {activities.map((item) => {
            const Icon = TYPE_ICON[item.type];
            const color = TYPE_COLOR[item.type];
            return (
              <li key={item.id} className="activity-feed__item">
                <div
                  className="activity-feed__avatar-wrapper"
                  style={{ position: 'relative', display: 'inline-flex' }}
                >
                  <AgentAvatar role="planner" size={28} />
                </div>

                <div className="activity-feed__content">
                  <p className="activity-feed__line">
                    <span className="activity-feed__agent">{item.agentName}</span>{' '}
                    <span className="activity-feed__action">{item.action}</span>
                  </p>
                  <p className="activity-feed__detail">{item.detail}</p>
                </div>

                <div className="activity-feed__meta">
                  <span
                    className="activity-feed__type-icon"
                    style={{ color }}
                    aria-label={`${item.type} event`}
                  >
                    <Icon size={14} />
                  </span>
                  <time
                    className="activity-feed__time"
                    dateTime={new Date(item.timestamp).toISOString()}
                  >
                    {relativeTime(item.timestamp, now)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
