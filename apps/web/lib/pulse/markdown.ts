import { PULSE_PURPOSE_STATEMENT, PULSE_STANDARD_DISCLAIMER } from "./constants";

type PulseMarkdownInput = Record<string, any>;

function formatLabel(value: unknown) {
  return typeof value === "string"
    ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Unknown";
}

function line(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "Not available";
}

export function renderPulseMarkdown(pulse: PulseMarkdownInput) {
  const findings = Array.isArray(pulse.topFindings) ? pulse.topFindings : [];
  const lenses = Array.isArray(pulse.reviewContext?.lenses) ? pulse.reviewContext.lenses : [];
  const highlights = pulse.evidenceHighlights ?? {};
  const links = pulse.links ?? {};
  const titleDomain = line(pulse.domain);
  const markdown = [
    `# CertScore Pulse: ${titleDomain}`,
    "",
    PULSE_PURPOSE_STATEMENT,
    "",
    `Status: ${formatLabel(pulse.scanStatus)}`,
    `Score: ${pulse.summary?.score ?? "Not available"}/100`,
    `Risk level: ${formatLabel(pulse.summary?.riskLevel)}`,
    `Benchmark: ${line(pulse.summary?.benchmark)}`,
    `Generated: ${line(pulse.meta?.generatedAt)}`,
    `Scan completed: ${line(pulse.timestamps?.completedAt ?? pulse.scan?.completedAt ?? pulse.completedAt)}`,
    `Freshness: ${formatLabel(pulse.freshness?.status)}`,
    `Scan ID: ${line(pulse.scanId ?? pulse.scan_id ?? pulse.scan?.scanId)}`,
    "",
    "## Quick readout",
    "",
    line(pulse.summary?.humanSummary ?? pulse.summary?.headline),
    "",
    "## Top findings",
    "",
    findings.length > 0
      ? findings
          .map((finding: any, index: number) =>
            [
              `${index + 1}. ${line(finding.label)}`,
              `   - Criticality: ${formatLabel(finding.criticality)}`,
              `   - Confidence: ${formatLabel(finding.confidence)}`,
              `   - Evidence: ${line(finding.evidence?.summary)}`,
              `   - Review context: ${(finding.reviewLenses ?? []).join(", ") || "Review context not classified"}`,
              `   - Next step: ${line(finding.nextStep)}`,
              `   - Evidence link: ${line(finding.evidence?.fullEvidenceUrl ?? finding.anchorUrl)}`
            ].join("\n")
          )
          .join("\n\n")
      : "No major automated review signals were surfaced in this scan.",
    "",
    "## Review lenses",
    "",
    lenses.length > 0
      ? lenses
          .map((lens: any) => `- ${line(lens.name)}: ${formatLabel(lens.status)} - ${line(lens.summary)}`)
          .join("\n")
      : "- Review lenses were not evaluated for this Pulse.",
    "",
    "## Evidence highlights",
    "",
    `- Tracker footprint: ${line(highlights.trackerFootprint?.summary)}`,
    `- Policy surfaces: ${line(highlights.policySurfaces?.summary)}`,
    `- Fingerprinting: ${line(highlights.fingerprinting?.summary)}`,
    `- Vendor mix: ${line(highlights.vendorMix?.summary)}`,
    "",
    "## Coverage",
    "",
    line(pulse.coverage?.summary),
    "",
    "Limitations:",
    ...(Array.isArray(pulse.coverage?.limitations)
      ? pulse.coverage.limitations.map((item: string) => `- ${item}`)
      : ["- Automated public-web scan only."]),
    "",
    "## Feedback",
    "",
    `Was this Pulse useful? Send comments to support@certscore.ai or use:`,
    line(pulse.feedback?.feedbackUrl),
    "",
    "## Links",
    "",
    `Full report: ${line(links.fullReportUrl)}`,
    `JSON: ${line(links.jsonUrl ?? links.scanJsonUrl)}`,
    `Immutable JSON: ${line(links.immutableJsonUrl ?? links.scanJsonUrl)}`,
    `Immutable Markdown: ${line(links.immutableMarkdownUrl)}`,
    `Full JSON: ${line(links.immutableFullJsonUrl ?? links.fullJsonUrl)}`,
    `API docs: ${line(links.docsUrl)}`,
    `Findings reference: ${line(links.findingsReferenceUrl)}`,
    "",
    "## Disclaimer",
    "",
    pulse.disclaimer ?? PULSE_STANDARD_DISCLAIMER
  ].join("\n");

  if (pulse.meta?.detail === "full" && Array.isArray(pulse.findings) && pulse.findings.length > findings.length) {
    return `${markdown}\n\n## All Surfaced Findings\n\n${pulse.findings
      .map((finding: any, index: number) => `${index + 1}. ${line(finding.label)} - ${line(finding.evidence?.summary)}`)
      .join("\n")}\n`;
  }

  return `${markdown}\n`;
}
