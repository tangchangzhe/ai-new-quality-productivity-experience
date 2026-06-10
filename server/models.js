export const modelDefinitions = [
  {
    key: "deepseek",
    env: "MODEL_DEEPSEEK",
    defaultModelId: "deepseek/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro"
  },
  {
    key: "gemini",
    env: "MODEL_GEMINI",
    defaultModelId: "google/gemini-3.1-pro",
    displayName: "Gemini 3.1 Pro"
  },
  {
    key: "gpt",
    env: "MODEL_GPT",
    defaultModelId: "openai/gpt-5.5",
    displayName: "GPT-5.5"
  },
  {
    key: "claude",
    env: "MODEL_CLAUDE",
    defaultModelId: "anthropic/claude-opus-4.6",
    displayName: "Claude Opus 4.6"
  }
];

export const slotLabels = {
  model_1: "模型 ①",
  model_2: "模型 ②",
  model_3: "模型 ③",
  model_4: "模型 ④"
};

export function getConfiguredModels() {
  return modelDefinitions.map((model) => ({
    ...model,
    modelId: process.env[model.env] || model.defaultModelId
  }));
}

export function getEvaluatorModelId() {
  return (
    process.env.MODEL_EVALUATOR ||
    process.env.MODEL_DEEPSEEK ||
    "deepseek/deepseek-v4-pro"
  );
}

export function getResonanceModelId() {
  return (
    process.env.MODEL_RESONANCE ||
    process.env.MODEL_DEEPSEEK ||
    "deepseek/deepseek-v4-pro"
  );
}

export function shuffleModels() {
  const models = [...getConfiguredModels()];
  for (let index = models.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [models[index], models[swapIndex]] = [models[swapIndex], models[index]];
  }

  return models.map((model, index) => ({
    slot: `model_${index + 1}`,
    label: slotLabels[`model_${index + 1}`],
    modelKey: model.key,
    modelId: model.modelId,
    displayName: model.displayName
  }));
}

export function allModelKeys() {
  return modelDefinitions.map((model) => model.key);
}

export function displayNameForModelKey(key) {
  return modelDefinitions.find((model) => model.key === key)?.displayName || key;
}
