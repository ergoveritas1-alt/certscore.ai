import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { createSignedStorageUrl, getStorageBucketName } from "../storage/s3";

const MAX_VISUAL_EVIDENCE_BYTES = 12 * 1024 * 1024;

export type VisualEvidenceObjectPointer = {
  bucket: string | null | undefined;
  contentType: string | null | undefined;
  key: string;
};

export type VisualEvidenceObject = {
  body: Buffer;
  contentType: string;
};

export type VisualEvidenceDelivery =
  | { kind: "object"; object: VisualEvidenceObject }
  | { kind: "redirect"; url: string };

function isLocalStorageEndpoint(value: string | undefined) {
  return Boolean(value && /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(value));
}

function isSafeStorageKey(value: string) {
  return !path.isAbsolute(value) && !value.split("/").some((part) => part === "..");
}

function isSafeStorageBucket(value: string) {
  return /^[a-z0-9][a-z0-9.-]{1,62}$/.test(value) && !value.includes("..");
}

function isLocalV2DagLambdaArtifact(input: { bucket: string | null | undefined; key: string }) {
  return Boolean(
    input.bucket &&
    input.bucket.includes("v2-dag-local-artifacts") &&
    input.key.startsWith("v2-dag-lambda/")
  );
}

function inferS3ArtifactRegion(bucket: string) {
  const match = bucket.match(/(?:^|-)(eu-central-1|eu-west-1|us-west-1)(?:-|$)/);
  return match?.[1] ?? "eu-central-1";
}

function boundedBody(body: Buffer) {
  if (body.byteLength > MAX_VISUAL_EVIDENCE_BYTES) {
    throw new Error("Visual evidence artifact exceeds the bounded PDF thumbnail limit.");
  }
  return body;
}

async function streamToBuffer(body: GetObjectCommandOutput["Body"]) {
  if (!body) throw new Error("Visual evidence artifact did not include a body.");
  if (body instanceof Uint8Array) return boundedBody(Buffer.from(body));
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > MAX_VISUAL_EVIDENCE_BYTES) {
        throw new Error("Visual evidence artifact exceeds the bounded PDF thumbnail limit.");
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return boundedBody(Buffer.from(await body.transformToByteArray()));
  }
  throw new Error("Unsupported visual evidence artifact response body.");
}

function response(body: Buffer, contentType: string | null | undefined): VisualEvidenceObject {
  const detectedContentType = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
    ? "image/jpeg"
    : body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : contentType;
  return {
    body: boundedBody(body),
    contentType: detectedContentType ?? "application/octet-stream",
  };
}

async function readCandidateFiles(paths: string[], contentType: string | null | undefined) {
  for (const objectPath of paths) {
    try {
      return response(await readFile(objectPath), contentType);
    } catch {
      // Try the next repository-controlled candidate before storage fallback.
    }
  }
  return null;
}

function candidateRoots() {
  return [process.cwd(), path.resolve(process.cwd(), ".."), path.resolve(process.cwd(), "../..")];
}

async function readLocalObject(input: VisualEvidenceObjectPointer) {
  if (input.key.startsWith("local-v2-dag-scans/") && isSafeStorageKey(input.key)) {
    const localV2 = await readCandidateFiles(
      candidateRoots().map((root) => path.join(root, "artifacts", input.key)),
      input.contentType ?? "image/png",
    );
    if (localV2) return localV2;
  }

  if (input.bucket && isSafeStorageBucket(input.bucket) && isSafeStorageKey(input.key)) {
    for (const root of candidateRoots()) {
      let artifactDirs: string[];
      try {
        artifactDirs = await readdir(path.join(root, "artifacts"));
      } catch {
        continue;
      }
      const fakeS3 = await readCandidateFiles(
        artifactDirs
          .filter(isSafeStorageKey)
          .map((artifactDir) => path.join(root, "artifacts", artifactDir, "_fake-s3", input.bucket!, input.key)),
        input.contentType,
      );
      if (fakeS3) return fakeS3;
    }
  }

  if (isLocalStorageEndpoint(process.env.S3_ENDPOINT) && isSafeStorageKey(input.key)) {
    const bucket = getStorageBucketName();
    const localDev = await readCandidateFiles(
      candidateRoots().map((root) => path.join(root, "tmp", "minio-data", bucket, input.key)),
      input.contentType,
    );
    if (localDev) return localDev;
  }
  return null;
}

export async function resolveVisualEvidenceDelivery(input: VisualEvidenceObjectPointer): Promise<VisualEvidenceDelivery | null> {
  if (!isSafeStorageKey(input.key)) return null;
  const local = await readLocalObject(input);
  if (local) return { kind: "object", object: local };

  if (input.bucket && isSafeStorageBucket(input.bucket) && isLocalV2DagLambdaArtifact(input)) {
    try {
      const result = await new S3Client({ region: inferS3ArtifactRegion(input.bucket) }).send(
        new GetObjectCommand({ Bucket: input.bucket, Key: input.key })
      );
      return {
        kind: "object",
        object: response(await streamToBuffer(result.Body), input.contentType ?? result.ContentType ?? "image/png"),
      };
    } catch {
      return null;
    }
  }

  try {
    return {
      kind: "redirect",
      url: await createSignedStorageUrl(input.key, 300, input.bucket ?? undefined),
    };
  } catch {
    return null;
  }
}

export async function loadVisualEvidenceObject(input: VisualEvidenceObjectPointer) {
  const delivery = await resolveVisualEvidenceDelivery(input);
  if (!delivery) return null;
  if (delivery.kind === "object") return delivery.object;
  try {
    const result = await fetch(delivery.url, { cache: "no-store" });
    if (!result.ok) return null;
    const contentLength = Number(result.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_VISUAL_EVIDENCE_BYTES) return null;
    return response(
      Buffer.from(await result.arrayBuffer()),
      input.contentType ?? result.headers.get("content-type") ?? "image/png",
    );
  } catch {
    return null;
  }
}
