import {
  getAllowedConflictType,
  getContradictionEvidenceBundle
} from "./contradiction-evidence-contract";
import {
  hasConcreteSanitizedNetworkEvidence
} from "./sanitized-network-evidence";

type ContractDecision = {
  allowedNarrativeTier: "weak" | "moderate" | "strong";
  externalSurfacingEligibility: "eligible" | "audit_only" | "suppress";
  negativeEvidenceFlags: string[];
  promotionEligibility: "eligible" | "internal_only" | "blocked";
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArrayValues(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    if (Array.isArray(record?.[key])) {
      for (const entry of record[key] as unknown[]) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          values.push(entry.trim());
        }
      }
    } else if (typeof record?.[key] === "string" && String(record[key]).trim().length > 0) {
      values.push(String(record[key]).trim());
    }
  }

  return uniqueStrings(values);
}

function collectStrings(value: unknown, acc: string[], depth = 0) {
  if (depth > 3 || acc.length >= 80) {
    return;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    acc.push(value.trim());
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, acc, depth + 1);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, acc, depth + 1);
    }
  }
}

function hasBlockingContradictionMetaSignal(rawEvidence: Record<string, unknown> | null | undefined) {
  const strings: string[] = [];
  collectStrings(rawEvidence, strings);
  return strings.some((value) =>
    /insufficient policy content fetched|insufficient policy content|model suspicion|possible mismatch only|semantic review incomplete/i.test(
      value
    )
  );
}

export function hasConcretePreconsentArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayValues(rawEvidence, [
    "preconsent_tracker_vendors",
    "relatedVendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  const urls = getStringArrayValues(rawEvidence, [
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeEvidenceUrls"
  ]).filter((value) => /^https?:\/\//i.test(value));

  return vendors.length > 0 || urls.length > 0 || hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: "pre_consent" });
}

export function hasStrongPreconsentRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayValues(rawEvidence, [
    "preconsent_tracker_vendors",
    "relatedVendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  const urls = getStringArrayValues(rawEvidence, [
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeEvidenceUrls"
  ]).filter((value) => /^https?:\/\//i.test(value));

  return vendors.length > 0 && urls.length > 0 && hasPreconsentSequenceEvidence(rawEvidence);
}

export function hasPreconsentSequenceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const supportingSignals = getStringArrayValues(rawEvidence, ["supportingSignals"]);

  return (
    rawEvidence.preconsentTrackingDetected === true ||
    rawEvidence.preconsent_tracking_detected === true ||
    rawEvidence.trackingBeforeConsentDetected === true ||
    rawEvidence.tracking_before_consent_detected === true ||
    supportingSignals.some((value) => /pre-?consent|before consent|trackers?_before_consent/i.test(value))
  );
}

function getNumberValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "number" && Number.isFinite(record[key])) {
      return record[key] as number;
    }
  }

  return null;
}

function getRecordValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return null;
}

export function hasStrongFingerprintingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const summary = getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]);
  const tier = getNumberValue(summary, ["tier"]) ?? getNumberValue(rawEvidence, ["fingerprintTier", "fingerprint_tier"]) ?? 0;
  const attributeCategories = getStringArrayValues(rawEvidence, [
    "fingerprintAttributeCategories",
    "fingerprint_attribute_categories"
  ]);
  const summaryAttributeCategories = getStringArrayValues(summary, ["attributeCategories", "attribute_categories"]);
  const scriptOrRequestEvidence = getStringArrayValues(rawEvidence, [
    "fingerprintArtifactRefs",
    "fingerprint_artifact_refs",
    "requestUrls",
    "runtimeEvidenceUrls",
    "scriptHosts",
    "script_hosts"
  ]).length > 0;
  const vendorEvidence = getStringArrayValues(rawEvidence, ["runtimeVendors", "runtime_vendors", "vendors"]).length > 0;
  const attributeCount = Math.max(attributeCategories.length, summaryAttributeCategories.length);

  return tier >= 3 || (tier >= 2 && attributeCount > 0 && (scriptOrRequestEvidence || vendorEvidence));
}

export function hasVerifiedConsentUiEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const consentSummary = getRecordValue(rawEvidence, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const consentVisual = getRecordValue(rawEvidence, ["hybridConsentVisual", "hybrid_consent_visual"]);
  const uiSummary = getRecordValue(rawEvidence, ["hybridUiSummary", "hybrid_ui_summary"]);
  const artifactRefs = getStringArrayValues(rawEvidence, [
    "consentUiArtifactRefs",
    "consent_ui_artifact_refs",
    "runtimeEvidenceArtifacts",
    "runtime_evidence_artifacts"
  ]);
  const explicitSurface =
    rawEvidence.consentSurfaceObserved === true ||
    rawEvidence.consent_surface_observed === true ||
    consentSummary?.bannerPresent === true;
  const specificUiFact = Boolean(
    rawEvidence.reject_button_missing === true ||
      rawEvidence.forced_consent_wall === true ||
      rawEvidence.accept_only_banner === true ||
      rawEvidence.dismiss_without_reject === true ||
      consentVisual?.ctaImbalanceDetected === true ||
      consentVisual?.acceptOnly === true ||
      consentVisual?.rejectHidden === true ||
      consentVisual?.contrastAsymmetryDetected === true ||
      consentSummary?.rejectDepthClass === "absent" ||
      consentSummary?.pageInteractionBlocked === true ||
      uiSummary?.forcedActionRequired === true
  );

  return explicitSurface && specificUiFact && artifactRefs.length > 0;
}

