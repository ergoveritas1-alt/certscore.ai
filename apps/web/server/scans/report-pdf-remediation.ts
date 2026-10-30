import { accessibilityAuditObservationSchema, californiaPrivacyReviewSchema } from "@certscore/contracts";
import { accessibilityCorrectionGuidance, accessibilityRemediationVerification } from "../../lib/scans/accessibility-correction-guidance";
import { webmasterRemediation, type WebmasterRemediation } from "../../lib/scans/webmaster-remediation";
import { pdfNarrativeFindings } from "./report-pdf-evidence";
import { pdfTestedUrl, type PdfReviewGroup } from "./report-pdf-reader";
import type { CanonicalReportExport } from "./report-export";
import { assertPublicReportPdfContent, UnsafeReportPdfContentError } from "./report-pdf-public-safety";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
const unique = (values: string[]) => [...new Set(values)];

export function pdfGroupRemediation(report: CanonicalReportExport, group: PdfReviewGroup) {
  const kind = group.evidenceGroup ?? group.id;
  const ids = [group.id, ...group.observations.map(item => item.id),
    ...(kind === "initial-tracking" ? ["preconsent_tracking", "session_replay_observed"] : []),
    ...(kind === "refusal" ? ["post_refusal_non_essential_activity", "post_reject_click_tracking"] : [])];
  const findings = pdfNarrativeFindings(report).filter(finding => ids.includes(String(finding.unifiedFindingId)));
  const locations: string[] = [];
  const testedUrl = pdfTestedUrl(report);
  locations.push(testedUrl ? `Page: ${testedUrl}` : "Page URL not retained; identify the affected page before changing its source.");
  if (kind === "initial-tracking") {
    const entities = findings.map(finding => object(object(finding.evidence).entities));
    const requests = unique(entities.flatMap(item => strings(item.runtimeRequestUrls)));
    const cookies = unique(entities.flatMap(item => strings(item.preconsent_cookie_names)));
    locations.push(...requests.map(url => `Request to trace: ${url}`));
    if (cookies.length) locations.push(`Cookie names to inspect: ${cookies.join(", ")}. Snapshot presence does not identify their exact writer.`);
    if (!requests.length) locations.push("Request endpoints/initiators not retained in this issue; use the referenced runtime evidence and reproduce the requests before selecting a tag to change.");
  }
  if (kind === "refusal") {
    const retained = object(report.projection.checklist?.find(row => row.id === "post_reject_tracking_reduction")?.criticalEvidence?.retainedEvidence);
    if (typeof retained.observationWindowMs === "number" && retained.observationWindowMs > 0) locations.push(`Configured observation target: ${retained.observationWindowMs / 1000} s. This is a re-test target, not a claim that the early-stop scan measured the whole interval; measured results remain in Appendix A.`);
    const records = Array.isArray(retained.postRejectNonEssentialRequests) ? retained.postRejectNonEssentialRequests.map(object) : [];
    for (const record of records) {
      if (record.activityType === "network_request" && typeof record.url === "string") locations.push(`Post-refusal request: ${record.url}${typeof record.msAfterReject === "number" ? ` (+${record.msAfterReject} ms from confirmation)` : ""}.`);
      if (record.activityType === "storage_write" && typeof record.cookieName === "string") locations.push(`Post-refusal cookie write: ${record.cookieName}; host ${typeof record.hostname === "string" ? record.hostname : "not retained"}. Verify domain/path in DevTools before targeted cleanup; do not guess them.`);
    }
    if (!records.length) locations.push(...(report.appendix.evidenceDossier?.rejectTiming?.networkRequests ?? []).map(item => `Post-refusal request: ${item.url}; +${item.millisecondsAfterConfirmation} ms from confirmation.`));
  }
  if (kind === "device-identification") locations.push("Use the browser API names in the finding above as source-search terms. If an initiating file/line or transmission link is not retained, trace it before changing functionality; do not assume the APIs identify an offending vendor.");
  for (const finding of findings) {
    const details = object(finding.details);
    if (kind === "policy_behavior_conflict" && details.family === "contradiction") {
      if (typeof details.policySourceUrl === "string") locations.push(`Policy URL: ${details.policySourceUrl}`);
      if (typeof details.policySnippet === "string") locations.push(`Policy claim to reconcile: "${details.policySnippet}"`);
      locations.push(...strings(object(object(finding.evidence).entities).runtimeRequestUrls).map(url => `Linked runtime request: ${url}`));
    }
    if (kind === "california_rights_disclosure_not_observed" && details.family === "california_privacy_review") {
      const parsed = californiaPrivacyReviewSchema.safeParse(details.projection);
      if (parsed.success && parsed.data.scanId === report.scan.id) {
        const projection = parsed.data;
        const labels: Record<string, string> = { non_discrimination: "non-discrimination when exercising privacy rights", right_to_know: "right to know/access", right_to_delete: "right to delete", right_to_correct: "right to correct" };
        const missing = "rightsAssessment" in projection ? projection.rightsAssessment?.topics.filter(topic => topic.status === "not_observed").map(topic => labels[topic.topic] ?? topic.topic) ?? [] : [];
        if (missing.length) locations.push(`Missing disclosure in the scoped assessment: ${missing.join("; ")}. Applicability is not determined by this report.`);
        if ("reviewCoverage" in projection) locations.push(...(projection.reviewCoverage?.sourceDocuments ?? []).map(source => `Inspected policy URL: ${source.url}`));
      }
    }
  }
  const audit = accessibilityAuditObservationSchema.safeParse(report.accessibilityEvidence);
  const ruleIds = unique(findings.flatMap(finding => strings(object(finding.details).ruleExamples)));
  const rules = group.topic === "accessibility" && audit.success && audit.data.scanId === report.scan.id
    ? audit.data.violations.filter(rule => ruleIds.includes(rule.ruleId)).map(rule => ({
      id: rule.ruleId, selectors: rule.representativeNodes.flatMap(node => node.selectors.map(selector => Array.isArray(selector) ? selector.join(" >>> ") : selector)),
      guidance: accessibilityCorrectionGuidance(rule.ruleId), verification: accessibilityRemediationVerification(rule.ruleId), reference: rule.helpUrl,
    })) : [];
  if (group.topic === "accessibility" && !rules.length) locations.push("Rule-specific node evidence is unavailable or not bound to this issue. Obtain the referenced rule ID, page and affected element before applying an attribute/template fix; do not assume an image or button failure.");
  const plan = webmasterRemediation(kind) ?? fallbackPlan(group);
  let withheld = false;
  const publicLocations = unique(locations).filter(location => {
    try { assertPublicReportPdfContent([location]); return true; }
    catch (error) { if (!(error instanceof UnsafeReportPdfContentError)) throw error; withheld = true; return false; }
  });
  if (withheld) publicLocations.push("A non-public location was omitted from this PDF. Consult the retained JSON workpaper for the source reference before selecting a component to change.");
  return { ...plan, locations: publicLocations, rules };
}

function fallbackPlan(group: PdfReviewGroup): WebmasterRemediation {
  return {
    owner: group.topic === "policy" ? "Privacy/content owner + webmaster" : "Developer + responsible system owner",
    steps: [
      "Use the cited URL and evidence reference to reproduce this exact result in staging. Locate the responsible component/configuration using DevTools Elements, Network Initiator, response headers or the identified policy section, as appropriate; record its source file or admin setting before editing.",
      ...unique(group.observations.flatMap(item => item.steps)),
      "If the retained evidence does not identify the failing component or a supported correction, obtain that diagnostic detail from the component/vendor owner before implementation. Do not guess selectors, configuration values or a legal requirement from a review signal alone.",
      "Back up the source/configuration, apply the approved targeted correction in staging, and test the affected workflow. Publish only after review, clear relevant caches and preserve a rollback version.",
    ],
    verification: "Repeat the original check on the same page, location and state after deployment. Compare the exact affected evidence item and test the normal user workflow for regressions. Retain the before/after evidence and owner sign-off, then re-scan. Unresolved diagnostic context must remain open rather than be marked remediated.",
  };
}
