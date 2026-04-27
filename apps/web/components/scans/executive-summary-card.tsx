import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import React from "react";
import {
  deriveExecutiveNarrativePresentation,
  formatTopFindingHeadline,
  type ExecutivePosture
} from "../../lib/scans/calibration-summary";
import { formatRepresentativeAccessibilityCoverage } from "../../lib/scans/accessibility-evidence";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import { CopyJsonButton } from "./copy-json-button";
type DomainBenchmarkCardData = {
  confidence: "low" | "medium" | "high";
  estimatedRankLabel: string;
  expectedCookiesBeforeConsent: number;
  expectedOverallScore: number;
  expectedThirdPartyRequests: number;
  industry: string;
  rationale: string;
} | null;

type UnifiedRegulatoryContext = {
  beforeConsentCookieEvidence?: Record<string, unknown> | null;
  beforeConsentCookieCount?: number;
  hasSensitiveGamblingTrackingRisk?: boolean;
  hasSensitiveHealthTrackingRisk?: boolean;
  hasTrackingConcern?: boolean;
  thirdPartyRequestCount?: number;
};

function getPostureClasses(posture: "Clear" | "Watch" | "Action Needed") {
  if (posture === "Action Needed") {
    return "border-rose-200 bg-rose-50/90 text-rose-950";
  }
  if (posture === "Watch") {
    return "border-amber-200 bg-amber-50/90 text-amber-950";
  }
  return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
}

