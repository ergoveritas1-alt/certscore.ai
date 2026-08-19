import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  extractCanonicalPolicyReviewPointer,
  extractLocalCanonicalPolicyReviewMirrorPath,
  loadCanonicalBundleForPolicyReview
} from "./canonical-policy-review-input";

const fixturePath = path.resolve(
  __dirname,
  "../../../../packages/certscore-contracts/fixtures/saved-bundles/policy-surface-positive.json",
);

test("loads and contract-validates a checksum-bound canonical policy bundle", async () => {
  const body = await readFile(fixturePath);
  const pointer = extractCanonicalPolicyReviewPointer({
    artifactMetadata: {
      scanArtifactUri: {
        sha256: createHash("sha256").update(body).digest("hex"),
        sizeBytes: body.byteLength
      }
    },
    artifactPointers: {
      scanArtifactUri:
        "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-fixture/CanonicalEvidenceBundle.json"
    }
  });
  assert.ok(pointer);

  const bundle = await loadCanonicalBundleForPolicyReview({
    client: {
      async send() {
        return { $metadata: {}, Body: body };
      }
    },
    pointer
  });

  assert.equal(
    ["certscore.v2.canonical-evidence-bundle.v1", "certscore.v2.alpha.1"].includes(
      bundle.schemaVersion
    ),
    true
  );
  assert.equal(bundle.policySurfaceObservations.length > 0, true);
});

test("rejects a canonical policy bundle without checksum metadata", () => {
  assert.throws(
    () => extractCanonicalPolicyReviewPointer({
      artifactMetadata: {
        scanArtifactUri: { sizeBytes: 100 }
      },
      artifactPointers: {
        scanArtifactUri:
          "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-fixture/CanonicalEvidenceBundle.json"
      }
    }),
    /SHA-256/
  );
});

test("rejects canonical policy bundle bytes that do not match retained metadata", async () => {
  const body = await readFile(fixturePath);
  const pointer = extractCanonicalPolicyReviewPointer({
    artifactMetadata: {
      scanArtifactUri: {
        sha256: "0".repeat(64),
        sizeBytes: body.byteLength
      }
    },
    artifactPointers: {
      scanArtifactUri:
        "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-fixture/CanonicalEvidenceBundle.json"
    }
  });
  assert.ok(pointer);

  await assert.rejects(
    loadCanonicalBundleForPolicyReview({
      client: {
        async send() {
          return { $metadata: {}, Body: body };
        }
      },
      pointer
    }),
    /checksum/
  );
});

test("selects only the checksum-bound canonical bundle from a local scan mirror", () => {
  const scanId = "00000000-0000-4000-8000-000000000001";
  const workspaceRoot = "/workspace";
  const pointer = {
    expectedSha256: "a".repeat(64),
    expectedSizeBytes: 123,
    region: "eu-central-1" as const,
    uri: `s3://scan-artifacts-eu-central-1/v2/${scanId}/CanonicalEvidenceBundle.json`,
  };
  const localPath = `${workspaceRoot}/artifacts/local-v2-dag-scans/${scanId}/CanonicalEvidenceBundle.json`;
  assert.equal(extractLocalCanonicalPolicyReviewMirrorPath({
    metadata: {
      targetEnvironment: "local",
      artifactMirror: {
        outDir: `${workspaceRoot}/artifacts/local-v2-dag-scans/${scanId}`,
        mirroredArtifacts: [{
          field: "scanArtifactUri",
          localPath,
          sourceUri: pointer.uri,
        }],
      },
    },
    pointer,
    scanId,
  }), localPath);
});

test("rejects a local canonical bundle mirror outside the scan artifact directory", () => {
  const scanId = "00000000-0000-4000-8000-000000000001";
  const pointer = {
    expectedSha256: "a".repeat(64),
    expectedSizeBytes: 123,
    region: "eu-central-1" as const,
    uri: `s3://scan-artifacts-eu-central-1/v2/${scanId}/CanonicalEvidenceBundle.json`,
  };
  assert.throws(() => extractLocalCanonicalPolicyReviewMirrorPath({
    metadata: {
      targetEnvironment: "local",
      artifactMirror: {
        mirroredArtifacts: [{
          field: "scanArtifactUri",
          localPath: "/tmp/CanonicalEvidenceBundle.json",
          sourceUri: pointer.uri,
        }],
      },
    },
    pointer,
    scanId,
    workspaceRoot: "/workspace",
  }), /outside the scan artifact directory/);
});
