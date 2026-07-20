// Model context windows (in tokens)
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Claude 3 family
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  
  // GPT-4 family
  'gpt-4-turbo-preview': 128000,
  'gpt-4-1106-preview': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16384,
  'gpt-3.5-turbo-16k': 16384,
  
  // Default fallback
  default: 32768
};

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
}

export interface ContextManagerOptions {
  modelId: string;
  compactionThreshold?: number; // percentage (0-100)
  enableAutoCompaction?: boolean;
}

/**
 * Context Manager - Tracks token usage and manages context compaction
 */
export class ContextManager {
  private modelId: string;
  private contextWindow: number;
  private messages: ContextMessage[] = [];
  private tokenCount: number = 0;
  private compactionThreshold: number;
  private enableAutoCompaction: boolean;
  private onCompactionCallback: (() => Promise<void>) | null = null;

  constructor(options: ContextManagerOptions) {
    this.modelId = options.modelId;
    this.contextWindow = MODEL_CONTEXT_WINDOWS[options.modelId] || MODEL_CONTEXT_WINDOWS.default;
    this.compactionThreshold = options.compactionThreshold ?? 95;
    this.enableAutoCompaction = options.enableAutoCompaction ?? true;
  }

  /**
   * Set callback to be triggered when compaction is needed
   */
  setOnCompactionCallback(callback: () => Promise<void>) {
    this.onCompactionCallback = callback;
  }

  /**
   * Add a message to context and return if compaction is needed
   */
  addMessage(role: ContextMessage['role'], content: string): boolean {
    const tokens = this.estimateTokens(content);
    const message: ContextMessage = {
      role,
      content,
      timestamp: Date.now()
    };

    this.messages.push(message);
    this.tokenCount += tokens;

    // Check if we need compaction
    const usagePercent = this.getUsagePercent();
    if (this.enableAutoCompaction && usagePercent >= this.compactionThreshold) {
      // Trigger compaction callback if set
      if (this.onCompactionCallback) {
        this.onCompactionCallback();
        return true; // Compaction triggered
      }
    }

    return false;
  }

  /**
   * Estimate tokens for a given text
   * Uses model-specific heuristics (can be replaced with actual tokenizers)
   */
  private estimateTokens(text: string): number {
    // Simple heuristic: ~4 characters per token for most models
    // This can be improved with actual tokenizers per model family
    switch (true) {
      // Claude models - similar to GPT-4 heuristic
      case /^claude-/i.test(this.modelId):
        return Math.max(1, Math.ceil(text.length / 4));
      
      // GPT models
      case /^gpt-/i.test(this.modelId):
        return Math.max(1, Math.ceil(text.length / 4));
      
      // Default fallback
      default:
        return Math.max(1, Math.ceil(text.length / 4));
    }
  }

  /**
   * Get current token usage percentage
   */
  getUsagePercent(): number {
    return (this.tokenCount / this.contextWindow) * 100;
  }

  /**
   * Get current token count
   */
  getTokenCount(): number {
    return this.tokenCount;
  }

  /**
   * Get context window size
   */
  getContextWindow(): number {
    return this.contextWindow;
  }

  /**
   * Get all messages in context
   */
  getMessages(): ContextMessage[] {
    return [...this.messages];
  }

  /**
   * Clear all messages and reset token count
   */
  clear() {
    this.messages = [];
    this.tokenCount = 0;
  }

  /**
   * Get recent messages (last N messages)
   */
  getRecentMessages(count: number): ContextMessage[] {
    return this.messages.slice(-count);
  }

  /**
   * Check if compaction is needed without triggering it
   */
  needsCompaction(): boolean {
    return this.getUsagePercent() >= this.compactionThreshold;
  }
}

// Token estimation utilities for more accurate counting
export namespace TokenEstimators {
  /**
   * Estimate tokens using character count heuristic
   * @param text Text to estimate
   * @param charsPerToken Average characters per token (default 4)
   */
  export function estimateByCharacters(text: string, charsPerToken: number = 4): number {
    return Math.max(1, Math.ceil(text.length / charsPerToken));
  }

  /**
   * Estimate tokens using word count heuristic
   * @param text Text to estimate
   * @param wordsPerToken Average words per token (default 0.75)
   */
  export function estimateByWords(text: string, wordsPerToken: number = 0.75): number {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(wordCount * wordsPerToken));
  }

  /**
   * More sophisticated estimation for code (adjusts for syntax)
   * @param text Text to estimate
   * @param language Optional language hint
   */
  export function estimateForCode(text: string, language?: string): number {
    // Code tends to be more dense than prose
    const baseEstimate = estimateByCharacters(text, 3.5); // ~3.5 chars per token for code
    
    // Adjust for common patterns
    const adjustments = 
      (text.match(/[{}]/g)?.length ?? 0) * 0.1 + // Braces
      (text.match(/[\(\)]/g)?.length ?? 0) * 0.05 + // Parentheses
      (text.match(/[,;]/g)?.length ?? 0) * 0.02;   // Commas, semicolons
    
    return Math.max(1, Math.ceil(baseEstimate + adjustments));
  }
}

