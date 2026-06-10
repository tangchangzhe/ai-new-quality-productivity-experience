import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { allModelKeys, displayNameForModelKey } from "./models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pool;

function databaseConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
      timezone: "+08:00"
    };
  }

  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "ai_productivity",
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    timezone: "+08:00"
  };
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(databaseConfig());
  }
  return pool;
}

export async function runSchema() {
  const schemaPath = path.resolve(__dirname, "../db/schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  const connection = await getPool().getConnection();
  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
  } finally {
    connection.release();
  }
}

export async function insertIdea({ sessionId, content, tag = null, seeded = 0 }) {
  const [result] = await getPool().execute(
    "INSERT INTO ideas (session_id, content, tag, seeded) VALUES (?, ?, ?, ?)",
    [sessionId, content, tag, seeded]
  );
  return result.insertId;
}

export async function getIdeaById(ideaId) {
  const [rows] = await getPool().execute("SELECT * FROM ideas WHERE id = ? LIMIT 1", [
    ideaId
  ]);
  return rows[0] || null;
}

export async function getRecentIdeas({ excludeIdeaId, excludeSessionId, limit = 50 }) {
  const [rows] = await getPool().execute(
    `SELECT id, session_id, content, tag, created_at
     FROM ideas
     WHERE id <> ? AND session_id <> ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [excludeIdeaId, excludeSessionId, limit]
  );
  return rows.map((row, index) => ({ ...row, localIndex: index + 1 }));
}

export async function createModelRuns(ideaId, assignments) {
  const values = assignments.map((assignment) => [
    ideaId,
    assignment.slot,
    assignment.modelKey,
    assignment.modelId,
    assignment.displayName
  ]);

  await getPool().query(
    `INSERT INTO model_runs (idea_id, slot, model_key, model_id, display_name)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       model_key = VALUES(model_key),
       model_id = VALUES(model_id),
       display_name = VALUES(display_name)`,
    [values]
  );
}

export async function getModelRuns(ideaId) {
  const [rows] = await getPool().execute(
    `SELECT *
     FROM model_runs
     WHERE idea_id = ?
     ORDER BY slot ASC`,
    [ideaId]
  );
  return rows;
}

export async function getModelRunBySlot(ideaId, slot) {
  const [rows] = await getPool().execute(
    "SELECT * FROM model_runs WHERE idea_id = ? AND slot = ? LIMIT 1",
    [ideaId, slot]
  );
  return rows[0] || null;
}

export async function updateModelRun({ ideaId, slot, response, status, errorMessage = null }) {
  await getPool().execute(
    `UPDATE model_runs
     SET response = ?, status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
     WHERE idea_id = ? AND slot = ?`,
    [response, status, errorMessage, ideaId, slot]
  );
}

export async function recordVote({ ideaId, sessionId, votedModel, votedModelName }) {
  await getPool().execute(
    `INSERT INTO votes (idea_id, session_id, voted_model, voted_model_name)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       voted_model = VALUES(voted_model),
       voted_model_name = VALUES(voted_model_name),
       created_at = CURRENT_TIMESTAMP`,
    [ideaId, sessionId, votedModel, votedModelName]
  );
}

export async function getVoteDistribution() {
  const [rows] = await getPool().execute(
    "SELECT voted_model, COUNT(*) AS count FROM votes GROUP BY voted_model"
  );
  const counts = new Map(rows.map((row) => [row.voted_model, Number(row.count)]));
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return allModelKeys().map((key) => {
    const count = counts.get(key) || 0;
    return {
      model: key,
      display_name: displayNameForModelKey(key),
      count,
      percent: total ? Math.round((count / total) * 100) : 0
    };
  });
}

export async function getEvaluationByIdea(ideaId) {
  const [rows] = await getPool().execute(
    "SELECT * FROM evaluations WHERE idea_id = ? LIMIT 1",
    [ideaId]
  );
  return rows[0] || null;
}

export async function computePercentile(score) {
  const [[{ lower }]] = await getPool().execute(
    "SELECT COUNT(*) AS lower FROM evaluations WHERE score < ?",
    [score]
  );
  const [[{ total }]] = await getPool().execute("SELECT COUNT(*) AS total FROM evaluations");
  const lowerCount = Number(lower);
  const totalCount = Number(total);

  if (!totalCount) {
    return null;
  }

  return Math.round((lowerCount / totalCount) * 100);
}

export async function saveEvaluation({ ideaId, sessionId, level, score, comment, percentile, seeded = 0 }) {
  await getPool().execute(
    `INSERT INTO evaluations (idea_id, session_id, level, score, comment, percentile, seeded)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       level = VALUES(level),
       score = VALUES(score),
       comment = VALUES(comment),
       percentile = VALUES(percentile)`,
    [ideaId, sessionId, level, score, comment, percentile, seeded]
  );
}

export async function getStats() {
  const [[ideas]] = await getPool().execute("SELECT COUNT(*) AS count FROM ideas");
  const [[votes]] = await getPool().execute("SELECT COUNT(*) AS count FROM votes");
  const [[evaluations]] = await getPool().execute("SELECT COUNT(*) AS count FROM evaluations");

  return {
    ideas: Number(ideas.count),
    votes: Number(votes.count),
    evaluations: Number(evaluations.count)
  };
}
