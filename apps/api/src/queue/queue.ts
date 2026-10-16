import { Queue, Worker } from "bullmq";
import { env } from "../config/env.js";
import { processIngestionJob } from "../modules/ingestion/pipeline.js";

const connection = env.redis.url
  ? { url: env.redis.url }
  : { host: env.redis.host, port: env.redis.port };

let queue: Queue | undefined;

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue("ingestion", { connection });
  }
  return queue;
}

export function startWorker(): Worker {
  return new Worker(
    "ingestion",
    async (job) => {
      await processIngestionJob(String(job.data.jobId), String(job.data.orgId));
    },
    { connection },
  );
}
