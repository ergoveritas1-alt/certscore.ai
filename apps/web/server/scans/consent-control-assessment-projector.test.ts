import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { cmpPreferencesEvidenceSchema, consentControlAssessmentSchema, deriveConsentSurfaceInspectionOutcome, type CanonicalEvidenceBundle, type FirstLayerOptOutGeometryDiagnostic } from "@certscore/contracts";
import { deriveLaneOwnedConsentSurfaceInspection, deriveMaterializedConsentControlAssessment, deriveWs01ConsentControlAssessment } from "./consent-control-assessment-projector";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { bindNarrowGeometry } from "./gdpr-narrow-geometry";
import { projectPublicFirstLayerConsentEvidence } from "../../lib/scans/public-first-layer-consent-evidence";

test("materialized consent retains exact query and fragment for its California child while document comparison stays normalized", () => {
  const finalUrl="https://redirect-fixture.test/?locale=en#/overview";
  const source=bundle([], {url:finalUrl,captureStatus:"no_evidence",likelyPresent:false});
  source.startedAt="2026-07-27T18:04:00.000Z";
  const assessment=deriveMaterializedConsentControlAssessment({bundle:source,finalUrl,noGo:false,
    consentSurfaceInspection:completeInspection("no_surface_observed",false)});
  const child=projectCaliforniaPrivacyReview(source,{verificationStatus:"verified",sha256:"a".repeat(64)},finalUrl)!;
  assert.ok(child);
  assessment.californiaPrivacyReview=child;
  assert.equal(assessment.scan.finalUrl,finalUrl);
  assert.equal(assessment.document.canonicalDocumentId,"https://redirect-fixture.test/?locale=en");
  assert.ok(consentControlAssessmentSchema.safeParse(JSON.parse(JSON.stringify(assessment))).success);
  assert.equal(consentControlAssessmentSchema.safeParse({...assessment,californiaPrivacyReview:{...child,documentUrl:finalUrl.replace("overview","other")}}).success,false);
});

for (const finalUrl of ["https://redirect-fixture.test/web/", "https://redirect-fixture.test/en/"]) {
  test(`materialized consent preserves the retained final URL for California binding: ${finalUrl}`, () => {
    const source = bundle([], { url: finalUrl, captureStatus: "no_evidence", likelyPresent: false });
    source.startedAt = "2026-07-27T18:04:00.000Z";
    const assessment = deriveMaterializedConsentControlAssessment({
      bundle: source, finalUrl, requestedUrl: "https://redirect-fixture.test/", noGo: false,
      consentSurfaceInspection: completeInspection("no_surface_observed", false),
    });
    const child = projectCaliforniaPrivacyReview(source, { verificationStatus: "verified", sha256: "a".repeat(64) }, finalUrl)!;
    assert.ok(child);
    assessment.californiaPrivacyReview = child;
    assert.equal(assessment.scan.finalUrl, finalUrl);
    assert.equal(assessment.document.canonicalDocumentId, finalUrl.slice(0, -1));
    assert.ok(consentControlAssessmentSchema.safeParse(JSON.parse(JSON.stringify(assessment))).success);
    assert.equal(consentControlAssessmentSchema.safeParse({
      ...assessment, californiaPrivacyReview: { ...child, documentUrl: `${finalUrl}other` },
    }).success, false, "a genuinely different California document must still block publication");
  });
}

function bundle(
  controls: Array<Record<string, unknown>>,
  options: {
    captureStatus?: "observed" | "no_evidence" | "incomplete";
    defaultToggleStatesObserved?: boolean | null;
    likelyPresent?: boolean;
    nonEssentialDefaultsOff?: boolean | null;
    precheckedOptionalPurposeCount?: number;
    url?: string;
  } = {},
) {
  const url = options.url ?? "https://oxfam.org/en";
  return {
    scanId: "scan-oxfam-fixture",
    schemaVersion: "2.0",
    completedAt: "2026-07-27T18:04:10.000Z",
    url,
    normalizedUrl: url,
    // Canonical parsing defaults this inventory to []; this direct unit fixture
    // must supply it before exercising the California child projection.
    policySurfaceObservations: [],
    domSnapshots: [{
      artifactId: "dom-pre-consent",
      capturedAtMs: 6_500,
      consentStateAtTime: "pre_consent",
      pagePhase: "settled",
      path: "artifacts/dom-pre-consent.json",
      url,
    }],
    consentUiObservations: [{
      observationId: "consent-ui-pre-consent",
      observedAtMs: 6_500,
      likelyPresent: options.likelyPresent ?? true,
      layerInspected: "first_layer",
      captureStatus: options.captureStatus ?? "observed",
      captureDiagnostics: {
        completedChannels: ["dom_inventory"],
        failedChannels: [],
        timedOutChannels: [],
      },
      defaultToggleStatesObserved: options.defaultToggleStatesObserved,
      nonEssentialDefaultsOff: options.nonEssentialDefaultsOff,
      precheckedOptionalPurposeCount: options.precheckedOptionalPurposeCount,
      controls,
      evidenceRefs: [],
    }],
  } as unknown as CanonicalEvidenceBundle;
}

function completeInspection(outcome: string, observed: boolean) {
  return {
    actionableControlObserved: observed,
    consentSurfaceObserved: observed,
    coverageStatus: "complete",
    evidenceChannels: [{
      channel: "page_script_inventory",
      status: observed ? "observed" : "not_observed",
    }],
    inspectionCompleted: true,
    limitationKeys: [],
    observedAtMs: 6_500,
    outcome,
  };
}

test("historical bundles without DOM snapshots leave footer evidence unavailable", () => {
  const source: Partial<CanonicalEvidenceBundle> = bundle([], { likelyPresent: false });
  delete source.domSnapshots;
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source as CanonicalEvidenceBundle,
    noGo: false,
  });

  assert.equal(assessment.scan.finalUrl, source.url);
  assert.equal(assessment.sameVisitFooterCapture?.resolution, "primary_snapshot_missing");
  assert.equal(projectPublicFirstLayerConsentEvidence(assessment, source.scanId!)?.optOutSurfaces?.footerLinks.length ?? 0, 0);
});

test("main-frame comparison persists through a limited whole-frame assessment without upgrading coverage", async () => {
  const {consentVisualFixture, visualFixtureStartMs} = await import("../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison");
  const {measureConsentControlVisualComparison} = await import("../../../../packages/certscore-scan-core/src/consent-control-visual-comparison");
  const fixture = await consentVisualFixture("equal"), g = fixture.geometry;
  g.captureTiming = {version: "consent_geometry_capture_timing.v1", mainFrameCompletedAt: g.capturedAt, completedAt: g.capturedAt};
  g.controlInspection!.structuralCoverage = "limited"; g.controlInspection!.captureCoverage.documentAndFramesStable = false;
  g.controlInspection!.reasonCodes = ["structural_control_inventory_incomplete"];
  g.mainFrameVisualCapture = {version: "consent_main_frame_visual_capture.v1", documentToken: g.documentIdentity!.token,
    pageUrl: g.pageUrl, capturedAt: g.capturedAt, screenshotArtifactRef: g.screenshotArtifactRef!, inventoryComplete: true,
    frameRevisionBeforeImage: 1, frameRevisionAtMainRead: 1, candidateIds: g.candidates.map(c => c.candidateId)};
  g.visualComparison = await measureConsentControlVisualComparison(fixture);
  assert.ok(g.visualComparison);
  const source = bundle(g.candidates.map(c => ({...c, visible: true})), {url: g.pageUrl});
  source.startedAt = new Date(visualFixtureStartMs).toISOString(); source.completedAt = new Date(visualFixtureStartMs + 10000).toISOString();
  const time = Date.parse(g.capturedAt) - visualFixtureStartMs;
  Object.assign(source.domSnapshots[0]!, {capturedAtMs: time, documentIdentity: g.documentIdentity});
  Object.assign(source.consentUiObservations[0]!, {documentIdentity: g.documentIdentity, documentUrl: g.pageUrl, observedAtMs: time,
    inventoryOutcome: "partial", captureDiagnostics: {completedChannels: ["dom_inventory", "geometry"], failedChannels: [], timedOutChannels: []}});
  source.screenshots = [{artifactId: "screenshot_pre_consent_geometry_proof", path: g.screenshotArtifactRef!, url: g.pageUrl,
    documentIdentity: g.documentIdentity, capturedAtMs: fixture.screenshotCapturedAtMs - visualFixtureStartMs, consentStateAtTime: "pre_consent", pagePhase: "network_idle",
    captureMethod: "primary_viewport_fallback", retentionStatus: "available", displayStatus: "available"}];
  const assessment = deriveMaterializedConsentControlAssessment({bundle: source, consentControlGeometryEvidence: g as unknown as Record<string, unknown>,
    consentSurfaceInspection: {...completeInspection("actionable_surface_observed", true), observedAtMs: time}, finalUrl: g.pageUrl, requestedUrl: g.pageUrl, noGo: false});
  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.controls.accept.state, "observed"); assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.visualComparison?.version, "consent_control_visual_comparison.v2");
  assert.deepEqual(consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(assessment))).visualComparison, assessment.visualComparison);
});

function geometry(candidates: Array<Record<string, unknown>>, summary: {
  firstLayerAccept: boolean;
  firstLayerReject: boolean;
  firstLayerOptions: boolean;
  limitations?: string[];
} = {
  firstLayerAccept: true,
  firstLayerReject: true,
  firstLayerOptions: true,
}) {
  return {
    artifactVersion: "2.0",
    observedAtMs: 8_700,
    pageUrl: "https://oxfam.org/en",
    candidates,
    summary: {
      cmpDetected: true,
      cmpName: "Drupal EU Cookie Compliance",
      confidence: 0.96,
      ...summary,
    },
  };
}

test("binds a legacy independent recovery's verified opt-out to its own document", () => {
  const label = "Do Not Sell My Personal Information";
  const selectorHint = "#consent-privacy-opt-out";
  const documentIdentity = {source: "cdp_loader_id" as const, token: "recovery-loader"};
  const textPath = "artifacts/dom-text-pre-consent-recovery.txt";
  const textId = "dom_text_pre_consent_recovery";
  const candidate = {
    candidateId: "candidate-opt-out", actionType: "do_not_sell_share", matchStrength: "direct", tagName: "button",
    label, selectorHint, layer: "first_layer", decisionStatus: "confirmed_visible", enabled: true,
    intersectsViewport: true, boundingBox: {width: 180, height: 32}, consentContextConfirmed: true,
    frameContext: {frameKind: "main_frame", frameUrl: "https://oxfam.org/en"},
  };
  const source = bundle([{actionType: "do_not_sell_share", matchStrength: "direct", label, selectorHint, tagName: "button", visible: true}]);
  source.domSnapshots[0]!.documentIdentity = {source: "cdp_loader_id", token: "initial-loader"};
  source.domSnapshots.push({...source.domSnapshots[0]!, artifactId: textId, path: textPath, capturedAtMs: 8_730, documentIdentity: undefined});
  Object.assign(source.consentUiObservations[0]!, {
    documentUrl: source.url, documentIdentity, observedAtMs: 8_610, inventoryOutcome: "complete_with_controls",
    basis: ["recovery:independent_consent_capture_completed"],
    captureDiagnostics: {completedChannels: ["dom_inventory", "geometry"], failedChannels: [], timedOutChannels: []},
    evidenceRefs: [{artifactId: textId, refId: textId, path: textPath}, {artifactId: "consent_control_geometry",
      refId: "consent_control_geometry_evidence", path: "artifacts/ConsentControlGeometryEvidence.json"}],
  });
  const artifact = {
    ...geometry([candidate]), documentIdentity, access: {status: "loaded", httpStatus: 200},
    controlInspection: {version: "control_specific_inspection.v2", structuralCoverage: "complete", retainedCandidateCount: 1,
      captureCoverage: {inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true,
        documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1}, reasonCodes: [],
      candidates: [{candidateId: candidate.candidateId, role: "decision", unresolvedIntents: []}]},
  };
  const assessment = deriveMaterializedConsentControlAssessment({bundle: source, consentControlGeometryEvidence: artifact, noGo: false});
  assert.equal(assessment.document.canonicalDocumentToken, documentIdentity.token);
  assert.equal(assessment.controls.privacyOptOut.state, "observed");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.coverage.status, "limited");
  const publicEvidence = projectPublicFirstLayerConsentEvidence(assessment, source.scanId);
  assert.equal(publicEvidence?.privacyOptOutControlObserved, true);
  assert.equal(publicEvidence?.privacyOptOutControlInventoryComplete, false);

  for (const problem of ["missing reference", "different loader", "different selector", "newer document", "stale geometry", "no-go"]) {
    const negative = structuredClone(source);
    const wrongArtifact = structuredClone(artifact);
    if (problem === "missing reference") negative.consentUiObservations[0]!.evidenceRefs.pop();
    if (problem === "different loader") wrongArtifact.documentIdentity.token = "wrong-loader";
    if (problem === "different selector") wrongArtifact.candidates[0]!.selectorHint = "#different-control";
    if (problem === "newer document") negative.domSnapshots.at(-1)!.documentIdentity = {source: "cdp_loader_id", token: "newer-loader"};
    if (problem === "stale geometry") wrongArtifact.observedAtMs = 8_600;
    const result = deriveMaterializedConsentControlAssessment({bundle: negative,
      consentControlGeometryEvidence: wrongArtifact, noGo: problem === "no-go"});
    assert.equal(result.controls.privacyOptOut.state, "unknown", problem);
  }
});

test("persists the original opt-out geometry diagnostic only with verified bytes and the matching observation", () => {
  const source = bundle([]);
  const observation = source.consentUiObservations[0]!;
  const documentIdentity = {source: "cdp_loader_id" as const, token: "loader"};
  Object.assign(source.domSnapshots[0]!, {documentIdentity});
  Object.assign(observation, {documentIdentity, documentUrl: source.url, captureDiagnostic: {
    version: "consent_capture_diagnostic.v1", refreshPolicy: "final_consent_geometry_refresh.v3",
    observationId: observation.observationId, documentToken: "loader", inventoryObservedAtMs: observation.observedAtMs,
    geometryObservedAtMs: 5_000, geometryBinding: "matched", geometryMinusInventoryMs: -1_500,
    outcome: "timed_out", skipReason: null, attempted: true, elapsedMs: 1_100,
  }});
  const data: FirstLayerOptOutGeometryDiagnostic = {
    version: "first_layer_opt_out_geometry_diagnostic.v1", structuralCoverage: "limited",
    captureCoverage: {inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true,
      documentAndFramesStable: true, frameCount: 2, capturedFrameCount: 1},
    framesAtStart: 2, frameOutcomes: ["captured", "timed_out"],
    retainedCandidateCount: 0, inspectedCandidateCount: 0, unresolvedOptOutCount: 0, classifiedOptOutCount: 0,
    otherUnresolvedCount: 0, candidates: [],
  };
  const payload = {...geometry([]), observedAtMs: 5_000, artifactVersion: "consent_control_geometry.v1", documentIdentity,
    controlInspection: {version: "control_specific_inspection.v4", structuralCoverage: "limited",
      captureCoverage: data.captureCoverage, reasonCodes: [], retainedCandidateCount: 0, candidates: []},
    firstLayerOptOutGeometry: data};
  const bytes = JSON.stringify(payload);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sizeBytes = Buffer.byteLength(bytes);
  const bound = bindNarrowGeometry(payload, {scanId: source.scanId, auxiliaryArtifacts: [
    {fileName: "ConsentControlGeometryEvidence.json", sha256, sizeBytes},
  ]}, sha256, sizeBytes)!;
  const assess = (raw: Record<string, unknown>) => deriveMaterializedConsentControlAssessment({
    bundle: source, consentControlGeometryEvidence: raw, finalUrl: source.url, noGo: false,
  });
  const baseline = assess(payload);
  const retained = assess(bound);
  assert.deepEqual(retained.controls, baseline.controls);
  assert.deepEqual(retained.coverage.firstLayerOptOutGeometry, {sourceSha256: sha256, data});
  assert.equal(baseline.coverage.firstLayerOptOutGeometry, undefined);
  assert.equal(assess({...bound, observedAtMs: 5_001}).coverage.firstLayerOptOutGeometry, undefined);
});

