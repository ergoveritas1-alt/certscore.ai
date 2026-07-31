import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  extractCanonicalPolicyReviewPointer,
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
