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

function isBlockedOrInterstitialText(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  return /\b(?:blocked|access denied|security solution|confirm you are human|verify you are human|challenge page|captcha|cloudflare|akamai|imperva|perimeterx|email the site owner|request unsuccessful|waf|bot detection)\b/i.test(value);
}

function isBlockedOrInterstitialUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  return /(?:^|[/?&#_-])(?:blocked|captcha|challenge|interstitial|access-denied|access_denied|verify-human|confirm-human)(?:$|[/?&#=_-])/i.test(value);
}

function filterUsableUrls(values: string[]) {
  return values.filter((value) => !isBlockedOrInterstitialUrl(value));
}

function filterUsableSnippets(values: string[]) {
  return values.filter((value) => !isBlockedOrInterstitialText(value));
}

function hasBlockedOrInterstitialEvidence(input: Array<string | null | undefined>) {
  return input.some((value) => isBlockedOrInterstitialText(value) || isBlockedOrInterstitialUrl(value));
}

function isCpraSaleShareOptOutCandidate(input: {
  label: string | null;
  url: string | null;
  selectionBasis: string | null;
  contextualText?: string[];
}) {
  const label = input.label ?? "";
  const url = input.url ?? "";
  const contextualText = input.contextualText?.join(" ") ?? "";
  const haystack = `${label} ${url} ${input.selectionBasis ?? ""} ${contextualText}`;
  if (hasBlockedOrInterstitialEvidence([label, url, contextualText])) {
    return false;
  }
  if (/\bdo not sell(?: or share)?|do not share|sell or share|sale\/share|ccpa|cpra|california privacy|limit the use of my sensitive/i.test(haystack)) {
    return true;
  }
  if (/\b(?:ad choices|privacy choices|your privacy choices|opt[- ]?out|targeted advertising|interest[- ]based ads?|cross[- ]context behavioral)\b/i.test(haystack)) {
    return /\b(?:ad choices|targeted advertising|interest[- ]based ads?|cross[- ]context behavioral|sale|share|sell|ccpa|cpra|california)\b/i.test(haystack);
  }
  return false;
}

function hasConcretePrivacyChoiceInteractionEvidence(evidence: Record<string, unknown> | null) {
  if (!evidence) {
    return false;
  }
  const booleanSignals = [
    "attempted",
    "pathObserved",
    "clickAttempted",
    "clickConfirmed",
    "preferenceActionAttempted",
    "preferenceActionConfirmed",
    "preferenceCenterObserved",
    "preferenceSaveAttempted",
    "preferenceSaveConfirmed",
    "saleShareToggleObserved",
    "targetedAdvertisingToggleObserved"
  ];
  if (booleanSignals.some((key) => getBoolean(evidence, [key]) === true)) {
    return true;
  }
  const scalarSignals = [
    "finalUrl",
    "limitation",
    "outcome",
    "pageUrl",
    "preferenceActionLabel",
    "preferenceActionLimitation",
    "preferenceCenterProbeErrorCategory",
    "preferenceCenterProbeFinalUrl",
    "preferenceCenterProbeReason",
    "preferenceCenterProbeUrl",
    "preferenceSaveLabel",
    "selectedLabel",
    "selectedUrl",
    "source"
  ];
  if (scalarSignals.some((key) => hasConcreteValue(evidence[key]))) {
    return true;
  }
  const arraySignals = [
    "evidenceRefs",
    "evidenceUrls",
    "newTrackerVendors",
    "persistedTrackerVendors",
    "preferenceCenterCategoryLabels",
    "removedTrackerVendors",
    "visibleTextSnippets"
  ];
  return arraySignals.some((key) => hasConcreteValue(evidence[key]));
}

function hasPrivacyChoiceTrackingWindowEvidence(evidence: Record<string, unknown> | null) {
  if (!evidence) {
    return false;
  }
  const numericSignals = [
    "afterThirdPartyCookieCount",
    "afterTrackerCount",
    "beforeThirdPartyCookieCount",
    "beforeTrackerCount"
  ];
  if (numericSignals.some((key) => typeof evidence[key] === "number" && Number.isFinite(evidence[key]))) {
    return true;
  }
  const arraySignals = [
    "evidenceUrls",
    "newTrackerVendors",
    "persistedTrackerVendors",
    "removedTrackerVendors"
  ];
  return arraySignals.some((key) => hasConcreteValue(evidence[key]));
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
    case "cipa_sensitive_interaction_recording":
      return "cipa_interaction_recording";
    case "cipa_sensitive_communication_interception":
      return "cipa_communication_interception";
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

function addCoverageLimitationContext(
  outcomes: Record<string, CaliforniaPrivacyCoverageOutcome>,
  input: CaliforniaPrivacyCoveragePolicyInput
) {
  if (!input.coverageLimited) {
    return outcomes;
  }

  return Object.fromEntries(
    Object.entries(outcomes).map(([rowId, outcome]) => {
      if (outcome.status !== "not_testable") {
        return [rowId, outcome];
      }

      const missingOrIncompleteSourceSignals = outcome.criticalEvidence.missingOrIncompleteSourceSignals.some((gap) =>
        gap.field === "scanner.publicWebCoverage"
      )
        ? outcome.criticalEvidence.missingOrIncompleteSourceSignals
        : [
            ...outcome.criticalEvidence.missingOrIncompleteSourceSignals,
            sourceGap(
              "scanner.publicWebCoverage",
              "complete enough public-web coverage for California review",
              "coverage_limited",
              "Required to evaluate this California checklist row beyond a coverage limitation."
            )
          ];

      return [rowId, {
        ...outcome,
        criticalEvidence: {
          ...outcome.criticalEvidence,
          missingOrIncompleteSourceSignals,
          retainedEvidence: compactRecord({
            ...outcome.criticalEvidence.retainedEvidence,
            coverageLimited: true
          })
        }
      }];
    })
  );
}

function getCaliforniaEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return (
    getRecord(input.runtimeArtifacts?.californiaPrivacyEvidence) ??
    getRecord(input.runtimeArtifacts?.california_privacy_evidence) ??
    null
  );
}

function getCpraEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return (
    getRecord(input.runtimeArtifacts?.cpraCbaOptOutEvidence) ??
    getRecord(input.runtimeArtifacts?.cpra_cba_opt_out_evidence) ??
    null
  );
}

function getGpcEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return (
    getRecord(input.runtimeArtifacts?.gpcVerification) ??
    getRecord(input.runtimeArtifacts?.gpc_verification) ??
    null
  );
}

function getEvidenceRefs(californiaEvidence: Record<string, unknown> | null, ...refs: Array<string | null>) {
  return [
    ...getStringArray(californiaEvidence, ["evidenceRefs", "evidence_refs"]),
    ...refs.filter((value): value is string => Boolean(value))
  ];
}

