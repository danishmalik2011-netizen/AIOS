import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MemoryEntry, MemoryCategory } from '@/core/types';

interface MemoryStore {
  entries: MemoryEntry[];
  selectedEntryId: string | null;
  searchQuery: string;
  activeCategory: MemoryCategory | 'all';
  setSearchQuery: (query: string) => void;
  setActiveCategory: (category: MemoryCategory | 'all') => void;
  setSelectedEntry: (id: string | null) => void;
  addEntry: (entry: MemoryEntry) => void;
  removeEntry: (id: string) => void;
  filteredEntries: () => MemoryEntry[];
}

const sampleEntries: MemoryEntry[] = [];

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      entries: sampleEntries,
      selectedEntryId: null,
      searchQuery: '',
      activeCategory: 'all',

      setSearchQuery: (query) => set({ searchQuery: query }),
      setActiveCategory: (category) => set({ activeCategory: category }),
      setSelectedEntry: (id) => set({ selectedEntryId: id }),

      addEntry: (entry) =>
        set((state) => ({ entries: [entry, ...state.entries] })),

      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
          selectedEntryId: state.selectedEntryId === id ? null : state.selectedEntryId,
        })),

      filteredEntries: () => {
        const { entries, searchQuery, activeCategory } = get();
        return entries.filter((entry) => {
          const matchesCategory = activeCategory === 'all' || entry.category === activeCategory;
          const matchesSearch =
            !searchQuery ||
            entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            entry.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
          return matchesCategory && matchesSearch;
        });
      },
    }),
    {
      name: 'aios-memory-entries',
      partialize: (state) => ({
        entries: state.entries,
      }),
    },
  ),
);