test("Oxfam A/R/O remains observed when a later same-document state is collapsed", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      { actionType: "accept_all", label: "Accept all cookies", visible: true, layer: "first_layer" },
      { actionType: "reject_all", label: "Accept only essential cookies", visible: true, layer: "first_layer" },
      { actionType: "manage_preferences", label: "Cookie Settings", visible: true, layer: "first_layer" },
    ]),
    consentControlGeometryEvidence: geometry([], {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: false,
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.artifactVersion, "2.2");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("limited coordinator coverage preserves observed controls without certifying the inventory", () => {
  const url = "https://site-under-test.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Decline", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Customise", visible: true, layer: "first_layer" },
  ], { url });
  source.domSnapshots = [];
  source.screenshots = [{
    artifactId: "screenshot-pre-consent",
    capturedAtMs: 6_400,
    consentStateAtTime: "pre_consent",
    pagePhase: "dom_content_loaded",
    path: "artifacts/screenshot-pre-consent.png",
    url,
  }];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory"],
    failedChannels: [],
    timedOutChannels: ["accessibility_tree"],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      actionableControlObserved: true,
      consentSurfaceObserved: true,
      coverageStatus: "limited",
      evidenceChannels: [
        { channel: "page_script_inventory", status: "observed" },
        { channel: "accessibility_tree", status: "inspection_incomplete" },
      ],
      inspectionCompleted: false,
      limitationKeys: ["accessibility_inventory_incomplete"],
      observedAtMs: 6_500,
      outcome: "actionable_surface_observed",
    },
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.coverage.requiredChannels, ["dom_inventory", "geometry"]);
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("withheld screenshots do not erase verified same-document structured inventory", () => {
  const url = "https://shop.example/";
  const token = "document-token-shop";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Decline", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Customise", visible: true, layer: "first_layer" },
  ], { url });
  source.domSnapshots[0]!.documentIdentity = { source: "cdp_loader_id", token };
  source.consentUiObservations[0]!.documentIdentity = { source: "cdp_loader_id", token };
  source.consentUiObservations[0]!.documentUrl = url;
  source.consentUiObservations[0]!.inventoryOutcome = "complete_with_controls";
  source.consentUiObservations[0]!.basis = [
    "recovery:bounded_same_session_consent_packet_completed",
  ];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "accessibility_tree", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };
  source.screenshots = [{
    artifactId: "screenshot_pre_consent_geometry_proof",
    capturedAtMs: 6_490,
    captureMethod: "primary_viewport_fallback",
    consentStateAtTime: "pre_consent",
    displayStatus: "withheld",
    displayWithheldReason: "safety_check_unavailable",
    documentIdentity: { source: "cdp_loader_id", token },
    pagePhase: "network_idle",
    path: "/artifacts/screenshot-pre-consent-geometry-proof.png",
    retentionStatus: "withheld",
    safetyFailureCode: "finalization_deadline_exceeded",
    url,
    withheldReason: "safety_check_unavailable",
  }];
  const geometryEvidence = geometry([
    {
      candidateId: "accept",
      actionType: "accept_all",
      label: "Accept",
      layer: "first_layer",
      decisionStatus: "confirmed_visible",
      screenshotArtifactRef: "/lane/screenshot-pre-consent-geometry-proof.png",
    },
    {
      candidateId: "reject",
      actionType: "reject_all",
      label: "Decline",
      layer: "first_layer",
      decisionStatus: "confirmed_visible",
      screenshotArtifactRef: "/lane/screenshot-pre-consent-geometry-proof.png",
    },
    {
      candidateId: "options",
      actionType: "manage_preferences",
      label: "Customise",
      layer: "first_layer",
      decisionStatus: "confirmed_visible",
      screenshotArtifactRef: "/lane/screenshot-pre-consent-geometry-proof.png",
    },
  ]) as Record<string, unknown>;
  geometryEvidence.documentIdentity = { source: "cdp_loader_id", token };
  geometryEvidence.screenshotArtifactRef = "/lane/screenshot-pre-consent-geometry-proof.png";

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometryEvidence,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.coverage.status, "complete");
  assert.equal(assessment.coverage.requiredChannels.includes("screenshot"), false);
  assert.equal(assessment.coverage.incompleteChannels.includes("screenshot"), false);
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.visualEvidence?.status, "withheld");
  assert.ok(assessment.visualEvidence?.reasonCodes.includes("finalization_deadline_exceeded"));
  assert.equal(source.screenshots[0]?.retentionStatus, "withheld");

  source.screenshots[0] = {
    ...source.screenshots[0]!,
    displayStatus: "available",
    displayWithheldReason: undefined,
    retentionStatus: "available",
    safetyFailureCode: undefined,
    withheldReason: undefined,
  };
  const retainedAssessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometryEvidence,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.deepEqual(retainedAssessment.controls, assessment.controls);
  assert.equal(retainedAssessment.visualEvidence?.status, "available");
  assert.notEqual(retainedAssessment.provenance.sourceHash, assessment.provenance.sourceHash);

  assert.equal(retainedAssessment.assessmentStatus, "complete");
  assert.equal(retainedAssessment.coverage.status, "complete");
  assert.equal(retainedAssessment.controls.accept.state, "observed");
  assert.equal(retainedAssessment.controls.reject.state, "observed");
  assert.equal(retainedAssessment.controls.options.state, "observed");

  source.screenshots[0]!.documentIdentity = { source: "cdp_loader_id", token: "unrelated-document" };
  const wrongDocumentVisual = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometryEvidence,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    noGo: false,
  });
  assert.equal(wrongDocumentVisual.visualEvidence?.status, "unavailable");
  assert.deepEqual(wrongDocumentVisual.visualEvidence?.artifactRefs, []);
  assert.deepEqual(wrongDocumentVisual.controls, assessment.controls);

  source.screenshots = [];
  const missingVisual = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometryEvidence,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    noGo: false,
  });
  assert.equal(missingVisual.visualEvidence?.status, "unavailable");
  assert.deepEqual(missingVisual.controls, assessment.controls);
  assert.equal(missingVisual.assessmentStatus, "complete");

  source.consentUiObservations[0]!.documentIdentity = { source: "cdp_loader_id", token: "stale-document" };
  const mismatched = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometryEvidence,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    noGo: false,
  });
  assert.equal(mismatched.assessmentStatus, "limited");
  assert.equal(mismatched.document.identityStatus, "mismatched");
  assert.equal(mismatched.controls.accept.state, "unknown");
  assert.equal(mismatched.controls.reject.state, "unknown");
  assert.equal(mismatched.controls.options.state, "unknown");
});

test("limited coordinator coverage keeps an empty first-layer inventory unknown", () => {
  const url = "https://non-actionable.example/";
  const source = bundle([], { url });
  source.consentUiObservations[0]!.layerInspected = "unknown";
  source.consentUiObservations[0]!.basis = ["settled_control_inventory_completed"];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "accessibility_tree"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      actionableControlObserved: false,
      consentSurfaceObserved: true,
      coverageStatus: "limited",
      evidenceChannels: [
        { channel: "page_script_inventory", status: "observed" },
        { channel: "accessibility_tree", status: "observed" },
      ],
      inspectionCompleted: false,
      limitationKeys: ["cmp_runtime_without_actionable_surface"],
      observedAtMs: 6_500,
      outcome: "non_actionable_surface_observed",
    },
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("an incomplete inventory paired to the final settled frame invalidates an earlier empty inventory", () => {
  const url = "https://settled-frame-incomplete.example/";
  const source = bundle([], {
    captureStatus: "no_evidence",
    likelyPresent: false,
    url,
  });
  source.consentUiObservations[0]!.basis = [
    "settled_control_inventory_completed",
    "recapture:paired_settled_frame_inventory_incomplete",
  ];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "accessibility_tree"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: url,
      summary: {
        firstLayerAccept: false,
        firstLayerReject: false,
        firstLayerOptions: false,
        cmpDetected: false,
        confidence: 0,
        limitations: ["Main-frame consent geometry was unavailable."],
      },
      viewport: { width: 0, height: 0 },
      candidates: [],
    },
    consentSurfaceInspection: null,
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("a later verified same-session packet supersedes historical incomplete inventory diagnostics", () => {
  const url = "https://recovered-packet.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Settings", visible: true, layer: "first_layer" },
  ], { url });
  source.screenshots = [{
    artifactId: "screenshot_pre_consent_packet_recovery",
    capturedAtMs: 6_490,
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "artifacts/recovery.png",
    url,
  }];
  source.consentUiObservations[0]!.documentUrl = url;
  source.consentUiObservations[0]!.inventoryOutcome = "complete_with_controls";
  source.consentUiObservations[0]!.boundedSameSessionRecoveryOutcome = "completed";
  source.consentUiObservations[0]!.basis = [
    "recapture:post_settle_inventory_incomplete",
    "geometry_capture_unavailable",
    "recovery:bounded_same_session_consent_packet_completed",
  ];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: url,
      summary: {
        firstLayerAccept: true,
        firstLayerReject: false,
        firstLayerOptions: true,
        cmpDetected: true,
        confidence: 0.9,
        limitations: [],
      },
      viewport: { width: 1440, height: 900 },
      candidates: [],
    },
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("a relevant inaccessible frame remains fail-closed despite observed controls and geometry", () => {
  const url = "https://blocking-frame.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Decline", visible: true, layer: "first_layer" },
  ], { url });
  source.consentUiObservations[0]!.inventoryOutcome = "frame_inaccessible";
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };
  source.consentUiObservations[0]!.inventoryDiagnostics = {
    candidateContainerCount: 1,
    candidateControlCount: 2,
    retainedControlCount: 2,
    inspectedFrameCount: 2,
    inaccessibleFrameCount: 1,
    blockingInaccessibleFrameCount: 1,
    nonBlockingInaccessibleFrameCount: 0,
    nonBlockingInaccessibleFrameReasonCodes: [],
    inventorySources: ["viewport"],
    candidateLabels: ["Accept", "Decline"],
    rejectionReasons: ["frame_inaccessible"],
    timingMarkers: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: url,
      summary: {
        firstLayerAccept: true,
        firstLayerReject: true,
        firstLayerOptions: false,
        cmpDetected: true,
        confidence: 0.9,
        limitations: [],
      },
      viewport: { width: 1440, height: 900 },
      candidates: [],
    },
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("limited no-evidence DOM inventory does not certify first-layer negatives", () => {
  const url = "https://no-banner.example/";
  const source = bundle([], {
    captureStatus: "no_evidence",
    likelyPresent: false,
    url,
  });
  source.consentUiObservations[0]!.basis = ["settled_control_inventory_completed"];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      actionableControlObserved: false,
      consentSurfaceObserved: false,
      coverageStatus: "limited",
      evidenceChannels: [{ channel: "page_script_inventory", status: "observed" }],
      inspectionCompleted: false,
      limitationKeys: ["network_cmp_inspection_incomplete"],
      observedAtMs: 6_500,
      outcome: "inspection_incomplete",
    },
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("a failed non-inventory channel does not erase completed typed A/R/O controls", () => {
  const url = "https://typed-controls.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Reject", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Options", visible: true, layer: "first_layer" },
  ], { url });
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory"],
    failedChannels: ["network_cmp"],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("complete dismiss-only inventory projects actionable surface with A/R/O not observed", () => {
  const url = "https://dismiss-only.example/";
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([{
      actionType: "other",
      artifactRef: "CanonicalEvidenceBundle.json#dismiss-close",
      classifierReasonCodes: ["matched_dismiss", "match_strength_direct"],
      label: "Close",
      layer: "first_layer",
      matchStrength: "direct",
      semanticRole: "dismiss",
      visible: true,
    }], { url }),
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.coverage.status, "complete");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.evidence[0]?.intent, "dismiss");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("WS01 complete dismiss-only observation projects into ConsentControlAssessment v2", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    completedAt: "2026-08-02T21:06:48.000Z",
    firstLayerConsentChoices: {
      capturedAtMs: 7_501,
      capturedBeforeInteraction: true,
      controlInventoryComplete: true,
      documentUrl: "https://www.usccb.org/",
      layerInspected: "first_layer",
      normalizedChoices: [{ action: "dismiss", label: "Close", sameSurface: true }],
      sameSurfaceCandidates: true,
    },
    requestedUrl: "https://usccb.org/",
    scanId: "scan-ws01-dismiss-only",
    scanStatus: "completed",
  });

  assert.ok(assessment);
  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.document.identityStatus, "matched");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.evidence[0]?.intent, "dismiss");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
  assert.equal(assessment.provenance.sourceBundleVersion, "ws01.hybrid_runtime_evidence.v1");
});

test("WS01 incomplete consent inventory does not create a canonical negative assessment", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    firstLayerConsentChoices: {
      capturedBeforeInteraction: true,
      controlInventoryComplete: false,
      documentUrl: "https://www.usccb.org/",
      layerInspected: "first_layer",
      normalizedChoices: [{ action: "dismiss", label: "Close", sameSurface: true }],
      sameSurfaceCandidates: true,
    },
    scanId: "scan-ws01-incomplete",
    scanStatus: "completed",
  });

  assert.equal(assessment, null);
});

test("WS01 complete empty first-layer inventory projects binary not-observed controls", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    completedAt: "2026-08-05T22:00:00.000Z",
    firstLayerConsentChoices: {
      capturedAtMs: 8_000,
      capturedBeforeInteraction: true,
      controlInventoryComplete: true,
      documentUrl: "https://example.test/",
      layerInspected: "first_layer",
      normalizedChoices: [],
      sameSurfaceCandidates: true,
    },
    requestedUrl: "https://example.test/",
    scanId: "scan-ws01-complete-empty",
    scanStatus: "completed",
  });

  assert.ok(assessment);
  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("WS01 malformed non-empty inventory fails closed instead of becoming complete empty", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    firstLayerConsentChoices: {
      capturedBeforeInteraction: true,
      controlInventoryComplete: true,
      documentUrl: "https://example.test/",
      layerInspected: "first_layer",
      normalizedChoices: [{ action: "accept", label: "", sameSurface: true }],
      sameSurfaceCandidates: true,
    },
    scanId: "scan-ws01-malformed-inventory",
    scanStatus: "completed",
  });

  assert.equal(assessment, null);
});

test("geometry projection retains inline and persistent options presentation", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      { actionType: "accept_all", label: "Accept all cookies", visible: true, layer: "first_layer" },
      { actionType: "reject_all", label: "Reject all cookies", visible: true, layer: "first_layer" },
    ]),
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "inline-options",
        actionType: "manage_preferences",
        label: "Cookie Consent Tool",
        layer: "first_layer",
        presentationType: "inline_link",
        placementType: "action_cluster",
        enabled: true,
        decisionStatus: "confirmed_visible",
      },
      {
        candidateId: "footer-options",
        actionType: "manage_preferences",
        label: "Cookie Settings",
        layer: "footer",
        presentationType: "persistent_link",
        enabled: true,
        decisionStatus: "footer_or_policy_link",
      },
    ]),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "inline-options")?.presentationType,
    "inline_link",
  );
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "inline-options")?.placementType,
    "action_cluster",
  );
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "footer-options")?.presentationType,
    "persistent_link",
  );
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "footer-options")?.layer,
    "deeper_layer",
  );
});

test("geometry projection derives retained timing from capturedAt when observedAtMs is absent", () => {
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
  ]);
  source.startedAt = "2026-07-27T18:04:00.000Z";
  const geometryEvidence = geometry([{
    candidateId: "captured-at-options",
    actionType: "manage_preferences",
    label: "Customise",
    layer: "first_layer",
    decisionStatus: "confirmed_visible",
  }]) as Record<string, unknown>;
  delete geometryEvidence.observedAtMs;
  geometryEvidence.capturedAt = "2026-07-27T18:04:08.700Z";

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometryEvidence,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  const options = assessment.evidence.find((row) => row.evidenceId === "captured-at-options");
  assert.equal(options?.observedAtMs, 8_700);
  assert.equal(assessment.controls.options.firstObservedAtMs, 8_700);
});

