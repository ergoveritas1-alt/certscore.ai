import type { ReportReviewFocus } from "@certscore/api-contracts";
import { regulatoryReviewContext } from "./regulatory-review-catalog";

const gdprScope = {
  label: "European Commission: who GDPR applies to",
  url: "https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en",
};
const californiaScope = { label: "CPPA: who must comply with CCPA", url: "https://www.cppa.ca.gov/faq.html" };

/** Editorial scope guidance only. Never establishes applicability or changes a finding or score.
 * Current assessments do not retain a verified site-specific legal applicability decision.
 * Do not substitute a region, policy claim, vendor classification or finding status for one. */
export function findingApplicabilityContext(id: string, focus: ReportReviewFocus, presentationGroup?: unknown) {
  const context = regulatoryReviewContext(id, focus);
  if (id === "accessibility_priority_group" || presentationGroup === "accessibility") {
    return {
      reference: { label: "WCAG technical standard", url: "https://www.w3.org/WAI/standards-guidelines/wcag/" },
      explanation: `WCAG is a technical standard. CertScore.ai has not determined whether ${focus === "ccpa_cpra" ? "the ADA or another accessibility law" : "an accessibility law"}, or a particular WCAG version or conformance level, applies to this site under the circumstances of this scan. Automated findings do not establish a legal violation.`,
      checks: "Check the organisation and service type, the jurisdictions served, and the scope, exceptions and technical requirements of the relevant accessibility law.",
      lookups: focus === "ccpa_cpra"
        ? [{ label: "US Department of Justice: ADA web accessibility", url: "https://www.ada.gov/resources/web-guidance/" }, { label: "W3C: accessibility laws by jurisdiction", url: "https://www.w3.org/WAI/policies/" }]
        : [{ label: "W3C: accessibility laws by jurisdiction", url: "https://www.w3.org/WAI/policies/" }],
    };
  }
  const explanation = context
    ? "CertScore.ai has not determined whether the referenced law or this particular obligation applies to this site, its operator or the circumstances of this scan. The finding, score and any enforcement examples do not establish legal applicability or a violation."
    : "This issue does not have a mapped regulatory obligation. CertScore.ai has not determined whether a particular law applies to this site, its operator or the circumstances of this scan. The finding and score do not establish legal applicability or a violation.";
  if (!context) return {
    reference: null, explanation,
    checks: "Identify the relevant obligation, operator, visitor jurisdiction and activity before drawing a legal conclusion. Selecting a review mode or scan location does not establish applicability.",
    lookups: [focus === "ccpa_cpra" ? californiaScope : gdprScope],
  };
  if (focus === "ccpa_cpra") return {
    reference: null, explanation,
    checks: "Check the operator’s business status, California activities, applicable coverage thresholds and exemptions. Then check whether this specific duty applies to the information and activity observed. Scan location alone does not establish a visitor’s California residency.",
    lookups: [californiaScope],
  };
  const eprivacy = context.rule.includes("ePrivacy");
  return {
    reference: null, explanation,
    checks: eprivacy
      ? "Check the applicable national ePrivacy rules, territorial scope and whether the device storage or access requires consent or qualifies for an exemption. For any GDPR duty, also check the operator’s establishment, EU/EEA targeting or monitoring, and the processing involved."
      : "Check the operator’s EU/EEA establishment or targeting or monitoring of people there, the personal-data processing involved, and any conditions or exemptions for this particular duty. Scan location alone does not establish GDPR applicability.",
    lookups: eprivacy
      ? [gdprScope, { label: "EUR-Lex: ePrivacy scope and device-access rules", url: "https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng" }]
      : [gdprScope],
  };
}
