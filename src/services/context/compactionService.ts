import { ContextMessage } from '@/services/context/contextManager';

/**
 * Options for the compaction service
 */
export interface CompactionOptions {
  /** Number of recent messages to keep verbatim during compaction */
  keepRecentCount?: number;
  /** 
   * Custom prompt for summarization. 
   * If not provided, a default extractive summarization is used.
   */
  summarizationPrompt?: string;
}

/**
 * Result of compaction operation
 */
export interface CompactionResult {
  /** The compacted messages */
  messages: ContextMessage[];
  /** Whether compaction was actually performed */
  performed: boolean;
  /** The summary that was generated (if any) */
  summary?: string;
}

/**
 * Compaction Service - Handles summarizing and reducing context when needed
 */
export class CompactionService {
  private keepRecentCount: number;
  private summarizationPrompt: string;

  constructor(options: CompactionOptions = {}) {
    this.keepRecentCount = options.keepRecentCount ?? 5; // Keep last 5 messages by default
    this.summarizationPrompt = options.summarizationPrompt ?? 
      'Please provide a concise summary of the following conversation excerpt, preserving key information, decisions, and context:\\n\\n---\\n\\n{text}\\n\\n---\\n\\nSummary:';
  }

  /**
   * Compact a list of messages by summarizing older content
   * @param messages Current conversation messages
   * @param modelId Model ID (for token estimation if needed)
   * @returns Compacted messages and metadata
   */
  async compact(messages: ContextMessage[], modelId?: string): Promise<CompactionResult> {
    if (messages.length <= this.keepRecentCount) {
      return { messages, performed: false };
    }

    // Split into messages to summarize and messages to keep
    const toSummarize = messages.slice(0, -this.keepRecentCount);
    const toKeep = messages.slice(-this.keepRecentCount);

    // Combine content for summarization
    const textToSummarize = toSummarize.map(msg => 
      [] 
    ).join('\\n\\n');

    // Generate summary (using provided prompt or default)
    const summary = await this.generateSummary(textToSummarize);

    // Create summary message
    const summaryMessage: ContextMessage = {
      role: 'system',
      content: '[CONVERSATION SUMMARY]:\n\n[END SUMMARY]',
      timestamp: Date.now()
    };

    // Construct new message list: summary + kept messages
    const compactedMessages = [summaryMessage, ...toKeep];

    return {
      messages: compactedMessages,
      performed: true,
      summary
    };
  }

  /**
   * Generate a summary from text
   * @param text Text to summarize
   * @returns Summary string
   */
  private async generateSummary(text: string): Promise<string> {
    // For now, we'll use a simple extractive approach
    // In the future, this could be replaced with an LLM call via agentRuntime
    return this.extractiveSummary(text);
  }

  /**
   * Simple extractive summarization (placeholder for LLM-based summarization)
   * @param text Text to summarize
   * @returns Extractive summary
   */
  private extractiveSummary(text: string): string {
    // Split into sentences (simple regex)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    if (sentences.length <= 3) {
      return text; // Already short enough
    }

    // Take first 2 sentences, last 2 sentences, and one from middle if available
    const first = sentences.slice(0, 2);
    const last = sentences.slice(-2);
    const middleIndex = Math.floor(sentences.length / 2);
    const middle = sentences.length > 4 ? [sentences[middleIndex]] : [];

    const selected = [...first, ...middle, ...last];
    return selected.join(' ').trim();
  }

  /**
   * Set custom summarization prompt
   */
  setSummarizationPrompt(prompt: string): void {
    this.summarizationPrompt = prompt;
  }

  /**
   * Set number of recent messages to keep
   */
  setKeepRecentCount(count: number): void {
    this.keepRecentCount = Math.max(0, count);
  }
}

