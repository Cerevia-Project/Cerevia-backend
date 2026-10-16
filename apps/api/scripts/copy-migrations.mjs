import { cpSync, mkdirSync } from "node:fs";

// Copy the SQL migrations into dist/ so the compiled server can run them.
mkdirSync("dist/db/migrations", { recursive: true });
cpSync("src/db/migrations", "dist/db/migrations", { recursive: true });
console.log("Copied migrations to dist/db/migrations");
