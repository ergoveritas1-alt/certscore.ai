import assert from "node:assert/strict";
import test from "node:test";

import {
  SANITIZED_NETWORK_EVIDENCE_CANONICALIZATION_VERSION,
  buildSanitizedNetworkEvidenceAuditRecord,
  canonicalizeSanitizedNetworkEvidenceForHash
} from "./sanitized-network-evidence";

test("identical sanitized payloads produce identical hashes", () => {
  const input = {
    entries: [
      {
        matchedVendor: "Meta Pixel",
        requestUrlSanitized: "https://www.facebook.com/tr?[REDACTED]",
        runtimePhase: "gpc_enabled"
      }
    ],
    summary: {
      gpc: {
        requestCount: 1
      }
    }
  };

  const first = buildSanitizedNetworkEvidenceAuditRecord(input, {
    capturedAt: "2026-03-27T01:00:00.000Z"
  });
  const second = buildSanitizedNetworkEvidenceAuditRecord(input, {
    capturedAt: "2026-03-27T02:00:00.000Z"
  });

  assert.equal(first.artifactSha256, second.artifactSha256);
});

test("sanitized payload changes change the hash", () => {
  const baseline = buildSanitizedNetworkEvidenceAuditRecord({
    entries: [
      {
        matchedVendor: "Meta Pixel",
        requestUrlSanitized: "https://www.facebook.com/tr?[REDACTED]",
        runtimePhase: "gpc_enabled"
      }
    ]
  });
  const changed = buildSanitizedNetworkEvidenceAuditRecord({
    entries: [
      {
        matchedVendor: "Meta Pixel",
        requestUrlSanitized: "https://www.facebook.com/tr?event=[REDACTED]",
        runtimePhase: "gpc_enabled"
      }
    ]
  });

  assert.notEqual(baseline.artifactSha256, changed.artifactSha256);
});

test("timestamp fields are persisted but excluded from the hash input", () => {
  const payload = {
    canonicalizationVersion: SANITIZED_NETWORK_EVIDENCE_CANONICALIZATION_VERSION,
    capturedAt: "2026-03-27T01:00:00.000Z",
    entries: [
      {
        matchedVendor: "Adobe Analytics",
        requestUrlSanitized: "https://metrics.example.com/b/ss/example",
        runtimePhase: "after_reject"
      }
    ],
    sourceWindowEndedAt: "2026-03-27T01:00:02.000Z",
    sourceWindowStartedAt: "2026-03-27T00:59:58.000Z"
  };

  const canonical = canonicalizeSanitizedNetworkEvidenceForHash(payload);

  assert.equal(canonical.includes("capturedAt"), false);
  assert.equal(canonical.includes("sourceWindowStartedAt"), false);
  assert.equal(canonical.includes("sourceWindowEndedAt"), false);
});

test("changing canonicalization version changes the digest metadata", () => {
  const input = {
    entries: [
      {
        matchedVendor: "Google Ads",
        requestUrlSanitized: "https://pagead2.googlesyndication.com/pagead/viewthroughconversion/[REDACTED]",
        runtimePhase: "pre_consent"
      }
    ]
  };

  const first = buildSanitizedNetworkEvidenceAuditRecord(input, {
    canonicalizationVersion: "sanitized_network_evidence.v1"
  });
  const second = buildSanitizedNetworkEvidenceAuditRecord(input, {
    canonicalizationVersion: "sanitized_network_evidence.v2"
  });

  assert.notEqual(first.artifactSha256, second.artifactSha256);
  assert.equal(first.canonicalizationVersion, "sanitized_network_evidence.v1");
  assert.equal(second.canonicalizationVersion, "sanitized_network_evidence.v2");
});
