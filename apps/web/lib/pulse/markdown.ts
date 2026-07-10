import { PULSE_PURPOSE_STATEMENT, PULSE_STANDARD_DISCLAIMER } from "./constants";
import { getRegulatoryLensAnchor } from "../scans/regulatory-lens-anchor";

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

function metricValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return line(value);
}

function countHighPriorityFindings(findings: any[]) {
  return findings.filter((finding) => ["critical", "high"].includes(String(finding.criticality ?? "").toLowerCase())).length;
}

function safeSummary(value: unknown) {
  const text = line(value);
  return text.replaceAll("No major automated review signals were surfaced in this scan.", NO_TOP_FINDINGS_COPY);
}

function findingAppliesToLens(finding: any, lensName: string) {
  const normalizedLensName = lensName.toLowerCase();
  return Array.isArray(finding.reviewLenses) && finding.reviewLenses.some((name: unknown) => String(name ?? "").toLowerCase() === normalizedLensName);
}

function lensHasSurfacedFinding(lens: any, findings: any[]) {
  const lensName = line(lens.name);
  return (
    (Array.isArray(lens.contributingFindingIds) && lens.contributingFindingIds.length > 0) ||
    findings.some((finding) => findingAppliesToLens(finding, lensName))
  );
}

function safeLensStatus(value: unknown, options: { hasSurfacedFinding?: boolean } = {}) {
  if (options.hasSurfacedFinding) {
    return "Review context retained";
  }

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
            `   - Review context: ${formatReviewLensLinks(finding)}`,
            `   - Next step: ${line(finding.nextStep)}`,
            `   - Evidence link: ${line(finding.evidence?.fullEvidenceUrl ?? finding.anchorUrl)}`
          ].join("\n")
        )
        .join("\n\n")
    : `${NO_TOP_FINDINGS_COPY} ${ABSENCE_OF_FINDINGS_CAVEAT}`;
}

function compactSurfacedResults(pulse: PulseMarkdownInput) {
  const results = pulse.surfacedResults ?? {};
  const gdprFindings = Array.isArray(results.gdprEprivacyFindings) ? results.gdprEprivacyFindings : [];
  if (gdprFindings.length === 0) {
    return "";
  }

  return gdprFindings
    .slice(0, 8)
    .map((finding: any, index: number) => {
      const status = line(finding.status);
      return `${index + 1}. ${line(finding.label)}${status === "Not available" ? "" : ` - ${status}`}`;
    })
    .join("\n");
}

function compactPreConsentTrackers(pulse: PulseMarkdownInput) {
  const trackers = Array.isArray(pulse.surfacedResults?.preConsentTrackers) ? pulse.surfacedResults.preConsentTrackers : [];
  if (trackers.length === 0) {
    return "No named pre-consent tracker rows were available in the Pulse projection.";
  }

  return trackers
    .slice(0, 8)
    .map((tracker: any) => {
      const firstSeen = typeof tracker.firstSeenMs === "number" ? `; first seen ${formatElapsedSeconds(tracker.firstSeenMs)}` : "";
      const purpose = line(tracker.purpose);
      const purposeCopy = purpose === "Not available" ? "" : ` (${purpose})`;
      return `- ${line(tracker.vendor)}${purposeCopy}${firstSeen}`;
    })
    .join("\n");
}

function formatElapsedSeconds(value: number) {
  const seconds = Math.max(0, value) / 1000;
  return `${seconds.toPrecision(3)}s`;
}

function formatReviewLensLinks(finding: any) {
  if (Array.isArray(finding.reviewLensLinks) && finding.reviewLensLinks.length > 0) {
    return finding.reviewLensLinks
      .map((lens: any) => {
        const name = line(lens?.name);
        const url = line(lens?.url);
        return name && url ? `[${name}](${url})` : name;
      })
      .filter(Boolean)
      .join(", ");
  }

  return (finding.reviewLenses ?? []).join(", ") || "Review context not classified";
}

