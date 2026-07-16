import { useMemo, type CSSProperties } from 'react';
import {
  Bot,
  MessagesSquare,
  ListChecks,
  Cpu,
  type LucideIcon,
} from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAgentStore } from '@/store/useAgentStore';
import './MetricsCards.css';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Compact human-friendly formatting, e.g. 1_252_460 -> "1.3M". */
function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

interface CardModel {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  sub: string;
  color: string;
  hasData: boolean;
}

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

function MetricCard({ model }: { model: CardModel }) {
  const Icon = model.icon;
  return (
    <article
      className="metric-card glass-card animate-fade-in-up"
      style={{ '--metric-accent': model.color } as CSSProperties}
    >
      <div className="metric-card__top">
        <span className="metric-card__icon" aria-hidden="true">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        {!model.hasData && <span className="metric-card__empty-tag">No data yet</span>}
      </div>

      <div className="metric-card__body">
        <span className="metric-card__value" aria-label={`${model.label}: ${model.value}`}>
          {model.value}
        </span>
        <span className="metric-card__label">{model.label}</span>
      </div>

      <div className="metric-card__foot">
        <span className="metric-card__sub">{model.sub}</span>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid                                                               */
/* ------------------------------------------------------------------ */

export function MetricsCards() {
  const agents = useAgentStore((s) => s.agents);
  const sessions = useChatStore((s) => s.sessions);

  const cards = useMemo<CardModel[]>(() => {
    const activeAgents = agents.length;
    const conversationCount = sessions.length;
    const messageCount = sessions.reduce((sum, s) => sum + s.messages.length, 0);
    const taskCount = sessions.reduce(
      (sum, s) => sum + s.messages.filter((m) => m.role === 'assistant').length,
      0,
    );

    return [
      {
        id: 'agents',
        label: 'Active Agents',
        icon: Bot,
        value: `${activeAgents}`,
        sub: activeAgents > 0 ? 'available in your roster' : 'no agents configured',
        color: '#7c5cff',
        hasData: activeAgents > 0,
      },
      {
        id: 'conversations',
        label: 'Conversations',
        icon: MessagesSquare,
        value: `${conversationCount}`,
        sub: conversationCount > 0 ? 'across all projects' : 'start one to track activity',
        color: '#00d4aa',
        hasData: conversationCount > 0,
      },
      {
        id: 'tasks',
        label: 'Assistant Replies',
        icon: ListChecks,
        value: formatCompact(taskCount),
        sub: taskCount > 0 ? 'generated this session' : 'no replies yet',
        color: '#5e9dff',
        hasData: taskCount > 0,
      },
      {
        id: 'messages',
        label: 'Total Messages',
        icon: Cpu,
        value: formatCompact(messageCount),
        sub: messageCount > 0 ? 'sent & received' : 'nothing logged yet',
        color: '#ffb347',
        hasData: messageCount > 0,
      },
    ];
  }, [agents, sessions]);

  return (
    <>
      {cards.map((model) => (
        <MetricCard key={model.id} model={model} />
      ))}
    </>
  );
}
