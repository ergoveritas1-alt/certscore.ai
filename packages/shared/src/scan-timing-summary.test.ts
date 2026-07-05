import assert from "node:assert/strict";
import test from "node:test";
import {
  SCAN_TIMING_SUMMARY_SCHEMA_VERSION,
  buildScanTimingSummary
} from "./scan-timing-summary";

test("buildScanTimingSummary parses and bounds Lambda, scan-core, and module timings", () => {
  const summary = buildScanTimingSummary({
    artifactPointers: {
      manifestUri: "s3://bucket/v2/scan/LocalV2DagLambdaManifest.json",
      scanArtifactUri: "s3://bucket/v2/scan/CanonicalEvidenceBundle.json"
    },
    artifactMirror: {
      manifestPath: "/tmp/scan/LambdaArtifactMirrorManifest.json"
    },
    canonicalEvidenceBundle: {
      modulesRun: Array.from({ length: 10 }, (_, moduleIndex) => ({
        durationMs: 10_000 + moduleIndex,
        moduleId: `module-${moduleIndex}`,
        moduleName: `moduleName-${moduleIndex}`,
        status: "completed",
        timingBreakdown: Array.from({ length: 30 }, (_, timingIndex) => ({
          detail: `Timing detail ${timingIndex} with https://example.test/path?secret=should-not-leak`.repeat(4),
          durationMs: timingIndex + 1,
          label: `timing-${timingIndex}`
        }))
      }))
    },
    createdAt: "2026-07-04T15:28:00.000Z",
    handoffTiming: {
      artifactMirrorDurationMs: 321,
      artifactMirroredAt: "2026-07-04T15:27:44.000Z",
      lambdaCompletedAt: "2026-07-04T15:27:43.000Z",
      lambdaToWc01ResultRecordedMs: 1200,
      sqsApproximateReceiveCount: 3,
      sqsConsumerReceivedAt: "2026-07-04T15:27:43.500Z",
      sqsMessageId: "message-123",
      sqsQueueRegion: "eu-west-1",
      sqsSentAt: "2026-07-04T15:27:43.100Z",
      wc01ResultRecordedAt: "2026-07-04T15:27:44.200Z"
    },
    lambdaPhaseTimings: Array.from({ length: 18 }, (_, index) => ({
      completedAt: "2026-07-04T15:27:43.000Z",
      durationMs: index + 100,
      label: `phase-${index}`,
      startedAt: "2026-07-04T15:27:40.000Z",
      status: "completed"
    })),
    scanCorePhases: {
      checkpoints: Array.from({ length: 35 }, (_, index) => ({
        at: "2026-07-04T15:27:43.000Z",
        detail: { durationMs: index + 200, rawHeaders: { authorization: "bearer nope" } },
        elapsedMs: index * 1000,
        name: `checkpoint-${index}`,
        status: "completed"
      })),
      rawDom: "<html>nope</html>"
    }
  });

  assert.equal(summary.schemaVersion, SCAN_TIMING_SUMMARY_SCHEMA_VERSION);
  assert.equal(summary.lambdaPhaseTimings.length, 16);
  assert.equal(summary.scanCorePhases.length, 32);
  assert.equal(summary.moduleTimings.length, 8);
  assert.equal(summary.moduleTimings[0]?.timingBreakdown.length, 24);
  assert.equal(summary.truncated, true);
  assert.equal(summary.truncation.lambdaPhaseTimingsOmitted, 2);
  assert.equal(summary.truncation.scanCorePhasesOmitted, 3);
  assert.equal(summary.truncation.modulesOmitted, 2);
  assert.equal(summary.truncation.moduleTimingRowsOmitted, 48);
  assert.equal(summary.handoffTimings.sqsApproximateReceiveCount, 3);
  assert.equal(summary.handoffTimings.sqsMessageId, "message-123");
  assert.equal(summary.handoffTimings.sqsQueueRegion, "eu-west-1");
  assert.deepEqual(summary.artifactRefs.map((ref) => ref.kind), ["manifestUri", "scanArtifactUri", "mirrorManifest"]);
});

test("buildScanTimingSummary does not leak arbitrary raw artifact payload fields", () => {
  const summary = buildScanTimingSummary({
    artifactMirror: {
      manifestPath: "/tmp/mirror/LambdaArtifactMirrorManifest.json",
      mirroredArtifacts: [
        {
          body: "raw body should not leak",
          fileName: "V2ScanCorePhases.json",
          field: "auxiliaryArtifact",
          localPath: "/tmp/mirror/V2ScanCorePhases.json",
          requestHeaders: { cookie: "secret-cookie" },
          sourceUri: "s3://bucket/v2/scan/auxiliary/V2ScanCorePhases.json"
        }
      ]
    },
    canonicalEvidenceBundle: {
      modulesRun: [
        {
          durationMs: 100,
          moduleName: "preConsentRuntimeScanner",
          rawCookieValues: ["secret"],
          timingBreakdown: [
            {
              body: "raw body should not leak",
              detail: "Bounded static timing detail.",
              durationMs: 42,
              label: "page navigation",
              requestHeaders: { cookie: "secret-cookie" }
            }
          ]
        }
      ],
      networkEvents: [{ requestHeaders: { cookie: "secret-cookie" } }]
    },
    scanCorePhases: {
      checkpoints: [
        {
          at: "2026-07-04T15:27:43.000Z",
          detail: {
            authorization: "bearer nope",
            durationMs: 42,
            rawDom: "<html>nope</html>"
          },
          elapsedMs: 100,
          name: "scan_complete",
          status: "completed"
        }
      ]
    }
  });

  const serialized = JSON.stringify(summary).toLowerCase();
  assert.doesNotMatch(serialized, /secret-cookie|raw body|authorization|rawdom|networkevents|rawcookievalues/);
  assert.match(serialized, /page navigation/);
  assert.match(serialized, /bounded static timing detail/);
  assert.match(serialized, /v2scancorephases\.json/);
});

test("buildScanTimingSummary handles scans without timing artifacts", () => {
  const summary = buildScanTimingSummary({});

  assert.equal(summary.schemaVersion, SCAN_TIMING_SUMMARY_SCHEMA_VERSION);
  assert.equal(summary.truncated, false);
  assert.deepEqual(summary.lambdaPhaseTimings, []);
  assert.deepEqual(summary.scanCorePhases, []);
  assert.deepEqual(summary.moduleTimings, []);
  assert.deepEqual(summary.artifactRefs, []);
});
