import { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  Layers,
  ClipboardList,
  BookMarked,
  GitFork,
  Bug,
  ListChecks,
  FileText,
  MessagesSquare,
  Database,
  Tag,
  Clock,
  UserRound,
  BrainCircuit,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { useMemoryStore } from '@/store/useMemoryStore';
import { toast } from '@/store/useNotificationStore';
import type { MemoryEntry, MemoryCategory } from '@/core/types';
import './MemoryView.css';

type Importance = MemoryEntry['importance'];
type CategoryKey = MemoryCategory | 'all';

interface LucideProps {
  size?: number | string;
  className?: string;
}

const CATEGORY_META: Record<
  CategoryKey,
  { label: string; emoji: string; Icon: ComponentType<LucideProps> }
> = {
  all: { label: 'All Memory', emoji: '🧠', Icon: BrainCircuit },
  architecture: { label: 'Architecture', emoji: '🏛️', Icon: Layers },
  requirements: { label: 'Requirements', emoji: '📋', Icon: ClipboardList },
  conventions: { label: 'Conventions', emoji: '📐', Icon: BookMarked },
  decisions: { label: 'Decisions', emoji: '🔀', Icon: GitFork },
  bugs: { label: 'Bugs', emoji: '🐞', Icon: Bug },
  tasks: { label: 'Tasks', emoji: '✅', Icon: ListChecks },
  documentation: { label: 'Documentation', emoji: '📚', Icon: FileText },
  conversations: { label: 'Conversations', emoji: '💬', Icon: MessagesSquare },
};

const CATEGORY_ORDER: CategoryKey[] = [
  'all',
  'architecture',
  'requirements',
  'conventions',
  'decisions',
  'bugs',
  'tasks',
  'documentation',
  'conversations',
];

const MEMORY_CATEGORIES: MemoryCategory[] = CATEGORY_ORDER.filter(
  (c): c is MemoryCategory => c !== 'all',
);

const IMPORTANCE_VARIANT: Record<Importance, 'default' | 'accent' | 'warning' | 'error'> = {
  low: 'default',
  medium: 'accent',
  high: 'warning',
  critical: 'error',
};

const IMPORTANCE_ORDER: Importance[] = ['low', 'medium', 'high', 'critical'];

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function firstLine(content: string): string {
  const line = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.trim();
}

interface NewMemoryDraft {
  title: string;
  category: MemoryCategory;
  importance: Importance;
  content: string;
  tags: string;
}

const EMPTY_DRAFT: NewMemoryDraft = {
  title: '',
  category: 'architecture',
  importance: 'medium',
  content: '',
  tags: '',
};

export function MemoryView() {
  const entries = useMemoryStore((s) => s.entries);
  const selectedEntryId = useMemoryStore((s) => s.selectedEntryId);
  const searchQuery = useMemoryStore((s) => s.searchQuery);
  const activeCategory = useMemoryStore((s) => s.activeCategory);
  const setSearchQuery = useMemoryStore((s) => s.setSearchQuery);
  const setActiveCategory = useMemoryStore((s) => s.setActiveCategory);
  const setSelectedEntry = useMemoryStore((s) => s.setSelectedEntry);
  const addEntry = useMemoryStore((s) => s.addEntry);
  const removeEntry = useMemoryStore((s) => s.removeEntry);
  const filteredEntries = useMemoryStore((s) => s.filteredEntries);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<NewMemoryDraft>(EMPTY_DRAFT);
  const [copied, setCopied] = useState(false);

  // filteredEntries reads searchQuery/activeCategory/entries from the store;
  // recompute whenever any of those change.
  const results = useMemo(
    () => filteredEntries(),
    [filteredEntries, entries, searchQuery, activeCategory],
  );

  const counts = useMemo(() => {
    const map = new Map<CategoryKey, number>();
    map.set('all', entries.length);
    for (const entry of entries) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
    }
    return map;
  }, [entries]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  const openModal = () => {
    setDraft(EMPTY_DRAFT);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    const title = draft.title.trim();
    if (!title) {
      toast.warning('Title required', 'Give this memory a short, descriptive title.');
      return;
    }
    const now = Date.now();
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      category: draft.category,
      title,
      content: draft.content.trim(),
      tags,
      createdAt: now,
      updatedAt: now,
      source: 'user',
      importance: draft.importance,
    };
    addEntry(entry);
    setSelectedEntry(entry.id);
    setIsModalOpen(false);
    toast.success('Memory saved', title);
  };

  const handleDelete = (entry: MemoryEntry) => {
    removeEntry(entry.id);
    toast.info('Memory deleted', entry.title);
  };

  const handleCopy = async (entry: MemoryEntry) => {
    try {
      await navigator.clipboard.writeText(`# ${entry.title}\n\n${entry.content}`);
      setCopied(true);
      toast.success('Copied to clipboard', entry.title);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Copy failed', 'Clipboard access was denied.');
    }
  };

  return (
    <div className="memory-view animate-fade-in">
      {/* LEFT — Category rail */}
      <nav className="memory-rail glass-panel" aria-label="Memory categories">
        <div className="memory-rail__head">
          <Database size={15} className="memory-rail__head-icon" />
          <span className="memory-rail__head-title">Knowledge Base</span>
        </div>
        <ul className="memory-rail__list">
          {CATEGORY_ORDER.map((key) => {
            const meta = CATEGORY_META[key];
            const count = counts.get(key) ?? 0;
            const isActive = activeCategory === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`memory-rail__item${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory(key)}
                >
                  <span className="memory-rail__icon" aria-hidden="true" style={{ display: 'flex', alignItems: 'center', opacity: 0.8 }}>
                    <meta.Icon size={14} />
                  </span>
                  <span className="memory-rail__label">{meta.label}</span>
                  <span className="memory-rail__count">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* MIDDLE — Search + list */}
      <section className="memory-list glass-panel">
        <header className="memory-list__head">
          <Input
            icon={<Search size={14} />}
            placeholder="Search memory…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search memory"
          />
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openModal}>
            New Memory
          </Button>
        </header>

        <div className="memory-list__scroll">
          {results.length > 0 ? (
            <ul className="memory-cards stagger-children">
              {results.map((entry) => {
                const meta = CATEGORY_META[entry.category];
                const isSelected = entry.id === selectedEntryId;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={`memory-card glass-card${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedEntry(entry.id)}
                    >
                      <div className="memory-card__top">
                        <span className="memory-card__title">{entry.title}</span>
                        <Badge variant={IMPORTANCE_VARIANT[entry.importance]} dot>
                          {entry.importance}
                        </Badge>
                      </div>
                      <p className="memory-card__excerpt">{firstLine(entry.content) || 'No content.'}</p>
                      <div className="memory-card__meta">
                        <span className="memory-card__chip">
                          <span aria-hidden="true">{meta.emoji}</span>
                          {meta.label}
                        </span>
                        <span className="memory-card__source">
                          <UserRound size={11} />
                          {entry.source}
                        </span>
                        <span className="memory-card__time">
                          <Clock size={11} />
                          {relativeTime(entry.updatedAt)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="memory-empty">
              <Search size={26} className="memory-empty__icon" />
              <p className="memory-empty__title">No memories found</p>
              <p className="memory-empty__hint">
                {searchQuery
                  ? 'Try a different search term or category.'
                  : 'Create a memory to start building the knowledge base.'}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* RIGHT — Detail pane */}
      <section className="memory-detail glass-panel">
        {selected ? (
          <>
            <header className="memory-detail__head">
              <h2 className="memory-detail__title">{selected.title}</h2>
              <div className="memory-detail__badges">
                <Badge variant={IMPORTANCE_VARIANT[selected.importance]} dot>
                  {selected.importance}
                </Badge>
                <span className="memory-detail__chip">
                  <span aria-hidden="true">{CATEGORY_META[selected.category].emoji}</span>
                  {CATEGORY_META[selected.category].label}
                </span>
              </div>
            </header>

            <div className="memory-detail__scroll">
              <dl className="memory-detail__facts">
                <div className="memory-detail__fact">
                  <dt>
                    <UserRound size={12} /> Source
                  </dt>
                  <dd>{selected.source}</dd>
                </div>
                <div className="memory-detail__fact">
                  <dt>
                    <Clock size={12} /> Created
                  </dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
                <div className="memory-detail__fact">
                  <dt>
                    <Clock size={12} /> Updated
                  </dt>
                  <dd>{formatDate(selected.updatedAt)}</dd>
                </div>
              </dl>

              {selected.tags.length > 0 && (
                <div className="memory-detail__tags">
                  {selected.tags.map((tag) => (
                    <span className="memory-detail__tag" key={tag}>
                      <Tag size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <hr className="glass-divider memory-detail__divider" />

              <div className="memory-detail__content">{selected.content || 'No content.'}</div>
            </div>

            <footer className="memory-detail__actions">
              <Button
                variant="secondary"
                size="sm"
                icon={copied ? <Check size={14} /> : <Copy size={14} />}
                onClick={() => handleCopy(selected)}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => handleDelete(selected)}
              >
                Delete
              </Button>
            </footer>
          </>
        ) : (
          <div className="memory-empty memory-empty--detail">
            <BrainCircuit size={30} className="memory-empty__icon" />
            <p className="memory-empty__title">No memory selected</p>
            <p className="memory-empty__hint">
              Select an entry from the list to view its full details.
            </p>
          </div>
        )}
      </section>

      {/* New memory modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Memory" size="md">
        <div className="memory-form">
          <label className="memory-form__field">
            <span className="memory-form__label">Title</span>
            <Input
              placeholder="e.g. Auth token refresh strategy"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              autoFocus
            />
          </label>

          <div className="memory-form__row">
            <label className="memory-form__field">
              <span className="memory-form__label">Category</span>
              <select
                className="memory-form__select glass-input"
                value={draft.category}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, category: e.target.value as MemoryCategory }))
                }
              >
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="memory-form__field">
              <span className="memory-form__label">Importance</span>
              <select
                className="memory-form__select glass-input"
                value={draft.importance}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, importance: e.target.value as Importance }))
                }
              >
                {IMPORTANCE_ORDER.map((imp) => (
                  <option key={imp} value={imp}>
                    {imp.charAt(0).toUpperCase() + imp.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="memory-form__field">
            <span className="memory-form__label">Content</span>
            <textarea
              className="memory-form__textarea glass-input"
              placeholder="Capture the knowledge, decision, or context…"
              rows={6}
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            />
          </label>

          <label className="memory-form__field">
            <span className="memory-form__label">
              Tags <span className="memory-form__hint">comma separated</span>
            </span>
            <Input
              placeholder="auth, security, tokens"
              value={draft.tags}
              onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
            />
          </label>

          <div className="memory-form__actions">
            <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={handleCreate}>
              Save Memory
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
