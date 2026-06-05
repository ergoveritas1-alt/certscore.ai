import type {
  CaliforniaPrivacyEvidenceFamily,
  CaliforniaPrivacyRegulatoryReviewArea,
  CaliforniaPrivacyReviewStatus
} from "@website-signal-risk-scanner/shared";
import type { NormalizedConcern } from "./normalized-concerns";

const CALIFORNIA_PRIVACY_REGULATORY_REVIEW_AREA: CaliforniaPrivacyRegulatoryReviewArea = "california_ccpa_cpra";

export type CaliforniaPrivacyCoverageOutcomeStatus = CaliforniaPrivacyReviewStatus;

export type CaliforniaPrivacyCoverageSourceSignalGap = {
  actual: unknown;
  expected: unknown;
  field: string;
  source: "scanner" | "CertScore";
  whyNeeded: string;
};

export type CaliforniaPrivacyCoverageCriticalEvidence = {
  evidenceFamily: CaliforniaPrivacyEvidenceFamily;
  missingOrIncompleteSourceSignals: CaliforniaPrivacyCoverageSourceSignalGap[];
  pipeline: {
    concernPolicyKey: string;
    projectionStage: "coverage_policy" | "unified_finding" | "executive_projection" | "coverage_fallback";
    regulatoryReviewArea: CaliforniaPrivacyRegulatoryReviewArea;
    wc01NormalizedConcernKey: string;
    ws01EvidenceRole: string;
  };
  projectedFindings: Array<{
    id: string;
    label: string;
    severity?: string;
  }>;
  retainedEvidence: Record<string, unknown>;
  statusBasis: string;
};

export type CaliforniaPrivacyCoverageOutcome = {
  criticalEvidence: CaliforniaPrivacyCoverageCriticalEvidence;
  evidenceRefs: string[];
  limitation: string;
  rowId: string;
  status: CaliforniaPrivacyCoverageOutcomeStatus;
};

export type CaliforniaPrivacyCoveragePolicyInput = {
  coverageLimited: boolean;
  normalizedConcerns?: Pick<
    NormalizedConcern,
    "canonicalConcernKey" | "originKey" | "promotionEligibility" | "suggestedUnifiedFindingId" | "title"
  >[];
  runtimeArtifacts?: Record<string, unknown> | null;
  scanCompleted: boolean;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value === true || value === false) {
      return value;
    }
  }
  return null;
}

function getString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (record && key in record) {
      return record[key];
    }
  }
  return null;
}

function getNestedBoolean(value: unknown, keys: string[]) {
  const record = getRecord(value);
  return getBoolean(record, keys);
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          values.push(entry.trim());
        }
      }
    }
  }
  return [...new Set(values)];
}

function getNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

function hasConcreteValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function sourceGap(
  field: string,
  expected: unknown,
  actual: unknown,
  whyNeeded: string,
  source: "scanner" | "CertScore" = "scanner"
): CaliforniaPrivacyCoverageSourceSignalGap {
  return { actual, expected, field, source, whyNeeded };
}

function getEvidenceFamilyForRow(rowId: string): CaliforniaPrivacyEvidenceFamily {
  switch (rowId) {
    case "privacy_notice_availability":
      return "notice_surface";
    case "notice_at_collection":
      return "collection_notice";
    case "do_not_sell_share_availability":
      return "sale_share_control";
    case "gpc_opt_out_signal_handling":
      return "gpc_handling";
    case "targeted_advertising_signals":
      return "adtech_sharing_runtime";
    case "sale_share_disclosure_alignment":
      return "disclosure_alignment";
    case "limit_use_sensitive_pi":
      return "sensitive_pi";
    case "opt_out_friction_dark_patterns":
      return "opt_out_friction";
    case "post_opt_out_tracking_behavior":
      return "post_opt_out_tracking";
    case "consumer_rights_request_methods":
      return "rights_methods";
    case "privacy_control_accessibility":
      return "privacy_control_accessibility";
    default:
      return "adtech_sharing_runtime";
  }
}

