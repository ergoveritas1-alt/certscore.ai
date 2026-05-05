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

function getObjectValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getStringArrayValuesFromEvidenceAndEntities(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return uniqueStrings([
    ...getStringArrayValues(record, keys),
    ...getStringArrayValues(getObjectValue(record, ["entities"]), keys)
  ]);
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

function getEtldPlusOneFromHostname(hostname: string | null | undefined) {
  if (!hostname) {
    return null;
  }
  const parts = hostname
    .toLowerCase()
    .split(".")
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return parts.slice(-2).join(".");
}

function collectUrlEtldPlusOne(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const output = new Set<string>();
  const inspect = (candidate: string) => {
    try {
      const parsed = new URL(candidate);
      const etld = getEtldPlusOneFromHostname(parsed.hostname);
      if (etld) {
        output.add(etld);
      }
      for (const nestedValue of parsed.searchParams.values()) {
        if (/^https?:\/\//i.test(nestedValue)) {
          inspect(nestedValue);
        }
      }
    } catch {
      // Ignore malformed or redacted URL fragments.
    }
  };

  inspect(value);
  return [...output];
}

function hasConcreteRtbObservationRow(row: Record<string, unknown>) {
  const hostname = typeof row.hostname === "string" ? row.hostname.trim() : "";
  const pathSample = typeof row.pathSample === "string" ? row.pathSample : typeof row.path_sample === "string" ? row.path_sample : "";
  const urlSample = typeof row.urlSample === "string" ? row.urlSample : typeof row.url_sample === "string" ? row.url_sample : "";
  const reason = typeof row.reason === "string" ? row.reason : "";
  const queryKeys = [
    ...getStringArrayValues(row, ["queryKeysSample", "query_keys_sample", "parameterKeys", "parameter_keys"])
  ];
  const hasSyncPattern =
    /sync|idsync|match|user[-_]?match|cookie[-_]?sync|setuid/i.test(`${hostname} ${pathSample} ${urlSample} ${reason}`) ||
    /redirect_sync|identifier_query|known_sync_host|sync_path/i.test(reason);
  const hasIdHints = queryKeys.some((key) =>
    /^(?:uid|uuid|guid|id|userid|user_id|partner|partnerid|gdpr|gdpr_consent|us_privacy|redir|redirect|callback)$/i.test(key)
  );
  return hostname.includes(".") && hasSyncPattern && (hasIdHints || /sync|idsync|match|redirect/i.test(`${pathSample} ${reason}`));
}

export function hasConcreteRtbCookieSyncEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const rows = getObjectArrayValues(rawEvidence, [
    "rtbCookieSyncObservations",
    "rtb_cookie_sync_observations",
    "rtb_cookie_sync_evidence"
  ]);
  if (rows.some(hasConcreteRtbObservationRow)) {
    return true;
  }

  const urls = getStringArrayValues(rawEvidence, ["runtimeRequestUrls", "requestUrls", "sourceUrls"]).filter(isConcreteHttpEvidenceUrl);
  return urls.some((url) => {
    try {
      const parsed = new URL(url);
      const text = `${parsed.hostname} ${parsed.pathname}`;
      return /sync|idsync|match|user[-_]?match|cookie[-_]?sync|setuid/i.test(text) &&
        [...parsed.searchParams.keys()].some((key) => /^(?:uid|uuid|guid|id|userid|user_id|partner|partnerid|gdpr|gdpr_consent|us_privacy|redir|redirect|callback)$/i.test(key));
    } catch {
      return false;
    }
  });
}