test("geometry projection carries a custom first-layer settings control into ConsentControlAssessment v2", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      { actionType: "accept_all", label: "Accept All", visible: true, layer: "first_layer" },
      { actionType: "reject_all", label: "Accept only essential", visible: true, layer: "first_layer" },
    ]),
    consentControlGeometryEvidence: geometry([{
      candidateId: "custom-settings",
      actionType: "manage_preferences",
      classifierReasonCodes: ["matched_options", "match_strength_direct", "context_satisfied"],
      label: "Cookie settings",
      layer: "first_layer",
      presentationType: "unknown",
      enabled: true,
      decisionStatus: "confirmed_visible",
    }]),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.options.state, "observed");
  const options = assessment.evidence.find((row) => row.evidenceId === "custom-settings");
  assert.equal(options?.intent, "options");
  assert.equal(options?.layer, "first_layer");
  assert.equal(options?.visible, true);
  assert.equal(options?.actionable, true);
});

test("geometry intent conflicts keep the assessment limited instead of proving reject absence", () => {
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Manage Preferences", visible: true, layer: "first_layer" },
    {
      actionType: "other",
      classifierReasonCodes: ["visible_accessible_intent_conflict"],
      label: "Do Not Sell or Share My Personal Information",
      visible: true,
      layer: "first_layer",
    },
  ], { captureStatus: "incomplete" });
  source.consentUiObservations[0]!.inventoryOutcome = "partial";

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "intent-conflict",
        actionType: "other",
        classifierReasonCodes: ["visible_accessible_intent_conflict"],
        label: "Do Not Sell or Share My Personal Information",
        layer: "first_layer",
        enabled: true,
        decisionStatus: "ambiguous",
      },
    ], {
      firstLayerAccept: true,
      firstLayerReject: false,
      firstLayerOptions: true,
      limitations: ["visible_accessible_intent_conflict"],
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "observed");
});

test("CNN retained geometry keeps an explicitly inventoried missing reject as not_observed", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      {
        actionType: "accept_all",
        label: "Accept All",
        matchedTerm: "accept all",
        matchedLocale: "en",
        visible: true,
        layer: "first_layer",
      },
      {
        actionType: "manage_preferences",
        label: "Show Purposes, Opens the preference center dialog",
        matchedTerm: "preference center",
        matchedLocale: "en",
        visible: true,
        layer: "first_layer",
      },
    ], { captureStatus: "incomplete", url: "https://edition.cnn.com/" }),
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: "https://edition.cnn.com/",
      observedAtMs: 0,
      candidates: [
        {
          candidateId: "candidate_1",
          actionType: "accept_all",
          label: "Accept All",
          layer: "first_layer",
          enabled: true,
          decisionStatus: "confirmed_visible",
        },
        {
          candidateId: "candidate_2",
          actionType: "manage_preferences",
          label: "Show Purposes, Opens the preference center dialog",
          layer: "first_layer",
          enabled: true,
          decisionStatus: "confirmed_visible",
        },
      ],
      summary: {
        firstLayerAccept: true,
        firstLayerReject: false,
        firstLayerOptions: true,
        cmpDetected: true,
        cmpName: "OneTrust",
        confidence: 0.89,
      },
    },
    consentSurfaceInspection: {
      actionableControlObserved: true,
      consentSurfaceObserved: true,
      coverageStatus: "complete",
      inspectionCompleted: true,
      limitationKeys: ["pre_consent_runtime_incomplete"],
      observedAtMs: 26_870,
      outcome: "actionable_surface_observed",
    },
    finalUrl: "https://edition.cnn.com/",
    noGo: false,
    requestedUrl: "https://cnn.com/",
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.coverage.status, "complete");
});

test("CNN production artifact binds typed controls to the retained redirected screenshot document", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: {
      scanId: "scan_1785253386257_cnn.com",
      schemaVersion: "2.0",
      completedAt: "2026-07-28T15:43:41.691Z",
      url: "https://cnn.com/",
      normalizedUrl: "https://cnn.com/",
      domSnapshots: [],
      consentUiObservations: [{
        observationId: "consent_ui_pre_consent",
        observedAtMs: 16_194,
        captureStatus: "observed",
        captureDiagnostics: {
          completedChannels: [],
          timedOutChannels: [],
          failedChannels: [],
        },
        likelyPresent: true,
        basis: ["first_layer", "rapid_consent_surface"],
        layerInspected: "first_layer",
        controls: [
          {
            label: "Accept All",
            actionType: "accept_all",
            visible: true,
            layer: "first_layer",
            matchedTerm: "accept all",
            matchedLocale: "en",
            matchStrength: "direct",
            classifierReasonCodes: [],
          },
          {
            label: "Show Purposes, Opens the preference center dialog",
            actionType: "manage_preferences",
            visible: true,
            layer: "first_layer",
            matchedTerm: "preference center",
            matchedLocale: "en",
            matchStrength: "direct",
            classifierReasonCodes: [],
          },
        ],
      }],
      screenshots: [
        {
          artifactId: "screenshot-pre-consent-1",
          capturedAtMs: 11_636,
          captureMethod: "primary_viewport_fallback",
          path: "screenshots/pre-consent-1.png",
          url: "https://edition.cnn.com/",
          pagePhase: "pre_consent",
          consentStateAtTime: "pre_consent",
        },
        {
          artifactId: "screenshot-pre-consent-2",
          capturedAtMs: 29_670,
          captureMethod: "primary_viewport_fallback",
          path: "screenshots/pre-consent-2.png",
          url: "https://edition.cnn.com/",
          pagePhase: "pre_consent",
          consentStateAtTime: "pre_consent",
        },
      ],
    } as unknown as CanonicalEvidenceBundle,
    consentSurfaceInspection: {
      actionableControlObserved: true,
      consentSurfaceObserved: true,
      coverageStatus: "limited",
      evidenceChannels: [
        { channel: "viewport_screenshot", status: "observed" },
        { channel: "page_script_inventory", status: "observed" },
        { channel: "cmp_runtime", status: "observed" },
        { channel: "dom_snapshot", status: "inspection_incomplete" },
        { channel: "geometry", status: "inspection_incomplete" },
      ],
      inspectionCompleted: false,
      limitationKeys: ["pre_consent_runtime_partial", "consent_surface_inspection_runtime_partial"],
      observedAtMs: 16_194,
      outcome: "actionable_surface_observed",
    },
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: "https://cnn.com/",
      candidates: [],
    },
    finalUrl: "https://edition.cnn.com/",
    noGo: false,
    requestedUrl: "https://cnn.com/",
  });

  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.document.observedDocumentIds, ["https://edition.cnn.com/"]);
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "unknown");
});

test("explicit observation document URL survives a requested-to-final redirect", () => {
  const requestedUrl = "https://redirect.example/";
  const finalUrl = "https://redirect.example/gb";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Continue without accepting", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Personalise", visible: true, layer: "first_layer" },
  ], { url: requestedUrl });
  source.domSnapshots[0]!.url = requestedUrl;
  source.consentUiObservations[0]!.documentUrl = finalUrl;

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl,
    noGo: false,
    requestedUrl,
  });

  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.document.observedDocumentIds, [finalUrl]);
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("browser document token binds query-changing consent evidence to the canonical final document", () => {
  const initialUrl = "https://example.test/consent?step=initial";
  const finalUrl = "https://example.test/consent?step=final";
  const documentIdentity = { source: "cdp_loader_id" as const, token: "loader-query-stable" };
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Reject", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Options", visible: true, layer: "first_layer" },
  ], { url: finalUrl });
  source.consentUiObservations[0]!.documentUrl = initialUrl;
  source.consentUiObservations[0]!.documentIdentity = documentIdentity;
  source.domSnapshots[0]!.url = finalUrl;
  source.domSnapshots[0]!.documentIdentity = documentIdentity;
  source.screenshots = [{
    artifactId: "screenshot_pre_consent_settled",
    capturedAtMs: 6_400,
    captureMethod: "primary_viewport_fallback",
    path: "artifacts/screenshot.png",
    url: initialUrl,
    documentIdentity,
    pagePhase: "network_idle",
    consentStateAtTime: "pre_consent",
  }];

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      observedAtMs: 6_600,
      pageUrl: initialUrl,
      documentIdentity,
      candidates: [],
      summary: {
        firstLayerAccept: false,
        firstLayerReject: false,
        firstLayerOptions: false,
        cmpDetected: true,
        confidence: 0.9,
      },
    },
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl,
    noGo: false,
    requestedUrl: "https://example.test/",
  });

  assert.equal(assessment.document.identityStatus, "matched");
  assert.equal(assessment.document.canonicalDocumentToken, documentIdentity.token);
  assert.deepEqual(assessment.document.observedDocumentTokens, [documentIdentity.token]);
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.ok(assessment.evidence.every((evidence) => evidence.documentId === finalUrl));
  assert.ok(assessment.evidence.every((evidence) => evidence.documentToken === documentIdentity.token));
});

test("query-changing consent evidence with a different browser document token stays unknown", () => {
  const initialUrl = "https://example.test/consent?step=initial";
  const finalUrl = "https://example.test/consent?step=final";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
  ], { url: finalUrl });
  source.consentUiObservations[0]!.documentUrl = initialUrl;
  source.consentUiObservations[0]!.documentIdentity = { source: "cdp_loader_id", token: "loader-initial" };
  source.domSnapshots[0]!.url = finalUrl;
  source.domSnapshots[0]!.documentIdentity = { source: "cdp_loader_id", token: "loader-final" };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl,
    noGo: false,
    requestedUrl: "https://example.test/",
  });

  assert.equal(assessment.document.identityStatus, "mismatched");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("earlier redirect-document controls do not poison a later completed final-document inventory", () => {
  const requestedUrl = "https://redirect-history.example/";
  const finalUrl = "https://redirect-history.example/gb";
  const source = bundle([
    { actionType: "accept_all", label: "Continue", visible: true, layer: "first_layer" },
  ], { url: requestedUrl });
  source.consentUiObservations[0]!.observedAtMs = 1_000;
  source.consentUiObservations[0]!.documentUrl = requestedUrl;
  source.consentUiObservations.push({
    ...source.consentUiObservations[0]!,
    observationId: "consent-ui-final-document",
    observedAtMs: 2_000,
    documentUrl: finalUrl,
    controls: [
      { actionType: "accept_all", classifierReasonCodes: [], label: "Accept", visible: true, layer: "first_layer" },
      { actionType: "reject_all", classifierReasonCodes: [], label: "Reject", visible: true, layer: "first_layer" },
      { actionType: "manage_preferences", classifierReasonCodes: [], label: "Options", visible: true, layer: "first_layer" },
    ],
  });

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl,
    noGo: false,
    requestedUrl,
  });

  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.document.observedDocumentIds, [finalUrl]);
  assert.equal(assessment.evidence.some((row) => row.label === "Continue"), false);
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("an explicit conflicting observation document fails closed despite a final-page screenshot", () => {
  const requestedUrl = "https://redirect.example/";
  const finalUrl = "https://redirect.example/gb";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
  ], { url: requestedUrl });
  source.consentUiObservations[0]!.documentUrl = requestedUrl;
  source.screenshots = [{
    artifactId: "final-screenshot",
    capturedAtMs: 6_400,
    consentStateAtTime: "pre_consent",
    pagePhase: "dom_content_loaded",
    path: "artifacts/final.png",
    url: finalUrl,
  }];

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl,
    noGo: false,
    requestedUrl,
  });

  assert.equal(assessment.document.identityStatus, "mismatched");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("mismatched auxiliary geometry does not poison canonical typed bundle evidence", () => {
  const canonicalUrl = "https://canonical.example/final";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Reject", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Options", visible: true, layer: "first_layer" },
  ], { url: canonicalUrl });
  source.consentUiObservations[0]!.documentUrl = canonicalUrl;

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      observedAtMs: 8_700,
      pageUrl: "https://redirect.example/interstitial",
      candidates: [{
        candidateId: "redirect-accept",
        actionType: "accept_all",
        label: "Continue",
        layer: "first_layer",
        decisionStatus: "confirmed_visible",
        enabled: true,
      }],
      summary: {
        firstLayerAccept: false,
        firstLayerReject: false,
        firstLayerOptions: false,
        cmpDetected: false,
        confidence: 0.9,
      },
    },
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: canonicalUrl,
    noGo: false,
    requestedUrl: "https://canonical.example/",
  });

  assert.equal(assessment.document.identityStatus, "matched");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.ok(assessment.limitations.some((limitation) => limitation.code === "geometry_document_mismatch"));
  assert.ok(assessment.contradictions.some(
    (contradiction) => contradiction.reasonCode === "geometry_document_mismatch_does_not_erase_bundle_evidence",
  ));
});

test("complete same-document no-surface coverage produces factual not-observed values", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([], { captureStatus: "no_evidence", likelyPresent: false }),
    consentControlGeometryEvidence: geometry([], {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: false,
    }),
    consentSurfaceInspection: completeInspection("no_surface_observed_complete_coverage", false),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.surface.firstObservedAtMs, null, "inspection time is not a banner appearance");
  assert.equal(assessment.surface.lastObservedAtMs, null);
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("a retained loading empty inventory cannot be promoted by a stale complete inspection", () => {
  const captured = bundle([], { captureStatus: "no_evidence", likelyPresent: false });
  captured.consentUiObservations[0]!.documentReadyState = "loading";
  const assessment = deriveMaterializedConsentControlAssessment({ bundle: captured,
    consentControlGeometryEvidence: geometry([], { firstLayerAccept: false, firstLayerReject: false, firstLayerOptions: false }),
    consentSurfaceInspection: completeInspection("no_surface_observed_complete_coverage", false),
    finalUrl: "https://oxfam.org/en", noGo: false, requestedUrl: "https://oxfam.org/en",
  });
  assert.equal(assessment.assessmentStatus, "limited");
  for (const control of ["accept", "reject", "options"] as const) assert.equal(assessment.controls[control].state, "unknown");
  assert.equal(assessment.surface.firstObservedAtMs, null);
});

test("first-layer save with every observed optional default off is both options and necessary-only refusal", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      {
        actionType: "save_preferences",
        label: "Save settings and proceed",
        visible: true,
        layer: "first_layer",
      },
    ], {
      defaultToggleStatesObserved: true,
      nonEssentialDefaultsOff: true,
      precheckedOptionalPurposeCount: 0,
    }),
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "save-settings",
        actionType: "save_preferences",
        label: "Save settings and proceed",
        layer: "first_layer",
        decisionStatus: "confirmed_visible",
      },
    ], {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: true,
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(
    assessment.evidence.some((evidence) =>
      evidence.intent === "reject" &&
      evidence.classifier?.reasonCodes.includes("save_preferences_with_all_optional_defaults_off")
    ),
    true,
  );
});

test("retained reject-with-subscription evidence cannot project as a free reject control", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      {
        actionType: "accept_all",
        label: "Accetta e continua",
        visible: true,
        layer: "first_layer",
      },
      {
        actionType: "reject_all",
        label: "Rifiuta e abbonati",
        visible: true,
        layer: "first_layer",
        classifierReasonCodes: [
          "matched_reject",
          "variant_reject_with_subscription",
        ],
      },
      {
        actionType: "manage_preferences",
        label: "Preferenze",
        visible: true,
        layer: "first_layer",
      },
    ]),
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "paid-reject",
        actionType: "reject_all",
        label: "Rifiuta e abbonati",
        layer: "first_layer",
        decisionStatus: "confirmed_visible",
        classifierReasonCodes: [
          "matched_reject",
          "variant_reject_with_subscription",
        ],
      },
    ], {
      firstLayerAccept: true,
      firstLayerReject: true,
      firstLayerOptions: true,
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  const paidDeclineEvidence = assessment.evidence.find(
    (evidence) => evidence.label === "Rifiuta e abbonati",
  );
  assert.ok(paidDeclineEvidence);
  assert.equal(paidDeclineEvidence.intent, "reject");
  assert.equal(paidDeclineEvidence.controlVariant, "reject_with_subscription");
  assert.equal(paidDeclineEvidence.actionable, true);
});

test("no-go evidence cannot create missing-control negatives", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([], { captureStatus: "incomplete", likelyPresent: false }),
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      coverageStatus: "limited",
      evidenceChannels: [],
      inspectionCompleted: false,
      limitationKeys: ["scan_blocked"],
      outcome: "inspection_incomplete",
    },
    finalUrl: "https://oxfam.org/en",
    noGo: true,
    noGoReasonCodes: ["bot_blocked"],
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("redirected-document evidence cannot be attributed to a different final document", () => {
  const source = bundle([
    { actionType: "accept_all", label: "Accept all cookies", visible: true, layer: "first_layer" },
  ]);
  source.domSnapshots[0]!.url = "https://interstitial.example/choose-country";

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.document.identityStatus, "mismatched");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.surface.status, "unknown");
});

