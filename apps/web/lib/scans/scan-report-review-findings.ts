import {
  type PreviewSampleFinding,
  type ReportSignalDefinition
} from "@website-signal-risk-scanner/shared";
import {
  isRightsFrictionSignal,
  shouldSurfacePrimarySignalFinding
} from "./finding-evidence-gates";
import {
  buildAccessibilitySupportFallbackEvidence,
  buildChildContextFallbackEvidence,
  buildCookiePolicyFallbackEvidence,
  buildSnapshotDisclosureFallbackEvidence,
  isChildContextSignalKey
} from "./signal-fallback-evidence";
import { getHybridSignalFallbackEvidence } from "./hybrid-runtime-evidence";
import {
  findMergedSignalValue,
  isSignalValuePopulated
} from "./report-signal-values";
import {
  getPolicyPositiveSignalSpec,
  isPolicyPositiveSignalKey,
  isPrivacyRightsSignalKey
} from "./policy-positive-signal-contract";
import {
  isMeaningfulPolicyText,
  normalizePolicySnippetList
} from "./policy-snippet-normalization";
import {
  getPolicyEvidenceSnippets,
  getPolicyEvidenceSnippetValues,
  getPolicyDsarMechanism,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicyRightsSignals,
  getPolicySummaryText
} from "./policy-enrichment-row";
import {
  type ContradictionEvidenceBundle,
  type PolicyBehaviorConflictClaimType,
  type PolicyBehaviorConflictType,
  type PolicyBehaviorRuntimeObservationType,
  type RuntimeObservationPhase
} from "./contradiction-evidence-contract";
import {
  findValidationFindingForKeys,
  getValidationMatchKeysForReviewReason,
  getValidationMatchKeysForSignal,
  getValidationMatchKeysForTitle,
  type ScanValidationFinding
} from "./validation-review-linking";
import {
  deriveHighRiskTrackingContext,
  formatHighRiskVendorSummary
} from "./high-risk-tracking-context";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function formatCompactValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Not observed";
    }

    if (value.length <= 3) {
      return value.join(", ");
    }

    return `${value.slice(0, 3).join(", ")} +${value.length - 3} more`;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export type PolicyBehaviorContradiction = {
  claim: string;
  evidence: string[];
  observedBehavior: string;
  policyPageUrl: string | null;
  policyClaimType?: PolicyBehaviorConflictClaimType | null;
  policyConfidence?: number | null;
  policyExtractionStatus?: string | null;
  policySnippet: string | null;
  policySummary: string | null;
  relatedVendors: string[];
  runtimeConfidence?: number | null;
  runtimeObservationType?: PolicyBehaviorRuntimeObservationType | null;
  runtimePhase?: RuntimeObservationPhase;
  runtimeScriptHosts?: string[];
  runtimeSummary: string;
  runtimeVendors: string[];
  conflictReasoning?: string | null;
  conflictSupportsPromotion?: boolean;
  conflictType?: PolicyBehaviorConflictType | null;
  supportingSignals: string[];
  severity: "high" | "medium";
  status: "contradiction" | "violation risk" | "likely contradiction";
  title: string;
};

export type AccessibilityIssueRow = {
  count: number;
  description: string;
  key: string;
  label: string;
};

export type PreconsentViolationRow = {
  evidenceUrls: string[];
  scriptHost?: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type AccessibilityRuleEvidenceRow = {
  description: string | null;
  help: string | null;
  helpUrl: string | null;
  pageUrl: string | null;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  weightedPriority: number;
};

export type ScanReportReviewIssueRow = {
  description: string;
  key: string;
  pageType: string;
  pageUrl: string | null;
  reason: string;
  reviewStatus: string;
  reviewVerdict: unknown;
  summary: unknown;
};

export type CanonicalReviewIssue = {
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationRuleKeys?: string[];
  severity: "high" | "medium" | "low";
  title: string;
};

export type CanonicalReviewFinding = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  id: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: "high" | "medium" | "low";
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalDefinition["source"];
  sourceType: "issue" | "signal";
  title: string;
};

export type CanonicalSignalItem = {
  key: string;
  label: string;
  relation: "primary" | "secondary" | "overlay";
  source: ReportSignalDefinition["source"];
  value: unknown;
};

function isConcerningSignal(key: string, value: unknown) {
  if (!isSignalValuePopulated(key, value)) {
    return false;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /fingerprinting/,
    /gpc_signal_not_honored/,
    /weak_cookie_security_attributes_detected/,
    /conflict/,
    /mismatch/,
    /litigation_risk_score/,
    /error_count/,
    /warning_count/,
    /issue_count/,
    /failures_count/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/,
    /retargeting_pixel/,
    /session_replay/,
    /popup_behavior/,
    /autoplay_media/,
    /overlay_blocking/,
    /functional_misalignment/,
    /technical_disclosure/,
    /disclosure_gap/,
    /surface_missing/,
    /fetch_failed/,
    /extraction_limited/,
    /bounded_search/,
    /structurally_obstructed/,
    /likely_obstructed/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/,
    /children_audience_likely/,
    /kid_directed_content_detected/,
    /form_collects_birthdate/,
    /policyChildrenReference/
  ];

  if (negativePatterns.some((pattern) => pattern.test(key))) {
    return true;
  }

  if (
    isPolicyPositiveSignalKey(key) ||
    /accessibility_contact_method_present|affiliate_disclosure_present|disclosure\.privacy_policy_present|disclosure\.terms_of_service_present|disclosure\.cookie_policy_present|disclosure\.contact_page_present|privacy\.do_not_sell_link_present/i.test(
      key
    )
  ) {
    return true;
  }

  if (typeof value === "number") {
    if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
      return value > 0;
    }
    if (/window_days/i.test(key)) {
      return false;
    }
  }

  return false;
}

