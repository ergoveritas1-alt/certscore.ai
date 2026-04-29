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

function getObjectArrayValues(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: Array<Record<string, unknown>> = [];
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      values.push(
        ...value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      );
    }
  }

  return values;
}

function classifyCookieNameForPromotion(name: string) {
  const normalized = name.toLowerCase();
  if (/(^_ga|^_gid|^_gat|ga_|goog|gtm|plausible|analytics|amplitude|segment|mixpanel|posthog|ajs_anonymous_id)/i.test(normalized)) {
    return "analytics";
  }
  if (/(^_fbp|^_fbc|gcl_|ttclid|ttp|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|anusercookie|rtmark|doubleclick|criteo|cto_bundle|_mkto_trk|muid|fr\b|demdex|dpm\.demdex|amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check|pubmatic|krtbcookie|pugt|spugt|bidswitch|tuuid|id5|casalemedia|cmid|cmps|cmpro|gumgum|3lift|tluid|tapad|adsrvr|tdid|rubiconproject|openx|scorecardresearch|quantserve|crwdcntrl|panoramaid|_pubcid)/i.test(normalized)) {
    return "advertising";
  }
  if (/(qsi_replaysession|qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow)/i.test(normalized)) {
    return "session_replay";
  }
  return "unknown";
}

function isPromotionGradeCookieCategory(value: string | null | undefined) {
  return Boolean(value && /analytics|advertising|marketing|retargeting|session_replay/i.test(value));
}

function isConcreteHttpEvidenceUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.hostname.includes(".") &&
      !parsed.hostname.includes("_")
    );
  } catch {
    return false;
  }
}

function hasPromotionGradePreconsentCookieEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const cookieRows = getObjectArrayValues(rawEvidence, ["preconsent_cookie_evidence", "preconsentCookieEvidence"]);
  const hasBeforeConsentWrite = cookieRows.some((row) => {
    const timingEvidence = typeof row.timingEvidence === "string" ? row.timingEvidence : typeof row.timing_evidence === "string" ? row.timing_evidence : null;
    return timingEvidence === "before_consent_cookie_write";
  });
  const explicitNames = getStringArrayValues(rawEvidence, [
    "preconsent_nonessential_cookie_names",
    "preconsentNonessentialCookieNames"
  ]);
  if (hasBeforeConsentWrite && explicitNames.some((name) => {
    const category = classifyCookieNameForPromotion(name);
    return category === "analytics" || category === "advertising";
  })) {
    return true;
  }

  if (
    cookieRows.some((row) => {
      const category = typeof row.category === "string" ? row.category : null;
      const nonEssential = row.nonEssential === true || row.non_essential === true;
      const cookieName = typeof row.cookieName === "string" ? row.cookieName : typeof row.cookie_name === "string" ? row.cookie_name : null;
      const inferredCategory = cookieName ? classifyCookieNameForPromotion(cookieName) : "unknown";
      const promotionCategory = isPromotionGradeCookieCategory(category) || isPromotionGradeCookieCategory(inferredCategory);
      const timingEvidence = typeof row.timingEvidence === "string" ? row.timingEvidence : typeof row.timing_evidence === "string" ? row.timing_evidence : null;
      return promotionCategory && (nonEssential || timingEvidence === "before_consent_cookie_write") && timingEvidence === "before_consent_cookie_write";
    })
  ) {
    return true;
  }

  return hasBeforeConsentWrite && getStringArrayValues(rawEvidence, ["preconsent_cookie_names", "preconsentCookieNames"]).some((name) => {
    const category = classifyCookieNameForPromotion(name);
    return category === "analytics" || category === "advertising";
  });
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
    "runtimeEvidenceUrls",
    "sourceUrls"
  ]).filter(isConcreteHttpEvidenceUrl);

  return (
    vendors.length > 0 ||
    urls.length > 0 ||
    hasPromotionGradePreconsentCookieEvidence(rawEvidence) ||
    hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: "pre_consent" })
  );
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
    "runtimeEvidenceUrls",
    "sourceUrls"
  ]).filter(isConcreteHttpEvidenceUrl);

  return (urls.length > 0 || (vendors.length > 0 && urls.length > 0) || hasPromotionGradePreconsentCookieEvidence(rawEvidence)) && hasPreconsentSequenceEvidence(rawEvidence);
}

export function hasPreconsentSequenceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const supportingSignals = getStringArrayValues(rawEvidence, ["supportingSignals"]);
  const signalKeys = getStringArrayValues(rawEvidence, ["signalKey", "snapshotField", "unifiedFindingId"]);

  return (
    rawEvidence.preconsentTrackingDetected === true ||
    rawEvidence.preconsent_tracking_detected === true ||
    rawEvidence.trackingBeforeConsentDetected === true ||
    rawEvidence.tracking_before_consent_detected === true ||
    supportingSignals.some((value) => /pre-?consent|before consent|trackers?_before_consent/i.test(value)) ||
    signalKeys.some((value) => /preconsent|tracking_before_consent|trackers?_before_consent/i.test(value))
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

function getBooleanValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (record?.[key] === true) {
      return true;
    }
    if (record?.[key] === false) {
      return false;
    }
  }

  return null;
}

