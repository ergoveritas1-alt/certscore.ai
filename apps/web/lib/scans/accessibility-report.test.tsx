import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accessibilityProjectionFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { projectAccessibilityAuditSummary } from "./accessibility-audit-evidence";
import { accessibilityIssueCountLabel, accessibilityOverviewCopy } from "./accessibility-report";
import { projectAccessibilityPriorities } from "./accessibility-priority";
import { ACCESSIBILITY_PRIORITY_GROUP_ID, groupAccessibilityPriorityEntries } from "./accessibility-priority-group";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { buildSitePriorityReview, type SitePriorityFinding } from "./full-site-priority-review";
import { AccessibilityEvidence, AccessibilitySnapshotContent } from "../../components/scans/accessibility-evidence";
import { EvidenceDirectory, SignalSnapshot } from "../../components/scans/report-lab/shadow-scan-report";
import { SHADOW_REPORT } from "../../components/scans/report-lab/shadow-report-data";
import { buildExecutiveOverview } from "../../components/scans/report-lab/executive-overview-copy";
import { comparePriorityReviewFindings } from "./priority-review-order";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { StatusBadge } from "../../components/scans/report-finding-row";
import { SitePriorityReview } from "../../components/scans/site-priority-review";
import { buildDetailedEvidenceExport } from "./detailed-evidence-report";
import { buildRegulatoryAssessmentHighlights } from "./regulatory-assessment-highlights";

function fixture() {
  const projection = accessibilityProjectionFixture();
  projection.observation.violations[0]!.impact = "critical";
  const audit = projectAccessibilityAuditSummary(projection)!;
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit: projection },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  return { projection, observation: projection.observation, audit, packets };
}

test("frame changes have the same explicit coverage reason in the report and shared export", () => {
  const projection = accessibilityProjectionFixture({ status: "limited", rulesEvaluated: [], violations: [], reviewItems: [], limitations: ["frames_changed"] });
  const observation = projection.observation;
  const audit = projectAccessibilityAuditSummary(projection)!;
  const before = structuredClone(observation);
  const html = renderToStaticMarkup(<AccessibilityEvidence audit={audit} observation={observation} />);
  const snapshot = renderToStaticMarkup(<AccessibilitySnapshotContent audit={audit} observation={observation} />);
  for (const content of [html, snapshot]) {
    assert.match(content, /page or embedded frames changed during the audit/i);
    assert.doesNotMatch(content, /No failures detected|0 issues/);
  }
  const report = structuredClone(SHADOW_REPORT);
  report.scan.id = observation.scanId;
  report.accessibilityAudit = audit;
  report.accessibilityEvidence = observation;
  const section = buildDetailedEvidenceExport(report).detailedEvidence.sections.find(s => s.id === "accessibility")!;
  assert.equal(section.recap, "Page or frames changed during audit");
  assert.equal(section.displayStatus, "Limited");
  assert.equal(section.counts.checks, 0);
  assert.deepEqual(section.rows, []);
  assert.deepEqual(observation, before);
});

test("failed WCAG checks, affected instances and review checks remain separate", () => {
  const { audit, observation } = fixture();
  observation.violations[0]!.nodeCount = 16;
  const summary = projectAccessibilityAuditSummary(accessibilityProjectionFixture(observation))!;
  assert.equal(accessibilityIssueCountLabel(audit), "4 issues");
  assert.match(accessibilityOverviewCopy(summary)!, /4 accessibility issues on the starting page/);
  assert.doesNotMatch(accessibilityOverviewCopy(summary)!, /critical|high-impact/i);
  const failed = projectAccessibilityAuditSummary(accessibilityProjectionFixture({ status: "failed", violations: [], rulesEvaluated: [], limitations: ["audit_failed"] }))!;
  assert.equal(accessibilityIssueCountLabel(failed), "Not evaluated");
  assert.doesNotMatch(accessibilityOverviewCopy(failed)!, /0|No failures/);
  const limited = projectAccessibilityAuditSummary(accessibilityProjectionFixture({ status: "limited", violations: [], reviewItems: [observation.violations[0]!], limitations: ["rules_need_review"] }))!;
  assert.match(accessibilityOverviewCopy(limited)!, /evaluated WCAG checks.*1 further check needs manual review/);
  assert.equal(accessibilityOverviewCopy(null), null);
});

