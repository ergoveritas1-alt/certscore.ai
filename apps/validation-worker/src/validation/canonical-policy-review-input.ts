import {
  GetObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import {
  canonicalEvidenceBundleSchema,
  type CanonicalEvidenceBundle
} from "@certscore/contracts";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

const MAX_CANONICAL_BUNDLE_BYTES = 20 * 1024 * 1024;
const APPROVED_ARTIFACT_REGIONS = new Set([
  "eu-central-1",
  "eu-west-1",
  "us-west-2"
]);

export type CanonicalPolicyReviewPointer = {
  expectedSha256: string;
  expectedSizeBytes: number;
  region: "eu-central-1" | "eu-west-1" | "us-west-2";
  uri: string;
};

type S3GetClient = {
  send(command: GetObjectCommand): Promise<{ Body?: unknown }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseS3Uri(uri: string) {
  if (!uri.startsWith("s3://")) {
    throw new Error("Canonical policy-review artifact must use an s3:// URI.");
  }
  const withoutScheme = uri.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
    throw new Error("Canonical policy-review artifact URI is missing a bucket or key.");
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1)
  };
}

function inferArtifactRegion(bucket: string): CanonicalPolicyReviewPointer["region"] {
  const matched = bucket.match(/(?:^|-)(eu-central-1|eu-west-1|us-west-2)(?:-|$)/)?.[1];
  if (!matched || !APPROVED_ARTIFACT_REGIONS.has(matched)) {
    throw new Error("Canonical policy-review artifact bucket does not identify an approved scanner region.");
  }
  return matched as CanonicalPolicyReviewPointer["region"];
}

export function extractCanonicalPolicyReviewPointer(
  metadata: Record<string, unknown> | null
): CanonicalPolicyReviewPointer | null {
  const artifactPointers = asRecord(metadata?.artifactPointers);
  const artifactMetadata = asRecord(metadata?.artifactMetadata);
  const scanArtifactMetadata = asRecord(artifactMetadata?.scanArtifactUri);
  const uri = stringValue(artifactPointers?.scanArtifactUri);
  if (!uri) {
    return null;
  }

  const expectedSha256 = stringValue(scanArtifactMetadata?.sha256);
  const expectedSizeBytes = numberValue(scanArtifactMetadata?.sizeBytes);
  if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error("Canonical policy-review artifact is missing a valid SHA-256 checksum.");
  }
  if (
    expectedSizeBytes === null ||
    !Number.isInteger(expectedSizeBytes) ||
    expectedSizeBytes <= 0 ||
    expectedSizeBytes > MAX_CANONICAL_BUNDLE_BYTES
  ) {
    throw new Error("Canonical policy-review artifact size is missing or outside the bounded limit.");
  }

  const { bucket } = parseS3Uri(uri);
  return {
    expectedSha256: expectedSha256.toLowerCase(),
    expectedSizeBytes,
    region: inferArtifactRegion(bucket),
    uri
  };
}

async function streamToBuffer(body: unknown) {
  if (!body) {
    throw new Error("Canonical policy-review artifact did not include a body.");
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
  if (
    typeof body === "object" &&
    "transformToByteArray" in body &&
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function"
  ) {
    return Buffer.from(
      await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()
    );
  }
  throw new Error("Unsupported canonical policy-review artifact response body.");
}

export async function loadCanonicalBundleForPolicyReview(input: {
  client?: S3GetClient;
  pointer: CanonicalPolicyReviewPointer;
}): Promise<CanonicalEvidenceBundle> {
  const { bucket, key } = parseS3Uri(input.pointer.uri);
  const client = input.client ?? new S3Client({ region: input.pointer.region });
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToBuffer(response.Body);
  if (body.byteLength !== input.pointer.expectedSizeBytes) {
    throw new Error("Canonical policy-review artifact size does not match retained metadata.");
  }
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (sha256 !== input.pointer.expectedSha256) {
    throw new Error("Canonical policy-review artifact checksum does not match retained metadata.");
  }
  return canonicalEvidenceBundleSchema.parse(JSON.parse(body.toString("utf8")));
}