function getArtifactRefs(record: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(record, [
    "artifactRefs",
    "runtimeEvidenceArtifacts",
    "runtime_evidence_artifacts",
    "sourceArtifactRefs",
    "source_artifact_refs"
  ]);
}

function getEvidenceUrls(record: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(record, [
    "attemptedUrls",
    "evidenceUrls",
    "keyPageAttemptedUrls",
    "pageUrl",
    "pageUrls",
    "requestUrls",
    "runtimeEvidenceUrls",
    "sourceUrl",
    "sourceUrls"
  ]).filter((value) => /^https?:\/\//i.test(value));
}

function getEvidenceSnippets(record: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(record, [
    "claim",
    "description",
    "matchedSnippet",
    "observedBehavior",
    "policySnippet",
    "policySnippets",
    "policySummary",
    "policy_summary",
    "snippet",
    "snippets",
    "sourceEvidence",
    "summary"
  ]);
}

function getUrlAssessment(record: Record<string, unknown> | null | undefined) {
  const value = getRecordValue(record, ["urlAssessment", "url_assessment"]);
  return typeof value?.assessment === "string" ? value.assessment : null;
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

export function hasStrongAccessibilitySupportPathMissingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const contactMethodPresent = getBooleanValue(rawEvidence, [
    "accessibilityContactMethodPresent",
    "accessibility_contact_method_present"
  ]);
  const statementPresent = getBooleanValue(rawEvidence, [
    "accessibilityStatementPresent",
    "accessibility_statement_present"
  ]);
  if (contactMethodPresent === true || statementPresent === true) {
    return false;
  }

  const signalValue = getBooleanValue(rawEvidence, ["signalValue", "accessibilitySupportPathMissing"]);
  const explicitAbsence = contactMethodPresent === false || statementPresent === false || signalValue === true;
  const attemptedUrls = getStringArrayValues(rawEvidence, ["keyPageAttemptedUrls", "attemptedUrls"]);
  const attemptCount = getNumberValue(rawEvidence, ["keyPageAttemptCount", "key_page_attempt_count"]) ?? attemptedUrls.length;
  const discoverySource =
    typeof rawEvidence.keyPageDiscoverySource === "string"
      ? rawEvidence.keyPageDiscoverySource
      : typeof rawEvidence.key_page_discovery_source === "string"
        ? rawEvidence.key_page_discovery_source
        : null;
  const stableDiscoverySource = [
    "footer_link",
    "header_link",
    "body_link",
    "legal_hub",
    "second_hop_legal_hub"
  ].includes(discoverySource ?? "");
  const reviewerVisibleSurface =
    getArtifactRefs(rawEvidence).length > 0 ||
    getUrlAssessment(rawEvidence) === "supports_promotion" ||
    getEvidenceUrls(rawEvidence).some((value) => /accessibility|contact|help|support/i.test(value)) ||
    getEvidenceSnippets(rawEvidence).some((value) => /accessibility|accommodation|assistive|caption|support|contact/i.test(value));

  return Boolean(
    explicitAbsence &&
      (reviewerVisibleSurface || (attemptCount >= 2 && stableDiscoverySource) || (attemptCount >= 3 && attemptedUrls.length >= 2))
  );
}

export function hasStrongSaleSharingControlsMissingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const doNotSellLinkPresent = getBooleanValue(rawEvidence, [
    "doNotSellLinkPresent",
    "do_not_sell_link_present"
  ]);
  const targetedAdvertisingChoicesPresent = getBooleanValue(rawEvidence, [
    "targetedAdvertisingChoicesPresent",
    "targeted_advertising_choices_present"
  ]);
  const missingChoicePath =
    doNotSellLinkPresent === false ||
    targetedAdvertisingChoicesPresent === false ||
    getBooleanValue(rawEvidence, ["signalValue", "saleSharingControlsMissing", "sale_sharing_controls_missing"]) === true;
  if (!missingChoicePath || doNotSellLinkPresent === true || targetedAdvertisingChoicesPresent === true) {
    return false;
  }

  const policyAnchor = getRecordValue(rawEvidence, ["policyAnchor", "policy_anchor"]);
  const anchorClaimType = typeof policyAnchor?.claimType === "string" ? policyAnchor.claimType : "";
  const anchorSnippet = typeof policyAnchor?.snippet === "string" ? policyAnchor.snippet : "";
  const policyAnchorSupportsBehavior =
    /sale|sharing|share|targeted|advertis|cross-context|personalized/i.test(`${anchorClaimType} ${anchorSnippet}`) &&
    typeof policyAnchor?.sourceUrl === "string" &&
    policyAnchor.sourceUrl.length > 0;
  const disclosureSignals =
    getBooleanValue(rawEvidence, [
      "targetedAdvertisingDisclosurePresent",
      "targeted_advertising_disclosure_present",
      "thirdPartyAdvertisingDisclosurePresent",
      "third_party_advertising_disclosure_present",
      "trackingTechnologiesDisclosurePresent",
      "tracking_technologies_disclosure_present"
    ]) === true;
  const policyTextSupportsBehavior = getEvidenceSnippets(rawEvidence).some((value) =>
    /do not sell|do not share|sale or sharing|sell or share|targeted advertising|cross-context behavioral|personalized ads?|advertising partners/i.test(
      value
    )
  );
  const runtimeSupportsBehavior =
    hasConcreteRetargetingArtifact(rawEvidence) ||
    getStringArrayValues(rawEvidence, [
      "retargetingVendors",
      "runtimeVendors",
      "runtime_vendors",
      "vendorCategories",
      "vendor_categories"
    ]).some((value) => /advertis|retarget|marketing|adtech|social/i.test(value));
  const reviewerVisibleAnchor =
    policyAnchorSupportsBehavior ||
    getUrlAssessment(rawEvidence) === "supports_promotion" ||
    (getEvidenceUrls(rawEvidence).length > 0 && (policyTextSupportsBehavior || runtimeSupportsBehavior)) ||
    getArtifactRefs(rawEvidence).length > 0;

  return Boolean(
    missingChoicePath &&
      reviewerVisibleAnchor &&
      (policyAnchorSupportsBehavior || disclosureSignals || policyTextSupportsBehavior || runtimeSupportsBehavior)
  );
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

  return rows.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const row = entry as {
      detectedType?: unknown;
      evidenceStrength?: unknown;
      matchSnippet?: unknown;
      requestUrl?: unknown;
      sourceField?: unknown;
    };
    if (row.evidenceStrength === "detector_only") {
      return false;
    }

    const requestUrl = typeof row.requestUrl === "string" ? row.requestUrl : "";
    if (requestUrl.length > 0) {
      return true;
    }

    const evidenceStrength = typeof row.evidenceStrength === "string" ? row.evidenceStrength : "";
    const hasFieldEvidence =
      typeof row.detectedType === "string" &&
      row.detectedType.trim().length > 0 &&
      ((typeof row.matchSnippet === "string" && row.matchSnippet.trim().length > 0) ||
        (typeof row.sourceField === "string" && row.sourceField.trim().length > 0));

    return hasFieldEvidence && /form_field_signal|matched_signal_text|confirmed|suspected/i.test(evidenceStrength);
  });
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

