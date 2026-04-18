import "server-only";

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { checkStorageBucketExists, getS3Client, getStorageBucketName } from "@website-signal-risk-scanner/db";

export { checkStorageBucketExists, getS3Client, getStorageBucketName };

export async function putStorageObject(input: {
  body: NonNullable<PutObjectCommandInput["Body"]>;
  contentType?: string;
  key: string;
}) {
  await getS3Client().send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: getStorageBucketName(),
      ContentType: input.contentType,
      Key: input.key
    })
  );
}

export async function createSignedStorageUrl(key: string, expiresInSeconds = 3600) {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getStorageBucketName(),
      Key: key
    }),
    {
      expiresIn: expiresInSeconds
    }
  );
}

export async function deleteStorageObject(key: string) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getStorageBucketName(),
      Key: key
    })
  );
}