test("priority selection requires canonical eligibility, high severity, confidence and concrete evidence", () => {
  const { packets } = fixture();
  const original = structuredClone(packets);
  assert.ok(projectAccessibilityPriorities(packets).length >= 3);
  assert.deepEqual(packets, original, "selection cannot rewrite retained findings or scores");
  for (const mutate of [
    (p: typeof packets[number]) => { p.presentationDecision.status = "audit_only"; },
    (p: typeof packets[number]) => { p.severity = "low"; },
    (p: typeof packets[number]) => { p.confidenceBand = "low"; },
    (p: typeof packets[number]) => { p.evidence!.entities!.accessibilityAxeEvidence = []; },
  ]) {
    const changed = structuredClone(packets); changed.forEach(mutate);
    assert.deepEqual(projectAccessibilityPriorities(changed), []);
  }
  const singleLink = accessibilityProjectionFixture();
  const rule = { ...singleLink.observation.violations[0]!, ruleId: "link-name", impact: "serious" as const };
  singleLink.observation.rulesEvaluated = [rule.ruleId]; singleLink.observation.violations = [rule];
  const linkPackets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit: singleLink }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  assert.deepEqual(projectAccessibilityPriorities(linkPackets), [], "an audit-only isolated link cannot be promoted by its impact");
  const pages = [{ id: "home", url: "https://example.com/", homepage: true, findingIds: [] }, { id: "other", url: "https://example.com/other", homepage: false, findingIds: [] }];
  const site = buildSitePriorityReview([], pages, [], packets);
  assert.equal(site.length, 1);
  assert.equal(site[0]!.id, ACCESSIBILITY_PRIORITY_GROUP_ID);
  assert.deepEqual(site[0]!.evidenceJson.groupedFindingIds, projectAccessibilityPriorities(packets).map(row => row.id));
  assert.ok(site.every(row => row.priority === "high" && row.status === "Observed"));
  assert.ok(site.every(row => row.pages.length === 1 && row.pages[0]!.id === "home"));
  assert.deepEqual(buildSitePriorityReview([], pages, projectAccessibilityPriorities(packets), []), [], "an executive-array shortcut cannot bypass canonical accessibility selection");
});

test("verified prohibited ARIA attributes reach both regulatory highlights through canonical priority projection", () => {
  const projection = accessibilityProjectionFixture();
  const base = projection.observation.violations[0]!;
  projection.observation.violations = [{ ...base, ruleId: "aria-prohibited-attr", impact: "serious", tags: ["wcag2a", "wcag412"],
    help: "Elements must only use permitted ARIA attributes", description: "Ensure ARIA attributes are not prohibited for an element's role",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr",
    representativeNodes: [{ selectors: ["p[aria-label]"], htmlSnippet: "<p aria-label>", failureSummary: "aria-label cannot be used on a p with no valid role attribute." }] }];
  projection.observation.rulesEvaluated = ["aria-prohibited-attr"];
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit: projection },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const original = structuredClone(packets);
  assert.equal(projectAccessibilityPriorities(packets).length, 1);
  const rows = buildSitePriorityReview([], [{ id: projection.observation.scanId, url: projection.observation.documentUrl, homepage: true, findingIds: [] }], [], packets);
  for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const selected = buildRegulatoryAssessmentHighlights(rows, focus, { kind: "page" });
    assert.equal(selected.topIssues.length, 1);
    assert.equal(selected.topIssues[0]!.id, ACCESSIBILITY_PRIORITY_GROUP_ID);
    assert.match(selected.highlights.text, /ARIA attributes|ARIA roles/);
    assert.doesNotMatch(selected.highlights.text, /No priority|deletion|collection notices/);
  }
  assert.deepEqual(packets, original, "Highlight selection cannot change canonical findings or score effects.");
});

