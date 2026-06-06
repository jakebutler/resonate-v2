export type ModelOption = { label: string; id: string };

export const MODELS: ModelOption[] = [
  { label: "Opus 4.6",      id: "claude-opus-4.6"   },
  { label: "Sonnet 4.6",    id: "claude-sonnet-4.6" },
  { label: "GPT-5.2",       id: "gpt-5.2"           },
  { label: "GPT-5.2 mini",  id: "openai/gpt-5-mini" },
  { label: "GPT-5 nano",    id: "openai/gpt-5-nano" },
  { label: "GLM-4.7",       id: "glm-4.7"           },
];

export const CLAUDE_MODELS = MODELS.filter((model) => model.id.startsWith("claude-"));

export const MODEL_IDS = new Set(MODELS.map((m) => m.id));

export const DEFAULT_MODEL = MODELS[1]; // Sonnet 4.6