function formatCategoryLabel(value: string) {
  return value.replaceAll("_", " ");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function DetailDisclosure(input: {
  items: string[];
  summary: string;
  title: string;
}) {
  const uniqueItems = [...new Set(input.items.filter(Boolean))];

  if (uniqueItems.length === 0) {
    return null;
  }

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-slate-700">
        <span>{input.summary}</span>
        <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{input.title}</p>
        <div className="flex flex-wrap gap-2">
          {uniqueItems.map((item) => (
            <span key={item} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              {item}
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}

type RegulatoryLens = {
  acronym: string;
  detailTitle: string;
  ratingLabel: string;
  score: number | null;
  summary: string;
  toneClass: string;
  findings: RegulatoryLensFinding[];
  minimal?: boolean;
};

type RegulatoryLensFinding = {
  evidence: Record<string, unknown>;
  id: string;
  label: string;
};

const FINANCIAL_CLAIMS_FINDING_IDS = new Set([
  "guaranteed_outcome_claim_detected",
  "earnings_claim_without_adjacent_disclosure",
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected",
  "financial_urgency_pressure_tactic_detected",
  "pricing_or_fee_transparency_unclear",
  "leveraged_or_high_risk_product_promotion",
  "regulatory_registration_disclosure_absent",
  "unsubstantiated_testimonial_near_performance_claim"
]);

function getFinancialClaimsFindingSummary(finding: CertScoreFinding) {
  switch (finding.id) {
    case "guaranteed_outcome_claim_detected":
      return "Guaranteed or certain-outcome claim surfaced.";
    case "earnings_claim_without_adjacent_disclosure":
      return "Earnings-style claim surfaced without nearby balancing disclosure.";
    case "simulated_performance_without_disclosure":
      return "Simulated or hypothetical performance language surfaced without nearby disclosure.";
    case "unqualified_superlative_claim_detected":
      return "Unqualified superiority or best-in-class claim surfaced.";
    case "financial_urgency_pressure_tactic_detected":
      return "Urgency language appears tied to a conversion step.";
    case "pricing_or_fee_transparency_unclear":
      return "Pricing or fee disclosure remains unclear near the offer path.";
    case "leveraged_or_high_risk_product_promotion":
      return "High-risk financial product promotion language surfaced.";
    case "regulatory_registration_disclosure_absent":
      return "Financial advisory or signal context surfaced without a visible registration disclosure.";
    case "unsubstantiated_testimonial_near_performance_claim":
      return "Testimonial or review language appeared near an unsubstantiated performance claim.";
    default:
      return finding.shortSummary;
  }
}

function buildFindingEvidencePayload(finding: CertScoreFinding, context?: Record<string, unknown>) {
  return {
    context,
    confidence: finding.confidence,
    directVsInferred: finding.directVsInferred,
    evidenceDetails: finding.evidenceDetails ?? null,
    evidencePreview: finding.evidencePreview,
    evidenceRefs: finding.evidenceRefs,
    findingId: finding.id,
    label: finding.label,
    section: finding.section,
    severity: finding.severity,
    shortSummary: finding.shortSummary
  };
}

function buildRegulatoryLensFinding(input: {
  evidence: Record<string, unknown>;
  id: string;
  label: string;
}) {
  return input satisfies RegulatoryLensFinding;
}

function buildRegulatoryLensFindingFromCertFinding(
  finding: CertScoreFinding,
  label = finding.shortSummary,
  context?: Record<string, unknown>
) {
  return buildRegulatoryLensFinding({
    evidence: buildFindingEvidencePayload(finding, context),
    id: finding.id,
    label
  });
}

function buildObservedCountLensFinding(input: {
  count: number;
  evidence?: Record<string, unknown> | null;
  id: string;
  label: string;
  metric: string;
  source: string;
}) {
  return buildRegulatoryLensFinding({
    evidence: {
      count: input.count,
      ...(input.evidence ?? {}),
      metric: input.metric,
      reason: input.label,
      source: input.source
    },
    id: input.id,
    label: input.label
  });
}

export type ExecutiveAccessLimitationNotice = {
  coverageLabel: string;
  headline: string;
  message: string;
  recommendationTitle: string;
  reason: string;
  title: string;
  whatThisMeans: string[];
  guidance: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function buildTone(score: number) {
  if (score >= 72) {
    return { label: "Strong", toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (score >= 50) {
    return { label: "Watch", toneClass: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  return { label: "Needs work", toneClass: "border-rose-200 bg-rose-50 text-rose-800" };
}

function buildMinimalRegulatoryLens(input: {
  acronym: string;
  detailTitle: string;
  ratingLabel?: string;
  score?: number | null;
  summary: string;
  toneClass?: string;
}) {
  const score = input.score ?? 88;
  const tone = buildTone(score);

  return {
    acronym: input.acronym,
    detailTitle: input.detailTitle,
    findings: [],
    minimal: true,
    ratingLabel: input.ratingLabel ?? tone.label,
    score: input.score === null ? null : score,
    summary: input.summary,
    toneClass: input.toneClass ?? tone.toneClass
  } satisfies RegulatoryLens;
}

function buildMinimalFinancialClaimsLens() {
  return buildMinimalRegulatoryLens({
    acronym: "Financial & commercial claims",
    detailTitle: "Claims, urgency, and pricing disclosures",
    ratingLabel: "Audit-only",
    score: null,
    summary: "",
    toneClass: "border-slate-200 bg-slate-50 text-slate-700"
  });
}

function buildFinancialClaimsLens(input: {
  findings: CertScoreFinding[];
  forceScored?: boolean;
}) {
  const financialFindings = input.findings.map((finding) =>
    buildRegulatoryLensFindingFromCertFinding(finding, getFinancialClaimsFindingSummary(finding), {
      lens: "Financial & commercial claims"
    })
  );

  if (financialFindings.length === 0) {
    return buildMinimalFinancialClaimsLens();
  }

  const financialSeverityPenalty = input.findings.reduce((total, finding) => {
    switch (finding.severity) {
      case "critical":
        return total + 24;
      case "high":
        return total + 20;
      case "medium":
        return total + 14;
      default:
        return total + 8;
    }
  }, 0);
  const financialScore = clampScore(84 - financialSeverityPenalty - Math.max(0, financialFindings.length - 1) * 6);
  const financialTone = buildTone(financialScore);

  return {
    acronym: "Financial & commercial claims",
    detailTitle: "Claims, urgency, and pricing disclosures",
    findings: financialFindings,
    ratingLabel: financialTone.label,
    score: financialScore,
    summary: input.findings.some((finding) => finding.id === "guaranteed_outcome_claim_detected") ||
      input.findings.some((finding) => finding.id === "earnings_claim_without_adjacent_disclosure")
      ? "High-confidence claims or earnings language surfaced without enough balancing disclosure."
      : "Commercial claims and pricing language should be reviewed for clearer qualification and disclosure.",
    toneClass: financialTone.toneClass
  } satisfies RegulatoryLens;
}

function hasFinancialRegulatoryBenchmark(value: string | null | undefined) {
  return /\b(?:forex|futures?|options?|crypto derivatives?|investment signals?|trading signals?|prop trading|funded accounts?|cfd|spread betting|financial advisory|investment newsletter|copy trading|signal service|funded account)\b/i.test(
    value ?? ""
  );
}

function AccessLimitationDetails(input: { notice: ExecutiveAccessLimitationNotice }) {
  return (
    <div className="space-y-3">
      <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50/70 px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Scan coverage</p>
        <p className="mt-2 text-sm font-semibold text-amber-950">{input.notice.coverageLabel}</p>
        <DetailDisclosure
          summary="Exact block reason"
          title="Retained access note"
          items={[input.notice.message, input.notice.reason]}
        />
      </div>
      <div className="rounded-[1.2rem] border border-amber-200 bg-white px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">What this means</p>
        <DetailDisclosure
          summary={`${input.notice.whatThisMeans.length} interpretation point${input.notice.whatThisMeans.length === 1 ? "" : "s"}`}
          title="Interpretation guidance"
          items={input.notice.whatThisMeans}
        />
      </div>
      <div className="rounded-[1.2rem] border border-amber-200 bg-white px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{input.notice.recommendationTitle}</p>
        <DetailDisclosure
          summary={`${input.notice.guidance.length} next step${input.notice.guidance.length === 1 ? "" : "s"}`}
          title="Recommended follow-up"
          items={input.notice.guidance}
        />
      </div>
    </div>
  );
}

export function buildRegulatoryLenses(
  findings: CertScoreFinding[],
  counts: {
    beforeConsentCookieCount: number;
    thirdPartyRequestCount: number;
  },
  options?: {
    accessibilitySignals?: {
      accessibilityClaimMismatchDetected?: boolean | null;
      accessibilityLitigationRiskScore?: number | null;
      accessibilityStatementPresent?: boolean | null;
      adaDemandLetterProbability?: number | null;
      ecommerceSiteLikely?: boolean | null;
      wcagErrorCountTotal?: number | null;
      wcagFormLabelErrorCount?: number | null;
      wcagKeyboardNavigationIssueCount?: number | null;
      wcagMissingAltCount?: number | null;
    } | null;
    agencyMappings?: AgencyMapping[];
    benchmarkIndustry?: string | null;
    regulatoryRisk?: RegulatoryRiskAssessment | null;
    unifiedContext?: UnifiedRegulatoryContext | null;
  }
): RegulatoryLens[] {
  const findingIds = new Set(findings.map((finding) => finding.id));
  const financialClaimFindings = findings.filter((finding) => FINANCIAL_CLAIMS_FINDING_IDS.has(finding.id));
  const financialRegulatoryBenchmarkActive =
    hasFinancialRegulatoryBenchmark(options?.benchmarkIndustry) ||
    financialClaimFindings.some((finding) =>
      finding.id === "regulatory_registration_disclosure_absent" ||
      finding.id === "leveraged_or_high_risk_product_promotion"
    );
  const trackingFinding =
    findings.find((finding) => finding.id === "pre_consent_tracking_detected") ??
    findings.find((finding) => finding.id === "third_party_tracking_pre_consent") ??
    findings.find((finding) => finding.id === "third_party_cookie_pre_consent") ??
    findings.find((finding) => finding.id === "analytics_cookie_pre_consent") ??
    findings.find((finding) => finding.id === "adtech_cookie_pre_consent") ??
    findings.find((finding) => /pre[- ]consent|before consent/i.test(`${finding.label} ${finding.shortSummary}`));
  const replayFinding = findings.find((finding) => finding.id === "session_recording_services_detected");
  const consentFinding =
    findings.find((finding) => finding.id === "consent_dark_patterns_detected") ??
    findings.find((finding) => finding.id === "asymmetric_consent_ui") ??
    findings.find((finding) => finding.id === "reject_option_missing_or_hidden") ??
    findings.find((finding) => finding.id === "forced_consent_interaction");
  const clarityFinding = findings.find((finding) => finding.id === "policy_clarity_risk");
  const hasTrackingConcern =
    options?.unifiedContext?.hasTrackingConcern ??
    (findingIds.has("pre_consent_tracking_detected") ||
      findingIds.has("third_party_tracking_pre_consent") ||
      findingIds.has("third_party_cookie_pre_consent") ||
      findingIds.has("analytics_cookie_pre_consent") ||
      findingIds.has("adtech_cookie_pre_consent") ||
      Boolean(trackingFinding));
  const beforeConsentCookieCount = options?.unifiedContext?.beforeConsentCookieCount ?? counts.beforeConsentCookieCount;
  const thirdPartyRequestCount = options?.unifiedContext?.thirdPartyRequestCount ?? counts.thirdPartyRequestCount;
  const hasPreConsentCookieConcern = beforeConsentCookieCount > 0;
  const hasConsentConcern =
    findingIds.has("consent_dark_patterns_detected") ||
    findingIds.has("asymmetric_consent_ui") ||
    findingIds.has("reject_option_missing_or_hidden") ||
    findingIds.has("forced_consent_interaction");
  const hasStrongDarkPatternConcern =
    findingIds.has("consent_dark_patterns_detected") || findingIds.has("asymmetric_consent_ui");
  const riskDriverKeys = new Set(options?.regulatoryRisk?.topRiskDrivers.map((driver) => driver.key) ?? []);
  const benchmarkHaystack = `${options?.benchmarkIndustry ?? ""} ${findings.map((finding) => `${finding.label} ${finding.shortSummary}`).join(" ")}`;
  const inferredGamblingContext = /\b(gambling|sports betting|sportsbook|casino|wager|betting)\b/i.test(benchmarkHaystack);
  const inferredHealthContext = /\b(health|medical|patient|symptom|condition|clinical)\b/i.test(benchmarkHaystack);
  const hasGamblingSensitiveContext =
    options?.unifiedContext?.hasSensitiveGamblingTrackingRisk === true || inferredGamblingContext;
  const hasHealthSensitiveContext =
    options?.unifiedContext?.hasSensitiveHealthTrackingRisk === true || inferredHealthContext;
  const hasGenericSensitiveTrackingRisk =
    riskDriverKeys.has("sensitive_context_tracking") ||
    riskDriverKeys.has("sensitive_context_preconsent");
  const hasSensitiveHealthTrackingRisk =
    options?.unifiedContext?.hasSensitiveHealthTrackingRisk ??
    (riskDriverKeys.has("health_identity_data_broker") ||
      riskDriverKeys.has("health_dmp_flow") ||
      riskDriverKeys.has("identity_data_broker_preconsent") ||
      riskDriverKeys.has("dmp_pre_consent") ||
      (hasGenericSensitiveTrackingRisk && hasHealthSensitiveContext && !hasGamblingSensitiveContext));
  const hasSensitiveGamblingTrackingRisk =
    options?.unifiedContext?.hasSensitiveGamblingTrackingRisk ??
    (hasGamblingSensitiveContext && (
      hasGenericSensitiveTrackingRisk ||
      findingIds.has("session_recording_services_detected") ||
      hasTrackingConcern
    ));

  const privacyTrackingNotes = [
    trackingFinding
      ? buildRegulatoryLensFindingFromCertFinding(trackingFinding, trackingFinding.shortSummary, {
          lens: "GDPR / ePrivacy",
          reason: "pre_consent_tracking"
        })
      : null,
    beforeConsentCookieCount > 0
      ? buildObservedCountLensFinding({
          count: beforeConsentCookieCount,
          evidence: options?.unifiedContext?.beforeConsentCookieEvidence,
          id: "before_consent_cookie_count",
          label: `${beforeConsentCookieCount} cookies were observed before consent.`,
          metric: "beforeConsentCookieCount",
          source: "regulatory_counts"
        })
      : null,
    replayFinding
      ? buildRegulatoryLensFindingFromCertFinding(replayFinding, replayFinding.shortSummary, {
          lens: "GDPR / ePrivacy",
          reason: "session_recording"
        })
      : null
  ].filter((item): item is RegulatoryLensFinding => Boolean(item));

  const cpraNotes = [
    trackingFinding
      ? buildRegulatoryLensFindingFromCertFinding(trackingFinding, trackingFinding.shortSummary, {
          lens: "CCPA / CPRA",
          reason: "pre_consent_tracking"
        })
      : null,
    thirdPartyRequestCount > 0
      ? buildObservedCountLensFinding({
          count: thirdPartyRequestCount,
          id: "third_party_request_count",
          label: `${thirdPartyRequestCount} third-party requests were observed on the initial path.`,
          metric: "thirdPartyRequestCount",
          source: "regulatory_counts"
        })
      : null,
    replayFinding
      ? buildRegulatoryLensFindingFromCertFinding(replayFinding, replayFinding.shortSummary, {
          lens: "CCPA / CPRA",
          reason: "session_recording"
        })
      : null,
    clarityFinding
      ? buildRegulatoryLensFindingFromCertFinding(clarityFinding, clarityFinding.shortSummary, {
          lens: "CCPA / CPRA",
          reason: "policy_clarity"
        })
      : null
  ].filter((item): item is RegulatoryLensFinding => Boolean(item));

  const ftcNotes = [
    consentFinding
      ? buildRegulatoryLensFindingFromCertFinding(consentFinding, consentFinding.shortSummary, {
          lens: "FTC",
          reason: "consent_choice_architecture"
        })
      : null,
    replayFinding
      ? buildRegulatoryLensFindingFromCertFinding(replayFinding, replayFinding.shortSummary, {
          lens: "FTC",
          reason: "session_recording"
        })
      : null,
    trackingFinding
      ? buildRegulatoryLensFindingFromCertFinding(trackingFinding, trackingFinding.shortSummary, {
          lens: "FTC",
          reason: "pre_consent_tracking"
        })
      : null
  ].filter((item): item is RegulatoryLensFinding => Boolean(item));

  const gdprScore = clampScore(
    84 -
      (hasTrackingConcern ? 32 : 0) -
      (beforeConsentCookieCount > 0 ? 14 : 0) -
      (hasConsentConcern ? (hasTrackingConcern || beforeConsentCookieCount > 0 ? 16 : 6) : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0)
  );
  const cpraScore = clampScore(
    82 -
      (hasTrackingConcern ? 24 : 0) -
      (beforeConsentCookieCount > 0 ? 12 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0) -
      (findingIds.has("policy_clarity_risk") ? 8 : 0)
  );
  const ftcScore = clampScore(
    80 -
      (hasConsentConcern ? 24 : 0) -
      (hasTrackingConcern ? 18 : 0) -
      (hasSensitiveHealthTrackingRisk ? 16 : 0) -
      (beforeConsentCookieCount > 0 ? 8 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0)
  );

  const gdprTone = buildTone(gdprScore);
  const cpraTone = buildTone(cpraScore);
  const ftcTone = buildTone(ftcScore);

  const lenses: RegulatoryLens[] = [
    {
      acronym: "GDPR / ePrivacy",
      detailTitle: "Consent and tracking issues",
      findings: privacyTrackingNotes,
      ratingLabel: gdprTone.label,
      score: gdprScore,
      summary: hasTrackingConcern || hasPreConsentCookieConcern
        ? "Consent and pre-consent tracking risk is the main issue."
        : "No major consent-triggering issue surfaced in the top findings.",
      toneClass: gdprTone.toneClass
    },
    {
      acronym: "CCPA / CPRA",
      detailTitle: "Disclosure and downstream sharing issues",
      findings: cpraNotes,
      ratingLabel: cpraTone.label,
      score: cpraScore,
      summary: replayFinding || hasTrackingConcern || hasPreConsentCookieConcern
        ? "Third-party collection and disclosure posture drives this score."
        : "No strong sale/share-style signal surfaced in the top findings.",
      toneClass: cpraTone.toneClass
    },
    {
      acronym: "FTC",
      detailTitle: hasStrongDarkPatternConcern ? "Dark pattern and disclosure issues" : "Choice architecture review signals",
      findings: ftcNotes,
      ratingLabel: ftcTone.label,
      score: ftcScore,
      summary: hasStrongDarkPatternConcern
        ? "Choice architecture and disclosure clarity are the main FTC-style concerns."
        : hasSensitiveGamblingTrackingRisk
          ? "High-risk gambling, financial-behavior, and advertising flows elevate FTC unfairness or deception risk."
        : hasSensitiveHealthTrackingRisk
          ? "Health-context tracking and advertising/data-broker flows elevate FTC unfairness or deception risk."
        : hasConsentConcern
          ? "Consent-choice design should be reviewed for clarity."
          : hasTrackingConcern || counts.beforeConsentCookieCount > 0
            ? "Pre-consent tracking and third-party collection should be reviewed for unfairness or deception risk."
            : "No strong unfairness/deception cue surfaced in the top findings.",
      toneClass: ftcTone.toneClass
    }
  ];

  const dojAdaMapping = options?.agencyMappings?.find((mapping) => mapping.agencyKey === "doj_ada");
  const accessibilitySignals = options?.accessibilitySignals ?? null;
  const accessibilityRiskScore = options?.regulatoryRisk?.accessibilityEnforcementRiskScore ?? null;
  const wcagErrorCountTotal = accessibilitySignals?.wcagErrorCountTotal ?? null;
  const wcagFormLabelErrorCount = accessibilitySignals?.wcagFormLabelErrorCount ?? null;
  const wcagKeyboardNavigationIssueCount = accessibilitySignals?.wcagKeyboardNavigationIssueCount ?? null;
  const wcagMissingAltCount = accessibilitySignals?.wcagMissingAltCount ?? null;
  const accessibilityStatementPresent = accessibilitySignals?.accessibilityStatementPresent ?? null;
  const accessibilityClaimMismatchDetected = accessibilitySignals?.accessibilityClaimMismatchDetected ?? null;
  const accessibilityLitigationRiskScore = accessibilitySignals?.accessibilityLitigationRiskScore ?? null;
  const adaDemandLetterProbability = accessibilitySignals?.adaDemandLetterProbability ?? null;
  const strongAdaDriverLabels = new Set([
    "Accessibility claim mismatch",
    "High automated WCAG issue count",
    "Keyboard navigation issues",
    "Form label accessibility issues",
    "Elevated accessibility risk",
    "Elevated ADA demand-letter exposure"
  ]);
  const hasStrongAdaDriver = Boolean(
    dojAdaMapping?.triggeredSignals.some(
      (signal) => strongAdaDriverLabels.has(signal.label) || signal.key === "accessibility.representative_axe_examples"
    )
  );
  const hasOnlyAccessibilityStatementMissingSignal =
    accessibilityStatementPresent === false &&
    accessibilityClaimMismatchDetected !== true &&
    !((typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal >= 20)) &&
    !((typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0)) &&
    !((typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0)) &&
    !((typeof wcagMissingAltCount === "number" && wcagMissingAltCount >= 5)) &&
    !((typeof accessibilityLitigationRiskScore === "number" && accessibilityLitigationRiskScore >= 45)) &&
    !((typeof adaDemandLetterProbability === "number" && adaDemandLetterProbability >= 45)) &&
    !((typeof accessibilityRiskScore === "number" && accessibilityRiskScore >= 45)) &&
    !hasStrongAdaDriver;
  const hasSignificantAccessibilitySignals =
    accessibilityClaimMismatchDetected === true ||
    (typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal >= 20) ||
    (typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0) ||
    (typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0) ||
    (typeof wcagMissingAltCount === "number" && wcagMissingAltCount >= 5) ||
    (typeof accessibilityLitigationRiskScore === "number" && accessibilityLitigationRiskScore >= 45) ||
    (typeof adaDemandLetterProbability === "number" && adaDemandLetterProbability >= 45) ||
    (typeof accessibilityRiskScore === "number" && accessibilityRiskScore >= 45);
  const shouldIncludeAdaLens =
    dojAdaMapping !== undefined &&
    (hasSignificantAccessibilitySignals || (hasStrongAdaDriver && !hasOnlyAccessibilityStatementMissingSignal));

  if (!shouldIncludeAdaLens) {
    lenses.push(
      buildMinimalRegulatoryLens({
        acronym: "DOJ / ADA accessibility",
        detailTitle: "Accessibility and digital access issues",
        ratingLabel: "Audit-only",
        score: null,
        summary: "",
        toneClass: "border-slate-200 bg-slate-50 text-slate-700"
      })
    );

    lenses.push(buildFinancialClaimsLens({
      findings: financialClaimFindings,
      forceScored: financialRegulatoryBenchmarkActive
    }));

    return lenses;
  }

  const hasDirectAccessibilityStatementFinding = accessibilityStatementPresent === false;
  const normalizedAgencyFindingLabels = (dojAdaMapping?.triggeredSignals ?? [])
    .map((signal) => signal.label)
    .filter((label) =>
      hasDirectAccessibilityStatementFinding
        ? !/accessibility statement (missing|not detected)/i.test(label)
        : true
    );

  const adaFindings = [
    typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal > 0
      ? buildObservedCountLensFinding({
          count: wcagErrorCountTotal,
          id: "wcag_error_count_total",
          label: `Automated WCAG issues detected: ${wcagErrorCountTotal}`,
          metric: "wcagErrorCountTotal",
          source: "accessibility_signals"
        })
      : null,
    typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0
      ? buildObservedCountLensFinding({
          count: wcagKeyboardNavigationIssueCount,
          id: "wcag_keyboard_navigation_issue_count",
          label: "Keyboard navigation issues surfaced",
          metric: "wcagKeyboardNavigationIssueCount",
          source: "accessibility_signals"
        })
      : null,
    typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0
      ? buildObservedCountLensFinding({
          count: wcagFormLabelErrorCount,
          id: "wcag_form_label_error_count",
          label: "Form labeling issues surfaced",
          metric: "wcagFormLabelErrorCount",
          source: "accessibility_signals"
        })
      : null,
    accessibilityStatementPresent === false
      ? buildRegulatoryLensFinding({
          evidence: { observed: false, signal: "accessibilityStatementPresent" },
          id: "accessibility_statement_not_detected",
          label: "Accessibility statement not detected"
        })
      : null,
    accessibilityClaimMismatchDetected === true
      ? buildRegulatoryLensFinding({
          evidence: { observed: true, signal: "accessibilityClaimMismatchDetected" },
          id: "accessibility_claim_mismatch",
          label: "Accessibility claim mismatch surfaced"
        })
      : null,
    typeof accessibilityLitigationRiskScore === "number" && accessibilityLitigationRiskScore >= 45
      ? buildObservedCountLensFinding({
          count: accessibilityLitigationRiskScore,
          id: "accessibility_litigation_risk_score",
          label: `Elevated accessibility risk score (${accessibilityLitigationRiskScore})`,
          metric: "accessibilityLitigationRiskScore",
          source: "accessibility_signals"
        })
      : null,
    typeof adaDemandLetterProbability === "number" && adaDemandLetterProbability >= 45
      ? buildObservedCountLensFinding({
          count: adaDemandLetterProbability,
          id: "ada_demand_letter_probability",
          label: `Elevated ADA demand-letter exposure score (${adaDemandLetterProbability})`,
          metric: "adaDemandLetterProbability",
          source: "accessibility_signals"
        })
      : null,
    typeof wcagMissingAltCount === "number" && wcagMissingAltCount >= 5
      ? buildObservedCountLensFinding({
          count: wcagMissingAltCount,
          id: "wcag_missing_alt_count",
          label: `${wcagMissingAltCount} missing alt-text issues surfaced`,
          metric: "wcagMissingAltCount",
          source: "accessibility_signals"
        })
      : null,
    ...normalizedAgencyFindingLabels.map((label, index) =>
      buildRegulatoryLensFinding({
        evidence: {
          agencyKey: dojAdaMapping?.agencyKey ?? "doj_ada",
          label,
          source: "agency_mapping"
        },
        id: `agency_signal_${index}`,
        label
      })
    ),
    ...((dojAdaMapping?.contributingSubscores ?? []).map((subscore) =>
      buildRegulatoryLensFinding({
        evidence: {
          key: subscore.key,
          label: subscore.label,
          score: subscore.score,
          source: "agency_mapping_subscore"
        },
        id: `agency_subscore_${subscore.key}`,
        label: `${subscore.label} subscore ${subscore.score}`
      })
    ))
  ].filter((item): item is RegulatoryLensFinding => Boolean(item));

  const adaScore = clampScore(100 - (accessibilityRiskScore ?? (dojAdaMapping?.relevanceLevel === "limited" ? 35 : 50)));
  const adaSummary =
    accessibilityClaimMismatchDetected === true
      ? "Accessibility claims appear inconsistent with observed barriers."
      : (typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal >= 20) ||
          (typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0) ||
          (typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0)
        ? "Accessibility barriers and disclosure gaps are the main issue."
        : adaScore >= 72
          ? "No significant issues found."
          : "Accessibility support and disclosure posture needs work.";
  const adaTone = buildTone(adaScore);

  lenses.push({
    acronym: "DOJ / ADA accessibility",
    detailTitle: "Accessibility and digital access issues",
    findings: adaFindings,
    ratingLabel: adaTone.label,
    score: adaScore,
    summary: adaSummary,
    toneClass: adaTone.toneClass
  });

  lenses.push(buildFinancialClaimsLens({
    findings: financialClaimFindings,
    forceScored: financialRegulatoryBenchmarkActive
  }));

  return lenses;
}

export function buildRegulatoryLensesFromUnifiedPackets(
  packets: UnifiedFindingDisplayPacket[],
  counts: Parameters<typeof buildRegulatoryLenses>[1],
  options?: Parameters<typeof buildRegulatoryLenses>[2]
) {
  const representativeAccessibilityPackets = packets.filter(
    (packet) =>
      packet.presentationDecision.status === "surface" &&
      packet.details?.family === "accessibility" &&
      packet.evidence?.flags?.includes("representative_accessibility_examples_retained")
  );
  const hasRepresentativeAccessibilityEvidence = representativeAccessibilityPackets.length > 0;
  const representativeAccessibilityCoverage = representativeAccessibilityPackets.reduce(
    (accumulator, packet) => {
      const packetCounts = packet.evidence?.counts ?? {};
      const packetEntities = packet.evidence?.entities ?? {};
      const exampleCount = packetCounts.representativeAxeExampleCount ?? 0;
      const pageCount = packetCounts.representativeAxePageCount ?? packet.evidence?.pageUrls?.length ?? 0;
      const ruleCount =
        packetCounts.representativeAxeRuleCount ??
        (packet.details?.family === "accessibility" ? packet.details.ruleExamples?.length : 0) ??
        0;
      const maxImpact = packetEntities.maxAxeImpact?.[0] ?? accumulator.maxImpact;

      return {
        distinctPageCount: Math.max(accumulator.distinctPageCount, pageCount),
        distinctRuleCount: Math.max(accumulator.distinctRuleCount, ruleCount),
        hasSevereExample: accumulator.hasSevereExample || /^(?:critical|serious|high)$/i.test(maxImpact ?? ""),
        maxImpact,
        representativeExampleCount: accumulator.representativeExampleCount + exampleCount
      };
    },
    {
      distinctPageCount: 0,
      distinctRuleCount: 0,
      hasSevereExample: false,
      maxImpact: null as string | null,
      representativeExampleCount: 0
    }
  );
  const representativeAccessibilitySummary =
    representativeAccessibilityCoverage.representativeExampleCount > 0
      ? formatRepresentativeAccessibilityCoverage(representativeAccessibilityCoverage)
      : null;
  const hasDojAdaMapping = options?.agencyMappings?.some((mapping) => mapping.agencyKey === "doj_ada") === true;
  const accessibilityOptions =
    hasRepresentativeAccessibilityEvidence
      ? {
          ...options,
          accessibilitySignals: {
            ...(options?.accessibilitySignals ?? {}),
            wcagErrorCountTotal:
              options?.accessibilitySignals?.wcagErrorCountTotal ??
              Math.max(representativeAccessibilityCoverage.representativeExampleCount, representativeAccessibilityPackets.length)
          },
          agencyMappings: [
            ...(hasDojAdaMapping
              ? (options?.agencyMappings ?? []).map((mapping) =>
                  mapping.agencyKey === "doj_ada"
                    ? {
                        ...mapping,
                        triggeredSignals: [
                          ...mapping.triggeredSignals,
                          {
                            key: "accessibility.representative_axe_examples",
                            label: representativeAccessibilitySummary ?? "Representative axe examples retained"
                          }
                        ],
                        topAgencyRiskDrivers: [
                          ...mapping.topAgencyRiskDrivers,
                          representativeAccessibilitySummary ?? "Representative automated accessibility examples were retained."
                        ]
                      }
                    : mapping
                )
              : [
                  ...(options?.agencyMappings ?? []),
                  {
                    agencyKey: "doj_ada",
                    agencyLabel: "U.S. Department of Justice ADA",
                    shortLabel: "DOJ / ADA",
                    category: "accessibility",
                    relevanceLevel: "moderate",
                    relevanceScore: 64,
                    rationale: "Representative automated accessibility examples were retained for surfaced ADA/WCAG review.",
                    helperLabel: "Accessibility evidence retained",
                    triggeredSignals: [
                      {
                        key: "accessibility.representative_axe_examples",
                        label: representativeAccessibilitySummary ?? "Representative axe examples retained"
                      }
                    ],
                    contributingSubscores: [{ key: "accessibility_examples", label: "Representative accessibility examples", score: 64 }],
                    topAgencyRiskDrivers: [
                      representativeAccessibilitySummary ?? "Representative automated accessibility examples were retained."
                    ],
                    relatedOverallRiskLevel: "moderate",
                    isPrimaryAgency: false
                  } satisfies AgencyMapping
                ])
          ]
        }
      : options;
  const surfacedPackets = packets.filter((packet) => packet.presentationDecision.status === "surface");
  const projection = projectExecutiveFindingsFromUnifiedPackets(packets);
  const surfacedText = surfacedPackets
    .flatMap((packet) => [
      packet.summary,
      packet.observedValue,
      ...(packet.evidence?.snippets ?? []),
      ...Object.values(packet.evidence?.entities ?? {}).flat()
    ])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  const packetDerivedBeforeConsentCookieCount = surfacedPackets.reduce((count, packet) => {
    const entities = packet.evidence?.entities ?? {};
    return count + Math.max(
      entities.preconsent_nonessential_cookie_names?.length ?? 0,
      entities.preconsent_cookie_names?.length ?? 0,
      entities.preconsentNonessentialCookieNames?.length ?? 0,
      entities.preconsentCookieNames?.length ?? 0
    );
  }, 0);
  const getPacketEntityStrings = (packet: UnifiedFindingDisplayPacket, keys: string[]) => {
    const entities = packet.evidence?.entities as Record<string, unknown> | undefined;
    return uniqueStrings(keys.flatMap((key) => {
      const value = entities?.[key];
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    }));
  };
  const consentTrackingPackets = surfacedPackets.filter((packet) => packet.unifiedFindingId === "preconsent_tracking");
  const beforeConsentCookieEvidence = {
    cookieNames: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, [
        "preconsent_nonessential_cookie_names",
        "preconsent_cookie_names",
        "preconsentNonessentialCookieNames",
        "preconsentCookieNames"
      ])
    )),
    cookieCategories: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_categories", "preconsentCookieCategories"])
    )),
    cookieTimingEvidence: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_timing_evidence", "preconsentCookieTimingEvidence"])
    )),
    cookieVendors: uniqueStrings(consentTrackingPackets.flatMap((packet) => [
      ...getPacketEntityStrings(packet, [
        "preconsent_cookie_initiator_vendors",
        "preconsentCookieInitiatorVendors",
        "preconsent_tracker_vendors",
        "preconsentTrackerVendors"
      ]),
      ...((packet.details && typeof packet.details === "object" && Array.isArray((packet.details as { vendors?: unknown }).vendors))
        ? (packet.details as { vendors: unknown[] }).vendors.filter((value): value is string => typeof value === "string")
        : [])
    ])),
    initiatorDomains: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_initiator_domains", "preconsentCookieInitiatorDomains"])
    )),
    initiatorUrls: uniqueStrings(consentTrackingPackets.flatMap((packet) =>
      getPacketEntityStrings(packet, ["preconsent_cookie_initiator_urls", "preconsentCookieInitiatorUrls"])
    )),
    sourceFindingIds: uniqueStrings(consentTrackingPackets.map((packet) => packet.unifiedFindingId))
  };
  const packetDerivedThirdPartyRequestCount = surfacedPackets.reduce((count, packet) => {
    const evidenceUrls = packet.evidence?.entities?.preconsent_tracker_evidence_urls?.length ??
      packet.evidence?.entities?.preconsentTrackerEvidenceUrls?.length ??
      0;
    return count + evidenceUrls;
  }, 0);
  const hasSensitiveHealthTrackingRisk =
    /health|medical|patient|symptom|condition|clinical/i.test(surfacedText) &&
    surfacedPackets.some((packet) => (
      packet.unifiedFindingId === "preconsent_tracking" ||
      packet.unifiedFindingId === "sensitive_data_collection_with_third_party_tracking_present"
    ));
  const hasSensitiveGamblingTrackingRisk =
    /gambling|sports betting|sportsbook|casino|wager|bonus bet|responsible gambling|1-800-gambler/i.test(surfacedText) &&
    surfacedPackets.some((packet) => (
      packet.unifiedFindingId === "preconsent_tracking" ||
      packet.unifiedFindingId === "session_replay_observed" ||
      packet.unifiedFindingId === "leveraged_or_high_risk_product_promotion"
    ));

  return buildRegulatoryLenses(
    projection.findings,
    {
      beforeConsentCookieCount: packetDerivedBeforeConsentCookieCount,
      thirdPartyRequestCount: packetDerivedThirdPartyRequestCount
    },
    {
      ...accessibilityOptions,
      regulatoryRisk: null,
      unifiedContext: {
        beforeConsentCookieEvidence,
        beforeConsentCookieCount: packetDerivedBeforeConsentCookieCount,
        hasSensitiveGamblingTrackingRisk,
        hasSensitiveHealthTrackingRisk,
        hasTrackingConcern: surfacedPackets.some((packet) => packet.unifiedFindingId === "preconsent_tracking"),
        thirdPartyRequestCount: packetDerivedThirdPartyRequestCount
      }
    }
  );
}