function hasConcreteCrossDomainIdentifierSharingRow(row: Record<string, unknown>) {
  const requestUrl = typeof row.requestUrlRedacted === "string"
    ? row.requestUrlRedacted
    : typeof row.request_url_redacted === "string"
      ? row.request_url_redacted
      : "";
  const key = typeof row.key === "string" ? row.key.trim() : "";
  const valueHash = typeof row.valueHash === "string"
    ? row.valueHash
    : typeof row.value_hash === "string"
      ? row.value_hash
      : "";
  const destinationEtld = typeof row.destinationEtldPlusOne === "string"
    ? row.destinationEtldPlusOne
    : typeof row.destination_etld_plus_one === "string"
      ? row.destination_etld_plus_one
      : "";
  const destinationDomain = typeof row.destinationDomain === "string"
    ? row.destinationDomain
    : typeof row.destination_domain === "string"
      ? row.destination_domain
      : "";
  const repeatedAcrossEtlds = getStringArrayValues(row, ["repeatedAcrossEtlds", "repeated_across_etlds"]);
  const sourcePageUrl = typeof row.sourcePageUrl === "string"
    ? row.sourcePageUrl
    : typeof row.source_page_url === "string"
      ? row.source_page_url
      : "";
  const involvedEtlds = uniqueStrings([
    destinationEtld,
    ...repeatedAcrossEtlds,
    ...collectUrlEtldPlusOne(sourcePageUrl),
    ...collectUrlEtldPlusOne(requestUrl)
  ]);
  const destinationClassification = typeof row.destinationClassification === "string"
    ? row.destinationClassification
    : typeof row.destination_classification === "string"
      ? row.destination_classification
      : "";
  const identifierClass = typeof row.identifierClass === "string"
    ? row.identifierClass
    : typeof row.identifier_class === "string"
      ? row.identifier_class
      : "";
  const hasPromotionVendor =
    /adtech|affiliate|analytics|identity_graph|rtb|marketing/i.test(destinationClassification) ||
    /(?:mobilefuse|undertone|bidswitch|adnxs|rlcdn|criteo|rubiconproject|pubmatic|openx|casalemedia|adsrvr|yahoo|ay\.delivery)\./i.test(
      `${destinationDomain} ${destinationEtld}`
    ) ||
    involvedEtlds.some((etld) => /(?:casalemedia|ay\.delivery|yahoo|bidswitch|mobilefuse|undertone)\.com|ay\.delivery/i.test(etld));
  const hasDurableIdentifier = /durable_id|cookie_id|affiliate_click_id|session_id|unknown_identifier/i.test(identifierClass);
  return (
    key.length > 0 &&
    /^[a-f0-9]{32,}$/i.test(valueHash) &&
    destinationEtld.includes(".") &&
    involvedEtlds.length >= 2 &&
    hasPromotionVendor &&
    hasDurableIdentifier &&
    (requestUrl.includes("[redacted]") || requestUrl.includes("%5Bredacted%5D"))
  );
}

export function hasConcreteCrossDomainIdentifierSharingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const rows = getObjectArrayValues(rawEvidence, [
    "crossDomainIdentifierSharingEvidence",
    "cross_domain_identifier_sharing_evidence"
  ]);
  if (!rows.some(hasConcreteCrossDomainIdentifierSharingRow)) {
    return false;
  }

  const categories = getStringArrayValues(rawEvidence, [
    "crossDomainIdentifierSharingDestinationCategories",
    "cross_domain_identifier_sharing_destination_categories"
  ]);
  const destinationEtlds = getStringArrayValues(rawEvidence, [
    "crossDomainIdentifierSharingDestinationEtlds",
    "cross_domain_identifier_sharing_destination_etlds"
  ]);
  const rowEtlds = uniqueStrings(
    rows.flatMap((row) => [
      typeof row.destinationEtldPlusOne === "string" ? row.destinationEtldPlusOne : null,
      typeof row.destination_etld_plus_one === "string" ? row.destination_etld_plus_one : null,
      ...getStringArrayValues(row, ["repeatedAcrossEtlds", "repeated_across_etlds"]),
      ...collectUrlEtldPlusOne(typeof row.sourcePageUrl === "string" ? row.sourcePageUrl : typeof row.source_page_url === "string" ? row.source_page_url : null),
      ...collectUrlEtldPlusOne(typeof row.requestUrlRedacted === "string" ? row.requestUrlRedacted : typeof row.request_url_redacted === "string" ? row.request_url_redacted : null)
    ])
  );
  return (
    uniqueStrings([...destinationEtlds, ...rowEtlds]).length >= 2 &&
    (
      categories.some((category) => /adtech|affiliate|analytics|identity_graph|rtb|marketing/i.test(category)) ||
      rowEtlds.some((etld) => /(?:casalemedia|ay\.delivery|yahoo|bidswitch|mobilefuse|undertone)\.com|ay\.delivery/i.test(etld))
    )
  );
}

function hasPromotionGradePreconsentCookieEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const cookieRows = getObjectArrayValues(rawEvidence, ["preconsent_cookie_evidence", "preconsentCookieEvidence"]);
  const promotionGradeRows = cookieRows.filter((row) => {
    const timingEvidence = typeof row.timingEvidence === "string" ? row.timingEvidence : typeof row.timing_evidence === "string" ? row.timing_evidence : null;
    const party = typeof row.party === "string" ? row.party : typeof row.cookiePartyType === "string" ? row.cookiePartyType : typeof row.cookie_party_type === "string" ? row.cookie_party_type : null;
    const thirdParty = row.thirdParty === true || row.third_party === true || party === "third_party";
    const category = typeof row.category === "string" ? row.category : null;
    const nonEssential = row.nonEssential === true || row.non_essential === true;
    const cookieName = typeof row.cookieName === "string" ? row.cookieName : typeof row.cookie_name === "string" ? row.cookie_name : null;
    const inferredCategory = cookieName ? classifyCookieNameForPromotion(cookieName) : "unknown";
    const promotionCategory = isPromotionGradeCookieCategory(category) || isPromotionGradeCookieCategory(inferredCategory);
    return thirdParty && promotionCategory && nonEssential && timingEvidence === "before_consent_cookie_write";
  });
  return promotionGradeRows.length > 0;
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

function getPreconsentClassifiedNonEssentialRequests(rawEvidence: Record<string, unknown> | null | undefined, input: { minConfidence?: number } = {}) {
  return getObjectArrayValues(rawEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]).filter((row) => {
    const essentiality =
      typeof row.essentiality === "string"
        ? row.essentiality
        : typeof row.classification === "string"
          ? row.classification
          : null;
    const confidence =
      typeof row.confidence === "number"
        ? row.confidence
        : typeof row.score === "number"
          ? row.score
          : null;
    const url =
      typeof row.requestUrl === "string"
        ? row.requestUrl
        : typeof row.request_url === "string"
          ? row.request_url
          : null;

    return (
      essentiality === "non_essential" &&
      (typeof input.minConfidence !== "number" || (typeof confidence === "number" && confidence >= input.minConfidence)) &&
      isConcreteHttpEvidenceUrl(url)
    );
  });
}

export function hasConcretePreconsentArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_vendors",
    "relatedVendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  const urls = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeRequestUrls",
    "runtime_request_urls",
    "runtimeEvidenceUrls",
    "runtime_evidence_urls",
    "sourceUrls"
  ]).filter(isConcreteHttpEvidenceUrl);
  const classifiedNonEssentialRequests = getPreconsentClassifiedNonEssentialRequests(rawEvidence);

  return (
    vendors.length > 0 ||
    urls.length > 0 ||
    classifiedNonEssentialRequests.length > 0 ||
    hasPromotionGradePreconsentCookieEvidence(rawEvidence) ||
    hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: "pre_consent" })
  );
}

export function hasStrongPreconsentRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_vendors",
    "relatedVendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  const urls = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeRequestUrls",
    "runtime_request_urls",
    "runtimeEvidenceUrls",
    "runtime_evidence_urls",
    "sourceUrls"
  ]).filter(isConcreteHttpEvidenceUrl);
  const classifiedNonEssentialRequests = getPreconsentClassifiedNonEssentialRequests(rawEvidence, { minConfidence: 0.7 });

  return (
    hasPromotionGradePreconsentCookieEvidence(rawEvidence) ||
    (
      classifiedNonEssentialRequests.length > 0 &&
      hasPreconsentSequenceEvidence(rawEvidence)
    )
  );
}

