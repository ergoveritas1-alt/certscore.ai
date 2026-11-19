import assert from "node:assert/strict";
import test from "node:test";
import { deriveConsentControlAssessment, classifyConsentControlLabel } from "@certscore/contracts";
import { buildPromotionGradePreconsentRequests } from "./preconsent-public-evidence";
import { projectPreconsentTrackingTiming, readPreconsentTrackingTiming } from "./preconsent-tracking-timing";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "./gdpr-eprivacy-checklist-rationale";
import { deriveHighRiskTrackingContext } from "./high-risk-tracking-context";
import { canonicalEvidenceVendorName } from "./canonical-evidence-vendor-name";
import { buildSitePriorityReview } from "./full-site-priority-review";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { getConsentControlSummaryLabel } from "../../components/scans/report-lab/timeline-report-model";
import { checklistRemediation } from "./checklist-remediation";
import { deriveGdprEprivacyCoverageChecklist, type GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

const request = (requestUrl: string, firstSeenMs: number) => ({ requestUrl, firstSeenMs,
  runtimePhase: "pre_consent", vendorName: "Meta Pixel", vendorCategory: "advertising",
  essentiality: "non_essential", classification: "tracking", collectionEndpointObserved: true, confidence: 0.99,
  evidenceRefs: [`request:${firstSeenMs}`],
});
const font = request("https://fonts.googleapis.com/css2?family=Roboto", 5010);
const pixel = request("https://www.facebook.com/tr/?id=example", 7070);
const embed = request("https://www.facebook.com/plugins/page.php", 6330);
function row(id: string, label: string, retainedEvidence: Record<string, unknown> = {}): GdprEprivacyCoverageChecklistItem {
  return { id, label, status: "Gap observed", assessmentStatus: "gap_observed", evidenceState: "observed", evidenceRefs: [], matchedFindingIds: [], matchedSignalKeys: [], missingSourceSignals: [],
    note: label, explanation: label, criticalEvidence: { statusBasis: label, retainedEvidence, missingOrIncompleteSourceSignals: [], projectedFindings: [] } } as unknown as GdprEprivacyCoverageChecklistItem;
}

test("fonts first cannot supply tracking attribution or timing, while later Pixel stays bound to its request", () => {
  const requests = buildPromotionGradePreconsentRequests({ rows: [font, embed, pixel] });
  assert.deepEqual(requests.map(row => [row.vendorName, row.firstSeenMs]), [["Meta Pixel", 7070]]);
  const timing = projectPreconsentTrackingTiming([font, embed, pixel]);
  const tracking = row("pre_consent_third_party_tracking", "Tracking", { trackingRequestTiming: timing, firstObservedMs: 5010,
    representativeRequests: [font], evidenceHighlights: ["first seen 5.01s"] });
  const rationale = deriveGdprEprivacyCoverageChecklistRowRationale(tracking);
  assert.match(rationale, /Meta Pixel at 7\.07 s/);
  assert.doesNotMatch(rationale, /5.01|Google Fonts/);
  assert.equal(timing.requests[0]?.requestUrl, "https://www.facebook.com/tr/?redacted=1");
  assert.equal(timing.requests[0]?.runtimePhase, "pre_consent");
  assert.deepEqual(readPreconsentTrackingTiming({ ...timing, requests: timing.requests.map(request => ({ ...request, vendorCategory: "infrastructure" })) }), []);
  assert.deepEqual(timing.requests[0]?.evidenceRefs, ["request:7070"]);
  assert.deepEqual(buildPromotionGradePreconsentRequests({ rows: [font] }), []);
  assert.deepEqual(projectPreconsentTrackingTiming([font]).requests, []);
  assert.deepEqual(projectPreconsentTrackingTiming([{ ...pixel, runtimePhase: "after_accept" }]).requests, []);
  assert.deepEqual(projectPreconsentTrackingTiming([{ ...pixel, runtimePhase: undefined }]).requests, []);
  const untimed = deriveGdprEprivacyCoverageChecklistRowRationale(row("pre_consent_third_party_tracking", "Tracking", { firstObservedMs: 5010 }));
  assert.match(untimed, /precise request timing is unavailable/);
  assert.doesNotMatch(untimed, /5.01/);
});

test("shared Google/Facebook hosts never invent Enterprise or Pixel; verified embed identity remains", () => {
  const evidenceUrls = [font.requestUrl, embed.requestUrl, "https://www.google.com/", "https://connect.facebook.net/en_US/sdk.js"];
  const context = deriveHighRiskTrackingContext({ evidenceUrls, thirdPartyDomains: ["google.com", "www.facebook.com", "fonts.gstatic.com"] });
  assert.equal(context.highRiskVendors.some(row => /recaptcha|pixel/i.test(row.name)), false);
  assert.equal(canonicalEvidenceVendorName(embed.requestUrl), "Facebook Page Plugin");
  assert.notEqual(canonicalEvidenceVendorName(evidenceUrls[3]!), "Meta Pixel");
  assert.equal(canonicalEvidenceVendorName(font.requestUrl), "Google Fonts");
  const verified = deriveHighRiskTrackingContext({ evidenceUrls: [pixel.requestUrl, "https://www.google.com/recaptcha/enterprise.js"] });
  assert.ok(verified.highRiskVendors.some(row => row.name === "Meta Pixel"));
  assert.ok(verified.highRiskVendors.some(row => row.name === "reCAPTCHA Enterprise"), "an Enterprise-specific registry endpoint supports the exact edition");
  assert.equal(deriveHighRiskTrackingContext({ evidenceUrls: ["https://www.google.com/recaptcha/api.js"] }).highRiskVendors.some(row => /recaptcha/i.test(row.name)), false);
  assert.equal(canonicalEvidenceVendorName("https://www.google.com/recaptcha/enterprise.js"), "Google reCAPTCHA");
});

test("priority grouping keeps tracking and embed page scopes distinct and refusal independently actionable", () => {
  const rows = [row("pre_consent_third_party_tracking", "Tracking", { trackingRequestTiming: projectPreconsentTrackingTiming([pixel]) }),
    row("social_media_embed_pre_consent", "Social/media embeds"), row("embedded_content_pre_consent", "Embedded services"),
    row("reject_all_path_availability", "Decline consent control")];
  const original = JSON.stringify(rows);
  const pages = Array.from({ length: 10 }, (_, index) => ({ id: `${index}`, url: `https://clinic.example/${index}`, homepage: index === 0,
    findingIds: index === 0 ? rows.map(row => row.id) : ["social_media_embed_pre_consent", "embedded_content_pre_consent"] }));
  const findings = buildSitePriorityReview(rows, pages);
  assert.equal(findings.length, 2);
  const grouped = findings.find(finding => finding.title === "Tracking and embedded content before consent");
  assert.ok(grouped, JSON.stringify(findings));
  assert.equal(grouped.pages.length, 10);
  assert.equal(grouped.observations?.find(row => row.id === "pre_consent_third_party_tracking")?.pages.length, 1);
  assert.equal(grouped.observations?.find(row => row.id === "social_media_embed_pre_consent")?.pages.length, 10);
  assert.equal(JSON.stringify(rows), original, "grouping never mutates scoring/checklist inputs");
});

test("typed acknowledgment semantics pass through normalized concern and policy without changing visibility", () => {
  const url = "https://clinic.example/";
  const classification = classifyConsentControlLabel({ label: "VERSTANDEN", hasConsentContext: true });
  const assessment = deriveConsentControlAssessment({ scan: { scanId: "fixture", requestedUrl: url, finalUrl: url, scanStatus: "completed" },
    document: { canonicalDocumentId: url, observedDocumentIds: [url], identityStatus: "matched" },
    observations: [{ observationId: "first-layer", observedAtMs: 100, likelyPresent: true, layerInspected: "first_layer", documentId: url,
      captureStatus: "observed", completedChannels: ["dom_inventory"], controls: [{ intent: "accept", label: "VERSTANDEN", visible: true, actionable: true,
        layer: "first_layer", evidenceId: "ack-control", classifierReasonCodes: classification.reasonCodes, matchStrength: classification.matchStrength,
        artifactRefs: ["CanonicalEvidenceBundle.json"] }] }],
    geometry: { assessmentStatus: "complete", documentId: url, completedChannels: ["geometry"], incompleteChannels: [], candidates: [] },
    surface: { status: "observed_actionable", evidenceRefs: ["CanonicalEvidenceBundle.json"] },
    coverage: { status: "complete", requiredChannels: ["dom_inventory", "geometry"], completedChannels: ["dom_inventory", "geometry"], incompleteChannels: [], reasonCodes: [] },
  });
  const runtimeArtifacts = { consentControlAssessment: assessment };
  const concerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const inventory = concerns.find(row => row.evidenceBundle.rawEvidence?.consentControlInventoryEvidence === true);
  assert.ok(inventory?.evidenceBundle.rawEvidence?.consentControlBehavior);
  const policy = deriveGdprEprivacyCoveragePolicyOutcomes({ coverageLimited: false, scanCompleted: true, runtimeArtifacts, normalizedConcerns: concerns });
  assert.match(String(policy.accept_consent_control?.criticalEvidence.retainedEvidence.consentControlBehavior && policy.accept_consent_control.criticalEvidence.statusBasis), /contextual acknowledgment/);
  const checklist = deriveGdprEprivacyCoverageChecklist({ scanCompleted: true, coverageOutcomes: policy, coverageLimited: false, unifiedFindings: [] });
  const acceptRow = checklist.find(row => row.id === "accept_consent_control");
  assert.ok(acceptRow?.criticalEvidence.retainedEvidence.consentControlBehavior);
  assert.equal(getConsentControlSummaryLabel({ accept: "Observed", reject: "Not observed", options: "Not observed" }), "1 of 3 observed");
  assert.match(checklistRemediation({ rowId: "reject_all_path_availability", status: "Gap observed" })!.steps.join(" "), /Adding a Reject button alone/);
});


test("policy-to-checklist handoff preserves request-bound timing and excludes fonts-only evidence", () => {
  for (const requests of [[font, pixel], [font]]) {
    const runtimeArtifacts = { requestPurposeClassificationConfidence: requests, firstThirdPartyRequestMs: 5010 };
    const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
    const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ coverageLimited: false, scanCompleted: true, runtimeArtifacts, normalizedConcerns, snapshot: { pages_scanned: 1 } });
    const items = deriveGdprEprivacyCoverageChecklist({ scanCompleted: true, coverageOutcomes, coverageLimited: false, unifiedFindings: [] });
    const tracking = items.find(row => row.id === "pre_consent_third_party_tracking");
    assert.ok(tracking);
    const timing = tracking.criticalEvidence.retainedEvidence.trackingRequestTiming as { requests: Array<{ firstSeenMs: number; vendorName: string }> } | undefined;
    if (requests.length === 2) {
      assert.deepEqual(timing?.requests.map(row => [row.vendorName, row.firstSeenMs]), [["Meta Pixel", 7070]]);
    } else {
      assert.notEqual(tracking.status, "Gap observed");
      assert.equal(timing?.requests.length ?? 0, 0);
    }
  }
});
