import { migrate } from "../src/db/migrate.js";
import { closePool } from "../src/db/postgres.js";

migrate()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await closePool();
    process.exit(1);
  });