function getSignalConcernReason(key: string, value: unknown) {
  if (!isConcerningSignal(key, value)) {
    return null;
  }

  if (/preconsent|tracking_before_consent/i.test(key)) {
    return "Observed before a clear user choice was made.";
  }
  if (/fingerprinting/i.test(key)) {
    return "Observed coordinated browser or device attribute collection consistent with fingerprinting review risk.";
  }
  if (/gpc_signal_not_honored/i.test(key)) {
    return "A browser-level opt-out preference signal appears not to have been honored during the scan.";
  }
  if (/popup_behavior|autoplay_media|overlay_blocking/i.test(key)) {
    return "Observed intrusive or blocking runtime behavior that may interfere with normal page use.";
  }
  if (/children_audience_likely|kid_directed_content_detected|form_collects_birthdate|policyChildrenReference/i.test(key)) {
    return "The scan flagged age-related or youth-directed context that may raise children’s privacy review expectations.";
  }
  if (/weak_cookie_security_attributes_detected/i.test(key)) {
    return "Observed cookies appear to rely on weaker security attributes than expected.";
  }
  if (/surface_missing/i.test(key)) {
    return "A key disclosure or support page surface was not detected during the scan.";
  }
  if (/fetch_failed/i.test(key)) {
    return "A key disclosure or support page was linked from the scanned site, but automated retrieval of that target was limited during the scan.";
  }
  if (/extraction_limited/i.test(key)) {
    return "A key disclosure page was linked and fetched, but the retrieved content was too limited for reliable automated extraction on its own.";
  }
  if (/key_page_discovery_unresolved_after_bounded_search/i.test(key)) {
    return "The scanner exhausted its bounded key-page discovery budget without confirming one or more expected legal or support pages.";
  }
  if (/cookie_policy_structurally_obstructed/i.test(key)) {
    return "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence.";
  }
  if (/conflict|mismatch/i.test(key)) {
    return "Signals a contradiction or mismatch that merits direct review.";
  }
  if (/dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present/i.test(key)) {
    return "Promotional or choice architecture may need closer disclosure review.";
  }
  if (/affiliate_disclosure_present/i.test(key)) {
    return "The scan retained a clear affiliate disclosure path that signals when recommendations or links may involve a financial relationship.";
  }
  if (/disclosure\.privacy_policy_present/i.test(key)) {
    return "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.";
  }
  if (/disclosure\.terms_of_service_present/i.test(key)) {
    return "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.";
  }
  if (/disclosure\.cookie_policy_present/i.test(key)) {
    return "The scan retained a reachable cookie-policy or cookie-settings surface that users can use to find tracking disclosures and related controls.";
  }
  if (/disclosure\.contact_page_present/i.test(key)) {
    return "The scan retained a reachable contact or feedback path that users can use when they need help or want to reach the operator.";
  }
  if (/privacy\.do_not_sell_link_present/i.test(key)) {
    return "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.";
  }

  const policyPositiveSpec = getPolicyPositiveSignalSpec(key);
  if (policyPositiveSpec?.unifiedFindingId === "privacy_rights_path_present") {
    return "The scan retained a clear policy-based privacy-rights request path that users can rely on when seeking access, deletion, export, or related controls.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "gpc_disclosure_present") {
    return "The scan retained a disclosure indicating how the site says it handles Global Privacy Control or similar browser-level opt-out signals.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "tracking_technologies_disclosure_present") {
    return "The scan retained a disclosure describing cookies, pixels, tags, beacons, scripts, or similar tracking technologies used on the site.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "targeted_advertising_disclosure_present") {
    return "The scan retained a disclosure describing targeted advertising, sale, or sharing practices and related user controls.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "behavioral_analytics_disclosure_present") {
    return "The scan retained a disclosure describing behavioral analytics, session-observation, or replay-style tooling on at least some pages.";
  }
  if (/accessibility_contact_method_present/i.test(key)) {
    return "The scan retained a visible accessibility support or accommodation path that users can use when they need help.";
  }
  if (policyPositiveSpec?.unifiedFindingId === "arbitration_clause_present") {
    return "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.";
  }
  if (/store_credit_only/i.test(key)) {
    return "Post-purchase remedy may be more restrictive than expected.";
  }
  if (/termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "Terms reserve restrictive enforcement rights that should be read directly.";
  }
  if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
    return "Scanner-derived risk indicator is elevated.";
  }
  if (/error_count|warning_count|issue_count|failures_count/i.test(key)) {
    return "Automated issues were surfaced in this area.";
  }

  return "This signal is worth reviewer attention.";
}

export function formatReviewIssueReason(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Possible policy-to-behavior conflict";
    case "session_replay_without_disclosure_detected":
      return "Possible undisclosed session replay";
    case "missing_dsar_high_exposure":
      return "Possible missing DSAR path";
    case "low_confidence_critical_fields":
      return "Low-confidence policy extraction";
    default:
      return reason.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function formatReviewIssueDescription(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Observed site behavior may conflict with the site’s public-facing policy language.";
    case "session_replay_without_disclosure_detected":
      return "Session replay behavior may be present without a clear matching disclosure in the scanned policy pages.";
    case "missing_dsar_high_exposure":
      return "The site may have elevated exposure while still lacking a clear DSAR path in policy disclosures.";
    case "low_confidence_critical_fields":
      return "Critical policy extraction fields were low confidence and need manual review in the scan report.";
    default:
      return `This issue was added to the scan report review queue under ${formatReviewIssueReason(reason)}.`;
  }
}

