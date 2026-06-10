import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { evaluateIdea, findResonance, shouldUseMockAI, streamModelIdea } from "./ai.js";
import {
  computePercentile,
  createModelRuns,
  getEvaluationByIdea,
  getIdeaById,
  getModelRunBySlot,
  getModelRuns,
  getRecentIdeas,
  getStats,
  getVoteDistribution,
  insertIdea,
  markIdeaComplete,
  recordVote,
  saveEvaluation,
  updateModelRun
} from "./db.js";
import { shuffleModels, slotLabels } from "./models.js";
import { mockEvaluation, mockResonance } from "./mock.js";
import { logError } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../dist");
const app = express();
const activeModelRuns = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

function normalizeIdeaId(value) {
  const ideaId = Number(value);
  return Number.isInteger(ideaId) && ideaId > 0 ? ideaId : null;
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function serializeRunsForReveal(runs) {
  return runs.map((run) => ({
    slot: run.slot,
    label: slotLabels[run.slot] || run.slot,
    model: run.model_key,
    model_id: run.model_id,
    display_name: run.display_name,
    status: run.status
  }));
}

function hasUsableResponse(run) {
  return run.status === "done" && String(run.response || "").trim().length >= 80;
}

async function* collectModelText({ content, modelId, modelKey, ideaId, slot, attempt }) {
  let text = "";
  for await (const chunk of streamModelIdea({ content, modelId, modelKey })) {
    text += chunk;
    yield { chunk, text };
  }

  if (text.trim().length < 80) {
    logError("short_model_output", new Error("模型输出过短或中断"), {
      ideaId,
      slot,
      modelKey,
      modelId,
      attempt,
      length: text.trim().length,
      preview: text.trim().slice(0, 120)
    });
    throw new Error("模型输出过短或中断");
  }
}

function broadcast(subscribers, event, data) {
  for (const subscriber of subscribers) {
    if (!subscriber.closed) {
      sendSse(subscriber.res, event, data);
    }
  }
}

function subscribeToRun(key, subscriber) {
  const active = activeModelRuns.get(key);
  if (active) {
    active.subscribers.add(subscriber);
    if (active.responseText) {
      sendSse(subscriber.res, "chunk", {
        model: active.slot,
        text: active.responseText
      });
    }
  }
  return active;
}

function startModelRun({ idea, run, ideaId, subscriber }) {
  const key = `${ideaId}:${run.slot}`;
  const existing = subscribeToRun(key, subscriber);
  if (existing) {
    return existing.promise;
  }

  const active = {
    slot: run.slot,
    responseText: "",
    subscribers: new Set([subscriber])
  };

  active.promise = (async () => {
    try {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let attemptText = "";
        try {
          for await (const part of collectModelText({
            content: idea.content,
            modelId: run.model_id,
            modelKey: run.model_key,
            ideaId,
            slot: run.slot,
            attempt
          })) {
            attemptText = part.text;
            if (attempt === 1) {
              active.responseText += part.chunk;
              broadcast(active.subscribers, "chunk", { model: run.slot, text: part.chunk });
            }
          }

          if (attempt > 1) {
            active.responseText = attemptText;
            broadcast(active.subscribers, "replace", { model: run.slot, text: attemptText });
          }
          break;
        } catch (error) {
          if (attempt === 2) {
            throw error;
          }
          active.responseText = "";
        }
      }

      await updateModelRun({
        ideaId,
        slot: run.slot,
        response: active.responseText,
        status: "done"
      });
    } catch (error) {
      const message = error?.message || "该模型暂时无法响应";
      logError("stream_model", error, {
        ideaId,
        slot: run.slot,
        modelKey: run.model_key,
        modelId: run.model_id
      });
      await updateModelRun({
        ideaId,
        slot: run.slot,
        response: active.responseText,
        status: "error",
        errorMessage: message.slice(0, 500)
      });
      broadcast(active.subscribers, "model_error", { model: run.slot, message });
    } finally {
      broadcast(active.subscribers, "done", { model: run.slot });
      activeModelRuns.delete(key);
    }
  })();

  activeModelRuns.set(key, active);
  return active.promise;
}

