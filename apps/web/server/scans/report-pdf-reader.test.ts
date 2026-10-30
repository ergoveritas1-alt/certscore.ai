import assert from "node:assert/strict";
import test from "node:test";
import { priorityChecklistRow } from "./report-priority.fixture";
import type { CanonicalReportExport } from "./report-export";
import { pdfDetailedReviewGroups, pdfConfidenceLabel, pdfRegionLabel, pdfReportCounts, pdfReviewGroups, pdfTestedUrl, pdfRelatedCookieServices, pdfRejectTimingEvents } from "./report-pdf-reader";

function fixture() {
  return { scan: { id: "scan-1", requestedUrl: "https://example.test/test1.html" },
    gdprEprivacyReview: { rows: [
      { id: "pre_consent_third_party_tracking", label: "Initial requests", status: "Gap observed", rationale: "Three directly observed vendors." },
      { id: "session_replay_fingerprinting_review", label: "Replay", status: "Review signal", rationale: "Replay artifacts observed before consent." },
      { id: "privacy_notice_availability", label: "Privacy notice", status: "Gap observed", rationale: "No reachable policy in the completed inspection." },
      { id: "controller_contact_disclosure", label: "Contact", status: "Not confirmed", rationale: "No document." },
    ] }, projection: { checklist: [], unifiedFindings: [
      { unifiedFindingId: "preconsent_tracking", severity: "high", presentation: { confidenceScore: "0.55" } },
      { unifiedFindingId: "gpc_response", severity: "low", presentation: { findingName: "No observable GPC response" } },
    ] }, appendix: { evidenceDossier: { checklistDetails: [] } },
  } as unknown as CanonicalReportExport;
}

test("detailed evidence retains legacy narrative/checklist groups without making them priorities", () => {
  const report = fixture();
  const before = structuredClone(report);
  assert.deepEqual(pdfReportCounts(report), { groups: 0, observations: 0, gaps: 0, review: 0 });
  const groups = pdfDetailedReviewGroups(report);
  assert.deepEqual(groups[0]!.observations.map(row => row.id), ["pre_consent_third_party_tracking", "session_replay_fingerprinting_review"]);
  assert.equal(groups[1]!.title, "Privacy policy not found");
  assert.equal(groups[0]!.observations[0]!.severity, "high");
  assert.equal(groups[0]!.observations[0]!.confidence, "Moderate confidence");
  assert.deepEqual(report, before);
  report.gdprEprivacyReview!.rows.push(report.gdprEprivacyReview!.rows[0]!);
  assert.throws(() => pdfDetailedReviewGroups(report), /Duplicate canonical/);
});

test("cookie service cross-references do not overwrite cookie purpose, setter or classification", () => {
  const report = fixture();
  report.appendix.cookieAndTrackerInventory = { rows: [
    { type: "cookie", vendor: "Unknown", cookieNames: ["_example"], purpose: ["Unknown"], evidenceClassification: "Unknown" },
    { type: "tracker", vendor: "Example Replay", confidence: "high", cookieNames: ["_example"], purpose: ["Session replay"], domains: [], requestDetails: [] },
    { type: "tracker", vendor: "Uncertain", confidence: "low", cookieNames: ["_example"], purpose: ["Analytics"], domains: [], requestDetails: [] },
  ] } as CanonicalReportExport["appendix"]["cookieAndTrackerInventory"];
  const before = structuredClone(report);
  assert.deepEqual(pdfRelatedCookieServices(report, ["_example"]), ["Example Replay (Session replay)"]);
  assert.deepEqual(pdfRelatedCookieServices(report, ["other"]), []);
  assert.deepEqual(report, before);
});

test("Reject timing stays separate from page timing and requires a canonical refusal observation and exclusion proof", () => {
  const report = fixture();
  report.gdprEprivacyReview!.rows.push({ id: "post_reject_tracking_reduction", label: "After Reject", status: "Gap observed", rationale: "Observed activity." } as NonNullable<CanonicalReportExport["gdprEprivacyReview"]>["rows"][number]);
  report.projection.checklist = [priorityChecklistRow()];
  report.appendix.evidenceDossier!.rejectTiming = { inFlightExclusionVerified: true, windowMs: 8000, networkRequestCount: 1,
    storageWriteCount: 0, registrationTimeIsUpperBound: true, networkRequests: [{ url: "https://metrics.example.test/collect", vendor: "Example", millisecondsAfterConfirmation: 71 }] };
  assert.deepEqual(pdfRejectTimingEvents(report), [{ label: "Reject confirmed", milliseconds: 0 }, { label: "Request started", milliseconds: 71 }]);
  report.appendix.evidenceDossier!.rejectTiming.inFlightExclusionVerified = false;
  assert.deepEqual(pdfRejectTimingEvents(report), []);
  report.appendix.evidenceDossier!.rejectTiming.inFlightExclusionVerified = true;
  report.gdprEprivacyReview!.rows.pop();
  report.projection.checklist = [];
  assert.deepEqual(pdfRejectTimingEvents(report), []);
});

test("PDF reader labels preserve exact page identity, Ireland and independent confidence", () => {
  assert.equal(pdfTestedUrl(fixture()), "https://example.test/test1.html");
  assert.equal(pdfRegionLabel("eu_ie"), "Ireland (EU)");
  assert.equal(pdfConfidenceLabel("0.45"), "Limited confidence - verify first");
  assert.equal(pdfConfidenceLabel("0.95"), "High confidence");
  assert.equal(pdfConfidenceLabel(null), "Confidence not established");
});

test("PDF copy distinguishes service requests from iframe proof and preserves the canonical finding state", () => {
  const report = fixture();
  report.gdprEprivacyReview!.rows = [
    { id: "social_media_embed_pre_consent", label: "Social embeds", status: "Gap observed", rationale: "A pixel request was observed." },
    { id: "embedded_content_pre_consent", label: "Embedded services", status: "Review signal", rationale: "Review service domains." },
    { id: "post_reject_tracking_reduction", label: "After Reject", status: "Gap observed", rationale: "Potential issue based on scan evidence; A request was observed after confirmation." },
  ] as NonNullable<CanonicalReportExport["gdprEprivacyReview"]>["rows"];
  report.projection.unifiedFindings = [];
  const before = structuredClone(report);
  const observations = pdfDetailedReviewGroups(report).flatMap(group => group.observations);
  assert.equal(observations[0]!.title, "Social / advertising service requests before consent");
  assert.equal(observations[1]!.title, "Embedded-service requests before consent");
  assert.equal(observations[2]!.status, "Gap observed");
  assert.equal(observations[2]!.explanation, "A request was observed after confirmation.");
  assert.deepEqual(report, before);
});