function makeOutcome(
  rowId: string,
  status: CaliforniaPrivacyCoverageOutcomeStatus,
  limitation: string,
  evidenceRefs: string[] = [],
  criticalEvidence?: {
    missingOrIncompleteSourceSignals?: CaliforniaPrivacyCoverageSourceSignalGap[];
    retainedEvidence?: Record<string, unknown>;
  }
): CaliforniaPrivacyCoverageOutcome {
  return {
    criticalEvidence: {
      evidenceFamily: getEvidenceFamilyForRow(rowId),
      missingOrIncompleteSourceSignals: criticalEvidence?.missingOrIncompleteSourceSignals ?? [],
      pipeline: {
        concernPolicyKey: `california_privacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
        projectionStage: "coverage_policy",
        regulatoryReviewArea: CALIFORNIA_PRIVACY_REGULATORY_REVIEW_AREA,
        wc01NormalizedConcernKey: `california_privacy.coverage.${rowId}`,
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [],
      retainedEvidence: compactRecord({
        evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
        ...(criticalEvidence?.retainedEvidence ?? {})
      }),
      statusBasis: limitation
    },
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
    limitation,
    rowId,
    status
  };
}

function getCaliforniaEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return getRecord(input.runtimeArtifacts?.californiaPrivacyEvidence) ?? null;
}

function getCpraEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return getRecord(input.runtimeArtifacts?.cpraCbaOptOutEvidence) ?? null;
}

function getGpcEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return getRecord(input.runtimeArtifacts?.gpcVerification) ?? null;
}

function getEvidenceRefs(californiaEvidence: Record<string, unknown> | null, ...refs: Array<string | null>) {
  return [
    ...getStringArray(californiaEvidence, ["evidenceRefs", "evidence_refs"]),
    ...refs.filter((value): value is string => Boolean(value))
  ];
}

function getNormalizedConcernRowsForOutcome(rowId: string) {
  switch (rowId) {
    case "privacy_notice_availability":
      return ["california_privacy.notice_surface."];
    case "notice_at_collection":
      return ["california_privacy.collection_notice.", "california_privacy.notice_at_collection."];
    case "do_not_sell_share_availability":
      return ["california_privacy.sale_share_control."];
    case "gpc_opt_out_signal_handling":
      return ["california_privacy.gpc_handling."];
    case "targeted_advertising_signals":
      return ["california_privacy.adtech_sharing_runtime.", "california_privacy.sale_share_control."];
    case "sale_share_disclosure_alignment":
      return ["california_privacy.disclosure_alignment."];
    case "limit_use_sensitive_pi":
      return ["california_privacy.sensitive_pi_control.", "california_privacy.sensitive_pi."];
    case "opt_out_friction_dark_patterns":
      return ["california_privacy.opt_out_friction.", "california_privacy.sale_share_control."];
    case "post_opt_out_tracking_behavior":
      return ["california_privacy.post_opt_out_tracking.", "california_privacy.sale_share_control."];
    case "sensitive_forms_third_party_tracking":
      return ["california_privacy.sensitive_pi."];
    case "consumer_rights_request_methods":
      return ["california_privacy.rights_methods."];
    case "privacy_control_accessibility":
      return ["california_privacy.privacy_control_accessibility."];
    default:
      return [];
  }
}

function enrichOutcomesWithNormalizedConcerns(
  outcomes: Record<string, CaliforniaPrivacyCoverageOutcome>,
  normalizedConcerns: CaliforniaPrivacyCoveragePolicyInput["normalizedConcerns"] = []
) {
  for (const [rowId, outcome] of Object.entries(outcomes)) {
    const prefixes = getNormalizedConcernRowsForOutcome(rowId);
    if (prefixes.length === 0) {
      continue;
    }
    const matchingConcerns = normalizedConcerns.filter((concern) =>
      prefixes.some((prefix) => concern.originKey.startsWith(prefix))
    );
    if (matchingConcerns.length === 0) {
      continue;
    }
    const normalizedConcernKeys = [...new Set(matchingConcerns.map((concern) => concern.canonicalConcernKey))].sort();
    const promotedFindingHints = matchingConcerns
      .filter((concern) => concern.promotionEligibility === "eligible" && concern.suggestedUnifiedFindingId)
      .map((concern) => ({
        id: concern.suggestedUnifiedFindingId as string,
        label: concern.title
      }));
    outcome.criticalEvidence.retainedEvidence = compactRecord({
      ...outcome.criticalEvidence.retainedEvidence,
      normalizedConcernKeys,
      normalizedConcernOrigins: [...new Set(matchingConcerns.map((concern) => concern.originKey))].sort(),
      normalizedConcernPromotionEligibility: [...new Set(matchingConcerns.map((concern) => concern.promotionEligibility))].sort()
    });
    outcome.criticalEvidence.pipeline = {
      ...outcome.criticalEvidence.pipeline,
      wc01NormalizedConcernKey: normalizedConcernKeys.join(", ")
    };
    if (promotedFindingHints.length > 0) {
      outcome.criticalEvidence.projectedFindings = promotedFindingHints;
    }
  }
  return outcomes;
}

export function deriveCaliforniaPrivacyCoveragePolicyOutcomes(
  input: CaliforniaPrivacyCoveragePolicyInput
): Record<string, CaliforniaPrivacyCoverageOutcome> {
  const californiaEvidence = getCaliforniaEvidence(input);
  const cpraEvidence = getCpraEvidence(input);
  const gpcEvidence = getGpcEvidence(input);
  const outcomes: Record<string, CaliforniaPrivacyCoverageOutcome> = {};

  if (!input.scanCompleted || input.coverageLimited) {
    const rows = [
      "privacy_notice_availability",
      "notice_at_collection",
      "do_not_sell_share_availability",
      "gpc_opt_out_signal_handling",
      "targeted_advertising_signals",
      "sale_share_disclosure_alignment",
      "limit_use_sensitive_pi",
      "opt_out_friction_dark_patterns",
      "post_opt_out_tracking_behavior",
      "sensitive_forms_third_party_tracking",
      "consumer_rights_request_methods",
      "privacy_control_accessibility"
    ];
    for (const rowId of rows) {
      outcomes[rowId] = makeOutcome(rowId, "not_testable", "The retained public-web scan context did not support this California privacy review row.", [], {
        missingOrIncompleteSourceSignals: [
          sourceGap("scanner.californiaPrivacyEvidence", "completed public-web California evidence packet", californiaEvidence ? "partial" : "missing", "Required before CertScore can evaluate this California checklist row.")
        ]
      });
    }
    return enrichOutcomesWithNormalizedConcerns(outcomes, input.normalizedConcerns);
  }

  const privacyNoticeObserved = getBoolean(californiaEvidence, ["privacyNoticeObserved", "privacy_notice_observed"]);
  const privacyNoticeUrls = getStringArray(californiaEvidence, ["privacyNoticeUrls", "privacy_notice_urls"]);
  const privacyNoticeSourceUrls = getStringArray(californiaEvidence, ["privacyNoticeSourceUrls", "privacy_notice_source_urls"]);
  const californiaNoticeCueObserved = getBoolean(californiaEvidence, ["californiaNoticeCueObserved", "california_notice_cue_observed"]);
  const californiaNoticeCueText = getString(californiaEvidence, ["californiaNoticeCueText", "california_notice_cue_text"]);
  const privacyNoticeDiscoveryEvidence = getValue(californiaEvidence, [
    "privacyNoticeDiscoveryEvidence",
    "privacy_notice_discovery_evidence",
    "privacyNoticeSearchEvidence",
    "privacy_notice_search_evidence"
  ]);
  const privacyNoticeDiscoveryUrls = getStringArray(californiaEvidence, [
    "privacyNoticeSearchUrls",
    "privacy_notice_search_urls",
    "privacyNoticeAttemptedUrls",
    "privacy_notice_attempted_urls",
    "attemptedPrivacyNoticeUrls",
    "attempted_privacy_notice_urls"
  ]);
  const privacyTargetAttempted = Boolean(
    getNestedBoolean(privacyNoticeDiscoveryEvidence, ["privacyTargetAttempted", "privacy_target_attempted"]) ??
    (privacyNoticeDiscoveryUrls.length > 0)
  );
  const rawEvidenceRefs = getStringArray(californiaEvidence, ["evidenceRefs", "evidence_refs"]);
  const noticeSurfaceTested =
    privacyNoticeUrls.length > 0 ||
    privacyNoticeSourceUrls.length > 0 ||
    privacyNoticeDiscoveryUrls.length > 0 ||
    privacyTargetAttempted ||
    rawEvidenceRefs.some((ref) => /privacy notice|privacy policy/i.test(ref));
  const privacyNoticeRetainedEvidence = {
    privacyNoticeObserved,
    privacyNoticeUrls,
    privacyNoticeSourceUrls,
    californiaNoticeCueObserved,
    californiaNoticeCueText,
    privacyNoticeDiscoveryEvidence,
    privacyNoticeDiscoveryUrls
  };
  outcomes.privacy_notice_availability = privacyNoticeObserved === true
    ? makeOutcome("privacy_notice_availability", "observed", "A public privacy notice or privacy policy surface was retained.", getEvidenceRefs(californiaEvidence, "Privacy notice observed"), {
        retainedEvidence: privacyNoticeRetainedEvidence
      })
    : privacyNoticeObserved === false && noticeSurfaceTested
      ? makeOutcome("privacy_notice_availability", "potential_gap", "No public privacy notice or equivalent privacy disclosure was retained in the tested context.", getEvidenceRefs(californiaEvidence, "Privacy notice not observed"), {
          retainedEvidence: privacyNoticeRetainedEvidence
        })
      : makeOutcome("privacy_notice_availability", "not_testable", "Privacy notice availability could not be resolved from retained scanner evidence.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "californiaPrivacyEvidence.privacyNoticeDiscoveryEvidence",
              "retained privacy notice discovery/search context",
              privacyNoticeObserved === false ? "privacyNoticeObserved=false without discovery context" : "missing",
              "Required before CertScore can treat an unobserved privacy notice as a potential gap rather than a coverage limitation."
            )
          ],
          retainedEvidence: privacyNoticeRetainedEvidence
        });

  const collectionContextObserved = getBoolean(californiaEvidence, ["collectionContextObserved", "collection_context_observed"]);
  const collectionNoticeCueObserved = getBoolean(californiaEvidence, ["collectionNoticeCueObserved", "collection_notice_cue_observed"]);
  const collectionContextUrls = getStringArray(californiaEvidence, ["collectionContextUrls", "collection_context_urls"]);
  const collectionContextTypes = getStringArray(californiaEvidence, ["collectionContextTypes", "collection_context_types"]);
  const collectionEvidenceSources = getStringArray(californiaEvidence, ["collectionEvidenceSources", "collection_evidence_sources"]);
  const collectionFieldContexts = getValue(californiaEvidence, ["collectionFieldContexts", "collection_field_contexts"]);
  const collectionNoticeCueText = getString(californiaEvidence, ["collectionNoticeCueText", "collection_notice_cue_text"]);
  const collectionRetainedEvidence = {
    collectionContextObserved,
    collectionContextUrls,
    collectionContextTypes,
    collectionEvidenceSources,
    collectionFieldContexts,
    collectionNoticeCueObserved,
    collectionNoticeCueText
  };
  outcomes.notice_at_collection = collectionContextObserved === false
    ? makeOutcome("notice_at_collection", "not_observed", "No eligible public collection context was observed in the tested context.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: collectionRetainedEvidence
      })
    : collectionContextObserved === true && collectionNoticeCueObserved === true
      ? makeOutcome("notice_at_collection", "observed", "A collection-context privacy notice or disclosure cue was retained where relevant.", getEvidenceRefs(californiaEvidence, "Collection notice cue observed"), {
          retainedEvidence: collectionRetainedEvidence
        })
      : collectionContextObserved === true && collectionNoticeCueObserved === false
        ? makeOutcome("notice_at_collection", "potential_gap", "An eligible collection context was retained without a nearby privacy notice or collection disclosure cue.", getEvidenceRefs(californiaEvidence, "Collection context without nearby notice cue"), {
            retainedEvidence: collectionRetainedEvidence
          })
        : makeOutcome("notice_at_collection", "not_testable", "Collection context evidence was not complete enough to evaluate notice-at-collection cues.", [], {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.collectionContextObserved", "collection context observation", collectionContextObserved, "Required to know whether notice-at-collection review applies."),
              sourceGap("californiaPrivacyEvidence.collectionNoticeCueObserved", "nearby notice cue observation when collection context exists", collectionNoticeCueObserved, "Required to evaluate whether a public collection context had a nearby notice cue.")
            ]
          });

  const targetedAdvertisingSignalsObserved =
    getBoolean(californiaEvidence, ["targetedAdvertisingSignalsObserved", "targeted_advertising_signals_observed"]) ??
    ((getStringArray(cpraEvidence, ["advertisingSharingVendors", "advertising_sharing_vendors"]).length > 0) ? true : null);
  const privacyChoicePathEvidence = getRecord(getValue(californiaEvidence, ["privacyChoicePathEvidence", "privacy_choice_path_evidence"]));
  const privacyChoiceInteractionEvidence = getRecord(getValue(californiaEvidence, [
    "privacyChoiceInteractionEvidence",
    "privacy_choice_interaction_evidence"
  ]));
  const privacyChoicePathObserved = getBoolean(privacyChoicePathEvidence, ["observed"]);
  const retainedDoNotSellSharePathObserved = getBoolean(californiaEvidence, ["doNotSellSharePathObserved", "do_not_sell_share_path_observed"]);
  const cpraOptOutControlFound = getBoolean(cpraEvidence, ["optOutControlFound", "opt_out_control_found"]);
  const doNotSellSharePathObserved =
    retainedDoNotSellSharePathObserved === true ||
    privacyChoicePathObserved === true ||
    cpraOptOutControlFound === true
      ? true
      : retainedDoNotSellSharePathObserved === false || privacyChoicePathObserved === false || cpraOptOutControlFound === false
        ? false
        : null;
  const optOutPathLabel =
    getString(californiaEvidence, ["doNotSellSharePathLabel", "do_not_sell_share_path_label"]) ??
    getString(privacyChoicePathEvidence, ["selectedLabel", "selected_label"]) ??
    getString(cpraEvidence, ["optOutLinkText", "opt_out_link_text"]);
  const optOutPathUrl =
    getString(californiaEvidence, ["doNotSellSharePathUrl", "do_not_sell_share_path_url"]) ??
    getString(privacyChoicePathEvidence, ["selectedUrl", "selected_url"]) ??
    getString(cpraEvidence, ["optOutLinkHref", "opt_out_link_href"]);
  const advertisingSharingVendors = [
    ...getStringArray(californiaEvidence, ["advertisingSharingVendors", "advertising_sharing_vendors"]),
    ...getStringArray(cpraEvidence, ["advertisingSharingVendors", "advertising_sharing_vendors", "cbaVendorTier1", "cba_vendor_tier1", "cbaVendorTier2", "cba_vendor_tier2"])
  ].filter((value, index, values) => values.indexOf(value) === index);
  const saleShareRequestUrls = getStringArray(californiaEvidence, ["saleShareRequestUrls", "sale_share_request_urls"]);
  const saleShareCookieNames = getStringArray(californiaEvidence, ["saleShareCookieNames", "sale_share_cookie_names"]);
  const privacyChoiceSearchUrls = getStringArray(cpraEvidence, ["privacyChoiceSearchUrls", "privacy_choice_search_urls", "gpcOptOutDiscoveryAttemptUrls", "gpc_opt_out_discovery_attempt_urls"]);
  const cpraChoiceControlsInspected = getBoolean(cpraEvidence, ["choiceControlsInspected", "choice_controls_inspected"]);
  const cpraOptOutUiResult = getString(cpraEvidence, ["optOutUiResult", "opt_out_ui_result"]);
  const cpraPolicyCbaLanguage = getString(cpraEvidence, ["policyCbaLanguage", "policy_cba_language"]);
  const cpraScanOriginGeo = getString(cpraEvidence, ["scanOriginGeo", "scan_origin_geo"]);
  const saleShareApplicabilityEvidence = {
    advertisingSharingVendors,
    saleShareCookieNames,
    saleShareRequestUrls,
    targetedAdvertisingSignalsObserved
  };
  const saleShareControlEvidence = {
    choiceControlsInspected: cpraChoiceControlsInspected,
    cpraChoiceControlsInspected,
    cpraOptOutUiResult,
    cpraPolicyCbaLanguage,
    cpraScanOriginGeo,
    doNotSellSharePathObserved,
    optOutUiResult: cpraOptOutUiResult,
    optOutPathLabel,
    optOutPathUrl,
    policyCbaLanguage: cpraPolicyCbaLanguage,
    privacyChoicePathEvidence,
    privacyChoiceInteractionEvidence,
    privacyChoiceSearchUrls,
    scanOriginGeo: cpraScanOriginGeo
  };
  outcomes.do_not_sell_share_availability = targetedAdvertisingSignalsObserved === false
    ? makeOutcome("do_not_sell_share_availability", "not_applicable", "No sale/share or targeted-advertising runtime signal was retained in the tested context.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
      })
    : targetedAdvertisingSignalsObserved === true && doNotSellSharePathObserved === true
      ? makeOutcome("do_not_sell_share_availability", "observed", "A Do Not Sell or Share, Privacy Choices, or equivalent opt-out path was retained.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path observed"), {
          retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
        })
      : targetedAdvertisingSignalsObserved === true && doNotSellSharePathObserved === false
        ? makeOutcome("do_not_sell_share_availability", "potential_gap", "Targeted-advertising or sale/share-like runtime signals were retained, but no clear opt-out path was observed.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path not observed"), {
            retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
          })
        : makeOutcome("do_not_sell_share_availability", "not_testable", "Opt-out path availability could not be resolved because runtime sale/share relevance or control discovery evidence was incomplete.", [], {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved", "boolean targeted advertising/sale-share signal", targetedAdvertisingSignalsObserved, "Required to determine whether an opt-out path is applicable."),
              sourceGap("californiaPrivacyEvidence.doNotSellSharePathObserved", "boolean opt-out path observation", doNotSellSharePathObserved, "Required to determine whether an opt-out path was retained.")
            ]
          });

  const gpcTestRan = getBoolean(californiaEvidence, ["gpcTestRan", "gpc_test_ran"]) ?? Boolean(gpcEvidence);
  const gpcSignalSent = getBoolean(californiaEvidence, ["gpcSignalSent", "gpc_signal_sent"]) ?? getBoolean(gpcEvidence, ["gpcScanStateSent", "gpcRequestHeadersApplied"]);
  const gpcRecognitionObserved = getBoolean(californiaEvidence, ["gpcRecognitionObserved", "gpc_recognition_observed"]) ??
    (getString(gpcEvidence, ["status"]) === "honored" ? true : getString(gpcEvidence, ["status"]) === "ignored" ? false : null);
  const gpcComparisonEvidence = {
    baselineThirdPartyCookieCount: getNumber(gpcEvidence, ["baselineThirdPartyCookieCount", "baseline_third_party_cookie_count"]),
    baselineTrackerCount: getNumber(gpcEvidence, ["baselineTrackerCount", "baseline_tracker_count"]),
    evidenceUrls: getStringArray(gpcEvidence, ["evidenceUrls", "evidence_urls"]),
    gpcRecognitionObserved,
    gpcSignalSent,
    gpcStatus: getString(gpcEvidence, ["status"]),
    gpcTestRan,
    gpcThirdPartyCookieCount: getNumber(gpcEvidence, ["gpcThirdPartyCookieCount", "gpc_third_party_cookie_count"]),
    gpcTrackerCount: getNumber(gpcEvidence, ["gpcTrackerCount", "gpc_tracker_count"]),
    policyMentions: getStringArray(gpcEvidence, ["policyMentions", "policy_mentions"]),
    thirdPartyCookieCountDelta: getNumber(gpcEvidence, ["thirdPartyCookieCountDelta", "third_party_cookie_count_delta"]),
    trackerCountDelta: getNumber(gpcEvidence, ["trackerCountDelta", "tracker_count_delta"])
  };
  outcomes.gpc_opt_out_signal_handling = !gpcTestRan
    ? makeOutcome("gpc_opt_out_signal_handling", "not_testable", "The retained scan context did not include a usable GPC or opt-out preference signal test.", getEvidenceRefs(californiaEvidence), {
        missingOrIncompleteSourceSignals: [
          sourceGap("californiaPrivacyEvidence.gpcTestRan", true, gpcTestRan, "Required before CertScore can evaluate GPC handling.")
        ],
        retainedEvidence: gpcComparisonEvidence
      })
    : gpcSignalSent === true && gpcRecognitionObserved === true
      ? makeOutcome("gpc_opt_out_signal_handling", "observed", "A GPC or opt-out preference signal was sent and evidence of handling or recognition was retained.", getEvidenceRefs(californiaEvidence, "GPC handling observed"), {
          retainedEvidence: gpcComparisonEvidence
        })
      : gpcSignalSent === true && gpcRecognitionObserved === false && targetedAdvertisingSignalsObserved === true
        ? makeOutcome("gpc_opt_out_signal_handling", "potential_gap", "A GPC signal was sent while targeted-advertising signals were relevant, but no honoring or recognition evidence was retained.", getEvidenceRefs(californiaEvidence, "GPC signal not honored"), {
            retainedEvidence: { ...gpcComparisonEvidence, ...saleShareApplicabilityEvidence }
          })
        : makeOutcome("gpc_opt_out_signal_handling", "review_signal", "GPC handling evidence was retained but remained ambiguous or partial.", getEvidenceRefs(californiaEvidence, "GPC handling ambiguous"), {
            retainedEvidence: gpcComparisonEvidence
          });

  outcomes.targeted_advertising_signals = targetedAdvertisingSignalsObserved === true
    ? makeOutcome("targeted_advertising_signals", "review_signal", "Targeted advertising, cross-context tracking, or sale/share-like runtime signals were retained.", getEvidenceRefs(californiaEvidence, "Targeted advertising signal observed"), {
        retainedEvidence: saleShareApplicabilityEvidence
      })
    : targetedAdvertisingSignalsObserved === false
      ? makeOutcome("targeted_advertising_signals", "not_observed", "No eligible targeted advertising or cross-context tracking signal was retained.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: saleShareApplicabilityEvidence
        })
      : makeOutcome("targeted_advertising_signals", "not_testable", "Runtime vendor classification was unavailable or incomplete for California targeted-advertising review.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved", "boolean targeted advertising signal", "missing", "Required to evaluate targeted advertising/cross-context behavioral advertising signals.")
          ]
        });

  const disclosureAlignment = getString(californiaEvidence, ["policyRuntimeDisclosureAlignment", "policy_runtime_disclosure_alignment"]);
  const disclosureAlignmentEvidence = {
    advertisingSharingVendors,
    disclosureAlignment,
    policyRuntimeDisclosureSnippets: getStringArray(californiaEvidence, ["policyRuntimeDisclosureSnippets", "policy_runtime_disclosure_snippets"]),
    saleShareRequestUrls,
    unmatchedRuntimeDisclosureVendors: getStringArray(californiaEvidence, ["unmatchedRuntimeDisclosureVendors", "unmatched_runtime_disclosure_vendors"])
  };
  outcomes.sale_share_disclosure_alignment = disclosureAlignment === "aligned"
    ? makeOutcome("sale_share_disclosure_alignment", "observed", "Observed runtime vendor categories appeared aligned with reviewed public disclosures.", getEvidenceRefs(californiaEvidence, "Disclosure alignment retained"), {
        retainedEvidence: disclosureAlignmentEvidence
      })
    : disclosureAlignment === "gap_observed"
      ? makeOutcome("sale_share_disclosure_alignment", "potential_gap", "Material sale/share or adtech runtime signals were retained without clear corresponding disclosure alignment.", getEvidenceRefs(californiaEvidence, "Disclosure alignment gap"), {
          retainedEvidence: disclosureAlignmentEvidence
        })
      : disclosureAlignment === "review"
        ? makeOutcome("sale_share_disclosure_alignment", "review_signal", "Runtime vendor and disclosure alignment requires human review from retained evidence.", getEvidenceRefs(californiaEvidence, "Disclosure alignment review"), {
            retainedEvidence: disclosureAlignmentEvidence
          })
        : makeOutcome("sale_share_disclosure_alignment", "not_testable", "Privacy disclosures or runtime vendor evidence were unavailable for sale/share disclosure alignment.", getEvidenceRefs(californiaEvidence), {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.policyRuntimeDisclosureAlignment", "aligned | gap_observed | review", disclosureAlignment, "Required to evaluate sale/share disclosure alignment.")
            ],
            retainedEvidence: { disclosureAlignment }
          });

  const sensitivePiContextObserved = getBoolean(californiaEvidence, ["sensitivePiContextObserved", "sensitive_pi_context_observed"]);
  const limitUsePathObserved = getBoolean(californiaEvidence, ["limitUseSensitivePiPathObserved", "limit_use_sensitive_pi_path_observed"]);
  const sensitivePiEvidence = {
    limitUsePathLabel: getString(californiaEvidence, ["limitUseSensitivePiPathLabel", "limit_use_sensitive_pi_path_label"]),
    limitUsePathObserved,
    limitUsePathUrl: getString(californiaEvidence, ["limitUseSensitivePiPathUrl", "limit_use_sensitive_pi_path_url"]),
    sensitivePiCategories: getStringArray(californiaEvidence, ["sensitivePiCategories", "sensitive_pi_categories"]),
    sensitivePiContextObserved,
    sensitivePiContextUrls: getStringArray(californiaEvidence, ["sensitivePiContextUrls", "sensitive_pi_context_urls"]),
    sensitiveThirdPartyTrackingObserved: getBoolean(californiaEvidence, ["sensitiveThirdPartyTrackingObserved", "sensitive_third_party_tracking_observed"]),
    sensitiveThirdPartyTrackingRequestUrls: getStringArray(californiaEvidence, ["sensitiveThirdPartyTrackingRequestUrls", "sensitive_third_party_tracking_request_urls"]),
    sensitiveThirdPartyTrackingVendors: getStringArray(californiaEvidence, ["sensitiveThirdPartyTrackingVendors", "sensitive_third_party_tracking_vendors"])
  };
  outcomes.limit_use_sensitive_pi = sensitivePiContextObserved === false
    ? makeOutcome("limit_use_sensitive_pi", "not_applicable", "No eligible sensitive personal information collection context was retained.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: sensitivePiEvidence
      })
    : sensitivePiContextObserved === true && limitUsePathObserved === true
      ? makeOutcome("limit_use_sensitive_pi", "observed", "A Limit Use of Sensitive Personal Information or equivalent path was retained for a sensitive PI context.", getEvidenceRefs(californiaEvidence, "Limit use path observed"), {
          retainedEvidence: sensitivePiEvidence
        })
      : sensitivePiContextObserved === true && limitUsePathObserved === false
        ? makeOutcome("limit_use_sensitive_pi", "potential_gap", "Sensitive personal information context was retained, but no Limit Use path was observed.", getEvidenceRefs(californiaEvidence, "Limit use path not observed"), {
            retainedEvidence: sensitivePiEvidence
          })
        : makeOutcome("limit_use_sensitive_pi", "not_testable", "Sensitive PI context or Limit Use path evidence was incomplete.", [], {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.sensitivePiContextObserved", "boolean sensitive PI context", sensitivePiContextObserved, "Required to determine whether Limit Use controls are applicable."),
              sourceGap("californiaPrivacyEvidence.limitUseSensitivePiPathObserved", "boolean Limit Use path observation", limitUsePathObserved, "Required when sensitive PI context is observed.")
            ]
          });

  outcomes.opt_out_friction_dark_patterns = doNotSellSharePathObserved !== true
    ? makeOutcome("opt_out_friction_dark_patterns", "not_testable", "No opt-out path was available or exercised, so opt-out friction could not be evaluated.", getEvidenceRefs(californiaEvidence), {
        missingOrIncompleteSourceSignals: [
          sourceGap("californiaPrivacyEvidence.doNotSellSharePathObserved", true, doNotSellSharePathObserved, "Required before opt-out friction can be tested.")
        ],
        retainedEvidence: {
          ...saleShareControlEvidence,
          optOutFrictionSignals: getStringArray(californiaEvidence, ["optOutFrictionSignals", "opt_out_friction_signals"]),
          privacyChoiceInteractionEvidence
        }
      })
    : makeOutcome("opt_out_friction_dark_patterns", "review_signal", "An opt-out path was retained; review retained consent/choice path evidence for friction, imbalance, or confusing labels.", getEvidenceRefs(californiaEvidence, "Opt-out path retained for friction review"), {
        retainedEvidence: {
          ...saleShareControlEvidence,
          optOutFrictionSignals: getStringArray(californiaEvidence, ["optOutFrictionSignals", "opt_out_friction_signals"]),
          privacyChoiceInteractionEvidence
        }
      });

  const optOutInteractionConfirmed = getBoolean(californiaEvidence, ["optOutInteractionConfirmed", "opt_out_interaction_confirmed"]);
  const postOptOutTrackingReductionObserved = getBoolean(californiaEvidence, ["postOptOutTrackingReductionObserved", "post_opt_out_tracking_reduction_observed"]);
  const postOptOutTrackingPersisted = getBoolean(californiaEvidence, ["postOptOutTrackingPersisted", "post_opt_out_tracking_persisted"]);
  const postOptOutTrackingEvidence = {
    optOutInteractionConfirmed,
    postOptOutPersistedVendors: getStringArray(californiaEvidence, ["postOptOutPersistedVendors", "post_opt_out_persisted_vendors"]),
    postOptOutRequestUrls: getStringArray(californiaEvidence, ["postOptOutRequestUrls", "post_opt_out_request_urls"]),
    postOptOutTrackingPersisted,
    postOptOutTrackingReductionObserved,
    privacyChoiceInteractionEvidence
  };
  outcomes.post_opt_out_tracking_behavior = optOutInteractionConfirmed !== true
    ? makeOutcome("post_opt_out_tracking_behavior", "not_testable", "No confirmed opt-out or reject action was captured, so post-opt-out tracking behavior could not be evaluated.", getEvidenceRefs(californiaEvidence), {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "californiaPrivacyEvidence.optOutInteractionConfirmed",
            true,
            optOutInteractionConfirmed,
            privacyChoiceInteractionEvidence
              ? "Privacy-choice path exercise was retained, but no confirmed opt-out/reject action with a post-choice tracking window was captured."
              : "Required before CertScore can evaluate post-opt-out tracking behavior."
          )
        ],
        retainedEvidence: postOptOutTrackingEvidence
      })
    : postOptOutTrackingPersisted === true
      ? makeOutcome("post_opt_out_tracking_behavior", "potential_gap", "Targeted advertising or non-essential tracking appeared to persist after a confirmed opt-out/reject action.", getEvidenceRefs(californiaEvidence, "Post-opt-out tracking persisted"), {
          retainedEvidence: postOptOutTrackingEvidence
        })
      : postOptOutTrackingReductionObserved === true
        ? makeOutcome("post_opt_out_tracking_behavior", "observed", "Tracking reduction was observed after a confirmed opt-out/reject action.", getEvidenceRefs(californiaEvidence, "Post-opt-out tracking reduction observed"), {
            retainedEvidence: postOptOutTrackingEvidence
          })
        : makeOutcome("post_opt_out_tracking_behavior", "review_signal", "Post-opt-out tracking behavior was retained but remained ambiguous.", getEvidenceRefs(californiaEvidence), {
            retainedEvidence: postOptOutTrackingEvidence
          });

  outcomes.sensitive_forms_third_party_tracking = sensitivePiContextObserved === true && targetedAdvertisingSignalsObserved === true
    ? makeOutcome("sensitive_forms_third_party_tracking", "review_signal", "A sensitive or high-risk collection context appeared alongside third-party tracking signals in the tested context.", getEvidenceRefs(californiaEvidence, "Sensitive context with third-party tracking signal"), {
        retainedEvidence: { ...sensitivePiEvidence, ...saleShareApplicabilityEvidence }
      })
    : sensitivePiContextObserved === false || targetedAdvertisingSignalsObserved === false
      ? makeOutcome("sensitive_forms_third_party_tracking", "not_observed", "No eligible sensitive form and third-party tracking correlation was retained.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: { ...sensitivePiEvidence, ...saleShareApplicabilityEvidence }
        })
      : makeOutcome("sensitive_forms_third_party_tracking", "not_testable", "Form/sensitive field detection or runtime tracking classification was unavailable or incomplete.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.sensitivePiContextObserved", "boolean sensitive PI context", sensitivePiContextObserved, "Required to evaluate sensitive-form tracking correlation."),
            sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved", "boolean targeted advertising signal", targetedAdvertisingSignalsObserved, "Required to evaluate sensitive-form tracking correlation.")
          ]
        });

  const rightsRequestMethodObserved = getBoolean(californiaEvidence, [
    "consumerRightsRequestMethodObserved",
    "consumer_rights_request_method_observed",
    "rightsRequestMethodObserved",
    "rights_request_method_observed"
  ]);
  const rightsRequestMethodUrls = getStringArray(californiaEvidence, [
    "consumerRightsRequestMethodUrls",
    "consumer_rights_request_method_urls",
    "rightsRequestMethodUrls",
    "rights_request_method_urls"
  ]);
  const rightsRequestMethodTypes = getStringArray(californiaEvidence, [
    "consumerRightsRequestMethodTypes",
    "consumer_rights_request_method_types",
    "rightsRequestMethodTypes",
    "rights_request_method_types"
  ]);
  const rightsRequestMethodSnippets = getStringArray(californiaEvidence, [
    "consumerRightsRequestMethodSnippets",
    "consumer_rights_request_method_snippets",
    "rightsRequestMethodSnippets",
    "rights_request_method_snippets"
  ]);
  const rightsMethodEvidence = {
    consumerRightsRequestMethodObserved: rightsRequestMethodObserved,
    consumerRightsRequestMethodSnippets: rightsRequestMethodSnippets,
    consumerRightsRequestMethodTypes: rightsRequestMethodTypes,
    consumerRightsRequestMethodUrls: rightsRequestMethodUrls,
    rightsRequestMethodObserved,
    rightsRequestMethodSnippets,
    rightsRequestMethodTypes,
    rightsRequestMethodUrls
  };
  const rightsMethodApplicabilityObserved = privacyNoticeObserved === true || privacyNoticeUrls.length > 0;
  outcomes.consumer_rights_request_methods = rightsRequestMethodObserved === true
    ? makeOutcome("consumer_rights_request_methods", "observed", "A consumer rights request method or privacy request path was retained.", getEvidenceRefs(californiaEvidence, "Consumer rights request method observed"), {
        retainedEvidence: rightsMethodEvidence
      })
    : rightsRequestMethodObserved === false && rightsMethodApplicabilityObserved
      ? makeOutcome("consumer_rights_request_methods", "potential_gap", "A public privacy notice context was retained, but no consumer rights request method was observed in the tested context.", getEvidenceRefs(californiaEvidence, "Consumer rights request method not observed"), {
          retainedEvidence: { ...rightsMethodEvidence, privacyNoticeObserved, privacyNoticeUrls }
        })
      : makeOutcome("consumer_rights_request_methods", "not_testable", "Consumer rights request-method evidence was unavailable or incomplete.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.consumerRightsRequestMethodObserved", "boolean consumer rights request method observation", rightsRequestMethodObserved, "Required to evaluate consumer rights request-method availability."),
            sourceGap("californiaPrivacyEvidence.privacyNoticeObserved", true, privacyNoticeObserved, "Required before absence of rights request methods can be treated as a potential gap rather than a coverage limitation.")
          ],
          retainedEvidence: { ...rightsMethodEvidence, privacyNoticeObserved, privacyNoticeUrls }
        });

  const accessibilityIssueObserved = getBoolean(californiaEvidence, ["privacyControlAccessibilityIssueObserved", "privacy_control_accessibility_issue_observed"]);
  const privacyControlAccessibilityEvidence = {
    accessibilityIssueObserved,
    affectedControlLabels: getStringArray(californiaEvidence, ["affectedControlLabels", "affected_control_labels"]),
    affectedControlRoles: getStringArray(californiaEvidence, ["affectedControlRoles", "affected_control_roles"]),
    affectedControlTypes: getStringArray(californiaEvidence, ["affectedControlTypes", "affected_control_types"]),
    affectedSelectors: getStringArray(californiaEvidence, ["affectedSelectors", "affected_selectors"]),
    affectedUrls: getStringArray(californiaEvidence, ["affectedUrls", "affected_urls"]),
    buttonNameIssueCount: getNumber(californiaEvidence, ["buttonNameIssueCount", "button_name_issue_count"]),
    controlAccessibilityIssueCount: getNumber(californiaEvidence, ["controlAccessibilityIssueCount", "control_accessibility_issue_count"]),
    controlScopeConfidence: getString(californiaEvidence, ["controlScopeConfidence", "control_scope_confidence"]),
    linkNameIssueCount: getNumber(californiaEvidence, ["linkNameIssueCount", "link_name_issue_count"]),
    privacyControlAccessibilitySignals: getStringArray(californiaEvidence, ["privacyControlAccessibilitySignals", "privacy_control_accessibility_signals"])
  };
  outcomes.privacy_control_accessibility = accessibilityIssueObserved === true
    ? makeOutcome("privacy_control_accessibility", "review_signal", "Basic automated accessibility signals were retained for privacy controls.", getEvidenceRefs(californiaEvidence, "Privacy control accessibility signal"), {
        retainedEvidence: privacyControlAccessibilityEvidence
      })
    : accessibilityIssueObserved === false
      ? makeOutcome("privacy_control_accessibility", "observed", "No basic automated accessibility issue was retained for observed privacy controls.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: privacyControlAccessibilityEvidence
        })
      : makeOutcome("privacy_control_accessibility", "not_testable", "Privacy controls were not observed or could not be evaluated for basic accessibility signals.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.privacyControlAccessibilityIssueObserved", "boolean privacy control accessibility signal", accessibilityIssueObserved, "Required to evaluate privacy control accessibility.")
          ]
        });

  return enrichOutcomesWithNormalizedConcerns(outcomes, input.normalizedConcerns);
}