export function hasConcreteRuntimeArtifact(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  return getStringArrayValues(rawEvidence, keys).length > 0;
}

export function hasConcreteRetargetingArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    hasConcreteRuntimeArtifact(rawEvidence, [
      "runtimeEvidence",
      "runtimeEvidenceArtifacts",
      "runtime_evidence_artifacts",
      "retargetingEvidenceUrls",
      "retargeting_evidence_urls",
      "runtimeEvidenceUrls"
    ]) ||
    rawEvidence?.retargetingPixelArtifactPresent === true ||
    rawEvidence?.retargeting_pixel_artifact_present === true
  );
}

export function hasConcreteReplayArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    hasConcreteRuntimeArtifact(rawEvidence, [
      "session_replay_runtime_artifacts",
      "runtimeEvidence"
    ]) ||
    rawEvidence?.sessionReplayVendorArtifactPresent === true ||
    rawEvidence?.session_replay_vendor_artifact_present === true
  );
}

export function hasStrongRightsFrictionArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const optInClicks =
    typeof rawEvidence.consentOptInClicks === "number"
      ? rawEvidence.consentOptInClicks
      : typeof rawEvidence.consent_accept_click_count === "number"
        ? rawEvidence.consent_accept_click_count
        : null;
  const optOutClicks =
    typeof rawEvidence.consentOptOutClicks === "number"
      ? rawEvidence.consentOptOutClicks
      : typeof rawEvidence.consent_reject_click_count === "number"
        ? rawEvidence.consent_reject_click_count
        : null;
  const frictionDelta =
    typeof rawEvidence.consentFrictionDelta === "number" ? rawEvidence.consentFrictionDelta : null;
  const blockerText =
    typeof rawEvidence.consentBlockerTextSnippet === "string"
      ? rawEvidence.consentBlockerTextSnippet.trim()
      : null;
  const evidencePassCount =
    typeof rawEvidence.consentEvidencePassCount === "number" ? rawEvidence.consentEvidencePassCount : null;
  const policyRightsSignals = getStringArrayValues(rawEvidence, ["policyRightsSignals", "policy_rights_signals"]);

  return Boolean(
    (rawEvidence.consentRedirectOrAuthRequired === true && (evidencePassCount ?? 0) >= 2) ||
      ((rawEvidence.consentBlockerType || rawEvidence.consentBlockerUrl) &&
        (evidencePassCount ?? 0) >= 2 &&
        (blockerText?.length ?? 0) >= 40) ||
      (typeof frictionDelta === "number" &&
        frictionDelta >= 2 &&
        typeof optOutClicks === "number" &&
        optOutClicks >= 2) ||
      (typeof optInClicks === "number" &&
        typeof optOutClicks === "number" &&
        optOutClicks > optInClicks &&
        policyRightsSignals.length === 0)
  );
}

export function hasConcreteSensitivePayloadArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  const rows = Array.isArray(rawEvidence?.sensitivePayloadViolations)
    ? rawEvidence.sensitivePayloadViolations
    : Array.isArray(rawEvidence?.sensitive_payload_violations)
      ? rawEvidence.sensitive_payload_violations
      : [];

  return rows.some(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as { requestUrl?: unknown }).requestUrl === "string" &&
      ((entry as { requestUrl?: string }).requestUrl?.length ?? 0) > 0 &&
      (entry as { evidenceStrength?: unknown }).evidenceStrength !== "detector_only"
  );
}