function RegulatoryRatingBar(input: { score: number; toneClass: string }) {
  const ratingBucket = Math.max(0, Math.min(5, input.score / 20));

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 5 }, (_, index) => {
        const segmentFill = Math.max(0, Math.min(1, ratingBucket - index));

        return (
          <span
            key={index}
            className="relative h-2.5 w-7 overflow-hidden rounded-full border border-slate-200 bg-slate-100"
          >
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${input.toneClass}`}
              style={{ width: `${segmentFill * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

function RegulatoryLensFindingCard(input: {
  finding: RegulatoryLensFinding;
  lens: Pick<RegulatoryLens, "acronym" | "detailTitle" | "ratingLabel" | "score" | "summary">;
}) {
  const evidencePayload = JSON.stringify(
    {
      evidence: input.finding.evidence,
      lens: {
        acronym: input.lens.acronym,
        detailTitle: input.lens.detailTitle,
        ratingLabel: input.lens.ratingLabel,
        score: input.lens.score,
        summary: input.lens.summary
      },
      reason: input.finding.label
    },
    null,
    2
  );

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
      <details className="group/json">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 leading-5">{input.finding.label}</span>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-400 hover:text-slate-700">
            <span className="sr-only">Show evidence JSON</span>
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M8 4 4 12l4 8" />
              <path d="M16 4l4 8-4 8" />
              <path d="M14 3 10 21" />
            </svg>
          </span>
        </summary>
        <div className="relative mt-2 w-full rounded-lg bg-slate-950">
          <CopyJsonButton
            payload={evidencePayload}
            label="Copy evidence JSON"
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 shadow-sm transition-colors hover:border-slate-500 hover:text-white"
          />
          <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words px-3 py-3 pr-12 text-[11px] leading-5 text-slate-100">
            {evidencePayload}
          </pre>
        </div>
      </details>
    </div>
  );
}

function BenchmarkMetricCard(input: {
  actualValue: number | null;
  benchmarkValue: number | null;
  label: string;
  maxValue?: number;
}) {
  const actualValue = typeof input.actualValue === "number" ? input.actualValue : null;
  const benchmarkValue = typeof input.benchmarkValue === "number" ? input.benchmarkValue : null;
  const dynamicScaleBase = Math.max(actualValue ?? 0, benchmarkValue ?? 0, 1);
  const scaleMax =
    input.maxValue ??
    Math.max(10, Math.ceil((dynamicScaleBase * 1.25) / 5) * 5);
  const actualRatio = Math.max(0, Math.min(1, (actualValue ?? 0) / scaleMax));
  const benchmarkRatio = benchmarkValue !== null ? Math.max(0, Math.min(1, benchmarkValue / scaleMax)) : null;
  const delta =
    actualValue !== null && benchmarkValue !== null ? actualValue - benchmarkValue : null;
  const tone =
    input.label === "Overall score"
      ? {
          card: "bg-white",
          rail: "bg-sky-100/90",
          fill: "bg-sky-500/85",
          marker: "bg-cyan-500 shadow-[0_0_0_3px_rgba(236,254,255,0.95)]",
          value: "text-slate-950",
          deltaPositive: "text-sky-700",
          deltaNegative: "text-cyan-700"
        }
      : input.label === "Third-party requests"
        ? {
            card: "bg-white",
            rail: "bg-amber-100/90",
            fill: "bg-amber-500/85",
            marker: "bg-orange-500 shadow-[0_0_0_3px_rgba(255,247,237,0.95)]",
            value: "text-slate-950",
            deltaPositive: "text-amber-700",
            deltaNegative: "text-orange-700"
          }
        : {
            card: "bg-white",
            rail: "bg-emerald-100/90",
            fill: "bg-emerald-500/82",
            marker: "bg-lime-500 shadow-[0_0_0_3px_rgba(247,254,231,0.95)]",
            value: "text-slate-950",
            deltaPositive: "text-emerald-700",
            deltaNegative: "text-lime-700"
          };

  return (
    <div className={`relative overflow-hidden rounded-[1.6rem] border border-slate-200 px-5 py-4 ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {input.label === "Overall score" ? (
            <>
              Overall
              <br />
              score
            </>
          ) : input.label === "Third-party requests" ? (
            <>
              Third-party
              <br />
              requests
            </>
          ) : (
            input.label
          )}
        </p>
        <span className="sr-only">{benchmarkValue !== null ? `Expected ${benchmarkValue}` : "Expected benchmark unavailable"}</span>
      </div>
      <div className="mt-5">
        <div className="flex items-end gap-1">
          <span className={`text-[3.2rem] font-semibold leading-none tracking-tight ${tone.value}`}>{actualValue ?? "—"}</span>
          {input.maxValue ? <span className="pb-1 text-[2rem] leading-none text-slate-500">/100</span> : null}
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className={`relative h-3 rounded-full ${tone.rail}`}>
          <div
            className={`absolute left-0 top-0 h-3 rounded-full ${tone.fill}`}
            style={{ width: `${Math.max(actualRatio * 100, actualValue === null ? 0 : 6)}%` }}
          />
          {benchmarkRatio !== null ? (
            <div
              className={`absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone.marker}`}
              style={{ left: `${benchmarkRatio * 100}%` }}
            />
          ) : null}
        </div>
        <div className="flex items-center text-[11px] text-slate-500">
          {delta !== null ? (
            <span className={delta > 0 ? tone.deltaPositive : delta < 0 ? tone.deltaNegative : "text-slate-500"}>
              {delta > 0 ? "+" : ""}
              {delta} vs expected
            </span>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ExecutiveMetricCard(input: {
  accent?: "sky" | "amber" | "emerald" | "slate";
  helper?: string | null;
  label: string;
  value: number | string | null;
}) {
  const tone =
    input.accent === "amber"
      ? {
          rail: "bg-amber-100/90",
          fill: "bg-amber-500/85"
        }
      : input.accent === "emerald"
        ? {
            rail: "bg-emerald-100/90",
            fill: "bg-emerald-500/82"
          }
        : input.accent === "slate"
          ? {
              rail: "bg-slate-200/90",
              fill: "bg-slate-500/80"
            }
          : {
              rail: "bg-sky-100/90",
              fill: "bg-sky-500/85"
            };

  const numericValue =
    typeof input.value === "number" && Number.isFinite(input.value)
      ? input.value
      : null;
  const width =
    numericValue === null
      ? 0
      : Math.max(8, Math.min(100, numericValue >= 100 ? 100 : numericValue));

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-slate-200 px-5 py-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{input.label}</p>
      </div>
      <div className="mt-5">
        <div className="flex items-end gap-1">
          <span className="text-[3.2rem] font-semibold leading-none tracking-tight text-slate-950">{input.value ?? "—"}</span>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className={`relative h-3 rounded-full ${tone.rail}`}>
          <div
            className={`absolute left-0 top-0 h-3 rounded-full ${tone.fill}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="flex items-center text-[11px] text-slate-500">
          <span>{input.helper ?? "\u00A0"}</span>
        </div>
      </div>
    </div>
  );
}

function getFindingReferenceLink(finding: CertScoreFinding) {
  if (finding.id === "third_party_tracking_pre_consent") {
    return {
      href: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/",
      label: "ICO guidance on cookies and similar technologies"
    };
  }

  if (finding.id === "session_recording_services_detected") {
    if (/microsoft clarity/i.test(finding.shortSummary)) {
      return {
        href: "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-masking",
        label: "Microsoft Clarity data masking guidance"
      };
    }

    return {
      href: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/online-tracking/guidance-for-consumer-internet-of-things-products-and-services/how-do-we-ensure-our-use-of-online-tracking-is-fair/",
      label: "ICO fairness guidance for online tracking"
    };
  }

  if (finding.id === "asymmetric_consent_ui" || finding.id === "consent_dark_patterns_detected") {
    return {
      href: "https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf",
      label: "FTC guidance on dark patterns"
    };
  }

  return null;
}

function getFindingFixText(finding: CertScoreFinding) {
  if (finding.id === "third_party_tracking_pre_consent") {
    return "Move non-essential analytics, adtech, and session-replay tags behind a consent gate. Load them only after an explicit accept signal and verify that the default page path produces zero third-party tracking requests before consent.";
  }

  if (finding.id === "session_recording_services_detected") {
    return "Either remove session replay from the public path or gate it behind consent. If it remains, enable masking for form fields, auth flows, and user-generated content, and add a plain-language disclosure naming the replay vendor and purpose.";
  }

  if (finding.id === "asymmetric_consent_ui") {
    return "Bring reject and settings up to the first layer, match the visual weight of accept, and avoid button color, size, or placement patterns that steer users toward one choice. Re-test the live banner after the CSS change, not just the design mock.";
  }

  return finding.remediation;
}

function getFindingCardTone(finding: CertScoreFinding, isFirst: boolean) {
  if (finding.severity === "critical" || isFirst) {
    return {
      card: "border-slate-200 bg-[linear-gradient(180deg,rgba(252,252,252,0.94),rgba(255,255,255,1))]",
      band: "bg-rose-200",
      severityBadge: "border-rose-200 bg-rose-50 text-rose-800",
      confidenceBadge: "border-slate-200 bg-white text-slate-700",
      summary: "border-slate-200 bg-white text-slate-900"
    };
  }

  if (finding.severity === "high") {
    return {
      card: "border-slate-200 bg-[linear-gradient(180deg,rgba(252,252,251,0.82),rgba(255,255,255,1))]",
      band: "bg-slate-200",
      severityBadge: "border-slate-200 bg-slate-50 text-slate-800",
      confidenceBadge: "border-slate-200 bg-white text-slate-700",
      summary: "border-slate-200 bg-slate-50/65 text-slate-900"
    };
  }

  return {
    card: "border-slate-200 bg-white",
    band: "bg-slate-200",
    severityBadge: "border-slate-200 bg-slate-50 text-slate-700",
    confidenceBadge: "border-slate-200 bg-white text-slate-700",
    summary: "border-slate-200 bg-slate-50/85 text-slate-800"
  };
}

function FindingTitleIcon(input: { finding: CertScoreFinding }) {
  const common = "h-4 w-4";

  if (input.finding.id === "pre_consent_tracking_detected") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-600`} aria-hidden="true">
        <path d="M4 12h4l2-4 4 8 2-4h4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (input.finding.id === "third_party_tracking_pre_consent") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-rose-600`} aria-hidden="true">
        <path d="M5 12h6m2 0h6M14 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (input.finding.id === "session_recording_services_detected") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <rect x="4" y="6" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 10.5l4-2.5v8l-4-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (input.finding.id === "consent_dark_patterns_detected" || input.finding.id === "asymmetric_consent_ui") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 3l7 3v6c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (input.finding.id === "reject_option_missing_or_hidden" || input.finding.id === "forced_consent_interaction") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (input.finding.id === "identifier_transmission_detected") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M7.5 14.5 14 8a3 3 0 1 1 4.2 4.2l-6.5 6.5a4.5 4.5 0 0 1-6.4-6.4l5.8-5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (input.finding.id === "device_data_collection_detected" || input.finding.id === "telemetry_rich_identification_observed") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 19h4M12 15.5V19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (
    input.finding.id === "analytics_cookie_pre_consent" ||
    input.finding.id === "adtech_cookie_pre_consent" ||
    input.finding.id === "third_party_cookie_pre_consent" ||
    input.finding.id === "storage_before_consent"
  ) {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 4a8 8 0 1 0 8 8c0-.7-.1-1.4-.3-2.1-.7.6-1.6 1.1-2.6 1.1-2.2 0-4-1.8-4-4 0-1 .4-1.9 1.1-2.6A8.2 8.2 0 0 0 12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="9" cy="10" r="1" fill="currentColor" />
        <circle cx="15" cy="13" r="1" fill="currentColor" />
        <circle cx="10.5" cy="15.5" r="1" fill="currentColor" />
      </svg>
    );
  }

  if (input.finding.id === "probable_fingerprinting") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 4c2.6 0 4.8 2.2 4.8 4.8v2.3c0 3.2-1.8 6.2-4.8 8.9-3-2.7-4.8-5.7-4.8-8.9V8.8C7.2 6.2 9.4 4 12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 11c.6-.9 1.4-1.4 2-1.4 1 0 1.8.8 1.8 1.8 0 1.3-.8 2-1.8 3.1-.8.9-1.2 1.7-1.4 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (input.finding.id === "leveraged_or_high_risk_product_promotion") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-slate-700`} aria-hidden="true">
        <path d="M12 3v12M7 9l5-5 5 5M5 21h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (input.finding.id === "access_limited_no_reliable_findings") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <path d="M12 4l8 14H4L12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 10v4M12 17h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={`${common} text-slate-600`} aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function FindingDetailDisclosure(input: { finding: CertScoreFinding }) {
  const reference = getFindingReferenceLink(input.finding);
  const jsonPayload = JSON.stringify(input.finding, null, 2);
  const tone = getFindingCardTone(input.finding, false);

  return (
    <details className={`group mt-3 rounded-xl border px-3 py-2 ${tone.summary}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium leading-5">
        <span>{input.finding.shortSummary}</span>
        <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why this matters</p>
          <p className="text-sm leading-6 text-slate-700">{input.finding.whyItMatters}</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">How to fix</p>
          <p className="text-sm leading-6 text-slate-700">{getFindingFixText(input.finding)}</p>
          {reference ? (
            <a
              href={reference.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
            >
              {reference.label}
            </a>
          ) : null}
        </div>
        <details className="group/json min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span>{"{}"} JSON evidence</span>
            <span className="text-slate-400 transition-transform group-open/json:rotate-180">⌄</span>
          </summary>
          <div className="relative mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-slate-950">
            <CopyJsonButton
              payload={jsonPayload}
              label="Copy evidence JSON"
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 shadow-sm transition-colors hover:border-slate-500 hover:text-white"
            />
            <pre className="max-w-full whitespace-pre-wrap break-words px-3 py-3 pr-12 text-xs leading-5 text-slate-100">{jsonPayload}</pre>
          </div>
        </details>
      </div>
    </details>
  );
}

