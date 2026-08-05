import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveConsentControlAssessment,
  type ConsentControlAssessmentInput,
} from "./consent-control-assessment";

function baseInput(): ConsentControlAssessmentInput {
  return {
    scan: {
      scanId: "scan-oxfam-1",
      requestedUrl: "https://oxfam.org/en",
      finalUrl: "https://oxfam.org/en",
      scanStatus: "completed",
    },
    document: {
      canonicalDocumentId: "https://oxfam.org/en",
      identityStatus: "matched",
    },
    coverage: {
      status: "complete",
      requiredChannels: ["dom_inventory", "geometry"],
      completedChannels: ["dom_inventory", "geometry"],
      incompleteChannels: [],
    },
    source: {
      bundleVersion: "bundle.v1",
      geometryVersion: "consent_control_geometry.v1",
      computedAt: "2026-07-27T00:00:00.000Z",
    },
  };
}

function candidate(input: Record<string, unknown>) {
  return {
    layer: "first_layer" as const,
    visible: true,
    actionable: true,
    ...input,
  };
}

test("retains earlier same-document controls when later geometry is collapsed", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "bundle-observation",
    observedAtMs: 7_758,
    likelyPresent: true,
    layerInspected: "first_layer",
    documentId: "https://oxfam.org/en",
    captureStatus: "observed",
    controls: [
      candidate({ evidenceId: "accept-1", intent: "accept", label: "Accept all cookies" }),
      candidate({ evidenceId: "reject-1", intent: "reject", label: "Accept only essential cookies" }),
      candidate({ evidenceId: "options-1", intent: "options", label: "Cookie Settings" }),
    ],
  }];
  input.geometry = {
    artifactVersion: "consent_control_geometry.v1",
    assessmentStatus: "complete",
    documentId: "https://oxfam.org/en",
    observedAtMs: 8_400,
    candidates: [candidate({ evidenceId: "options-2", intent: "options", label: "Cookie Settings" })],
  };
  input.surface = { status: "not_observed" };

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.firstObservedAtMs, 7_758);
  assert.equal(assessment.controls.reject.firstObservedAtMs, 7_758);
  assert.equal(
    assessment.contradictions.some((row) =>
      row.reasonCode === "retained_actionable_control_overrides_later_surface_absence"
    ),
    true,
  );
});

