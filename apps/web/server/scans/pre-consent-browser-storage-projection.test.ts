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
