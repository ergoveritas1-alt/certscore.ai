import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getS3Env } from "./env";

let s3Client: S3Client | null = null;

function createS3Client() {
  const env = getS3Env();

  return new S3Client({
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    },
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
    region: env.S3_REGION
  });
}

export function getStorageBucketName() {
  return getS3Env().S3_BUCKET;
}

export function getS3Client() {
  if (!s3Client) {
    s3Client = createS3Client();
  }

  return s3Client;
}

export async function checkStorageBucketExists(bucket = getStorageBucketName()) {
  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}
