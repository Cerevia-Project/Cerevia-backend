import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the repo-root `.env` regardless of the package's working directory
// (pnpm runs scripts from the package dir, not the repo root).
config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: num(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV ?? "development",
  /** Allowed browser origin for CORS (empty = same-origin / no CORS headers). */
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "",
  /** Run migrations + bootstrap on boot (auto-enabled in production). */
  autoMigrate: process.env.AUTO_MIGRATE === "true" || process.env.NODE_ENV === "production",
  falkordb: {
    host: process.env.FALKORDB_HOST ?? "localhost",
    port: num(process.env.FALKORDB_PORT, 6379),
    password: process.env.FALKORDB_PASSWORD,
  },
  postgres: {
    url: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: num(process.env.POSTGRES_PORT, 5433),
    user: process.env.POSTGRES_USER ?? "cerevia",
    password: process.env.POSTGRES_PASSWORD ?? "cerevia",
    database: process.env.POSTGRES_DB ?? "cerevia",
    ssl: process.env.POSTGRES_SSL === "true",
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: num(process.env.REDIS_PORT, 6380),
    url: process.env.REDIS_URL,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:4566",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "cerevia-uploads",
    accessKey: process.env.S3_ACCESS_KEY ?? "test",
    secretKey: process.env.S3_SECRET_KEY ?? "test",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },
  storage: {
    backend: (process.env.STORAGE_BACKEND ?? "fs") as "fs" | "s3",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  },
  voyage: {
    apiKey: process.env.VOYAGE_API_KEY ?? "",
    model: process.env.VOYAGE_MODEL ?? "voyage-3-large",
    dimension: num(process.env.VOYAGE_EMBEDDING_DIMENSION, 1024),
  },
};
