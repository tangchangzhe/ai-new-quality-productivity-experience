import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import { config } from "./config.js";
import { getEvaluatorModelId, getResonanceModelId } from "./models.js";
import { buildEvaluationPrompt, buildModelPrompt, buildResonancePrompt } from "./prompts.js";
import { mockEvaluation, mockResonance, mockTextStream } from "./mock.js";

const evaluationSchema = z.object({
  level: z.number().int().min(1).max(3),
  score: z.number().int().min(1).max(100),
  comment: z.string().min(4).max(80)
});

const resonanceSchema = z.object({
  direction: z.string().min(2).max(40),
  similar_ids: z.array(z.number().int().positive()).max(3),
  total_same_direction: z.number().int().min(0)
});

export function shouldUseMockAI() {
  return config.ai.mock;
}

export async function* streamModelIdea({ content, modelId, modelKey }) {
  if (shouldUseMockAI()) {
    yield* mockTextStream(content, modelKey);
    return;
  }

  const result = streamText({
    model: modelId,
    prompt: buildModelPrompt(content),
    temperature: config.ai.temperature,
    maxOutputTokens: config.ai.maxOutputTokens,
    timeout: {
      totalMs: config.ai.totalTimeoutMs,
      chunkMs: config.ai.chunkTimeoutMs
    },
    onError({ error }) {
      console.error("AI stream error", error);
    }
  });

  for await (const textPart of result.textStream) {
    yield textPart;
  }
}

export async function evaluateIdea(content) {
  if (shouldUseMockAI()) {
    return mockEvaluation(content);
  }

  const { output } = await generateText({
    model: getEvaluatorModelId(),
    output: Output.object({ schema: evaluationSchema }),
    prompt: buildEvaluationPrompt(content),
    temperature: 0.2,
    maxOutputTokens: 500,
    timeout: { totalMs: config.ai.totalTimeoutMs }
  });

  return output;
}

export async function findResonance(content, historyIdeas) {
  if (historyIdeas.length < 3) {
    return {
      direction: "",
      similar_ids: [],
      total_same_direction: 0
    };
  }

  if (shouldUseMockAI()) {
    return mockResonance(content, historyIdeas);
  }

  const { output } = await generateText({
    model: getResonanceModelId(),
    output: Output.object({ schema: resonanceSchema }),
    prompt: buildResonancePrompt(content, historyIdeas),
    temperature: 0.2,
    maxOutputTokens: 500,
    timeout: { totalMs: config.ai.totalTimeoutMs }
  });

  return output;
}