test("snapshot stays brief and directs readers to full, escaped accessibility evidence", () => {
  const { audit, observation } = fixture();
  const report = { ...SHADOW_REPORT, accessibilityAudit: audit, accessibilityEvidence: observation };
  const snapshot = renderToStaticMarkup(<SignalSnapshot report={report} siteOverview />);
  assert.match(snapshot, /Accessibility \(WCAG\).*4 issues/);
  assert.match(snapshot, /href="#accessibility-evidence"/);
  assert.doesNotMatch(snapshot, /Forms &amp; fields|#image-alt|htmlSnippet|representativeNodes/);
  const missingExamples = renderToStaticMarkup(<AccessibilitySnapshotContent audit={audit} />);
  assert.match(missingExamples, /4 issues recorded; detailed examples are unavailable/);
  assert.doesNotMatch(missingExamples, /No failures/);
  const detailed = renderToStaticMarkup(<EvidenceDirectory compact report={report} />);
  assert.match(detailed, /id="accessibility-evidence"/);
  const failures = renderToStaticMarkup(<AccessibilityEvidence audit={audit} observation={observation} />);
  assert.match(failures, />Issues found</);
  assert.doesNotMatch(failures, />Issue found</, "individual failures do not repeat the section status");
  const sectionSummary = failures.match(/<summary\b[^>]*>(.*?)<\/summary>/s)![1]!;
  assert.match(sectionSummary, /M12 3 2 21h20Z/, "section badge keeps its warning indicator");
  assert.doesNotMatch(failures, /Critical impact|High impact|Flagged|border-rose/);
  const summaries = [...failures.matchAll(/<summary\b[^>]*>(.*?)<\/summary>/gs)].map(match => match[1]).join("");
  assert.doesNotMatch(summaries, /Critical|Serious|Impact:/);
  assert.match(detailed, /Impact: Critical/);
  assert.match(detailed, /Impact: Serious/);
  assert.match(detailed, /Examples \(1 of 1\)/);
  assert.match(detailed, /&lt;input id&gt;/);
  assert.doesNotMatch(detailed, /<input id>/);
  const review = { ...observation, status: "limited" as const, violations: [], reviewItems: observation.violations, limitations: ["rules_need_review"] };
  const html = renderToStaticMarkup(<AccessibilityEvidence audit={projectAccessibilityAuditSummary(accessibilityProjectionFixture(review))!} observation={review} />);
  assert.match(html, /0 issues.*4 checks need manual review/s);
  assert.match(html, /Manual checks/);
  assert.match(html, />Manual check</);
  assert.equal((html.match(/<span[^>]*>Manual check<\/span>/g) ?? []).length, review.reviewItems.length, "individual manual-check badges contain text only");
  assert.match(html.match(/<summary\b[^>]*>(.*?)<\/summary>/s)![1]!, /<circle/, "inconclusive manual checks use an information indicator");
  assert.doesNotMatch(html.match(/<summary\b[^>]*>(.*?)<\/summary>/s)![1]!, /M12 3 2 21h20Z/, "manual checks are distinct from the finding warning indicator");
  assert.doesNotMatch(html, />Issue found<|>Issues found<|Flagged|border-rose/);
  const clean = projectAccessibilityAuditSummary(accessibilityProjectionFixture({ violations: [] }))!;
  assert.doesNotMatch(renderToStaticMarkup(<AccessibilityEvidence audit={clean} />), />Issue found<|>Issues found<|Flagged/);
});

test("top-issue grouping preserves source evidence, page attribution and the detailed audit", () => {
  const { packets, audit, observation } = fixture();
  const priorities = projectAccessibilityPriorities(packets);
  const home = { id: "home", url: "https://example.com/", homepage: true };
  const other = { id: "other", url: "https://example.com/other", homepage: false };
  const members: SitePriorityFinding[] = priorities.map((finding, index) => ({
    id: finding.id, rank: index + 2, title: finding.label, summary: finding.shortSummary,
    priority: "high" as const, status: "Observed" as const,
    evidence: finding.evidencePreview, evidenceJson: { evidenceDetails: finding.evidenceDetails, evidenceRefs: finding.evidenceRefs },
    correctionSteps: [finding.remediation], pages: index === 0 ? [home, other] : [home],
  }));
  const privacy = { ...members[0]!, id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage", rank: 1, title: "Pre-consent storage" };
  const entries = [privacy, ...members];
  const before = structuredClone(entries);
  const detailedBefore = renderToStaticMarkup(<AccessibilityEvidence audit={audit} observation={observation} />);
  const grouped = groupAccessibilityPriorityEntries(entries);
  assert.deepEqual(entries, before, "grouping cannot mutate source findings or evidence");
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0], privacy);
  assert.equal(grouped[1]!.id, ACCESSIBILITY_PRIORITY_GROUP_ID);
  assert.deepEqual(grouped[1]!.evidenceJson.groupedFindingIds, priorities.map(finding => finding.id));
  assert.deepEqual(grouped[1]!.evidenceJson.findings, members);
  assert.deepEqual(grouped[1]!.correctionSteps, [...new Set(members.flatMap(member => member.correctionSteps))], "grouping preserves the actual repair guidance for selected findings");
  assert.doesNotMatch(grouped[1]!.correctionSteps.join(" "), /Review the affected checks and retained examples/);
  assert.deepEqual(grouped[1]!.pages, [home, other]);
  assert.deepEqual(grouped.map(entry => entry.rank), [1, 2]);
  assert.deepEqual(groupAccessibilityPriorityEntries(grouped), grouped, "repeated projection cannot duplicate a group");
  assert.deepEqual(groupAccessibilityPriorityEntries([privacy]), [privacy], "no accessibility entry is invented without selected members");
  const html = renderToStaticMarkup(<SitePriorityReview findings={grouped} pending={false} sitewideAvailable scannedPages={2} />);
  assert.equal((html.match(/id="sitewide-accessibility_priority_group"/g) ?? []).length, 1);
  assert.match(html, />2 issues</);
  assert.match(html, /href="#accessibility-evidence"/);
  for (const member of members) assert.doesNotMatch(html, new RegExp(`id="sitewide-${member.id}"`));
  assert.equal(renderToStaticMarkup(<AccessibilityEvidence audit={audit} observation={observation} />), detailedBefore);
});