export function evaluatePolicyBehaviorConflictContract(rawEvidence: Record<string, unknown> | null | undefined): ContractDecision | null {
  const contradictionEvidence = getContradictionEvidenceBundle(rawEvidence);
  if (!contradictionEvidence) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [
        "missing_behavior_side_evidence",
        "missing_policy_side_evidence",
        "missing_contradiction_mapping",
        "missing_explicit_contradiction_basis",
        "insufficient_evidence_for_policy_behavior_conflict"
      ],
      promotionEligibility: "internal_only"
    };
  }

  const negativeEvidenceFlags = new Set<string>();
  const policyAnchor = contradictionEvidence.policyAnchor;
  const runtimeAnchor = contradictionEvidence.runtimeAnchor;
  const conflictBridge = contradictionEvidence.conflictBridge;
  const allowedConflictType = getAllowedConflictType(policyAnchor.claimType, runtimeAnchor.observationType);
  const policyFetched = policyAnchor.extractionStatus === "fetched";
  const policyAnchorConfidenceOk = typeof policyAnchor.confidence === "number" && policyAnchor.confidence >= 0.55;
  const runtimeAnchorConfidenceOk = typeof runtimeAnchor.confidence === "number" && runtimeAnchor.confidence >= 0.55;
  const runtimeArtifactsPresent =
    runtimeAnchor.vendors.length > 0 ||
    runtimeAnchor.requests.length > 0 ||
    runtimeAnchor.cookies.length > 0 ||
    runtimeAnchor.storageArtifacts.length > 0 ||
    contradictionEvidence.runtimeEvidenceArtifacts.length > 0 ||
    hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: runtimeAnchor.phase });
  const policyAnchorPresent = Boolean(
    contradictionEvidence.evidenceSufficiency.policyAnchorPresent &&
      policyAnchor.claimType &&
      policyAnchor.sourceUrl &&
      policyAnchor.snippet &&
      policyFetched &&
      policyAnchorConfidenceOk
  );
  const runtimeAnchorPresent = Boolean(
    contradictionEvidence.evidenceSufficiency.runtimeAnchorPresent &&
      runtimeAnchor.observationType &&
      runtimeArtifactsPresent &&
      runtimeAnchor.phase !== "unknown" &&
      runtimeAnchorConfidenceOk
  );
  const conflictBridgePresent = Boolean(
    contradictionEvidence.evidenceSufficiency.conflictBridgePresent &&
      conflictBridge.conflictType &&
      allowedConflictType &&
      conflictBridge.conflictType === allowedConflictType &&
      conflictBridge.reasoning &&
      conflictBridge.supportsPromotion
  );

  if (!policyFetched) {
    negativeEvidenceFlags.add("policy_semantic_review_incomplete");
  }
  if (!policyAnchorPresent) {
    negativeEvidenceFlags.add("missing_policy_side_evidence");
    negativeEvidenceFlags.add("missing_specific_policy_anchor");
  }
  if (!runtimeAnchorPresent) {
    negativeEvidenceFlags.add("missing_behavior_side_evidence");
    negativeEvidenceFlags.add("missing_specific_runtime_anchor");
    negativeEvidenceFlags.add("runtime_tracking_review_incomplete");
  }
  if (!allowedConflictType || !conflictBridgePresent) {
    negativeEvidenceFlags.add("missing_contradiction_mapping");
  }
  if (allowedConflictType === null && runtimeAnchor.observationType && policyAnchor.claimType) {
    negativeEvidenceFlags.add("unsupported_contradiction_mapping");
  }
  if (!conflictBridge.conflictType || !conflictBridge.supportsPromotion) {
    negativeEvidenceFlags.add("missing_explicit_contradiction_basis");
  }
  if (hasBlockingContradictionMetaSignal(rawEvidence)) {
    negativeEvidenceFlags.add("model_suspicion_without_structured_support");
  }
  if (
    contradictionEvidence.evidenceSufficiency.reviewStatus !== "complete" ||
    contradictionEvidence.evidenceSufficiency.promotionEligible !== true
  ) {
    negativeEvidenceFlags.add(contradictionEvidence.evidenceSufficiency.reviewStatus);
  }

  if (negativeEvidenceFlags.size > 0) {
    negativeEvidenceFlags.add("possible_policy_runtime_mismatch");
    negativeEvidenceFlags.add("insufficient_evidence_for_policy_behavior_conflict");
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  return {
    allowedNarrativeTier: "strong",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: [],
    promotionEligibility: "eligible"
  };
}

export function evaluateConcreteRuntimeContract(input: {
  allowAuditOnlyWithoutArtifact?: boolean;
  missingFlag: string;
  originType: string;
  rawEvidence: Record<string, unknown> | null | undefined;
  hasConcreteArtifact: boolean;
}) {
  if (input.originType === "validation_rule") {
    return null;
  }

  if (!input.hasConcreteArtifact) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: input.allowAuditOnlyWithoutArtifact === false ? "suppress" : "audit_only",
      negativeEvidenceFlags: [input.missingFlag],
      promotionEligibility: input.allowAuditOnlyWithoutArtifact === false ? "blocked" : "internal_only"
    } satisfies ContractDecision;
  }

  return {
    allowedNarrativeTier: "moderate",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: [],
    promotionEligibility: "eligible"
  } satisfies ContractDecision;
}

export function evaluateStrongEvidenceContract(input: {
  blockedFlag?: string;
  missingFlag: string;
  originType: string;
  meetsThreshold: boolean;
}) {
  if (input.originType === "validation_rule") {
    return null;
  }

  if (!input.meetsThreshold) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      negativeEvidenceFlags: uniqueStrings([input.missingFlag, input.blockedFlag ?? null]),
      promotionEligibility: "blocked"
    } satisfies ContractDecision;
  }

  return null;
}
