import assert from "node:assert/strict";
import test from "node:test";

import {
  PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION,
  preConsentBrowserStorageProjectionSchema,
} from "./pre-consent-browser-storage-projection";

function projection(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION,
    scanId: "scan-1",
    assessmentStatus: "observed",
    consentState: "pre_interaction",
    localStorageKeys: ["consent_preferences"],
    sessionStorageKeys: ["navigation_state"],
    retainedStorageSnapshotCount: 1,
    storageFirstObservedAtMs: 1200,
    valuesRedacted: true,
    evidenceRefs: ["CanonicalEvidenceBundle.json#storageSnapshots"],
    limitationKeys: [],
    sourceHash: "a".repeat(64),
    sourceLane: "runtime_evidence",
    ...overrides,
  };
}

test("accepts bounded redacted pre-consent browser storage evidence", () => {
  assert.equal(preConsentBrowserStorageProjectionSchema.parse(projection()).assessmentStatus, "observed");
  assert.equal(preConsentBrowserStorageProjectionSchema.parse(projection({
    assessmentStatus: "not_observed",
    localStorageKeys: [],
    sessionStorageKeys: [],
  })).assessmentStatus, "not_observed");
});

test("rejects status upgrades that are unsupported by retained storage keys or snapshots", () => {
  assert.equal(preConsentBrowserStorageProjectionSchema.safeParse(projection({
    localStorageKeys: [],
    sessionStorageKeys: [],
  })).success, false);
  assert.equal(preConsentBrowserStorageProjectionSchema.safeParse(projection({
    retainedStorageSnapshotCount: 0,
  })).success, false);
  assert.equal(preConsentBrowserStorageProjectionSchema.safeParse(projection({
    assessmentStatus: "not_observed",
  })).success, false);
});
