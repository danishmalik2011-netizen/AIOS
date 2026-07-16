import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PromptTemplate } from '@/core/types';

interface PromptStore {
  prompts: PromptTemplate[];
  searchQuery: string;
  activeCategory: string;
  selectedPromptId: string | null;
  setSearchQuery: (q: string) => void;
  setActiveCategory: (c: string) => void;
  setSelectedPrompt: (id: string | null) => void;
  addPrompt: (prompt: PromptTemplate) => void;
  updatePrompt: (id: string, patch: Partial<PromptTemplate>) => void;
  removePrompt: (id: string) => void;
  toggleFavorite: (id: string) => void;
  incrementUsage: (id: string) => void;
}

const now = Date.now();

const seedPrompts: PromptTemplate[] = [
  {
    id: 'p-1',
    title: 'Architect a new feature',
    content:
      'You are a senior software architect. Given the feature description below, produce:\n1. A component breakdown\n2. Data model / state shape\n3. Edge cases and failure modes\n4. A step-by-step implementation plan\n\nFeature: {{feature}}',
    category: 'Planning',
    tags: ['architecture', 'planning'],
    usageCount: 42,
    isFavorite: true,
    createdAt: now - 86_400_000 * 6,
  },
  {
    id: 'p-2',
    title: 'Production-grade component',
    content:
      'Implement a production-quality {{framework}} component named {{name}}.\nRequirements:\n- Full type safety\n- Accessibility (ARIA, keyboard)\n- Loading & error states\n- Co-located styles matching the design tokens\nReturn only the code.',
    category: 'Implementation',
    tags: ['code', 'component', 'typescript'],
    usageCount: 128,
    isFavorite: true,
    createdAt: now - 86_400_000 * 5,
  },
  {
    id: 'p-3',
    title: 'Adversarial code review',
    content:
      'Review the diff below as a skeptical senior engineer. Find correctness bugs, race conditions, security issues, and performance regressions. Rank by severity. Default to flagging if uncertain.\n\nDiff:\n{{diff}}',
    category: 'Review',
    tags: ['review', 'security', 'bugs'],
    usageCount: 87,
    isFavorite: false,
    createdAt: now - 86_400_000 * 4,
  },
  {
    id: 'p-4',
    title: 'Generate test suite',
    content:
      'Write a comprehensive test suite for the module below using {{framework}}. Cover happy paths, edge cases, and error handling. Aim for meaningful assertions, not coverage theatre.\n\nModule:\n{{module}}',
    category: 'Testing',
    tags: ['tests', 'vitest', 'quality'],
    usageCount: 64,
    isFavorite: false,
    createdAt: now - 86_400_000 * 3,
  },
  {
    id: 'p-5',
    title: 'Conventional commit message',
    content:
      'Given the staged diff, write a Conventional Commits message. One concise subject line (<72 chars) and a short body explaining the why.\n\nDiff:\n{{diff}}',
    category: 'Git',
    tags: ['git', 'commit'],
    usageCount: 203,
    isFavorite: true,
    createdAt: now - 86_400_000 * 2,
  },
  {
    id: 'p-6',
    title: 'Explain and refactor',
    content:
      'Explain what the code below does in plain language, then propose a cleaner refactor that preserves behaviour. Note any behavioural risks.\n\nCode:\n{{code}}',
    category: 'Implementation',
    tags: ['refactor', 'explain'],
    usageCount: 51,
    isFavorite: false,
    createdAt: now - 86_400_000 * 1,
  },
];

export const usePromptStore = create<PromptStore>()(
  persist(
    (set) => ({
      prompts: seedPrompts,
      searchQuery: '',
      activeCategory: 'All',
      selectedPromptId: 'p-1',

      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveCategory: (c) => set({ activeCategory: c }),
      setSelectedPrompt: (id) => set({ selectedPromptId: id }),

      addPrompt: (prompt) =>
        set((state) => ({ prompts: [prompt, ...state.prompts], selectedPromptId: prompt.id })),

      updatePrompt: (id, patch) =>
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removePrompt: (id) =>
        set((state) => ({
          prompts: state.prompts.filter((p) => p.id !== id),
          selectedPromptId: state.selectedPromptId === id ? null : state.selectedPromptId,
        })),

      toggleFavorite: (id) =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, isFavorite: !p.isFavorite } : p,
          ),
        })),

      incrementUsage: (id) =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p,
          ),
        })),
    }),
    { name: 'aios-prompts' },
  ),
);
