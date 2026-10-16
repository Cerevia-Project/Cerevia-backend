import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { bootstrap } from "./db/bootstrap.js";
import { migrate } from "./db/migrate.js";
import { ensureBucket } from "./lib/storage.js";
import { startWorker } from "./queue/queue.js";

async function main(): Promise<void> {
  if (env.autoMigrate) {
    await migrate();
    await bootstrap();
  }

  const app = createApp();

  app.listen(env.port, () => {
    console.log(`Express server running on http://localhost:${env.port}`);
  });

  ensureBucket().catch((error) => {
    console.error("Failed to ensure S3 bucket:", error);
  });

  if (env.nodeEnv !== "test") {
    startWorker();
  }
}

main().catch((error) => {
  console.error("Failed to start:", error);
  process.exit(1);
});
