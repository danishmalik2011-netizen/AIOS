import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  Copy,
  Edit3,
  Library,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react';
import { usePromptStore } from '@/store/usePromptStore';
import { toast } from '@/store/useNotificationStore';
import { Button } from '@/components/shared/Button';
import { IconButton } from '@/components/shared/IconButton';
import { Input } from '@/components/shared/Input';
import { Badge } from '@/components/shared/Badge';
import { Modal } from '@/components/shared/Modal';
import type { PromptTemplate } from '@/core/types';
import './PromptsView.css';

const FAVORITES = 'Favorites';
const ALL = 'All';

interface CategoryEntry {
  key: string;
  label: string;
  count: number;
  icon: ReactNode;
}

interface PromptFormState {
  title: string;
  category: string;
  content: string;
  tags: string;
}

const emptyForm: PromptFormState = { title: '', category: '', content: '', tags: '' };

/** Splits prompt content into plain segments and {{variable}} tokens for highlighting. */
function renderHighlighted(content: string): ReactNode[] {
  const parts = content.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) => {
    if (/^\{\{[^}]+\}\}$/.test(part)) {
      return (
        <span key={i} className="prompts__var">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function PromptsView() {
  const prompts = usePromptStore((s) => s.prompts);
  const searchQuery = usePromptStore((s) => s.searchQuery);
  const activeCategory = usePromptStore((s) => s.activeCategory);
  const selectedPromptId = usePromptStore((s) => s.selectedPromptId);
  const setSearchQuery = usePromptStore((s) => s.setSearchQuery);
  const setActiveCategory = usePromptStore((s) => s.setActiveCategory);
  const setSelectedPrompt = usePromptStore((s) => s.setSelectedPrompt);
  const addPrompt = usePromptStore((s) => s.addPrompt);
  const updatePrompt = usePromptStore((s) => s.updatePrompt);
  const removePrompt = usePromptStore((s) => s.removePrompt);
  const toggleFavorite = usePromptStore((s) => s.toggleFavorite);
  const incrementUsage = usePromptStore((s) => s.incrementUsage);

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptFormState>(emptyForm);

  const favoriteCount = useMemo(
    () => prompts.filter((p) => p.isFavorite).length,
    [prompts],
  );

  const categories = useMemo<CategoryEntry[]>(() => {
    const counts = new Map<string, number>();
    for (const p of prompts) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    const derived: CategoryEntry[] = Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({
        key,
        label: key,
        count,
        icon: <Tag size={14} />,
      }));

    return [
      { key: ALL, label: 'All Prompts', count: prompts.length, icon: <Library size={14} /> },
      {
        key: FAVORITES,
        label: 'Favorites',
        count: favoriteCount,
        icon: <Star size={14} />,
      },
      ...derived,
    ];
  }, [prompts, favoriteCount]);

  const filteredPrompts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return prompts.filter((p) => {
      const matchesCategory =
        activeCategory === ALL
          ? true
          : activeCategory === FAVORITES
            ? p.isFavorite
            : p.category === activeCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [prompts, activeCategory, searchQuery]);

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(
      activeCategory !== ALL && activeCategory !== FAVORITES
        ? { ...emptyForm, category: activeCategory }
        : emptyForm,
    );
    setModalOpen(true);
  };

  const openEdit = (prompt: PromptTemplate) => {
    setEditingId(prompt.id);
    setForm({
      title: prompt.title,
      category: prompt.category,
      content: prompt.content,
      tags: prompt.tags.join(', '),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    const content = form.content.trim();
    if (!title || !content) {
      toast.warning('Missing fields', 'A title and content are required.');
      return;
    }
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const category = form.category.trim() || 'Uncategorized';

    if (editingId) {
      updatePrompt(editingId, { title, content, category, tags });
      toast.success('Prompt updated', title);
    } else {
      const newPrompt: PromptTemplate = {
        id: crypto.randomUUID(),
        title,
        content,
        category,
        tags,
        usageCount: 0,
        isFavorite: false,
        createdAt: Date.now(),
      };
      addPrompt(newPrompt);
      toast.success('Prompt created', title);
    }
    closeModal();
  };

  const handleCopy = async (prompt: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      incrementUsage(prompt.id);
      toast.success('Copied to clipboard', prompt.title);
    } catch {
      toast.error('Copy failed', 'Clipboard access was denied.');
    }
  };

  const handleUse = (prompt: PromptTemplate) => {
    incrementUsage(prompt.id);
    toast.info('Prompt inserted', `“${prompt.title}” is ready in the composer.`);
  };

  const handleDelete = (prompt: PromptTemplate) => {
    removePrompt(prompt.id);
    toast.info('Prompt deleted', prompt.title);
  };

  return (
    <div className="prompts animate-fade-in">
      {/* ---- Category rail ---- */}
      <aside className="prompts__rail glass-panel">
        <div className="prompts__rail-head">
          <div className="prompts__rail-title">
            <Sparkles size={16} className="prompts__rail-icon" />
            <span>Library</span>
          </div>
          <span className="prompts__rail-count">{prompts.length}</span>
        </div>
        <nav className="prompts__categories">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`prompts__category ${
                activeCategory === cat.key ? 'prompts__category--active' : ''
              } ${cat.key === FAVORITES ? 'prompts__category--fav' : ''}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              <span className="prompts__category-label">
                {cat.icon}
                <span>{cat.label}</span>
              </span>
              <span className="prompts__category-count">{cat.count}</span>
            </button>
          ))}
        </nav>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={15} />}
          className="prompts__new-btn"
          onClick={openCreate}
        >
          New Prompt
        </Button>
      </aside>

      {/* ---- List column ---- */}
      <section className="prompts__list-col glass-panel">
        <div className="prompts__list-head">
          <Input
            icon={<Search size={15} />}
            placeholder="Search prompts, tags, content…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search prompts"
          />
        </div>

        {filteredPrompts.length === 0 ? (
          <div className="prompts__empty">
            <Library size={34} className="prompts__empty-icon" />
            <p className="prompts__empty-title">No prompts found</p>
            <p className="prompts__empty-sub">
              {searchQuery
                ? 'Try a different search term or category.'
                : 'Create your first prompt to get started.'}
            </p>
          </div>
        ) : (
          <div className="prompts__cards stagger-children">
            {filteredPrompts.map((prompt) => (
              <article
                key={prompt.id}
                className={`prompts__card glass-card ${
                  prompt.id === selectedPromptId ? 'prompts__card--active' : ''
                }`}
                onClick={() => setSelectedPrompt(prompt.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedPrompt(prompt.id);
                  }
                }}
              >
                <div className="prompts__card-top">
                  <h3 className="prompts__card-title">{prompt.title}</h3>
                  <button
                    type="button"
                    className={`prompts__star ${
                      prompt.isFavorite ? 'prompts__star--on' : ''
                    }`}
                    aria-label={
                      prompt.isFavorite ? 'Remove from favorites' : 'Add to favorites'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(prompt.id);
                    }}
                  >
                    <Star size={15} fill={prompt.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>

                <p className="prompts__card-preview">{prompt.content}</p>

                <div className="prompts__card-meta">
                  <span className="prompts__chip prompts__chip--cat">{prompt.category}</span>
                  {prompt.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="prompts__chip">
                      {tag}
                    </span>
                  ))}
                  {prompt.tags.length > 3 && (
                    <span className="prompts__chip">+{prompt.tags.length - 3}</span>
                  )}
                </div>

                <div className="prompts__card-foot">
                  <Wand2 size={12} />
                  <span>{prompt.usageCount.toLocaleString()} uses</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---- Detail column ---- */}
      <section className="prompts__detail glass-panel">
        {selectedPrompt ? (
          <>
            <header className="prompts__detail-head">
              <div className="prompts__detail-titles">
                <h2 className="prompts__detail-title">{selectedPrompt.title}</h2>
                <div className="prompts__detail-badges">
                  <Badge variant="accent">{selectedPrompt.category}</Badge>
                  {selectedPrompt.isFavorite && (
                    <Badge variant="warning">
                      <Star size={11} fill="currentColor" /> Favorite
                    </Badge>
                  )}
                  <span className="prompts__detail-uses">
                    <Wand2 size={12} /> {selectedPrompt.usageCount.toLocaleString()} uses
                  </span>
                </div>
              </div>
              <div className="prompts__detail-actions">
                <IconButton
                  icon={<Edit3 size={16} />}
                  tooltip="Edit prompt"
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(selectedPrompt)}
                />
                <IconButton
                  icon={<Trash2 size={16} />}
                  tooltip="Delete prompt"
                  variant="ghost"
                  size="sm"
                  className="prompts__danger-btn"
                  onClick={() => handleDelete(selectedPrompt)}
                />
              </div>
            </header>

            {selectedPrompt.tags.length > 0 && (
              <div className="prompts__detail-tags">
                {selectedPrompt.tags.map((tag) => (
                  <span key={tag} className="prompts__chip">
                    <Tag size={11} /> {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="prompts__content-panel">
              <div className="prompts__content-bar">
                <span>PROMPT</span>
                <span className="prompts__content-hint">
                  {'{{variables}}'} are highlighted
                </span>
              </div>
              <pre className="prompts__content">
                {renderHighlighted(selectedPrompt.content)}
              </pre>
            </div>

            <div className="prompts__detail-cta">
              <Button
                variant="primary"
                icon={<Copy size={15} />}
                onClick={() => handleCopy(selectedPrompt)}
              >
                Copy
              </Button>
              <Button
                variant="secondary"
                icon={<Wand2 size={15} />}
                onClick={() => handleUse(selectedPrompt)}
              >
                Use Prompt
              </Button>
            </div>
          </>
        ) : (
          <div className="prompts__empty prompts__empty--detail">
            <Sparkles size={34} className="prompts__empty-icon" />
            <p className="prompts__empty-title">Select a prompt</p>
            <p className="prompts__empty-sub">
              Choose a template from the list to preview and use it.
            </p>
          </div>
        )}
      </section>

      {/* ---- Create / Edit modal ---- */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit Prompt' : 'New Prompt'}
        size="md"
      >
        <form className="prompts__form" onSubmit={handleSubmit}>
          <label className="prompts__field">
            <span className="prompts__field-label">Title</span>
            <Input
              placeholder="e.g. Adversarial code review"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </label>

          <label className="prompts__field">
            <span className="prompts__field-label">Category</span>
            <Input
              placeholder="e.g. Review"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </label>

          <label className="prompts__field">
            <span className="prompts__field-label">Content</span>
            <textarea
              className="prompts__textarea glass-input"
              placeholder="Write your prompt. Use {{variables}} for placeholders…"
              value={form.content}
              rows={8}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </label>

          <label className="prompts__field">
            <span className="prompts__field-label">Tags</span>
            <Input
              placeholder="comma, separated, tags"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            />
          </label>

          <div className="prompts__form-actions">
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<Plus size={15} />}>
              {editingId ? 'Save Changes' : 'Create Prompt'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