for (const control of [
  { label: "Decide later", tagName: "button", classifierReasonCodes: [] },
  { label: "Learn more", tagName: "a", classifierReasonCodes: ["ambiguous_information_control"] },
]) test(`an unclassified ${control.tagName} beside verified Options cannot establish Accept/Reject absence`, () => {
  const g = geometry([{
    candidateId: "unresolved", actionType: "other", ...control,
    layer: "first_layer", consentContextConfirmed: true, enabled: true,
    intersectsViewport: true, boundingBox: { width: 120, height: 40 }, decisionStatus: "ambiguous",
  }], { firstLayerAccept: false, firstLayerReject: false, firstLayerOptions: true });
  const result = deriveMaterializedConsentControlAssessment({
    bundle: bundle([{ actionType: "manage_preferences", label: "Cookie Settings", visible: true, layer: "first_layer" }]),
    consentControlGeometryEvidence: g, consentSurfaceInspection: completeInspection("actionable_surface_observed", true), noGo: false,
  });
  assert.equal(result.controls.options.state, "observed");
  assert.equal(result.controls.accept.state, "unknown");
  assert.equal(result.controls.reject.state, "unknown");
  assert.equal(result.assessmentStatus, "limited");
  assert.ok(result.coverage.reasonCodes.includes("unresolved_visible_consent_decision"));
});

test("unverified AX positives stay limited while independently verified DOM controls survive", () => {
  const result = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      { actionType: "accept_all", label: "Accept cookies", visible: true, layer: "first_layer" },
      { actionType: "manage_preferences", label: "Privacy Center", visible: true, tagName: "ax-node", selectorHint: "ax:7", layer: "first_layer" },
    ]),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true), noGo: false,
  });
  assert.equal(result.controls.accept.state, "observed");
  assert.equal(result.controls.options.state, "unknown");
  assert.ok(result.coverage.reasonCodes.includes("accessibility_control_proof_unverified"));
});

test("a challenged consent session remains limited when runtime coverage continues", () => {
  const b = bundle([], { likelyPresent: false, captureStatus: "no_evidence" });
  b.consentUiObservations[0]!.inventoryOutcome = "complete_empty";
  const g = { ...geometry([], { firstLayerAccept: false, firstLayerReject: false, firstLayerOptions: false }), access: { status: "loaded", httpStatus: 498 } };
  const result = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: g,
    consentSurfaceInspection: completeInspection("no_surface_observed_complete_coverage", false), noGo: false });
  assert.equal(result.assessmentStatus, "limited");
  assert.equal(result.controls.accept.state, "unknown");
  assert.ok(result.coverage.reasonCodes.includes("consent_session_access_limited"));
});

function independentConsentLaneFixture() {
  const b = bundle([{ actionType: "accept_all", label: "Accept all cookies", visible: true, layer: "first_layer" }]);
  const identity = { source: "cdp_loader_id" as const, token: "consent-document-token" };
  b.consentUiObservations[0]!.documentUrl = "https://oxfam.org/en";
  b.consentUiObservations[0]!.documentIdentity = identity;
  b.domSnapshots[0]!.documentIdentity = identity;
  b.scanLaneRuns = [{ laneId: "consent_proof", executionOutcome: "success" }] as CanonicalEvidenceBundle["scanLaneRuns"];
  b.scanEvidenceLaneAssessment = { lanes: { consent: "usable" } } as CanonicalEvidenceBundle["scanEvidenceLaneAssessment"];
  return { b, g: { ...geometry([], { firstLayerAccept: true, firstLayerReject: false, firstLayerOptions: false }), documentIdentity: identity } };
}

test("three retained document bindings preserve consent evidence despite another lane's blocked final URL", () => {
  const { b, g } = independentConsentLaneFixture();
  g.pageUrl = "https://oxfam.org/en/";
  b.domSnapshots[0]!.url = g.pageUrl;
  b.consentUiObservations[0]!.documentUrl = g.pageUrl;
  const result = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: g,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true), noGo: true,
    finalUrl: "https://oxfam.org/blocked" });
  assert.equal(result.controls.accept.state, "observed");
  assert.equal(result.document.canonicalDocumentId, "https://oxfam.org/en");
  assert.equal(result.scan.finalUrl, g.pageUrl);
  assert.equal(result.scan.noGo, false);
});

test("missing or mismatched consent binding cannot override a blocked document", () => {
  for (const missing of ["geometry", "observation", "snapshot", "lane"] as const) {
    const { b, g } = independentConsentLaneFixture();
    if (missing === "geometry") g.documentIdentity = { source: "cdp_loader_id", token: "other" };
    if (missing === "observation") delete b.consentUiObservations[0]!.documentIdentity;
    if (missing === "snapshot") delete b.domSnapshots[0]!.documentIdentity;
    if (missing === "lane") b.scanLaneRuns = [];
    const result = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: g,
      consentSurfaceInspection: completeInspection("actionable_surface_observed", true), noGo: true,
      finalUrl: "https://oxfam.org/blocked" });
    assert.equal(result.controls.accept.state, "unknown", missing);
    assert.equal(result.scan.noGo, true, missing);
  }
});

test("runtime loading stays scoped while the materializer preserves consent document guards", () => {
  for (const mismatch of [false, true]) {
    const { b, g } = independentConsentLaneFixture();
    b.consentUiObservations[0] = {
      ...b.consentUiObservations[0]!, controls: [], likelyPresent: false,
      captureStatus: "no_evidence", inventoryOutcome: "complete_empty", documentReadyState: "complete",
      basis: ["settled_control_inventory_completed", "geometry:captured"],
      captureDiagnostics: { completedChannels: ["dom_inventory", "geometry"], failedChannels: [], timedOutChannels: [] },
    };
    b.modulesRun = [{ moduleName: "preConsentRuntimeScanner", status: "partial", startedAt: b.startedAt, errors: [], evidenceRefs: [] }];
    b.runtimeCoverage = {
      coverageStatus: "limited_partial", limitationKeys: ["runtime_page_inventory_document_loading"], notes: [], silentEmpty: false,
      fallbackModesUsed: [], observationCounts: { networkEvents: 0, thirdPartyRequests: 0, cookieEvents: 0,
        cookiesBeforeConsent: 0, normalizedVendors: 0, observedJourneys: 0 },
    };
    if (mismatch) b.consentUiObservations[0]!.documentIdentity = { source: "cdp_loader_id", token: "another-document" };
    const inspection = deriveConsentSurfaceInspectionOutcome(b);
    const evidence = { ...geometry([], { firstLayerAccept: false, firstLayerReject: false, firstLayerOptions: false }),
      documentIdentity: mismatch ? { source: "cdp_loader_id", token: "another-document" } : g.documentIdentity };
    const result = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: evidence,
      consentSurfaceInspection: inspection, noGo: false });
    for (const action of ["accept", "reject", "options"] as const) {
      assert.equal(result.controls[action].state, mismatch ? "unknown" : "not_observed", action);
    }
    assert.equal(result.provenance.projectorVersion, "2.2.38");
    assert.deepEqual(b.runtimeCoverage!.limitationKeys, ["runtime_page_inventory_document_loading"]);
  }
});

test("new materialization preserves legacy classifier provenance rather than inventing a registry version", () => {
  const result = deriveMaterializedConsentControlAssessment({ bundle: bundle([{ actionType: "accept_all", label: "Accept", visible: true }]), noGo: false });
  assert.equal(result.provenance.projectorVersion, "2.2.38");
  assert.equal(result.evidence[0]?.classifier?.registryVersion, "consent-control-label-registry");
});


test("a browser error document never establishes a complete no-control inventory", () => {
  const { b, g } = independentConsentLaneFixture();
  const url = "chrome-error://chromewebdata/";
  b.consentUiObservations[0] = { ...b.consentUiObservations[0]!, documentUrl: url, controls: [], captureStatus: "no_evidence", likelyPresent: false, inventoryOutcome: "complete_empty" };
  b.domSnapshots[0]!.url = url;
  const result = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: { ...g, pageUrl: url, access: { status: "loaded", httpStatus: 200 } },
    consentSurfaceInspection: completeInspection("no_surface_observed_complete_coverage", false), finalUrl: "https://oxfam.org/en", noGo: false });
  assert.equal(result.assessmentStatus, "limited");
  for (const control of Object.values(result.controls)) assert.equal(control.state, "unknown");
  assert.ok(result.coverage.reasonCodes.includes("consent_session_access_limited"));
});

test("an unusable consent visit retains its distinct assessment reason through the public CMP projection",async()=>{
  const {projectCmpAudit}=await import("../../lib/scans/cmp-audit-projection");
  for(const reason of ["blank_or_unusable_page","loading_or_stalled"] as const){
    const {b,g}=independentConsentLaneFixture();
    const result=deriveMaterializedConsentControlAssessment({bundle:b,consentControlGeometryEvidence:{...g,access:{status:"timeout",httpStatus:200}},
      consentSurfaceInspection:completeInspection("indeterminate_limited_coverage",false),noGo:false,noGoReasonCodes:[reason]});
    const audit=projectCmpAudit({scanId:result.scan.scanId,consentControlAssessment:result,consentVendor:"OneTrust"});
    assert.equal(audit.experience?.mode,"capture_limited");
    assert.ok(audit.experience?.availability?.reasonCodes.includes(reason));
    assert.ok(audit.experience?.availability?.reasonCodes.includes("consent_session_access_limited"));
    assert.equal(audit.experience?.availability?.sourceAssessmentHash,result.provenance.sourceHash);
    assert.ok(audit.rows.every(row=>row.status==="Not assessed"));
  }
});


test("AX navigation uncertainty survives materialization without suppressing independent positive controls", () => {
  const source = bundle([{ actionType: "accept_all", label: "Accept all", visible: true, layer: "first_layer" }]);
  source.consentUiObservations[0]!.basis = [...(source.consentUiObservations[0]!.basis ?? []), "unresolved_visible_consent_decision"];
  source.consentUiObservations[0]!.inventoryOutcome = "partial";
  source.consentUiObservations[0]!.captureStatus = "incomplete";
  const assessment = deriveMaterializedConsentControlAssessment({ bundle: source, consentControlGeometryEvidence: null,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true), noGo: false });
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "unknown");
  assert.equal(assessment.assessmentStatus, "limited");
});

test("malformed current same-loader control inspection cannot be hidden by a complete empty inventory", () => {
  const source = bundle([], { captureStatus: "no_evidence", likelyPresent: false });
  const identity = { source: "cdp_loader_id" as const, token: "current-empty-document" };
  source.domSnapshots[0]!.documentIdentity = identity;
  source.consentUiObservations[0]!.documentIdentity = identity;
  source.consentUiObservations[0]!.documentUrl = "https://oxfam.org/en";
  source.consentUiObservations[0]!.inventoryOutcome = "complete_empty";
  const g = { ...geometry([], { firstLayerAccept: false, firstLayerReject: false, firstLayerOptions: false }),
    observedAtMs: 6_500, documentIdentity: identity,
    controlInspection: { version: "control_specific_inspection.v2", structuralCoverage: "complete", candidates: "malformed" },
  };
  const result = deriveMaterializedConsentControlAssessment({ bundle: source, consentControlGeometryEvidence: g,
    consentSurfaceInspection: completeInspection("no_surface_observed_complete_coverage", false),
    finalUrl: "https://oxfam.org/en", noGo: false });
  assert.equal(result.assessmentStatus, "limited");
  assert.equal(result.controls.accept.state, "unknown");
  assert.equal(result.controls.reject.state, "unknown");
  assert.ok(result.limitations.some(l => l.code === "structured_inspection_incomplete"));
});


test("verified independent consent binding is not overwritten by a later runtime DOM from the same URL", () => {
  const {b, g} = independentConsentLaneFixture();
  b.domSnapshots.push({...b.domSnapshots[0]!, artifactId: "runtime_dom", capturedAtMs: b.domSnapshots[0]!.capturedAtMs + 10_000,
    documentIdentity: {source: "cdp_loader_id", token: "runtime-session-token"}});
  const before = structuredClone(b);
  const result = deriveMaterializedConsentControlAssessment({bundle: b, consentControlGeometryEvidence: g,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true), noGo: false});
  assert.equal(result.document.canonicalDocumentToken, "consent-document-token");
  assert.equal(result.document.identityStatus, "matched");
  assert.equal(result.controls.accept.state, "observed");
  assert.deepEqual(b, before);
});

test("verified legacy consent evidence survives a later unbound apex recovery snapshot", () => {
  const finalUrl = "https://www.fixture.example/";
  const requested = "https://fixture.example/";
  const label = "Do Not Sell or Share My Personal Information";
  const selectorHint = "#onetrust-pc-btn-handler";
  const documentIdentity = {source: "cdp_loader_id" as const, token: "consent-loader"};
  const {b} = independentConsentLaneFixture();
  b.url = b.normalizedUrl = requested;
  const lane = b.scanLaneRuns?.[0];
  assert.ok(lane);
  lane.executionOutcome = "degraded";
  lane.accessOutcome = "representative_page";
  lane.challengeDetected = false;
  lane.startedAt = "2026-07-27T18:04:00.000Z";
  lane.completedAt = "2026-07-27T18:04:09.000Z";
  b.startedAt = lane.startedAt;
  Object.assign(b.domSnapshots[0]!, {url: finalUrl, documentIdentity, capturedAtMs: 8_755});
  b.domSnapshots.push({...b.domSnapshots[0]!, url: requested, artifactId: "dom_text_pre_consent_recovery",
    capturedAtMs: 9_100, documentIdentity: undefined});
  Object.assign(b.consentUiObservations[0]!, {documentUrl: finalUrl, documentIdentity, observedAtMs: 8_730,
    inventoryOutcome: "complete_with_controls", captureDiagnostics: {completedChannels: ["dom_inventory", "geometry"],
      failedChannels: [], timedOutChannels: []}, controls: [{actionType: "do_not_sell_share", label, selectorHint,
      matchStrength: "direct", tagName: "button", visible: true}]});
  const raw = {...geometry([{candidateId: "opt-out", actionType: "do_not_sell_share", matchStrength: "direct",
    layer: "first_layer", label, selectorHint, tagName: "button", decisionStatus: "confirmed_visible",
    consentContextConfirmed: true, enabled: true, intersectsViewport: true, boundingBox: {width: 200, height: 40},
    frameContext: {frameKind: "main_frame", frameUrl: finalUrl}}]),
    pageUrl: finalUrl, documentIdentity, capturedAt: "2026-07-27T18:04:08.700Z", access: {status: "loaded", httpStatus: 200}};
  const sizeBytes = Buffer.byteLength(JSON.stringify(raw));
  const sha256 = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  const proof = bindNarrowGeometry(raw, {scanId: b.scanId, auxiliaryArtifacts: [{fileName: "ConsentControlGeometryEvidence.json", sha256, sizeBytes}]},
    sha256, sizeBytes);
  const assess = (bundle = b, geometry = proof, final = requested, noGo = false) =>
    deriveMaterializedConsentControlAssessment({bundle, consentControlGeometryEvidence: geometry, finalUrl: final, noGo,
      consentSurfaceInspection: completeInspection("actionable_surface_observed", true)});
  const positive = assess();
  assert.equal(positive.scan.finalUrl, finalUrl);
  assert.equal(positive.controls.privacyOptOut.state, "observed");
  assert.equal(positive.controls.reject.state, "unknown");
  assert.equal(positive.coverage.status, "limited");
  assert.equal(projectPublicFirstLayerConsentEvidence(positive, b.scanId)?.privacyOptOutControlObserved, true);
  assert.equal(assess(b, raw).controls.privacyOptOut.state, "unknown");
  assert.equal(assess(b, {...proof, capturedAt: "2026-07-27T18:04:08.710Z"}).controls.privacyOptOut.state, "unknown");
  assert.equal(assess(b, proof, requested, true).controls.privacyOptOut.state, "unknown");
  const different = structuredClone(b);
  different.domSnapshots.at(-1)!.documentIdentity = {source: "cdp_loader_id", token: "new-loader"};
  assert.equal(assess(different).controls.privacyOptOut.state, "unknown");
  const wrongControl = structuredClone(b);
  wrongControl.consentUiObservations[0]!.controls[0]!.selectorHint = "#other-control";
  assert.equal(assess(wrongControl).controls.privacyOptOut.state, "unknown");
  const prematureRecovery = structuredClone(b);
  prematureRecovery.domSnapshots.at(-1)!.capturedAtMs = 8_800;
  assert.equal(assess(prematureRecovery).controls.privacyOptOut.state, "unknown");
  const otherRoute = structuredClone(b);
  otherRoute.domSnapshots.at(-1)!.url = requested + "other";
  assert.equal(assess(otherRoute, proof, requested + "other").controls.privacyOptOut.state, "unknown");
});

