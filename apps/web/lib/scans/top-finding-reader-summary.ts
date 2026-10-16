export const TOP_FINDING_READER_SUMMARY_VERSION = "certscore.top-finding-reader-summary.v1";

type ProjectedFindingCopy = {
  id: string;
  title: string;
  summary: string;
};

const PRIVACY_NOTICE_ID = "regulatory_gap__gdpr_eprivacy__privacy_notice_availability";
const PARTIAL_PREFIX = "Partial support from scan evidence; ";
const POTENTIAL_PREFIX = "Potential issue based on scan evidence; ";
const LIMITED_POLICY_PREFIX = "Coverage was limited by policy-surface evidence; ";
const NOT_CONFIRMED_PREFIX = "Not confirmed by scan evidence; ";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/(?<!\.)\.\.$/, ".");
}

function factFirstWithQualification(copy: string, qualification: string) {
  const firstSentenceEnd = copy.search(/[.!?](?:\s|$)/);
  if (firstSentenceEnd < 0) return `${copy.replace(/[.!?]$/, "")}. ${qualification}`;
  const end = firstSentenceEnd + 1;
  return `${copy.slice(0, end)} ${qualification} ${copy.slice(end).trim()}`.trim();
}

/** Reader copy for an already-projected top finding; never derives eligibility or evidence. */
export function topFindingReaderSummary(finding: ProjectedFindingCopy) {
  const summary = normalize(finding.summary);
  if (!summary) return `Review the supporting evidence for “${normalize(finding.title)}”.`;

  // This exact projected policy summary carries internal extraction diagnostics
  // after the observed, scope-bound finding. Keep the limitation, and leave the
  // complete canonical wording in the expanded card.
  if (finding.id === PRIVACY_NOTICE_ID && summary.startsWith(LIMITED_POLICY_PREFIX)) {
    const detail = summary.slice(LIMITED_POLICY_PREFIX.length);
    const observation = detail.split(";")[0]?.trim();
    if (observation?.startsWith("The completed policy-surface inspection did not observe a reachable privacy notice or privacy policy in the tested context")) {
      return `${observation.replace(/[.!?]$/, "")}. Policy-surface evidence was limited; verify the result manually.`;
    }
  }

  if (summary.startsWith(PARTIAL_PREFIX)) {
    const detail = summary.slice(PARTIAL_PREFIX.length).trim();
    return detail ? factFirstWithQualification(detail, "Scan evidence only partially supports this finding.") : summary;
  }
  if (summary.startsWith(LIMITED_POLICY_PREFIX)) {
    const detail = summary.slice(LIMITED_POLICY_PREFIX.length).trim();
    return detail ? factFirstWithQualification(detail, "Policy-surface evidence was limited.") : summary;
  }
  if (summary.startsWith(POTENTIAL_PREFIX)) {
    const detail = summary.slice(POTENTIAL_PREFIX.length).trim();
    return detail || summary;
  }
  if (summary.startsWith(NOT_CONFIRMED_PREFIX)) {
    const detail = summary.slice(NOT_CONFIRMED_PREFIX.length).trim();
    if (finding.id === "regulatory_gap__gdpr_eprivacy__consent_surface_observed" &&
        detail === "The canonical pre-interaction consent assessment was limited, so consent-surface presence was not confirmed from retained evidence.") {
      return "The scan could not confirm whether a consent surface was present because the pre-interaction assessment was limited.";
    }
    const policyDisclosure = detail.match(/^(.+?) was not observed in a verified, complete, target-owned policy retained with sufficient row-specific absence coverage\.$/);
    if (policyDisclosure) {
      return `The scan could not confirm ${policyDisclosure[1]!.toLowerCase()} from retained policy evidence; it did not establish that the disclosure is absent.`;
    }
    return detail ? factFirstWithQualification(detail, "The scan did not confirm this finding.") : summary;
  }
  if (summary === "Potential issue based on scan evidence.") {
    return `Review the supporting evidence for “${normalize(finding.title)}”.`;
  }
  return summary;
}
