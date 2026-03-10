import type { RegulatoryRiskAssessment } from "./regulatory-risk";

export type AgencyKey =
  | "ftc"
  | "gdpr_edpb"
  | "cppa"
  | "doj_ada"
  | "opc_canada"
  | "anpd_brazil"
  | "sa_info_regulator"
  | "swiss_fdpic";

export type AgencyRelevanceLevel = "high" | "moderate" | "limited";
export type AgencyMappingCategory = "consumer_protection" | "privacy" | "accessibility" | "mixed";

export type AgencyTriggeredSignal = {
  key: string;
  label: string;
};

export type AgencyMapping = {
  agencyKey: AgencyKey;
  agencyLabel: string;
  shortLabel: string;
  category: AgencyMappingCategory;
  relevanceLevel: AgencyRelevanceLevel;
  relevanceScore: number;
  rationale: string;
  helperLabel: string;
  triggeredSignals: AgencyTriggeredSignal[];
  contributingSubscores: Array<{ key: string; label: string; score: number }>;
  topAgencyRiskDrivers: string[];
  relatedOverallRiskLevel: RegulatoryRiskAssessment["riskLevel"] | null;
  isPrimaryAgency: boolean;
};

export type AgencyMappingSource = {
  policyBehaviorConflictDetected?: boolean | null;
  sessionReplayWithoutDisclosureDetected?: boolean | null;
  sessionReplayTrackerCount?: number | null;
  advertisingTrackerCount?: number | null;
  affiliateDisclosurePresent?: boolean | null;
  advertisingDisclosurePresent?: boolean | null;
  testimonialOrReviewDisclosurePresent?: boolean | null;
  consumerProtectionScore?: number | null;
  autoRenewalDisclosurePresent?: boolean | null;
  cancellationPolicyPresent?: boolean | null;
  refundOrReturnWindowDetected?: boolean | null;
  subscriptionOfferDetected?: boolean | null;
  freeTrialDetected?: boolean | null;
  trackingBeforeConsentDetected?: boolean | null;
  thirdPartyCookieSetBeforeConsent?: boolean | null;
  cookieBannerPresent?: boolean | null;
  rejectAllPresent?: boolean | null;
  granularPreferencesPresent?: boolean | null;
  mentionsGdpr?: boolean | null;
  crossBorderTransferMechanismDetected?: boolean | null;
  mentionsCrossBorderTransfer?: boolean | null;
  dsarRequestMechanismPresent?: boolean | null;
  dataDeletionRequestPresent?: boolean | null;
  dataAccessRequestPresent?: boolean | null;
  privacyRequestFormPresent?: boolean | null;
  consentMaturityScore?: number | null;
  trackerRegulatoryRiskScore?: number | null;
  subprocessorListPresent?: boolean | null;
  doNotSellLinkPresent?: boolean | null;
  gpcSignalRespected?: boolean | null;
  californiaExposureLikely?: boolean | null;
  mentionsDataSaleOrSharing?: boolean | null;
  wcagErrorCountTotal?: number | null;
  wcagMissingAltCount?: number | null;
  wcagFormLabelErrorCount?: number | null;
  wcagKeyboardNavigationIssueCount?: number | null;
  accessibilityStatementPresent?: boolean | null;
  accessibilityClaimMismatchDetected?: boolean | null;
  accessibilityLitigationRiskScore?: number | null;
  adaDemandLetterProbability?: number | null;
  ecommerceSiteLikely?: boolean | null;
  privacyPolicyPresent?: boolean | null;
  privacyContactMethodPresent?: boolean | null;
  privacyEmailSpecificPresent?: boolean | null;
  mentionsDataRetention?: boolean | null;
  mentionsSensitiveData?: boolean | null;
  mentionsUnder13?: boolean | null;
  mentionsUnder16?: boolean | null;
  childrenAudienceLikely?: boolean | null;
  mentionsCcpaOrCpra?: boolean | null;
};

