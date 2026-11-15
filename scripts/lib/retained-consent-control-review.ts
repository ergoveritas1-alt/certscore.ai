import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {consentControlAssessmentSchema} from "../../packages/certscore-contracts/src/consent-control-assessment";
import {extractExportRow} from "./audit-progress-export";
import {localDay, type ProgressRow} from "./audit-progress";
import {retainedGenerationMatches, retainedOptOutState} from "./audit-progress-opt-out";

const standardControls = ["accept", "reject", "options"] as const;
const optOutControl = "privacyOptOut";
type ReviewOptions = {firstLayerOptOut?: boolean; sinceUtc?: string};
const retainedAssessmentSchema = consentControlAssessmentSchema.innerType().pick({
  artifactType: true, artifactVersion: true, assessmentStatus: true, scan: true,
  document: true, controls: true, coverage: true, provenance: true,
});
export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function tally(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(counts);
}

/** Offline consistency review. A retained assessment is not independent site ground truth. */
export function reviewRetainedConsentControls(data: {rows: ProgressRow[]}, day: string, options: ReviewOptions = {}) {
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  const since = options.sinceUtc === undefined ? -Infinity : Date.parse(options.sinceUtc);
  assert(options.sinceUtc === undefined || (/(?:Z|\+00:00)$/.test(options.sinceUtc) && Number.isFinite(since)), "Expected a UTC cutoff");
  const controls = options.firstLayerOptOut ? [optOutControl] as const : standardControls;
  const rows = data.rows.filter(row => row.reportable && Date.parse(row.createdAt) >= since && localDay(row.createdAt) === day);
  assert(rows.length > 0, "No reportable retained rows for the requested Los Angeles date");
  assert.equal(new Set(rows.map(row => row.scanId)).size, rows.length, "Duplicate cohort scan");
  const verified = new Map<string, unknown>();
  const read = (ref: ProgressRow["refs"][number]): any => {
    const key = `${ref.file}/${ref.sha256}`;
    if (!verified.has(key)) {
      const bytes = readFileSync(ref.file);
      assert.equal(sha256(bytes), ref.sha256, `Changed retained source: ${ref.file}`);
      verified.set(key, JSON.parse(bytes.toString("utf8")));
    }
    return verified.get(key);
  };
  const cases = rows.map(row => {
    const exportRef = row.refs.find(ref => ref.role === "hash_verified_bot_archive_export");
    const assessmentRef = row.refs.find(ref => ref.role === "generation_matched_persisted_control_extract");
    assert(exportRef && assessmentRef, `Missing retained source for ${row.scanId}`);
    const exported = read(exportRef), rebuilt = extractExportRow(exported, exportRef);
    const matches = read(assessmentRef).rows.filter((value: any) => value.scanId === row.scanId);
    assert.equal(matches.length, 1, "Unique original inventory row required");
    const extract = matches[0];
    assert(retainedGenerationMatches(extract, row), `Generation binding failed for ${row.scanId}`);
    const assessment = retainedAssessmentSchema.parse(extract.control_assessment);
    assert.equal(assessment.scan.scanId, row.scanId);
    assert.equal(assessment.scan.noGo, false);
    assert.equal(assessment.artifactVersion, assessment.provenance.contractVersion);
    const customer = exported.customerConsentEvidence;
    assert(["available", "unavailable"].includes(customer?.status), "Explicit customer evidence availability required");
    assert.equal(customer.binding.scanId, row.scanId);
    assert.equal(customer.binding.reportSourceHash, extract.projection_source_hash);
    assert.equal(customer.binding.reportVersion, extract.projection_version);
    if (customer.status === "available") assert.equal(customer.assessment.sourceHash, assessment.provenance.sourceHash);
    else assert.equal(customer.controls.length, 0, "Unavailable customer evidence cannot carry control conclusions");
    const states = Object.fromEntries(controls.map(control => {
      const result = assessment.controls[control];
      const publicState = rebuilt.states[`control.${control}`];
      assert.equal(publicState, row.states[`control.${control}`]);
      if (control === optOutControl) {
        const retained = retainedOptOutState(extract, row);
        assert.equal(retained?.state, result.state, `${row.scanId} opt-out assessment binding`);
        assert.equal(result.state, row.states[`sealed.control.${optOutControl}`]);
        assert.equal(retained?.source, row.metricSources?.[`sealed.control.${optOutControl}`]);
      }
      if (control !== optOutControl || publicState !== "unavailable") {
        assert.equal(result.state, publicState, `${row.scanId}/${control} public parity`);
      }
      if (customer.status === "available") {
        const publicControls = customer.controls.filter((item: any) => item.id === control);
        assert.equal(publicControls.length, 1);
        assert.equal(publicControls[0].state, result.state);
      }
      if (result.state === "not_observed") {
        assert.equal(assessment.document.identityStatus, "matched");
        assert.equal(result.inspection?.status, "complete");
        assert(result.inspection.evidenceRefs.some(ref => ["CanonicalEvidenceBundle.json", "ConsentControlGeometryEvidence.json"].includes(ref)));
      }
      return [control, {state: result.state, inspection: result.inspection, reasons: result.reasonCodes,
        ...(control === optOutControl ? {publicState, layer: result.layer, evidenceRefs: result.evidenceRefs} : {})}];
    }));
    const diagnostic = assessment.coverage.captureDiagnostic;
    if (diagnostic) {
      assert.equal(assessment.document.identityStatus, "matched");
      assert.equal(diagnostic.documentToken, assessment.document.canonicalDocumentToken);
    }
    return {scanId: row.scanId, site: row.site, createdAt: row.createdAt, region: row.region,
      projectionVersion: row.projectionVersion, assessmentVersion: assessment.artifactVersion,
      projectorVersion: assessment.provenance.projectorVersion, assessmentSourceHash: assessment.provenance.sourceHash,
      projectionSourceHash: extract.projection_source_hash, projectionPayloadSha256: extract.projection_payload_sha256,
      controls: states, coverageReasons: assessment.coverage.reasonCodes,
      ...(options.firstLayerOptOut ? {
        documentIdentityStatus: assessment.document.identityStatus,
        completedChannels: assessment.coverage.completedChannels,
        incompleteChannels: assessment.coverage.incompleteChannels,
        acceptRejectOptions: Object.fromEntries(standardControls.map(control => [control, assessment.controls[control].state])),
        broaderOptOutPresence: row.states["sealed.opt_out.presence"] ?? "unavailable",
        optOutGeometry: assessment.coverage.firstLayerOptOutGeometry
          ? {availability: "available", value: assessment.coverage.firstLayerOptOutGeometry}
          : {availability: "unavailable", reason: "not_retained_in_source"},
      } : {}),
      customerEvidence: {availability: customer.status, reason: customer.reason},
      captureDiagnostic: diagnostic ? {availability: "available", value: diagnostic} : {availability: "unavailable", reason: "not_retained_in_source"},
      sources: [exportRef, assessmentRef]};
  });
  const counts = Object.fromEntries(controls.map(control => [control,
    Object.fromEntries(["observed", "not_observed", "unknown"].map(state => [state, cases.filter(row => row.controls[control]?.state === state).length]))]));
  const unknownOptOut = cases.filter(row => row.controls[optOutControl]?.state === "unknown");
  const firstLayerOptOut = options.firstLayerOptOut ? {
    sinceUtc: options.sinceUtc ?? null,
    unknown: unknownOptOut.length,
    publicUnavailable: cases.filter(row => row.controls[optOutControl]?.publicState === "unavailable").length,
    unknownWithObservedAcceptRejectOrOptions: unknownOptOut.filter(row =>
      Object.values(row.acceptRejectOptions ?? {}).includes("observed")).length,
    unknownReasons: tally(unknownOptOut.flatMap(row => [...new Set(row.controls[optOutControl]?.reasons)])),
    broaderPresenceAmongUnknown: tally(unknownOptOut.map(row => row.broaderOptOutPresence ?? "unavailable")),
    optOutGeometryAmongUnknown: tally(unknownOptOut.map(row => row.optOutGeometry?.availability ?? "unavailable")),
    geometryRefreshAmongUnknown: tally(unknownOptOut.map(row => {
      const diagnostic = row.captureDiagnostic.value;
      if (!diagnostic) return "unavailable";
      const delta = diagnostic.geometryMinusInventoryMs;
      const timing = delta === null ? "timing_unavailable" : delta < 0 ? "precedes_inventory" : "at_or_after_inventory";
      return [diagnostic.outcome, diagnostic.eligibilityBlocker ?? diagnostic.skipReason, timing].filter(Boolean).join("/");
    })),
  } : undefined;
  return {version: "certscore.retained-consent-control-review.v1", day, timezone: "America/Los_Angeles",
    reviewed: cases.length, comparisons: cases.length * controls.length, mismatches: 0, counts,
    diagnosticAvailable: cases.filter(row => row.captureDiagnostic.availability === "available").length,
    ...(firstLayerOptOut ? {firstLayerOptOut} : {}),
    independentSiteGroundTruth: false, precision: null, recall: null,
    limitations: ["Retained projection consistency only; no new site visits or reconstructed captures.",
      "Incomplete historical capture cannot establish absence. Missing diagnostics remain unavailable.",
      "The cohort is the retained reportable set at the original dashboard cutoff, not a complete day or population sample."], cases};
}
