import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { consentActionPassiveBarrierLimits } from "./consent-action-tail-policy";
import { actionLanePassiveAbsenceDisposition } from "./action-lane-passive-absence";

test("new passive vocabulary preserves action work ceiling without cancelling returned evidence", () => {
  const bundle = { consentUiObservations: [{ observedAtMs: 1, basis: [], controls: [
    { actionType: "accept_all", visible: true, classifierReasonCodes: ["observation_only_label"] },
    { actionType: "reject_all", visible: true, classifierReasonCodes: ["matched_reject"] },
  ] }] } as unknown as CanonicalEvidenceBundle;
  assert.deepEqual(consentActionPassiveBarrierLimits(bundle), { acceptPassiveBarrierOnly: true });
  assert.equal(actionLanePassiveAbsenceDisposition({ settled: true, passiveBarrierReached: true }), "keep_terminal");
  assert.equal(actionLanePassiveAbsenceDisposition({ settled: false, passiveBarrierReached: true, dispatchStartedAtMs: 1 }), "cancel_incomplete");
  assert.equal(actionLanePassiveAbsenceDisposition({ settled: false, passiveBarrierReached: false, dispatchStartedAtMs: 1 }), "await_passive_barrier");
});

test("unresolved passive inventory does not add action tail waits for missing candidates", () => {
  const bundle = { consentUiObservations: [{ observedAtMs: 1, basis: ["unresolved_visible_consent_decision"], controls: [
    { actionType: "accept_all", visible: true },
  ] }] } as unknown as CanonicalEvidenceBundle;
  assert.deepEqual(consentActionPassiveBarrierLimits(bundle), { rejectPassiveBarrierOnly: true });
});

test("ordinary existing complete and limited inventories keep their scheduling policy", () => {
  for (const limitationKeys of [[], ["geometry_capture_unavailable"]]) {
    const bundle = { consentSurfaceInspection: { limitationKeys }, consentUiObservations: [] } as unknown as CanonicalEvidenceBundle;
    assert.deepEqual(consentActionPassiveBarrierLimits(bundle), {});
  }
});

test("only new document-bound named Reject routing proof keeps the existing tail", () => {
  const identity = { source: "cdp_loader_id", token: "same-loader" };
  const control = { actionType: "reject_all", label: "Accept only necessary", visible: true, tagName: "button",
    selectorHint: "#onetrust-reject-all-handler", classifierReasonCodes: ["observation_only_label"] };
  const bundle = { url: "https://example.com/", startedAt: "2026-10-16T00:00:00.000Z", consentUiObservations: [{ observedAtMs: 1, basis: [], controls: [control],
    captureStatus: "observed", layerInspected: "first_layer", documentUrl: "https://example.com/", documentIdentity: identity }] } as unknown as CanonicalEvidenceBundle;
  const geometry = { artifactVersion: "consent_control_geometry.v1", sourceScanner: "consent_control_geometry_diagnostic",
    pageUrl: bundle.url, documentIdentity: identity, capturedAt: "2026-10-16T00:00:00.000Z",
    captureTiming: {version: "consent_geometry_capture_timing.v1", mainFrameCompletedAt: "2026-10-16T00:00:00.000Z", completedAt: "2026-10-16T00:00:00.001Z"},
    controlInspection: {captureCoverage: {mainFrameAvailable: true, documentAndFramesStable: true}},
    cmp: { name: "OneTrust" }, candidates: [{ ...control, decisionStatus: "confirmed_visible", layer: "first_layer", enabled: true,
      intersectsViewport: true, consentContextConfirmed: true, frameContext: {frameKind: "main_frame", frameUrl: bundle.url},
      namedRejectRouting: {version: "named_reject_routing.v1", provider: "OneTrust", policyVersion: "label_bound_necessary_only_reject.v2",
        bannerSelector: "#onetrust-banner-sdk", controlSelector: "#onetrust-reject-all-handler"} }] };
  const run = (value: unknown) => consentActionPassiveBarrierLimits(bundle, value as Parameters<typeof consentActionPassiveBarrierLimits>[1]);
  assert.deepEqual(run(geometry), {});
  assert.deepEqual(run(undefined), {rejectPassiveBarrierOnly: true}, "Historical proof is not upgraded");
  for (const drift of ["provider", "root", "selector", "label", "loader", "url", "duplicate", "legacy", "timing", "hidden", "frame", "source", "capture-drift", "document-drift"]) {
    const changed = structuredClone(geometry);
    if (drift === "provider") changed.candidates[0]!.namedRejectRouting.provider = "Cookiebot";
    if (drift === "root") changed.candidates[0]!.namedRejectRouting.bannerSelector = "#wrong";
    if (drift === "selector") changed.candidates[0]!.namedRejectRouting.controlSelector = "#wrong";
    if (drift === "label") changed.candidates[0]!.label = "Only essentials maybe";
    if (drift === "loader") changed.documentIdentity.token = "other";
    if (drift === "url") changed.pageUrl = "https://other.example/";
    if (drift === "duplicate") changed.candidates.push(changed.candidates[0]!);
    if (drift === "legacy") changed.candidates[0]!.namedRejectRouting.policyVersion = "label_bound_necessary_only_reject.v1";
    if (drift === "timing") changed.captureTiming.mainFrameCompletedAt = "invalid";
    if (drift === "hidden") changed.candidates[0]!.decisionStatus = "hidden";
    if (drift === "frame") changed.candidates[0]!.frameContext.frameKind = "child_frame";
    if (drift === "source") changed.documentIdentity.source = "arbitrary";
    if (drift === "capture-drift") changed.capturedAt = changed.captureTiming.mainFrameCompletedAt = "2026-10-16T00:00:02.000Z";
    if (drift === "document-drift") changed.controlInspection.captureCoverage.documentAndFramesStable = false;
    assert.deepEqual(run(changed), {rejectPassiveBarrierOnly: true}, drift);
  }
});
