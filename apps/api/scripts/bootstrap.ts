import { bootstrap } from "../src/db/bootstrap.js";
import { closePool } from "../src/db/postgres.js";

bootstrap()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Bootstrap failed:", error);
    await closePool();
    process.exit(1);
  });