test("v3 preference diagnostics survive full consent materialization independently of first-layer controls", () => {
  const { b, g } = independentConsentLaneFixture();
  const initial = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: g, noGo: false });
  b.cmpPreferencesEvidence = cmpPreferencesEvidenceSchema.parse({
    contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: "bounded_cmp_preferences.v1",
    scanId: b.scanId, parentDispatchSha256: "a".repeat(64), targetUrl: b.url, finalUrl: b.url, documentToken: "preference-session-token",
    startedAt: "2026-10-14T00:00:00.000Z", completedAt: "2026-10-14T00:00:04.000Z", status: "limited",
    support: { state: "partial", provider: "HubSpot Consent Banner", recipeVersion: "bounded_cmp_preferences.v1", reason: "preference_surface_binding_unavailable" },
    action: { count: 0, intent: "options", label: null, opened: false }, controls: [], controlInventoryComplete: false,
    privacyLinks: [], declarations: [], declarationInventoryComplete: false, limitations: ["preference_surface_binding_unavailable"],
    checkpoints: { version: "cmp_partial_capture.v1", documentToken: "preference-session-token", privacyLinks: true, declarations: false, controls: false, controlsSurface: "first_layer" },
    inspectionDiagnostic: { revision: "cmp_preferences.v3", budgetMs: 17000, basicCaptureReserveMs: 1000, phase: "surface_binding",
      surfaceBinding: { version: "cmp_surface_binding.v1", mode: "aria_controls", priorMatches: 0, outcome: "missing" } },
  });
  const before = structuredClone(b);
  const result = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: g, noGo: false });
  assert.equal(result.cmpAudit?.version, "cmp_audit_assessment.v6");
  assert.equal(result.cmpAudit?.support.reason, "preference_surface_binding_unavailable");
  assert.equal(result.cmpAudit?.rows.filter(row => row.limitation?.code === "preference_surface_binding_unavailable").length, 5);
  assert.deepEqual(result.controls, initial.controls);
  assert.deepEqual(b, before);
  (b.cmpPreferencesEvidence.inspectionDiagnostic as any).revision = "unrecognized_revision";
  const malformed = deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: g, noGo: false });
  assert.equal(malformed.cmpAudit, undefined, "Unverifiable diagnostics cannot supply CMP facts");
  assert.deepEqual(malformed.controls, initial.controls);
});


test("runtime blocking does not erase a verified consent lane, but its own blocking and drift remain limited", () => {
  for (const mode of ["usable", "limited-positive", "blocked", "drift", "missing-lane"] as const) {
    const {b,g}=independentConsentLaneFixture();
    b.consentUiObservations[0]!.basis=["settled_control_inventory_completed"];
    const geometry={...g,access:{status:mode === "blocked" ? "access_no_go" : "loaded",httpStatus:mode === "blocked" ? 403 : 200}};
    if(mode === "limited-positive") b.scanEvidenceLaneAssessment!.lanes.consent="limited";
    if(mode === "drift") geometry.documentIdentity={source:"cdp_loader_id",token:"other"};
    if(mode === "missing-lane") b.scanLaneRuns=[];
    b.runtimeCoverage={coverageStatus:"limited_none",limitationKeys:["access_denied_or_forbidden_page","scan_no_go_corroborated"],notes:[],silentEmpty:false,fallbackModesUsed:[],observationCounts:{networkEvents:0,thirdPartyRequests:0,cookieEvents:0,cookiesBeforeConsent:0,normalizedVendors:0,observedJourneys:0}};
    const before=structuredClone(b);
    const inspection=deriveLaneOwnedConsentSurfaceInspection(b,geometry,{...b,scanNoGoDecision:"no_go"});
    assert.equal(inspection.limitationKeys.includes("access_denied_or_forbidden_page"),!["usable","limited-positive"].includes(mode),mode);
    const result=deriveMaterializedConsentControlAssessment({bundle:b,consentControlGeometryEvidence:geometry,consentSurfaceInspection:inspection,noGo:true});
    if(["usable","limited-positive"].includes(mode)) {
      assert.equal(result.controls.accept.state,"observed",mode);
      assert.equal(result.scan.noGo,false,mode);
    } else assert.equal(result.controls.accept.state,"unknown",mode);
    assert.deepEqual(b,before,"input evidence is not rewritten");
  }
});

test("diagnostic geometry outside consent context cannot create A/R/O or missing-Reject evidence", () => {
  const source = bundle([], { captureStatus: "no_evidence", likelyPresent: false });
  source.consentUiObservations[0]!.inventoryOutcome = "complete_empty";
  const diagnostic = geometry(["accept_all", "manage_preferences"].map((actionType, i) => ({
    candidateId: `diagnostic-${i}`, actionType, label: i ? "Manage choices" : "Accept all",
    tagName: "button", layer: "first_layer", consentContextConfirmed: false,
    decisionStatus: "confirmed_visible", enabled: true,
    diagnosticClassifications: [{productionCredit:false}],
  })), {firstLayerAccept:true,firstLayerReject:false,firstLayerOptions:true});
  const result = deriveMaterializedConsentControlAssessment({bundle:source,consentControlGeometryEvidence:diagnostic,
    consentSurfaceInspection:completeInspection("no_surface_observed_complete_coverage",false),noGo:false});
  assert.notEqual(result.controls.accept.state,"observed");
  assert.notEqual(result.controls.options.state,"observed");
  assert.equal(result.surface.status,"not_observed");
  assert.equal(result.evidence.length,0);
});

test("a static privacy heading cannot become opt-out evidence while real consent controls survive", () => {
  for (const tagName of ["h1","p","span"]) {
    const source = bundle([
      {actionType:"accept_all",label:"Accept all",tagName:"button",visible:true,layer:"first_layer"},
      {actionType:"manage_preferences",label:"Manage preferences",tagName:"button",visible:true,layer:"first_layer"},
      {actionType:"do_not_sell_share",label:"Privacy choices",tagName,visible:true,layer:"first_layer",consentContextEvidence:"local_surface"},
    ]);
    const result=deriveMaterializedConsentControlAssessment({bundle:source,noGo:false,
      consentSurfaceInspection:completeInspection("actionable_surface_observed",true)});
    assert.equal(result.controls.accept.state,"observed");
    assert.equal(result.controls.options.state,"observed");
    assert.notEqual(result.controls.privacyOptOut.state,"observed",tagName);
    assert.ok(!result.evidence.some(row=>row.label==="Privacy choices"));
  }
});

test("a retained OneTrust banner wrapper is never a first-layer opt-out control", () => {
  const source = bundle([{actionType: "accept_all", label: "Accept All", tagName: "button", visible: true}]);
  const documentIdentity = {source: "cdp_loader_id" as const, token: "onetrust-document"};
  source.domSnapshots[0]!.documentIdentity = documentIdentity;
  Object.assign(source.consentUiObservations[0]!, {documentIdentity, documentUrl: source.url});
  const wrapper = {candidateId: "banner-wrapper", tagName: "div", role: null, actionType: "do_not_sell_share",
    label: "Your Privacy Choices This site and its vendors use cookies. See Your Privacy Choices in the footer.",
    selectorHint: "#onetrust-banner-sdk", containerSelectorHint: "#onetrust-banner-sdk", semanticallyInteractive: true,
    enabled: true, layer: "first_layer", decisionStatus: "confirmed_visible"};
  const assess = (rows: Array<Record<string, unknown>>) => deriveMaterializedConsentControlAssessment({bundle: source,
    consentControlGeometryEvidence: {...geometry(rows), documentIdentity}, noGo: false,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true)});
  const result = assess([wrapper]);
  assert.equal(result.controls.privacyOptOut.state, "unknown");
  assert.equal(result.controls.accept.state, "observed");
  assert.equal(projectPublicFirstLayerConsentEvidence(result, source.scanId)?.privacyOptOutControlObserved, null);
  const realButton = {...wrapper, candidateId: "real-opt-out", tagName: "button", label: "Your Privacy Choices",
    selectorHint: "#onetrust-pc-btn-handler"};
  assert.equal(assess([wrapper, realButton]).controls.privacyOptOut.state, "observed");
});

test("a degraded representative positive consent capture preserves its verified primary document, without admitting failed or empty visits",async()=>{
  const {consentVisualFixture,visualFixtureStartMs}=await import("../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison");
  const fixture=await consentVisualFixture("equal"),g=fixture.geometry;
  const make=()=>{
    const b=bundle([], {url:g.pageUrl});b.startedAt=new Date(visualFixtureStartMs).toISOString();b.completedAt=new Date(visualFixtureStartMs+10000).toISOString();
    Object.assign(b.domSnapshots[0]!,{url:g.pageUrl,documentIdentity:g.documentIdentity,artifactId:"dom_text_pre_consent"});
    Object.assign(b.consentUiObservations[0]!,{documentIdentity:g.documentIdentity,documentUrl:g.pageUrl,likelyPresent:true,captureStatus:"observed"});
    b.domSnapshots.push({...b.domSnapshots[0]!,artifactId:"dom_text_pre_consent_recovery",url:"https://example.test/unbound-recovery",documentIdentity:undefined,capturedAtMs:9000});
    b.scanLaneRuns=[{laneId:"consent_proof",executionOutcome:"degraded",accessOutcome:"representative_page",challengeDetected:false}] as CanonicalEvidenceBundle["scanLaneRuns"];
    b.scanEvidenceLaneAssessment={lanes:{consent:"limited"}} as CanonicalEvidenceBundle["scanEvidenceLaneAssessment"];
    return b;
  };
  const geometry={...g,access:{status:"loaded",httpStatus:200}} as unknown as Record<string,unknown>;
  const original=make();const saved=structuredClone(original);
  const result=deriveMaterializedConsentControlAssessment({bundle:original,consentControlGeometryEvidence:geometry,noGo:false,finalUrl:"https://example.test/unbound-recovery"});
  assert.equal(result.document.identityStatus,"matched");assert.equal(result.scan.finalUrl,g.pageUrl);assert.deepEqual(original,saved);
  for(const mode of ["failed","challenge","empty","token","inspection"]){
    const b=make(),raw=structuredClone(geometry);
    if(mode==="failed")b.scanLaneRuns![0]!.executionOutcome="failed";
    if(mode==="challenge")b.scanLaneRuns![0]!.challengeDetected=true;
    if(mode==="empty"){b.consentUiObservations[0]!.likelyPresent=false;b.consentUiObservations[0]!.captureStatus="no_evidence";}
    if(mode==="token")b.consentUiObservations[0]!.documentIdentity={source:"cdp_loader_id",token:"wrong-document"};
    if(mode==="inspection")raw.controlInspection=undefined;
    const negative=deriveMaterializedConsentControlAssessment({bundle:b,consentControlGeometryEvidence:raw,noGo:false,finalUrl:"https://example.test/unbound-recovery"});
    assert.notEqual(negative.scan.finalUrl,g.pageUrl,JSON.stringify({mode,document:negative.document,scan:negative.scan}));assert.equal(negative.controls.reject.state,"unknown",mode);
  }
});

test("retained committed status repairs a partial consent handoff only with its own complete document proof", async () => {
  const { consentVisualFixture, visualFixtureStartMs } = await import("../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison");
  const { retainCommittedConsentHttpStatus } = await import("../../../../packages/certscore-scan-core/src/consent-committed-response");
  const { projectCmpAudit } = await import("../../lib/scans/cmp-audit-projection");
  const { geometry: g } = await consentVisualFixture("equal");
  const b = bundle([], { url: g.pageUrl });
  b.startedAt = new Date(visualFixtureStartMs).toISOString();
  Object.assign(b.domSnapshots[0]!, { url: g.pageUrl, documentIdentity: g.documentIdentity });
  Object.assign(b.consentUiObservations[0]!, { documentUrl: g.pageUrl, documentIdentity: g.documentIdentity,
    likelyPresent: true, captureStatus: "observed" });
  b.scanLaneRuns = [{ laneId: "consent_proof", executionOutcome: "degraded", accessOutcome: "representative_page", challengeDetected: false }] as CanonicalEvidenceBundle["scanLaneRuns"];
  b.scanEvidenceLaneAssessment = { lanes: { consent: "limited" } } as CanonicalEvidenceBundle["scanEvidenceLaneAssessment"];
  const binding = { url: g.pageUrl, documentIdentity: g.documentIdentity };
  const sourceAccess = { status: "loaded" as const, reasonCodes: [] };
  const materialize = (access: Parameters<typeof retainCommittedConsentHttpStatus>[0]) =>
    deriveMaterializedConsentControlAssessment({ bundle: b, consentControlGeometryEvidence: { ...g, access },
      noGo: false, finalUrl: "https://example.test/unbound-recovery" });
  assert.notEqual(materialize(sourceAccess).scan.finalUrl, g.pageUrl);
  const access = retainCommittedConsentHttpStatus(sourceAccess, { ...binding, httpStatus: 200 }, binding, binding);
  const result = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(materialize(access))));
  assert.equal(result.scan.finalUrl, g.pageUrl);
  assert.equal(result.document.identityStatus, "matched");
  const audit = projectCmpAudit({ scanId: b.scanId, consentControlAssessment: result });
  assert.equal(audit.assessmentSourceHash, result.provenance.sourceHash);
  assert.equal(audit.rows.find(row => row.id === "banner")?.status, "Observed");
  const replacement = { ...binding, documentIdentity: { source: "cdp_loader_id" as const, token: "replacement-document" } };
  assert.notEqual(materialize(retainCommittedConsentHttpStatus(sourceAccess,
    { ...binding, httpStatus: 200 }, binding, replacement)).scan.finalUrl, g.pageUrl);
  const saved = structuredClone(b);
  b.scanLaneRuns[0]!.accessOutcome = "blank_or_unusable";
  b.scanLaneRuns[0]!.executionOutcome = "failed";
  const failed = materialize(access);
  assert.notEqual(failed.scan.finalUrl, g.pageUrl);
  assert.equal(failed.controls.reject.state, "unknown");
  b.scanLaneRuns = saved.scanLaneRuns;
});

const control4SettingsLabel = 'Do Not Sell My Personal Information / Customize Settings';

// Fields retained by the November 19 Control4 re-scan's native first-layer geometry.
function settingsEntranceFixture() {
  const url = 'https://www.control4.com/';
  const identity = {source: 'cdp_loader_id' as const, token: 'control4-loader'};
  const source = bundle([], {url});
  Object.assign(source.domSnapshots[0]!, {url, documentIdentity: identity, capturedAtMs: 6318});
  Object.assign(source.consentUiObservations[0]!, {documentUrl: url, documentIdentity: identity, observedAtMs: 6318});
  const control = {
    candidateId: 'candidate_0', label: control4SettingsLabel,
    ariaLabel: control4SettingsLabel + ', Opens the preference center dialog',
    actionType: 'other', presentationType: 'dedicated_button', semanticallyInteractive: true,
    selectorHint: '#onetrust-pc-btn-handler', tagName: 'button', layer: 'first_layer', enabled: true,
    frameContext: {frameKind: 'main_frame', frameUrl: url}, decisionStatus: 'ambiguous',
    classifierReasonCodes: ['visible_accessible_intent_conflict'], consentContextConfirmed: true,
    intersectsViewport: true, clippedByScrollableAncestor: false, occlusion: {center: true},
    boundingBox: {x: 792.27, y: 766.79, width: 505.44, height: 41.61},
    computedStyle: {visibility: 'visible', display: 'inline-block', opacity: '1', pointerEvents: 'auto'},
    viewport: {width: 1366, height: 900},
  };
  const unrelated = {candidateId: 'unrelated', label: 'Accept All Cookies', actionType: 'accept_all',
    tagName: 'button', layer: 'first_layer', decisionStatus: 'confirmed_visible', enabled: true, semanticallyInteractive: true};
  const raw = {...geometry([control, unrelated], {firstLayerAccept: true, firstLayerReject: true, firstLayerOptions: false,
    limitations: ['visible_accessible_intent_conflict']}), pageUrl: url, documentIdentity: identity, observedAtMs: 6318};
  return {url, source, raw, control};
}