test("grouped fixes exclude unrelated findings and deduplicate repeated repair guidance", () => {
  const base = { rank: 1, title: "Accessibility issue", summary: "Retained failure", evidence: [], evidenceJson: {}, correctionSteps: ["Fix the affected control."] };
  const grouped = groupAccessibilityPriorityEntries([
    { ...base, id: "target_size_accessibility_issue" },
    { ...base, id: "semantic_labeling_accessibility_issue", correctionSteps: ["Fix the affected control.", "Give the flagged button an accessible name."] },
    { ...base, id: "unrelated", correctionSteps: ["Unrelated repair."] },
  ]);
  assert.deepEqual(grouped[0]!.correctionSteps, ["Fix the affected control.", "Give the flagged button an accessible name."]);
  assert.equal(grouped[1]!.id, "unrelated");
});

test("privacy concerns lead accessibility without changing canonical statuses or evidence", () => {
  const { packets } = fixture();
  const original = structuredClone(packets);
  const rows = deriveGdprEprivacyCoverageChecklist({ scanCompleted: false, coverageLimited: true, unifiedFindings: [] })
    .map(row => row.id !== "pre_consent_cookies_storage" ? row : {
      ...row, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed" as const,
      criticalEvidence: { ...row.criticalEvidence, missingOrIncompleteSourceSignals: [], retainedEvidence: {
        nonEssentialCookieStorageObserved: true,
        eligiblePreconsentCookieStorageRows: [{ storageType: "cookie", name: "_ga", domain: "example.com", path: "/", partitionKey: null }],
      } },
    });
  const findings = buildSitePriorityReview(rows, [{ id: "home", url: "https://example.com/", homepage: true, findingIds: ["pre_consent_cookies_storage"] }], [], packets);
  assert.equal(findings[0]?.id, "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage");
  assert.equal(findings[0]?.status, "Potential gap");
  assert.ok(findings.slice(1).every(finding => finding.status === "Observed"));
  assert.deepEqual(packets, original);
  assert.deepEqual(findings.map(finding => finding.rank), findings.map((_, index) => index + 1));
  const reversed = [...findings].reverse();
  const reordered = [...reversed].sort(comparePriorityReviewFindings);
  assert.equal(reordered[0]?.id, findings[0]?.id);
  assert.deepEqual(reordered.find(row => row.id === findings[0]?.id), findings[0]);
  const html = renderToStaticMarkup(<SitePriorityReview findings={findings} pending={false} sitewideAvailable scannedPages={1} />);
  assert.match(html, /Regulatory Risk Review/);
  assert.match(html, /Potential gap/);
  assert.match(html, />Review</);
  assert.doesNotMatch(html, /High priority/);
  assert.doesNotMatch(html, /border-rose-|bg-rose-/);
  for (const status of ["Potential gap", "Partial concern", "Not confirmed"] as const) {
    assert.match(renderToStaticMarkup(<StatusBadge status={status} priority="high" />), new RegExp(`>${status}<`));
  }
});