export function hasPreconsentSequenceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const timeline = getObjectValue(rawEvidence, ["consentTimeline", "consent_timeline"]);
  if (!timeline) {
    return false;
  }

  const firstNonEssentialRequestMs = typeof timeline?.firstNonEssentialRequestMs === "number"
    ? timeline.firstNonEssentialRequestMs
    : typeof timeline?.first_non_essential_request_ms === "number"
      ? timeline.first_non_essential_request_ms
      : null;
  const firstTrackingCookieSetMs = typeof timeline?.firstTrackingCookieSetMs === "number"
    ? timeline.firstTrackingCookieSetMs
    : typeof timeline?.first_tracking_cookie_set_ms === "number"
      ? timeline.first_tracking_cookie_set_ms
      : null;
  const firstCmpVisibleMs = typeof timeline?.firstCmpVisibleMs === "number"
    ? timeline.firstCmpVisibleMs
    : typeof timeline?.first_cmp_visible_ms === "number"
      ? timeline.first_cmp_visible_ms
      : null;
  const firstConsentActionMs = typeof timeline?.firstConsentActionMs === "number"
    ? timeline.firstConsentActionMs
    : typeof timeline?.first_consent_action_ms === "number"
      ? timeline.first_consent_action_ms
      : null;
  const firstRejectActionMs = typeof timeline?.firstRejectActionMs === "number"
    ? timeline.firstRejectActionMs
    : typeof timeline?.first_reject_action_ms === "number"
      ? timeline.first_reject_action_ms
      : null;
  const firstAcceptActionMs = typeof timeline?.firstAcceptActionMs === "number"
    ? timeline.firstAcceptActionMs
    : typeof timeline?.first_accept_action_ms === "number"
      ? timeline.first_accept_action_ms
      : null;
  const firstUserActionMs = typeof timeline?.firstUserActionMs === "number"
    ? timeline.firstUserActionMs
    : typeof timeline?.first_user_action_ms === "number"
      ? timeline.first_user_action_ms
      : null;
  const consentSurfaceObserved =
    getBooleanValue(rawEvidence, ["consentSurfaceObserved", "consent_surface_observed", "cookieBannerPresent", "consentBannerPresent"]) ??
    getBooleanValue(getObjectValue(rawEvidence, ["entities"]), ["consentSurfaceObserved", "consent_surface_observed"]);
  const consentActionableChoiceObserved =
    getBooleanValue(rawEvidence, [
      "consentActionableChoiceObserved",
      "consent_actionable_choice_observed",
      "consentRejectInteractionSucceeded",
      "consentAcceptInteractionSucceeded"
    ]) ??
    getBooleanValue(getObjectValue(rawEvidence, ["entities"]), [
      "consentActionableChoiceObserved",
      "consent_actionable_choice_observed"
    ]);
  const firstPreconsentRuntimeMs = typeof firstNonEssentialRequestMs === "number"
    ? firstNonEssentialRequestMs
    : hasPromotionGradePreconsentCookieEvidence(rawEvidence) && typeof firstTrackingCookieSetMs === "number"
      ? firstTrackingCookieSetMs
      : null;
  const hasTimelineSequence =
    typeof firstPreconsentRuntimeMs === "number" &&
    ((typeof firstCmpVisibleMs === "number" && firstPreconsentRuntimeMs < firstCmpVisibleMs) ||
      (typeof firstConsentActionMs === "number" && firstPreconsentRuntimeMs < firstConsentActionMs));
  const hasNoRecordedChoiceSequence =
    typeof firstPreconsentRuntimeMs === "number" &&
    (hasPromotionGradePreconsentCookieEvidence(rawEvidence) ||
      (consentSurfaceObserved === true && consentActionableChoiceObserved === true)) &&
    firstConsentActionMs === null &&
    firstRejectActionMs === null &&
    firstAcceptActionMs === null &&
    firstUserActionMs === null;
  return hasTimelineSequence || hasNoRecordedChoiceSequence;
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

const HIGH_ENTROPY_FINGERPRINTING_CATEGORIES = new Set([
  "audio",
  "audio_context",
  "canvas",
  "canvas_readback",
  "canvas_webgl",
  "device_memory",
  "font_metrics",
  "fonts",
  "fonts_plugins",
  "media_devices",
  "webgl"
]);

const RENDERING_FINGERPRINTING_CATEGORIES = new Set([
  "canvas",
  "canvas_readback",
  "canvas_webgl",
  "webgl"
]);

const CORROBORATING_FINGERPRINTING_CATEGORIES = new Set([
  "audio",
  "audio_context",
  "device_memory",
  "font_metrics",
  "fonts",
  "fonts_plugins",
  "media_devices"
]);

function normalizeFingerprintingCategory(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getFingerprintingAttributeCategories(rawEvidence: Record<string, unknown> | null | undefined) {
  const summary = getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]);
  const summaryCategoryRows = getObjectArrayValues(summary, ["attributeCategories", "attribute_categories"])
    .map((row) => (typeof row.name === "string" ? row.name : null))
    .filter((value): value is string => Boolean(value));
  const runtimeEvidenceCategoryRows = getObjectArrayValues(rawEvidence, [
    "fingerprintRuntimeEvidence",
    "fingerprint_runtime_evidence",
    "fingerprintingRuntimeEvidence",
    "fingerprinting_runtime_evidence"
  ]).flatMap((row) =>
    getStringArrayValues(row, ["attributeCategories", "attribute_categories", "signals"])
  );

  return uniqueStrings([
    ...getStringArrayValues(rawEvidence, [
      "fingerprintAttributeCategories",
      "fingerprint_attribute_categories",
      "fingerprintingSignals",
      "fingerprinting_signals",
      "highEntropySignals",
      "high_entropy_signals"
    ]),
    ...getStringArrayValues(summary, ["fingerprintingSignals", "fingerprinting_signals", "highEntropySignals", "high_entropy_signals"]),
    ...summaryCategoryRows,
    ...runtimeEvidenceCategoryRows
  ]).map(normalizeFingerprintingCategory);
}

