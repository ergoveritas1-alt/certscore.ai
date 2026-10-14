import assert from "node:assert/strict";
import test from "node:test";
import { consentControlAssessmentSchema } from "@certscore/contracts";
import type { ScanScoreExplanation } from "@certscore/api-contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import { projectCmpAudit } from "./cmp-audit-projection";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";

const find = (audit: ReturnType<typeof projectCmpAudit>, id: string) => audit.rows.find(row => row.id === id)!;
const finding = (id: string, status: "surface" | "suppress" = "surface") => ({ unifiedFindingId: id,
  presentationDecision: { status }, summary: "Retained canonical concern." }) as UnifiedFindingDisplayPacket;
const policyRow = (overrides = {}) => ({ id: "privacy_notice_availability", status: "Observed",
  evidenceState: "observed", assessmentStatus: "checked", ...overrides }) as GdprEprivacyCoverageChecklistItem;

test("audit preserves verified control results and leaves broader CMP capabilities unassessed", () => {
  const input = { scanId: "scan-1", consentControlAssessment: structuredClone(observedControlAssessment) };
  const before = structuredClone(input);
  const result = projectCmpAudit(input);
  assert.equal(find(result, "banner").status, "Observed");
  assert.equal(find(result, "reject").status, "Observed");
  for (const id of ["prominence", "categories", "services", "privacy_access", "consent_record", "implementation", "duration", "declared_not_found", "found_not_declared", "cookie_information"]) {
    assert.equal(find(result, id).status, "Not assessed", id);
  }
  assert.equal(result.assessmentSourceHash, observedControlAssessment.provenance.sourceHash);
  assert.deepEqual(input, before);
});

test("unknown control remains unassessed; a complete negative retains its result", () => {
  const assessment = structuredClone(observedControlAssessment);
  assessment.assessmentStatus = "limited"; assessment.coverage.status = "limited";
  assessment.controls.reject.state = "unknown";
  assert.equal(find(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment }), "reject").status, "Not assessed");
  assessment.controls.reject.state = "not_observed";
  assert.equal(find(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment }), "reject").status, "Not observed");
});

test("prominence explains a retained screenshot safety timeout without changing assessments", () => {
  const assessment = consentControlAssessmentSchema.parse(structuredClone(observedControlAssessment));
  assessment.visualEvidence = { status: "withheld", artifactRefs: [], reasonCodes: ["safety_check_unavailable", "finalization_deadline_exceeded"] };
  const before = structuredClone(assessment);
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment });
  const row = find(audit, "prominence");
  assert.equal(row.status, "Not assessed");
  assert.equal(row.detail, "Screenshot safety review timed out; the button comparison was not assessed.");
  assert.deepEqual(row.sourceIds, ["consentControlAssessment.visualEvidence"]);
  assert.equal(row.supportingEvidence, undefined);
  assert.equal(find(audit, "reject").status, "Observed");
  assert.deepEqual(assessment, before);
  const wrongScan = projectCmpAudit({ scanId: "another-scan", consentControlAssessment: assessment });
  assert.doesNotMatch(find(wrongScan, "prominence").detail!, /timed out/);
  assessment.visualEvidence.status = "available";
  assert.doesNotMatch(find(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment }), "prominence").detail!, /timed out/);
});

test("missing, malformed, blocked, wrong-scan and document-unbound assessments cannot create negatives", () => {
  for (const variant of ["missing", "malformed", "blocked", "wrong_scan", "document", "unavailable"]) {
    const assessment = structuredClone(observedControlAssessment);
    assessment.controls.reject.state = "not_observed";
    if (variant === "blocked") assessment.scan.noGo = true;
    if (variant === "wrong_scan") assessment.scan.scanId = "another-scan";
    if (variant === "document") assessment.document.identityStatus = "mismatched";
    if (variant === "unavailable") { assessment.assessmentStatus = "limited"; assessment.coverage.status = "none"; }
    const result = projectCmpAudit({ scanId: "scan-1", consentControlAssessment:
      variant === "missing" ? undefined : variant === "malformed" ? { controls: assessment.controls } : assessment });
    assert.ok(result.rows.every(row => row.status === "Not assessed"), variant);
    assert.equal(result.assessmentSourceHash, null);
  }
});

test("public-policy discovery does not assert banner access, cookie detail or CMP inventory completeness", () => {
  const result = projectCmpAudit({ scanId: "scan-1", checklistRows: [policyRow()] });
  assert.equal(find(result, "privacy_link").status, "Observed");
  assert.match(find(result, "privacy_link").detail!, /Public/);
  for (const id of ["privacy_access", "cookie_information", "found_not_declared"]) assert.equal(find(result, id).status, "Not assessed");
  for (const row of [policyRow({ assessmentStatus: "coverage_limitation" }), policyRow({ status: "Not confirmed" }), policyRow({ status: "Not observed", evidenceState: "not_observed" })]) {
    assert.equal(find(projectCmpAudit({ scanId: "scan-1", checklistRows: [row] }), "privacy_link").status, "Not assessed");
  }
});

test("only surfaced prominence and implementation findings can recommend review; silence is not a pass", () => {
  for (const status of ["surface", "suppress"] as const) {
    const result = projectCmpAudit({ scanId: "scan-1", unifiedFindings: [finding("accept_more_prominent_than_reject", status), finding("acceptance_signal_contradicts_action", status)] });
    assert.equal(find(result, "prominence").status, status === "surface" ? "Review recommended" : "Not assessed");
    assert.equal(find(result, "implementation").status, status === "surface" ? "Review recommended" : "Not assessed");
    assert.ok(result.rows.every(row => row.deductionPoints === undefined));
  }
});

