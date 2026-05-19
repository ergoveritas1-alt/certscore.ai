import { PULSE_PURPOSE_STATEMENT, PULSE_STANDARD_DISCLAIMER } from "./constants";

type PulseMarkdownInput = Record<string, any>;
const CANONICAL_FINDINGS_REFERENCE_URL = "https://certscore.ai/findings";
const NO_TOP_FINDINGS_COPY = "No top automated findings were surfaced in this scan.";
const ABSENCE_OF_FINDINGS_CAVEAT = "Absence of findings does not mean absence of risk.";

function formatLabel(value: unknown) {
  return typeof value === "string"
    ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Unknown";
}

function line(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "Not available";
}

function countHighPriorityFindings(findings: any[]) {
  return findings.filter((finding) => ["critical", "high"].includes(String(finding.criticality ?? "").toLowerCase())).length;
}

function safeSummary(value: unknown) {
  const text = line(value);
  return text.replaceAll("No major automated review signals were surfaced in this scan.", NO_TOP_FINDINGS_COPY);
}

function safeLensStatus(value: unknown) {
  switch (String(value ?? "").toLowerCase()) {
    case "clear":
      return "No top automated findings surfaced";
    case "needs_work":
    case "needs work":
      return "Review context retained";
    case "action_needed":
    case "action needed":
      return "Review recommended";
    case "critical":
    case "high":
    case "high_risk":
    case "high risk":
      return "Review recommended";
    case "watch":
      return "Monitor review signals";
    case "not_evaluated":
    case "not evaluated":
      return "Not evaluated";
    default:
      return formatLabel(value);
  }
}

function totalObservationCount(pulse: PulseMarkdownInput, findings: any[]) {
  if (typeof pulse.publicReportProjection?.surfacedFindingCount === "number") {
    return pulse.publicReportProjection.surfacedFindingCount;
  }
  if (Array.isArray(pulse.findings)) {
    return pulse.findings.length;
  }
  return findings.length;
}

function compactFindings(findings: any[], options: { gptAction?: boolean } = {}) {
  if (findings.length === 0 && options.gptAction) {
    return `${NO_TOP_FINDINGS_COPY} ${ABSENCE_OF_FINDINGS_CAVEAT} Review scope and coverage before relying on the result.`;
  }

  return findings.length > 0
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
    : `${NO_TOP_FINDINGS_COPY} ${ABSENCE_OF_FINDINGS_CAVEAT}`;
}

function isLimitedCoverage(status: unknown) {
  return ["partial", "limited", "blocked", "unknown"].includes(String(status ?? "").toLowerCase());
}

function gptFooter(pulse: PulseMarkdownInput) {
  const links = pulse.links ?? {};
  return [
    "---",
    "",
    "View this scan on CertScore: " + line(links.fullReportUrl),
    "Explore finding definitions: " + CANONICAL_FINDINGS_REFERENCE_URL,
    "Run another scan: https://certscore.ai"
  ].join("\n");
}

export function renderPulseMarkdown(pulse: PulseMarkdownInput, options: { gptAction?: boolean } = {}) {
  const findings = Array.isArray(pulse.topFindings) ? pulse.topFindings : [];
  const lenses = Array.isArray(pulse.reviewContext?.lenses) ? pulse.reviewContext.lenses : [];
  const highlights = pulse.evidenceHighlights ?? {};
  const links = pulse.links ?? {};
  const titleDomain = line(pulse.domain);
  const completedAt = line(pulse.scan?.completedAt ?? pulse.timestamps?.completedAt ?? pulse.completedAt);
  const highPriorityCount = countHighPriorityFindings(findings);
  const observationCount = totalObservationCount(pulse, findings);
  const markdown = [
    "# CertScore Pulse",
    "",
    PULSE_PURPOSE_STATEMENT,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Domain | ${titleDomain} |`,
    `| Score | ${pulse.summary?.score ?? "Not available"}/100 |`,
    `| Risk level | ${formatLabel(pulse.summary?.riskLevel)} |`,
    `| High-priority findings | ${highPriorityCount} |`,
    `| Total observations | ${observationCount} |`,
    `| Scan completed | ${completedAt} |`,
    `| Coverage status | ${formatLabel(pulse.coverage?.status)} |`,
    "",
    `Status: ${formatLabel(pulse.scanStatus)}`,
    `Benchmark: ${line(pulse.summary?.benchmark)}`,
    `Generated: ${line(pulse.meta?.generatedAt)}`,
    `Scan completed: ${completedAt}`,
    `Freshness: ${formatLabel(pulse.freshness?.status)}`,
    `Scan ID: ${line(pulse.scanId ?? pulse.scan_id ?? pulse.scan?.scanId)}`,
    "",
    "## Summary",
    "",
    safeSummary(pulse.summary?.humanSummary ?? pulse.summary?.headline),
    ...(options.gptAction && isLimitedCoverage(pulse.coverage?.status)
      ? [
          "",
          "**Coverage limitation:** " +
            line(pulse.coverage?.summary ?? "Coverage was limited; absence of findings should not be interpreted as absence of risk.")
        ]
      : []),
    "",
    "## Highest-priority findings",
    "",
    compactFindings(findings, options),
    "",
    "## Review lenses",
    "",
    lenses.length > 0
      ? lenses
          .map((lens: any) => `- ${line(lens.name)}: ${safeLensStatus(lens.status)} - ${line(lens.summary)}`)
          .join("\n")
      : "- Review lenses were not evaluated for this Pulse.",
    "",
    "## Privacy and consent signals",
    "",
    `- Tracker footprint: ${line(highlights.trackerFootprint?.summary)}`,
    `- Consent-related findings: ${findings.filter((finding) => /consent|tracking|cookie|vendor/i.test(`${finding.id ?? ""} ${finding.label ?? ""}`)).length}`,
    "",
    "## Cookie and third-party request activity",
    "",
    `- Tracker footprint: ${line(highlights.trackerFootprint?.summary)}`,
    `- Vendor mix: ${line(highlights.vendorMix?.summary)}`,
    "",
    "## Accessibility signals",
    "",
    `- Accessibility-related findings: ${findings.filter((finding) => /accessibility|contrast|keyboard|label|alternative/i.test(`${finding.id ?? ""} ${finding.label ?? ""}`)).length}`,
    "",
    "## Disclosure and trust signals",
    "",
    `- Policy surfaces: ${line(highlights.policySurfaces?.summary)}`,
    `- Fingerprinting: ${line(highlights.fingerprinting?.summary)}`,
    "",
    "## Coverage and limitations",
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
    ...(options.gptAction ? [] : [`Findings reference: ${line(links.findingsReferenceUrl ?? CANONICAL_FINDINGS_REFERENCE_URL)}`]),
    "",
    "## Disclaimer",
    "",
    pulse.disclaimer ?? PULSE_STANDARD_DISCLAIMER
  ].join("\n");

  const withGptFooter = options.gptAction ? `${markdown}\n\n${gptFooter(pulse)}` : markdown;

  if (pulse.meta?.detail === "full" && Array.isArray(pulse.findings) && pulse.findings.length > findings.length) {
    return `${withGptFooter}\n\n## All Surfaced Findings\n\n${pulse.findings
      .map((finding: any, index: number) => `${index + 1}. ${line(finding.label)} - ${line(finding.evidence?.summary)}`)
      .join("\n")}\n`;
  }

  return `${withGptFooter}\n`;
}
