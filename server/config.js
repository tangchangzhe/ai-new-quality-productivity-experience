import dotenv from "dotenv";

dotenv.config();

if (!process.env.AI_GATEWAY_API_KEY && process.env.VERCEL_GATEWAY_API_KEY) {
  process.env.AI_GATEWAY_API_KEY = process.env.VERCEL_GATEWAY_API_KEY;
}

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

export const config = {
  port: numberFromEnv("PORT", 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
  ai: {
    mock:
      process.env.AI_MOCK === "true" ||
      (!process.env.AI_GATEWAY_API_KEY && process.env.NODE_ENV !== "production"),
    temperature: numberFromEnv("AI_TEMPERATURE", 0.7),
    maxOutputTokens: numberFromEnv("AI_MAX_OUTPUT_TOKENS", 500),
    totalTimeoutMs: numberFromEnv("AI_TOTAL_TIMEOUT_MS", 90000),
    chunkTimeoutMs: numberFromEnv("AI_CHUNK_TIMEOUT_MS", 20000)
  }
};
