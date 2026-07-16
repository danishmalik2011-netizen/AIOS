/* Built-in model lists per provider. Used to seed the model picker when a
   provider hasn't advertised its models yet (no key, no discovery). Single
   source of truth shared by the composer and the Agent Roster editor. */
export const BUILTIN_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
  anthropic: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  ollama: ['llama3', 'codellama', 'qwen2.5-coder'],
};