type Rule = {
  key: keyof AgencyMappingSource;
  label: string;
  points: number;
  when: (source: AgencyMappingSource) => boolean;
};

type AgencyDefinition = {
  agencyKey: AgencyKey;
  agencyLabel: string;
  shortLabel: string;
  category: AgencyMappingCategory;
  helperLabel: string;
  isPrimaryAgency: boolean;
  rationale: (signals: AgencyTriggeredSignal[]) => string;
  rules: Rule[];
};

function isTrue(value: boolean | null | undefined) {
  return value === true;
}

function isFalse(value: boolean | null | undefined) {
  return value === false;
}

function getNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function atLeast(value: number | null | undefined, threshold: number) {
  const next = getNumber(value);
  return next !== null && next >= threshold;
}

function aboveZero(value: number | null | undefined) {
  return atLeast(value, 1);
}

function buildRationale(prefix: string, signals: AgencyTriggeredSignal[]) {
  const signalNames = signals
    .slice(0, 3)
    .map((signal) => getRationaleSignalPhrase(signal.label))
    .filter(Boolean);

  if (signalNames.length === 0) {
    return prefix;
  }

  return `${prefix} The clearest flags are ${joinList(signalNames)}.`;
}

function joinList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function getRationaleSignalPhrase(label: string) {
  const map: Record<string, string> = {
    "California exposure likely": "likely California exposure",
    "Do not sell/share link missing": 'no visible "Do Not Sell or Share" path',
    "GPC handling not observed": "no observed GPC handling",
    "Deletion rights mechanism missing": "no visible deletion-request path",
    "Access rights mechanism missing": "no visible access-request path",
    "Privacy request form missing": "no visible privacy request form",
    "Privacy rights channel missing": "no clear privacy-rights contact path",
    "Tracking before consent": "tracking before a clear consent choice",
    "Third-party cookies before consent": "third-party cookies before consent",
    "Consent banner detected": "a visible consent banner",
    "Reject-all control missing": "no visible reject-all control",
    "Granular consent controls missing": "no visible granular consent controls",
    "GDPR disclosure language": "GDPR-related policy language",
    "Cross-border transfer mechanism disclosed": "a disclosed transfer mechanism",
    "Data subject rights mechanism": "a visible rights-request path",
    "Weak consent controls": "weak consent controls",
    "Elevated tracker regulatory risk": "elevated tracker-related risk",
    "Subprocessor transparency gap": "limited subprocessor transparency",
    "Policy and behavior mismatch": "a policy-to-behavior mismatch",
    "Session replay without disclosure": "session replay without clear disclosure",
    "Advertising tracker activity": "advertising tracker activity",
    "Affiliate disclosure gap": "an affiliate disclosure gap",
    "Advertising disclosure gap": "an advertising disclosure gap",
    "Testimonial or review disclosure gap": "a testimonial or review disclosure gap",
    "Elevated consumer-protection risk": "elevated consumer-protection risk",
    "Auto-renewal disclosure gap": "an auto-renewal disclosure gap",
    "Cancellation policy gap": "a cancellation-policy gap",
    "Refund or return disclosure gap": "a refund or return disclosure gap",
    "High automated WCAG issue count": "a high automated WCAG issue count",
    "Missing image alternative text": "missing image alternative text",
    "Form label accessibility issues": "form label accessibility issues",
    "Keyboard navigation issues": "keyboard navigation issues",
    "Accessibility statement missing": "no visible accessibility statement",
    "Accessibility claim mismatch": "an accessibility claim mismatch",
    "Elevated accessibility litigation risk": "elevated accessibility risk",
    "Elevated ADA demand-letter exposure": "elevated ADA demand-letter exposure",
    "Public-facing commerce surface": "a public-facing commerce surface"
  };

  return map[label] ?? label.charAt(0).toLowerCase() + label.slice(1);
}

