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
    await runMigrations(connection);
  } finally {
    connection.release();
  }
}

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  if (!(await hasColumn(connection, tableName, columnName))) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

async function addIndexIfMissing(connection, tableName, indexName, definition) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(rows[0]?.count || 0) === 0) {
    await connection.query(`ALTER TABLE ${tableName} ADD ${definition}`);
  }
}

async function runMigrations(connection) {
  await addColumnIfMissing(connection, "ideas", "seeded", "seeded TINYINT(1) NOT NULL DEFAULT 0");
  await addColumnIfMissing(
    connection,
    "ideas",
    "is_complete",
    "is_complete TINYINT(1) NOT NULL DEFAULT 0 COMMENT '完整走完投票和结果页后才可复用'"
  );
  await addColumnIfMissing(
    connection,
    "ideas",
    "completed_at",
    "completed_at TIMESTAMP NULL DEFAULT NULL"
  );
  await addColumnIfMissing(
    connection,
    "votes",
    "voted_model_name",
    "voted_model_name VARCHAR(80) NOT NULL DEFAULT '' COMMENT '投票时对应的展示名'"
  );
  await addColumnIfMissing(
    connection,
    "evaluations",
    "seeded",
    "seeded TINYINT(1) NOT NULL DEFAULT 0"
  );
  await addIndexIfMissing(
    connection,
    "ideas",
    "idx_complete",
    "INDEX idx_complete (is_complete, seeded, created_at)"
  );
}

export async function insertIdea({ sessionId, content, tag = null, seeded = 0 }) {
  const [result] = await getPool().execute(
    "INSERT INTO ideas (session_id, content, tag, seeded, is_complete) VALUES (?, ?, ?, ?, ?)",
    [sessionId, content, tag, seeded, seeded ? 1 : 0]
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
     WHERE id <> ?
       AND session_id <> ?
       AND (seeded = 1 OR is_complete = 1)
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
    `SELECT COUNT(*) AS lower
     FROM evaluations e
     INNER JOIN ideas i ON i.id = e.idea_id
     WHERE e.score < ?
       AND (i.seeded = 1 OR i.is_complete = 1)`,
    [score]
  );
  const [[{ total }]] = await getPool().execute(
    `SELECT COUNT(*) AS total
     FROM evaluations e
     INNER JOIN ideas i ON i.id = e.idea_id
     WHERE i.seeded = 1 OR i.is_complete = 1`
  );
  const lowerCount = Number(lower);
  const totalCount = Number(total);

  if (!totalCount) {
    return null;
  }

  return Math.round((lowerCount / totalCount) * 100);
}

export async function markIdeaComplete(ideaId) {
  await getPool().execute(
    `UPDATE ideas
     SET is_complete = 1,
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
     WHERE id = ?`,
    [ideaId]
  );
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
  const [[completed]] = await getPool().execute(
    "SELECT COUNT(*) AS count FROM ideas WHERE seeded = 1 OR is_complete = 1"
  );

  return {
    ideas: Number(ideas.count),
    votes: Number(votes.count),
    evaluations: Number(evaluations.count),
    reusable_ideas: Number(completed.count)
  };
}