function bindEntranceGeometry(raw: Record<string, unknown>, scanId: string) {
  const bytes = Buffer.from(JSON.stringify(raw));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return bindNarrowGeometry(raw, {scanId, auxiliaryArtifacts: [{
    fileName: 'ConsentControlGeometryEvidence.json', sha256, sizeBytes: bytes.length,
  }]}, sha256, bytes.length)!;
}

test("a standalone sale-sharing strip projects only verified original main-frame pointer evidence", () => {
  const {raw, source, url, control} = settingsEntranceFixture();
  const label = "Do Not Sell or Share My Personal Information";
  const owner = {...control, label, ariaLabel:undefined, actionType:"do_not_sell_share", decisionStatus:"confirmed_visible",
    classifierReasonCodes:["matched_privacy_opt_out", "match_strength_direct", "context_satisfied"], matchStrength:"direct",
    tagName:"a", presentationType:"inline_link", linkDestination:"same_document", selectorHint:"#launcher",
    boundingBox:{x:0,y:875,width:1366,height:25}, computedStyle:{...control.computedStyle, position:"fixed"},
    occlusion:{checkedPoints:5,center:true,topLeft:true,topRight:true,bottomLeft:true,bottomRight:true},
    standaloneSaleSharingAnchor:{version:"standalone_sale_sharing_anchor.v1",binding:"main_document_fixed_end_inline_handler"}};
  const captureCoverage = {inventoryTruncated:false,documentReadyState:"complete",mainFrameAvailable:true,
    documentAndFramesStable:true,frameCount:2,capturedFrameCount:2};
  const read = (candidate = owner, frameSlot = 0, bind = true) => {
    const packet = {...raw, candidates:[candidate], summary:{...raw.summary, limitations:[]},
      firstLayerOptOutGeometry:{version:"first_layer_opt_out_geometry_diagnostic.v1",structuralCoverage:"complete",
        framesAtStart:2,frameOutcomes:["captured","captured"],retainedCandidateCount:1,inspectedCandidateCount:1,
        unresolvedOptOutCount:0,classifiedOptOutCount:1,otherUnresolvedCount:0,captureCoverage,
        candidates:[{ordinal:0,frameSlot,role:"decision",coverage:"classified_opt_out",confirmedVisible:true}]}};
    const assessment = deriveMaterializedConsentControlAssessment({bundle:source,finalUrl:url,noGo:false,
      consentControlGeometryEvidence: bind ? bindEntranceGeometry(packet, source.scanId) : packet});
    return projectPublicFirstLayerConsentEvidence(assessment, source.scanId)?.optOutSurfaces;
  };
  assert.deepEqual(read()?.bannerControls.map(row=>row.label),[label]);
  assert.deepEqual(read()?.footerLinks,[]);
  assert.deepEqual(read()?.vendorRefusals,[]);
  assert.deepEqual(read(owner,1)?.bannerControls,[]);
  assert.deepEqual(read(owner,0,false)?.bannerControls,[]);
  assert.deepEqual(read({...owner,occlusion:{...owner.occlusion,center:false}})?.bannerControls,[]);
});

test('the Control4 native proof records a first-layer settings entrance independently of action eligibility', () => {
  const {raw, source, url, control} = settingsEntranceFixture();
  const baseline = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false});
  const assessment = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false,
    consentControlGeometryEvidence: bindEntranceGeometry(raw, source.scanId)});
  assert.equal(assessment.controls.privacyOptOut.state, 'observed');
  const entrance = assessment.evidence.find(e => e.opensPreferenceCenter);
  assert.equal(entrance?.label, control4SettingsLabel);
  assert.equal(entrance?.layer, 'first_layer');
  assert.equal(entrance?.intent, 'privacy_opt_out');
  assert.equal(assessment.controls.reject.state, baseline.controls.reject.state);
  assert.notEqual(assessment.controls.accept.state, 'observed');
  assert.equal(assessment.coverage.status, 'limited');
  assert.equal(control.actionType, 'other');
  assert.equal(control.decisionStatus, 'ambiguous');
  assert.equal(source.consentUiObservations[0]!.controls.length, 0);
});

test('an observation-only settings entrance requires matching source, document and visible interactive geometry', () => {
  for (const [reason, patch] of Object.entries({
    hidden: {computedStyle: {visibility: 'hidden', display: 'block', opacity: '1', pointerEvents: 'auto'}},
    transparent: {computedStyle: {visibility: 'visible', display: 'block', opacity: '0', pointerEvents: 'auto'}},
    occluded: {occlusion: {center: false}}, disabled: {enabled: false}, clipped: {clippedByScrollableAncestor: true},
    footer: {layer: 'footer'}, offscreen: {intersectsViewport: false}, role: {role: 'tab'},
    foreignFrame: {frameContext: {frameKind: 'child_frame', frameUrl: 'https://other.example/'}},
    acceptConflict: {ariaLabel: 'Accept All Cookies'}, extraConflict: {classifierReasonCodes: ['visible_accessible_intent_conflict', 'conflicting_consent_decisions']},
    missingId: {candidateId: ''}, conflictingTitle: {title: 'Accept all cookies'}, conflictingValue: {value: 'Subscribe'},
    wrongSelector: {selectorHint: '#unrelated'}, generic: {tagName: 'div'}, zeroWidth: {boundingBox: {x: 1, y: 1, width: 0, height: 40}},
  })) {
    const {raw, source, url, control} = settingsEntranceFixture();
    const modified = {...raw, candidates: [{...control, ...patch}]};
    const assessment = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false,
      consentControlGeometryEvidence: bindEntranceGeometry(modified, source.scanId)});
    assert.notEqual(assessment.controls.privacyOptOut.state, 'observed', reason);
  }

  for (const reason of ['missing receipt', 'foreign scan', 'changed bytes', 'wrong loader', 'wrong observation', 'no go']) {
    const {raw, source, url} = settingsEntranceFixture();
    if (reason === 'wrong loader') raw.documentIdentity = {source: 'cdp_loader_id', token: 'different-geometry-token'};
    if (reason === 'wrong observation') source.consentUiObservations[0]!.documentIdentity = {source:'cdp_loader_id',token:'unrelated'};
    const g = reason === 'missing receipt' ? raw : bindEntranceGeometry(raw, reason === 'foreign scan' ? 'other-scan' : source.scanId);
    if (reason === 'changed bytes') Object.assign(g, {observedAtMs: 6319});
    const assessment = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: reason === 'no go', consentControlGeometryEvidence: g});
    assert.notEqual(assessment.controls.privacyOptOut.state, 'observed', reason);
  }
});

test('a visible policy-lane footer entrance remains a footer observation with no banner or click claim', () => {
  const {source, url} = settingsEntranceFixture();
  const footer = {observationId: 'footer-choices', linkText: 'Your Privacy Choices', url: 'javascript:void(0);',
    directlyLinkedFromScannedPage: true, traversalDepth: 0, linkSourcePageUrl: url, clickable: true,
    linkObservationState: 'observed', linkVisibility: 'visible', accessibleNameSource: 'text', discoveryMethod: 'footer_link'};
  const assessFooter = (observations: Array<Record<string, unknown>>, inspectionUrl = url) => {
    const original = structuredClone(source);
    Object.assign(original, {policySurfaceInspection: {privacyChoiceInspection: {documentUrl: inspectionUrl}}, policySurfaceObservations: observations});
    return deriveMaterializedConsentControlAssessment({bundle: original, finalUrl: url, noGo: false});
  };
  const result = assessFooter([footer, footer]);
  assert.deepEqual(result.optOutFooterLinks, [{label: footer.linkText, evidenceRef:'policy-surface:footer-choices', documentUrl: url}]);
  assert.notEqual(result.controls.privacyOptOut.state, 'observed');
  assert.equal(result.evidence.some(e => e.opensPreferenceCenter), false);
  for (const patch of [{linkVisibility:'hidden'}, {clickable:false}, {linkSourcePageUrl:'https://other.test/'},
    {traversalDepth:1}, {discoveryMethod:'common_path'}, {parentObservationId:'policy-parent'}, {accessibleNameSource:'none'},
    {linkText:'Privacy Policy'}, {linkText:'Unsubscribe from newsletter'}, {linkText:'Learn about our Your Privacy Choices policy'}]) {
    assert.deepEqual(assessFooter([{...footer, ...patch}]).optOutFooterLinks ?? [], []);
  }
  assert.deepEqual(assessFooter([footer], 'https://other.test/').optOutFooterLinks ?? [], []);
  const direct = {...footer, sourceScanner: "policy_surface", scenario: "policy_surface_review", selector: "a"};
  Object.assign(source, {modulesRun: [{moduleName: "policySurfaceScanner", status: "partial"}], policySurfaceObservations: [direct]});
  const partial = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false});
  assert.equal(partial.optOutFooterLinks?.length, 1);
  assert.deepEqual(partial.optOutFooterInspection, {status: "unavailable", reason: "missing_bound_inspection"});
  Object.assign(direct, {linkVisibility: "hidden"});
  assert.deepEqual(deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false}).optOutFooterLinks, []);
});

test("a cropped first-layer banner or a later named choice prevents an unsupported opt-out absence", () => {
  const {source, raw, url} = settingsEntranceFixture();
  const banner = {selectorHint: "#onetrust-banner-sdk", layer: "first_layer", intersectsViewport: true,
    boundingBox: {x: 0, y: 892, width: 1366, height: 160}};
  const project = (y: number, later = false) => {
    const b = structuredClone(source);
    if (later) Object.assign(b.consentUiObservations[0]!, {observedAtMs: raw.observedAtMs + 50, visibleChoiceLabels: ["Your Privacy Choices"]});
    const g = {...raw, candidates: [], viewport: {height: 900, width: 1366},
      containers: [{...banner, boundingBox: {...banner.boundingBox, y}}]};
    return deriveMaterializedConsentControlAssessment({bundle: b, finalUrl: url, noGo: false,
      consentControlGeometryEvidence: bindEntranceGeometry(g, b.scanId)});
  };
  assert.equal(project(892).optOutTimingLimitation?.reason, "banner_partially_in_view");
  assert.equal(project(892).controls.privacyOptOut.inspection?.status, "limited");
  assert.equal(project(700).optOutTimingLimitation, undefined);
  assert.equal(project(700, true).optOutTimingLimitation?.reason, "choice_observed_after_inventory");
});

test("an independent recovery cannot clear a choice signal on the original loader", () => {
  const {source, raw, url} = settingsEntranceFixture();
  const original = {...source.domSnapshots[0]!, artifactId: "dom_text_pre_consent", capturedAtMs: 3000,
    documentIdentity: {source: "cdp_loader_id" as const, token: "primary-document"}};
  Object.assign(original, {optOutSearch: {result: "specific_signal", documentToken: "primary-document", capturedAtMs: 3000,
    documentUrl: url, artifactId: original.artifactId}});
  source.domSnapshots.unshift(original);
  Object.assign(source.consentUiObservations[0]!, {basis: ["recovery:independent_consent_capture_completed"]});
  const g = {...raw, candidates: []};
  const assess = () => deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false,
    consentControlGeometryEvidence: bindEntranceGeometry(g, source.scanId)});
  assert.equal(assess().optOutTimingLimitation?.reason, "recovery_inventory_different_document");
  assert.equal(assess().controls.privacyOptOut.state, "unknown");
  const bundleOnly = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false});
  assert.equal(bundleOnly.optOutTimingLimitation?.inventoryAtMs, source.consentUiObservations[0]!.observedAtMs);
  Object.assign(original, {url: "https://different.example/"});
  assert.equal(assess().optOutTimingLimitation, undefined);
});

test("footer coverage distinguishes no run, unusable checkpoint, limited and completed rendered inspections", () => {
  const {source, url} = settingsEntranceFixture();
  const assess = () => deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false});
  assert.deepEqual(assess().optOutFooterInspection, {status: "unavailable", reason: "no_policy_run"});
  Object.assign(source, {modulesRun: [{moduleName: "policySurfaceScanner", status: "completed"}]});
  assert.deepEqual(assess().optOutFooterInspection, {status: "unavailable", reason: "missing_bound_inspection"});
  const inspection = {
    contractVersion: "certscore.privacy-choice-inspection.v4", homepageAccessPolicy: "representative_homepage.v1",
    documentUrl: url, capturedAt: "2026-11-19T00:00:01.000Z", sourceHash: "b".repeat(64),
    scope: "rendered_named_links_and_buttons", coverage: "complete", namedChoiceCandidateCount: 0, unnamedControlCount: 0,
    candidateEnumerationTruncated: false, uninspectedFrameCount: 0, uninspectedShadowRootCount: 0,
    supportedDocumentLanguage: true, representativeDocument: true, documentStable: true, hiddenUnnamedControlCount: 0,
    frameCount: 0, inspectedSameOriginFrameCount: 0, hiddenUninspectedFrameCount: 0, inaccessibleFrameCount: 0,
    unreadyFrameCount: 0, unprojectableFrameCount: 0, frameBudgetLimitedCount: 0, namedFrameChoiceCandidateCount: 0,
    frameInspectionWorkMs: 0, frameProofWorkMs: 0,
  };
  Object.assign(source, {policySurfaceInspection: {privacyChoiceInspection: inspection}});
  assert.equal(assess().optOutFooterInspection?.status, "complete");
  Object.assign(inspection, {coverage: "limited", unnamedControlCount: 1});
  assert.equal(assess().optOutFooterInspection?.status, "limited");
  Object.assign(inspection, {documentUrl: "https://unrelated.example/"});
  assert.equal(assess().optOutFooterInspection?.status, "unavailable");
});

test("the bound notice names the exact confirmed button and persists its distinct source through public projection", () => {
  const {raw, source, url, control} = settingsEntranceFixture();
  const label = "Do Not Sell or Share My Personal Information";
  const sentence = `Click on “X” or “Accept All” to confirm that you agree to these practices, “${label}” to customize your preferences, or “Reject Non-Necessary” to decline the use of certain cookies.`;
  const notice = {version: "onetrust.same_banner_notice.v1", bannerSelector: "#onetrust-banner-sdk", noticeSelector: "#onetrust-policy-text", sentence};
  const named = {...control, label, ariaLabel: undefined, actionType: "do_not_sell_share", decisionStatus: "confirmed_visible",
    classifierReasonCodes: ["privacy_opt_out_context", "matched_privacy_opt_out", "match_strength_direct", "context_satisfied"],
    settingsEntranceNotice: notice};
  const diagnostic = {version: "first_layer_opt_out_geometry_diagnostic.v1", structuralCoverage: "complete",
    framesAtStart: 2, frameOutcomes: ["captured", "captured"], retainedCandidateCount: 1, inspectedCandidateCount: 1,
    unresolvedOptOutCount: 0, classifiedOptOutCount: 1, otherUnresolvedCount: 0,
    captureCoverage: {inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true,
      documentAndFramesStable: true, frameCount: 2, capturedFrameCount: 2},
    candidates: [{ordinal: 0, frameSlot: 0, role: "decision", coverage: "classified_opt_out", confirmedVisible: true}]};
  const run = (patch: Record<string, unknown> = {}, bound = true, firstLayerOptOutGeometry: unknown = diagnostic) => {
    const geometry = {...raw, firstLayerOptOutGeometry, candidates: [{...named, ...patch}],
      ...(patch.actionType === "manage_preferences" ? {summary:{...raw.summary, limitations:[]}} : {})};
    return deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false,
      consentControlGeometryEvidence: bound ? bindEntranceGeometry(geometry, source.scanId) : geometry});
  };
  const result = run();
  const row = result.evidence.find(e => e.opensPreferenceCenter);
  assert.equal(row?.label, label);
  assert.equal(row.settingsEntranceSource, "same_banner_notice");
  const projected = projectPublicFirstLayerConsentEvidence(result, source.scanId);
  assert.equal(projected?.optOutSurfaces?.bannerControls[0]?.settingsEntranceSource, "same_banner_notice");
  assert.equal(result.controls.reject.state, run({settingsEntranceNotice: undefined}).controls.reject.state);
  for (const patch of [
    {settingsEntranceNotice: undefined}, {settingsEntranceNotice: {...notice, sentence: sentence.replace(label, "Accept all")}},
    {settingsEntranceNotice: {...notice, sentence: `Do not click on “${label}” to customize your preferences.`}},
    {settingsEntranceNotice: {...notice, noticeSelector: "body"}}, {settingsEntranceNotice: {...notice, bannerSelector: "body"}},
    {settingsEntranceNotice: {...notice, version: "different"}}, {decisionStatus: "ambiguous"}, {ariaLabel: "Open my account"},
    {layer: "footer"}, {selectorHint: "#some-other-button"}, {occlusion: {center: false}},
  ]) assert.equal(run(patch).evidence.some(e => e.opensPreferenceCenter), false, JSON.stringify(patch));
  assert.equal(run({}, false).evidence.some(e => e.opensPreferenceCenter), false);
  for (const witness of [null, {...diagnostic, retainedCandidateCount: 2},
    {...diagnostic, candidates: [{...diagnostic.candidates[0], frameSlot: 1}]},
    {...diagnostic, candidates: [{...diagnostic.candidates[0], confirmedVisible: false}]}]) {
    assert.equal(run({}, true, witness).evidence.some(e => e.opensPreferenceCenter), false);
  }
  assert.equal(named.actionType, "do_not_sell_share");
  assert.equal(source.consentUiObservations[0]!.controls.length, 0);
  const rightsLabel = "Your Privacy Rights";
  const rightsNotice = {...notice, sentence:"By clicking the button on the right, you can exercise your privacy rights (such as a right to opt-out of the use of certain cookies or to opt-out of the sharing of your personal information for the purposes of cross-contextual behavioral advertising)."};
  const rights = {label:rightsLabel, ariaLabel:rightsLabel + ", Opens the preference center dialog",
    actionType:"manage_preferences", settingsEntranceNotice:rightsNotice};
  const rightsAssessment = run(rights);
  assert.deepEqual(rightsAssessment.evidence.filter(e => e.label === rightsLabel).map(e => e.intent).sort(), ["options", "privacy_opt_out"]);
  assert.equal(projectPublicFirstLayerConsentEvidence(rightsAssessment, source.scanId)?.optOutSurfaces?.bannerControls[0]?.label, rightsLabel);
  assert.deepEqual(run({...rights, ariaLabel:"Open account settings"}).evidence.filter(e => e.intent === "privacy_opt_out"), []);
});

