import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { CmpRuntimeObservation, ConsentUiObservation } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  buildLateConsentGeometryShadowArtifact,
  LATE_CONSENT_GEOMETRY_SHADOW_BUDGET_MS,
  preConsentRuntimeScanner,
  shouldCaptureLateConsentGeometryShadow,
} from "./scanners/pre-consent-runtime-scanner.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";

const directCmp = [{
  observationId: "cmp_runtime_test",
  confidence: 0.96,
  directVsInferred: "direct",
  signals: [{ confidence: 0.96, signalType: "network_request" }],
}] as CmpRuntimeObservation[];

const noControls = { controls: [] } as unknown as ConsentUiObservation;

test("late consent geometry shadow is strictly limited to direct CMP/no-control consent-proof cases", () => {
  assert.equal(LATE_CONSENT_GEOMETRY_SHADOW_BUDGET_MS, 1_500);
  assert.equal(shouldCaptureLateConsentGeometryShadow({
    captureScope: "consent_proof",
    cmpRuntimeObservations: directCmp,
    consentGeometryDiagnosticWritten: false,
    consentObservation: noControls,
    enabled: true,
  }), true);

  for (const override of [
    { enabled: false },
    { captureScope: "runtime_evidence" as const },
    { consentGeometryDiagnosticWritten: true },
    { cmpRuntimeObservations: [] as CmpRuntimeObservation[] },
    { consentObservation: { controls: [{ actionType: "accept_all" }] } as unknown as ConsentUiObservation },
  ]) {
    assert.equal(shouldCaptureLateConsentGeometryShadow({
      captureScope: "consent_proof",
      cmpRuntimeObservations: directCmp,
      consentGeometryDiagnosticWritten: false,
      consentObservation: noControls,
      enabled: true,
      ...override,
    }), false);
  }
});

test("inferred or weak CMP signals cannot trigger late geometry shadow capture", () => {
  for (const cmpRuntimeObservations of [
    [{ ...directCmp[0], directVsInferred: "inferred" }],
    [{ ...directCmp[0], confidence: 0.89 }],
    [{ ...directCmp[0], signals: [{ confidence: 0.8, signalType: "network_request" }] }],
  ] as CmpRuntimeObservation[][]) {
    assert.equal(shouldCaptureLateConsentGeometryShadow({
      captureScope: "consent_proof",
      cmpRuntimeObservations,
      consentGeometryDiagnosticWritten: false,
      consentObservation: noControls,
      enabled: true,
    }), false);
  }
});

test("shadow artifact is explicitly non-projectable and does not mutate canonical observation", () => {
  const consentObservation = {
    captureStatus: "observed",
    controls: [],
    inventoryOutcome: "complete_empty",
  } as unknown as ConsentUiObservation;
  const canonicalBefore = structuredClone(consentObservation);
  const artifact = buildLateConsentGeometryShadowArtifact({
    capturedAtMs: 25_100,
    cmpRuntimeObservations: directCmp,
    consentObservation,
    durationMs: 1_250,
  });

  assert.equal(artifact.shadowOnly, true);
  assert.equal(artifact.productionProjectable, false);
  assert.equal(artifact.canonicalEvidenceModified, false);
  assert.equal(artifact.captureStatus, "incomplete");
  assert.equal("geometry" in artifact, false);
  assert.deepEqual(consentObservation, canonicalBefore);
});

test("eligible scan retains shadow geometry without adding it to canonical result", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-late-consent-geometry-shadow-"));
  try {
    const url = server.urlFor("consent-cmp-script-offscreen-footer-settings");
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      artifactWriter,
      captureScope: "consent_proof",
      internalBudgetMs: 3_500,
      lateConsentGeometryShadowEnabled: true,
      normalizedUrl: url,
      routeFulfillers: [{
        body: "window.OneTrust = window.OneTrust || { fixture: true };",
        contentType: "application/javascript",
        urlPattern: /^https:\/\/cdn\.cookielaw\.org\/scripttemplates\/otSDKStub\.js/i,
      }],
      scanStartedAtMs: Date.now(),
      screenshotMode: "never",
      url,
      waitMode: "fast",
    });
    const artifact = JSON.parse(await readFile(
      path.join(tempRoot, "out", "ConsentControlLateGeometryShadow.json"),
      "utf8",
    )) as {
      canonicalEvidenceModified: boolean;
      durationMs: number;
      productionProjectable: boolean;
      shadowOnly: boolean;
      timing: Array<{ label: string }>;
    };

    assert.equal(result.cmpRuntimeObservations.some((cmp) => cmp.confidence >= 0.9), true);
    assert.equal(result.consentUiObservations[0]?.controls.length, 0);
    assert.equal(artifact.shadowOnly, true);
    assert.equal(artifact.productionProjectable, false);
    assert.equal(artifact.canonicalEvidenceModified, false);
    assert.equal(result.artifactRefs.some((ref) => /LateGeometryShadow/i.test(ref.path ?? "")), false);
    assert.equal(result.moduleRun.timingBreakdown?.some((entry) =>
      entry.label === "late consent geometry shadow"
    ), false);
    assert.equal(artifact.timing.some((entry) => entry.label === "late consent geometry shadow"), true);
    assert.ok(artifact.durationMs <= LATE_CONSENT_GEOMETRY_SHADOW_BUDGET_MS);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