function deriveCipaCoverageOutcome(input: {
  californiaEvidence: Record<string, unknown> | null;
  coverageLimited: boolean;
  cipaRuntimeCoverageEvidence: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  missingField: string;
  rowId: string;
  signalLabel: string;
}) {
  const cipaSensitive = getBoolean(input.evidence, ["cipaSensitive", "cipa_sensitive"]);
  const directEvidenceObserved = getBoolean(input.evidence, ["directEvidenceObserved", "direct_evidence_observed"]);
  const thirdPartyReceiptObserved = getBoolean(input.evidence, [
    "cipaThirdPartyReceiptObserved",
    "cipa_third_party_receipt_observed"
  ]);
  const sensitiveSurfaceObserved = getBoolean(input.evidence, [
    "cipaSensitiveSurfaceObserved",
    "cipa_sensitive_surface_observed"
  ]);
  const disclosureObserved = getBoolean(input.evidence, ["cipaDisclosureObserved", "cipa_disclosure_observed"]);
  const consentTiming = getString(input.evidence, ["cipaConsentTiming", "cipa_consent_timing"]);
  const confidence = getString(input.evidence, ["cipaEvidenceConfidence", "cipa_evidence_confidence"]);
  const confidenceIsMediumOrHigh = confidence === "medium" || confidence === "high";
  const signalTypes = getStringArray(input.evidence, ["cipaSignalTypes", "cipa_signal_types"]);
  const requestUrls = getStringArray(input.evidence, ["requestUrls", "request_urls"]);
  const vendors = getStringArray(input.evidence, ["vendors"]);
  const pageUrls = getStringArray(input.evidence, ["pageUrls", "page_urls"]);
  const collectionEndpointObserved = getBoolean(input.evidence, [
    "collectionEndpointObserved",
    "collection_endpoint_observed"
  ]);
  const riskTimingObserved = consentTiming === "pre_consent" || consentTiming === "post_reject";
  const timingLabel = consentTiming && consentTiming !== "unknown" ? consentTiming.replaceAll("_", " ") : "unknown timing";
  const cipaRuntimeCoverageSufficient = getBoolean(input.cipaRuntimeCoverageEvidence, [
    "sufficientForNegativeCipaReview",
    "sufficient_for_negative_cipa_review"
  ]);
  const cipaRuntimeCoverageLimitation = getString(input.cipaRuntimeCoverageEvidence, ["limitation"]);
  const retainedEvidence = {
    ...input.evidence,
    cipaSensitive,
    consentTiming,
    confidence,
    directEvidenceObserved,
    disclosureObserved,
    legalConclusion: false,
    signalTypes,
    thirdPartyReceiptObserved
  };

  if (!input.evidence) {
    return makeOutcome(input.rowId, "not_testable", `${input.signalLabel} was not retained in this scan context.`, [], {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          input.missingField,
          "retained observed CIPA-sensitive tracking evidence",
          "missing",
          "Required before CertScore can evaluate this CIPA-sensitive California row."
        )
      ]
    });
  }

  const requestPurposeClassificationRowCount = getNumber(input.cipaRuntimeCoverageEvidence, [
    "requestPurposeClassificationRowCount",
    "request_purpose_classification_row_count"
  ]);
  const cipaCoverageMateriallyBlocked =
    input.coverageLimited &&
    (
      cipaRuntimeCoverageSufficient !== true ||
      requestPurposeClassificationRowCount === 0 ||
      /blocked|challenge|captcha|interstitial/i.test(cipaRuntimeCoverageLimitation ?? "")
    );

  if (cipaSensitive === false || signalTypes.length === 0) {
    if (cipaCoverageMateriallyBlocked) {
      return makeOutcome(input.rowId, "not_testable", `${input.signalLabel} was not retained in this limited scan context.`, getEvidenceRefs(input.californiaEvidence), {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "californiaPrivacyEvidence.cipaRuntimeCoverageEvidence.sufficientForNegativeCipaReview",
            true,
            cipaRuntimeCoverageSufficient ?? "missing",
            "Required before absence of this CIPA-sensitive signal can be treated as not observed under limited public-web coverage."
          ),
          sourceGap(
            "californiaPrivacyEvidence.cipaRuntimeCoverageEvidence.requestPurposeClassificationRowCount",
            "greater than 0 when coverage is limited",
            requestPurposeClassificationRowCount ?? "missing",
            "Required to support a negative CIPA runtime review under limited or blocked coverage."
          )
        ],
        retainedEvidence: {
          ...retainedEvidence,
          cipaRuntimeCoverageEvidence: input.cipaRuntimeCoverageEvidence ?? null
        }
      });
    }

    return makeOutcome(input.rowId, "not_observed", `No ${input.signalLabel.toLowerCase()} was retained${input.coverageLimited ? " in the CIPA runtime coverage window" : ""}.`, getEvidenceRefs(input.californiaEvidence), {
      retainedEvidence: {
        ...retainedEvidence,
        cipaRuntimeCoverageEvidence: input.cipaRuntimeCoverageEvidence ?? null,
        cipaRuntimeCoverageLimitation
      }
    });
  }

  if (
    directEvidenceObserved === true &&
    collectionEndpointObserved === true &&
    thirdPartyReceiptObserved === true &&
    confidenceIsMediumOrHigh
  ) {
    return makeOutcome(input.rowId, "observed", `${input.signalLabel} was retained with direct collection-endpoint and third-party receipt evidence for CIPA review; CertScore treats this as a review signal, not a legal conclusion.`, getEvidenceRefs(input.californiaEvidence, input.signalLabel), {
      retainedEvidence: {
        ...retainedEvidence,
        collectionEndpointObserved,
        pageUrls,
        requestUrls,
        vendors
      }
    });
  }

  if (
    directEvidenceObserved === true &&
    thirdPartyReceiptObserved === true &&
    disclosureObserved === false &&
    (riskTimingObserved || sensitiveSurfaceObserved === true)
  ) {
    return makeOutcome(input.rowId, "potential_gap", `${input.signalLabel} was retained with direct third-party receipt evidence, ${timingLabel} context, and no matching disclosure observed in retained evidence.`, getEvidenceRefs(input.californiaEvidence, input.signalLabel), {
      retainedEvidence: {
        ...retainedEvidence,
        pageUrls,
        requestUrls,
        vendors
      }
    });
  }

  if (directEvidenceObserved === true || collectionEndpointObserved === true || thirdPartyReceiptObserved === true) {
    return makeOutcome(input.rowId, "observed", `${input.signalLabel} was retained with direct runtime evidence for California CIPA-sensitive tracking review.`, getEvidenceRefs(input.californiaEvidence, input.signalLabel), {
      retainedEvidence: {
        ...retainedEvidence,
        pageUrls,
        requestUrls,
        vendors
      }
    });
  }

  return makeOutcome(input.rowId, "review_signal", `${input.signalLabel} was retained as low-confidence or inferred review context; direct third-party receipt was not observed.`, getEvidenceRefs(input.californiaEvidence, input.signalLabel), {
    retainedEvidence
  });
}

type CaliforniaCipaRiskOverlayRecord = {
  evidence: Record<string, unknown>;
  evidenceField: string;
  label: string;
};

function getCipaRiskOverlayRecords(californiaEvidence: Record<string, unknown> | null): CaliforniaCipaRiskOverlayRecord[] {
  const interactionRecordingEvidence = getRecord(getValue(californiaEvidence, [
    "cipaInteractionRecordingEvidence",
    "cipa_interaction_recording_evidence"
  ]));
  const communicationInterceptionEvidence = getRecord(getValue(californiaEvidence, [
    "cipaCommunicationInterceptionEvidence",
    "cipa_communication_interception_evidence"
  ]));
  return [
    {
      evidence: interactionRecordingEvidence,
      evidenceField: "californiaPrivacyEvidence.cipaInteractionRecordingEvidence",
      label: "CIPA-sensitive interaction recording"
    },
    {
      evidence: communicationInterceptionEvidence,
      evidenceField: "californiaPrivacyEvidence.cipaCommunicationInterceptionEvidence",
      label: "CIPA-sensitive communication interception"
    }
  ].filter((record): record is CaliforniaCipaRiskOverlayRecord => Boolean(record.evidence));
}

