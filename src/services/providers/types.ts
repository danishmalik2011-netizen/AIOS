/* ================================================
   Provider Abstraction Layer — shared contracts
   A single interface every AI provider implements, so the rest of the
   app (agents, orchestration engine, plugins) never talks to a vendor
   SDK directly. Swap/parallelise providers behind this seam.
   ================================================ */

import type { ProviderType } from '@/core/types';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A structured tool/function call emitted by a model. `arguments` is a JSON string. */
export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderMessage {
  role: ChatRole;
  content: string;
  /** Present on an assistant turn that requested tool calls. */
  toolCalls?: ProviderToolCall[];
  /** Present on a `role: 'tool'` result, linking it to the call it answers. */
  toolCallId?: string;
}

export interface CompletionRequest {
  model: string;
  messages: ProviderMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Tools the model may call natively (provider function-calling). */
  tools?: ToolDefinition[];
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: ProviderType;
  usage?: TokenUsage;
  finishReason?: string;
  /** Native tool calls the model requested this turn, if any. */
  toolCalls?: ProviderToolCall[];
  /** True when the response was not produced by a live model. */
  simulated: boolean;
}

export interface StreamCallbacks {
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface ProviderDriver {
  readonly id: ProviderType;
  readonly name: string;
  /** Whether this provider can serve a real request right now (key/reachable). */
  isAvailable(): boolean | Promise<boolean>;
  listModels(): string[] | Promise<string[]>;
  /** Streaming completion. Implementations must honour opts.signal. */
  complete(req: CompletionRequest, opts?: StreamCallbacks): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderType,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
