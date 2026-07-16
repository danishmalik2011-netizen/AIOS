import { MetricsCards } from './MetricsCards';
import { AgentActivityFeed } from './AgentActivityFeed';
import { ProgressTracker } from './ProgressTracker';
import { ExecutionTimeline } from './ExecutionTimeline';
import './Dashboard.css';

export function Dashboard() {
  return (
    <div className="dashboard stagger-children">
      {/* Header */}
      <header className="dashboard__header">
        <h1 className="dashboard__title">Mission Control</h1>
        <p className="dashboard__subtitle">Your AI development command center</p>
      </header>

      {/* 4 Metric cards — real, derived data only */}
      <section className="dashboard__metrics">
        <MetricsCards />
      </section>

      {/* Two-column: Activity + Progress */}
      <section className="dashboard__content">
        <AgentActivityFeed />
        <ProgressTracker />
      </section>

      {/* Full-width timeline */}
      <section className="dashboard__timeline">
        <ExecutionTimeline />
      </section>
    </div>
  );
}