test("incomplete evidence remains unknown instead of becoming a negative", () => {
  const input = baseInput();
  input.coverage = {
    status: "limited",
    requiredChannels: ["dom_inventory", "geometry"],
    completedChannels: ["dom_inventory"],
    incompleteChannels: ["geometry"],
    reasonCodes: ["geometry_capture_incomplete"],
  };
  input.observations = [{
    observationId: "partial",
    observedAtMs: 100,
    likelyPresent: true,
    layerInspected: "first_layer",
    captureStatus: "incomplete",
    controls: [],
  }];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.surface.status, "observed_non_actionable");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("a complete assessment can never retain unknown A/R/O controls", () => {
  const input = baseInput();
  input.coverage = {
    status: "complete",
    requiredChannels: ["dom_inventory", "geometry"],
    completedChannels: ["dom_inventory"],
    incompleteChannels: ["geometry"],
  };
  input.surface = { status: "unknown" };

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("an incomplete non-required channel does not erase a completed typed absence", () => {
  const input = baseInput();
  input.coverage = {
    status: "complete",
    requiredChannels: ["dom_inventory"],
    completedChannels: ["dom_inventory"],
    incompleteChannels: ["geometry"],
  };
  input.surface = { status: "not_observed" };

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.coverage.status, "complete");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("complete no-surface inspection produces factual not-observed A/R/O", () => {
  const input = baseInput();
  input.surface = { status: "not_observed" };
  input.observations = [{
    observationId: "complete-negative",
    observedAtMs: 100,
    likelyPresent: false,
    layerInspected: "first_layer",
    documentId: "https://oxfam.org/en",
    captureStatus: "no_evidence",
    completedChannels: ["dom_inventory", "geometry"],
    controls: [],
  }];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("complete no-surface inspection overrides a text-only likely-present observation", () => {
  const input = baseInput();
  input.surface = { status: "not_observed" };
  input.observations = [{
    observationId: "script-text-only",
    observedAtMs: 24_199,
    likelyPresent: true,
    layerInspected: "unknown",
    documentId: "https://oxfam.org/en",
    captureStatus: "observed",
    completedChannels: ["dom_inventory"],
    incompleteChannels: [],
    controls: [],
    evidenceRefs: [],
  }];
  input.geometry = {
    artifactVersion: "consent_control_geometry.v1",
    assessmentStatus: "complete",
    documentId: "https://oxfam.org/en",
    observedAtMs: 24_199,
    completedChannels: ["geometry"],
    incompleteChannels: [],
    evidenceRefs: [],
    candidates: [],
  };

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
  assert.equal(assessment.contradictions.length, 0);
});

test("missing visibility or actionability cannot create positive control evidence", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "unverified-candidates",
    observedAtMs: 100,
    likelyPresent: true,
    layerInspected: "first_layer",
    documentId: "https://oxfam.org/en",
    captureStatus: "observed",
    completedChannels: ["dom_inventory", "geometry"],
    controls: [
      { evidenceId: "accept", intent: "accept", layer: "first_layer", label: "Accept all" },
      { evidenceId: "reject", intent: "reject", layer: "first_layer", label: "Reject all", visible: true },
    ],
  }];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
});

test("missing document identity and coverage fail closed", () => {
  const input = baseInput();
  input.document = { canonicalDocumentId: "https://oxfam.org/en" };
  input.coverage = undefined;
  input.observations = [{
    observationId: "unbound",
    observedAtMs: 100,
    likelyPresent: true,
    layerInspected: "first_layer",
    captureStatus: "observed",
    controls: [candidate({ evidenceId: "accept", intent: "accept", label: "Accept all" })],
  }];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.document.identityStatus, "unknown");
  assert.equal(assessment.coverage.status, "none");
  assert.equal(assessment.controls.accept.state, "unknown");
});

test("no-go scans cannot create missing-control negatives", () => {
  const input = baseInput();
  input.scan.noGo = true;
  input.scan.noGoReasonCodes = ["homepage_blocked"];
  input.observations = [];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
  assert.ok(assessment.limitations.some((limitation) => limitation.code === "scan_no_go"));
});

test("privacy opt-out and options do not satisfy reject", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "privacy-choice",
    observedAtMs: 200,
    likelyPresent: true,
    layerInspected: "first_layer",
    captureStatus: "observed",
    completedChannels: ["dom_inventory", "geometry"],
    documentId: "https://oxfam.org/en",
    controls: [
      candidate({ evidenceId: "opt-out", intent: "privacy_opt_out", label: "Do not sell or share my personal information" }),
      candidate({ evidenceId: "options", intent: "options", label: "Manage preferences" }),
    ],
  }];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.controls.privacyOptOut.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
});

test("retains first-layer options presentation without changing control intent", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "inline-options",
    observedAtMs: 200,
    likelyPresent: true,
    layerInspected: "first_layer",
    captureStatus: "observed",
    documentId: "https://oxfam.org/en",
    controls: [
      candidate({
        actionType: "manage_preferences",
        evidenceId: "inline-cookie-tool",
        intent: "options",
        label: "Cookie Consent Tool",
        presentationType: "inline_link",
        placementType: "action_cluster",
      }),
    ],
  }];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.evidence[0]?.presentationType, "inline_link");
  assert.equal(assessment.evidence[0]?.placementType, "action_cluster");
});

test("retains persistent options links without promoting them to first-layer controls", () => {
  const input = baseInput();
  input.surface = { status: "not_observed" };
  input.geometry = {
    artifactVersion: "consent_control_geometry.v1",
    assessmentStatus: "complete",
    documentId: "https://oxfam.org/en",
    observedAtMs: 300,
    candidates: [
      candidate({
        actionType: "manage_preferences",
        evidenceId: "footer-cookie-settings",
        intent: "options",
        label: "Cookie Settings",
        layer: "deeper_layer",
        presentationType: "persistent_link",
      }),
    ],
  };

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.controls.options.state, "not_observed");
  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.evidence[0]?.layer, "deeper_layer");
  assert.equal(assessment.evidence[0]?.presentationType, "persistent_link");
});

