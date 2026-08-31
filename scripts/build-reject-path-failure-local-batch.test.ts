import assert from "node:assert/strict";
import test from "node:test";
import { buildRejectPathFailureLocalBatch } from "./build-reject-path-failure-local-batch.js";

test("builds the ordered local batch from verified failed Reject scans", async () => {
  const artifact = {
    rows: [{
      event: { packet_uri: "s3://bucket/packet.json" },
      packet: { reason: "cmp_rejection_state_not_observed" },
      rejectObserved: true,
      scanId: "scan-1",
      verification: "verified",
    }],
    summary: { failures: [{ scanId: "scan-1" }] },
  };
  const selected = await buildRejectPathFailureLocalBatch({
    artifact,
    limit: 1,
    readPacket: async () => ({ targetUrl: "https://www.example.com/path" }) as never,
  });
  assert.deepEqual(selected, [{
    exactTargetUrl: "https://www.example.com/path",
    normalizedDomain: "example.com",
    packetUri: "s3://bucket/packet.json",
    sourceOutcome: "cmp_rejection_state_not_observed",
    sourceScanId: "scan-1",
  }]);
});

test("fails closed when a selected failure lacks retained packet evidence", async () => {
  await assert.rejects(() => buildRejectPathFailureLocalBatch({
    artifact: {
      rows: [{
        event: null,
        packet: null,
        rejectObserved: true,
        scanId: "scan-1",
        verification: "missing_packet",
      }],
      summary: { failures: [{ scanId: "scan-1" }] },
    },
    limit: 1,
  }), /no verified Reject-path packet or exact-target fallback/);
});

test("uses an explicit retained-evidence exact-target fallback for a timed-out lane", async () => {
  const selected = await buildRejectPathFailureLocalBatch({
    artifact: {
      rows: [{
        event: null,
        packet: null,
        rejectObserved: true,
        scanId: "scan-timeout",
        verification: "missing_packet",
      }],
      summary: { failures: [{ scanId: "scan-timeout" }] },
    },
    exactTargetFallbacks: {
      "scan-timeout": {
        exactTargetUrl: "https://example.com/",
        retainedEvidenceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        retainedEvidenceUri: "s3://bucket/CanonicalEvidenceBundle.json",
      },
    },
    limit: 1,
  });

  assert.deepEqual(selected, [{
    exactTargetUrl: "https://example.com/",
    normalizedDomain: "example.com",
    packetUri: "s3://bucket/CanonicalEvidenceBundle.json",
    sourceOutcome: "missing_packet",
    sourceScanId: "scan-timeout",
  }]);
});

test("selects a bounded ordered failure window", async () => {
  const rows = ["scan-1", "scan-2", "scan-3"].map((scanId) => ({
    event: { packet_uri: `s3://bucket/${scanId}.json` },
    packet: { reason: "cmp_rejection_state_not_observed" },
    rejectObserved: true,
    scanId,
    verification: "verified",
  }));
  const selected = await buildRejectPathFailureLocalBatch({
    artifact: {
      rows,
      summary: { failures: rows.map(({ scanId }) => ({ scanId })) },
    },
    limit: 2,
    offset: 1,
    readPacket: async (uri) => ({
      targetUrl: `https://${uri.includes("scan-2") ? "two" : "three"}.example/`,
    }) as never,
  });

  assert.deepEqual(selected.map(({ sourceScanId }) => sourceScanId), ["scan-2", "scan-3"]);
});
