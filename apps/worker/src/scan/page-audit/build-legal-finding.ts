import type { DerivedFindingRecord } from "../types/finding";
import type { PolicyContentCheckResult } from "./check-policy-content";
import type { PolicyType } from "./policy-keywords";

function getSeverityWeight(severity: DerivedFindingRecord["severity"]) {
  if (severity === "high") {
    return 10;
  }
  if (severity === "medium") {
    return 5;
  }
  if (severity === "low") {
    return 2;
  }
  return 0;
}

function createLegalFinding(input: {
  description: string;
  evidence: Record<string, unknown>;
  remediationBusiness: string;
  remediationTechnical: string;
  ruleKey: string;
  scanId: string;
  scanPageId?: string | null;
  severity: DerivedFindingRecord["severity"];
  subtype: "policy_page" | "policy_content" | "ftc_disclosure" | "testimonial_signal" | "affiliate_signal";
  title: string;
}): DerivedFindingRecord {
  return {
    scan_id: input.scanId,
    scan_page_id: input.scanPageId ?? null,
    category: "legal",
    subtype: input.subtype,
    rule_key: input.ruleKey,
    title: input.title,
    description: input.description,
    severity: input.severity,
    weight: getSeverityWeight(input.severity),
    status: "open",
    evidence_json: input.evidence,
    remediation_business: input.remediationBusiness,
    remediation_technical: input.remediationTechnical
  };
}

const POLICY_LABELS: Record<PolicyType, string> = {
  privacy: "privacy policy",
  terms: "terms page",
  cookie: "cookie policy",
  refund: "refund policy"
};

const POLICY_MISSING_RULE_KEYS: Record<PolicyType, string> = {
  privacy: "legal.policy.privacy_policy_missing",
  terms: "legal.policy.terms_missing",
  cookie: "legal.policy.cookie_policy_missing",
  refund: "legal.policy.refund_policy_missing"
};

const POLICY_LIMITED_RULE_KEYS: Record<PolicyType, string> = {
  privacy: "legal.policy.privacy_policy_limited_content",
  terms: "legal.policy.terms_limited_content",
  cookie: "legal.policy.cookie_policy_limited_content",
  refund: "legal.policy.refund_policy_limited_content"
};

export function buildMissingPolicyFinding(input: {
  policyType: PolicyType;
  scanId: string;
  severity: "high" | "medium";
  evidence: Record<string, unknown>;
}): DerivedFindingRecord {
  return createLegalFinding({
    scanId: input.scanId,
    subtype: "policy_page",
    ruleKey: POLICY_MISSING_RULE_KEYS[input.policyType],
    title: `${POLICY_LABELS[input.policyType]} not detected`,
    description: `A likely ${POLICY_LABELS[input.policyType]} was not detected in the observed site links.`,
    severity: input.severity,
    evidence: input.evidence,
    remediationBusiness: `Review whether your website should publish a clear ${POLICY_LABELS[input.policyType]} for visitors.`,
    remediationTechnical: `Add a clearly linked ${POLICY_LABELS[input.policyType]} page and ensure it is reachable from prominent site navigation or footer links.`
  });
}

export function buildLimitedPolicyContentFinding(input: {
  policyCheck: PolicyContentCheckResult;
  scanId: string;
  scanPageId?: string | null;
}): DerivedFindingRecord {
  return createLegalFinding({
    scanId: input.scanId,
    scanPageId: input.scanPageId ?? null,
    subtype: "policy_content",
    ruleKey: POLICY_LIMITED_RULE_KEYS[input.policyCheck.policyType],
    title: `${POLICY_LABELS[input.policyCheck.policyType]} signals were limited`,
    description: `A likely ${POLICY_LABELS[input.policyCheck.policyType]} was detected, but the observed topic signals on the page were limited. This may indicate a potential content gap.`,
    severity: input.policyCheck.policyType === "privacy" ? "medium" : "low",
    evidence: {
      page_url: input.policyCheck.url,
      matched_concepts: input.policyCheck.matchedConcepts
    },
    remediationBusiness: `Review whether the ${POLICY_LABELS[input.policyCheck.policyType]} covers the topics visitors would reasonably expect.`,
    remediationTechnical: `Expand the ${POLICY_LABELS[input.policyCheck.policyType]} with clearer topic coverage and maintain a stable, directly linked page URL.`
  });
}

export function buildDisclosureNotObservedFinding(input: {
  matchedDisclosureTerms: string[];
  matchedSignalTerms: string[];
  pageType: string | null;
  pageUrl: string;
  scanId: string;
  scanPageId: string;
  representativeSnippets: string[];
}): DerivedFindingRecord {
  return createLegalFinding({
    scanId: input.scanId,
    scanPageId: input.scanPageId,
    subtype: "ftc_disclosure",
    ruleKey: "legal.ftc.disclosure_not_observed_on_promotional_content",
    title: "Promotional or endorsement-style content lacked obvious disclosure language",
    description:
      "Promotional, review, testimonial, or affiliate-style signals were observed without obvious disclosure language on the page.",
    severity: "medium",
    evidence: {
      page_url: input.pageUrl,
      page_type: input.pageType,
      matched_signal_terms: input.matchedSignalTerms.slice(0, 5),
      matched_disclosure_terms: input.matchedDisclosureTerms.slice(0, 5)
    },
    remediationBusiness: "Review whether endorsement or promotional content should include clear disclosure language for visitors.",
    remediationTechnical: "Add clear disclosure copy near the promotional content and ensure the wording is visible without requiring extra interaction."
  });
}

export function buildAffiliateSignalFinding(input: {
  matchedSignalTerms: string[];
  pageType: string | null;
  pageUrl: string;
  scanId: string;
  scanPageId: string;
  representativeSnippets: string[];
}): DerivedFindingRecord {
  return createLegalFinding({
    scanId: input.scanId,
    scanPageId: input.scanPageId,
    subtype: "affiliate_signal",
    ruleKey: "legal.ftc.affiliate_signal_detected",
    title: "Affiliate or commission-style language observed",
    description:
      "Affiliate or commission-style language was observed on the page.",
    severity: "low",
    evidence: {
      page_url: input.pageUrl,
      page_type: input.pageType,
      matched_signal_terms: input.matchedSignalTerms.slice(0, 5)
    },
    remediationBusiness: "Confirm whether affiliate relationships or compensation arrangements are disclosed clearly where appropriate.",
    remediationTechnical: "Review the page copy and ensure any affiliate or compensated recommendation language is paired with clear disclosure text."
  });
}