export function evaluateConsentGatedTrackingConflictContract(rawEvidence: Record<string, unknown> | null | undefined): ContractDecision | null {
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
  const { policyAnchor, runtimeAnchor, conflictBridge } = contradictionEvidence;
  const allowedConflictType = getAllowedConflictType(policyAnchor.claimType, runtimeAnchor.observationType);
  const consentGatingClaim =
    policyAnchor.claimType === "only_necessary_cookies_before_choice" ||
    policyAnchor.claimType === "no_marketing_tracking_before_consent";
  const preconsentRuntime =
    runtimeAnchor.phase === "pre_consent" &&
    (runtimeAnchor.observationType === "marketing_vendor_fired_pre_consent" ||
      runtimeAnchor.observationType === "analytics_vendor_fired_pre_consent");
  const hasRuntimeRequests =
    runtimeAnchor.requests.some((value) => /^https?:\/\//i.test(value)) ||
    hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: "pre_consent" });
  const hasRuntimeVendors = runtimeAnchor.vendors.length > 0;
  const policyFetched = policyAnchor.extractionStatus === "fetched";
  const policyConfidenceOk = typeof policyAnchor.confidence !== "number" || policyAnchor.confidence >= 0.55;
  const runtimeConfidenceOk = typeof runtimeAnchor.confidence !== "number" || runtimeAnchor.confidence >= 0.55;
  const bridgeOk = Boolean(
    conflictBridge.conflictType &&
      allowedConflictType &&
      conflictBridge.conflictType === allowedConflictType &&
      conflictBridge.supportsPromotion
  );

  if (!policyFetched || !consentGatingClaim || !policyAnchor.sourceUrl || !policyAnchor.snippet || !policyConfidenceOk) {
    negativeEvidenceFlags.add("missing_policy_side_evidence");
    negativeEvidenceFlags.add("missing_specific_policy_anchor");
  }
  if (!preconsentRuntime || !hasRuntimeVendors || !runtimeConfidenceOk) {
    negativeEvidenceFlags.add("missing_behavior_side_evidence");
    negativeEvidenceFlags.add("missing_specific_runtime_anchor");
    negativeEvidenceFlags.add("runtime_tracking_review_incomplete");
  }
  if (!hasRuntimeRequests) {
    negativeEvidenceFlags.add("missing_runtime_request_url_evidence");
  }
  if (!bridgeOk) {
    negativeEvidenceFlags.add("missing_contradiction_mapping");
    negativeEvidenceFlags.add("missing_explicit_contradiction_basis");
  }
  if (hasBlockingContradictionMetaSignal(rawEvidence)) {
    negativeEvidenceFlags.add("model_suspicion_without_structured_support");
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