function getCipaRiskOverlay(input: {
  records: CaliforniaCipaRiskOverlayRecord[];
  rowId: string;
}) {
  const rowTagsByRowId: Record<string, string[]> = {
    do_not_sell_share_availability: ["pre_consent_tracking", "reject_opt_out_effectiveness"],
    limit_use_sensitive_pi: ["sensitive_surface"],
    post_opt_out_tracking_behavior: ["reject_opt_out_effectiveness"],
    sale_share_disclosure_alignment: ["cookie_vendor_disclosure_gap", "cross_domain_or_interaction_event_sharing"],
    sensitive_forms_third_party_tracking: ["sensitive_surface", "session_replay_or_behavioral_analytics", "cross_domain_or_interaction_event_sharing"],
    targeted_advertising_signals: [
      "pre_consent_tracking",
      "session_replay_or_behavioral_analytics",
      "cross_domain_or_interaction_event_sharing"
    ]
  };
  const relevantTags = rowTagsByRowId[input.rowId] ?? [];
  if (relevantTags.length === 0 || input.records.length === 0) {
    return null;
  }

  const tags = new Set<string>();
  const signalTypes = new Set<string>();
  const consentTimings = new Set<string>();
  const sourceEvidenceFields = new Set<string>();
  const confidenceValues = new Set<string>();
  const labels = new Set<string>();
  let directEvidenceObserved = false;
  let thirdPartyReceiptObserved = false;
  let sensitiveSurfaceObserved = false;
  let disclosureMissingOrUnclear = false;

  for (const record of input.records) {
    const cipaSensitive = getBoolean(record.evidence, ["cipaSensitive", "cipa_sensitive"]);
    const recordSignalTypes = getStringArray(record.evidence, ["cipaSignalTypes", "cipa_signal_types"]);
    if (cipaSensitive !== true || recordSignalTypes.length === 0) {
      continue;
    }

    const consentTiming = getString(record.evidence, ["cipaConsentTiming", "cipa_consent_timing"]) ?? "unknown";
    const confidence = getString(record.evidence, ["cipaEvidenceConfidence", "cipa_evidence_confidence"]) ?? "low";
    const recordDirectEvidence = getBoolean(record.evidence, ["directEvidenceObserved", "direct_evidence_observed"]);
    const recordThirdPartyReceipt = getBoolean(record.evidence, [
      "cipaThirdPartyReceiptObserved",
      "cipa_third_party_receipt_observed"
    ]);
    const recordSensitiveSurface = getBoolean(record.evidence, [
      "cipaSensitiveSurfaceObserved",
      "cipa_sensitive_surface_observed"
    ]);
    const recordDisclosureObserved = getBoolean(record.evidence, ["cipaDisclosureObserved", "cipa_disclosure_observed"]);

    if (consentTiming === "pre_consent") tags.add("pre_consent_tracking");
    if (consentTiming === "post_reject") tags.add("reject_opt_out_effectiveness");
    if (recordSensitiveSurface === true || recordSignalTypes.includes("pixel_on_sensitive_surface")) {
      tags.add("sensitive_surface");
    }
    if (recordDisclosureObserved === false) tags.add("cookie_vendor_disclosure_gap");
    if (recordSignalTypes.some((type) => type === "session_replay" || type === "behavioral_analytics")) {
      tags.add("session_replay_or_behavioral_analytics");
    }
    if (
      recordThirdPartyReceipt === true ||
      recordDirectEvidence === true ||
      recordSignalTypes.some((type) =>
        type === "third_party_interaction_endpoint" ||
        type === "chat_widget" ||
        type === "search_interaction" ||
        type === "form_interaction"
      )
    ) {
      tags.add("cross_domain_or_interaction_event_sharing");
    }

    directEvidenceObserved = directEvidenceObserved || recordDirectEvidence === true;
    thirdPartyReceiptObserved = thirdPartyReceiptObserved || recordThirdPartyReceipt === true;
    sensitiveSurfaceObserved = sensitiveSurfaceObserved || recordSensitiveSurface === true;
    disclosureMissingOrUnclear = disclosureMissingOrUnclear || recordDisclosureObserved !== true;
    confidenceValues.add(confidence);
    consentTimings.add(consentTiming);
    labels.add(record.label);
    sourceEvidenceFields.add(record.evidenceField);
    for (const signalType of recordSignalTypes) {
      signalTypes.add(signalType);
    }
  }

  const matchingTags = relevantTags.filter((tag) => tags.has(tag));
  if (matchingTags.length === 0) {
    return null;
  }

  return compactRecord({
    annotation: "CIPA-sensitive tracking risk overlay from retained California evidence; CertScore does not make legal conclusions.",
    confidence: confidenceValues.has("high") ? "high" : confidenceValues.has("medium") ? "medium" : "low",
    consentTiming: [...consentTimings].sort(),
    directEvidenceObserved,
    disclosureMissingOrUnclear,
    legalConclusion: false,
    overlayTags: matchingTags,
    signalLabels: [...labels].sort(),
    signalTypes: [...signalTypes].sort(),
    sourceEvidenceFields: [...sourceEvidenceFields].sort(),
    sensitiveSurfaceObserved,
    thirdPartyReceiptObserved
  });
}

function annotateOutcomeWithCipaOverlay(input: {
  outcomes: Record<string, CaliforniaPrivacyCoverageOutcome>;
  records: CaliforniaCipaRiskOverlayRecord[];
  rowId: string;
}) {
  const outcome = input.outcomes[input.rowId];
  if (!outcome) {
    return;
  }
  const cipaRiskOverlay = getCipaRiskOverlay({
    records: input.records,
    rowId: input.rowId
  });
  if (!cipaRiskOverlay) {
    return;
  }
  outcome.criticalEvidence.retainedEvidence = compactRecord({
    ...outcome.criticalEvidence.retainedEvidence,
    cipaRiskOverlay
  });
}

