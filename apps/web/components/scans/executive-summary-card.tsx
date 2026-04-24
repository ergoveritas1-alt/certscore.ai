import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import React from "react";
import {
  deriveExecutiveNarrativePresentation,
  formatTopFindingHeadline,
  type ExecutivePosture
} from "../../lib/scans/calibration-summary";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
type DomainBenchmarkCardData = {
  confidence: "low" | "medium" | "high";
  estimatedRankLabel: string;
  expectedCookiesBeforeConsent: number;
  expectedOverallScore: number;
  expectedThirdPartyRequests: number;
  industry: string;
  rationale: string;
} | null;

function formatFreshness(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Scan completed";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

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
  score: number;
  summary: string;
  toneClass: string;
  findings: string[];
  minimal?: boolean;
};

const FINANCIAL_CLAIMS_FINDING_IDS = new Set([
  "guaranteed_outcome_claim_detected",
  "earnings_claim_without_adjacent_disclosure",
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected",
  "financial_urgency_pressure_tactic_detected",
  "pricing_or_fee_transparency_unclear",
  "leveraged_or_high_risk_product_promotion"
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
    default:
      return finding.shortSummary;
  }
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
  score?: number;
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
    score,
    summary: input.summary,
    toneClass: input.toneClass ?? tone.toneClass
  } satisfies RegulatoryLens;
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
    regulatoryRisk?: RegulatoryRiskAssessment | null;
  }
): RegulatoryLens[] {
  const findingIds = new Set(findings.map((finding) => finding.id));
  const financialClaimFindings = findings.filter((finding) => FINANCIAL_CLAIMS_FINDING_IDS.has(finding.id));
  const trackingFinding =
    findings.find((finding) => finding.id === "pre_consent_tracking_detected") ??
    findings.find((finding) => finding.id === "third_party_tracking_pre_consent");
  const replayFinding = findings.find((finding) => finding.id === "session_recording_services_detected");
  const consentFinding =
    findings.find((finding) => finding.id === "consent_dark_patterns_detected") ??
    findings.find((finding) => finding.id === "asymmetric_consent_ui") ??
    findings.find((finding) => finding.id === "reject_option_missing_or_hidden") ??
    findings.find((finding) => finding.id === "forced_consent_interaction");
  const clarityFinding = findings.find((finding) => finding.id === "policy_clarity_risk");
  const hasTrackingConcern =
    findingIds.has("pre_consent_tracking_detected") || findingIds.has("third_party_tracking_pre_consent");
  const hasConsentConcern =
    findingIds.has("consent_dark_patterns_detected") ||
    findingIds.has("asymmetric_consent_ui") ||
    findingIds.has("reject_option_missing_or_hidden") ||
    findingIds.has("forced_consent_interaction");

  const privacyTrackingNotes = [
    trackingFinding ? trackingFinding.shortSummary : null,
    counts.beforeConsentCookieCount > 0 ? `${counts.beforeConsentCookieCount} cookies were observed before consent.` : null,
    consentFinding ? consentFinding.shortSummary : null,
    replayFinding ? replayFinding.shortSummary : null
  ].filter(Boolean) as string[];

  const cpraNotes = [
    trackingFinding ? trackingFinding.shortSummary : null,
    counts.thirdPartyRequestCount > 0 ? `${counts.thirdPartyRequestCount} third-party requests were observed on the initial path.` : null,
    replayFinding ? replayFinding.shortSummary : null,
    clarityFinding ? clarityFinding.shortSummary : null
  ].filter(Boolean) as string[];

  const ftcNotes = [
    consentFinding ? consentFinding.shortSummary : null,
    replayFinding ? replayFinding.shortSummary : null,
    trackingFinding ? trackingFinding.shortSummary : null
  ].filter(Boolean) as string[];

  const gdprScore = clampScore(
    84 -
      (hasTrackingConcern ? 32 : 0) -
      (counts.beforeConsentCookieCount > 0 ? 14 : 0) -
      (hasConsentConcern ? 16 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0)
  );
  const cpraScore = clampScore(
    82 -
      (hasTrackingConcern ? 24 : 0) -
      (counts.beforeConsentCookieCount > 0 ? 12 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0) -
      (findingIds.has("policy_clarity_risk") ? 8 : 0)
  );
  const ftcScore = clampScore(
    80 -
      (hasConsentConcern ? 24 : 0) -
      (hasTrackingConcern ? 18 : 0) -
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
      summary: hasTrackingConcern ? "Consent and pre-consent tracking risk is the main issue." : "No major consent-triggering issue surfaced in the top findings.",
      toneClass: gdprTone.toneClass
    },
    {
      acronym: "CCPA / CPRA",
      detailTitle: "Disclosure and downstream sharing issues",
      findings: cpraNotes,
      ratingLabel: cpraTone.label,
      score: cpraScore,
      summary: replayFinding || hasTrackingConcern ? "Third-party collection and disclosure posture drives this score." : "No strong sale/share-style signal surfaced in the top findings.",
      toneClass: cpraTone.toneClass
    },
    {
      acronym: "FTC",
      detailTitle: "Dark pattern and disclosure issues",
      findings: ftcNotes,
      ratingLabel: ftcTone.label,
      score: ftcScore,
      summary: hasConsentConcern ? "Choice architecture and disclosure clarity are the main FTC-style concerns." : "No strong unfairness/deception cue surfaced in the top findings.",
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
  const hasStrongAdaDriver = Boolean(dojAdaMapping?.triggeredSignals.some((signal) => strongAdaDriverLabels.has(signal.label)));
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
        ratingLabel: "Not applicable",
        score: 88,
        summary: "",
        toneClass: "border-slate-200 bg-slate-50 text-slate-700"
      })
    );

    if (financialClaimFindings.length > 0) {
      const financialFindings = financialClaimFindings.map((finding) => getFinancialClaimsFindingSummary(finding));
      const financialSeverityPenalty = financialClaimFindings.reduce((total, finding) => {
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
      const financialScore = clampScore(84 - financialSeverityPenalty - Math.max(0, financialClaimFindings.length - 1) * 6);
      const financialTone = buildTone(financialScore);

      lenses.push({
        acronym: "Financial & commercial claims",
        detailTitle: "Claims, urgency, and pricing disclosures",
        findings: financialFindings,
        ratingLabel: financialTone.label,
        score: financialScore,
        summary:
          financialClaimFindings.some((finding) => finding.id === "guaranteed_outcome_claim_detected") ||
          financialClaimFindings.some((finding) => finding.id === "earnings_claim_without_adjacent_disclosure")
            ? "High-confidence claims or earnings language surfaced without enough balancing disclosure."
            : "Commercial claims and pricing language should be reviewed for clearer qualification and disclosure.",
        toneClass: financialTone.toneClass
      });
    } else {
      lenses.push(
        buildMinimalRegulatoryLens({
          acronym: "Financial & commercial claims",
          detailTitle: "Claims, urgency, and pricing disclosures",
          ratingLabel: "Not applicable",
          score: 88,
          summary: "",
          toneClass: "border-slate-200 bg-slate-50 text-slate-700"
        })
      );
    }

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
    typeof wcagErrorCountTotal === "number" && wcagErrorCountTotal > 0 ? `Automated WCAG issues detected: ${wcagErrorCountTotal}` : null,
    typeof wcagKeyboardNavigationIssueCount === "number" && wcagKeyboardNavigationIssueCount > 0 ? "Keyboard navigation issues surfaced" : null,
    typeof wcagFormLabelErrorCount === "number" && wcagFormLabelErrorCount > 0 ? "Form labeling issues surfaced" : null,
    accessibilityStatementPresent === false ? "Accessibility statement not detected" : null,
    accessibilityClaimMismatchDetected === true ? "Accessibility claim mismatch surfaced" : null,
    typeof accessibilityLitigationRiskScore === "number" && accessibilityLitigationRiskScore >= 45
      ? `Elevated accessibility risk score (${accessibilityLitigationRiskScore})`
      : null,
    typeof adaDemandLetterProbability === "number" && adaDemandLetterProbability >= 45
      ? `Elevated ADA demand-letter exposure score (${adaDemandLetterProbability})`
      : null,
    typeof wcagMissingAltCount === "number" && wcagMissingAltCount >= 5 ? `${wcagMissingAltCount} missing alt-text issues surfaced` : null,
    ...normalizedAgencyFindingLabels,
    ...((dojAdaMapping?.contributingSubscores ?? []).map((subscore) => `${subscore.label} subscore ${subscore.score}`))
  ].filter(Boolean) as string[];

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

  if (financialClaimFindings.length > 0) {
    const financialFindings = financialClaimFindings.map((finding) => getFinancialClaimsFindingSummary(finding));
    const financialSeverityPenalty = financialClaimFindings.reduce((total, finding) => {
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
    const financialScore = clampScore(84 - financialSeverityPenalty - Math.max(0, financialClaimFindings.length - 1) * 6);
    const financialTone = buildTone(financialScore);

    lenses.push({
      acronym: "Financial & commercial claims",
      detailTitle: "Claims, urgency, and pricing disclosures",
      findings: financialFindings,
      ratingLabel: financialTone.label,
      score: financialScore,
      summary:
        financialClaimFindings.some((finding) => finding.id === "guaranteed_outcome_claim_detected") ||
        financialClaimFindings.some((finding) => finding.id === "earnings_claim_without_adjacent_disclosure")
          ? "High-confidence claims or earnings language surfaced without enough balancing disclosure."
          : "Commercial claims and pricing language should be reviewed for clearer qualification and disclosure.",
      toneClass: financialTone.toneClass
    });
  } else {
    lenses.push(
      buildMinimalRegulatoryLens({
        acronym: "Financial & commercial claims",
        detailTitle: "Claims, urgency, and pricing disclosures",
        ratingLabel: "Not applicable",
        score: 88,
        summary: "",
        toneClass: "border-slate-200 bg-slate-50 text-slate-700"
      })
    );
  }

  return lenses;
}

export function buildRegulatoryLensesFromUnifiedPackets(
  packets: UnifiedFindingDisplayPacket[],
  counts: Parameters<typeof buildRegulatoryLenses>[1],
  options?: Parameters<typeof buildRegulatoryLenses>[2]
) {
  return buildRegulatoryLenses(projectExecutiveFindingsFromUnifiedPackets(packets).findings, counts, options);
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

  if (input.finding.id === "access_limited_no_reliable_findings") {
    return (
      <svg viewBox="0 0 24 24" className={`${common} text-amber-700`} aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 12h6M12 9v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
          <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-slate-950">
            <pre className="max-w-full whitespace-pre-wrap break-words px-3 py-3 text-xs leading-5 text-slate-100">{jsonPayload}</pre>
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
    verifiedPublicSurfacesCount: input.verifiedPublicSurfacesCount
  });
  const regulatoryCounts = {
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    thirdPartyRequestCount: input.thirdPartyRequestCount
  };
  const regulatoryOptions = {
    accessibilitySignals: input.accessibilitySignals,
    agencyMappings: input.agencyMappings,
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
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                Scanned {formatFreshness(input.lastScannedAt)}
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
                    summary={`${vendorEvidence.length} vendor names and ${thirdPartyDomains.length} third-party domains`}
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
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{lens.acronym}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${lens.toneClass}`}>
                              {lens.ratingLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{lens.summary}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xl font-semibold tracking-tight text-slate-900">{lens.score}</p>
                          <RegulatoryRatingBar score={lens.score} toneClass={lens.toneClass} />
                          <p className="mt-1 text-slate-400 transition-transform group-open:rotate-180">⌄</p>
                        </div>
                      </summary>
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{lens.detailTitle}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {lens.findings.length > 0 ? (
                            lens.findings.map((item) => (
                              <span key={item} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                                {item}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
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