export function hasStrongFingerprintingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const summary = getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]);
  const tier = getNumberValue(summary, ["tier"]) ?? getNumberValue(rawEvidence, ["fingerprintTier", "fingerprint_tier"]) ?? 0;
  const categories = getFingerprintingAttributeCategories(rawEvidence);
  const highEntropyCategoryCount = categories.filter((category) => HIGH_ENTROPY_FINGERPRINTING_CATEGORIES.has(category)).length;
  const hasRenderingFingerprinting = categories.some((category) => RENDERING_FINGERPRINTING_CATEGORIES.has(category));
  const hasCorroboratingFingerprinting = categories.some((category) => CORROBORATING_FINGERPRINTING_CATEGORIES.has(category));

  return (
    (tier >= 3 && highEntropyCategoryCount >= 1) ||
    (tier >= 2 && hasRenderingFingerprinting && hasCorroboratingFingerprinting)
  );
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

export function hasStrongCpraCbaOptOutMissingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }
  const tier1 = getStringArrayValues(rawEvidence, ["cbaVendorTier1", "cba_vendor_tier1"]);
  const tier2 = getStringArrayValues(rawEvidence, ["cbaVendorTier2", "cba_vendor_tier2"]);
  const optOutUiResult = getStringArrayValues(rawEvidence, ["optOutUiResult", "opt_out_ui_result"])[0] ?? null;
  const policyCbaLanguage = getStringArrayValues(rawEvidence, ["policyCbaLanguage", "policy_cba_language"])[0] ?? null;
  const scanOriginGeo = getStringArrayValues(rawEvidence, ["scanOriginGeo", "scan_origin_geo"])[0] ?? null;
  const suppressorApplied = getStringArrayValues(rawEvidence, ["suppressorApplied", "suppressor_applied"])[0] ?? null;
  const vendorThresholdMet = tier1.length >= 1 || tier2.length >= 2;
  const missingOrPartialControl =
    optOutUiResult === "absent" ||
    optOutUiResult === "generic_do_not_sell" ||
    optOutUiResult === "partial_no_icon";
  const cpraRelevantContext =
    Boolean(policyCbaLanguage && policyCbaLanguage !== "absent") ||
    optOutUiResult === "generic_do_not_sell" ||
    optOutUiResult === "partial_no_icon" ||
    /\b(?:ca|california)\b/i.test(scanOriginGeo ?? "");

  return vendorThresholdMet && missingOrPartialControl && cpraRelevantContext && !suppressorApplied;
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

export function hasConcreteSensitiveSessionReplayArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
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
      evidenceSource?: unknown;
      evidenceStrength?: unknown;
      requestUrl?: unknown;
      vendorHost?: unknown;
    };
    if (row.evidenceStrength === "detector_only") {
      return false;
    }

    return (
      row.evidenceSource === "sensitive_field_session_replay_correlation" &&
      typeof row.requestUrl === "string" &&
      row.requestUrl.trim().length > 0 &&
      typeof row.vendorHost === "string" &&
      row.vendorHost.trim().length > 0
    );
  });
}

export function hasConcreteSensitiveThirdPartyTrackingArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
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
      evidenceSource?: unknown;
      evidenceStrength?: unknown;
      requestUrl?: unknown;
      vendorHost?: unknown;
    };
    if (row.evidenceStrength === "detector_only") {
      return false;
    }

    if (row.evidenceSource !== "sensitive_field_third_party_tracking_correlation") {
      return false;
    }

    if (typeof row.vendorHost === "string" && row.vendorHost.trim().includes(".")) {
      return true;
    }

    if (typeof row.requestUrl !== "string") {
      return false;
    }

    try {
      const parsed = new URL(row.requestUrl);
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname.includes(".");
    } catch {
      return false;
    }
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
    policyAnchor.claimType === "cookie_preferences_available" ||
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
