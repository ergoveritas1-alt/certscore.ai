import type { CanonicalReportExport } from "./report-export";
import type { PdfLine } from "./report-export-pdf";
import { pdfRegionLabel, pdfReviewGroups, pdfOtherReviewGroups, pdfTestedUrl } from "./report-pdf-reader";
import { publicReportPdfBaseUrl } from "./report-pdf-public-safety";
import { SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { pdfSiteIntegrityRemediationEvidence } from "./report-pdf-site-integrity";
import { pdfGroupRemediation } from "./report-pdf-remediation";
import { reportStatusLabel } from "../../lib/scans/report-status-presentation";

type Layout = { text(value: string, options?: Partial<PdfLine>): PdfLine[]; heading(value: string): PdfLine };

export function pdfFrontmatter(report: CanonicalReportExport, appUrl: string, layout: Layout) {
  const groups = pdfReviewGroups(report);
  const testedUrl = pdfTestedUrl(report);
  const baseUrl = publicReportPdfBaseUrl(appUrl);
  const chapter = (title: string, destination: string): PdfLine => ({ text: title, chapterTitle: title, destination, pageBreakBefore: true, size: 18, bold: true, gapAfter: 18 });
  const lines: PdfLine[] = [chapter("Top issues and remediation", "findings")];
  for (const [index, group] of groups.entries()) {
    const plan = pdfGroupRemediation(report, group);
    lines.push({ ...layout.heading(`${index + 1}. ${group.title} - ${reportStatusLabel(group.status)}`),
      continuationTitle: group.title, keepWithNextHeight: group.id === SITE_INTEGRITY_FINDING_ID ? 500 : 180 });
    for (const observation of group.observations) {
      lines.push(...layout.text(`${observation.title}: ${reportStatusLabel(observation.status)}`, { bold: true, gapAfter: 3 }), ...layout.text(observation.explanation, { size: 9, gapAfter: 5 }));
      if (observation.severity) lines.push(...layout.text(`${observation.severity} impact; ${observation.confidence ?? "confidence not established"}.`, { size: 8 }));
    }
    lines.push({ text: "Remediation", bold: true, size: 10, gapBefore: 8, gapAfter: 4, keepWithNextHeight: 65 },
      ...layout.text(`${plan.owner} - Estimated effort: medium`, { bold: true, size: 9 }));
    if (group.id === SITE_INTEGRITY_FINDING_ID) lines.push(...pdfSiteIntegrityRemediationEvidence(report, layout));
    else for (const location of plan.locations) lines.push(...layout.text(location, { size: 8, gapAfter: 3 }));
    if ((group.evidenceGroup ?? group.id) === "initial-tracking" && report.appendix.evidenceDossier?.cmp?.provider === "OneTrust") {
      lines.push(...layout.text("For a OneTrust-managed deployment: map each integration to the actual tenant category ID, choose documented Auto-Blocking or script rewriting, and load the blocking configuration before optional tags. Publishing a CMP banner alone does not activate blocking. If using a tag manager, configure the same category grants on every relevant trigger.", { size: 9 }),
        ...layout.text("OneTrust blocking implementation guidance", { href: "https://my.onetrust.com/s/article/UUID-518074a1-a6da-81c3-be52-bae7685d9c94?language=en_US", size: 8 }));
    }
    if (plan.rules.length) {
      for (const rule of plan.rules) {
        lines.push(...layout.text(`${rule.id}: ${rule.selectors.join(", ")}`, { bold: true, size: 9, gapBefore: 7, keepWithNextHeight: 55 }));
        const steps = rule.guidance?.steps ?? plan.steps;
        for (const [stepIndex, step] of steps.entries()) lines.push(...layout.text(`${stepIndex + 1}. ${step}`, { size: 9 }));
        lines.push(...layout.text(`Re-test: ${rule.verification}`, { bold: true, size: 9 }),
          ...layout.text(`Rule guidance: ${rule.id}`, { href: rule.guidance?.reference ?? rule.reference, size: 8 }));
      }
    } else {
      for (const [stepIndex, step] of plan.steps.entries()) lines.push(...layout.text(`${stepIndex + 1}. ${step}`, { size: 9 }));
      lines.push(...layout.text(`Re-test: ${plan.verification}`, { bold: true, size: 9 }));
    }
  }
  lines.push({ ...chapter("How to re-test", "retest"), pageBreakBefore: false, size: 12, gapBefore: 12, gapAfter: 8, keepWithNextHeight: 90 },
    ...layout.text("For every change: back up the source/configuration, reproduce the issue in staging, obtain the named owner's approval, publish the approved version and clear relevant caches. Keep a rollback version. A DevTools-only edit is not a deployed fix.", { size: 9 }),
    ...layout.text(`Use the same exact URL${testedUrl ? `: ${testedUrl}` : "."}`, { size: 9 }),
    ...layout.text(`Use ${pdfRegionLabel(report.scan.scanFrom)}, a fresh browser context for each choice state, and equal observation windows when comparing rates. Record click completion separately from consent confirmation.`, { size: 9 }),
    ...layout.text("Close an issue only after its specific verification steps pass and the owner records before/after evidence. Where evidence or applicability remains unresolved, retain the investigation rather than claim a completed repair.", { size: 9 }),
    ...layout.text(`Scan ID: ${report.scan.id}`, { size: 9 }));
  if (baseUrl) {
    lines.push(...layout.text("Open the canonical online report", { href: `${baseUrl}/scan/${encodeURIComponent(report.scan.id)}` }));
    if (testedUrl) lines.push(...layout.text("Re-test this page", { href: `${baseUrl}/?url=${encodeURIComponent(testedUrl)}` }));
  }
  const others = pdfOtherReviewGroups(report);
  if (others.length) {
    lines.push(chapter("Other report findings", "other-findings"));
    for (const group of others) {
      lines.push(layout.heading(group.title));
      for (const observation of group.observations) {
        lines.push(...layout.text(`${observation.title}: ${reportStatusLabel(observation.status)}`, { bold: true, size: 10 }),
          ...layout.text(observation.explanation, { size: 9 }));
        for (const step of observation.steps) lines.push(...layout.text(step, { size: 9 }));
      }
    }
  }
  return lines;
}
