import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { ContextManager, type ContextMessage } from '@/services/context/contextManager';

interface ContextStoreState {
  // Map of sessionId -> ContextManager
  sessionContexts: Map<string, ContextManager>;
  
  // Actions
  getContextManager: (sessionId: string, modelId: string) => ContextManager;
  removeContextManager: (sessionId: string) => void;
  clearAllContexts: () => void;
}

/**
 * Store for managing context managers per session
 * Each session gets its own ContextManager based on the model being used
 */
export const useContextStore = create<ContextStoreState>()(
  devtools(
    (set, get) => ({
      sessionContexts: new Map(),
      
      /**
       * Get or create a context manager for a session
       * @param sessionId Unique identifier for the session
       * @param modelId The model ID to determine context window size
       * @returns ContextManager instance for this session
       */
      getContextManager: (sessionId: string, modelId: string) => {
        const { sessionContexts } = get();
        
        if (!sessionContexts.has(sessionId)) {
          const contextManager = new ContextManager({ modelId });
          sessionContexts.set(sessionId, contextManager);
          
          // Update state immutably
          set({ sessionContexts: new Map(sessionContexts) });
        }
        
        return sessionContexts.get(sessionId)!;
      },
      
      /**
       * Remove context manager for a session
       */
      removeContextManager: (sessionId: string) => {
        const { sessionContexts } = get();
        sessionContexts.delete(sessionId);
        set({ sessionContexts: new Map(sessionContexts) });
      },
      
      /**
       * Clear all context managers
       */
      clearAllContexts: () => {
        set({ sessionContexts: new Map() });
      }
    }),
    {
      name: 'context-store',
      // Don't persist ContextManager instances as they contain methods
      // Only persist serializable data if needed
      // For now, we don't persist as context is meant to be ephemeral per session
    }
  )
);

// Helper hook for components
export const useContextManager = (sessionId: string, modelId: string) => {
  return useContextStore(state => state.getContextManager(sessionId, modelId));
};