const AGENCY_DEFINITIONS: AgencyDefinition[] = [
  {
    agencyKey: "ftc",
    agencyLabel: "Federal Trade Commission",
    shortLabel: "FTC",
    category: "consumer_protection",
    helperLabel: "Consumer disclosure and data-practice signals",
    isPrimaryAgency: true,
    rationale: (signals) =>
      buildRationale(
        "This scan surfaced disclosure, commercial-practice, and data-transparency signals that fit most closely with FTC-style consumer-protection scrutiny.",
        signals
      ),
    rules: [
      { key: "policyBehaviorConflictDetected", label: "Policy and behavior mismatch", points: 5, when: (s) => isTrue(s.policyBehaviorConflictDetected) },
      {
        key: "sessionReplayWithoutDisclosureDetected",
        label: "Session replay without disclosure",
        points: 4,
        when: (s) => isTrue(s.sessionReplayWithoutDisclosureDetected)
      },
      { key: "advertisingTrackerCount", label: "Advertising tracker activity", points: 3, when: (s) => aboveZero(s.advertisingTrackerCount) },
      {
        key: "affiliateDisclosurePresent",
        label: "Affiliate disclosure gap",
        points: 2,
        when: (s) => isFalse(s.affiliateDisclosurePresent)
      },
      {
        key: "advertisingDisclosurePresent",
        label: "Advertising disclosure gap",
        points: 2,
        when: (s) => isFalse(s.advertisingDisclosurePresent)
      },
      {
        key: "testimonialOrReviewDisclosurePresent",
        label: "Testimonial or review disclosure gap",
        points: 2,
        when: (s) => isFalse(s.testimonialOrReviewDisclosurePresent)
      },
      {
        key: "consumerProtectionScore",
        label: "Elevated consumer-protection risk",
        points: 3,
        when: (s) => atLeast(s.consumerProtectionScore, 65)
      },
      {
        key: "autoRenewalDisclosurePresent",
        label: "Auto-renewal disclosure gap",
        points: 2,
        when: (s) => isTrue(s.subscriptionOfferDetected) && isFalse(s.autoRenewalDisclosurePresent)
      },
      {
        key: "cancellationPolicyPresent",
        label: "Cancellation policy gap",
        points: 2,
        when: (s) => isTrue(s.subscriptionOfferDetected) && isFalse(s.cancellationPolicyPresent)
      },
      {
        key: "refundOrReturnWindowDetected",
        label: "Refund or return disclosure gap",
        points: 2,
        when: (s) => isTrue(s.freeTrialDetected) && isFalse(s.refundOrReturnWindowDetected)
      }
    ]
  },
  {
    agencyKey: "gdpr_edpb",
    agencyLabel: "European Data Protection Board / EU Data Protection Authorities",
    shortLabel: "GDPR / EU DPA",
    category: "privacy",
    helperLabel: "Consent, cookies, and data-rights signals",
    isPrimaryAgency: true,
    rationale: (signals) =>
      buildRationale(
        "This scan surfaced consent, cookies, and privacy-rights signals that fit most closely with EU-style data-protection expectations.",
        signals
      ),
    rules: [
      {
        key: "trackingBeforeConsentDetected",
        label: "Tracking before consent",
        points: 5,
        when: (s) => isTrue(s.trackingBeforeConsentDetected)
      },
      {
        key: "thirdPartyCookieSetBeforeConsent",
        label: "Third-party cookies before consent",
        points: 5,
        when: (s) => isTrue(s.thirdPartyCookieSetBeforeConsent)
      },
      { key: "cookieBannerPresent", label: "Consent banner detected", points: 1, when: (s) => isTrue(s.cookieBannerPresent) },
      { key: "rejectAllPresent", label: "Reject-all control missing", points: 4, when: (s) => isTrue(s.cookieBannerPresent) && isFalse(s.rejectAllPresent) },
      {
        key: "granularPreferencesPresent",
        label: "Granular consent controls missing",
        points: 3,
        when: (s) => isTrue(s.cookieBannerPresent) && isFalse(s.granularPreferencesPresent)
      },
      { key: "mentionsGdpr", label: "GDPR disclosure language", points: 2, when: (s) => isTrue(s.mentionsGdpr) },
      {
        key: "crossBorderTransferMechanismDetected",
        label: "Cross-border transfer mechanism disclosed",
        points: 2,
        when: (s) => isTrue(s.crossBorderTransferMechanismDetected)
      },
      {
        key: "dsarRequestMechanismPresent",
        label: "Data subject rights mechanism",
        points: 2,
        when: (s) => isTrue(s.dsarRequestMechanismPresent)
      },
      {
        key: "consentMaturityScore",
        label: "Weak consent controls",
        points: 3,
        when: (s) => {
          const score = getNumber(s.consentMaturityScore);
          return score !== null && score < 45;
        }
      },
      {
        key: "trackerRegulatoryRiskScore",
        label: "Elevated tracker regulatory risk",
        points: 2,
        when: (s) => atLeast(s.trackerRegulatoryRiskScore, 40)
      },
      {
        key: "subprocessorListPresent",
        label: "Subprocessor transparency gap",
        points: 2,
        when: (s) => isFalse(s.subprocessorListPresent)
      }
    ]
  },
  {
    agencyKey: "cppa",
    agencyLabel: "California Privacy Protection Agency",
    shortLabel: "CPPA",
    category: "privacy",
    helperLabel: "California privacy rights and opt-out signals",
    isPrimaryAgency: true,
    rationale: (signals) =>
      buildRationale(
        "This scan surfaced California-facing privacy-rights, opt-out, and ad-sharing signals. The main posture issue is that California-style request or opt-out paths were not clearly surfaced.",
        signals
      ),
    rules: [
      {
        key: "californiaExposureLikely",
        label: "California exposure likely",
        points: 2,
        when: (s) => isTrue(s.californiaExposureLikely)
      },
      {
        key: "doNotSellLinkPresent",
        label: "Do not sell/share link missing",
        points: 4,
        when: (s) =>
          isTrue(s.californiaExposureLikely) &&
          (isTrue(s.mentionsDataSaleOrSharing) || aboveZero(s.advertisingTrackerCount)) &&
          isFalse(s.doNotSellLinkPresent)
      },
      {
        key: "gpcSignalRespected",
        label: "GPC handling not observed",
        points: 2,
        when: (s) =>
          isTrue(s.californiaExposureLikely) &&
          (isTrue(s.mentionsCcpaOrCpra) || aboveZero(s.advertisingTrackerCount)) &&
          s.gpcSignalRespected !== true
      },
      {
        key: "dataDeletionRequestPresent",
        label: "Deletion rights mechanism missing",
        points: 3,
        when: (s) => isTrue(s.californiaExposureLikely) && isFalse(s.dataDeletionRequestPresent)
      },
      {
        key: "dataAccessRequestPresent",
        label: "Access rights mechanism missing",
        points: 3,
        when: (s) => isTrue(s.californiaExposureLikely) && isFalse(s.dataAccessRequestPresent)
      },
      {
        key: "privacyRequestFormPresent",
        label: "Privacy request form missing",
        points: 2,
        when: (s) => isTrue(s.californiaExposureLikely) && isFalse(s.privacyRequestFormPresent)
      },
      {
        key: "dsarRequestMechanismPresent",
        label: "Privacy rights channel missing",
        points: 2,
        when: (s) => isTrue(s.californiaExposureLikely) && isFalse(s.dsarRequestMechanismPresent)
      }
    ]
  },
  {
    agencyKey: "doj_ada",
    agencyLabel: "U.S. Department of Justice",
    shortLabel: "DOJ / ADA",
    category: "accessibility",
    helperLabel: "Accessibility and ADA-related web expectations",
    isPrimaryAgency: true,
    rationale: (signals) =>
      buildRationale(
        "This scan surfaced accessibility signals that fit most closely with ADA-related expectations for public-facing digital experiences.",
        signals
      ),
    rules: [
      { key: "wcagErrorCountTotal", label: "High automated WCAG issue count", points: 4, when: (s) => atLeast(s.wcagErrorCountTotal, 20) },
      { key: "wcagMissingAltCount", label: "Missing image alternative text", points: 3, when: (s) => atLeast(s.wcagMissingAltCount, 5) },
      { key: "wcagFormLabelErrorCount", label: "Form label accessibility issues", points: 3, when: (s) => atLeast(s.wcagFormLabelErrorCount, 3) },
      {
        key: "wcagKeyboardNavigationIssueCount",
        label: "Keyboard navigation issues",
        points: 3,
        when: (s) => atLeast(s.wcagKeyboardNavigationIssueCount, 2)
      },
      {
        key: "accessibilityStatementPresent",
        label: "Accessibility statement missing",
        points: 2,
        when: (s) => isFalse(s.accessibilityStatementPresent)
      },
      {
        key: "accessibilityClaimMismatchDetected",
        label: "Accessibility claim mismatch",
        points: 4,
        when: (s) => isTrue(s.accessibilityClaimMismatchDetected)
      },
      {
        key: "accessibilityLitigationRiskScore",
        label: "Elevated accessibility litigation risk",
        points: 4,
        when: (s) => atLeast(s.accessibilityLitigationRiskScore, 45)
      },
      {
        key: "adaDemandLetterProbability",
        label: "Elevated ADA demand-letter exposure",
        points: 3,
        when: (s) => atLeast(s.adaDemandLetterProbability, 45)
      },
      {
        key: "ecommerceSiteLikely",
        label: "Public-facing commerce surface",
        points: 2,
        when: (s) => isTrue(s.ecommerceSiteLikely) && atLeast(s.wcagErrorCountTotal, 10)
      }
    ]
  },
  {
    agencyKey: "opc_canada",
    agencyLabel: "Office of the Privacy Commissioner of Canada",
    shortLabel: "Canada OPC",
    category: "privacy",
    helperLabel: "General privacy notice and rights signals",
    isPrimaryAgency: false,
    rationale: (signals) =>
      buildRationale(
        "These findings may also matter in the context of Canadian privacy oversight focused on notice, safeguards, and individual rights.",
        signals
      ),
    rules: [
      { key: "privacyPolicyPresent", label: "Privacy policy missing", points: 3, when: (s) => isFalse(s.privacyPolicyPresent) },
      { key: "privacyContactMethodPresent", label: "Privacy contact path missing", points: 2, when: (s) => isFalse(s.privacyContactMethodPresent) },
      { key: "mentionsDataRetention", label: "Retention disclosure", points: 1, when: (s) => isTrue(s.mentionsDataRetention) },
      { key: "mentionsSensitiveData", label: "Sensitive-data disclosure", points: 2, when: (s) => isTrue(s.mentionsSensitiveData) },
      { key: "dsarRequestMechanismPresent", label: "Rights request mechanism", points: 2, when: (s) => isTrue(s.dsarRequestMechanismPresent) },
      {
        key: "mentionsCrossBorderTransfer",
        label: "Cross-border transfer disclosure",
        points: 2,
        when: (s) => isTrue(s.mentionsCrossBorderTransfer)
      }
    ]
  },
  {
    agencyKey: "anpd_brazil",
    agencyLabel: "Brazil ANPD",
    shortLabel: "Brazil ANPD",
    category: "privacy",
    helperLabel: "Rights, retention, and transfer signals",
    isPrimaryAgency: false,
    rationale: (signals) =>
      buildRationale(
        "These findings may also matter in the context of Brazil's privacy framework around consent, rights handling, and cross-border transfer transparency.",
        signals
      ),
    rules: [
      { key: "trackingBeforeConsentDetected", label: "Tracking before consent", points: 3, when: (s) => isTrue(s.trackingBeforeConsentDetected) },
      { key: "privacyPolicyPresent", label: "Privacy policy missing", points: 3, when: (s) => isFalse(s.privacyPolicyPresent) },
      { key: "dsarRequestMechanismPresent", label: "Rights request mechanism", points: 2, when: (s) => isTrue(s.dsarRequestMechanismPresent) },
      {
        key: "crossBorderTransferMechanismDetected",
        label: "Cross-border transfer mechanism disclosed",
        points: 2,
        when: (s) => isTrue(s.crossBorderTransferMechanismDetected)
      },
      { key: "mentionsSensitiveData", label: "Sensitive-data disclosure", points: 2, when: (s) => isTrue(s.mentionsSensitiveData) }
    ]
  },
  {
    agencyKey: "sa_info_regulator",
    agencyLabel: "South Africa Information Regulator",
    shortLabel: "South Africa POPIA",
    category: "privacy",
    helperLabel: "Notice, rights, and privacy-governance signals",
    isPrimaryAgency: false,
    rationale: (signals) =>
      buildRationale(
        "These findings may also matter in the context of privacy oversight focused on lawful processing, notice, and user rights.",
        signals
      ),
    rules: [
      { key: "privacyPolicyPresent", label: "Privacy policy missing", points: 3, when: (s) => isFalse(s.privacyPolicyPresent) },
      { key: "privacyContactMethodPresent", label: "Privacy contact path missing", points: 2, when: (s) => isFalse(s.privacyContactMethodPresent) },
      { key: "dataDeletionRequestPresent", label: "Deletion rights mechanism", points: 2, when: (s) => isTrue(s.dataDeletionRequestPresent) },
      { key: "mentionsSensitiveData", label: "Sensitive-data disclosure", points: 2, when: (s) => isTrue(s.mentionsSensitiveData) },
      { key: "childrenAudienceLikely", label: "Children-related privacy signals", points: 2, when: (s) => isTrue(s.childrenAudienceLikely) }
    ]
  },
  {
    agencyKey: "swiss_fdpic",
    agencyLabel: "Swiss FDPIC",
    shortLabel: "Swiss FDPIC",
    category: "privacy",
    helperLabel: "Cross-border transfer and privacy-notice signals",
    isPrimaryAgency: false,
    rationale: (signals) =>
      buildRationale(
        "These findings may also matter in the context of Swiss privacy expectations around transparency, sensitive data, and international transfers.",
        signals
      ),
    rules: [
      { key: "privacyPolicyPresent", label: "Privacy policy missing", points: 3, when: (s) => isFalse(s.privacyPolicyPresent) },
      {
        key: "mentionsCrossBorderTransfer",
        label: "Cross-border transfer disclosure",
        points: 2,
        when: (s) => isTrue(s.mentionsCrossBorderTransfer)
      },
      {
        key: "crossBorderTransferMechanismDetected",
        label: "Cross-border transfer mechanism disclosed",
        points: 2,
        when: (s) => isTrue(s.crossBorderTransferMechanismDetected)
      },
      { key: "mentionsSensitiveData", label: "Sensitive-data disclosure", points: 2, when: (s) => isTrue(s.mentionsSensitiveData) },
      { key: "privacyEmailSpecificPresent", label: "Privacy-specific contact path", points: 1, when: (s) => isTrue(s.privacyEmailSpecificPresent) }
    ]
  }
];

