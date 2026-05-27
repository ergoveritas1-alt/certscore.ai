import "server-only";

import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { checkStorageBucketExists, getS3Client, getStorageBucketName, putStorageObject } from "@website-signal-risk-scanner/db";

export { checkStorageBucketExists, getS3Client, getStorageBucketName, putStorageObject };

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
