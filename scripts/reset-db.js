import "../server/config.js";
import { getPool, runSchema } from "../server/db.js";

const tables = ["evaluations", "votes", "model_runs", "ideas"];

try {
  await runSchema();
  const connection = await getPool().getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) {
      await connection.query(`TRUNCATE TABLE ${table}`);
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    connection.release();
  }

  console.log("Database business data has been reset.");
} catch (error) {
  console.error("Failed to reset database.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