test("executive overview preserves the privacy lead and reports accessibility alongside the other consent finding", () => {
  const { packets } = fixture();
  const accessibility = buildSitePriorityReview([], [], [], packets);
  const copy = buildExecutiveOverview({
    findings: [{ title: "Classified non-essential pre-consent storage", summary: "Storage was retained before consent." },
      { title: "Decline consent control", summary: "No refusal control was retained." }, ...accessibility],
  });
  assert.ok(copy.indexOf("pre-consent storage") < copy.indexOf("Semantic labeling accessibility issue"), copy);
  assert.match(copy, /Other findings: “Decline consent control”/);
  assert.match(copy, /Form controls lacked associated labels/);
  assert.doesNotMatch(copy, /3 priority issues/);
  assert.doesNotMatch(copy, /element instances|manual review|Tracking activity and cookies\/storage/);
});

test("executive copy uses the projected accessibility group without adding unprojected audit counts", () => {
  const { packets } = fixture();
  const copy = buildExecutiveOverview({ findings: buildSitePriorityReview([], [], [], packets) });
  assert.match(copy, /^“Semantic labeling accessibility issue/);
  assert.match(copy, /Form controls lacked associated labels; Buttons lacked discernible accessible names/);
  assert.match(copy, /Images lacked required text alternatives/);
  assert.doesNotMatch(copy, /4 accessibility issues|critical|high-impact|site-wide breakdown|narrow review|visitor choice/i);
});

test("retained main-page positives show limited scope consistently in the report and shared evidence", () => {
  const projection=accessibilityProjectionFixture(); const observation=projection.observation;
  observation.violations=[observation.violations.find(row=>row.ruleId==="button-name")!];
  observation.violations[0]!.representativeNodes.forEach(node=>{node.mainDocumentBound=true;});
  observation.rulesEvaluated=["button-name"];observation.status="limited";
  observation.limitations=["child_frames_changed_main_document_retained"];
  observation.frameCoverage={version:"stable_main_document_evidence.v1",resultScope:"positive_findings_only",documentToken:observation.documentToken!,engineRunCount:1,engineRuleCount:62,changedChildFrameCount:1,excludedNodeCount:5};
  const audit=projectAccessibilityAuditSummary(projection)!;
  const html=renderToStaticMarkup(<AccessibilityEvidence audit={audit} observation={observation}/>);
  assert.match(html,/62 rules run/);assert.match(html,/Main-page findings retained/);assert.doesNotMatch(html,/No failures detected/);
  const report=structuredClone(SHADOW_REPORT);report.scan.id=observation.scanId;report.accessibilityAudit=audit;report.accessibilityEvidence=observation;
  const exported=buildDetailedEvidenceExport(report);
  assert.equal(report.accessibilityAudit?.evidenceScope,"stable_main_document_positive_findings");
  assert.match(exported.detailedEvidence.sections.find(row=>row.id==="accessibility")!.recap,/Main page only/);
});
