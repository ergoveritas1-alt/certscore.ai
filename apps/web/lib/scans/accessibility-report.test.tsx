import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accessibilityProjectionFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { projectAccessibilityAuditSummary } from "./accessibility-audit-evidence";
import { accessibilityIssueCountLabel, accessibilityOverviewCopy } from "./accessibility-report";
import { projectAccessibilityPriorities } from "./accessibility-priority";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { buildSitePriorityReview } from "./full-site-priority-review";
import { AccessibilityEvidence, AccessibilitySnapshotContent } from "../../components/scans/accessibility-evidence";
import { EvidenceDirectory, SignalSnapshot } from "../../components/scans/report-lab/shadow-scan-report";
import { SHADOW_REPORT } from "../../components/scans/report-lab/shadow-report-data";
import { buildExecutiveOverview } from "../../components/scans/report-lab/executive-overview-copy";
import { comparePriorityReviewFindings } from "./priority-review-order";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { StatusBadge } from "../../components/scans/report-finding-row";
import { SitePriorityReview } from "../../components/scans/site-priority-review";

function fixture() {
  const projection = accessibilityProjectionFixture();
  projection.observation.violations[0]!.impact = "critical";
  const audit = projectAccessibilityAuditSummary(projection)!;
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit: projection },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  return { projection, observation: projection.observation, audit, packets };
}

test("failed WCAG checks, affected instances and review checks remain separate", () => {
  const { audit, observation } = fixture();
  observation.violations[0]!.nodeCount = 16;
  const summary = projectAccessibilityAuditSummary(accessibilityProjectionFixture(observation))!;
  assert.equal(accessibilityIssueCountLabel(audit), "4 issues");
  assert.match(accessibilityOverviewCopy(summary, observation)!, /4 accessibility issues \(1 critical and 3 high-impact checks\)/);
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
  assert.deepEqual(site.map(row => row.id).sort(), projectAccessibilityPriorities(packets).map(row => row.id).sort());
  assert.ok(site.every(row => row.priority === "high" && row.status === "Observed"));
  assert.ok(site.every(row => row.pages.length === 1 && row.pages[0]!.id === "home"));
  assert.deepEqual(buildSitePriorityReview([], pages, projectAccessibilityPriorities(packets), []), [], "an executive-array shortcut cannot bypass canonical accessibility selection");
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
  assert.match(failures, /Flagged/);
  assert.match(detailed, /Critical impact/);
  assert.match(detailed, /Retained examples \(1 of 1\)/);
  assert.match(detailed, /&lt;input id&gt;/);
  assert.doesNotMatch(detailed, /<input id>/);
  const review = { ...observation, status: "limited" as const, violations: [], reviewItems: observation.violations, limitations: ["rules_need_review"] };
  const html = renderToStaticMarkup(<AccessibilityEvidence audit={projectAccessibilityAuditSummary(accessibilityProjectionFixture(review))!} observation={review} />);
  assert.match(html, /0 issues.*4 checks need manual review/s);
  assert.match(html, /Checks needing manual review/);
  assert.doesNotMatch(html, /Critical impact/);
  assert.doesNotMatch(html, /Flagged/);
  const clean = projectAccessibilityAuditSummary(accessibilityProjectionFixture({ violations: [] }))!;
  assert.doesNotMatch(renderToStaticMarkup(<AccessibilityEvidence audit={clean} />), /Flagged/);
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
  for (const status of ["Potential gap", "Partial concern", "Not confirmed"] as const) {
    assert.match(renderToStaticMarkup(<StatusBadge status={status} priority="high" />), new RegExp(`>${status}<`));
  }
});

test("executive overview mentions accessibility briefly after the privacy concerns", () => {
  const { audit, observation } = fixture();
  const copy = buildExecutiveOverview({ controls: { accept: "Not observed", reject: "Not observed", options: "Not observed" },
    findings: [{ title: "Classified non-essential pre-consent storage", summary: "Storage was retained before consent." },
      { title: "Decline consent control", summary: "No refusal control was retained." }],
    preConsentConcerns: { tracking: true, storage: true }, accessibility: accessibilityOverviewCopy(audit, observation),
    limitedCount: 0, limitedItems: [], positiveCount: 5, transportPositiveCount: 5, timeline: [] });
  assert.ok(copy.indexOf("pre-consent storage") < copy.indexOf("WCAG"), copy);
  assert.ok(copy.indexOf("Tracking activity and cookies/storage") < copy.indexOf("WCAG"), copy);
  assert.match(copy, /4 accessibility issues/);
  assert.doesNotMatch(copy, /element instances|manual review/);
});

test("executive copy retains accessibility counts without suggesting site-wide conclusions", () => {
  const { audit, observation } = fixture();
  const copy = buildExecutiveOverview({ controls: { accept: "Not observed", reject: "Not observed", options: "Not observed" },
    findings: [{ title: "Text alternative accessibility issue", summary: "Missing alternative text." }],
    accessibility: accessibilityOverviewCopy(audit, observation), limitedCount: 0, limitedItems: [], positiveCount: 0, transportPositiveCount: 0, timeline: [] });
  assert.match(copy, /1 priority issue for review/);
  assert.match(copy, /4 accessibility issues.*1 critical and 3 high-impact checks/);
  assert.doesNotMatch(copy, /site-wide breakdown|narrow review|No checklist items|visitor choice/);
});
