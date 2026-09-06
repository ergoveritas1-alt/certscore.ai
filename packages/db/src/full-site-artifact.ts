import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
export async function readFullSiteArtifact(input: {
  bucket: string;
  key: string;
  region: string;
  sha256: string;
  sizeBytes: number;
  maxBytes?: number;
}) {
  if (
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > (input.maxBytes ?? 16 * 1024 * 1024)
  )
    throw new Error("Invalid artifact bounds.");
  const signal = AbortSignal.timeout(15000);
  const result = await new S3Client({ region: input.region }).send(
    new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
    { abortSignal: signal },
  );
  if (!result.Body || result.ContentLength !== input.sizeBytes)
    throw new Error("Artifact size mismatch.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const stream = result.Body as AsyncIterable<Uint8Array> & {
    destroy?: () => void;
  };
  const abort = () => stream.destroy?.();
  signal.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of stream) {
      signal.throwIfAborted();
      bytes += chunk.byteLength;
      if (bytes > input.sizeBytes)
        throw new Error("Artifact exceeded declared size.");
      chunks.push(chunk);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    stream.destroy?.();
  }
  const body = Buffer.concat(chunks);
  if (
    body.byteLength !== input.sizeBytes ||
    createHash("sha256").update(body).digest("hex") !== input.sha256
  )
    throw new Error("Artifact checksum mismatch.");
  return JSON.parse(body.toString("utf8")) as unknown;
}