export function ExecutiveSummaryCard(input: {
  accessLimitationNotice?: ExecutiveAccessLimitationNotice | null;
  allFindings?: CertScoreFinding[];
  accessibilitySignals?: {
    accessibilityClaimMismatchDetected?: boolean | null;
    accessibilityLitigationRiskScore?: number | null;
    accessibilityStatementPresent?: boolean | null;
    adaDemandLetterProbability?: number | null;
    ecommerceSiteLikely?: boolean | null;
    wcagErrorCountTotal?: number | null;
    wcagFormLabelErrorCount?: number | null;
    wcagKeyboardNavigationIssueCount?: number | null;
    wcagMissingAltCount?: number | null;
  } | null;
  agencyMappings?: AgencyMapping[];
  beforeConsentCookieCount: number;
  coverageLevel?: string | null;
  domainBenchmark: DomainBenchmarkCardData;
  finalHost: string | null;
  fingerprintReasons: string[];
  fingerprintLabel: string;
  fingerprintNarrative: string;
  landedOnDifferentHost: boolean;
  lastScannedAt: string;
  posture: "Clear" | "Watch" | "Action Needed";
  preConsentVendorNames: string[];
  requestedHost: string | null;
  regulatoryRisk?: RegulatoryRiskAssessment | null;
  resolvedVendorNames: string[];
  score: number | null;
  scanOutcome?: string | null;
  sessionReplayVendorNames: string[];
  thirdPartyRequestCount: number;
  thirdPartyDomains: string[];
  topFindings: CertScoreFinding[];
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
  trackerSummary: string;
  unifiedFindings?: UnifiedFindingDisplayPacket[];
  unresolvedVendorHosts: string[];
  vendorCategoryCounts: Record<string, number>;
  legalCoverageScore?: number | null;
  pagesScanned?: number | null;
  policyEnrichmentCount?: number | null;
  verifiedPublicSurfacesCount?: number | null;
  lightweightHeroMetrics?: Array<{
    accent?: "sky" | "amber" | "emerald" | "slate";
    helper?: string | null;
    label: string;
    value: number | string | null;
  }> | null;
}) {
  const suppressedTopFindingIds = new Set([
    "multi_vendor_tracking_detected",
    "large_third_party_footprint",
    "collection_endpoints_detected",
    "high_request_density"
  ]);
  const categorySummary = Object.entries(input.vendorCategoryCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key, count]) => `${formatCategoryLabel(key)} ${count}`)
    .join(" · ");
  const filteredTopFindings = input.topFindings.filter((finding) => !suppressedTopFindingIds.has(finding.id));
  const regulatoryFindingInput =
    Array.isArray(input.allFindings) && input.allFindings.length > 0 ? input.allFindings : input.topFindings;
  const primaryFindings = filteredTopFindings.slice(0, 5);
  const secondaryFindings = filteredTopFindings
    .slice(5, 8);
  const namedVendors = input.resolvedVendorNames.slice(0, 8);
  const thirdPartyDomains = input.thirdPartyDomains.slice(0, 9);
  const vendorMixDetails = input.topObservedEntities
    .slice(0, 6)
    .map((entity) => `${entity.label} · ${formatCategoryLabel(entity.category)} · ${entity.requestCount} req`);
  const fingerprintEvidence = input.fingerprintReasons.filter(Boolean);
  const vendorEvidence = [
    ...namedVendors,
    ...input.unresolvedVendorHosts.slice(0, Math.max(0, 8 - namedVendors.length))
  ];
  const executiveHeadline = input.accessLimitationNotice
    ? input.accessLimitationNotice.message
    : formatTopFindingHeadline(primaryFindings);
  const narrativePresentation = deriveExecutiveNarrativePresentation({
    accessLimitationNotice: input.accessLimitationNotice,
    executiveHeadline,
    finalHost: input.finalHost,
    coverageLevel: input.coverageLevel,
    legalCoverageScore: input.legalCoverageScore,
    pagesScanned: input.pagesScanned,
    policyEnrichmentCount: input.policyEnrichmentCount,
    posture: input.posture as ExecutivePosture,
    requestedHost: input.requestedHost,
    scanOutcome: input.scanOutcome,
    topFindingSections: primaryFindings.map((finding) => finding.section),
    verifiedPublicSurfacesCount: input.verifiedPublicSurfacesCount
  });
  const regulatoryCounts = {
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    thirdPartyRequestCount: input.thirdPartyRequestCount
  };
  const regulatoryOptions = {
    accessibilitySignals: input.accessibilitySignals,
    agencyMappings: input.agencyMappings,
    benchmarkIndustry: input.domainBenchmark?.industry ?? null,
    regulatoryRisk: input.regulatoryRisk
  };
  const regulatoryLenses = input.unifiedFindings
    ? buildRegulatoryLensesFromUnifiedPackets(input.unifiedFindings, regulatoryCounts, regulatoryOptions)
    : buildRegulatoryLenses(regulatoryFindingInput, regulatoryCounts, regulatoryOptions);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)]">
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.35fr_0.9fr] lg:px-8">
        <div className="space-y-5">
          <div className="rounded-[1.8rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.28)]">
            <div className="flex flex-wrap items-center gap-3">
              <span
                data-testid="executive-posture-badge"
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${getPostureClasses(input.posture)}`}
              >
                {input.posture}
              </span>
              {input.domainBenchmark ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600">
                  Benchmark: {input.domainBenchmark.industry}
                </span>
              ) : null}
            </div>
            <div className="mt-5 space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Executive readout</p>
                <h2
                  data-testid="executive-headline"
                  className="max-w-3xl text-[2rem] font-semibold leading-tight tracking-tight text-slate-950 lg:text-[2.5rem]"
                >
                  {narrativePresentation.headline}
                </h2>
              </div>
              <div
                data-testid="executive-summary-callout"
                className="rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-6 text-slate-700"
              >
                <span className="font-medium text-slate-950">{narrativePresentation.summaryLabel}</span>{" "}
                {narrativePresentation.summaryMessage}
              </div>
            </div>
          </div>
          {input.accessLimitationNotice ? null : input.lightweightHeroMetrics && input.lightweightHeroMetrics.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {input.lightweightHeroMetrics.slice(0, 3).map((metric) => (
                <ExecutiveMetricCard
                  key={metric.label}
                  accent={metric.accent}
                  helper={metric.helper}
                  label={metric.label}
                  value={metric.value}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <BenchmarkMetricCard
                label="Overall score"
                actualValue={input.score}
                benchmarkValue={input.domainBenchmark?.expectedOverallScore ?? null}
                maxValue={100}
              />
              <BenchmarkMetricCard
                label="Third-party requests"
                actualValue={input.thirdPartyRequestCount}
                benchmarkValue={input.domainBenchmark?.expectedThirdPartyRequests ?? null}
              />
              <BenchmarkMetricCard
                label="Cookies before consent"
                actualValue={input.beforeConsentCookieCount}
                benchmarkValue={input.domainBenchmark?.expectedCookiesBeforeConsent ?? null}
              />
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Top findings</p>
                <h2 data-testid="executive-findings-heading" className="text-2xl font-semibold tracking-tight text-slate-950 lg:text-[2.2rem]">
                  {narrativePresentation.findingsHeading}
                </h2>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {primaryFindings.length > 0 ? (
              primaryFindings.map((finding, index) => (
                <div key={finding.id} className={`overflow-hidden rounded-[1.4rem] border shadow-[0_12px_35px_-26px_rgba(15,23,42,0.18)] ${getFindingCardTone(finding, index === 0).card}`}>
                  <div className={`h-1 w-full ${getFindingCardTone(finding, index === 0).band}`} />
                  <div className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${getFindingCardTone(finding, index === 0).severityBadge}`}>
                      {finding.severity}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${getFindingCardTone(finding, index === 0).confidenceBadge}`}>
                      {finding.confidence === "strong" ? "Strong evidence" : finding.confidence === "good" ? "Good evidence" : "Moderate evidence"}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                      <FindingTitleIcon finding={finding} />
                    </div>
                    <p data-testid="executive-finding-label" className="pt-0.5 text-[17px] font-semibold leading-5 tracking-[-0.02em] text-slate-950">
                      {finding.label}
                    </p>
                  </div>
                  <FindingDetailDisclosure finding={finding} />
                </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                No headline issue crossed the executive threshold for this scan. Review the supporting evidence below for lower-priority signals and scan context.
              </div>
            )}
          </div>
          {secondaryFindings.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {secondaryFindings.map((finding) => (
                <div key={finding.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{finding.severity}</p>
                  <p className="mt-2 text-sm font-semibold tracking-tight text-slate-950">{finding.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.72))] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]">
          {input.accessLimitationNotice ? (
            <>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scan coverage</p>
                <p className="text-sm leading-6 text-slate-600">
                  This run was blocked before it established a trustworthy public browsing path, so normal privacy findings were not retained.
                </p>
              </div>
              <AccessLimitationDetails notice={input.accessLimitationNotice} />
            </>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal snapshot</p>
                <p className="text-sm leading-6 text-slate-600">Quick context for vendor footprint, fingerprinting, and regulator-style review.</p>
              </div>
              <div className="space-y-3">
                <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tracker footprint</p>
                  <p className="mt-2 text-sm text-slate-800">{input.trackerSummary}</p>
                  <DetailDisclosure
                    summary={`${vendorEvidence.length} vendor names and ${input.thirdPartyDomains.length} third-party domains`}
                    title="Observed vendors and domains"
                    items={[...vendorEvidence, ...thirdPartyDomains]}
                  />
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Fingerprinting</p>
                  <p className="mt-2 text-sm text-slate-800">{input.fingerprintNarrative}</p>
                  <DetailDisclosure
                    summary={`${fingerprintEvidence.length} fingerprint indicators retained`}
                    title="Fingerprint evidence"
                    items={fingerprintEvidence}
                  />
                </div>
              </div>
              {categorySummary ? (
                <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vendor mix</p>
                  <p className="mt-2 text-sm text-slate-800">{categorySummary}</p>
                  <DetailDisclosure
                    summary={`${input.topObservedEntities.length} named entities, ${Object.keys(input.vendorCategoryCounts).length} categories`}
                    title="Category and entity detail"
                    items={[
                      ...Object.entries(input.vendorCategoryCounts).map(([key, count]) => `${formatCategoryLabel(key)} · ${count}`),
                      ...vendorMixDetails,
                      ...input.preConsentVendorNames.slice(0, 3).map((vendor) => `${vendor} · pre-consent`),
                      ...input.sessionReplayVendorNames.slice(0, 3).map((vendor) => `${vendor} · session replay`)
                    ]}
                  />
                </div>
              ) : null}
              <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Regulatory findings</p>
                <div className="mt-3 space-y-3">
                  {regulatoryLenses.map((lens) => (
                    <details key={lens.acronym} className="group rounded-xl border border-slate-200 bg-slate-50/75 px-3 py-3">
                      <summary className="relative grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-3 gap-y-2">
                        <div className="min-w-0 self-start">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{lens.acronym}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${lens.toneClass}`}>
                              {lens.ratingLabel}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 self-start text-right">
                          <p className="text-xl font-semibold tracking-tight text-slate-900">{lens.score ?? "—"}</p>
                          {typeof lens.score === "number" ? (
                            <RegulatoryRatingBar score={lens.score} toneClass={lens.toneClass} />
                          ) : null}
                        </div>
                        <p className="col-span-2 min-w-0 pr-6 text-xs leading-5 text-slate-600">{lens.summary}</p>
                        <p className="absolute bottom-0 right-0 text-right text-slate-400 transition-transform group-open:rotate-180">⌄</p>
                      </summary>
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{lens.detailTitle}</p>
                        <div className="mt-2 space-y-2">
                          {lens.findings.length > 0 ? (
                            lens.findings.map((item) => (
                              <RegulatoryLensFindingCard
                                key={`${lens.acronym}-${item.id}-${item.label}`}
                                finding={item}
                                lens={lens}
                              />
                            ))
                          ) : (
                            <span className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
                              No top-level issue mapped here
                            </span>
                          )}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