function isLimitedCoverage(status: unknown) {
  return ["partial", "limited", "blocked", "unknown", "unavailable"].includes(String(status ?? "").toLowerCase());
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

function appendHash(url: unknown, hash: string) {
  const base = line(url);
  if (base === "Not available") {
    return "";
  }
  return `${base.split("#")[0]}#${hash}`;
}

function markdownLink(label: string, url: unknown) {
  const href = line(url);
  return href === "Not available" || href.length === 0 ? label : `[${label}](${href})`;
}

function lensUrl(lensName: unknown, fullReportUrl: unknown) {
  const name = line(lensName);
  if (name === "Not available") {
    return "";
  }
  return appendHash(fullReportUrl, getRegulatoryLensAnchor(name));
}

export function renderPulseMarkdown(pulse: PulseMarkdownInput, options: { gptAction?: boolean } = {}) {
  const fullFindings = Array.isArray(pulse.findings) ? pulse.findings : [];
  const topFindings = Array.isArray(pulse.topFindings) ? pulse.topFindings : [];
  const findings = fullFindings.length > 0 ? fullFindings : topFindings;
  const findingsHeading = fullFindings.length > 0 ? "## Automated findings" : "## Highest-priority findings";
  const lenses = Array.isArray(pulse.reviewContext?.lenses) ? pulse.reviewContext.lenses : [];
  const highlights = pulse.evidenceHighlights ?? {};
  const links = pulse.links ?? {};
  const fullReportUrl = links.fullReportUrl;
  const trackerFootprintUrl = highlights.trackerFootprint?.detailsUrl ?? appendHash(fullReportUrl, "tracker-footprint");
  const vendorMixUrl = highlights.vendorMix?.detailsUrl ?? appendHash(fullReportUrl, "vendor-mix");
  const consentFindingsUrl = appendHash(fullReportUrl, "coverage-section-consent_controls_enforcement");
  const policySurfacesUrl = highlights.policySurfaces?.detailsUrl ?? appendHash(fullReportUrl, "policy-surfaces");
  const fingerprintingUrl = highlights.fingerprinting?.detailsUrl ?? appendHash(fullReportUrl, "fingerprinting");
  const titleDomain = line(pulse.domain);
  const completedAt = line(pulse.scan?.completedAt ?? pulse.timestamps?.completedAt ?? pulse.completedAt);
  const highPriorityCount = countHighPriorityFindings(findings);
  const observationCount = totalObservationCount(pulse, findings);
  const executive = pulse.executiveSummary ?? {};
  const executiveIssueCount =
    typeof executive.issuesToReview === "number"
      ? executive.issuesToReview
      : typeof pulse.counts?.executiveIssueCount === "number"
        ? pulse.counts.executiveIssueCount
        : findings.length;
  const completionSummary = line(pulse.summary?.completionSummary ?? executive.completionSummary);
  const surfacedResults = compactSurfacedResults(pulse);
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
    `| Issues to review | ${executiveIssueCount} |`,
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
    completionSummary === "Not available" ? safeSummary(pulse.summary?.humanSummary ?? pulse.summary?.headline) : completionSummary,
    ...(pulse.resultDisposition === "no_go" && pulse.noGo
      ? [
          "",
          "## Scan limitation",
          "",
          `**${line(pulse.noGo.title)}**`,
          "",
          line(pulse.noGo.explanation),
          "",
          `Recommended next action: ${line(pulse.noGo.recommendedNextAction)}`,
          `Retry likely to help: ${pulse.noGo.retryLikelyToHelp === true ? "Yes" : "No"}`
        ]
      : []),
    "",
    `Executive report: ${metricValue(executive.score ?? pulse.summary?.score)}/100; ${executiveIssueCount} issue${executiveIssueCount === 1 ? "" : "s"} to review; ${metricValue(executive.thirdPartyRequests)} third-party requests; ${metricValue(executive.cookiesPreConsent)} cookies pre-consent.`,
    `Signal snapshot: consent platform ${line(executive.consentPlatform)}; tracker footprint ${metricValue(executive.trackerFootprint?.vendors)} vendor${executive.trackerFootprint?.vendors === 1 ? "" : "s"}, ${metricValue(executive.trackerFootprint?.domains)} domain${executive.trackerFootprint?.domains === 1 ? "" : "s"}.`,
    ...(options.gptAction && isLimitedCoverage(pulse.coverage?.status)
      ? [
          "",
          "**Coverage limitation:** " +
            line(pulse.coverage?.summary ?? "Coverage was limited; absence of findings should not be interpreted as absence of risk.")
        ]
      : []),
    "",
    ...(surfacedResults
      ? [
          "## Surfaced GDPR/ePrivacy Results",
          "",
          surfacedResults,
          ""
        ]
      : []),
    "## Named Pre-consent Tracker Rows",
    "",
    compactPreConsentTrackers(pulse),
    "",
    findingsHeading,
    "",
    compactFindings(findings, options),
    "",
    "## Review lenses",
    "",
    lenses.length > 0
      ? lenses
          .map(
            (lens: any) =>
              `- ${markdownLink(
                `${line(lens.name)} review context: ${line(lens.summary)}`,
                lens.detailsUrl ?? lens.url ?? lensUrl(lens.name, fullReportUrl)
              )} - ${safeLensStatus(lens.status, { hasSurfacedFinding: lensHasSurfacedFinding(lens, findings) })}`
          )
          .join("\n")
      : "- Review lenses were not evaluated for this Pulse.",
    "",
    "## Privacy and consent signals",
    "",
    `- ${markdownLink(`Tracker footprint: ${metricValue(highlights.trackerFootprint?.thirdPartyDomainsObserved)} third-party domains observed`, trackerFootprintUrl)}`,
    `- ${markdownLink(`Classified tracker vendors: ${metricValue(highlights.trackerFootprint?.classifiedTrackerVendors)}`, trackerFootprintUrl)}`,
    `- ${markdownLink(`Consent-related findings: ${findings.filter((finding) => /consent|tracking|cookie|vendor/i.test(`${finding.id ?? ""} ${finding.label ?? ""}`)).length}`, consentFindingsUrl)}`,
    "",
    "## Cookie and third-party request activity",
    "",
    `- ${markdownLink(`Tracker footprint: ${line(highlights.trackerFootprint?.summary)}`, trackerFootprintUrl)}`,
    `- ${markdownLink(`Vendor mix: ${line(highlights.vendorMix?.summary)}`, vendorMixUrl)}`,
    "",
    "## Accessibility signals",
    "",
    `- Accessibility-related findings: ${findings.filter((finding) => /accessibility|contrast|keyboard|label|alternative/i.test(`${finding.id ?? ""} ${finding.label ?? ""}`)).length}`,
    "",
    "## Disclosure and trust signals",
    "",
    `- ${markdownLink(`Policy URLs covered: ${metricValue(highlights.policySurfaces?.policyUrlCount)}`, policySurfacesUrl)}`,
    `- ${markdownLink(`Probable fingerprinting: ${highlights.fingerprinting?.probableFingerprintingDetected === true ? "Probable fingerprinting detected" : "No probable fingerprinting detected"}`, fingerprintingUrl)}`,
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
    `Summary JSON: ${line(links.summaryJsonUrl ?? links.immutableJsonUrl ?? links.scanJsonUrl)}`,
    `Evidence JSON: ${line(links.evidenceJsonUrl ?? links.immutableFullJsonUrl ?? links.fullJsonUrl)}`,
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