async function ensureRuns(ideaId) {
  let runs = await getModelRuns(ideaId);
  if (runs.length === 4) {
    return runs;
  }

  await createModelRuns(ideaId, shuffleModels());
  runs = await getModelRuns(ideaId);
  return runs;
}

function levelName(level) {
  return {
    1: "工具替代",
    2: "流程重构",
    3: "能力涌现"
  }[level];
}

function clampEvaluation(evaluation) {
  return {
    level: Math.max(1, Math.min(3, Number(evaluation.level) || 1)),
    score: Math.max(1, Math.min(100, Number(evaluation.score) || 1)),
    comment: String(evaluation.comment || "方向明确，但仍需补充落地路径").slice(0, 80)
  };
}

function selectSimilarIdeas(resonance, historyIdeas) {
  const byLocalIndex = new Map(historyIdeas.map((idea) => [idea.localIndex, idea]));
  const selected = (resonance.similar_ids || [])
    .map((id) => byLocalIndex.get(id))
    .filter(Boolean)
    .slice(0, 3);
  const fallback = historyIdeas.slice(0, 3);
  return (selected.length ? selected : fallback).map((idea) => idea.content);
}

app.get("/api/health", async (_req, res) => {
  try {
    const stats = await getStats();
    res.json({
      ok: true,
      ai_mock: shouldUseMockAI(),
      stats
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/ideas", async (req, res, next) => {
  try {
    const sessionId = String(req.body.session_id || "").trim();
    const content = String(req.body.content || "").trim();
    const tag = req.body.tag ? String(req.body.tag).slice(0, 20) : null;

    if (!sessionId || sessionId.length > 64) {
      return res.status(400).json({ error: "session_id is required" });
    }

    if (content.length < 10 || content.length > 1000) {
      return res.status(400).json({ error: "想法需要 10 到 1000 字" });
    }

    const ideaId = await insertIdea({ sessionId, content, tag });
    res.json({ idea_id: ideaId });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stream-responses", async (req, res) => {
  const ideaId = normalizeIdeaId(req.query.idea_id);
  if (!ideaId) {
    return res.status(400).json({ error: "idea_id is required" });
  }

  const idea = await getIdeaById(ideaId);
  if (!idea) {
    return res.status(404).json({ error: "idea not found" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  try {
    const runs = await ensureRuns(ideaId);
    sendSse(res, "meta", {
      slots: runs.map((run) => ({
        slot: run.slot,
        label: slotLabels[run.slot] || run.slot
      }))
    });

    const subscriber = { res, closed: false };
    const pendingPromises = [];
    req.on("close", () => {
      subscriber.closed = true;
      for (const active of activeModelRuns.values()) {
        active.subscribers.delete(subscriber);
      }
    });

    for (const run of runs) {
      if (hasUsableResponse(run)) {
        sendSse(res, "chunk", { model: run.slot, text: run.response });
        sendSse(res, "done", { model: run.slot });
        continue;
      }

      if (run.status === "error") {
        sendSse(res, "model_error", {
          model: run.slot,
          message: run.error_message || "该模型暂时无法响应"
        });
        sendSse(res, "done", { model: run.slot });
        continue;
      }

      if (run.status === "done") {
        sendSse(res, "model_error", {
          model: run.slot,
          message: "该模型输出不完整"
        });
        sendSse(res, "done", { model: run.slot });
        continue;
      }

      pendingPromises.push(startModelRun({ idea, run, ideaId, subscriber }));
    }

    await Promise.allSettled(pendingPromises);

    if (!closed) {
      sendSse(res, "all_done", {});
      res.end();
    }
  } catch (error) {
    if (!closed) {
      sendSse(res, "fatal", { message: error.message });
      res.end();
    }
  }
});

app.post("/api/votes", async (req, res, next) => {
  try {
    const ideaId = normalizeIdeaId(req.body.idea_id);
    const sessionId = String(req.body.session_id || "").trim();
    const slot = String(req.body.slot || req.body.voted_model || "").trim();

    if (!ideaId || !sessionId || !slot) {
      return res.status(400).json({ error: "idea_id, session_id and slot are required" });
    }

    const run = await getModelRunBySlot(ideaId, slot);
    if (!run) {
      return res.status(400).json({ error: "unknown model slot" });
    }

    if (run.status === "error") {
      return res.status(400).json({ error: "failed model cannot be selected" });
    }

    if (!hasUsableResponse(run)) {
      return res.status(400).json({ error: "model response is incomplete" });
    }

    await recordVote({
      ideaId,
      sessionId,
      votedModel: run.model_key,
      votedModelName: run.display_name
    });

    const [distribution, runs] = await Promise.all([
      getVoteDistribution({ includeIdeaId: ideaId }),
      getModelRuns(ideaId)
    ]);

    res.json({
      ok: true,
      voted_model: run.model_key,
      distribution,
      reveal: serializeRunsForReveal(runs)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/results", async (req, res, next) => {
  try {
    const ideaId = normalizeIdeaId(req.query.idea_id);
    if (!ideaId) {
      return res.status(400).json({ error: "idea_id is required" });
    }

    const idea = await getIdeaById(ideaId);
    if (!idea) {
      return res.status(404).json({ error: "idea not found" });
    }

    const historyIdeas = await getRecentIdeas({
      excludeIdeaId: idea.id,
      excludeSessionId: idea.session_id,
      limit: 50
    });
    const existingEvaluation = await getEvaluationByIdea(ideaId);

    const [resonanceResult, evaluationResult] = await Promise.allSettled([
      findResonance(idea.content, historyIdeas),
      existingEvaluation ? Promise.resolve(existingEvaluation) : evaluateIdea(idea.content)
    ]);

    let resonance =
      resonanceResult.status === "fulfilled"
        ? resonanceResult.value
        : mockResonance(idea.content, historyIdeas);
    if (historyIdeas.length < 3) {
      resonance = { direction: "", similar_ids: [], total_same_direction: 0 };
    }

    let evaluation =
      evaluationResult.status === "fulfilled"
        ? clampEvaluation(evaluationResult.value)
        : mockEvaluation(idea.content);

    let percentile = existingEvaluation?.percentile ?? null;
    if (!existingEvaluation) {
      percentile = await computePercentile(evaluation.score);
      await saveEvaluation({
        ideaId,
        sessionId: idea.session_id,
        ...evaluation,
        percentile
      });
    }
    await markIdeaComplete(ideaId);

    res.json({
      resonance: {
        direction: resonance.direction,
        total_same_direction: resonance.total_same_direction || 0,
        similar_ideas: selectSimilarIdeas(resonance, historyIdeas)
      },
      evaluation: {
        level: evaluation.level,
        level_name: levelName(evaluation.level),
        score: evaluation.score,
        comment: evaluation.comment,
        percentile
      }
    });
  } catch (error) {
    next(error);
  }
});

if (fs.existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      etag: false,
      index: false,
      lastModified: false,
      maxAge: 0,
      setHeaders(res) {
        res.setHeader("Cache-Control", "no-store");
      }
    })
  );
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((error, req, res, _next) => {
  logError("http", error, {
    method: req.method,
    path: req.path
  });
  res.status(500).json({
    error: "server_error",
    message: process.env.NODE_ENV === "production" ? "服务暂时不可用" : error.message
  });
});

app.listen(config.port, () => {
  console.log(`AI productivity experience listening on http://localhost:${config.port}`);
  if (shouldUseMockAI()) {
    console.log("AI_MOCK mode is active.");
  }
});
