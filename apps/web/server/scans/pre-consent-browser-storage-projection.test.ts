import assert from "node:assert/strict";
import test from "node:test";

import { buildPreConsentBrowserStorageProjection } from "./pre-consent-browser-storage-projection";

test("projects retained pre-consent local and session storage keys", () => {
  const projection = buildPreConsentBrowserStorageProjection({
    scanId: "scan-1",
    runtimeArtifacts: {
      storageSummary: {
        localStorageKeys: ["dsgvoaio_create", "dsgvoaio", "dsgvoaio"],
        retainedStorageSnapshotCount: 1,
        sessionStorageKeys: ["wpEmojiSettingsSupports"],
        storageFirstObservedAtMs: 6687,
      },
    },
  } as never);

  assert.equal(projection.assessmentStatus, "observed");
  assert.deepEqual(projection.localStorageKeys, ["dsgvoaio", "dsgvoaio_create"]);
  assert.deepEqual(projection.sessionStorageKeys, ["wpEmojiSettingsSupports"]);
  assert.equal(projection.valuesRedacted, true);
  assert.deepEqual(projection.evidenceRefs, ["CanonicalEvidenceBundle.json#storageSnapshots"]);
});

test("fails closed when no verified storage snapshot was retained", () => {
  const projection = buildPreConsentBrowserStorageProjection({
    scanId: "scan-1",
    runtimeArtifacts: {
      storageSummary: {
        localStorageKeys: ["unverified_key"],
        retainedStorageSnapshotCount: 0,
      },
    },
  } as never);

  assert.equal(projection.assessmentStatus, "not_testable");
  assert.deepEqual(projection.localStorageKeys, []);
  assert.deepEqual(projection.limitationKeys, ["storage_snapshot_not_retained"]);
});

test("projects checked absence separately from missing evidence", () => {
  const projection = buildPreConsentBrowserStorageProjection({
    scanId: "scan-1",
    runtimeArtifacts: {
      storageSummary: {
        localStorageKeys: [],
        retainedStorageSnapshotCount: 1,
        sessionStorageKeys: [],
      },
    },
  } as never);

  assert.equal(projection.assessmentStatus, "not_observed");
});

import { projectOriginBoundBrowserStorage } from "./pre-consent-browser-storage-projection";
import { storageSnapshotSchema } from "@certscore/contracts";
const snapshot = (origin = "https://www.example.com") => storageSnapshotSchema.parse({
  artifactId: "storage_snapshot_pre_consent", capturedAtMs: 25, consentStateAtTime: "pre_consent",
  url: "https://example.com/requested", localStorage: {}, sessionStorage: {},
  localStorageKeys: ["", " spaced ", "__proto__"], sessionStorageKeys: [""],
  captureContext: { contractVersion: "storage-capture-context.v1", origin, localStorageReadComplete: true, sessionStorageReadComplete: true },
});
test("origin-bound materialization preserves exact identity and never borrows the requested URL", () => {
  const result = projectOriginBoundBrowserStorage({ snapshots: [snapshot(), snapshot("https://other.example.com")], scanId: "scan", sourceHash: "b".repeat(64) });
  assert.equal(result?.contractVersion, "certscore.pre-consent-browser-storage-projection.v2");
  assert.ok(result && "entries" in result);
  assert.equal(result.entries.length, 8);
  assert.deepEqual(result.localStorageKeys, ["", " spaced ", "__proto__"]);
  assert.equal(result.entries[0]?.origin, "https://www.example.com");
  assert.equal(result.sourceHash, "b".repeat(64));
  assert.equal(result.entries[4]?.evidenceRefs[0], "CanonicalEvidenceBundle.json#storageSnapshots/1");
  assert.deepEqual(buildPreConsentBrowserStorageProjection({ scanId: "scan", runtimeArtifacts: { storageSummary: { originBoundProjection: result } } } as never), result);
  assert.throws(() => buildPreConsentBrowserStorageProjection({ scanId: "wrong", runtimeArtifacts: { storageSummary: { originBoundProjection: result } } } as never));
});
test("historical snapshots cannot supply origins and failed reads cannot establish absence", () => {
  const old = { ...snapshot(), captureContext: undefined };
  assert.equal(projectOriginBoundBrowserStorage({ snapshots: [old], scanId: "scan", sourceHash: "b".repeat(64) }), undefined);
  const failed = snapshot(); failed.localStorageKeys = []; failed.sessionStorageKeys = [];
  failed.captureContext!.localStorageReadComplete = false;
  assert.equal(projectOriginBoundBrowserStorage({ snapshots: [failed], scanId: "scan", sourceHash: "b".repeat(64) })?.assessmentStatus, "not_testable");
  assert.equal(storageSnapshotSchema.safeParse({ ...snapshot(), captureContext: { ...snapshot().captureContext, origin: "https://example.com/path" } }).success, false);
});
