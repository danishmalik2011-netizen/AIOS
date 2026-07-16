import { lazy, Suspense } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { Spinner } from '@/components/shared/Spinner';
import { TerminalView } from '@/components/views/TerminalView';
import type { SidebarView } from '@/core/types';

/* Dashboard is the default view — eager. The rest are code-split so the
   heavy deps (Monaco, React Flow, Recharts) stay out of the initial bundle. */
const AgentsView = lazy(() => import('@/components/views/AgentsView').then((m) => ({ default: m.AgentsView })));
const WorkflowView = lazy(() => import('@/components/views/WorkflowView').then((m) => ({ default: m.WorkflowView })));
const FilesView = lazy(() => import('@/components/views/FilesView').then((m) => ({ default: m.FilesView })));
const PreviewView = lazy(() => import('@/components/views/PreviewView').then((m) => ({ default: m.PreviewView })));
const GitView = lazy(() => import('@/components/views/GitView').then((m) => ({ default: m.GitView })));
const MemoryView = lazy(() => import('@/components/views/MemoryView').then((m) => ({ default: m.MemoryView })));
const PromptsView = lazy(() => import('@/components/views/PromptsView').then((m) => ({ default: m.PromptsView })));
const SettingsView = lazy(() => import('@/components/views/SettingsView').then((m) => ({ default: m.SettingsView })));
const NotificationsView = lazy(() => import('@/components/views/NotificationsView').then((m) => ({ default: m.NotificationsView })));
const AccountView = lazy(() => import('@/components/views/AccountView').then((m) => ({ default: m.AccountView })));
const WorkspacesView = lazy(() => import('@/components/views/WorkspacesView').then((m) => ({ default: m.WorkspacesView })));

const views: Record<SidebarView, React.ComponentType> = {
  dashboard: Dashboard,
  agents: AgentsView,
  workflow: WorkflowView,
  files: FilesView,
  preview: PreviewView,
  git: GitView,
  memory: MemoryView,
  prompts: PromptsView,
  terminal: TerminalView,
  workspaces: WorkspacesView,
  settings: SettingsView,
  notifications: NotificationsView,
  account: AccountView,
};

function ViewFallback() {
  return (
    <div className="view-router__fallback">
      <Spinner size="lg" />
    </div>
  );
}

export function ViewRouter() {
  const activeView = useSettingsStore((s) => s.activeView);
  const terminalActive = activeView === 'terminal';
  const ActiveView = views[activeView] ?? Dashboard;

  return (
    <div className="view-router">
      {/* The terminal is mounted once and kept alive across navigation so PTY
          sessions (and their running work) survive tab switches. It is hidden
          with display:none when another view is active. */}
      <div
        className="view-router__persistent"
        aria-hidden={!terminalActive}
        style={{ display: terminalActive ? 'contents' : 'none' }}
      >
        <Suspense fallback={<ViewFallback />}>
          <TerminalView />
        </Suspense>
      </div>

      {!terminalActive && (
        <Suspense fallback={<ViewFallback />}>
          <ActiveView key={activeView} />
        </Suspense>
      )}
    </div>
  );
}
