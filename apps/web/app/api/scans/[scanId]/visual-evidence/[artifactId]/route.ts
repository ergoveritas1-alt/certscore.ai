import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getVisualEvidenceArtifacts } from "../../../../../../lib/scans/visual-evidence";
import { getPublicScanById } from "../../../../../../server/scans/get-scan-by-id";
import {
  getLocalV2DagReportInput,
  resolveLocalV2DagVisualEvidencePointer
} from "../../../../../../server/scans/local-v2-dag-report";
import { createSignedStorageUrl, getStorageBucketName } from "../../../../../../server/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    artifactId: string;
    scanId: string;
  }>;
};

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
  const match = bucket.match(/(?:^|-)(eu-central-1|eu-west-1|us-west-2)(?:-|$)/);
  return match?.[1] ?? "eu-central-1";
}

async function streamToBuffer(body: GetObjectCommandOutput["Body"]) {
  if (!body) {
    throw new Error("Visual evidence artifact did not include a body.");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error("Unsupported visual evidence artifact response body.");
}

async function getLocalDevVisualEvidenceResponse(input: { contentType: string | null; key: string }) {
  if (!isLocalStorageEndpoint(process.env.S3_ENDPOINT) || !isSafeStorageKey(input.key)) {
    return null;
  }

  const bucket = getStorageBucketName();
  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../..")
  ];

  for (const root of candidateRoots) {
    try {
      const objectPath = path.join(root, "tmp", "minio-data", bucket, input.key);
      const body = await readFile(objectPath);
      return new NextResponse(body, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": input.contentType ?? "application/octet-stream"
        }
      });
    } catch {
      // Try the next plausible local dev root before falling back to signed storage.
    }
  }

  return null;
}

async function getLocalFakeS3VisualEvidenceResponse(input: { bucket: string | null | undefined; contentType: string | null; key: string }) {
  if (!input.bucket || !isSafeStorageBucket(input.bucket) || !isSafeStorageKey(input.key)) {
    return null;
  }

  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../..")
  ];

  for (const root of candidateRoots) {
    let artifactDirs: string[];
    try {
      artifactDirs = await readdir(path.join(root, "artifacts"));
    } catch {
      continue;
    }

    for (const artifactDir of artifactDirs) {
      if (!isSafeStorageKey(artifactDir)) {
        continue;
      }
      try {
        const objectPath = path.join(root, "artifacts", artifactDir, "_fake-s3", input.bucket, input.key);
        const body = await readFile(objectPath);
        return new NextResponse(body, {
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Type": input.contentType ?? "application/octet-stream"
          }
        });
      } catch {
        // Try the next local fake-S3 artifact root before falling back.
      }
    }
  }

  return null;
}

async function getLocalV2DagVisualEvidenceResponse(input: { contentType: string | null; key: string }) {
  if (!input.key.startsWith("local-v2-dag-scans/") || !isSafeStorageKey(input.key)) {
    return null;
  }

  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../..")
  ];

  for (const root of candidateRoots) {
    try {
      const objectPath = path.join(root, "artifacts", input.key);
      const body = await readFile(objectPath);
      return new NextResponse(body, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": input.contentType ?? "image/png"
        }
      });
    } catch {
      // Try the next plausible workspace root before falling back.
    }
  }

  return null;
}

async function getLocalV2DagLambdaS3VisualEvidenceResponse(input: {
  bucket: string | null | undefined;
  contentType: string | null;
  key: string;
}) {
  if (!isSafeStorageKey(input.key) || !input.bucket || !isSafeStorageBucket(input.bucket) || !isLocalV2DagLambdaArtifact(input)) {
    return null;
  }

  try {
    const response = await new S3Client({ region: inferS3ArtifactRegion(input.bucket) }).send(
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key })
    );
    const body = await streamToBuffer(response.Body);
    return new NextResponse(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": input.contentType ?? response.ContentType ?? "image/png"
      }
    });
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { artifactId, scanId } = await context.params;
  const scanRecord = await getPublicScanById(scanId);

  if (!scanRecord) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  const decodedArtifactId = decodeURIComponent(artifactId);
  const storedArtifact = getVisualEvidenceArtifacts(scanRecord.runtimeArtifacts)
    .find((candidate) => candidate.id === decodedArtifactId) ?? null;
  const artifact = storedArtifact ?? (getLocalV2DagReportInput(scanRecord)
    ? await resolveLocalV2DagVisualEvidencePointer(scanRecord, decodedArtifactId)
    : null);
  if (!artifact || artifact.status !== "available" || !artifact.key) {
    return NextResponse.json({ error: "Visual evidence is unavailable." }, { status: 404 });
  }

  const localV2Response = await getLocalV2DagVisualEvidenceResponse({
    contentType: artifact.mimeType,
    key: artifact.key
  });
  if (localV2Response) {
    return localV2Response;
  }

  const localFakeS3Response = await getLocalFakeS3VisualEvidenceResponse({
    bucket: artifact.bucket,
    contentType: artifact.mimeType,
    key: artifact.key
  });
  if (localFakeS3Response) {
    return localFakeS3Response;
  }

  const localDevResponse = await getLocalDevVisualEvidenceResponse({
    contentType: artifact.mimeType,
    key: artifact.key
  });
  if (localDevResponse) {
    return localDevResponse;
  }

  const localV2DagLambdaS3Response = await getLocalV2DagLambdaS3VisualEvidenceResponse({
    bucket: artifact.bucket,
    contentType: artifact.mimeType,
    key: artifact.key
  });
  if (localV2DagLambdaS3Response) {
    return localV2DagLambdaS3Response;
  }

  const signedUrl = await createSignedStorageUrl(artifact.key, 300, artifact.bucket ?? undefined);
  return NextResponse.redirect(signedUrl, {
    headers: {
      "Cache-Control": "private, no-store"
    }
  });
}
