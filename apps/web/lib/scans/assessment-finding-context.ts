/** Editorial context over projected findings only; never changes assessment or score. */
type Finding = { id?: string; summary?: string | null; status?: string; severity?: string; evidenceJson?: Record<string, unknown> };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const HTTP_ID = "regulatory_gap__gdpr_eprivacy__transport_security_http_redirect";
const CONTRAST_ID = "visual_contrast_accessibility_issue";
export function accessibilityContextRows(finding: Finding) {
  const evidence = record(record(finding.evidenceJson?.evidenceDetails).accessibilityEvidence);
  return Array.isArray(evidence.axeEvidence) ? evidence.axeEvidence.map(record) : [];
}

/** Probe-only transport and incompletely contextualized contrast stay review items.
 * A separate insecure-navigation/form finding remains independently prioritized. */
export function isContextualReviewFinding(finding: Finding): boolean {
  if (finding.id === HTTP_ID) return true;
  if (finding.id === "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage") return finding.status === "Partial concern";
  if (finding.id === "accessibility_priority_group") {
    const members = finding.evidenceJson?.findings;
    return Array.isArray(members) && members.length > 0 && members.every(member => isContextualReviewFinding(record(member)));
  }
  if (finding.id !== CONTRAST_ID || finding.severity === "critical") return false;
  const rows = accessibilityContextRows(finding);
  // Missing retained examples cannot establish the affected element or extent.
  const hasElement = rows.some(row => Array.isArray(row.representativeNodes) && row.representativeNodes.some(value => {
    const node = record(value);
    return Array.isArray(node.selectors) && node.selectors.some(selector => typeof selector === "string" && selector.trim())
      && typeof node.htmlSnippet === "string" && Boolean(node.htmlSnippet.trim())
      && typeof node.failureSummary === "string" && Boolean(node.failureSummary.trim());
  }));
  if (!hasElement) return true;
  return rows.every(row => row.impact === "minor" || row.impact === "moderate");
}

export function contextualFindingTitle(finding: Finding, fallback: string): string {
  if (finding.id === "accessibility_priority_group" && Array.isArray(finding.evidenceJson?.findings) && finding.evidenceJson.findings.length === 1) {
    const member = record(finding.evidenceJson.findings[0]);
    return contextualFindingTitle(member, fallback);
  }
  if (finding.id !== CONTRAST_ID) return fallback;
  const rules = accessibilityContextRows(finding).map(row => row.ruleId);
  if (rules.length && rules.every(rule => rule === "link-in-text-block")) return "Links rely on color";
  if (rules.length && rules.every(rule => rule === "color-contrast-enhanced")) return "Enhanced text contrast (AAA)";
  if (rules.length && rules.every(rule => rule === "color-contrast")) return "Low text contrast";
  return fallback;
}

export function contextualFindingSummary(finding: Finding, fallback: string): string {
  if (finding.id === HTTP_ID && /^(?:Potential issue based on scan evidence; )?The explicit HTTP-origin probe served a terminal(?: HTTP \d{3})? response over plaintext HTTP instead of redirecting to HTTPS\.$/.test(fallback)) {
    // Keep this qualification attached even in the compact narrative.
    return "The HTTP probe served plaintext without an HTTPS redirect. This separate probe does not establish browser exposure; browser-upgrade protection was not assessed by this check.";
  }
  if (finding.id === "accessibility_priority_group" && Array.isArray(finding.evidenceJson?.findings)) {
    const members = finding.evidenceJson.findings.map(record);
    return members.length && members.every(member => typeof member.summary === "string")
      ? members.map(member => contextualFindingSummary(member, member.summary as string)).join(" ") : fallback;
  }
  if (finding.id !== CONTRAST_ID) return fallback;
  const rows = accessibilityContextRows(finding);
  const rules = [...new Set(rows.flatMap(row => typeof row.ruleId === "string" ? [row.ruleId] : []))];
  if (!rules.length) return fallback;
  const ruleText = ` Automated checks: ${rules.join(", ")}.`;
  return `${fallback}${fallback.includes("Automated checks:") ? "" : ruleText}`;
}
