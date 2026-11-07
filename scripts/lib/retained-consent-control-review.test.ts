import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import fixture from "../../apps/web/lib/scans/test-fixtures/dollar-general-consent-assessment.json";
import {extractExportRow} from "./audit-progress-export";
import {reviewRetainedConsentControls, sha256} from "./retained-consent-control-review";

function cohort() {
  const root = mkdtempSync(join(tmpdir(), "consent-retained-review-"));
  const assessment = structuredClone(fixture.assessment), id = assessment.scan.scanId;
  const exportValue = {scanId: id, domain: "fixture.test", scanStatus: "completed",
    timestamps: {createdAt: "2026-11-07T12:00:00Z"},
    meta: {projectionVersion: "pulse-public-v11", reportProjectionVersion: "scan-report-projection-v27", reportProjectionSourceHash: "a".repeat(64)},
    consentSurfaceEvidence: {firstLayerConsentChoices: {capturedBeforeInteraction: true, layerInspected: "first_layer", controlInventoryComplete: true,
      acceptControlObserved: true, rejectControlObserved: false, managePreferencesControlObserved: false}},
    customerConsentEvidence: {status: "available", reason: "persisted_snapshot_only", binding: {scanId: id, reportSourceHash: "a".repeat(64), reportVersion: "scan-report-projection-v27"},
      assessment: {sourceHash: assessment.provenance.sourceHash}, controls: ["accept", "reject", "options"].map(id => ({id, state: assessment.controls[id as "accept"].state}))}};
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
  return {root, extract, row, refresh, clean: () => rmSync(root, {recursive: true, force: true})};
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
    f.extract.control_assessment.controls.reject.inspection.status = "limited"; f.refresh();
    assert.throws(() => reviewRetainedConsentControls({rows: [f.row]}, "2026-11-07"), /complete/);
  } finally {f.clean();}
});
