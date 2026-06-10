import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.resolve(__dirname, "../logs");
const logPath = path.join(logDir, "app.log");

function serializeError(error) {
  if (!error) return "";
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function logError(scope, error, extra = {}) {
  const payload = {
    time: new Date().toISOString(),
    level: "error",
    scope,
    message: error?.message || String(error),
    stack: serializeError(error),
    ...extra
  };

  console.error(`[${scope}]`, error);

  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch (writeError) {
    console.error("[logger]", writeError);
  }
}