test("the starting-page footer retains pointer evidence and keeps hidden and unchecked controls out of positives", () => {
  const {url, source} = settingsEntranceFixture();
  const original = source.domSnapshots[0]!;
  original.artifactId = "dom_text_pre_consent";
  const sample = {scope: "footer", semanticRole: "link", view: "footer_position", bounds: [100, 400, 200, 30],
    testedPoints: 3, matchingPoints: 0, occludingPoints: 3};
  const packet = {version: "consent_footer_opt_out.v1", documentUrl: url, artifactId: original.artifactId,
    documentToken: original.documentIdentity!.token, snapshotAtMs: original.capturedAtMs, capturedAtMs: original.capturedAtMs + 80,
    coverage: "limited", limitations: ["unverified_control"], viewport: [800, 600], footerCount: 1, inspectedControls: 8,
    candidates: [
      {...sample, label: "Your Privacy Choices", evidenceId: "footer-control-0", visibility: "covered"},
      {...sample, label: "Do Not Sell My Personal Information", evidenceId: "footer-control-1", visibility: "rendered_exposed", matchingPoints: 2, occludingPoints: 1},
      {...sample, label: "Your Privacy Choices", evidenceId: "footer-control-2", visibility: "hidden", testedPoints: 0, occludingPoints: 0},
      {...sample, label: "Your Privacy Choices", evidenceId: "footer-control-3", visibility: "offscreen_unverified", bounds: [100, 3000, 100, 10], testedPoints: 0, occludingPoints: 0},
    ]};
  const assess = (fields = {}, noGo = false, scanId = source.scanId) => {
    Object.assign(original, {footerOptOutObservation: {...packet, ...fields}});
    return deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo, scanId});
  };
  const result = assess();
  assert.deepEqual(result.optOutFooterLinks?.map(row => row.visibility), ["covered", "rendered_exposed"]);
  assert.notEqual(result.controls.privacyOptOut.state, "observed");
  const surfaces = projectPublicFirstLayerConsentEvidence(result, source.scanId)?.optOutSurfaces;
  assert.deepEqual(surfaces?.sameVisitFooter?.otherControls.map(row => row.visibility), ["hidden", "offscreen_unverified"]);
  assert.deepEqual(surfaces?.bannerControls, []);
  assert.deepEqual(surfaces?.vendorRefusals, []);
  assert.equal(consentControlAssessmentSchema.safeParse({...result, optOutFooterLinks: [
    {...result.optOutFooterLinks![0], visibility: "rendered_exposed"}]}).success, false);
  for (const fields of [{documentUrl: url + "other"}, {documentToken: "next-loader"}, {artifactId: "recovery"},
    {snapshotAtMs: 7}, {capturedAtMs: 3}, {candidates: [{...packet.candidates[0], label: "Cookie Settings"}]},
    {candidates: [{...packet.candidates[0], occludingPoints: 0}]}]) {
    assert.equal(assess(fields).sameVisitFooter, undefined);
  }
  assert.equal(assess({}, true).sameVisitFooter, undefined);
  assert.equal(assess({}, false, "different-scan").sameVisitFooter, undefined);
  source.domSnapshots.push({...original});
  assert.equal(assess().sameVisitFooter, undefined);
  const recoveryIdentity = {source: "cdp_loader_id" as const, token: "recovery-loader"};
  source.domSnapshots[1] = {...original, artifactId: "dom_text_pre_consent_recovery",
    capturedAtMs: original.capturedAtMs + 2000, documentIdentity: recoveryIdentity};
  Object.assign(source.consentUiObservations[0]!, {documentIdentity: recoveryIdentity, layerInspected: "first_layer",
    basis: ["recovery:independent_consent_capture_completed"]});
  assert.equal(assess().sameVisitFooter, undefined);
  source.screenshots = [{artifactId: "screenshot_pre_consent", capturedAtMs: original.capturedAtMs,
    pagePhase: "network_idle", consentStateAtTime: "pre_consent", path: "/evidence/original.png", url,
    documentIdentity: original.documentIdentity}];
  const withRecovery = assess();
  assert.equal(withRecovery.sameVisitFooter?.documentToken, original.documentIdentity!.token);
  assert.equal(withRecovery.footerOriginalVisit?.recoveryToken, recoveryIdentity.token);
  assert.equal(withRecovery.optOutFooterLinks?.length, 2);
  assert.equal(consentControlAssessmentSchema.safeParse(withRecovery).success, true);
  source.screenshots[0]!.documentIdentity = recoveryIdentity;
  assert.equal(assess().sameVisitFooter, undefined);
});

test("verified main-frame placement corrects an end-of-page choice previously labeled as a banner control", () => {
  const {source, url, raw} = settingsEntranceFixture();
  const label = "Do Not Sell My Information";
  const selectorHint = "#ez-ccpa-reject-all";
  Object.assign(source.consentUiObservations[0]!, {controls: [{label, selectorHint, tagName: "button", visible: true,
    actionType: "do_not_sell_share", semanticallyInteractive: true, consentContextEvidence: "local_surface"}]});
  const row = {label, selectorHint, tagName: "button", actionType: "do_not_sell_share", layer: "page_body",
    decisionStatus: "dom_present_not_visible", intersectsViewport: false,
    boundingBox: {x: 40, y: 7535, width: 210, height: 40},
    frameContext: {frameKind: "main_frame", frameUrl: url}};
  const placement = {...raw, viewport: {width: 1366, height: 900}, candidates: [row]};
  const assess = (input: Record<string, unknown>) => projectPublicFirstLayerConsentEvidence(
    deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false, consentControlGeometryEvidence: input}),
    source.scanId)?.optOutSurfaces?.bannerControls;
  assert.deepEqual(assess(bindEntranceGeometry(placement, source.scanId)), []);
  assert.equal(assess(placement)?.length, 1);
  assert.equal(assess(bindEntranceGeometry({...placement, candidates: [{...row,
    frameContext: {...row.frameContext, frameKind: "child_frame"}}]}, source.scanId))?.length, 1);
});

test("a verified footer placement keeps the same OneTrust settings anchor out of the banner inventory", () => {
  const {source, url, raw} = settingsEntranceFixture();
  const label = "Do Not Sell My Personal Information";
  const selectorHint = "#ot-sdk-btn";
  Object.assign(source.consentUiObservations[0]!, {controls: [{label, selectorHint, tagName: "a", visible: true,
    actionType: "do_not_sell_share", semanticallyInteractive: true, consentContextEvidence: "local_surface"}]});
  const row = {label, selectorHint, tagName: "a", actionType: "do_not_sell_share", layer: "footer",
    decisionStatus: "footer_or_policy_link", intersectsViewport: false,
    boundingBox: {x: 550, y: 3050, width: 207, height: 14}, frameContext: {frameKind: "main_frame", frameUrl: url}};
  const placement = {...raw, viewport: {width: 1366, height: 900}, candidates: [row]};
  const assess = (input: Record<string, unknown>) => projectPublicFirstLayerConsentEvidence(
    deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false, consentControlGeometryEvidence: input}),
    source.scanId)?.optOutSurfaces?.bannerControls;
  assert.deepEqual(assess(bindEntranceGeometry(placement, source.scanId)), []);
  assert.equal(assess(placement)?.length, 1);
  assert.equal(assess(bindEntranceGeometry({...placement, candidates: [row, row]}, source.scanId))?.length, 1);
});

test("verified persistent links leave banner coverage and retain a proven navigation control", () => {
  const {source, url, raw} = settingsEntranceFixture();
  const actionType = "do_not_sell_share";
  const footer = {label: "Your Privacy Choices", selectorHint: "#privacy-choice", tagName: "a", actionType,
    visible: true, semanticallyInteractive: true, linkDestination: "same_document"};
  const nav = {...footer, label: "Do Not Sell or Share My Personal Information", selectorHint: "a", linkDestination: "other_document"};
  const placement = {presentationType: "persistent_link", placementType: "persistent_surface", enabled: true,
    frameContext: {frameKind: "main_frame", frameUrl: url}, layer: "preference_center", decisionStatus: "deeper_layer"};
  const footerGeometry = {...footer, ...placement, candidateId: "candidate_0", intersectsViewport: false,
    boundingBox: {x: 30, y: 1575, width: 130, height: 20}};
  const navGeometry = {...nav, ...placement, candidateId: "candidate_1", selectorHint: "div.secondary-nav a",
    intersectsViewport: true, boundingBox: {x: 30, y: 632, width: 170, height: 20}, occlusion: {center: true, checkedPoints: 5},
    scrollableAncestor: {selectorHint: "div.sidenav div", boundingBox: {x: 0, y: 0, width: 242, height: 890}}};
  Object.assign(source.consentUiObservations[0]!, {controls: [footer, nav]});
  const diagnostic = {version: "first_layer_opt_out_geometry_diagnostic.v1", structuralCoverage: "complete",
    framesAtStart: 1, frameOutcomes: ["captured"], retainedCandidateCount: 2, inspectedCandidateCount: 0,
    unresolvedOptOutCount: 0, classifiedOptOutCount: 0, otherUnresolvedCount: 0, candidates: [],
    captureCoverage: {inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true,
      documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1}};
  const assess = (rows = [footerGeometry, navGeometry], bound = true, firstLayerOptOutGeometry = diagnostic) => {
    const input = {...raw, viewport: {width: 1366, height: 900}, candidates: rows, firstLayerOptOutGeometry};
    return deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false,
      consentControlGeometryEvidence: bound ? bindEntranceGeometry(input, source.scanId) : input});
  };
  const result = assess();
  const surfaces = projectPublicFirstLayerConsentEvidence(result, source.scanId)?.optOutSurfaces;
  assert.deepEqual(result.optOutPlacementCorrections?.map(row => row.placement),
    ["outside_initial_banner", "persistent_site_navigation"]);
  assert.deepEqual(surfaces?.bannerControls, []);
  assert.deepEqual(surfaces?.siteNavigationControls?.map(row => row.label), [nav.label]);
  assert.equal(result.controls.privacyOptOut.state, "unknown");
  assert.equal(consentControlAssessmentSchema.safeParse(result).success, true);
  assert.equal(assess(undefined, false).optOutPlacementCorrections, undefined);
  assert.equal(assess(undefined, true, {...diagnostic, retainedCandidateCount: 3}).optOutPlacementCorrections?.length, 1);
  assert.equal(assess([footerGeometry, {...navGeometry, linkDestination: "same_document"}]).optOutPlacementCorrections?.length, 1);
});

test("native footer projection preserves a state scope, a combined scope and a policy destination", () => {
  const {source, url} = settingsEntranceFixture();
  const original = source.domSnapshots[0]!;
  original.artifactId = "dom_text_pre_consent";
  const hit = {semanticRole: "link", view: "original", bounds: [30, 60, 240, 20],
    visibility: "rendered_exposed", testedPoints: 5, matchingPoints: 5, occludingPoints: 0};
  Object.assign(original, {footerOptOutObservation: {
    version: "consent_footer_opt_out.v1", artifactId: original.artifactId, documentUrl: url,
    documentToken: original.documentIdentity!.token, snapshotAtMs: original.capturedAtMs,
    capturedAtMs: original.capturedAtMs + 20, coverage: "complete", limitations: [],
    viewport: [1200, 800], footerCount: 3, inspectedControls: 12,
    candidates: [
      {...hit, evidenceId: "footer-control-0", label: "Your State-Specific Privacy Choices",
        scope: "footer", controlWitness: "state_privacy_choices"},
      {...hit, evidenceId: "footer-control-1", label: "Do not sell or share my personal information/opt out of targeted advertising",
        scope: "footer", controlWitness: "sale_sharing_and_targeted_advertising"},
      {...hit, evidenceId: "footer-control-2", label: "Your Privacy Choices",
        scope: "legal_footer_navigation", controlWitness: "named_privacy_policy_entrance"},
      {...hit, evidenceId: "footer-control-3", label: "Your Privacy Choices/(Opt-Out of Sale/Targeted Ads)",
        scope: "footer", controlWitness: "hearst_sale_ads_link"},
      {...hit, evidenceId: "footer-control-4", label: "Don't sell my info",
        semanticRole: "settings_control", scope: "footer", controlWitness: "mspa_footer_contracted_sale_handler"},
      {...hit, evidenceId: "footer-control-5",
        label: "Do Not Sell or Share My Personal Information or Limit Use of My Sensitive Personal Information",
        scope: "footer", controlWitness: "onetrust_sensitive_data_webform"},
      {...hit, evidenceId: "footer-control-6", label: "Do Not Sell My Personal Information",
        semanticRole: "settings_control", scope: "footer", controlWitness: "onetrust_footer_text_trigger"},
      {...hit, evidenceId: "footer-control-7", label: "Do not sell or share my personal information",
        semanticRole: "button", scope: "custom_legal_footer"},
    ],
  }});
  const assessment = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false});
  const links = projectPublicFirstLayerConsentEvidence(assessment, source.scanId)?.optOutSurfaces?.footerLinks;
  assert.deepEqual(links?.map(link => [link.choiceScope, link.destinationKind]), [
    ["state_privacy",undefined], ["sale_sharing_and_targeted_advertising",undefined], [undefined,"privacy_policy"],
    ["sale_and_targeted_advertising",undefined], [undefined,undefined],
    ["sale_sharing_and_sensitive_data",undefined], [undefined,undefined], [undefined,undefined],
  ]);
  assert.equal(links?.at(-1)?.placement, undefined);
  assert.equal(links?.at(-1)?.visibility, "rendered_exposed");
  assert.equal(consentControlAssessmentSchema.safeParse({...assessment,
    optOutFooterLinks: [{...links![2], choiceScope: "sale_sharing_and_targeted_advertising"}]}).success,false);
  assert.equal(consentControlAssessmentSchema.safeParse({...assessment,
    optOutFooterLinks: [{...links![3], choiceScope: "sale_sharing_and_targeted_advertising"}]}).success,false);
});