test("deduction labels use applied family points and never manufacture amounts or split a capped family", () => {
  const assessment = structuredClone(observedControlAssessment); assessment.controls.reject.state = "not_observed";
  const explanation = { deductions: [{ family: "consent_controls", deductionPoints: 7,
    rules: [{ ruleId: "reject_all_path_availability", policyDeductionPoints: 12 }] }] } as ScanScoreExplanation;
  const input = { scanId: "scan-1", consentControlAssessment: assessment, scoreExplanation: explanation };
  assert.equal(find(projectCmpAudit(input), "reject").deductionPoints, 7);
  assert.equal(find(projectCmpAudit({ ...input, scoreExplanation: null }), "reject").deductionPoints, undefined);
  const multiRule = structuredClone(explanation);
  multiRule.deductions[0]!.rules.push({ ...multiRule.deductions[0]!.rules[0]!, ruleId: "other" });
  assert.equal(find(projectCmpAudit({ ...input, scoreExplanation: multiRule }), "reject").deductionPoints, undefined);
  assessment.controls.reject.state = "unknown"; assessment.assessmentStatus = "limited";
  assert.equal(find(projectCmpAudit(input), "reject").deductionPoints, undefined);
});

test("post-Reject coverage limitations never become implementation concerns", () => {
  const row = { id: "post_reject_tracking_reduction", status: "Review signal", evidenceState: "observed",
    assessmentStatus: "review_signal", note: "Non-essential activity observed after Reject." } as GdprEprivacyCoverageChecklistItem;
  assert.equal(find(projectCmpAudit({ scanId: "scan-1", checklistRows: [row] }), "implementation").status, "Review recommended");
  const limited = { ...row, status: "Not confirmed", evidenceState: "not_testable", assessmentStatus: "coverage_limitation" } as GdprEprivacyCoverageChecklistItem;
  assert.equal(find(projectCmpAudit({ scanId: "scan-1", checklistRows: [limited] }), "implementation").status, "Not assessed");
});

test("implementation displays canonical coverage reasons without inventing an issue or pass", () => {
  for (const reason of ["The Reject test evidence failed validation and could not be used.", "The independent Reject test did not finish within the scan window."]) {
    const row = policyRow({ id: "post_reject_tracking_reduction", assessmentStatus: "coverage_limitation", evidenceState: "not_testable", status: "Not testable", note: reason, limitation: reason });
    const result = projectCmpAudit({ scanId: "scan-1", checklistRows: [row] });
    assert.equal(find(result, "implementation").status, "Not assessed");
    assert.equal(find(result, "implementation").detail, reason);
    assert.ok(!find(result, "implementation").deductionPoints);
    assert.ok(result.rows.filter(row => row.status === "Not assessed").every(row => row.detail));
  }
});

test("inline prominence requires a surfaced finding bound to the retained assessment", () => {
  const assessment = structuredClone(observedControlAssessment);
  const measure = { bounds: [20, 20, 100, 40], fillContrast: 4, outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 };
  const proof = { version: "consent_visual_prominence_projection.v1", assessmentSourceHash: assessment.provenance.sourceHash,
    comparison: { version: "consent_control_visual_comparison.v1", documentToken: "doc", screenshotArtifactRef: "retained.png", screenshotSha256: "a".repeat(64), imageWidth: 500, imageHeight: 500, captureSkewMs: 100,
      accept: { ...measure, candidateId: "accept" }, reject: { ...measure, candidateId: "reject", bounds: [20, 80, 100, 40], fillContrast: 1 } } };
  const projected = finding("accept_more_prominent_than_reject");
  projected.evidence = { entities: { consentVisualProminence: [JSON.stringify(proof)] } } as any;
  const input = { scanId: "scan-1", consentControlAssessment: assessment, unifiedFindings: [projected] };
  assert.equal(find(projectCmpAudit(input), "prominence").supportingEvidence?.prominence?.accept.fillContrast, 4);
  proof.assessmentSourceHash = "fnv1a-00000000";
  projected.evidence!.entities!.consentVisualProminence = [JSON.stringify(proof)];
  assert.equal(find(projectCmpAudit(input), "prominence").supportingEvidence, undefined);
  projected.evidence!.entities!.consentVisualProminence = ["malformed"];
  assert.equal(find(projectCmpAudit(input), "prominence").supportingEvidence, undefined);
  projected.presentationDecision.status = "suppress";
  assert.equal(find(projectCmpAudit(input), "prominence").supportingEvidence, undefined);
});

test("inline request evidence requires confirmed canonical Reject coverage and excludes query values", () => {
  const row = { id: "post_reject_tracking_reduction", status: "Review signal", evidenceState: "observed", assessmentStatus: "review_signal", note: "Retained requests.",
    criticalEvidence: { retainedEvidence: { rejectInteractionConfirmed: true, postRejectNonEssentialRequests: [{ url: "https://example.com/script.js?secret=hidden", hostname: "example.com", vendor: "Example", category: "analytics", activityType: "network_request", nonEssential: true, msAfterReject: 754 }] } } } as any;
  const project = () => find(projectCmpAudit({ scanId: "scan-1", checklistRows: [row] }), "implementation");
  assert.deepEqual(project().supportingEvidence?.requests, [{ hostname: "example.com", path: "/script.js", vendor: "Example", category: "analytics", msAfterReject: 754 }]);
  row.criticalEvidence.retainedEvidence.rejectInteractionConfirmed = false;
  assert.equal(project().supportingEvidence, undefined);
  row.criticalEvidence.retainedEvidence.rejectInteractionConfirmed = true;
  row.criticalEvidence.retainedEvidence.postRejectNonEssentialRequests[0].hostname = "wrong.example";
  assert.equal(project().supportingEvidence, undefined);
  row.assessmentStatus = "coverage_limitation";
  assert.equal(project().supportingEvidence, undefined);
});
