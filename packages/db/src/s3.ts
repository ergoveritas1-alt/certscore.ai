import { HeadBucketCommand, PutObjectCommand, S3Client, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getS3Env } from "./env";

let s3Client: S3Client | null = null;

function createS3Client() {
  const env = getS3Env();
  const credentials = env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY
      }
    : undefined;

  return new S3Client({
    credentials,
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

export async function putStorageObject(input: {
  body: NonNullable<PutObjectCommandInput["Body"]>;
  bucket?: string;
  contentType?: string;
  key: string;
}) {
  await getS3Client().send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: input.bucket ?? getStorageBucketName(),
      ContentType: input.contentType,
      Key: input.key
    })
  );
}

export async function inspectStorageBucketAccess(bucket = getStorageBucketName()) {
  try {
    const result = await getS3Client().send(new HeadBucketCommand({ Bucket: bucket }));
    return {
      bucket,
      details: {
        extendedRequestId: result.$metadata.extendedRequestId ?? null,
        httpStatusCode: result.$metadata.httpStatusCode ?? null,
        requestId: result.$metadata.requestId ?? null
      },
      ok: true as const
    };
  } catch (error) {
    const candidate = error as {
      $metadata?: { extendedRequestId?: string; httpStatusCode?: number; requestId?: string };
      Code?: string;
      code?: string;
      message?: string;
      name?: string;
    };

    return {
      bucket,
      details: {
        code: candidate.Code ?? candidate.code ?? null,
        extendedRequestId: candidate.$metadata?.extendedRequestId ?? null,
        httpStatusCode: candidate.$metadata?.httpStatusCode ?? null,
        message: candidate.message ?? String(error),
        name: candidate.name ?? null,
        requestId: candidate.$metadata?.requestId ?? null
      },
      ok: false as const
    };
  }
}

export async function checkStorageBucketExists(bucket = getStorageBucketName()) {
  const inspection = await inspectStorageBucketAccess(bucket);
  return inspection.ok;
}