export function buildSectionReviewIssues(input: {
  accessibilityIssueRows: AccessibilityIssueRow[];
  consentAuditFindings: PreviewSampleFinding[];
  policyBehaviorContradictions: PolicyBehaviorContradiction[];
  preconsentViolationRows: PreconsentViolationRow[];
  runtimeArtifacts: Record<string, unknown> | null;
  scanReportReviewIssues: ScanReportReviewIssueRow[];
  sectionId: string;
  snapshot: Record<string, unknown>;
}) {
  const issues: CanonicalReviewIssue[] = [];

  if (input.sectionId === "policy_clarity_consistency_review") {
    issues.push(
      ...input.policyBehaviorContradictions.map((row) => {
        const runtimeRequestUrls = uniqueStrings(row.evidence.filter((value) => /^https?:\/\//i.test(value)));
        const runtimeScriptHosts = uniqueStrings(row.runtimeScriptHosts ?? []);
        const policyAnchorPresent = Boolean(row.policyClaimType && row.policySnippet && row.policyPageUrl);
        const runtimeAnchorPresent = Boolean(row.runtimeObservationType && runtimeRequestUrls.length > 0 && row.runtimeVendors.length > 0);
        const conflictBridgePresent = Boolean(row.conflictType && row.conflictSupportsPromotion === true);
        const promotionEligible = policyAnchorPresent && runtimeAnchorPresent && conflictBridgePresent;
        const reviewStatus = promotionEligible ? "complete" : "insufficient_evidence_for_policy_behavior_conflict";

        return {
          description: row.observedBehavior,
          evidence: row.evidence,
          fallbackEvidence: {
            contradictionEvidence: {
              claim: row.claim,
              contradictionBasis: row.status,
              conflictBridge: {
                conflictType: row.conflictType ?? null,
                reasoning: row.conflictReasoning ?? row.runtimeSummary,
                supportsPromotion: row.conflictSupportsPromotion === true
              },
              evidenceSufficiency: {
                conflictBridgePresent,
                policyAnchorPresent,
                promotionEligible,
                reviewStatus,
                runtimeAnchorPresent
              },
              explicitPolicySnippet: row.policySnippet ?? null,
              policyAnchor: {
                claimType: row.policyClaimType ?? null,
                confidence: row.policyConfidence ?? null,
                extractionStatus: row.policyExtractionStatus ?? null,
                normalizedClaim: row.claim,
                snippet: row.policySnippet ?? row.claim,
                sourceUrl: row.policyPageUrl
              },
              policySnippet: row.policySnippet ?? row.claim,
              policySourceUrl: row.policyPageUrl,
              policySummaryShort: row.policySummary,
              relatedVendors: row.relatedVendors,
              runtimeAnchor: {
                confidence: row.runtimeConfidence ?? null,
                cookies: [],
                observationType: row.runtimeObservationType ?? null,
                phase: row.runtimePhase ?? "unknown",
                requests: runtimeRequestUrls,
                sourceUrl: row.policyPageUrl,
                storageArtifacts: runtimeScriptHosts.map((host) => `script_host:${host}`),
                vendors: row.runtimeVendors
              },
              runtimeEvidenceArtifacts: uniqueStrings([
                ...row.evidence,
                ...runtimeScriptHosts.map((host) => `script_host:${host}`)
              ]),
              runtimeSummary: row.runtimeSummary,
              runtimeVendors: row.runtimeVendors,
              sourceUrls: row.policyPageUrl ? [row.policyPageUrl] : [],
              supportingSignals: row.supportingSignals
            } satisfies ContradictionEvidenceBundle,
            claim: row.claim,
            pageUrl: row.policyPageUrl,
            policySnippets: row.policySnippet ? [row.policySnippet] : [],
            policySummaryShort: row.policySummary,
            relatedVendors: row.relatedVendors,
            requestUrls: runtimeRequestUrls,
            runtimeEvidenceArtifacts: uniqueStrings([
              ...row.evidence,
              ...runtimeScriptHosts.map((host) => `script_host:${host}`)
            ]),
            runtimeEvidenceUrls: runtimeRequestUrls,
            preconsent_tracker_script_hosts: runtimeScriptHosts,
            runtimeSummary: row.runtimeSummary,
            runtimeVendors: row.runtimeVendors,
            sourceUrls: row.policyPageUrl ? [row.policyPageUrl] : [],
            supportingSignals: row.supportingSignals
          },
          severity: row.severity,
          title: row.title
        };
      })
    );

    issues.push(
      ...dedupeReviewIssues(
        input.scanReportReviewIssues.map((row) => {
          const reviewSeverity: CanonicalReviewIssue["severity"] =
            row.reason === "policy_behavior_conflict_candidate" ? "high" : "medium";

          return {
            description: row.description,
            evidence: row.pageUrl ? [row.pageUrl] : [],
            linkedValidationRuleKeys: getValidationMatchKeysForReviewReason(row.reason),
            severity: reviewSeverity,
            title: formatReviewIssueReason(row.reason)
          };
        })
      )
    );
  }

  if (input.sectionId === "tracking_third_party_ecosystem" && input.preconsentViolationRows.length > 0) {
    const preconsentEvidenceUrls = uniqueStrings(
      input.preconsentViolationRows.flatMap((row) => row.evidenceUrls)
    );
    const preconsentScriptHosts = uniqueStrings(input.preconsentViolationRows.map((row) => row.scriptHost));
    const preconsentVendors = uniqueStrings(input.preconsentViolationRows.map((row) => row.vendorName));
    const highRiskContext = deriveHighRiskTrackingContext({
      hostname:
        typeof input.snapshot?.registered_domain === "string"
          ? input.snapshot.registered_domain
          : typeof input.snapshot?.final_url === "string"
            ? input.snapshot.final_url
            : null,
      snapshot: input.snapshot,
      runtimeArtifacts: input.runtimeArtifacts,
      evidenceUrls: preconsentEvidenceUrls
    });
    const highRiskVendorSummary = formatHighRiskVendorSummary(highRiskContext.highRiskVendors);
    issues.push({
      description:
        highRiskContext.isSensitiveContext && highRiskVendorSummary.length > 0
          ? `Pre-consent tracking was observed on a ${highRiskContext.sensitiveContextLabel}. Vendors observed include ${highRiskVendorSummary.join(", ")}. Sensitive-context behavioral data may be flowing to third parties before a clear consent interaction is completed.`
          : `Observed vendor activity before consent for ${input.preconsentViolationRows.length} vendor${input.preconsentViolationRows.length === 1 ? "" : "s"}.`,
      evidence: preconsentEvidenceUrls.slice(0, 3),
      fallbackEvidence: {
        high_risk_tracking_vendor_names: highRiskContext.highRiskVendors.map((vendor) => vendor.name),
        high_risk_tracking_vendor_roles: highRiskContext.highRiskVendors.map((vendor) => `${vendor.name}: ${vendor.role}`),
        preconsent_tracker_evidence_urls: preconsentEvidenceUrls,
        preconsent_tracker_script_hosts: preconsentScriptHosts,
        preconsent_tracker_vendors: uniqueStrings([...preconsentVendors, ...highRiskContext.highRiskVendors.map((vendor) => vendor.name)]),
        preconsent_tracking_detected: true,
        runtimeEvidenceArtifacts: uniqueStrings([
          ...preconsentEvidenceUrls,
          ...preconsentScriptHosts.map((host) => `script_host:${host}`)
        ]),
        runtimeEvidenceUrls: preconsentEvidenceUrls,
        runtimeVendors: uniqueStrings([...preconsentVendors, ...highRiskContext.highRiskVendors.map((vendor) => vendor.name)]),
        sensitive_context_label: highRiskContext.sensitiveContextLabel,
        sensitive_context_tracking_detected: highRiskContext.isSensitiveContext && highRiskContext.highRiskVendors.length > 0,
        supportingSignals: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected"],
        tracking_before_consent_detected: true
      },
      severity: "high",
      title:
        highRiskContext.isSensitiveContext && highRiskVendorSummary.length > 0
          ? "Sensitive-data collection with third-party tracking present"
          : "Pre-consent tracking incidents detected"
    });
  }

  if (input.sectionId === "consent_controls_enforcement") {
    issues.push(
      ...input.consentAuditFindings.map((finding) => {
        const baselineTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names");
        const baselineTrackerEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
        const persistedTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_reject_persisted_tracker_vendor_names");
        const newTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_reject_new_tracker_vendor_names");
        const postRejectTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_post_reject_tracker_vendor_names");

        let fallbackEvidence: Record<string, unknown> | undefined;
        if (finding.title === "Trackers fired before consent interaction") {
          const baselineTrackerScriptHosts = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_script_hosts");
          fallbackEvidence = {
            preconsent_tracker_evidence_urls: baselineTrackerEvidenceUrls,
            preconsent_tracker_script_hosts: baselineTrackerScriptHosts,
            preconsent_tracker_vendors: baselineTrackerVendors,
            preconsent_tracking_detected: true,
            runtimeEvidenceArtifacts: uniqueStrings([
              ...baselineTrackerEvidenceUrls,
              ...baselineTrackerScriptHosts.map((host) => `script_host:${host}`)
            ]),
            runtimeEvidenceUrls: baselineTrackerEvidenceUrls,
            runtimeVendors: baselineTrackerVendors,
            supportingSignals: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected"],
            tracking_before_consent_detected: true
          };
        } else if (finding.title === "Reject interaction did not reduce tracking") {
          fallbackEvidence = {
            persisted_tracker_vendors: uniqueStrings([...persistedTrackerVendors, ...newTrackerVendors, ...postRejectTrackerVendors]),
            post_reject_tracker_vendors: postRejectTrackerVendors,
            reject_did_not_reduce_tracking: true,
            runtimeEvidenceUrls: baselineTrackerEvidenceUrls
          };
        } else if (finding.title === "Reject interaction did not reduce third-party cookies") {
          fallbackEvidence = {
            consent_post_reject_third_party_cookie_count: input.runtimeArtifacts?.consent_post_reject_third_party_cookie_count ?? null,
            consent_reject_reduced_third_party_cookies: false,
            consentBaselineTrackerEvidenceUrls: baselineTrackerEvidenceUrls
          };
        }

        return {
          description: finding.description,
          fallbackEvidence,
          severity: finding.severity === "info" ? "low" : finding.severity,
          title: finding.title
        };
      })
    );
  }

  if (input.sectionId === "access_barriers_task_completion") {
    issues.push(
      ...input.accessibilityIssueRows
        .filter((row) => row.count > 0)
        .slice(0, 3)
        .map((row) => {
          const severity: CanonicalReviewIssue["severity"] = row.count >= 5 ? "high" : row.count >= 2 ? "medium" : "low";

          return {
            description: `${row.count} observed in the automated accessibility audit.`,
            severity,
            title: row.label
          };
        })
    );
  }

  if (input.sectionId === "accessibility_commitments_conformance_support" && input.snapshot.accessibility_claim_mismatch_detected === true) {
    issues.push({
      description: "Public-facing accessibility claims appear to conflict with the automated issue profile captured during the scan.",
      severity: "high",
      title: "Accessibility claim mismatch detected"
    });
  }

  if (input.sectionId === "billing_cancellation_post_purchase_rights" && input.snapshot.store_credit_only_policy_present === true) {
    issues.push({
      description: "The refund/remedy posture appears to lean on store credit only, which is worth direct reviewer attention.",
      severity: "medium",
      title: "Store-credit-only remedy detected"
    });
  }

  return issues;
}

function dedupeReviewIssues(issues: CanonicalReviewIssue[]) {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = [
      issue.title.trim().toLowerCase(),
      issue.description.trim().toLowerCase(),
      issue.severity,
      ...(issue.evidence ?? []).map((entry) => entry.trim().toLowerCase()).sort()
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function severityRank(severity: CanonicalReviewFinding["severity"]) {
  switch (severity) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function getKeyPageTypeForSignal(key: string) {
  if (/disclosure\.privacy_policy_(fetch_failed|extraction_limited)/i.test(key)) {
    return "privacy_policy";
  }
  if (/disclosure\.terms_of_service_(fetch_failed|extraction_limited)/i.test(key)) {
    return "terms_of_service";
  }
  if (/disclosure\.cookie_policy_(fetch_failed|extraction_limited)/i.test(key)) {
    return "cookie_policy";
  }
  if (/disclosure\.accessibility_statement_(fetch_failed|extraction_limited)/i.test(key)) {
    return "accessibility_statement";
  }
  if (/disclosure\.contact_page_fetch_failed/i.test(key)) {
    return "contact";
  }
  return null;
}

function getPolicySignalFallbackEvidence(input: {
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  policyEnrichment: Array<Record<string, unknown>>;
  runtimeArtifacts?: Record<string, unknown> | null;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  snapshot?: Record<string, unknown> | null;
}) {
  const rightsSnippetKeys = [
    "dsar",
    "access",
    "delete",
    "correct",
    "export",
    "manage",
    "state_rights",
    "authorized_agent",
    "appeal",
    "privacy_controls",
    "privacy_contact"
  ] as const;
  const rightsSnippetSelectors: Array<string | RegExp> = [
    ...rightsSnippetKeys,
    /^rights[_:-]/i,
    /^rights_signal[:_-]/i,
    /^topic:privacy_rights/i,
    /^topic:dsar/i,
    /dsar/i
  ];
  const policyPositiveSpec = getPolicyPositiveSignalSpec(input.signalKey);
  const topicKey = policyPositiveSpec?.evidenceSnippetKey ?? null;
  const pageType = policyPositiveSpec?.pageType ?? "privacy_policy";
  const candidateRows = input.policyEnrichment.filter((entry) => getPolicyPageType(entry) === pageType);
  const mergedPolicyRightsSignals = findMergedSignalValue(input.mergedSignals, "policyRightsSignals");
  const policyRightsSignals = Array.isArray(mergedPolicyRightsSignals)
    ? mergedPolicyRightsSignals.filter((value): value is string => typeof value === "string")
    : [];
  const rightsSnippetKeysForSignal = isPrivacyRightsSignalKey(input.signalKey) ? [...rightsSnippetKeys] : [];
  const topicSnippetKeys = topicKey
    ? [
        topicKey,
        topicKey.startsWith("topic:") ? topicKey.slice("topic:".length) : `topic:${topicKey}`,
        ...(policyPositiveSpec?.unifiedFindingId === "behavioral_analytics_disclosure_present"
          ? ["session_replay_disclosure", "behavioral_analytics_disclosure", "product_analytics_disclosure"]
          : [])
      ]
    : policyPositiveSpec?.unifiedFindingId === "privacy_contact_path_present"
      ? ["privacy_contact", "notice_contact", "dsar"]
      : policyPositiveSpec?.unifiedFindingId === "privacy_rights_path_present"
        ? rightsSnippetKeysForSignal
      : policyPositiveSpec?.unifiedFindingId === "children_privacy_disclosure_present"
        ? ["topic:children", "children"]
        : [];
  const rowHasTopicSnippet = (entry: Record<string, unknown>) => {
    const snippets = getPolicyEvidenceSnippets(entry);
    if (topicSnippetKeys.some((key) => isMeaningfulPolicyText(snippets?.[key]))) {
      return true;
    }
    if (policyPositiveSpec?.unifiedFindingId === "privacy_rights_path_present") {
      return getPolicyEvidenceSnippetValues(entry, rightsSnippetSelectors).length > 0 ||
        getPolicyRightsSignals(entry, snippets).length > 0 ||
        Boolean(getPolicyDsarMechanism(entry));
    }
    return false;
  };
  const row =
    candidateRows.find(rowHasTopicSnippet) ??
    candidateRows[0] ??
    input.policyEnrichment[0] ??
    null;
  const pageUrl = row ? getPolicyPageUrl(row) : null;
  const policySummaryShort = row ? getPolicySummaryText(row) : null;
  const evidenceSnippets = row ? getPolicyEvidenceSnippets(row) : null;
  const topicSnippets = topicSnippetKeys.flatMap((key) =>
    isMeaningfulPolicyText(evidenceSnippets?.[key]) && String(evidenceSnippets[key]).trim().toLowerCase() !== "nano"
      ? [String(evidenceSnippets[key])]
      : []
  );
  const rightsSnippets = isPrivacyRightsSignalKey(input.signalKey)
    ? getPolicyEvidenceSnippetValues(row ?? {}, rightsSnippetSelectors).slice(0, 3)
    : [];
  const policySnippets = normalizePolicySnippetList([...topicSnippets, ...rightsSnippets]);
  const rowPolicyRightsSignals = row ? getPolicyRightsSignals(row, evidenceSnippets) : [];
  const retainedPolicyRightsSignals = uniqueStrings([...policyRightsSignals, ...rowPolicyRightsSignals]);
  const mergedPrivacyContactChannelType = findMergedSignalValue(input.mergedSignals, "privacyContactChannelType");
  const snapshotPrivacyContactChannelType =
    typeof input.snapshot?.privacy_contact_channel_type === "string" && isMeaningfulPolicyText(input.snapshot.privacy_contact_channel_type)
      ? input.snapshot.privacy_contact_channel_type
      : null;
  const privacyContactChannelType =
    typeof mergedPrivacyContactChannelType === "string" && isMeaningfulPolicyText(mergedPrivacyContactChannelType)
      ? mergedPrivacyContactChannelType
      : snapshotPrivacyContactChannelType;
  const mergedPolicyChildrenReference = findMergedSignalValue(input.mergedSignals, "policyChildrenReference");
  const policyChildrenReference =
    typeof mergedPolicyChildrenReference === "string" && isMeaningfulPolicyText(mergedPolicyChildrenReference)
      ? mergedPolicyChildrenReference
      : null;

  return {
    pageUrl,
    pageUrls: pageUrl ? [pageUrl] : [],
    policyDsarMechanism: row ? getPolicyDsarMechanism(row) : null,
    policyPageType: row ? getPolicyPageType(row) : null,
    policySnippets,
    policyRightsSignals: retainedPolicyRightsSignals,
    runtimeDisclosureSupport:
      policyPositiveSpec?.unifiedFindingId &&
      [
        "tracking_technologies_disclosure_present",
        "targeted_advertising_disclosure_present",
        "third_party_advertising_disclosure_present",
        "behavioral_analytics_disclosure_present"
      ].includes(policyPositiveSpec.unifiedFindingId)
        ? {
            thirdPartyRequestCount:
              typeof input.runtimeArtifacts?.third_party_request_count === "number"
                ? input.runtimeArtifacts.third_party_request_count
                : typeof input.snapshot?.third_party_request_count === "number"
                  ? input.snapshot.third_party_request_count
                  : null,
            thirdPartyRequestDomains: getRecordStringArray(input.runtimeArtifacts, "third_party_request_domains").slice(0, 8),
            sessionReplayRuntimeVendors: getRecordStringArray(input.runtimeArtifacts, "session_replay_runtime_vendors").slice(0, 8)
          }
        : null,
    privacyContactChannelType,
    policyChildrenReference,
    policyPositiveSnippetKeys: topicSnippetKeys,
    policyPositiveTopic:
      policyPositiveSpec?.unifiedFindingId === "behavioral_analytics_disclosure_present"
        ? "behavioral_analytics_disclosure"
        : topicKey?.replace(/^topic:/, ""),
    policySummaryShort: policySnippets.length > 0 ? null : policySummaryShort,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: pageUrl ? [pageUrl] : []
  };
}

function getKeyPageDiscoveryPageSummary(
  summary: unknown,
  pageType: string
): {
  attemptCount: number | null;
  attemptedUrls: string[];
  bestDiscoverySource: string | null;
  fetchQuality: string | null;
  guessedOnly: boolean;
  stopReason: string | null;
} | null {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const pageSummaries = (summary as { pageSummaries?: unknown }).pageSummaries;
  if (!Array.isArray(pageSummaries)) {
    return null;
  }

  const match = pageSummaries.find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && entry.pageType === pageType
  );

  if (!match) {
    return null;
  }

  return {
    attemptCount: typeof match.attemptCount === "number" ? match.attemptCount : null,
    attemptedUrls: Array.isArray(match.attemptedUrls)
      ? match.attemptedUrls.filter((value): value is string => typeof value === "string")
      : [],
    bestDiscoverySource: typeof match.bestDiscoverySource === "string" ? match.bestDiscoverySource : null,
    fetchQuality: typeof match.fetchQuality === "string" ? match.fetchQuality : null,
    guessedOnly: match.guessedOnly === true,
    stopReason: typeof match.stopReason === "string" ? match.stopReason : null
  };
}

function getRepresentativeAccessibilityExamplesForSignal(input: {
  rows: AccessibilityRuleEvidenceRow[];
  signalKey: string;
}) {
  const matches = input.rows.filter((row) => {
    if (/wcag_contrast_failures_count/i.test(input.signalKey)) {
      return row.ruleCode === "color-contrast" || row.ruleGroup === "contrast";
    }
    if (/wcag_form_label_error_count/i.test(input.signalKey)) {
      return row.ruleCode === "label" || row.ruleGroup === "label";
    }
    if (/wcag_link_name_error_count/i.test(input.signalKey)) {
      return row.ruleCode === "link-name" || row.ruleGroup === "link";
    }

    return false;
  });

  return matches.slice(0, 3).map((row) => ({
    description: row.description,
    help: row.help,
    helpUrl: row.helpUrl,
    pageUrl: row.pageUrl,
    representativeSelectors: row.representativeSelectors.slice(0, 3),
    ruleCode: row.ruleCode,
    ruleGroup: row.ruleGroup
  }));
}

export function buildReviewFindings(input: {
  allSignals?: Array<{ key: string; value: unknown }>;
  categoryId?: string;
  issues: CanonicalReviewIssue[];
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  policyEnrichment?: Array<Record<string, unknown>>;
  prioritizedAccessibilityRuleRows: AccessibilityRuleEvidenceRow[];
  runtimeArtifacts?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  sectionId: string;
  sectionItems: CanonicalSignalItem[];
  validationFindingLookup?: Map<string, ScanValidationFinding>;
}) {
  const contradictorySignalPairs = new Map<string, string>([
    ["privacy.privacy_contact_channel_missing", "privacy.privacy_contact_path_present"],
    ["accessibility.accessibility_support_path_missing", "accessibility.accessibility_contact_method_present"]
  ]);
  const availableSignalKeys = new Set([
    ...input.sectionItems
      .filter((item) => isSignalValuePopulated(item.key, item.value))
      .map((item) => item.key),
    ...(input.allSignals ?? [])
      .filter((signal) => isSignalValuePopulated(signal.key, signal.value))
      .map((signal) => signal.key)
  ]);
  const signalFindings: CanonicalReviewFinding[] = input.sectionItems
    .filter((item) => {
      if (item.relation !== "primary" || !isConcerningSignal(item.key, item.value)) {
        return false;
      }

      const contradictoryPositiveSignalKey = contradictorySignalPairs.get(item.key);
      if (contradictoryPositiveSignalKey) {
        const mergedPositiveValue = findMergedSignalValue(input.mergedSignals, contradictoryPositiveSignalKey);
        if (
          availableSignalKeys.has(contradictoryPositiveSignalKey) ||
          isSignalValuePopulated(contradictoryPositiveSignalKey, mergedPositiveValue)
        ) {
          return false;
        }
      }

      return true;
    })
    .flatMap((item): CanonicalReviewFinding[] => {
      const linkedValidationFinding = input.validationFindingLookup
        ? findValidationFindingForKeys(input.validationFindingLookup, getValidationMatchKeysForSignal(item.key))
        : null;
      const keyPageType = getKeyPageTypeForSignal(item.key);
      const keyPageSummary =
        keyPageType
          ? getKeyPageDiscoveryPageSummary(input.runtimeArtifacts?.key_page_discovery_summary, keyPageType)
          : null;
      const accessibilityRuleExamples = getRepresentativeAccessibilityExamplesForSignal({
        rows: input.prioritizedAccessibilityRuleRows,
        signalKey: item.key
      });

      const baseFallbackEvidence =
        isRightsFrictionSignal(item.key)
          ? {
              consentBlockerPageTitle:
                typeof input.runtimeArtifacts?.consent_blocker_page_title === "string"
                  ? input.runtimeArtifacts.consent_blocker_page_title
                  : null,
              consentBlockerTextSnippet:
                typeof input.runtimeArtifacts?.consent_blocker_text_snippet === "string"
                  ? input.runtimeArtifacts.consent_blocker_text_snippet
                  : null,
              consentBlockerType:
                typeof input.runtimeArtifacts?.consent_blocker_type === "string"
                  ? input.runtimeArtifacts.consent_blocker_type
                  : null,
              consentBlockerUrl:
                typeof input.runtimeArtifacts?.consent_blocker_url === "string"
                  ? input.runtimeArtifacts.consent_blocker_url
                  : null,
              consentEvidencePassCount:
                typeof input.runtimeArtifacts?.consent_evidence_pass_count === "number"
                  ? input.runtimeArtifacts.consent_evidence_pass_count
                  : null,
              consentFrictionDelta:
                typeof input.runtimeArtifacts?.consent_friction_delta === "number"
                  ? input.runtimeArtifacts.consent_friction_delta
                  : null,
              consentOptInClicks:
                typeof input.runtimeArtifacts?.consent_opt_in_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_in_clicks
                  : null,
              consentOptOutClicks:
                typeof input.runtimeArtifacts?.consent_opt_out_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_out_clicks
                  : null,
              consentRedirectOrAuthRequired: input.runtimeArtifacts?.consent_redirect_or_auth_required === true,
              signalKey: item.key,
              signalLabel: item.label,
              signalValue: item.value
            }
          : (item.source === "policy_enrichment_signal" || item.source === "document_semantic_signal") &&
              isPolicyPositiveSignalKey(item.key)
            ? getPolicySignalFallbackEvidence({
                mergedSignals: input.mergedSignals,
                policyEnrichment: input.policyEnrichment ?? [],
                runtimeArtifacts: input.runtimeArtifacts,
                signalKey: item.key,
                signalLabel: item.label,
                signalValue: item.value,
                snapshot: input.snapshot
              })
          : /privacy\.gpc_signal_not_honored/i.test(item.key)
            ? {
                gpcVerification:
                  input.runtimeArtifacts?.gpc_verification && typeof input.runtimeArtifacts.gpc_verification === "object"
                    ? input.runtimeArtifacts.gpc_verification
                    : null,
                signalKey: item.key,
                signalLabel: item.label,
                signalValue: item.value,
                sourceUrls:
                  input.runtimeArtifacts?.gpc_verification &&
                  typeof input.runtimeArtifacts.gpc_verification === "object" &&
                  Array.isArray((input.runtimeArtifacts.gpc_verification as { evidenceUrls?: unknown }).evidenceUrls)
                    ? ((input.runtimeArtifacts.gpc_verification as { evidenceUrls: string[] }).evidenceUrls)
                    : []
              }
            : /privacy\.weak_cookie_security_attributes_detected/i.test(item.key)
              ? {
                  cookieAttributeSummary:
                    input.runtimeArtifacts?.cookie_attribute_summary && typeof input.runtimeArtifacts.cookie_attribute_summary === "object"
                      ? input.runtimeArtifacts.cookie_attribute_summary
                      : null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
            : /commerce\.high_sensitivity_data_collection_detected/i.test(item.key)
              ? {
                  sensitivePayloadViolations: Array.isArray(input.runtimeArtifacts?.sensitive_payload_violations)
                    ? input.runtimeArtifacts.sensitive_payload_violations.slice(0, 3)
                    : [],
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
          : isChildContextSignalKey(item.key)
              ? buildChildContextFallbackEvidence({
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : /accessibility\.accessibility_contact_method_present/i.test(item.key)
              ? buildAccessibilitySupportFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : /disclosure\.cookie_policy_structurally_obstructed/i.test(item.key)
              ? buildCookiePolicyFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  policyEnrichment: input.policyEnrichment ?? [],
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                })
            : /commerce\.affiliate_disclosure_present|disclosure\.key_page_discovery_unresolved_after_bounded_search|disclosure\.privacy_policy_present|disclosure\.terms_of_service_present|disclosure\.cookie_policy_present|disclosure\.contact_page_present|privacy\.do_not_sell_link_present/i.test(item.key)
              ? buildSnapshotDisclosureFallbackEvidence({
                  keyPageDiscoverySummary: input.runtimeArtifacts?.key_page_discovery_summary ?? null,
                  policyEnrichment: input.policyEnrichment ?? [],
                  relatedSignals: (input.allSignals ?? input.sectionItems).map((signalLike) => ({
                    key: signalLike.key,
                    value: signalLike.value
                  })),
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value,
                  snapshot: input.snapshot
                })
            : keyPageType
              ? {
                  fetchQuality: keyPageSummary?.fetchQuality ?? null,
                  keyPageAttemptCount: keyPageSummary?.attemptCount ?? null,
                  keyPageDiscoverySource: keyPageSummary?.bestDiscoverySource ?? null,
                  keyPageGuessedOnly: keyPageSummary?.guessedOnly ?? null,
                  keyPageAttemptedUrls: keyPageSummary?.attemptedUrls ?? [],
                  keyPageStopReason: keyPageSummary?.stopReason ?? null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
              : {
                  accessibilityRuleExamples,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                };
      const hybridFallbackEvidence = getHybridSignalFallbackEvidence({
        runtimeArtifacts: input.runtimeArtifacts,
        signalKey: item.key,
        signalLabel: item.label,
        signalValue: item.value
      });
      const fallbackEvidence =
        hybridFallbackEvidence && baseFallbackEvidence
          ? { ...baseFallbackEvidence, ...hybridFallbackEvidence }
          : hybridFallbackEvidence ?? baseFallbackEvidence;

      if (!shouldSurfacePrimarySignalFinding({
        fallbackEvidence,
        key: item.key,
        linkedValidationEvidence: linkedValidationFinding?.evidence ?? null,
        signalSource: item.source
      })) {
        return [];
      }

      return [{
        categoryId: input.categoryId,
        description: getSignalConcernReason(item.key, item.value) ?? "This signal is worth reviewer attention.",
        fallbackEvidence,
        id: `${input.sectionId}-signal-${item.key}`,
        linkedValidationFinding,
        observedValue: formatCompactValue(item.value),
        severity: getSignalFindingSeverity(item.key, item.value),
        signalKey: item.key,
        signalLabel: item.label,
        signalSource: item.source,
        sourceType: "signal",
        title: item.label
      }];
    });

  const issueFindings: CanonicalReviewFinding[] = input.issues.map((issue, index) => ({
    categoryId: input.categoryId ?? getDefaultIssueCategoryId(input.sectionId),
    description: issue.description,
    evidence: issue.evidence,
    fallbackEvidence: issue.fallbackEvidence,
    id: `${input.sectionId}-issue-${index}`,
    linkedValidationFinding: input.validationFindingLookup
      ? findValidationFindingForKeys(
          input.validationFindingLookup,
          issue.linkedValidationRuleKeys && issue.linkedValidationRuleKeys.length > 0
            ? issue.linkedValidationRuleKeys
            : getValidationMatchKeysForTitle(issue.title)
        )
      : null,
    observedValue: summarizeObservedIssueEvidence(issue.evidence, issue.severity),
    severity: issue.severity,
    sourceType: "issue",
    title: issue.title
  }));

  return [...signalFindings, ...issueFindings].sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity) || left.title.localeCompare(right.title)
  );
}

function getDefaultIssueCategoryId(sectionId: string) {
  switch (sectionId) {
    case "policy_clarity_consistency_review":
      return "cross_document_consistency";
    default:
      return undefined;
  }
}

function getSignalFindingSeverity(key: string, value: unknown): CanonicalReviewFinding["severity"] {
  if (isPolicyPositiveSignalKey(key) || /accessibility_contact_method_present/i.test(key)) {
    return "low";
  }
  if (/preconsent|tracking_before_consent|session_replay|conflict|mismatch/i.test(key)) {
    return "high";
  }
  if (/fingerprinting/i.test(key)) {
    return "high";
  }
  if (/popup_behavior|autoplay_media|overlay_blocking/i.test(key)) {
    return "medium";
  }
  if (/gpc_signal_not_honored/i.test(key)) {
    return "high";
  }
  if (/privacy_policy_(surface_missing|fetch_failed)/i.test(key)) {
    return "high";
  }
  if (/weak_cookie_security_attributes_detected|key_page_discovery_unresolved_after_bounded_search|surface_missing|fetch_failed|extraction_limited|dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present|store_credit_only|termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "medium";
  }
  if (typeof value === "number" && /risk_score|ambiguity_score|friction_score/i.test(key)) {
    return value >= 70 ? "high" : "medium";
  }

  return "medium";
}

function summarizeObservedIssueEvidence(evidence: string[] | undefined, severity: CanonicalReviewFinding["severity"]) {
  if (!evidence || evidence.length === 0) {
    return `${severity} severity`;
  }

  const normalizedEvidence = evidence.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (normalizedEvidence.length === 0) {
    return `${severity} severity`;
  }

  const nonUrlEvidence = normalizedEvidence.filter((entry) => !/^https?:\/\//i.test(entry.trim()));
  if (nonUrlEvidence.length > 0) {
    return summarizeReviewIssueEvidence(nonUrlEvidence);
  }

  return normalizedEvidence.length === 1 ? "Linked evidence available" : `${normalizedEvidence.length} linked evidence items`;
}

function summarizeReviewIssueEvidence(evidence: string[]) {
  if (evidence.length === 1) {
    return evidence[0] ?? "";
  }

  const [first, second] = evidence;
  const remainingCount = evidence.length - 2;

  return remainingCount > 0
    ? `${first} | ${second} | +${remainingCount} more`
    : `${first} | ${second}`;
}
