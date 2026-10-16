import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

interface Storage {
  ensureBucket(): Promise<void>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}

// ── Filesystem backend (default for dev) ─────────────────────────────
const fsRoot = fileURLToPath(new URL("../../../../.data/uploads/", import.meta.url));

class FsStorage implements Storage {
  async ensureBucket(): Promise<void> {
    await mkdir(fsRoot, { recursive: true });
  }
  async putObject(key: string, body: Buffer): Promise<void> {
    const target = path.join(fsRoot, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  async getObject(key: string): Promise<Buffer> {
    return readFile(path.join(fsRoot, key));
  }
  async deleteObject(key: string): Promise<void> {
    await rm(path.join(fsRoot, key), { force: true });
  }
}

// ── S3 backend (for real S3-compatible deployments) ──────────────────
let s3Client: S3Client | undefined;

function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: env.s3.endpoint,
      region: env.s3.region,
      forcePathStyle: env.s3.forcePathStyle,
      credentials: {
        accessKeyId: env.s3.accessKey,
        secretAccessKey: env.s3.secretKey,
      },
    });
  }
  return s3Client;
}

class S3Storage implements Storage {
  async ensureBucket(): Promise<void> {
    try {
      await getS3().send(new HeadBucketCommand({ Bucket: env.s3.bucket }));
    } catch {
      await getS3().send(new CreateBucketCommand({ Bucket: env.s3.bucket }));
    }
  }
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await getS3().send(
      new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }
  async getObject(key: string): Promise<Buffer> {
    const result = await getS3().send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }
  async deleteObject(key: string): Promise<void> {
    await getS3().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  }
}

let impl: Storage | undefined;

function getImpl(): Storage {
  if (!impl) {
    impl = env.storage.backend === "s3" ? new S3Storage() : new FsStorage();
  }
  return impl;
}

export const ensureBucket = () => getImpl().ensureBucket();
export const putObject = (key: string, body: Buffer, contentType: string) =>
  getImpl().putObject(key, body, contentType);
export const getObject = (key: string) => getImpl().getObject(key);
export const deleteObject = (key: string) => getImpl().deleteObject(key);
