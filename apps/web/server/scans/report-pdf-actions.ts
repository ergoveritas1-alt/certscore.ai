import { pdfNarrativeFindings, pdfFindingLocations } from "./report-pdf-evidence";
import type { CanonicalReportExport } from "./report-export";
import { pdfTopicForFinding, type PdfReportTopic } from "./report-pdf-topics";
import { CERT_SCORE_FINDING_REGISTRY } from "../../lib/scans/finding-registry";
import { cmpCorrectionSteps } from "../../lib/scans/cmp-correction-steps";
import { CMS_CORRECTION_STEPS, evidenceHeaderStatus } from "../../lib/scans/detailed-evidence-presentation";
import { checklistRemediation } from "../../lib/scans/checklist-remediation";
import { accessibilityCorrectionGuidance } from "../../lib/scans/accessibility-correction-guidance";

export type PdfAction = {
  id: string;
  title: string;
  status: string;
  explanation: string;
  finding?: Record<string, unknown>;
  affected: string[];
  steps: string[];
  references: string[];
  guidanceUrl?: string;
  additionalGuidanceUrl?: string;
  verification?: string;
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

/** Instructions for retesting, never statements that a scan performed these checks. */
export const PDF_TOPIC_VERIFICATION: Record<PdfReportTopic, string> = {
  consent: "Retest the affected page in fresh browser sessions using the same region. Check control visibility, the saved choice and resulting requests/storage separately before a choice, after Reject and after Accept. Compare with the cited evidence.",
  storage: "In browser developer tools, inspect Application storage and Network responses for the listed cookie names, domains, paths and storage keys. Retest in fresh sessions before and after the relevant consent choice; confirm the intended attributes, lifetime and write timing.",
  policy: "Open the revised policy from the scanned page, verify the exact section and links, and compare each statement with the site's actual processing. Have the privacy owner approve the wording, then rescan and retain the revised URL and excerpt.",
  forms: "On a controlled test page, inspect the affected fields and Network requests using test data. Check the form action, destination and notice before submission; confirm the cited unwanted transmission or insecure transport is resolved, then rescan.",
  security: "Verify the deployed server/CMS configuration and versions, then repeat the cited connection or advisory check against the same URL. Confirm redirects and page resources behave as intended and retain the resulting response evidence.",
  external: "Use Network request initiators to locate the tag, embed or integration calling the listed domain. Retest the same page in fresh sessions with the relevant choices, confirm the intended request behavior, and compare the active vendor inventory with disclosures.",
  tls: "Check the affected hostname in a browser security panel and a TLS validation tool. Verify hostname coverage, expiry and the served certificate chain; repeat the request after deployment and confirm validation succeeds.",
  accessibility: "Rerun the cited automated rule on the affected page and selectors. Check the corrected elements manually using keyboard navigation and an appropriate assistive-technology workflow; retain the new rule result and manual test outcome.",
};

/** Organizes existing findings and projected review rows; never creates a finding from an inventory. */
export function pdfAppendixActions(report: CanonicalReportExport): Record<PdfReportTopic, PdfAction[]> {
  const sections: Record<PdfReportTopic, PdfAction[]> = { consent: [], storage: [], policy: [], forms: [], security: [], external: [], tls: [], accessibility: [] };
  const details = report.appendix.evidenceDossier?.checklistDetails ?? [];
  const usedRows = new Set<string>();
  for (const finding of pdfNarrativeFindings(report)) {
    const presentation = object(finding.presentation);
    const ids = unique([finding.unifiedFindingId, finding.id, finding.findingId, finding.checklistRowId, presentation.findingId, presentation.checklistRowId].map(string));
    const matching = details.filter(row => ids.includes(row.id));
    matching.forEach(row => usedRows.add(row.id));
    const packet = object(finding.evidence);
    const entities = pdfFindingLocations(object(packet.entities));
    const registry = ids.map(id => CERT_SCORE_FINDING_REGISTRY[id]).find(Boolean);
    const guidance = ids.map(rowId => checklistRemediation({ rowId, status: "Review signal" })).find(item => item?.steps.length);
    sections[pdfTopicForFinding(finding) ?? "policy"].push({
      id: ids[0] ?? "finding", title: string(presentation.findingName ?? finding.title) || ids[0] || "Finding",
      status: string(finding.severity) || "Review", explanation: string(presentation.findingDescription ?? presentation.description ?? finding.summary),
      finding,
      affected: unique([string(finding.primaryPageUrl), ...strings(packet.pageUrls), ...strings(packet.sourceUrls), ...entities]),
      steps: matching.some(row => row.correctionSteps?.length) ? unique(matching.flatMap(row => row.correctionSteps ?? []))
        : guidance?.steps ?? unique([string(presentation.suggestedFix), registry?.remediation ?? ""]),
      references: unique([ids[0] ?? "", ...strings(packet.evidenceRefs), ...matching.flatMap(row => row.evidenceRefs)]),
    });
  }
  for (const row of details) {
    // Coverage limitations and positive results stay in evidence, not the repair queue.
    if (usedRows.has(row.id) || evidenceHeaderStatus([row])?.label !== "Review") continue;
    sections[row.topic ?? "policy"].push({
      id: row.id, title: row.label, status: row.status, explanation: row.explanation,
      affected: row.facts.filter(fact => /url|domain|hostname|cookie.?name|selector|^path$|version/i.test(fact.label)).map(fact => `${fact.label}: ${fact.value}`),
      steps: row.correctionSteps ?? [], references: unique([row.id, ...row.evidenceRefs]),
    });
  }
  for (const row of report.appendix.evidenceDossier?.cmp?.audit.rows ?? []) {
    const steps = cmpCorrectionSteps(row);
    if (!steps.length) continue;
    sections.consent.push({
      id: `cmp-${row.id}`, title: row.label, status: row.status, explanation: row.detail ?? "",
      affected: (row.supportingEvidence?.requests ?? []).map(request => `${request.vendor}: ${request.hostname}${request.path} (+${request.msAfterReject} ms after Reject)`),
      steps, references: row.sourceIds,
    });
  }
  const cms = report.appendix.evidenceDossier?.cmsSecurity;
  for (const match of cms?.assessment.matches ?? []) sections.security.push({
    id: match.record.id, title: match.record.title, status: "Advisory review",
    explanation: match.record.qualification ?? "",
    affected: [`Matched version range: ${match.matchedRange}`, `Vendor fixed versions: ${match.record.fixedVersions?.join(", ") || "Not retained"}`],
    steps: [...CMS_CORRECTION_STEPS], references: [match.evidenceRef, match.detectionRef], guidanceUrl: match.record.sourceUrl,
  });
  for (const [status, rules] of [
    ["Automated rule finding", report.accessibilityEvidence?.violations ?? []],
    ["Manual review", report.accessibilityEvidence?.reviewItems ?? []],
  ] as const) for (const rule of rules) {
    const guidance = status === "Automated rule finding" ? accessibilityCorrectionGuidance(rule.ruleId) : null;
    sections.accessibility.push({
    id: rule.ruleId, title: rule.help, status, explanation: rule.description,
    affected: rule.representativeNodes.flatMap(node => [
      `Selector: ${node.selectors.join(", ")}`,
      `Observed issue: ${node.failureSummary}`,
      ...(node.colorContrast ? [`Contrast: measured ${node.colorContrast.contrastRatio ?? "Not retained"}; required ${node.colorContrast.requiredContrastRatio ?? "Not retained"}. Foreground ${node.colorContrast.foregroundColor ?? "Not retained"}; background ${node.colorContrast.backgroundColor ?? "Not retained"}.`] : []),
    ]),
    steps: guidance?.steps ?? [`Locate the listed elements in the page template or component. Review the retained rule guidance: ${rule.help}.`, "Confirm the issue in context before changing the component, then apply the verified correction to its affected instances."],
    verification: `Rerun ${rule.ruleId} on the listed selectors and check that each retained failure is resolved. Complete the manual checks in the topic verification checklist.`,
    references: [rule.ruleId], guidanceUrl: rule.helpUrl, additionalGuidanceUrl: guidance?.reference,
  });
  }
  return sections;
}
