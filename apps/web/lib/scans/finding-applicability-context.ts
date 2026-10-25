import type { ReportReviewFocus } from "@certscore/api-contracts";
import { FINDING_APPLICABILITY_REGISTRY, type ApplicabilitySource } from "./finding-applicability-registry";

const gdprScope = {
  label: "European Commission · GDPR scope",
  url: "https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en",
};
const californiaScope = { label: "CPPA · CCPA coverage", url: "https://www.cppa.ca.gov/faq.html" };
const scopeChecks = {
  gdpr: "Confirm GDPR scope through EU/EEA establishment, targeting or monitoring and the personal-data processing involved. Scan location alone does not establish applicability.",
  eprivacy: "Confirm the applicable national ePrivacy rules and device-access exemptions; separately check GDPR scope for personal-data processing.",
  california: "Confirm CCPA business coverage, current thresholds and exemptions for the operator and information. Scan location alone does not establish a visitor’s California residency.",
  accessibility: "Confirm the applicable accessibility law or contractual standard for this service and jurisdiction.",
  technical: "Use the retained technical evidence to establish exposure and impact before assessing any legal obligation.",
} as const;

/** Exact identity and mode lookup over an already-projected finding. Never reads
 * raw signals or makes a site-specific applicability decision. */
export function findingApplicabilityContext(id: string, focus: ReportReviewFocus, presentationGroup?: unknown) {
  const key = presentationGroup === "accessibility" ? "accessibility_priority_group" : id;
  const entry = FINDING_APPLICABILITY_REGISTRY.find(row => row.findingIds.includes(key) && row.modes.includes(focus));
  if (!entry) return {
    key: null,
    when: "This issue does not have a mapped regulatory obligation in this review mode.",
    checks: ["Identify the relevant obligation, operator, visitor jurisdiction and activity before drawing a legal conclusion."],
    scopeCheck: "Selecting a review mode or scan location does not establish applicability.",
    sources: [focus === "ccpa_cpra" ? californiaScope : gdprScope],
  };
  const sources: ApplicabilitySource[] = [...entry.sources];
  if (entry.scope === "california") sources.push(californiaScope);
  if (entry.scope === "gdpr" || entry.scope === "eprivacy") sources.push(gdprScope);
  if (entry.scope === "accessibility" && focus === "ccpa_cpra") sources.push(
    { label: "US Department of Justice · ADA web accessibility", url: "https://www.ada.gov/resources/web-guidance/" },
    { label: "US Department of Justice · Title II web rule and dates", url: "https://www.ada.gov/resources/2024-03-08-web-rule/" },
  );
  return { key: entry.key, when: entry.when, checks: entry.checks, scopeCheck: scopeChecks[entry.scope], sources };
}