function getRelevanceLevel(score: number): AgencyRelevanceLevel | null {
  if (score >= 8) {
    return "high";
  }

  if (score >= 4) {
    return "moderate";
  }

  if (score >= 2) {
    return "limited";
  }

  return null;
}

function compareMappings(left: AgencyMapping, right: AgencyMapping) {
  if (right.relevanceScore !== left.relevanceScore) {
    return right.relevanceScore - left.relevanceScore;
  }

  if (left.isPrimaryAgency !== right.isPrimaryAgency) {
    return left.isPrimaryAgency ? -1 : 1;
  }

  return left.agencyLabel.localeCompare(right.agencyLabel);
}

function buildContributingSubscores(input: {
  agencyKey: AgencyKey;
  risk: RegulatoryRiskAssessment | null;
}) {
  if (!input.risk) {
    return [];
  }

  const pick = (items: Array<{ key: string; label: string; score: number }>) => items.filter((item) => item.score >= 20);
  if (input.agencyKey === "ftc") {
    return pick([
      { key: "consumerProtectionRiskScore", label: "Consumer protection", score: input.risk.consumerProtectionRiskScore },
      { key: "privacyEnforcementRiskScore", label: "Privacy", score: input.risk.privacyEnforcementRiskScore }
    ]);
  }
  if (input.agencyKey === "gdpr_edpb") {
    return pick([
      { key: "consentEnforcementRiskScore", label: "Consent", score: input.risk.consentEnforcementRiskScore },
      { key: "privacyEnforcementRiskScore", label: "Privacy", score: input.risk.privacyEnforcementRiskScore },
      { key: "dataExposureRiskScore", label: "Data exposure", score: input.risk.dataExposureRiskScore }
    ]);
  }
  if (input.agencyKey === "cppa") {
    return pick([
      { key: "privacyEnforcementRiskScore", label: "Privacy", score: input.risk.privacyEnforcementRiskScore },
      { key: "consentEnforcementRiskScore", label: "Consent", score: input.risk.consentEnforcementRiskScore },
      { key: "consumerProtectionRiskScore", label: "Consumer protection", score: input.risk.consumerProtectionRiskScore }
    ]);
  }
  if (input.agencyKey === "doj_ada") {
    return pick([
      { key: "accessibilityEnforcementRiskScore", label: "Accessibility", score: input.risk.accessibilityEnforcementRiskScore }
    ]);
  }
  return pick([
    { key: "privacyEnforcementRiskScore", label: "Privacy", score: input.risk.privacyEnforcementRiskScore },
    { key: "dataExposureRiskScore", label: "Data exposure", score: input.risk.dataExposureRiskScore }
  ]);
}