test("deeper-layer controls do not become first-layer A/R/O", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "deeper-settings",
    observedAtMs: 300,
    likelyPresent: true,
    layerInspected: "unknown",
    controls: [
      candidate({ evidenceId: "deeper-reject", intent: "reject", label: "Reject all", layer: "deeper_layer" }),
    ],
  }];

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.reject.layer, "first_layer");
  assert.equal(assessment.evidence.length, 0);
});

test("explicitly limited coverage preserves observed controls without creating negative states", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "cnn-first-layer",
    observedAtMs: 300,
    likelyPresent: true,
    layerInspected: "first_layer",
    captureStatus: "incomplete",
    controls: [
      candidate({ evidenceId: "accept", intent: "accept", label: "Accept All", layer: "first_layer" }),
      candidate({ evidenceId: "options", intent: "options", label: "Show Purposes", layer: "first_layer" }),
    ],
  }];
  input.geometry = {
    assessmentStatus: "complete",
    documentId: "https://oxfam.org/en",
    completedChannels: ["geometry"],
    incompleteChannels: [],
    candidates: [],
  };
  input.coverage = {
    status: "limited",
    requiredChannels: ["dom_inventory", "geometry"],
    completedChannels: ["geometry"],
    incompleteChannels: ["dom_inventory"],
    reasonCodes: ["pre_consent_runtime_incomplete"],
  };

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "unknown");
});

test("geometry document mismatch does not erase bundle evidence", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "bundle",
    observedAtMs: 100,
    likelyPresent: true,
    layerInspected: "first_layer",
    documentId: "https://oxfam.org/en",
    controls: [candidate({ evidenceId: "bundle-accept", intent: "accept", label: "Accept all" })],
  }];
  input.geometry = {
    assessmentStatus: "document_mismatch",
    documentId: "https://oxfam.org/another-page",
    observedAtMs: 200,
    candidates: [],
  };

  const assessment = deriveConsentControlAssessment(input);

  assert.equal(assessment.controls.accept.state, "observed");
  assert.ok(assessment.contradictions.some((row) => row.reasonCode === "geometry_document_mismatch_does_not_erase_bundle_evidence"));
  assert.ok(assessment.limitations.some((limitation) => limitation.code === "geometry_document_mismatch"));
});

test("projection is deterministic for the same source input", () => {
  const input = baseInput();
  input.observations = [{
    observationId: "stable",
    observedAtMs: 100,
    likelyPresent: true,
    layerInspected: "first_layer",
    controls: [candidate({ evidenceId: "stable-accept", intent: "accept", label: "Accept all" })],
  }];

  const first = deriveConsentControlAssessment(input);
  const second = deriveConsentControlAssessment(input);

  assert.deepEqual(first, second);
  assert.match(first.provenance.sourceHash, /^fnv1a-[0-9a-f]{8}$/);
});

test("overlong redirect URLs and document identities are safely bounded with stable hashes", () => {
  const input = baseInput();
  const longUrl = `https://example.test/redirect?next=${"x".repeat(700)}`;
  const longDocumentId = `document:${"y".repeat(400)}`;
  input.scan.requestedUrl = longUrl;
  input.scan.finalUrl = longUrl;
  input.document = {
    canonicalDocumentId: longDocumentId,
    observedDocumentIds: [longDocumentId],
  };
  input.observations = [{
    observationId: "long-identity",
    observedAtMs: 100,
    likelyPresent: true,
    layerInspected: "first_layer",
    documentId: longDocumentId,
    captureStatus: "observed",
    controls: [candidate({
      documentId: longDocumentId,
      evidenceId: `control:${"z".repeat(400)}`,
      intent: "accept",
      label: "Accept all",
    })],
  }];

  const first = deriveConsentControlAssessment(input);
  const second = deriveConsentControlAssessment(input);

  assert.equal(first.scan.requestedUrl?.length, 500);
  assert.equal(first.scan.finalUrl?.length, 500);
  assert.equal(first.document.canonicalDocumentId?.length, 240);
  assert.equal(first.document.observedDocumentIds[0]?.length, 240);
  assert.equal(first.evidence[0]?.documentId?.length, 240);
  assert.equal(first.evidence[0]?.evidenceId.length, 240);
  assert.equal(first.document.identityStatus, "matched");
  assert.equal(first.controls.accept.state, "observed");
  assert.ok(first.limitations.some((limitation) => limitation.code === "document_identity_bounded"));
  assert.deepEqual(first, second);
});