for (const [scope, controlWitness] of [
  ["legal_footer_navigation", "onetrust_reveal_footer_settings"],
  ["custom_legal_footer", "onetrust_custom_legal_footer_settings"],
] as const) test(`the ${scope} OneTrust owner reclassifies separately from a real banner`, () => {
  const {source, raw, url, control} = settingsEntranceFixture();
  const snapshot = source.domSnapshots[0]!;
  const label = "Your Privacy Choices";
  const footerControl = {label, selectorHint: "#ot-sdk-btn", tagName: "button", actionType: "do_not_sell_share",
    visible: true, semanticallyInteractive: true, artifactRef: "footer-inventory-row"};
  const banner = {...footerControl, selectorHint:"#onetrust-pc-btn-handler", artifactRef:"actual-banner-row",
    consentContextEvidence:"local_surface"};
  Object.assign(source.consentUiObservations[0]!, {controls: [footerControl]});
  const footerGeometry = {...control, ...footerControl, decisionStatus:"covered", consentContextConfirmed:false,
    ariaLabel:undefined, occlusion:{center:false,checkedPoints:5}};
  const assess = (includeBanner = false) => {
    const g = {...raw, viewport:{width:1366,height:900}, candidates: includeBanner ? [footerGeometry,
      {...control,...banner,candidateId:"candidate_1",ariaLabel:undefined,decisionStatus:"confirmed_visible"}] : [footerGeometry]};
    const assessment = deriveMaterializedConsentControlAssessment({bundle:source,finalUrl:url,noGo:false,
      consentControlGeometryEvidence:bindEntranceGeometry(g,source.scanId)});
    return {assessment, view: projectPublicFirstLayerConsentEvidence(assessment,source.scanId)?.optOutSurfaces};
  };
  assert.equal(assess().view?.bannerControls.length,1);
  const packet = {version:"consent_footer_opt_out.v1",artifactId:"dom_text_pre_consent",documentUrl:url,documentToken:snapshot.documentIdentity!.token,
    snapshotAtMs:snapshot.capturedAtMs,capturedAtMs:snapshot.capturedAtMs+30,coverage:"limited",limitations:["traversal_limited"],
    viewport:[1366,900],footerCount:1,inspectedControls:1,candidates:[{evidenceId:"footer-control-0",label,
      scope,semanticRole:"settings_control",controlWitness,
      view:"footer_position",visibility:"rendered_exposed",bounds:[360,840,120,16],testedPoints:5,matchingPoints:5,occludingPoints:0}]};
  Object.assign(snapshot,{artifactId:"dom_text_pre_consent",footerOptOutObservation:packet});
  const {assessment,view} = assess();
  assert.deepEqual(view?.bannerControls,[]);
  assert.deepEqual(view?.footerLinks.map(row => [row.label,row.visibility]),[[label,"rendered_exposed"]]);
  assert.equal(assessment.optOutPlacementCorrections?.[0]?.geometryCandidateId,"candidate_0");
  assert.equal(consentControlAssessmentSchema.safeParse(assessment).success,true);
  Object.assign(source.consentUiObservations[0]!,{controls:[footerControl,banner]});
  assert.equal(assess(true).view?.bannerControls.length,1);
  Object.assign(snapshot,{footerOptOutObservation:{...packet,documentToken:"foreign-loader"}});
  assert.equal(assess().assessment.optOutPlacementCorrections,undefined);
});

test("the exact same-visit OneTrust footer button does not become a banner control", () => {
  const {source, url} = settingsEntranceFixture();
  const original = source.domSnapshots[0]!;
  original.artifactId = "dom_text_pre_consent";
  const label = "Do not sell my data";
  const control = {label, selectorHint: "#ot-sdk-btn", tagName: "button", visible: true,
    actionType: "do_not_sell_share", semanticallyInteractive: true, consentContextEvidence: "local_surface",
    presentationType: "dedicated_button", layer: "first_layer"};
  Object.assign(source.consentUiObservations[0]!, {controls: [control]});
  const packet = {
    version: "consent_footer_opt_out.v1", artifactId: original.artifactId, documentUrl: url,
    documentToken: original.documentIdentity!.token, snapshotAtMs: original.capturedAtMs,
    capturedAtMs: original.capturedAtMs + 20, coverage: "complete", limitations: [],
    viewport: [1200, 800], footerCount: 1, inspectedControls: 1,
    candidates: [{evidenceId: "footer-control-0", label, scope: "footer", semanticRole: "button", view: "original",
      bounds: [30, 60, 240, 20], visibility: "rendered_exposed", testedPoints: 5, matchingPoints: 5, occludingPoints: 0,
      controlWitness: "onetrust_footer_sell_data"}],
  };
  const project = () => {
    const assessment = deriveMaterializedConsentControlAssessment({bundle: source, finalUrl: url, noGo: false});
    return projectPublicFirstLayerConsentEvidence(assessment, source.scanId)?.optOutSurfaces;
  };
  Object.assign(original, {footerOptOutObservation: packet});
  assert.deepEqual(project()?.bannerControls, []);
  assert.equal(project()?.footerLinks[0]?.label, label);
  Object.assign(original, {footerOptOutObservation: {...packet, documentToken: "different-loader"}});
  assert.deepEqual(project()?.bannerControls?.map(row => row.label), [label]);
  Object.assign(original, {footerOptOutObservation: packet});
  Object.assign(source.consentUiObservations[0]!, {controls: [{...control, selectorHint: "#separate-banner-button"}]});
  assert.deepEqual(project()?.bannerControls?.map(row => row.label), [label]);
});

test("a bound footer capture failure remains reportable coverage without a link or first-layer verdict",()=>{
  const {url,source}=settingsEntranceFixture();
  const original=source.domSnapshots[0]!;
  original.artifactId="dom_text_pre_consent";
  const receipt={version:"consent_footer_opt_out_capture.v1",artifactId:original.artifactId,
    documentUrl:url,documentToken:original.documentIdentity!.token,snapshotAtMs:original.capturedAtMs,
    completedAtMs:original.capturedAtMs+20,attempts:1,outcome:"timed_out",recovery:"none"};
  const assess=(patch:Record<string,unknown>)=>{
    Object.assign(original,{footerOptOutCapture:{...receipt,...patch}});
    return deriveMaterializedConsentControlAssessment({bundle:source,finalUrl:url,noGo:false});
  };
  const result=assess({});
  assert.equal(result.sameVisitFooterCapture?.resolution,"capture_incomplete");
  const surfaces=projectPublicFirstLayerConsentEvidence(result,source.scanId)?.optOutSurfaces;
  assert.equal(surfaces?.sameVisitFooterCapture?.reason,"timed_out");assert.equal(surfaces?.footerLinks.length,0);
  assert.equal(result.sameVisitFooter,undefined);
  assert.equal(assess({documentToken:"other"}).sameVisitFooterCapture?.resolution,"invalid_packet");
  assert.equal(assess({outcome:"captured"}).sameVisitFooterCapture?.resolution,"invalid_packet");
  delete original.footerOptOutCapture;
  const legacy=deriveMaterializedConsentControlAssessment({bundle:source,finalUrl:url,noGo:false});
  assert.equal(legacy.sameVisitFooterCapture?.resolution,"not_retained");
  assert.equal(result.controls.privacyOptOut.state,legacy.controls.privacyOptOut.state);
});

test("geometry-bound initial sharing and sale switches project separate first-layer labels without click or opener evidence",()=>{
  const {url,source,raw,control}=settingsEntranceFixture();
  const candidates=["sharing","sale"].flatMap((scope,i)=>{
    const label=`I want to opt-out of the ${scope==="sale"?"Sale":"Sharing"} of my Personal Data.`;
    const a="candidate_"+(i*2), b="candidate_"+(i*2+1),y=420+i*60;
    const base={...control,ariaLabel:undefined,actionType:"other",decisionStatus:"ambiguous",classifierReasonCodes:["privacy_opt_out_context"]};
    return [
      {...base,candidateId:a,label,role:undefined,tagName:"label",presentationType:"unknown",semanticallyInteractive:false,
        selectorHint:"li.qc-cmp2-list-item label",boundingBox:{x:409,y:y+7,width:438,height:14}},
      {...base,candidateId:b,label:"DESACTIVADOACTIVADO",role:"switch",tagName:"button",selectorHint:"button.qc-cmp2-toggle",
        boundingBox:{x:905,y,width:52,height:27},initialOptOutSwitch:{version:"inmobi_choice.initial_opt_out_switch.v1",scope,
          label,labelCandidateId:a,frameSlot:0,labelFrameSlot:0,binding:"same_visible_row"}}
    ];
  });
  const payload={...raw,containers:[{selectorHint:"#qc-cmp2-usp",role:"dialog",layer:"first_layer",intersectsViewport:true}],candidates};
  const project=(geometry:Record<string,unknown>,bound=true)=>deriveMaterializedConsentControlAssessment({bundle:source,finalUrl:url,noGo:false,
    consentControlGeometryEvidence:bound?bindEntranceGeometry(geometry,source.scanId):geometry});
  const result=project(payload),baseline=project({...payload,candidates:[]});
  const publicEvidence=projectPublicFirstLayerConsentEvidence(result,source.scanId);
  const rows=publicEvidence?.optOutSurfaces?.bannerControls;
  assert.equal(result.controls.privacyOptOut.state,"observed");
  assert.deepEqual(rows?.map(c=>[c.label,c.initialSwitchScope,c.opensPreferenceCenter]),[
    ["I want to opt-out of the Sharing of my Personal Data.","sharing",null],["I want to opt-out of the Sale of my Personal Data.","sale",null]]);
  for(const key of ["accept","reject","options"] as const)assert.equal(result.controls[key].state,baseline.controls[key].state);
  assert.equal(result.coverage.status,"limited");
  assert.deepEqual(project(payload,false).evidence.filter(e=>e.initialSwitchScope),[]);
  assert.deepEqual(project({...payload,documentIdentity:{source:"cdp_loader_id",token:"foreign"}}).evidence.filter(e=>e.initialSwitchScope),[]);
  const sharingSwitch=candidates[1]!;
  assert.ok("initialOptOutSwitch" in sharingSwitch);
  for(const [index,changes] of [[0,{label:"Your email preferences"}],[0,{occlusion:{center:false}}],
    [0,{boundingBox:{x:409,y:950,width:438,height:14}}],[1,{role:"checkbox"}],
    [1,{frameContext:{frameKind:"child_frame",frameUrl:url}}],[1,{computedStyle:{visibility:"hidden"}}],
    [1,{initialOptOutSwitch:{...sharingSwitch.initialOptOutSwitch,labelCandidateId:"candidate_2"}}]] as const) {
    const modified=candidates.map((candidate,i)=>i===index?{...candidate,...changes}:candidate);
    assert.ok(!project({...payload,candidates:modified}).evidence.some(e=>e.initialSwitchScope==="sharing"));
  }
});

test("the original opt-out switches survive an independently loaded empty recovery inventory", () => {
  const {source, url} = settingsEntranceFixture();
  const snapshot = source.domSnapshots[0]!;
  snapshot.artifactId = "dom_text_pre_consent";
  const originalToken = snapshot.documentIdentity!.token;
  const recovery = {source:"cdp_loader_id" as const, token:"recovery-loader"};
  const observedAtMs = snapshot.capturedAtMs + 2;
  source.domSnapshots.push({...snapshot, artifactId:"dom_text_pre_consent_recovery",
    documentIdentity:recovery, capturedAtMs:observedAtMs + 250});
  Object.assign(source.consentUiObservations[0]!, {
    observationId:"recovery-observation", documentIdentity:recovery, observedAtMs:observedAtMs + 200,
    captureStatus:"no_evidence", likelyPresent:false, inventoryOutcome:"complete_empty",
    basis:["recovery:independent_consent_capture_completed", "settled_control_inventory_completed"],
  });
  const baseline = deriveMaterializedConsentControlAssessment({bundle:source, finalUrl:url, noGo:false});
  snapshot.originalInitialOptOutSwitches = {
    version:"original_initial_opt_out_switches.v1", documentUrl:url, documentToken:originalToken, observedAtMs,
    rows:[
      {scope:"sale", label:"I want to opt-out of the Sale of my Personal Data.", switchCenter:[905, 420], labelCenter:[420, 421]},
      {scope:"sharing", label:"I want to opt-out of the Sharing of my Personal Data.", switchCenter:[905, 460], labelCenter:[420, 461]},
    ],
  };
  const materialize = () => deriveMaterializedConsentControlAssessment({bundle:source, finalUrl:url, noGo:false});
  const assessment = materialize();
  assert.equal(assessment.controls.privacyOptOut.state, "observed");
  assert.equal(assessment.controls.privacyOptOut.inspection?.status, "limited");
  assert.equal(assessment.originalOptOutSwitches?.recovery?.documentToken, recovery.token);
  assert.deepEqual(assessment.evidence.filter(row => row.initialSwitchScope).map(row => row.documentToken), [originalToken, originalToken]);
  const report = projectPublicFirstLayerConsentEvidence(assessment, source.scanId);
  assert.deepEqual(report?.optOutSurfaces?.bannerControls.map(row => row.initialSwitchScope), ["sale", "sharing"]);
  for (const key of ["accept", "reject", "options"] as const) assert.deepEqual(assessment.controls[key], baseline.controls[key]);
  const packet = snapshot.originalInitialOptOutSwitches;
  snapshot.originalInitialOptOutSwitches = {...packet, documentToken:"another-loader"};
  assert.equal(materialize().originalOptOutSwitches, undefined);
  snapshot.originalInitialOptOutSwitches = packet;
  source.consentUiObservations[0]!.basis = [];
  assert.equal(materialize().originalOptOutSwitches, undefined);
});

test("an original OneTrust banner entrance survives a later empty recovery with distinct loader evidence", () => {
  const {source, url} = settingsEntranceFixture();
  const snapshot = source.domSnapshots[0]!;
  snapshot.artifactId = "dom_text_pre_consent";
  const original = snapshot.documentIdentity!;
  const later = {source:"cdp_loader_id" as const,token:"second-loader"};
  const at = snapshot.capturedAtMs + 10;
  source.domSnapshots.push({...snapshot,artifactId:"dom_text_pre_consent_recovery",capturedAtMs:at+100,documentIdentity:later});
  source.screenshots = [{artifactId:"screenshot_pre_consent_cmp_controls",capturedAtMs:at-3,path:"cmp.png",url,
    documentIdentity:original, pagePhase:"network_idle", consentStateAtTime:"pre_consent"}];
  Object.assign(source.consentUiObservations[0]!, {observationId:"recovery",documentIdentity:later,observedAtMs:at+90,
    captureStatus:"no_evidence",likelyPresent:false,inventoryOutcome:"complete_empty",controls:[],
    basis:["recovery:independent_consent_capture_completed","settled_control_inventory_completed"]});
  const label = "Do Not Sell or Share My Personal Information";
  snapshot.originalOneTrustSettingsEntrance = {version:"original_onetrust_settings_entrance.v1",selector:"#onetrust-pc-btn-handler",
    documentUrl:url,documentToken:original.token,observedAtMs:at,label,ariaLabel:label+", Opens the preference center dialog",
    testedPoints:5,matchingPoints:5};
  snapshot.footerOptOutCapture = {version:"consent_footer_opt_out_capture.v1",artifactId:"dom_text_pre_consent",
    documentUrl:url,documentToken:original.token,snapshotAtMs:snapshot.capturedAtMs,completedAtMs:at+2,
    attempts:1,outcome:"captured",recovery:"none"};
  const materialize = (noGo = false) => deriveMaterializedConsentControlAssessment({bundle:source,finalUrl:url,noGo});
  const a = materialize();
  assert.equal(a.originalOptOutSettings?.recovery?.recoveryToken,later.token);
  assert.equal(a.controls.privacyOptOut.state,"observed");
  assert.equal(a.controls.privacyOptOut.inspection?.status,"limited");
  assert.deepEqual(projectPublicFirstLayerConsentEvidence(a, source.scanId)?.optOutSurfaces?.bannerControls.map(row =>
    [row.label,row.opensPreferenceCenter,row.settingsEntranceSource]),[[label,true,"accessible_name"]]);
  assert.equal(materialize(true).originalOptOutSettings,undefined);
  const [shot] = source.screenshots.splice(0,source.screenshots.length);
  assert.equal(materialize().originalOptOutSettings,undefined);
  source.screenshots.push(shot!);
  snapshot.originalOneTrustSettingsEntrance.documentToken = "wrong";
  assert.equal(materialize().originalOptOutSettings,undefined);
});