function annotateOutcomesWithCipaRiskOverlays(
  outcomes: Record<string, CaliforniaPrivacyCoverageOutcome>,
  records: CaliforniaCipaRiskOverlayRecord[]
) {
  for (const rowId of [
    "do_not_sell_share_availability",
    "targeted_advertising_signals",
    "sale_share_disclosure_alignment",
    "limit_use_sensitive_pi",
    "post_opt_out_tracking_behavior",
    "sensitive_forms_third_party_tracking"
  ]) {
    annotateOutcomeWithCipaOverlay({ outcomes, records, rowId });
  }
  return outcomes;
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
    case "cipa_sensitive_interaction_recording":
      return ["california_privacy.cipa_interaction_recording."];
    case "cipa_sensitive_communication_interception":
      return ["california_privacy.cipa_communication_interception."];
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
  const cipaRiskOverlayRecords = getCipaRiskOverlayRecords(californiaEvidence);
  const outcomes: Record<string, CaliforniaPrivacyCoverageOutcome> = {};

  if (!input.scanCompleted) {
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
      "cipa_sensitive_interaction_recording",
      "cipa_sensitive_communication_interception",
      "consumer_rights_request_methods",
      "privacy_control_accessibility"
    ];
    for (const rowId of rows) {
      outcomes[rowId] = makeOutcome(rowId, "not_testable", "The scan did not complete, so this California privacy review row was not testable.", [], {
        missingOrIncompleteSourceSignals: [
          sourceGap("scanner.californiaPrivacyEvidence", "completed public-web California evidence packet", californiaEvidence ? "partial" : "missing", "Required before CertScore can evaluate this California checklist row.")
        ]
      });
    }
    return addCoverageLimitationContext(
      enrichOutcomesWithNormalizedConcerns(outcomes, input.normalizedConcerns),
      input
    );
  }

  const privacyNoticeObserved = getBoolean(californiaEvidence, ["privacyNoticeObserved", "privacy_notice_observed"]);
  const privacyNoticeUrls = getStringArray(californiaEvidence, ["privacyNoticeUrls", "privacy_notice_urls"]);
  const privacyNoticeSourceUrls = getStringArray(californiaEvidence, ["privacyNoticeSourceUrls", "privacy_notice_source_urls"]);
  const privacyNoticeCandidateUrls = getStringArray(californiaEvidence, ["privacyNoticeCandidateUrls", "privacy_notice_candidate_urls"]);
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
  const privacyNoticeDiscoveryRecord = getRecord(privacyNoticeDiscoveryEvidence);
  const verifiedPrivacyNoticeUrls = filterUsableUrls([
    ...getStringArray(californiaEvidence, ["verifiedPrivacyNoticeUrls", "verified_privacy_notice_urls"]),
    ...getStringArray(privacyNoticeDiscoveryRecord, ["verifiedPrivacyNoticeUrls", "verified_privacy_notice_urls"])
  ].filter((value, index, values) => values.indexOf(value) === index));
  const privacyTargetVerified = getNestedBoolean(privacyNoticeDiscoveryEvidence, ["privacyTargetVerified", "privacy_target_verified"]);
  const privacyNoticeUsedBackfill = getNestedBoolean(privacyNoticeDiscoveryEvidence, ["usedUrlscanBackfill", "used_urlscan_backfill"]);
  const privacyNoticeFailedUrls = getStringArray(privacyNoticeDiscoveryRecord, ["failedUrls", "failed_urls"]);
  const privacyNoticeBlockedUrls = [
    ...getStringArray(californiaEvidence, ["blockedPrivacyNoticeUrls", "blocked_privacy_notice_urls"]),
    ...getStringArray(privacyNoticeDiscoveryRecord, ["blockedUrls", "blocked_urls", "blockedPrivacyNoticeUrls", "blocked_privacy_notice_urls"]),
    ...privacyNoticeUrls.filter((url) => isBlockedOrInterstitialUrl(url)),
    ...privacyNoticeSourceUrls.filter((url) => isBlockedOrInterstitialUrl(url))
  ].filter((value, index, values) => values.indexOf(value) === index);
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
  const attemptedPrivacyNoticeUrls = [
    ...privacyNoticeDiscoveryUrls,
    ...getStringArray(privacyNoticeDiscoveryRecord, ["attemptedPrivacyNoticeUrls", "attempted_privacy_notice_urls", "attemptedUrls", "attempted_urls"])
  ].filter((value, index, values) => values.indexOf(value) === index);
  const privacyNoticeTargetBlocked = privacyNoticeBlockedUrls.length > 0 && verifiedPrivacyNoticeUrls.length === 0;
  const privacyNoticeRetainedEvidence = {
    attemptedPrivacyNoticeUrls,
    backfillSource: privacyNoticeUsedBackfill === true ? getString(privacyNoticeDiscoveryRecord, ["source", "backfillSource", "backfill_source"]) ?? "urlscan_backfill" : null,
    blockedPrivacyNoticeUrls: privacyNoticeBlockedUrls,
    privacyNoticeObserved,
    privacyNoticeUrls,
    privacyNoticeSourceUrls,
    californiaNoticeCueObserved,
    californiaNoticeCueText,
    privacyNoticeBlockedUrls,
    privacyNoticeCandidateUrls,
    privacyNoticeDiscoveryEvidence,
    privacyNoticeDiscoveryUrls,
    privacyNoticeFailedUrls,
    privacyNoticeUsedBackfill,
    privacyTargetVerified,
    verificationBasis: privacyTargetVerified === true ? "verified_privacy_notice_surface" : privacyNoticeTargetBlocked ? "blocked_or_interstitial_target" : null,
    verifiedPrivacyNoticeUrls
  };
  const privacyNoticeCleanlyVerified =
    privacyNoticeObserved === true &&
    verifiedPrivacyNoticeUrls.length > 0;
  outcomes.privacy_notice_availability = privacyNoticeCleanlyVerified
    ? makeOutcome("privacy_notice_availability", "observed", "A public privacy notice or privacy policy surface was retained.", getEvidenceRefs(californiaEvidence, "Privacy notice observed"), {
        retainedEvidence: privacyNoticeRetainedEvidence
      })
    : privacyNoticeTargetBlocked
      ? makeOutcome("privacy_notice_availability", "not_testable", "A privacy notice target was identified, but the retained page was blocked or interstitial, so the notice content was not verified.", getEvidenceRefs(californiaEvidence, "Privacy notice target blocked"), {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "californiaPrivacyEvidence.verifiedPrivacyNoticeUrls",
              "usable verified privacy notice URL",
              "blocked_or_interstitial",
              "Required before a privacy notice target can be counted as observed."
            )
          ],
          retainedEvidence: privacyNoticeRetainedEvidence
        })
    : privacyNoticeObserved === true
      ? makeOutcome("privacy_notice_availability", "review_signal", "A privacy notice URL was discovered, but verification was partial in this scan context.", getEvidenceRefs(californiaEvidence, "Privacy notice partially verified"), {
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
  const collectionNoticeEvidenceKind = getString(californiaEvidence, ["collectionNoticeEvidenceKind", "collection_notice_evidence_kind"]);
  const footerNoticeCueObserved = getBoolean(californiaEvidence, ["footerNoticeCueObserved", "footer_notice_cue_observed"]);
  const footerNoticeCueText = getString(californiaEvidence, ["footerNoticeCueText", "footer_notice_cue_text"]);
  const collectionRetainedEvidence = {
    collectionContextObserved,
    collectionContextUrls,
    collectionContextTypes,
    collectionEvidenceSources,
    collectionFieldContexts,
    collectionNoticeEvidenceKind,
    collectionNoticeCueObserved,
    collectionNoticeCueText,
    footerNoticeCueObserved,
    footerNoticeCueText
  };
  outcomes.notice_at_collection =
    collectionNoticeEvidenceKind === "collection_form_with_notice" ||
    collectionNoticeEvidenceKind === "verified_notice_at_point_of_collection"
    ? makeOutcome("notice_at_collection", "observed", "A collection-context privacy notice or disclosure cue was retained where relevant.", getEvidenceRefs(californiaEvidence, "Collection notice cue observed"), {
        retainedEvidence: collectionRetainedEvidence
      })
    : collectionNoticeEvidenceKind === "collection_form_without_notice"
      ? makeOutcome("notice_at_collection", "potential_gap", "An eligible collection context was retained without a nearby privacy notice or collection disclosure cue.", getEvidenceRefs(californiaEvidence, "Collection context without nearby notice cue"), {
          retainedEvidence: collectionRetainedEvidence
        })
    : collectionNoticeEvidenceKind === "generic_search_only"
      ? makeOutcome("notice_at_collection", "not_observed", "Only a generic site search collection surface was retained; no eligible point-of-collection notice was observed.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: collectionRetainedEvidence
        })
    : collectionContextObserved === false
      ? makeOutcome("notice_at_collection", "not_observed", "No eligible public collection context was observed in the tested context.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: collectionRetainedEvidence
        })
    : collectionNoticeEvidenceKind === "footer_notice_link_only"
    ? makeOutcome("notice_at_collection", "not_observed", "California/privacy notice link observed; no eligible point-of-collection surface was tested.", getEvidenceRefs(californiaEvidence, "Footer California notice cue observed"), {
        retainedEvidence: collectionRetainedEvidence
      })
    : collectionNoticeEvidenceKind === "policy_notice_text_only"
      ? makeOutcome("notice_at_collection", "review_signal", "California notice language was retained in policy text, but no point-of-collection notice was retained.", getEvidenceRefs(californiaEvidence, "Policy notice cue observed"), {
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
    ((getStringArray(cpraEvidence, ["directAdvertisingSharingVendors", "direct_advertising_sharing_vendors", "advertisingSharingVendors", "advertising_sharing_vendors"]).length > 0) ? true : null);
  const privacyChoicePathEvidence = getRecord(getValue(californiaEvidence, ["privacyChoicePathEvidence", "privacy_choice_path_evidence"]));
  const privacyChoiceInteractionEvidence = getRecord(getValue(californiaEvidence, [
    "privacyChoiceInteractionEvidence",
    "privacy_choice_interaction_evidence"
  ]));
  const privacyChoicePathObserved = getBoolean(privacyChoicePathEvidence, ["observed"]);
  const privacyChoiceSelectionBasis = getString(privacyChoicePathEvidence, ["selectionBasis", "selection_basis"]);
  const retainedDoNotSellSharePathObserved = getBoolean(californiaEvidence, ["doNotSellSharePathObserved", "do_not_sell_share_path_observed"]);
  const explicitCpraSaleShareOptOutPathObserved = getBoolean(californiaEvidence, [
    "cpraSaleShareOptOutPathObserved",
    "cpra_sale_share_opt_out_path_observed"
  ]);
  const cpraOptOutControlFound = getBoolean(cpraEvidence, ["optOutControlFound", "opt_out_control_found"]);
  const privacyChoicePathLabel =
    getString(californiaEvidence, ["privacyChoicePathLabel", "privacy_choice_path_label"]) ??
    getString(privacyChoicePathEvidence, ["selectedLabel", "selected_label"]);
  const privacyChoicePathUrl =
    getString(californiaEvidence, ["privacyChoicePathUrl", "privacy_choice_path_url"]) ??
    getString(privacyChoicePathEvidence, ["selectedUrl", "selected_url"]);
  const explicitCpraSaleShareOptOutPathLabel =
    getString(californiaEvidence, ["cpraSaleShareOptOutPathLabel", "cpra_sale_share_opt_out_path_label"]) ??
    getString(californiaEvidence, ["doNotSellSharePathLabel", "do_not_sell_share_path_label"]) ??
    getString(cpraEvidence, ["optOutLinkText", "opt_out_link_text"]);
  const explicitCpraSaleShareOptOutPathUrl =
    getString(californiaEvidence, ["cpraSaleShareOptOutPathUrl", "cpra_sale_share_opt_out_path_url"]) ??
    getString(californiaEvidence, ["doNotSellSharePathUrl", "do_not_sell_share_path_url"]) ??
    getString(cpraEvidence, ["optOutLinkHref", "opt_out_link_href"]);
  const advertisingSharingVendors = [
    ...getStringArray(californiaEvidence, ["directSaleShareOrTargetedAdvertisingVendors", "direct_sale_share_or_targeted_advertising_vendors"]),
    ...getStringArray(californiaEvidence, ["directAdvertisingSharingVendors", "direct_advertising_sharing_vendors", "advertisingSharingVendors", "advertising_sharing_vendors"]),
    ...getStringArray(cpraEvidence, ["directAdvertisingSharingVendors", "direct_advertising_sharing_vendors", "advertisingSharingVendors", "advertising_sharing_vendors"])
  ].filter((value, index, values) => values.indexOf(value) === index);
  const analyticsTagManagementVendors = [
    ...getStringArray(californiaEvidence, ["analyticsOrMeasurementVendors", "analytics_or_measurement_vendors"]),
    ...getStringArray(californiaEvidence, ["analyticsTagManagementVendors", "analytics_tag_management_vendors"]),
    ...getStringArray(cpraEvidence, ["analyticsTagManagementVendors", "analytics_tag_management_vendors"])
  ].filter((value, index, values) => values.indexOf(value) === index);
  const saleShareRequestUrls = getStringArray(californiaEvidence, [
    "directSaleShareOrTargetedAdvertisingRequestUrls",
    "direct_sale_share_or_targeted_advertising_request_urls",
    "saleShareRequestUrls",
    "sale_share_request_urls"
  ]);
  const saleShareCookieNames = getStringArray(californiaEvidence, [
    "directSaleShareOrTargetedAdvertisingCookieNames",
    "direct_sale_share_or_targeted_advertising_cookie_names",
    "saleShareCookieNames",
    "sale_share_cookie_names"
  ]);
  const analyticsOrMeasurementRequestUrls = getStringArray(californiaEvidence, ["analyticsOrMeasurementRequestUrls", "analytics_or_measurement_request_urls"]);
  const analyticsOrMeasurementCookieNames = getStringArray(californiaEvidence, ["analyticsOrMeasurementCookieNames", "analytics_or_measurement_cookie_names"]);
  const utilityOrInfrastructureRequestUrls = getStringArray(californiaEvidence, ["utilityOrInfrastructureRequestUrls", "utility_or_infrastructure_request_urls"]);
  const firstPartyRetailMediaSignalsObserved = getBoolean(californiaEvidence, [
    "firstPartyRetailMediaSignalsObserved",
    "first_party_retail_media_signals_observed"
  ]);
  const firstPartyRetailMediaRequestUrls = getStringArray(californiaEvidence, [
    "firstPartyRetailMediaRequestUrls",
    "first_party_retail_media_request_urls"
  ]);
  const firstPartyRetailMediaScriptNames = getStringArray(californiaEvidence, [
    "firstPartyRetailMediaScriptNames",
    "first_party_retail_media_script_names"
  ]);
  const rawPolicySaleShareAdmissionObserved = getBoolean(californiaEvidence, ["policySaleShareAdmissionObserved", "policy_sale_share_admission_observed"]);
  const policySaleShareAdmissionSnippet = getString(californiaEvidence, ["policySaleShareAdmissionSnippet", "policy_sale_share_admission_snippet"]);
  const policySaleShareAdmissionObserved =
    rawPolicySaleShareAdmissionObserved === true && isBlockedOrInterstitialText(policySaleShareAdmissionSnippet)
      ? false
      : rawPolicySaleShareAdmissionObserved;
  const policySaleShareAdmissionConfidence = getString(californiaEvidence, ["policySaleShareAdmissionConfidence", "policy_sale_share_admission_confidence"]);
  const highConfidencePolicySaleShareAdmissionObserved =
    policySaleShareAdmissionObserved === true && policySaleShareAdmissionConfidence === "high";
  const saleShareApplicabilityObserved =
    targetedAdvertisingSignalsObserved === true || highConfidencePolicySaleShareAdmissionObserved
      ? true
      : targetedAdvertisingSignalsObserved === false
        ? false
        : null;
  const privacyChoiceSearchUrls = getStringArray(cpraEvidence, ["privacyChoiceSearchUrls", "privacy_choice_search_urls", "gpcOptOutDiscoveryAttemptUrls", "gpc_opt_out_discovery_attempt_urls"]);
  const cpraChoiceControlsInspected = getBoolean(cpraEvidence, ["choiceControlsInspected", "choice_controls_inspected"]);
  const cpraOptOutUiResult = getString(cpraEvidence, ["optOutUiResult", "opt_out_ui_result"]);
  const cpraPolicyCbaLanguage = getString(cpraEvidence, ["policyCbaLanguage", "policy_cba_language"]);
  const cpraScanOriginGeo = getString(cpraEvidence, ["scanOriginGeo", "scan_origin_geo"]);
  const cpraSaleShareOptOutVerificationBasis =
    getString(californiaEvidence, ["cpraSaleShareOptOutVerificationBasis", "cpra_sale_share_opt_out_verification_basis"]) ??
    getString(privacyChoicePathEvidence, ["selectionBasis", "selection_basis"]) ??
    getString(cpraEvidence, ["choiceControlSearchScope", "choice_control_search_scope"]);
  const cpraSaleShareOptOutCandidateConfirmed =
    explicitCpraSaleShareOptOutPathObserved === true ||
    (
      retainedDoNotSellSharePathObserved === true &&
      !hasBlockedOrInterstitialEvidence([
        explicitCpraSaleShareOptOutPathLabel,
        explicitCpraSaleShareOptOutPathUrl
      ]) &&
      !/\bsearch history\b/i.test(`${explicitCpraSaleShareOptOutPathLabel ?? ""} ${explicitCpraSaleShareOptOutPathUrl ?? ""}`)
    ) ||
    (
      cpraOptOutControlFound === true &&
      isCpraSaleShareOptOutCandidate({
        label: explicitCpraSaleShareOptOutPathLabel ?? privacyChoicePathLabel,
        url: explicitCpraSaleShareOptOutPathUrl ?? privacyChoicePathUrl,
        selectionBasis: cpraSaleShareOptOutVerificationBasis,
        contextualText: [cpraPolicyCbaLanguage, policySaleShareAdmissionSnippet].filter((value): value is string => Boolean(value))
      })
    ) ||
    (
      privacyChoicePathObserved === true &&
      isCpraSaleShareOptOutCandidate({
        label: explicitCpraSaleShareOptOutPathLabel ?? privacyChoicePathLabel,
        url: explicitCpraSaleShareOptOutPathUrl ?? privacyChoicePathUrl,
        selectionBasis: cpraSaleShareOptOutVerificationBasis,
        contextualText: [cpraPolicyCbaLanguage, policySaleShareAdmissionSnippet].filter((value): value is string => Boolean(value))
      })
    );
  const doNotSellSharePathObserved = cpraSaleShareOptOutCandidateConfirmed
    ? true
    : explicitCpraSaleShareOptOutPathObserved === false ||
      retainedDoNotSellSharePathObserved === false ||
      cpraOptOutControlFound === false ||
      privacyChoicePathObserved === true
      ? false
      : null;
  const optOutPathLabel = cpraSaleShareOptOutCandidateConfirmed
    ? explicitCpraSaleShareOptOutPathLabel ?? privacyChoicePathLabel
    : null;
  const optOutPathUrl = cpraSaleShareOptOutCandidateConfirmed
    ? explicitCpraSaleShareOptOutPathUrl ?? privacyChoicePathUrl
    : null;
  const saleShareApplicabilityEvidence = {
    advertisingSharingVendors,
    analyticsTagManagementVendors,
    analyticsOrMeasurementCookieNames,
    analyticsOrMeasurementRequestUrls,
    policySaleShareAdmissionConfidence,
    policySaleShareAdmissionObserved,
    policySaleShareAdmissionSnippet,
    saleShareCookieNames,
    saleShareRequestUrls,
    saleShareApplicabilityObserved,
    targetedAdvertisingSignalsObserved,
    utilityOrInfrastructureRequestUrls,
    firstPartyRetailMediaSignalsObserved,
    firstPartyRetailMediaRequestUrls,
    firstPartyRetailMediaScriptNames
  };
  const saleShareControlEvidence = {
    choiceControlsInspected: cpraChoiceControlsInspected,
    cpraChoiceControlsInspected,
    cpraOptOutUiResult,
    cpraPolicyCbaLanguage,
    cpraScanOriginGeo,
    cpraSaleShareOptOutPathLabel: optOutPathLabel,
    cpraSaleShareOptOutPathObserved: doNotSellSharePathObserved,
    cpraSaleShareOptOutPathUrl: optOutPathUrl,
    cpraSaleShareOptOutVerificationBasis,
    doNotSellSharePathObserved,
    optOutUiResult: cpraOptOutUiResult,
    optOutPathLabel,
    optOutPathUrl,
    policyCbaLanguage: cpraPolicyCbaLanguage,
    privacyChoicePathEvidence,
    privacyChoicePathLabel,
    privacyChoicePathObserved,
    privacyChoicePathUrl,
    privacyChoiceInteractionEvidence,
    privacyChoiceSelectionBasis,
    privacyChoiceSearchUrls,
    scanOriginGeo: cpraScanOriginGeo
  };
  const privacyChoicePathIsUnconfirmedHomepageSelf =
    privacyChoiceSelectionBasis === "homepage_self_unconfirmed" &&
    getBoolean(privacyChoicePathEvidence, ["interactionConfirmed", "interaction_confirmed"]) !== true;
  outcomes.do_not_sell_share_availability = !californiaEvidence && !cpraEvidence
    ? makeOutcome("do_not_sell_share_availability", "not_testable", "California sale/share and privacy-choice evidence was unavailable in this scan context.", [], {
        missingOrIncompleteSourceSignals: [
          sourceGap("californiaPrivacyEvidence", "retained California privacy evidence packet", "missing", "Required before CertScore can evaluate Do Not Sell or Share applicability.")
        ],
        retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
      })
    : saleShareApplicabilityObserved === false
    ? makeOutcome("do_not_sell_share_availability", "not_applicable", "No direct sale/share, targeted-advertising, or high-confidence policy sale/share admission evidence was retained in the tested context.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
      })
    : saleShareApplicabilityObserved === true && doNotSellSharePathObserved === true && privacyChoicePathIsUnconfirmedHomepageSelf
      ? makeOutcome("do_not_sell_share_availability", "review_signal", "A privacy choice path candidate was retained, but it only resolved to the tested page and was not interaction-confirmed.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path requires review"), {
          retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
        })
    : saleShareApplicabilityObserved === true && doNotSellSharePathObserved === true
      ? makeOutcome("do_not_sell_share_availability", "observed", "A privacy choice path was retained for sale/share or targeted-advertising review.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path observed"), {
          retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
        })
      : policySaleShareAdmissionObserved === true && policySaleShareAdmissionConfidence !== "high" && targetedAdvertisingSignalsObserved !== true && doNotSellSharePathObserved === false
        ? makeOutcome("do_not_sell_share_availability", "review_signal", "The verified privacy policy may describe sale/share or targeted advertising, but no opt-out path was retained.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path requires review"), {
            retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
          })
      : saleShareApplicabilityObserved === true && doNotSellSharePathObserved === false
        ? makeOutcome("do_not_sell_share_availability", "potential_gap", policySaleShareAdmissionObserved === true && targetedAdvertisingSignalsObserved !== true
            ? "The verified privacy policy appears to describe sale/share or targeted advertising, but no opt-out path was retained."
            : "Targeted-advertising or sale/share-like runtime signals were retained, but no clear opt-out path was observed.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path not observed"), {
            retainedEvidence: { ...saleShareApplicabilityEvidence, ...saleShareControlEvidence }
          })
        : makeOutcome("do_not_sell_share_availability", "not_testable", "Opt-out path availability could not be resolved because runtime sale/share relevance or control discovery evidence was incomplete.", [], {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved or policySaleShareAdmissionObserved", "boolean targeted advertising/sale-share signal or policy admission", saleShareApplicabilityObserved, "Required to determine whether an opt-out path is applicable."),
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
    : saleShareApplicabilityObserved === false
      ? makeOutcome("gpc_opt_out_signal_handling", "not_applicable", "No direct sale/share, targeted-advertising, or high-confidence policy sale/share admission evidence was retained, so GPC handling was not applicable in this scan context.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: { ...gpcComparisonEvidence, ...saleShareApplicabilityEvidence }
        })
    : gpcSignalSent === true && gpcRecognitionObserved === true
      ? makeOutcome("gpc_opt_out_signal_handling", "observed", "A GPC or opt-out preference signal was sent and evidence of handling or recognition was retained.", getEvidenceRefs(californiaEvidence, "GPC handling observed"), {
          retainedEvidence: gpcComparisonEvidence
        })
      : gpcSignalSent === true && gpcRecognitionObserved === false && saleShareApplicabilityObserved === true
        ? makeOutcome("gpc_opt_out_signal_handling", "potential_gap", "A GPC signal was sent while targeted-advertising signals were relevant, but no honoring or recognition evidence was retained.", getEvidenceRefs(californiaEvidence, "GPC signal not honored"), {
          retainedEvidence: { ...gpcComparisonEvidence, ...saleShareApplicabilityEvidence }
        })
        : makeOutcome("gpc_opt_out_signal_handling", "review_signal", "GPC handling evidence was retained but remained ambiguous or partial.", getEvidenceRefs(californiaEvidence, "GPC handling ambiguous"), {
            retainedEvidence: gpcComparisonEvidence
          });

  outcomes.targeted_advertising_signals = targetedAdvertisingSignalsObserved === true
    ? makeOutcome("targeted_advertising_signals", "observed", "Targeted advertising, cross-context tracking, or sale/share-like runtime signals were retained.", getEvidenceRefs(californiaEvidence, "Targeted advertising signal observed"), {
        retainedEvidence: saleShareApplicabilityEvidence
      })
    : targetedAdvertisingSignalsObserved === false
      ? firstPartyRetailMediaSignalsObserved === true ||
          firstPartyRetailMediaRequestUrls.length > 0 ||
          firstPartyRetailMediaScriptNames.some((value) => /ads_core|sponsored-products-tracking|fire-pixel|display-ad-wrapper/i.test(value))
        ? makeOutcome("targeted_advertising_signals", "review_signal", "First-party retail media / sponsored-products ad stack observed; no eligible third-party targeted advertising recipient was retained.", getEvidenceRefs(californiaEvidence, "First-party retail media signal observed"), {
            retainedEvidence: saleShareApplicabilityEvidence
          })
        : saleShareApplicabilityObserved === false
        ? makeOutcome("targeted_advertising_signals", "not_observed", "No eligible targeted advertising, cross-context tracking, sale/share, or high-confidence applicability signal was retained.", getEvidenceRefs(californiaEvidence), {
            retainedEvidence: saleShareApplicabilityEvidence
          })
        : analyticsTagManagementVendors.length > 0 || analyticsOrMeasurementRequestUrls.length > 0 || analyticsOrMeasurementCookieNames.length > 0
        ? makeOutcome("targeted_advertising_signals", "review_signal", "Analytics or tag-management signals were observed, but direct CPRA sale/share evidence was not retained.", getEvidenceRefs(californiaEvidence), {
            retainedEvidence: saleShareApplicabilityEvidence
          })
        : makeOutcome("targeted_advertising_signals", "not_observed", "No eligible targeted advertising or cross-context tracking signal was retained.", getEvidenceRefs(californiaEvidence), {
            retainedEvidence: saleShareApplicabilityEvidence
          })
      : makeOutcome("targeted_advertising_signals", "not_testable", "Runtime vendor classification was unavailable or incomplete for California targeted-advertising review.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved", "boolean targeted advertising signal", "missing", "Required to evaluate targeted advertising/cross-context behavioral advertising signals.")
          ]
        });

  const disclosureAlignment = getString(californiaEvidence, ["policyRuntimeDisclosureAlignment", "policy_runtime_disclosure_alignment"]);
  const disclosureAlignmentBasis = getString(californiaEvidence, ["policyRuntimeDisclosureAlignmentBasis", "policy_runtime_disclosure_alignment_basis"]);
  const disclosureAlignmentEvidence = {
    advertisingSharingVendors,
    analyticsTagManagementVendors,
    analyticsOrMeasurementCookieNames,
    analyticsOrMeasurementRequestUrls,
    disclosureAlignment,
    disclosureAlignmentBasis,
    policySaleShareAdmissionObserved,
    policySaleShareAdmissionSnippet,
    policyRuntimeDisclosureSnippets: getStringArray(californiaEvidence, ["policyRuntimeDisclosureSnippets", "policy_runtime_disclosure_snippets"]),
    saleShareRequestUrls,
    unmatchedRuntimeDisclosureVendors: getStringArray(californiaEvidence, ["unmatchedRuntimeDisclosureVendors", "unmatched_runtime_disclosure_vendors"])
  };
  const disclosurePolicySnippets = disclosureAlignmentEvidence.policyRuntimeDisclosureSnippets;
  const unmatchedRuntimeDisclosureVendors = disclosureAlignmentEvidence.unmatchedRuntimeDisclosureVendors;
  const disclosureRuntimeEvidenceObserved = advertisingSharingVendors.length > 0 || saleShareRequestUrls.length > 0;
  const disclosureStrongGap =
    disclosureAlignment === "gap_observed" &&
    disclosureRuntimeEvidenceObserved &&
    unmatchedRuntimeDisclosureVendors.length > 0 &&
    (disclosureAlignmentBasis === "potential_gap_no_category_disclosure" ||
      disclosureAlignmentBasis === "contradiction_gap");
  outcomes.sale_share_disclosure_alignment = saleShareApplicabilityObserved === false
    ? makeOutcome("sale_share_disclosure_alignment", "not_applicable", "No direct sale/share, targeted-advertising, or high-confidence policy sale/share admission evidence was retained for disclosure-alignment review.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: disclosureAlignmentEvidence
      })
    : saleShareApplicabilityObserved === true && advertisingSharingVendors.length === 0 && saleShareRequestUrls.length === 0
      ? makeOutcome("sale_share_disclosure_alignment", "not_applicable", "No direct runtime sale/share or targeted-advertising vendor evidence was retained for disclosure-alignment review.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: disclosureAlignmentEvidence
        })
    : disclosureAlignment === "aligned" && advertisingSharingVendors.length > 0 && disclosurePolicySnippets.length > 0 && unmatchedRuntimeDisclosureVendors.length === 0
    ? makeOutcome("sale_share_disclosure_alignment", "observed", "Observed runtime vendor categories appeared aligned with reviewed public disclosures.", getEvidenceRefs(californiaEvidence, "Disclosure alignment retained"), {
        retainedEvidence: disclosureAlignmentEvidence
      })
    : disclosureAlignment === "aligned"
      ? makeOutcome("sale_share_disclosure_alignment", "review_signal", "Runtime vendor and disclosure alignment requires review from retained evidence.", getEvidenceRefs(californiaEvidence, "Disclosure alignment review"), {
          retainedEvidence: disclosureAlignmentEvidence
        })
    : disclosureStrongGap
      ? makeOutcome("sale_share_disclosure_alignment", "potential_gap", "Observed adtech vendors were not clearly matched to retained sale/share or targeted-advertising disclosures.", getEvidenceRefs(californiaEvidence, "Runtime vendor disclosure alignment review"), {
          retainedEvidence: disclosureAlignmentEvidence
        })
    : disclosureAlignment === "gap_observed"
      ? makeOutcome("sale_share_disclosure_alignment", "review_signal", "Runtime vendor disclosure alignment review requires retained policy and vendor evidence; policy sale/share language alone is not treated as a no-disclosure claim.", getEvidenceRefs(californiaEvidence, "Runtime vendor disclosure alignment review"), {
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
  const credentialOnlySensitiveContext =
    sensitivePiEvidence.sensitivePiCategories.length > 0 &&
    sensitivePiEvidence.sensitivePiCategories.every((category) => /^(?:password|credential|account_login|login)$/i.test(category));
  outcomes.limit_use_sensitive_pi = sensitivePiContextObserved === false
    ? makeOutcome("limit_use_sensitive_pi", "not_applicable", "No eligible sensitive personal information collection context was retained.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: sensitivePiEvidence
      })
    : sensitivePiContextObserved === true && credentialOnlySensitiveContext
      ? makeOutcome("limit_use_sensitive_pi", "not_applicable", "Only credential/login collection context was retained, so Limit Use of Sensitive Personal Information was not applicable in this scan context.", getEvidenceRefs(californiaEvidence, "Sensitive credential context observed"), {
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

  const optOutFrictionSignals = getStringArray(californiaEvidence, ["optOutFrictionSignals", "opt_out_friction_signals"]);
  const hasReviewablePrivacyChoiceInteraction = hasConcretePrivacyChoiceInteractionEvidence(privacyChoiceInteractionEvidence);
  outcomes.opt_out_friction_dark_patterns = doNotSellSharePathObserved === false
      ? makeOutcome("opt_out_friction_dark_patterns", "not_applicable", "No opt-out path was retained; opt-out friction review does not apply beyond the opt-out availability row.", getEvidenceRefs(californiaEvidence, "Opt-out path not observed"), {
          retainedEvidence: {
            ...saleShareControlEvidence,
            optOutFrictionSignals,
            privacyChoiceInteractionEvidence
          }
        })
    : doNotSellSharePathObserved !== true && hasReviewablePrivacyChoiceInteraction
      ? makeOutcome("opt_out_friction_dark_patterns", "review_signal", "Privacy-choice path or interaction evidence was retained, but the opt-out path/action was not clearly confirmed; review for friction or ambiguity.", getEvidenceRefs(californiaEvidence, "Privacy-choice interaction retained for friction review"), {
          retainedEvidence: {
            ...saleShareControlEvidence,
            optOutFrictionSignals,
            privacyChoiceInteractionEvidence
          }
        })
    : doNotSellSharePathObserved !== true
      ? makeOutcome("opt_out_friction_dark_patterns", "not_testable", "No opt-out path was available or exercised, so opt-out friction could not be evaluated.", getEvidenceRefs(californiaEvidence), {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.doNotSellSharePathObserved", true, doNotSellSharePathObserved, "Required before opt-out friction can be tested.")
          ],
          retainedEvidence: {
            ...saleShareControlEvidence,
            optOutFrictionSignals,
            privacyChoiceInteractionEvidence
          }
        })
    : makeOutcome("opt_out_friction_dark_patterns", "review_signal", "An opt-out path was retained; review retained consent/choice path evidence for friction, imbalance, or confusing labels.", getEvidenceRefs(californiaEvidence, "Opt-out path retained for friction review"), {
        retainedEvidence: {
          ...saleShareControlEvidence,
          optOutFrictionSignals,
          privacyChoiceInteractionEvidence
        }
      });

  const optOutInteractionConfirmed = getBoolean(californiaEvidence, ["optOutInteractionConfirmed", "opt_out_interaction_confirmed"]);
  const optOutSavedOrApplied = getBoolean(californiaEvidence, ["optOutSavedOrApplied", "opt_out_saved_or_applied"]);
  const postOptOutTrackingReductionObserved = getBoolean(californiaEvidence, ["postOptOutTrackingReductionObserved", "post_opt_out_tracking_reduction_observed"]);
  const postOptOutTrackingPersisted = getBoolean(californiaEvidence, ["postOptOutTrackingPersisted", "post_opt_out_tracking_persisted"]);
  const postOptOutDirectAdvertisingPersisted = getBoolean(californiaEvidence, ["postOptOutDirectAdvertisingPersisted", "post_opt_out_direct_advertising_persisted"]);
  const postOptOutTrackingEvidence = {
    optOutInteractionConfirmed,
    optOutSavedOrApplied,
    postOptOutDirectAdvertisingPersisted,
    postOptOutDirectAdvertisingRequestUrls: getStringArray(californiaEvidence, ["postOptOutDirectAdvertisingRequestUrls", "post_opt_out_direct_advertising_request_urls"]),
    postOptOutPersistedDirectAdvertisingVendors: getStringArray(californiaEvidence, ["postOptOutPersistedDirectAdvertisingVendors", "post_opt_out_persisted_direct_advertising_vendors"]),
    postOptOutPersistedVendors: getStringArray(californiaEvidence, ["postOptOutPersistedVendors", "post_opt_out_persisted_vendors"]),
    postOptOutRequestUrls: getStringArray(californiaEvidence, ["postOptOutRequestUrls", "post_opt_out_request_urls"]),
    postOptOutTrackingPersisted,
    postOptOutTrackingReductionObserved,
    privacyChoicePathEvidence,
    privacyChoiceInteractionEvidence
  };
  const hasPrivacyChoiceTrackingWindow = hasPrivacyChoiceTrackingWindowEvidence(privacyChoiceInteractionEvidence);
  const hasPostOptOutVendorDelta =
    postOptOutTrackingEvidence.postOptOutPersistedDirectAdvertisingVendors.length > 0 ||
    getStringArray(privacyChoiceInteractionEvidence, ["removedTrackerVendors", "removed_tracker_vendors"]).length > 0 ||
    getStringArray(privacyChoiceInteractionEvidence, ["persistedTrackerVendors", "persisted_tracker_vendors"]).length > 0;
  outcomes.post_opt_out_tracking_behavior = doNotSellSharePathObserved !== true || optOutInteractionConfirmed !== true
      ? makeOutcome("post_opt_out_tracking_behavior", "not_testable", "No confirmed opt-out or reject action was captured, so post-opt-out tracking behavior could not be evaluated.", getEvidenceRefs(californiaEvidence), {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "californiaPrivacyEvidence.cpraSaleShareOptOutPathObserved",
              true,
              doNotSellSharePathObserved,
              "Required before CertScore can evaluate post-opt-out tracking behavior."
            ),
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
    : optOutSavedOrApplied !== true
      ? makeOutcome("post_opt_out_tracking_behavior", "not_testable", "A privacy-choice interaction was retained, but CertScore did not confirm that an opt-out choice was saved or applied, so post-opt-out tracking behavior was not testable.", getEvidenceRefs(californiaEvidence, "Privacy-choice interaction retained"), {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "californiaPrivacyEvidence.optOutSavedOrApplied",
              true,
              optOutSavedOrApplied,
              "Required before CertScore can evaluate post-opt-out tracking behavior."
            )
          ],
          retainedEvidence: postOptOutTrackingEvidence
        })
    : postOptOutDirectAdvertisingPersisted === true && hasPrivacyChoiceTrackingWindow && targetedAdvertisingSignalsObserved === true
      ? makeOutcome("post_opt_out_tracking_behavior", "potential_gap", "Targeted advertising signals appeared to persist after a confirmed saved/applied opt-out action.", getEvidenceRefs(californiaEvidence, "Post-opt-out tracking persisted"), {
          retainedEvidence: postOptOutTrackingEvidence
        })
      : postOptOutTrackingReductionObserved === true &&
        targetedAdvertisingSignalsObserved === true &&
        postOptOutDirectAdvertisingPersisted !== true &&
        (hasPrivacyChoiceTrackingWindow || postOptOutTrackingPersisted === false) &&
        (hasPostOptOutVendorDelta || postOptOutTrackingPersisted === false)
        ? makeOutcome("post_opt_out_tracking_behavior", "observed", "Tracking reduction was observed after a confirmed opt-out/reject action.", getEvidenceRefs(californiaEvidence, "Post-opt-out tracking reduction observed"), {
            retainedEvidence: postOptOutTrackingEvidence
          })
        : makeOutcome("post_opt_out_tracking_behavior", "review_signal", "Post-opt-out tracking behavior was retained but remained ambiguous.", getEvidenceRefs(californiaEvidence), {
            retainedEvidence: postOptOutTrackingEvidence
          });

  outcomes.sensitive_forms_third_party_tracking = sensitivePiContextObserved === true && sensitivePiEvidence.sensitiveThirdPartyTrackingObserved === true
    ? makeOutcome("sensitive_forms_third_party_tracking", "review_signal", "A sensitive or high-risk collection context appeared alongside third-party tracking signals in the tested context.", getEvidenceRefs(californiaEvidence, "Sensitive context with third-party tracking signal"), {
        retainedEvidence: { ...sensitivePiEvidence, ...saleShareApplicabilityEvidence }
      })
    : sensitivePiContextObserved === false
      ? makeOutcome("sensitive_forms_third_party_tracking", "not_observed", "No sensitive collection surface was retained, so sensitive-form tracking was not evaluated.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: { ...sensitivePiEvidence, ...saleShareApplicabilityEvidence }
        })
      : sensitivePiEvidence.sensitiveThirdPartyTrackingObserved === false
        ? makeOutcome("sensitive_forms_third_party_tracking", "not_observed", "No third-party tracking on a retained sensitive collection surface was observed.", getEvidenceRefs(californiaEvidence), {
            retainedEvidence: { ...sensitivePiEvidence, ...saleShareApplicabilityEvidence }
          })
      : makeOutcome("sensitive_forms_third_party_tracking", "not_testable", "Form/sensitive field detection or runtime tracking classification was unavailable or incomplete.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.sensitivePiContextObserved", "boolean sensitive PI context", sensitivePiContextObserved, "Required to evaluate sensitive-form tracking correlation."),
            sourceGap("californiaPrivacyEvidence.sensitiveThirdPartyTrackingObserved", "boolean sensitive-context third-party tracking signal", sensitivePiEvidence.sensitiveThirdPartyTrackingObserved, "Required to evaluate sensitive-form tracking correlation.")
          ]
        });

  const cipaInteractionRecordingEvidence = cipaRiskOverlayRecords.find((record) =>
    record.evidenceField === "californiaPrivacyEvidence.cipaInteractionRecordingEvidence"
  )?.evidence ?? null;
  const cipaCommunicationInterceptionEvidence = cipaRiskOverlayRecords.find((record) =>
    record.evidenceField === "californiaPrivacyEvidence.cipaCommunicationInterceptionEvidence"
  )?.evidence ?? null;
  const cipaRuntimeCoverageEvidence = getRecord(getValue(californiaEvidence, [
    "cipaRuntimeCoverageEvidence",
    "cipa_runtime_coverage_evidence"
  ]));
  outcomes.cipa_sensitive_interaction_recording = deriveCipaCoverageOutcome({
    californiaEvidence,
    coverageLimited: input.coverageLimited,
    cipaRuntimeCoverageEvidence,
    evidence: cipaInteractionRecordingEvidence,
    missingField: "californiaPrivacyEvidence.cipaInteractionRecordingEvidence",
    rowId: "cipa_sensitive_interaction_recording",
    signalLabel: "CIPA-sensitive interaction recording risk signal"
  });
  outcomes.cipa_sensitive_communication_interception = deriveCipaCoverageOutcome({
    californiaEvidence,
    coverageLimited: input.coverageLimited,
    cipaRuntimeCoverageEvidence,
    evidence: cipaCommunicationInterceptionEvidence,
    missingField: "californiaPrivacyEvidence.cipaCommunicationInterceptionEvidence",
    rowId: "cipa_sensitive_communication_interception",
    signalLabel: "CIPA-sensitive third-party communication interception risk signal"
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
  const rightsRequestMethodSnippets = filterUsableSnippets(getStringArray(californiaEvidence, [
    "consumerRightsRequestMethodSnippets",
    "consumer_rights_request_method_snippets",
    "rightsRequestMethodSnippets",
    "rights_request_method_snippets"
  ]));
  const rightsLanguageObserved = getBoolean(californiaEvidence, ["rightsLanguageObserved", "rights_language_observed"]);
  const usableRightsRequestMethodUrls = filterUsableUrls(rightsRequestMethodUrls);
  const usableRightsRequestMethodTypes = rightsRequestMethodTypes.filter((value) => !isBlockedOrInterstitialText(value));
  const hasRightsMethodEvidence = usableRightsRequestMethodUrls.length > 0 || usableRightsRequestMethodTypes.length > 0 || rightsRequestMethodSnippets.length > 0;
  const rightsMethodEvidence = {
    consumerRightsRequestMethodObserved: rightsRequestMethodObserved,
    consumerRightsRequestMethodSnippets: rightsRequestMethodSnippets,
    consumerRightsRequestMethodTypes: usableRightsRequestMethodTypes,
    consumerRightsRequestMethodUrls: usableRightsRequestMethodUrls,
    rightsRequestMethodObserved,
    rightsRequestMethodSnippets,
    rightsRequestMethodTypes: usableRightsRequestMethodTypes,
    rightsLanguageObserved,
    rightsRequestMethodUrls: usableRightsRequestMethodUrls
  };
  const rightsMethodApplicabilityObserved = privacyNoticeCleanlyVerified;
  outcomes.consumer_rights_request_methods = rightsRequestMethodObserved === true && hasRightsMethodEvidence
    ? makeOutcome("consumer_rights_request_methods", "observed", "A consumer rights request method or privacy request path was retained.", getEvidenceRefs(californiaEvidence, "Consumer rights request method observed"), {
        retainedEvidence: rightsMethodEvidence
      })
    : rightsLanguageObserved === true && !hasRightsMethodEvidence
      ? makeOutcome("consumer_rights_request_methods", "not_testable", "Rights language was retained, but CertScore did not verify a usable consumer rights request method in this scan context.", getEvidenceRefs(californiaEvidence, "Consumer rights language observed"), {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "californiaPrivacyEvidence.consumerRightsRequestMethodUrls or consumerRightsRequestMethodTypes",
              "usable request form, email, toll-free number, request portal, or authenticated request flow",
              "missing",
              "Required before consumer rights request-method availability can be treated as observed."
            )
          ],
          retainedEvidence: rightsMethodEvidence
        })
    : rightsRequestMethodObserved === false && rightsMethodApplicabilityObserved
      ? makeOutcome("consumer_rights_request_methods", "not_observed", "A verified privacy notice context was retained, but no consumer rights request method was observed in this scan context.", getEvidenceRefs(californiaEvidence, "Consumer rights request method not observed"), {
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
  const privacyControlObserved = getBoolean(californiaEvidence, ["privacyControlObserved", "privacy_control_observed"]);
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
    privacyControlObserved,
    privacyControlAccessibilitySignals: getStringArray(californiaEvidence, ["privacyControlAccessibilitySignals", "privacy_control_accessibility_signals"])
  };
  outcomes.privacy_control_accessibility = accessibilityIssueObserved === true
    ? makeOutcome("privacy_control_accessibility", "potential_gap", "Basic automated accessibility issues were retained for observed privacy controls.", getEvidenceRefs(californiaEvidence, "Privacy control accessibility signal"), {
        retainedEvidence: privacyControlAccessibilityEvidence
      })
    : accessibilityIssueObserved === false && privacyControlObserved === true
      ? makeOutcome("privacy_control_accessibility", "observed", "No basic automated accessibility issue was retained for observed privacy controls.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: privacyControlAccessibilityEvidence
        })
      : makeOutcome("privacy_control_accessibility", "not_testable", "Privacy controls were not observed or could not be evaluated for basic accessibility signals.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.privacyControlAccessibilityIssueObserved", "boolean privacy control accessibility signal", accessibilityIssueObserved, "Required to evaluate privacy control accessibility.")
          ]
        });

  return addCoverageLimitationContext(
    enrichOutcomesWithNormalizedConcerns(
      annotateOutcomesWithCipaRiskOverlays(outcomes, cipaRiskOverlayRecords),
      input.normalizedConcerns
    ),
    input
  );
}
