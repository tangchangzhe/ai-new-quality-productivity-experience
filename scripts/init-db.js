import "../server/config.js";
import { getPool, runSchema } from "../server/db.js";

try {
  await runSchema();
  console.log("Database schema is ready.");
} catch (error) {
  console.error("Failed to initialize database schema.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
