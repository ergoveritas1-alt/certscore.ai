import assert from "node:assert/strict";
import test from "node:test";
import { buildReportPdfV2Model, pdfV2Status, pdfV2Words } from "./report-pdf-v2-model";
import {REPORT_STATUS_LABELS,REPORT_FOLLOW_UP} from "../../lib/scans/report-status-presentation";
import type { CanonicalReportExport } from "./report-export";
import { isRegulatoryFindingRelevant } from "../../lib/scans/regulatory-review-catalog";
function fixture(): CanonicalReportExport {
    return { artifactType: "certscore_canonical_report_export", artifactVersion: "canonical-report-export-v8", reviewFocus: "gdpr_eprivacy", reviewFocusLabel: "GDPR/ePrivacy", reviewScope: "Starting page", score: { value: 80, scope: "starting_page" }, californiaScore: { score: 86 },
        scan: { id: "pdf-v2-fixture", domainHostname: "example.test", requestedUrl: "https://example.test/", completedAt: "2026-10-21T23:19:00Z", scanFrom: "eu_de" },
        projection: { unifiedFindings: [], checklist: [] }, consentControlAssessment: null, gpcResponse: null, accessibilityAudit: null, accessibilityEvidence: null,
        appendix: { evidenceDossier: { cmp: { provider: null, audit: { rows: [] } }, checklistDetails: [] }, cookieAndTrackerInventory: { presentationStatus: "insufficient_evidence", summary: { inventoryMetrics: [] }, rows: [] },
            dataCollectionSurfaces: { assessmentStatus: "insufficient_evidence", coverage: null, summary: { totalForms: 0, totalFields: 0 }, pageUrl: null }, gdprTransparency: { rows: [] } },
    } as unknown as CanonicalReportExport;
}
function finding(id: string, summary = "A qualified observation was recorded.", scoreEffect = false) {
    return { unifiedFindingId: id, title: id === "policy_clarity_risk" ? "Policy clarity risk" : id, summary, severity: "medium", presentation: { confidenceScore: "0.55", suggestedFix: "Review the specific recorded observation." },
        presentationDecision: { status: "surface" }, surfacingDecision: { reportable: true, decisionState: "review", reportLane: "main" }, scoreEffects: scoreEffect ? [{ deductionPoints: 7 }] : [] };
}
function add(r: CanonicalReportExport, f: ReturnType<typeof finding>) { r.projection.unifiedFindings.push(f as never); }
function windows(r: CanonicalReportExport, requestPurpose = "analytics") {
    r.appendix.evidenceDossier!.cmp!.audit.rows = [{ id: "implementation", label: "Choice activity", status: "Review recommended", supportingEvidence: { inventory: { choiceActivity: [
                        { action: "accept", windowMs: 3000, requestCount: 1, nonEssentialRequestCount: 1, requests: [{ hostname: "collector.example", path: "/event", vendor: "Reviewed recipient", purpose: requestPurpose, msAfterClick: 500, nonEssential: true }] },
                        { action: "reject", windowMs: 1400, requestCount: 1, nonEssentialRequestCount: 1, requests: [{ hostname: "collector.example", path: "/event", vendor: "Reviewed recipient", purpose: requestPurpose, msAfterClick: 80, nonEssential: true }] },
                    ] } } }] as never;
}
test("empty or missing evidence stays unknown, without a passing headline or retest task", () => {
    const r = fixture(), before = JSON.stringify(r), m = buildReportPdfV2Model(r);
    assert.equal(m.issues.length, 0);
    assert.equal(m.retest, null);
    assert.equal(m.metrics[1]!.value, "Unknown");
    assert.equal(m.topics.find(t => t.title === "CMP and consent")?.status, "Not tested");
    assert.equal(m.topics.find(t => t.title === "Privacy policy")?.status, "Not tested");
    assert.equal(m.topics.find(t => t.title === "External services")?.status, "Not tested");
    assert.equal(m.topics.find(t => t.title === "Cookies and storage")?.status, "Partial");
    assert.match(m.sections.find(s => s.id === "forms-security")!.summary, /partial or unavailable/);
    assert.equal(JSON.stringify(r), before);
});
test("Observed remains an observation, never a blanket Pass", () => {
    assert.equal(pdfV2Status("Observed"), "Observed");
    assert.equal(pdfV2Status("Insufficient evidence"), "Partial");
    assert.equal(pdfV2Status("Review recommended"), "Review");
    assert.equal(pdfV2Status("not_detected"), "Not observed");
    assert.equal(pdfV2Status("new_unrecognized_status"), "Not tested");
});
test("zero score effect does not turn a review finding into information or mutate scoring", () => {
    const r = fixture();
    add(r, finding("policy_clarity_risk"));
    const before = JSON.stringify(r), m = buildReportPdfV2Model(r);
    assert.equal(m.otherIssues[0]!.tier, "Review");
    assert.equal(m.score, 80);
    assert.equal(m.retest, null);
    assert.equal(m.issues.length, 0);
    assert.equal(JSON.stringify(r), before);
});
test("only the explicit Accept baseline is informational and requires no repair procedure", () => {
    const r = fixture();
    add(r, finding("post_accept_consent_dependent_activity"));
    const m = buildReportPdfV2Model(r);
    assert.equal(m.otherIssues[0]!.tier, "For information");
    assert.deepEqual(m.otherIssues[0]!.steps, []);
    assert.equal(m.retest, null);
});
test("refusal and overlap retain every original finding exactly once without inventing a shared cause", () => {
    const r = fixture();
    windows(r);
    add(r, finding("post_reject_click_tracking"));
    add(r, finding("accept_reject_outcomes_indistinguishable"));
    const before = JSON.stringify(r), m = buildReportPdfV2Model(r);
    assert.equal(m.findings.length, 2);
    assert.equal(m.otherIssues.length, 1);
    assert.equal(m.issues.length, 0);
    assert.deepEqual(m.otherIssues[0]!.findingIds, ["post_reject_click_tracking", "accept_reject_outcomes_indistinguishable"]);
    const copy = JSON.stringify(m.otherIssues[0]!.blocks);
    assert.match(copy, /partial overlap, not equivalent outcomes/);
    assert.match(copy, /3.0 s; Reject 1.4 s/);
    assert.match(copy, /After Reject click/);
    assert.match(copy, /After Accept click/);
    assert.equal(JSON.stringify(r), before);
});
test("recorded requests without a projected refusal finding do not create a new issue", () => {
    const r = fixture();
    windows(r);
    const m = buildReportPdfV2Model(r);
    assert.equal(m.issues.length, 0);
    assert.equal(m.retest, null);
    assert.equal(m.metrics.find(v => v.label === "After Reject")?.value, "1");
});
test("unconfirmed and unavailable execution are not labeled as registered choices", () => {
    const r = fixture();
    windows(r);
    r.postRefusalObservation = { execution: { clickCompleted: true, consentConfirmed: false } } as never;
    const m = buildReportPdfV2Model(r), section = m.sections.find(s => s.id === "choice-reject")!;
    const comparison = section.blocks.find(b => b.kind === "table")!;
    assert.ok(comparison.kind === "table");
    assert.equal(comparison.rows[1]![2], "Unconfirmed");
    assert.equal(comparison.rows[1]![1], "Not recorded");
});
test("an unmatched name in incomplete declarations stays a comparison fact, not an invalid-cookie finding", () => {
    const r = fixture();
    r.appendix.evidenceDossier!.cmp!.audit.rows = [{ id: "found_not_declared", status: "Partially assessed", supportingEvidence: { cookieComparison: { declarationInventoryComplete: false }, inventory: { cookies: [{ name: "observed_name", observedIn: ["after_accept"] }], declarations: [{ name: "_hjSessionBenutzer_*", duration: "60 Tage", purpose: "functional" }] } } }] as never;
    const m = buildReportPdfV2Model(r), section = m.sections.find(s => s.id === "cookie-comparison")!;
    assert.equal(m.issues.length, 0);
    assert.match(section.coverage, /incomplete/);
    assert.match(JSON.stringify(section.blocks), /No match in captured declarations/);
    assert.doesNotMatch(JSON.stringify(section), /Not declared|cannot match|machine.translat/);
    assert.match(JSON.stringify(m.sections.find(s => s.id === "declarations")), /_hjSessionBenutzer_/);
});
test("input binding and public-export guards reject other-scan or internal targets", () => {
    const wrong = fixture();
    wrong.consentControlAssessment = { scan: { scanId: "other-scan" } } as never;
    assert.throws(() => buildReportPdfV2Model(wrong), /different scan/);
    const internal = fixture();
    internal.scan.requestedUrl = "http://127.0.0.1/private";
    assert.throws(() => buildReportPdfV2Model(internal), /internal infrastructure/);
});
test("GDPR PDF excludes California GPC and sale/sharing panels without changing stored evidence or scores", () => {
    const r = fixture();
    r.gpcResponse = { contractVersion: "certscore.gpc-response-assessment.v3", observation: { scanId: r.scan.id, delivery: { fullContextVerified: true }, registration: { sale: "unknown", sharing: "unknown" }, requests: { classifiedCount: 0 } }, comparison: { comparable: true, deltas: { trackers: { baselineCount: 0, gpcCount: 0 } } } } as unknown as NonNullable<CanonicalReportExport["gpcResponse"]>;
    add(r, finding("gpc_response"));
    const before=JSON.stringify(r),m = buildReportPdfV2Model(r);
    assert.equal(m.findings.length, 0);
    assert.equal(m.topics.length,7);
    assert.equal(m.topics.find(t => t.title === "Global Privacy Control"), undefined);
    assert.ok(m.sections.some(s=>s.id==="capture"));
    assert.doesNotMatch(JSON.stringify({topics:m.topics,sections:m.sections,findings:m.findings}),/Global Privacy Control|GPC|sale \/ sharing|California privacy/);
    assert.equal(JSON.stringify(r),before);
    assert.equal(m.score,80);
    assert.ok(r.gpcResponse?.observation);
    assert.ok(r.gpcResponse?.contractVersion === "certscore.gpc-response-assessment.v3");
    r.gpcResponse.observation.scanId = "wrong-scan";
    assert.throws(() => buildReportPdfV2Model(r), /different scan/);
});
test("known California-only findings stay scoped even when they contain a positive finding",()=>{
    const r=fixture();add(r,finding("gpc_response","Positive collection under delivered GPC.",true));
    add(r,finding("california_notice_at_collection_destination_error"));
    add(r,finding("policy_clarity_risk"));
    const before=JSON.stringify(r),m=buildReportPdfV2Model(r);
    assert.deepEqual(m.findings.map(f=>f.id),["policy_clarity_risk"]);
    assert.equal(JSON.stringify(r),before);
    assert.equal(isRegulatoryFindingRelevant("gpc_response","gdpr_eprivacy"),false);
    assert.equal(isRegulatoryFindingRelevant("gpc_response","ccpa_cpra"),true);
    assert.equal(isRegulatoryFindingRelevant("policy_clarity_risk","gdpr_eprivacy"),true);
});
test("inconclusive accessibility checks do not become confirmed failures or repair findings",()=>{
    const r=fixture();
    r.accessibilityAudit={status:"limited",failedRuleCount:0,reviewRuleCount:2} as never;
    r.accessibilityEvidence={rulesEvaluated:["aria-hidden-focus","color-contrast"],violations:[],reviewItems:[]} as never;
    const before=JSON.stringify(r),m=buildReportPdfV2Model(r);
    assert.equal(m.topics.find(t=>t.title==="Accessibility")!.status,"Manual review");
    assert.match(m.topics.find(t=>t.title==="Accessibility")!.summary,/0 failed and 2 review/);
    assert.equal(m.findings.length,0);
    assert.equal(m.issues.length,0);
    assert.equal(JSON.stringify(r),before);
});
test("branding fallback, paper-independent model, frozen dates and one-time entity decoding", () => {
    const r = fixture();
    const m = buildReportPdfV2Model(r, { timeZone: "America/Los_Angeles" });
    assert.equal(m.brandName, "CertScore.ai");
    assert.equal(m.presentation.statusLabels,REPORT_STATUS_LABELS);
    assert.equal(m.presentation.followUp,REPORT_FOLLOW_UP);
    assert.match(m.date, /21 Oct 2026/);
    assert.match(m.date, /PDT$/);
    assert.match(m.utc, /23:19/);
    assert.equal(pdfV2Words("&lt;100ms &amp; a Not Not retained value"), "<100 ms & a Not recorded value");
    assert.equal(buildReportPdfV2Model(r, { brandName: "Example workspace" }).brandName, "Example workspace");
});
test("other canonical finding topics keep their own evidence destination and remediation", () => {
    const r = fixture();
    add(r, finding("transport_security_https_delivery"));
    const m = buildReportPdfV2Model(r);
    assert.equal(m.otherIssues[0]!.evidenceTarget, "forms-security");
    assert.equal(m.otherIssues[0]!.expected, "Review the specific recorded observation.");
});
test("unsupported frameworks and scopes fail closed instead of reusing GDPR starting-page wording", () => {
    const r = fixture();
    r.reviewFocus = "california" as never;
    assert.throws(() => buildReportPdfV2Model(r), /starting-page GDPR/);
    const full = fixture();
    full.score.scope = "full_site" as never;
    assert.throws(() => buildReportPdfV2Model(full), /starting-page GDPR/);
});

test("request purpose labels render as plain English without changing their classification", () => {
    const r = fixture(); windows(r, "tag_management");
    const section = buildReportPdfV2Model(r).sections.find(s => s.id === "choice-accept")!;
    assert.match(JSON.stringify(section), /Tag management/);
    assert.doesNotMatch(JSON.stringify(section), /tag_management/);
    assert.match(JSON.stringify(section), /Non-essential/);
});
