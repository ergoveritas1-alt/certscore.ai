import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import fixture from "../../apps/web/lib/scans/test-fixtures/dollar-general-consent-assessment.json";
import type {ConsentControlAssessment} from "../../packages/certscore-contracts/src/consent-control-assessment";
import {extractExportRow} from "./audit-progress-export";
import {retainedOptOutState} from "./audit-progress-opt-out";
import {reviewRetainedConsentControls, sha256} from "./retained-consent-control-review";

function cohort() {
  const root = mkdtempSync(join(tmpdir(), "consent-retained-review-"));
  const assessment = structuredClone(fixture.assessment) as ConsentControlAssessment, id = assessment.scan.scanId!;
  const exportValue = {scanId: id, domain: "fixture.test", scanStatus: "completed",
    timestamps: {createdAt: "2026-11-07T12:00:00Z"},
    meta: {projectionVersion: "pulse-public-v11", reportProjectionVersion: "scan-report-projection-v27", reportProjectionSourceHash: "a".repeat(64)},
    consentSurfaceEvidence: {firstLayerConsentChoices: {capturedBeforeInteraction: true, layerInspected: "first_layer", controlInventoryComplete: true,
      acceptControlObserved: true, rejectControlObserved: false, managePreferencesControlObserved: false}},
    customerConsentEvidence: {status: "available", reason: "persisted_snapshot_only", binding: {scanId: id, reportSourceHash: "a".repeat(64), reportVersion: "scan-report-projection-v27"},
      assessment: {sourceHash: assessment.provenance.sourceHash}, controls: Object.entries(assessment.controls).map(([id, value]) => ({id, state: value.state}))}};
  const extract = {scanId: id, isMacMini: true, isCanary: false, originalRequestId: "original", status: "completed", projection_status: "ready",
    projection_source_hash: "a".repeat(64), projection_payload_sha256: "b".repeat(64), projection_version: "scan-report-projection-v27", created_at: exportValue.timestamps.createdAt, control_assessment: assessment};
  const receipt = (name: string, value: unknown, role: string) => {
    const bytes = Buffer.from(JSON.stringify(value)), file = join(root, name); writeFileSync(file, bytes);
    return {file, sha256: sha256(bytes), role};
  };
  const publicRef = receipt("export.json", exportValue, "hash_verified_bot_archive_export");
  const row = extractExportRow(exportValue, publicRef);
  const refresh = () => {row.refs = [publicRef, receipt("inventory.json", {rows: [extract]}, "generation_matched_persisted_control_extract")];};
  refresh();
  return {root, extract, row, exportValue, refresh, clean: () => rmSync(root, {recursive: true, force: true})};
}

test("retained review preserves positive, negative and unavailable diagnostic evidence without claiming accuracy", () => {
  const f = cohort(); try {
    const review = reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07");
    assert.equal(review.comparisons, 3); assert.equal(review.mismatches, 0);
    assert.equal(review.counts.accept!.observed, 1); assert.equal(review.counts.reject!.not_observed, 1);
    assert.equal(review.diagnosticAvailable, 0); assert.equal(review.precision, null); assert.equal(review.recall, null);
  } finally {f.clean();}
});
test("retained review fails on changed bytes, generation conflicts and duplicate cohort IDs", () => {
  const f = cohort(); try {
    assert.throws(() => reviewRetainedConsentControls({rows: [f.row, f.row]}, "2026-11-07"), /Duplicate/);
    f.extract.projection_source_hash = "c".repeat(64); f.refresh();
    assert.throws(() => reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07"), /Generation binding/);
    writeFileSync(f.row.refs[0]!.file, "{}");
    assert.throws(() => reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07"), /Changed retained source/);
  } finally {f.clean();}
});
test("a matching negative still fails without its control-specific completed inspection", () => {
  const f = cohort(); try {
    const inspection = f.extract.control_assessment.controls.reject.inspection;
    assert(inspection);
    inspection.status = "limited"; f.refresh();
    assert.throws(() => reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07"), /complete/);
  } finally {f.clean();}
});

test("opt-out review keeps public unavailability, broader presence and refresh timing independent of canonical unknown", () => {
  const f = cohort();
  try {
    const assessment = f.extract.control_assessment;
    const control = assessment.controls.privacyOptOut;
    control.state = "unknown";
    control.reasonCodes = ["first_layer_inventory_incomplete", "unresolved_visible_consent_decision"];
    control.inspection = {policy: "control_specific_inspection.v4", status: "limited", evidenceRefs: []};
    assessment.coverage.captureDiagnostic = {
      version: "consent_capture_diagnostic.v1", refreshPolicy: "final_consent_geometry_refresh.v3",
      observationId: "inventory", documentToken: assessment.document.canonicalDocumentToken!,
      inventoryObservedAtMs: 500, geometryObservedAtMs: 500, geometryBinding: "matched", geometryMinusInventoryMs: 0,
      outcome: "skipped", skipReason: "not_refresh_candidate", eligibilityBlocker: "inventory_outcome_unsupported",
      attempted: false, elapsedMs: 0,
    };
    f.exportValue.customerConsentEvidence.status = "unavailable";
    f.exportValue.customerConsentEvidence.controls = [];
    const publicRef = f.row.refs[0]!;
    const bytes = Buffer.from(JSON.stringify(f.exportValue));
    writeFileSync(publicRef.file, bytes);
    publicRef.sha256 = sha256(bytes);
    const retained = retainedOptOutState(f.extract, f.row)!;
    f.row.states["sealed.control.privacyOptOut"] = retained.state;
    f.row.metricSources = {...f.row.metricSources, "sealed.control.privacyOptOut": retained.source};
    f.row.states["sealed.opt_out.presence"] = "observed";
    f.refresh();

    const options = {firstLayerOptOut: true, sinceUtc: "2026-11-07T12:00:00Z"};
    const review = reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07", options);
    const summary = review.firstLayerOptOut!;
    assert.equal(review.counts.privacyOptOut!.unknown, 1);
    assert.equal(review.cases[0]!.controls.privacyOptOut!.publicState, "unavailable");
    assert.equal(summary.publicUnavailable, 1);
    assert.deepEqual(summary.broaderPresenceAmongUnknown, {observed: 1});
    assert.deepEqual(summary.geometryRefreshAmongUnknown, {"skipped/inventory_outcome_unsupported/at_or_after_inventory": 1});
    assert.throws(() => reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07",
      {...options, sinceUtc: "2026-11-07T12:00:01Z"}), /No reportable retained rows/);

    f.row.states["sealed.control.privacyOptOut"] = "not_observed";
    assert.throws(() => reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07", options), /not_observed/);
  } finally {f.clean();}
});
