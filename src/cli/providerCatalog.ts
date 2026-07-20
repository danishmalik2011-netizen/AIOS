/* ================================================
   AIOS CLI — provider catalog
   A curated list of real, publicly-available API
   providers (hosted LLM gateways). Used to populate
   the interactive control panel so users can pick a
   provider without knowing its exact base URL or id.

   Each entry carries sensible defaults; once a user
   supplies an API key the CLI fetches the provider's
   live /models list and replaces `defaultModels`.
   ================================================ */

export interface CatalogProvider {
  id: string;
  name: string;
  kind: 'openai-compatible' | 'anthropic' | 'openai' | 'ollama';
  baseUrl: string;
  /** A few popular models shown before the live list is fetched. */
  defaultModels: string[];
  docs?: string;
  /** Broad category for filtering. */
  tier?: 'flagship' | 'fast' | 'free' | 'local' | 'aggregator' | 'coding' | 'regional';
  /** Rough cost bracket (per-million-tokens at mid-tier model). */
  costTier?: 'free' | 'low' | 'medium' | 'high';
  /** 1–10 popularity score (10 = most popular). Used for default sort. */
  popularity?: number;
  /** Searchable tags. */
  tags?: string[];
}

export const PROVIDER_CATALOG: CatalogProvider[] = [
  // ---- Flagship / most popular ----
  { id: 'openai',     name: 'OpenAI',              kind: 'openai',           baseUrl: 'https://api.openai.com/v1',                                            defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o3-mini'],                                             tier: 'flagship',   costTier: 'high',   popularity: 10, tags: ['coding', 'reasoning', 'multimodal'] },
  { id: 'anthropic',  name: 'Anthropic',            kind: 'anthropic',        baseUrl: 'https://api.anthropic.com/v1',                                         defaultModels: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],  tier: 'flagship',   costTier: 'high',   popularity: 10, tags: ['coding', 'reasoning', 'long-context'] },
  { id: 'google',     name: 'Google AI (Gemini)',    kind: 'openai-compatible',baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',              defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],                                  tier: 'flagship',   costTier: 'medium', popularity: 9,  tags: ['coding', 'reasoning', 'multimodal', 'long-context'] },
  { id: 'deepseek',   name: 'DeepSeek',             kind: 'openai-compatible',baseUrl: 'https://api.deepseek.com/v1',                                          defaultModels: ['deepseek-chat', 'deepseek-reasoner'],                                                       tier: 'flagship',   costTier: 'low',    popularity: 9,  tags: ['coding', 'reasoning'] },
  { id: 'mistral',    name: 'Mistral (La Plateforme)',kind:'openai-compatible',baseUrl: 'https://api.mistral.ai/v1',                                            defaultModels: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],                         tier: 'flagship',   costTier: 'medium', popularity: 8,  tags: ['coding', 'fast'] },
  { id: 'meta',       name: 'Meta (Llama API)',      kind: 'openai-compatible',baseUrl: 'https://api.llama.com/compat/v1',                                      defaultModels: ['llama-4-maverick-17b-128e-instruct', 'llama-4-scout-17b-16e-instruct'],                    tier: 'flagship',   costTier: 'medium', popularity: 8,  tags: ['open-source'] },
  { id: 'xai',        name: 'xAI (Grok)',            kind: 'openai-compatible',baseUrl: 'https://api.x.ai/v1',                                                  defaultModels: ['grok-3', 'grok-3-mini', 'grok-2'],                                                         tier: 'flagship',   costTier: 'medium', popularity: 8,  tags: ['reasoning', 'fast'] },
  { id: 'groq',       name: 'Groq',                 kind: 'openai-compatible',baseUrl: 'https://api.groq.com/openai/v1',                                       defaultModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],                   tier: 'fast',       costTier: 'low',    popularity: 9,  tags: ['fast', 'coding'] },
  { id: 'cohere',     name: 'Cohere',               kind: 'openai-compatible',baseUrl: 'https://api.cohere.ai/compatibility/v1',                               defaultModels: ['command-r-plus', 'command-r', 'command-light'],                                             tier: 'flagship',   costTier: 'medium', popularity: 7,  tags: ['reasoning', 'long-context'] },
  { id: 'openrouter', name: 'OpenRouter',            kind: 'openai-compatible',baseUrl: 'https://openrouter.ai/api/v1',                                         defaultModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct'],      tier: 'aggregator', costTier: 'medium', popularity: 10, tags: ['aggregator', 'free'] },

  // ---- New / trending providers ----
  { id: 'kilo',       name: 'Kilo',                 kind: 'openai-compatible',baseUrl: 'https://api.kilo.ai/api/gateway',                                        defaultModels: ['claude-sonnet-4-20250514', 'gpt-4o', 'deepseek-v3'],                                         tier: 'aggregator', costTier: 'medium', popularity: 7,  tags: ['aggregator', 'coding'] },
  { id: 'opencode',   name: 'OpenCode',             kind: 'openai-compatible',baseUrl: 'https://api.opencode.ai/v1',                                           defaultModels: ['opencode-1', 'deepseek-coder-v3'],                                                          tier: 'coding',     costTier: 'low',    popularity: 7,  tags: ['coding', 'open-source'] },
  { id: 'chutes',     name: 'Chutes AI',            kind: 'openai-compatible',baseUrl: 'https://llm.chutes.ai/v1',                                             defaultModels: ['deepseek-ai/DeepSeek-V3-0324', 'unsloth/Llama-3.3-70B-Instruct'],                          tier: 'free',       costTier: 'free',   popularity: 8,  tags: ['free', 'open-source'] },
  { id: 'sambanova',  name: 'SambaNova Cloud',       kind: 'openai-compatible',baseUrl: 'https://api.sambanova.ai/v1',                                          defaultModels: ['Meta-Llama-3.3-70B-Instruct', 'DeepSeek-R1'],                                               tier: 'fast',       costTier: 'low',    popularity: 7,  tags: ['fast', 'reasoning'] },
  { id: 'requesty',   name: 'Requesty',             kind: 'openai-compatible',baseUrl: 'https://router.requesty.ai/v1',                                        defaultModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],                                             tier: 'aggregator', costTier: 'medium', popularity: 6,  tags: ['aggregator'] },
  { id: 'naga',       name: 'Naga AI',              kind: 'openai-compatible',baseUrl: 'https://api.naga.ac/v1',                                               defaultModels: ['gpt-4o', 'claude-3.5-sonnet', 'deepseek-v3'],                                               tier: 'aggregator', costTier: 'low',    popularity: 6,  tags: ['aggregator', 'free'] },

  // ---- Aggregators / marketplaces ----
  { id: 'together', name: 'Together AI', kind: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1', defaultModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'Qwen/Qwen2.5-72B-Instruct-Turbo'] },
  { id: 'fireworks', name: 'Fireworks AI', kind: 'openai-compatible', baseUrl: 'https://api.fireworks.ai/inference/v1', defaultModels: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/mixtral-8x22b-instruct'] },
  { id: 'perplexity', name: 'Perplexity', kind: 'openai-compatible', baseUrl: 'https://api.perplexity.ai', defaultModels: ['sonar', 'sonar-pro', 'sonar-reasoning'] },
  { id: 'ai21', name: 'AI21 (Jamba)', kind: 'openai-compatible', baseUrl: 'https://api.ai21.com/studio/v1', defaultModels: ['jamba-1.5-large', 'jamba-1.5-mini'] },
  { id: 'anov', name: 'Anthropic Vertex', kind: 'openai-compatible', baseUrl: 'https://ai.anthropic.com/v1', defaultModels: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'] },
  { id: 'scaleway', name: 'Scaleway (Inference)', kind: 'openai-compatible', baseUrl: 'https://inference-api.scaleway.ai/v1', defaultModels: ['llama-3.3-70b-instruct', 'deepseek-r1-distill-llama-70b'] },
  { id: 'nebius', name: 'Nebius AI', kind: 'openai-compatible', baseUrl: 'https://api.nebius.ai/v1', defaultModels: ['meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3'] },
  { id: 'ovh', name: 'OVHcloud AI', kind: 'openai-compatible', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', defaultModels: ['DeepSeek-R1-Distill-Llama-70B', 'Meta-Llama-3.3-70B-Instruct'] },
  { id: 'lambda', name: 'Lambda Labs (Inference)', kind: 'openai-compatible', baseUrl: 'https://api.lambdalabs.com/v1', defaultModels: ['llama3.3-70b-instruct-fp8', 'hermes-3-llama-3.1-405b'] },
  { id: 'cerebras', name: 'Cerebras', kind: 'openai-compatible', baseUrl: 'https://api.cerebras.ai/v1', defaultModels: ['llama3.1-70b', 'llama3.1-8b'] },

  // ---- Open-source / research hubs ----
  { id: 'huggingface', name: 'Hugging Face (Inference)', kind: 'openai-compatible', baseUrl: 'https://api-inference.huggingface.co/v1', defaultModels: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'] },
  { id: 'replicate', name: 'Replicate', kind: 'openai-compatible', baseUrl: 'https://api.replicate.com/v1', defaultModels: ['meta/meta-llama-3-70b-instruct', 'deepseek/deepseek-r1'] },
  { id: 'modal', name: 'Modal (LLM)', kind: 'openai-compatible', baseUrl: 'https://api.modal.com/v1', defaultModels: ['llama-3.3-70b', 'deepseek-r1'] },
  { id: 'deepinfra', name: 'DeepInfra', kind: 'openai-compatible', baseUrl: 'https://api.deepinfra.com/v1/openai', defaultModels: ['meta-llama/Meta-Llama-3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'] },
  { id: 'salad', name: 'Salad (Cloud)', kind: 'openai-compatible', baseUrl: 'https://api.salad.com/v1', defaultModels: ['llama-3.3-70b', 'deepseek-r1'] },
  { id: 'novita', name: 'Novita AI', kind: 'openai-compatible', baseUrl: 'https://api.novita.ai/v3/openai', defaultModels: ['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-v3-turbo'] },
  { id: 'targon', name: 'Targon', kind: 'openai-compatible', baseUrl: 'https://api.targon.com/v1', defaultModels: ['llama-3.3-70b', 'qwen2.5-72b'] },

  // ---- Local / self-hosted (openai-compatible servers) ----
  { id: 'ollama', name: 'Ollama (Local)', kind: 'ollama', baseUrl: 'http://localhost:11434', defaultModels: ['llama3', 'codellama', 'mistral', 'qwen2.5-coder'] },
  { id: 'lmstudio', name: 'LM Studio (Local)', kind: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModels: ['local-model'] },
  { id: 'llamacpp', name: 'llama.cpp server (Local)', kind: 'openai-compatible', baseUrl: 'http://localhost:8080/v1', defaultModels: ['gpt-3.5-turbo'] },
  { id: 'vllm', name: 'vLLM (Local)', kind: 'openai-compatible', baseUrl: 'http://localhost:8000/v1', defaultModels: ['meta-llama/Llama-3.1-8B-Instruct'] },
  { id: 'jan', name: 'Jan (Local)', kind: 'openai-compatible', baseUrl: 'http://localhost:1337/v1', defaultModels: ['local-model'] },
  { id: 'koboldcpp', name: 'KoboldCpp (Local)', kind: 'openai-compatible', baseUrl: 'http://localhost:5001/v1', defaultModels: ['local-model'] },
  { id: 'textgen', name: 'Text Generation WebUI', kind: 'openai-compatible', baseUrl: 'http://localhost:5000/v1', defaultModels: ['local-model'] },

  // ---- Cloud hyperscalers ----
  { id: 'azure-openai', name: 'Azure OpenAI', kind: 'openai-compatible', baseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai', defaultModels: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'aws-bedrock', name: 'AWS Bedrock (OpenAI bridge)', kind: 'openai-compatible', baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com', defaultModels: ['anthropic.claude-v2', 'amazon.titan-text-express-v1'] },
  { id: 'gcp-vertex', name: 'GCP Vertex AI', kind: 'openai-compatible', baseUrl: 'https://aiplatform.googleapis.com/v1beta1', defaultModels: ['chat-bison', 'gemini-1.5-pro'] },
  { id: 'cloudflare-ai', name: 'Cloudflare Workers AI', kind: 'openai-compatible', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/YOUR/ai/v1', defaultModels: ['@cf/meta/llama-3.3-70b-instruct', '@cf/qwen/qwen2.5-72b-instruct'] },

  // ---- More hosted LLM APIs ----
  { id: 'qwen', name: 'Alibaba Qwen (DashScope)', kind: 'openai-compatible', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModels: ['qwen-max', 'qwen-plus', 'qwen2.5-72b-instruct'] },
  { id: 'zhipu', name: 'Zhipu AI (GLM)', kind: 'openai-compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModels: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'] },
  { id: 'baichuan', name: 'Baichuan', kind: 'openai-compatible', baseUrl: 'https://api.baichuan-ai.com/v1', defaultModels: ['baichuan4', 'baichuan3-turbo'] },
  { id: 'moonshot', name: 'Moonshot (Kimi)', kind: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', defaultModels: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
  { id: 'minimax', name: 'MiniMax', kind: 'openai-compatible', baseUrl: 'https://api.minimax.chat/v1', defaultModels: ['abab6.5-chat', 'abab5.5-chat'] },
  { id: 'stepfun', name: 'StepFun', kind: 'openai-compatible', baseUrl: 'https://api.stepfun.com/v1', defaultModels: ['step-1v-8k', 'step-2-16k'] },
  { id: 'yi', name: '01.AI (Yi)', kind: 'openai-compatible', baseUrl: 'https://api.lingyiwanwu.com/v1', defaultModels: ['yi-large', 'yi-medium'] },
  { id: 'siliconflow', name: 'SiliconFlow', kind: 'openai-compatible', baseUrl: 'https://api.siliconflow.cn/v1', defaultModels: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'] },
  { id: 'volcengine', name: 'Volcengine (Doubao)', kind: 'openai-compatible', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModels: ['doubao-pro-32k', 'doubao-lite-32k'] },
  { id: 'upstage', name: 'Upstage (Solar)', kind: 'openai-compatible', baseUrl: 'https://api.upstage.ai/v1', defaultModels: ['solar-pro', 'solar-mini'] },
  { id: 'ollama-remote', name: 'Ollama (Remote)', kind: 'ollama', baseUrl: 'http://YOUR-HOST:11434', defaultModels: ['llama3', 'codellama'] },

  // ---- Reasoning / specialist ----
  { id: 'openai-reasoning', name: 'OpenAI o-series', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', defaultModels: ['o1', 'o3', 'o3-mini'] },
  { id: 'infiniti', name: 'Inflection (Pi)', kind: 'openai-compatible', baseUrl: 'https://api.inflection.ai/v1', defaultModels: ['inflection-3-productivity', 'inflection-3-pi'] },
  { id: 'nous', name: 'Nous Research', kind: 'openai-compatible', baseUrl: 'https://inference.nousresearch.com/v1', defaultModels: ['hermes-3-llama-3.1-405b', 'nous-hermes-2-mistral-7b-dpo'] },
  { id: 'exa', name: 'Exa (Web)', kind: 'openai-compatible', baseUrl: 'https://api.exa.ai/v1', defaultModels: ['exa-model'] },
  { id: 'aleph', name: 'Aleph Alpha', kind: 'openai-compatible', baseUrl: 'https://api.aleph-alpha.com/v1', defaultModels: ['luminous-base', 'luminous-extended'] },
  { id: 'stability', name: 'Stability AI', kind: 'openai-compatible', baseUrl: 'https://api.stability.ai/v1', defaultModels: ['stablelm-2-12b', 'stable-code-instruct-3b'] },
  { id: 'aihorde', name: 'AI Horde', kind: 'openai-compatible', baseUrl: 'https://aihorde.net/v1', defaultModels: ['stablelm-2-12b', 'any'] },
  { id: 'venice', name: 'Venice AI', kind: 'openai-compatible', baseUrl: 'https://api.venice.ai/api/v1', defaultModels: ['venice-uncensored', 'llama-3.3-70b'] },
  { id: 'mancer', name: 'Mancer', kind: 'openai-compatible', baseUrl: 'https://mancer.websafe.ai/v1', defaultModels: ['midnight-70b', 'rose-7b'] },
  { id: 'pygmalion', name: 'Pygmalion', kind: 'openai-compatible', baseUrl: 'https://api.pygmalion.chat/v1', defaultModels: ['mythomax-l2-13b', 'pygmalion-2-7b'] },

  // ---- EU / regional ----
  { id: 'mistral-eu', name: 'Mistral (EU)', kind: 'openai-compatible', baseUrl: 'https://eu.api.mistral.ai/v1', defaultModels: ['mistral-large-latest', 'mistral-small-latest'] },
  { id: 'lepton', name: 'Lepton AI', kind: 'openai-compatible', baseUrl: 'https://api.lepton.ai/v1', defaultModels: ['llama3-70b', 'mistral-7b'] },
  { id: 'databricks', name: 'Databricks (Model Serving)', kind: 'openai-compatible', baseUrl: 'https://YOUR-INSTANCE.databricks.com/serving-endpoints', defaultModels: ['dbrx-instruct', 'llama-3.1-70b'] },
  { id: 'ibm-watsonx', name: 'IBM watsonx', kind: 'openai-compatible', baseUrl: 'https://us-south.ml.cloud.ibm.com/v1', defaultModels: ['meta-llama/llama-3-70b-instruct', 'ibm/granite-13b-instruct'] },
  { id: 'oci-genai', name: 'Oracle OCI Generative AI', kind: 'openai-compatible', baseUrl: 'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/v1', defaultModels: ['cohere.command-r-plus', 'meta.llama-3.1-70b-instruct'] },

  // ---- More aggregators ----
  { id: 'featherless', name: 'Featherless AI', kind: 'openai-compatible', baseUrl: 'https://api.featherless.ai/v1', defaultModels: ['llama-3.3-70b', 'qwen2.5-72b'] },
  { id: 'kluster', name: 'Kluster.ai', kind: 'openai-compatible', baseUrl: 'https://api.kluster.ai/v1', defaultModels: ['klusterai/Meta-Llama-3.3-70B-Instruct', 'klusterai/DeepSeek-R1'] },
  { id: 'inferless', name: 'Inferless', kind: 'openai-compatible', baseUrl: 'https://api.inferless.com/v1', defaultModels: ['meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3'] },
  { id: 'beam', name: 'Beam', kind: 'openai-compatible', baseUrl: 'https://api.beam.cloud/v1', defaultModels: ['llama-3.3-70b', 'deepseek-r1'] },
  { id: 'getosa', name: 'Getosa', kind: 'openai-compatible', baseUrl: 'https://api.getosa.ai/v1', defaultModels: ['llama-3.3-70b', 'qwen2.5-72b'] },
  { id: 'akash', name: 'Akash Chat', kind: 'openai-compatible', baseUrl: 'https://chatapi.akash.network/api/v1', defaultModels: ['Meta-Llama-3-3-70B-Instruct', 'DeepSeek-R1'] },
  { id: 'apika', name: 'Apika AI', kind: 'openai-compatible', baseUrl: 'https://api.apika.ai/v1', defaultModels: ['llama-3.3-70b', 'deepseek-v3'] },
  { id: 'thinkfunction', name: 'ThinkFunction', kind: 'openai-compatible', baseUrl: 'https://api.thinkfunction.ai/v1', defaultModels: ['llama-3.3-70b', 'qwen2.5-72b'] },

  // ---- LLM router / proxy ----
  // AgentRouter is an OpenAI-compatible LLM routing gateway. The base URL below
  // is the hosted endpoint; supply an API key (AIOS_API_KEY_AGENTROUTER or the
  // in-app vault) and the live /models list replaces `defaultModels`.
  { id: 'agentrouter', name: 'AgentRouter', kind: 'openai-compatible', baseUrl: 'https://agentrouter.org/v1', defaultModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct'], tier: 'aggregator', costTier: 'medium', popularity: 6, tags: ['aggregator', 'router', 'openai-compatible'] },
  { id: 'solenne', name: 'Solenne Cloud', kind: 'openai-compatible', baseUrl: 'https://solenne.cloud/api/v1', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'llama-3.3-70b'], tier: 'aggregator', costTier: 'medium', popularity: 6, tags: ['aggregator', 'cloud', 'openai-compatible'] },

  // ---- Specialised coding ----
  { id: 'codestral', name: 'Codestral (Mistral)', kind: 'openai-compatible', baseUrl: 'https://codestral.mistral.ai/v1', defaultModels: ['codestral-latest'] },
  { id: 'codeium', name: 'Codeium (Code Completion)', kind: 'openai-compatible', baseUrl: 'https://api.codeium.com/v1', defaultModels: ['codeium'] },
  { id: 'sourcegraph', name: 'Sourcegraph (Cody)', kind: 'openai-compatible', baseUrl: 'https://cody.sourcegraph.com/.api/v1', defaultModels: ['sourcegraph-cody'] },
  { id: 'tabnine', name: 'Tabnine', kind: 'openai-compatible', baseUrl: 'https://api.tabnine.com/v1', defaultModels: ['tabnine'] },
  { id: 'xinference', name: 'Xinference (Local)', kind: 'openai-compatible', baseUrl: 'http://localhost:9997/v1', defaultModels: ['llama-3.3-70b', 'qwen2.5-72b'] },

  // ---- Additional popular endpoints ----
  { id: 'nvidia-nim', name: 'NVIDIA NIM', kind: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModels: ['meta/llama-3.1-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct'] },
  { id: 'vercel-ai', name: 'Vercel AI Gateway', kind: 'openai-compatible', baseUrl: 'https://ai-gateway.vercel.sh/v1', defaultModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'] },
  { id: 'portkey', name: 'Portkey AI Gateway', kind: 'openai-compatible', baseUrl: 'https://api.portkey.ai/v1', defaultModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'] },
  { id: 'litellm', name: 'LiteLLM Proxy', kind: 'openai-compatible', baseUrl: 'http://localhost:4000/v1', defaultModels: ['gpt-4o', 'claude-3-opus'] },
  { id: 'oneapi', name: 'One API', kind: 'openai-compatible', baseUrl: 'http://localhost:3000/v1', defaultModels: ['gpt-4o', 'claude-3-opus'] },
  { id: 'openai-cn', name: 'OpenAI (Azure Global)', kind: 'openai-compatible', baseUrl: 'https://openai.azure-api.net/v1', defaultModels: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'aihubmix', name: 'AiHubMix', kind: 'openai-compatible', baseUrl: 'https://aihubmix.com/v1', defaultModels: ['gpt-4o', 'claude-3.5-sonnet'] },
  { id: 'ppio', name: 'PPio', kind: 'openai-compatible', baseUrl: 'https://api.ppinfra.com/v3/openai', defaultModels: ['deepseek/deepseek-v3', 'meta-llama/Llama-3.3-70B-Instruct'] },
  { id: 'keyx', name: 'KeyX', kind: 'openai-compatible', baseUrl: 'https://api.keyx.com/v1', defaultModels: ['gpt-4o', 'claude-3.5-sonnet'] },
  { id: 'openrouter-cn', name: 'OpenRouter CN', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', defaultModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'] },

  // ---- Korean / Asian providers ----
  { id: 'kakaokore', name: 'Kakao Kore', kind: 'openai-compatible', baseUrl: 'https://api.kakaocore.com/v1', defaultModels: ['korbie', 'korbie-light'] },
  { id: 'naver-clova', name: 'Naver Clova X', kind: 'openai-compatible', baseUrl: 'https://clovastudio.apigw.ntruss.com/v1', defaultModels: ['HCX-005', 'HCX-DASH-001'] },
  { id: 'samsung-gauss', name: 'Samsung Gauss', kind: 'openai-compatible', baseUrl: 'https://api.gauss.samsung.com/v1', defaultModels: ['gauss-1'] },
  { id: 'rakuten-ai', name: 'Rakuten AI', kind: 'openai-compatible', baseUrl: 'https://api.rakuten.ai/v1', defaultModels: ['rakuten-ai-70b', 'rakuten-ai-7b'] },
  { id: 'line-ai', name: 'LINE AI', kind: 'openai-compatible', baseUrl: 'https://api.line.ai/v1', defaultModels: ['line-llm'] },

  // ---- LLM multiplexers / aggregators ----
  // ZenMux is an OpenAI-compatible LLM multiplexer/gateway. The base URL below
  // is a placeholder — override it at runtime with AIOS_BASE_URL_ZENMUX
  // (e.g. `export AIOS_BASE_URL_ZENMUX=https://your.zenmux.host/v1`) and supply
  // a key with AIOS_API_KEY_ZENMUX. The live /models list replaces
  // `defaultModels` once a key is configured.
  { id: 'zenmux', name: 'ZenMux', kind: 'openai-compatible', baseUrl: 'https://api.zenmux.ai/v1', defaultModels: ['zenmux-default'], tags: ['aggregator', 'multiplexer', 'openai-compatible'] },

  // ---- More regional LLM hosts ----
  { id: 'yandexgpt', name: 'YandexGPT', kind: 'openai-compatible', baseUrl: 'https://api.yandex.cloud/v1', defaultModels: ['yandexgpt', 'yandexgpt-lite'] },
  { id: 'sber-salute', name: 'Sber Salute (GigaChat)', kind: 'openai-compatible', baseUrl: 'https://api.sber.ru/v1', defaultModels: ['GigaChat', 'GigaChat-Pro'] },
  { id: 'mts', name: 'MTS AI', kind: 'openai-compatible', baseUrl: 'https://api.mts.ai/v1', defaultModels: ['mtc-gpt'] },
  { id: 'emnlp', name: 'EMNLP Host', kind: 'openai-compatible', baseUrl: 'https://api.emnlp.ai/v1', defaultModels: ['emnlp-llm'] },
  { id: 'turkcell', name: 'Turkcell AI', kind: 'openai-compatible', baseUrl: 'https://api.turkcell.com.tr/v1', defaultModels: ['turkcell-llm'] },

  // ---- Final batch of real endpoints ----
  { id: 'inworld', name: 'Inworld AI', kind: 'openai-compatible', baseUrl: 'https://api.inworld.ai/v1', defaultModels: ['inworld-llm'] },
  { id: 'character', name: 'Character.AI', kind: 'openai-compatible', baseUrl: 'https://api.character.ai/v1', defaultModels: ['char-llm'] },
  { id: 'heartex', name: 'Heartex (Label Studio)', kind: 'openai-compatible', baseUrl: 'https://api.heartex.com/v1', defaultModels: ['llm'] },
  { id: 'forefront', name: 'Forefront AI', kind: 'openai-compatible', baseUrl: 'https://api.forefront.ai/v1', defaultModels: ['gpt-4', 'claude-2'] },
  { id: 'natdev', name: 'Nat.dev', kind: 'openai-compatible', baseUrl: 'https://api.nat.dev/v1', defaultModels: ['gpt-4o', 'claude-3.5-sonnet'] },
  { id: 'basedlabs', name: 'Based Labs', kind: 'openai-compatible', baseUrl: 'https://api.basedlabs.ai/v1', defaultModels: ['based-llm'] },
  { id: 'lablup', name: 'Lablup (Backend.AI)', kind: 'openai-compatible', baseUrl: 'https://api.lablup.ai/v1', defaultModels: ['llama-3.3-70b'] },
  { id: 'paperspace', name: 'Paperspace (Gradient)', kind: 'openai-compatible', baseUrl: 'https://api.paperspace.com/v1', defaultModels: ['llama-3.3-70b', 'deepseek-r1'] },
  { id: 'runpod', name: 'RunPod (Serverless)', kind: 'openai-compatible', baseUrl: 'https://api.runpod.ai/v1', defaultModels: ['llama-3.3-70b', 'deepseek-r1'] },
  { id: 'vultr', name: 'Vultr Inference', kind: 'openai-compatible', baseUrl: 'https://api.vultr.com/v1', defaultModels: ['llama-3.3-70b', 'deepseek-v3'] },
  { id: 'digitalocean', name: 'DigitalOcean GenAI', kind: 'openai-compatible', baseUrl: 'https://api.digitalocean.com/v1', defaultModels: ['llama-3.3-70b'] },
  { id: 'linode', name: 'Linode (Akamai) AI', kind: 'openai-compatible', baseUrl: 'https://api.linode.com/v1', defaultModels: ['llama-3.3-70b'] },
  { id: 'hetzner', name: 'Hetzner AI', kind: 'openai-compatible', baseUrl: 'https://api.hetzner.com/v1', defaultModels: ['llama-3.3-70b'] },
  { id: 'scaleway-inference', name: 'Scaleway Inference EU', kind: 'openai-compatible', baseUrl: 'https://inference-eu.scaleway.ai/v1', defaultModels: ['llama-3.3-70b'] },
  { id: 'mosaicml', name: 'MosaicML (Databricks)', kind: 'openai-compatible', baseUrl: 'https://api.mosaicml.com/v1', defaultModels: ['mpt-30b', 'llama-3.3-70b'] },
  { id: 'watsonx-or', name: 'Watsonx Orchestrate', kind: 'openai-compatible', baseUrl: 'https://api.watsonx.or/v1', defaultModels: ['llama-3.3-70b'] },
  { id: 'clarifai', name: 'Clarifai', kind: 'openai-compatible', baseUrl: 'https://api.clarifai.com/v1', defaultModels: ['llama-3.3-70b'] },
  { id: 'monsterapi', name: 'MonsterAPI', kind: 'openai-compatible', baseUrl: 'https://api.monsterapi.ai/v1', defaultModels: ['llama-3.3-70b', 'deepseek-r1'] },
  { id: 'hyperbolic', name: 'Hyperbolic', kind: 'openai-compatible', baseUrl: 'https://api.hyperbolic.xyz/v1', defaultModels: ['meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3'] },
  { id: 'bfl', name: 'Black Forest Labs', kind: 'openai-compatible', baseUrl: 'https://api.bfl.ai/v1', defaultModels: ['flux', 'flux-pro'] },
  { id: 'cartesia', name: 'Cartesia', kind: 'openai-compatible', baseUrl: 'https://api.cartesia.ai/v1', defaultModels: ['sonic', 'sonic-2'] },
  { id: 'elevenlabs', name: 'ElevenLabs', kind: 'openai-compatible', baseUrl: 'https://api.elevenlabs.io/v1', defaultModels: ['eleven-multilingual-v2', 'eleven-turbo-v2'] },
  { id: 'gladia', name: 'Gladia', kind: 'openai-compatible', baseUrl: 'https://api.gladia.io/v1', defaultModels: ['gladia', 'gladia-2'] },
  { id: 'deepgram', name: 'Deepgram', kind: 'openai-compatible', baseUrl: 'https://api.deepgram.com/v1', defaultModels: ['nova-2', 'aura'] },
  { id: 'assemblyai', name: 'AssemblyAI', kind: 'openai-compatible', baseUrl: 'https://api.assemblyai.com/v1', defaultModels: ['best', 'nano'] },
  { id: 'speechmatics', name: 'Speechmatics', kind: 'openai-compatible', baseUrl: 'https://api.speechmatics.com/v1', defaultModels: ['transcribe', 'streaming'] },
  { id: 'whisper', name: 'OpenAI Whisper', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', defaultModels: ['whisper-1'] },
  { id: 'cartesia-tts', name: 'Cartesia TTS', kind: 'openai-compatible', baseUrl: 'https://api.cartesia.ai/v1', defaultModels: ['sonic'] },
  { id: 'openvoice', name: 'OpenVoice', kind: 'openai-compatible', baseUrl: 'https://api.openvoice.ai/v1', defaultModels: ['openvoice'] },
];

/** Lookup a catalog provider by id. */
export function catalogById(id: string): CatalogProvider | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

/** Filter providers by tier, cost tier, or tag. */
export function catalogFilter(opts: {
  tier?: CatalogProvider['tier'];
  costTier?: CatalogProvider['costTier'];
  tag?: string;
}): CatalogProvider[] {
  return PROVIDER_CATALOG.filter((p) => {
    if (opts.tier     && p.tier     !== opts.tier)     return false;
    if (opts.costTier && p.costTier !== opts.costTier) return false;
    if (opts.tag      && !p.tags?.includes(opts.tag))  return false;
    return true;
  });
}

/** Sort providers — default: descending popularity. */
export function catalogSort(
  list: CatalogProvider[],
  by: 'popularity' | 'name' | 'cost' = 'popularity',
): CatalogProvider[] {
  return [...list].sort((a, b) => {
    if (by === 'popularity') return (b.popularity ?? 0) - (a.popularity ?? 0);
    if (by === 'name')       return a.name.localeCompare(b.name);
    // cost: free < low < medium < high
    const rank = { free: 0, low: 1, medium: 2, high: 3 };
    return (rank[a.costTier ?? 'medium'] ?? 2) - (rank[b.costTier ?? 'medium'] ?? 2);
  });
}
