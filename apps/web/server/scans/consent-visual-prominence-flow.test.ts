import assert from "node:assert/strict";
import test from "node:test";
import { consentControlAssessmentSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { consentVisualFixture, visualFixtureStartMs } from "../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison";
import { measureConsentControlVisualComparison, retainPairedConsentVisualCapture } from "../../../../packages/certscore-scan-core/src/consent-control-visual-comparison";
import { deriveMaterializedConsentControlAssessment } from "./consent-control-assessment-projector";
import { withPersistedFirstLayerConsentEvidence } from "./scan-report-consent-projection";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { buildUnifiedFindingPackets, buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";

async function source(style: Parameters<typeof consentVisualFixture>[0] = "filled") {
  const fixture = await consentVisualFixture(style);
  fixture.geometry.visualComparison = await measureConsentControlVisualComparison(fixture);
  const { geometry } = fixture;
  const bundle = { scanId: "visual-fixture", schemaVersion: "2.0", url: geometry.pageUrl, normalizedUrl: geometry.pageUrl,
    startedAt: new Date(visualFixtureStartMs).toISOString(), completedAt: new Date(visualFixtureStartMs + 2000).toISOString(),
    screenshots: [{ artifactId: "proof", path: "proof.png", capturedAtMs: 1000, url: geometry.pageUrl,
      documentIdentity: geometry.documentIdentity, consentStateAtTime: "pre_consent", pagePhase: "settled",
      retentionStatus: "available", displayStatus: "available" }],
    domSnapshots: [{ artifactId: "dom", path: "dom.json", url: geometry.pageUrl, documentIdentity: geometry.documentIdentity,
      capturedAtMs: 900, consentStateAtTime: "pre_consent", pagePhase: "settled" }],
    consentUiObservations: [{ observationId: "inventory", observedAtMs: 900, documentUrl: geometry.pageUrl,
      documentIdentity: geometry.documentIdentity, likelyPresent: true, layerInspected: "first_layer", captureStatus: "observed",
      captureDiagnostics: { completedChannels: ["dom_inventory"], timedOutChannels: [], failedChannels: [] },
      controls: geometry.candidates.map(c => ({ ...c, visible: true })), evidenceRefs: [] }],
  } as unknown as CanonicalEvidenceBundle;
  return { bundle, geometry };
}
function assess(input: Awaited<ReturnType<typeof source>>, noGo = false) {
  return deriveMaterializedConsentControlAssessment({ bundle: input.bundle, consentControlGeometryEvidence: input.geometry as unknown as Record<string, unknown>,
    noGo, requestedUrl: input.bundle.url, finalUrl: input.bundle.url });
}
function project(assessment: ReturnType<typeof assess>) {
  const runtimeArtifacts = withPersistedFirstLayerConsentEvidence({ consentControlAssessment: assessment }, { consent_control_assessment: assessment })!;
  assert.deepEqual(runtimeArtifacts.consent_control_assessment, assessment);
  const input = { runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] };
  const concerns = buildNormalizedConcerns(input);
  const packets = buildUnifiedFindingPackets(input);
  return { concerns, packets, display: buildUnifiedFindingDisplayPackets({ ...input, validationFindingLookup: new Map() }) };
}

test("typed visual evidence -> assessment -> persistence -> concern policy -> unified report finding", async () => {
  for (const style of ["filled", "outline", "equal", "reject_filled"] as const) {
    const input = await source(style), assessment = assess(input);
    assert.ok(assessment.visualComparison);
    assert.equal(assessment.controls.reject.state, "observed");
    assert.deepEqual(consentControlAssessmentSchema.parse(assessment), assessment);
    const projection = project(assessment);
    const concern = projection.concerns.find(c => c.originKey === "consent.visual_prominence.observed");
    const expected = style === "filled" || style === "outline";
    assert.equal(concern?.promotionEligibility === "eligible", expected);
    const finding = projection.display.find(f => f.unifiedFindingId === "accept_more_prominent_than_reject");
    assert.equal(finding?.presentationDecision.status === "surface", expected);
    if (finding) assert.equal(finding.confidenceBand, "moderate");
    assert.equal(projection.packets.some(p => p.unifiedFindingId === "reject_button_missing"), false);
  }
});

test("an intact early capture survives a later withheld image through the canonical finding flow", async () => {
  const input = await source();
  const image = input.bundle.screenshots[0]!;
  image.artifactId = "screenshot_pre_consent_settled";
  image.captureMethod = "primary_viewport_fallback";
  input.bundle.completedAt = new Date(visualFixtureStartMs + 12_000).toISOString();
  const later = structuredClone(input.geometry);
  delete later.visualComparison;
  later.capturedAt = new Date(visualFixtureStartMs + 9862).toISOString();
  later.screenshotArtifactRef = "late-proof.png";
  later.candidates.forEach(row => { row.screenshotArtifactRef = later.screenshotArtifactRef; });
  input.bundle.screenshots.push({ ...image, artifactId: "screenshot_pre_consent_geometry_proof", path: "late-proof.png",
    capturedAtMs: 10_100, displayStatus: "withheld", retentionStatus: "withheld" });
  const retained = retainPairedConsentVisualCapture({ previous: input.geometry, current: later,
    screenshots: input.bundle.screenshots, scanStartedAtMs: visualFixtureStartMs,
    previousState: { frameRevision: 1, framesStable: true }, currentState: { frameRevision: 1, framesStable: true } });
  assert.equal(retained, input.geometry);
  const assessment = assess({ ...input, geometry: retained });
  assert.deepEqual(assessment.visualComparison, input.geometry.visualComparison);
  assert.equal(assessment.visualEvidence?.status, "available");
  assert.equal(project(assessment).display.find(row => row.unifiedFindingId === "accept_more_prominent_than_reject")?.presentationDecision.status, "surface");
  assert.equal(input.bundle.screenshots[1]!.displayStatus, "withheld");
});

test("malformed, unbound, stale or withheld comparison stays neutral without changing control visibility", async () => {
  for (const change of ["withheld", "token", "bounds", "stale", "missing", "malformed"] as const) {
    const input = await source();
    if (change === "withheld") input.bundle.screenshots[0]!.displayStatus = "withheld";
    if (change === "token") input.geometry.visualComparison!.documentToken = "wrong-loader";
    if (change === "bounds") input.geometry.visualComparison!.accept.bounds[0]++;
    if (change === "stale") input.bundle.screenshots[0]!.capturedAtMs = 0;
    if (change === "missing") delete input.geometry.visualComparison;
    if (change === "malformed") input.geometry.visualComparison!.accept.fillContrast = NaN;
    const assessment = assess(input);
    assert.equal(assessment.visualComparison, undefined, change);
    assert.equal(assessment.controls.reject.state, "observed", change);
    assert.equal(project(assessment).packets.some(p => p.unifiedFindingId === "accept_more_prominent_than_reject"), false, change);
  }
  assert.equal(assess(await source(), true).visualComparison, undefined);
});

test("concern policy rejects a detached visual projection and adds no new score effect", async () => {
  const { deriveConcernPolicy } = await import("../../lib/scans/concern-policy");
  const assessment = assess(await source());
  const concern = project(assessment).concerns.find(c => c.originKey === "consent.visual_prominence.observed")!;
  const valid = { concern, consentControlAssessment: assessment, rawEvidence: concern.evidenceBundle.rawEvidence, evidenceStrengthFlags: concern.evidenceStrengthFlags };
  assert.equal(deriveConcernPolicy(valid).promotionEligibility, "eligible");
  assert.deepEqual(deriveConcernPolicy(valid).scoreEffects, []);
  assert.equal(deriveConcernPolicy({ ...valid, consentControlAssessment: undefined }).promotionEligibility, "blocked");
  const altered = structuredClone(valid.rawEvidence)!;
  const projection = altered.consentVisualProminence as { assessmentSourceHash: string };
  projection.assessmentSourceHash = "fnv1a-00000000";
  assert.equal(deriveConcernPolicy({ ...valid, rawEvidence: altered }).promotionEligibility, "blocked");
});