export function buildAgencyMappings(source: AgencyMappingSource, risk: RegulatoryRiskAssessment | null = null) {
  const mappings = AGENCY_DEFINITIONS.map((agency) => {
    const triggeredSignals = agency.rules
      .filter((rule) => rule.when(source))
      .map((rule) => ({
        key: String(rule.key),
        label: rule.label
      }));
    const directScore = agency.rules.filter((rule) => rule.when(source)).reduce((total, rule) => total + rule.points, 0);
    const contributingSubscores = buildContributingSubscores({
      agencyKey: agency.agencyKey,
      risk
    });
    const relevanceScore =
      directScore + Math.round(contributingSubscores.reduce((total, subscore) => total + subscore.score, 0) / 35);
    const relevanceLevel = getRelevanceLevel(relevanceScore);

    if (!relevanceLevel) {
      return null;
    }

    return {
      agencyKey: agency.agencyKey,
      agencyLabel: agency.agencyLabel,
      shortLabel: agency.shortLabel,
      category: agency.category,
      relevanceLevel,
      relevanceScore,
      rationale: agency.rationale(triggeredSignals),
      helperLabel: agency.helperLabel,
      triggeredSignals,
      contributingSubscores,
      topAgencyRiskDrivers: Array.from(
        new Set([
          ...triggeredSignals.map((signal) => signal.label),
          ...contributingSubscores.map((subscore) => `${subscore.label} subscore`)
        ])
      ).slice(0, 3),
      relatedOverallRiskLevel: risk?.riskLevel ?? null,
      isPrimaryAgency: agency.isPrimaryAgency
    } satisfies AgencyMapping;
  }).filter((mapping): mapping is AgencyMapping => Boolean(mapping));

  return mappings.sort(compareMappings);
}
