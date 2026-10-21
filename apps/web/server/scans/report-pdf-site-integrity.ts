import { siteIntegrityReportFindingSchema, getSiteIntegrityPageFindings, getSiteIntegrityLinkOccurrences } from "../../lib/scans/site-integrity-report";
import type { CanonicalReportExport } from "./report-export";
import type { PdfLine } from "./report-export-pdf";

type Layout = { text(value: string, options?: Partial<PdfLine>): PdfLine[] };

export function pdfSiteIntegrityRemediationEvidence(report: CanonicalReportExport, layout: Layout): PdfLine[] {
  const candidates = report.appendix.siteIntegritySite?.findings ?? (report.appendix.siteIntegrity ? [report.appendix.siteIntegrity] : []);
  const findings = getSiteIntegrityPageFindings(candidates.flatMap(candidate => {
    const parsed = siteIntegrityReportFindingSchema.safeParse(candidate);
    return parsed.success && parsed.data.evidence.scanId === report.scan.id ? [parsed.data] : [];
  }));
  if (!findings.length) return layout.text("Link location evidence is unavailable for this report. Locate and confirm the affected link before changing page content; no selector or source file can be supplied from this capture.", { size: 9 });
  const lines: PdfLine[] = [];
  for (const finding of findings) {
    lines.push(...layout.text(`Source URL: ${finding.evidence.observation.documentUrl}`, { size: 9, bold: true }));
    for (const link of getSiteIntegrityLinkOccurrences(finding)) {
      lines.push(...layout.text(`Destination hostname: ${link.destinationDomain} | Evidence: ${link.evidenceRef}`, { size: 9, bold: true }));
      const proof = link.codeProof;
      if (!proof) {
        lines.push(...layout.text(`Concealment: ${link.concealment.replaceAll("_", " ")}. Code excerpt not retained${link.codeProofUnavailableReason === "capture_limit" ? " (capture limit)" : ""}; exact element and source file are unavailable.`, { size: 9 }));
        continue;
      }
      const measured = link.concealment === "offscreen_position"
        ? `Off-screen positioning: concealing element position ${proof.computedStyle.position}; bounding box left ${proof.concealingRect.left}px, top ${proof.concealingRect.top}px relative to the viewport.`
        : link.concealment === "zero_size_container"
          ? `Zero-size container: bounding box ${proof.concealingRect.width} x ${proof.concealingRect.height}px; computed overflow ${proof.computedStyle.overflow}.`
          : `Zero font size: computed font-size ${proof.computedStyle.fontSizePx}px on the link.`;
      lines.push(...layout.text(measured, { size: 9 }), ...layout.text("Retained DOM excerpt (* marks the concealing element):", { size: 8 }));
      for (const [index, code] of proof.lines.entries()) lines.push(...layout.text(`${index === proof.highlightedLine ? "* " : "  "}${code}`, { size: 8, gapAfter: 1, bold: index === proof.highlightedLine }));
      lines.push(...layout.text(`Sanitized DOM, not a source-file line or unique selector. URL paths, link text and unrelated attributes are omitted.${proof.truncated ? " Excerpt truncated." : ""}`, { size: 8 }));
    }
    if (finding.evidence.observation.truncated) lines.push(...layout.text("Bounded capture: retained links are a sample, not a complete page inventory.", { size: 8 }));
  }
  return lines;
}
