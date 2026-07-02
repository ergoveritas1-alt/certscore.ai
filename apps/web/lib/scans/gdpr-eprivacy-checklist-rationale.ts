import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import { getEvidenceLabel } from "./gdpr-eprivacy-assessment-direction";

type CanonicalRuntimeEvidenceKind = "advertising" | "analytics" | "retargeting" | "storage" | "tracking";

type CanonicalRuntimeEvidenceEntry = {
  category: string | null;
  firstSeenMs: number | null;
  party: string | null;
  preConsent: boolean | null;
  priority: string | null;
  vendor: string;
};

export function deriveGdprEprivacyCoverageChecklistRowRationale(item: GdprEprivacyCoverageChecklistItem) {
  const rationale = firstNonEmptyRationale([
    getSpecificChecklistRowRationale(item),
    getEvidenceBackedFallbackRationale(item),
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation,
    `${item.label} evidence was evaluated from retained scanner evidence.`
  ]);

  return truncateSentence(
    rationale,
    320
  );
}

function firstNonEmptyRationale(values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
}

function getSpecificChecklistRowRationale(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const vendorPhrase = formatList(getEvidenceVendorNames(item).slice(0, 4));
  const firstSeenMs = getFirstEvidenceMs(item);
  const evidenceLabel = getEvidenceLabel(item);

  if (evidenceLabel === "Not testable") {
    return null;
  }

  if (item.id === "pre_consent_third_party_tracking") {
    if (evidenceLabel === "Not observed") {
      return "No tracking-classified 3rd party request was observed before a recorded consent action.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Pre-consent 3rd party tracking evidence was retained",
      maxEntries: 2,
      rowKind: "tracking"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? `Tracking-classified 3rd party requests fired before any recorded consent action: ${vendorPhrase}`
        : "Tracking-classified 3rd party requests fired before any recorded consent action",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "pre_consent_cookies_storage") {
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Pre-consent cookie/storage evidence was retained",
      rowKind: "storage"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    const storageNames = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, [
        "preConsentCookieExamples",
        "pre_consent_cookie_examples",
        "cookieNames",
        "cookie_names",
        "storageKeys",
        "storage_keys"
      ]),
      ...getNestedRecordStrings(evidence.preConsentCookieExamples, ["name", "cookieName", "cookie_name", "key"]),
      ...getNestedRecordStrings(evidence.concreteStorageArtifacts, ["name", "cookieName", "cookie_name", "key"])
    ]).slice(0, 4);
    const storagePhrase = formatList(storageNames);
    if (evidenceLabel === "Not observed") {
      return "No eligible cookie or browser-storage write was observed before a recorded consent action.";
    }
    return joinRationaleParts([
      storagePhrase
        ? `Cookie/storage writes were observed before any recorded consent action: ${storagePhrase}`
        : "Cookie/storage writes were observed before any recorded consent action",
      vendorPhrase ? `associated vendors include ${vendorPhrase}` : null,
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "advertising_retargeting_vendor_signal_observed") {
    if (evidenceLabel === "Not observed") {
      return "No advertising infrastructure vendor signal was observed in retained runtime evidence.";
    }
    if (item.status === "Review signal" && retainedNumber(item, ["advertisingVendorCount", "advertising_vendor_count", "advertisingRetargetingVendorCount", "advertising_retargeting_vendor_count", "adtechVendorCount", "adtech_vendor_count"]) === 0) {
      return "No advertising infrastructure classification was retained; security, CDN, bot, and performance/RUM evidence remains review context only.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: evidenceLabel === "Partial concern"
        ? "Advertising-infrastructure evidence was partially retained"
        : "Advertising infrastructure evidence was retained",
      rowKind: "advertising"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? evidenceLabel === "Partial concern"
          ? `Advertising-infrastructure evidence was partially retained: ${vendorPhrase}`
          : `Advertising infrastructure vendor signals were observed: ${vendorPhrase}`
        : evidenceLabel === "Partial concern"
          ? "Advertising-infrastructure evidence was partially retained before a recorded consent choice"
          : "Advertising infrastructure vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      evidenceLabel === "Partial concern"
        ? "review retained vendors/domains before treating this as confirmed advertising activity"
        : getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "retargeting_behavioral_advertising_signal_observed") {
    if (evidenceLabel === "Not observed") {
      return "No retargeting or behavioral advertising vendor signal was observed in retained runtime evidence.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: evidenceLabel === "Partial concern"
        ? "Retargeting or behavioral-advertising evidence was partially retained"
        : "Retargeting/behavioral advertising evidence was retained",
      rowKind: "retargeting"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? evidenceLabel === "Partial concern"
          ? `Retargeting or behavioral-advertising evidence was partially retained: ${vendorPhrase}`
          : `Retargeting or behavioral advertising vendor signals were observed: ${vendorPhrase}`
        : evidenceLabel === "Partial concern"
          ? "Retargeting or behavioral-advertising evidence was partially retained before a recorded consent choice"
          : "Retargeting or behavioral advertising vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      evidenceLabel === "Partial concern"
        ? "review retained vendors/domains before treating this as confirmed behavioral advertising or audience activation"
        : getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "analytics_vendor_observed") {
    if (evidenceLabel === "Not observed") {
      return "No analytics or measurement vendor signal was observed in retained runtime evidence.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Analytics/measurement evidence was retained",
      rowKind: "analytics"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? `Analytics or measurement vendor signals were observed: ${vendorPhrase}`
        : "Analytics or measurement vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "session_replay_fingerprinting_review") {
    const replayEvidence = getRecord(evidence.sessionReplayEvidence);
    const replayVendors = formatList(getStringArray(replayEvidence?.vendors).slice(0, 4));
    const replayFirstSeenMs = getFirstNumberFromRecord(replayEvidence, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms"]);
    if (evidenceLabel === "Not observed") {
      return "No eligible session replay or behavioral-recording vendor was observed in retained runtime evidence.";
    }
    return joinRationaleParts([
      replayVendors
        ? `Session replay or behavioral analytics signals were observed: ${replayVendors}`
        : "Session replay or behavioral analytics signals were observed",
      formatFirstSeenPhrase(replayFirstSeenMs ?? firstSeenMs),
      replayEvidence?.preConsentObserved === true ? "before any recorded consent action" : null
    ]);
  }

  if (item.id === "device_identification_fingerprinting_signal_observed") {
    const entropyEvidence = getRecord(evidence.browserDeviceEntropyEvidence) ?? {};
    const fingerprintReasons = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["fingerprintingReasons", "fingerprinting_reasons", "reasons"]),
      ...getStringArrayFromEvidenceKeys(entropyEvidence, [
        "reasons",
        "signals",
        "vendors",
        "browserApiSignals",
        "browser_api_signals",
        "highEntropySignals",
        "high_entropy_signals"
      ])
    ]).slice(0, 4);
    const entropyFirstSeenMs = getFirstNumberFromRecord(entropyEvidence, ["firstObservedMs", "first_observed_ms", "firstSeenMs", "first_seen_ms"]);
    const reasonPhrase = formatList(fingerprintReasons);
    if (evidenceLabel === "Not observed") {
      return "No eligible device-identification or fingerprinting signal was observed in retained runtime evidence.";
    }
    return joinRationaleParts([
      reasonPhrase
        ? `Device-identification or fingerprinting-like browser API signals were observed: ${reasonPhrase}`
        : "Device-identification or fingerprinting-like signals were observed",
      formatFirstSeenPhrase(entropyFirstSeenMs ?? firstSeenMs)
    ]);
  }

  if (item.id === "social_media_embed_pre_consent") {
    const hosts = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, [
        "socialMediaEmbedDomains",
        "social_media_embed_domains",
        "embeddedContentHosts",
        "embedded_content_hosts"
      ]),
      ...getNestedRecordStrings(evidence.socialMediaEmbedObservations, ["domain", "host", "hostname"]),
      ...getNestedRecordStrings(evidence.social_media_embed_observations, ["domain", "host", "hostname"])
    ]).slice(0, 4);
    const providers = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["providers"]),
      ...getNestedRecordStrings(evidence.socialMediaEmbedObservations, ["provider"]),
      ...getNestedRecordStrings(evidence.social_media_embed_observations, ["provider"])
    ]).slice(0, 4);
    const providerPhrase = formatList(providers.length > 0 ? providers : hosts);
    if (evidenceLabel === "Not observed") {
      return "No eligible social/media provider request was observed before a recorded consent action; plain outbound social links are not counted for this row.";
    }
    if (evidenceLabel === "Partial concern") {
      return joinRationaleParts([
        providerPhrase
          ? `A social/media 3rd party asset loaded before consent: ${providerPhrase}. Stronger embed, plugin, pixel, cookie, or storage behavior was not confirmed`
          : "A social/media 3rd party asset loaded before consent, but stronger embed, plugin, pixel, cookie, or storage behavior was not confirmed",
        formatFirstSeenPhrase(firstSeenMs)
      ]);
    }
    return joinRationaleParts([
      providerPhrase
        ? `A social/media embed, plugin, widget, or pixel loaded before any recorded consent action: ${providerPhrase}`
        : "A social/media embed, plugin, widget, or pixel loaded before any recorded consent action",
      evidence.placeholderIneffective === true
        ? "placeholder-style blocking was retained, but the provider request had already fired"
        : null,
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "embedded_content_pre_consent") {
    const hosts = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["embeddedContentHosts", "embedded_content_hosts", "embeddedHosts", "embedded_hosts"]),
      ...getNestedRecordStrings(evidence.embeddedContentObservations, ["host", "hostname", "domain"])
    ]).slice(0, 4);
    const hostPhrase = formatList(hosts);
    const purposeParts = getEmbeddedContentPurposeParts(evidence);
    if (evidenceLabel === "Not observed") {
      return "No eligible 3rd party embedded content was observed before a recorded consent action.";
    }
    if (purposeParts.length > 0) {
      return joinRationaleParts([
        `3rd party embedded content loaded before any recorded consent action, including ${formatEmbeddedPurposeParts(purposeParts)}. Review retained domains by purpose`,
        formatFirstSeenPhrase(firstSeenMs)
      ]);
    }
    return joinRationaleParts([
      hostPhrase
        ? `3rd party embedded content loaded before any recorded consent action: ${hostPhrase}`
        : "3rd party embedded content loaded before any recorded consent action",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "reject_all_path_availability") {
    const labels = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["rejectButtonLabels", "reject_button_labels", "refusalControlLabels", "refusal_control_labels", "buttonLabels", "button_labels"]),
      ...extractQuotedButtonLabels(item.criticalEvidence.statusBasis)
    ]).slice(0, 3);
    if (evidenceLabel === "Observed") {
      return labels.length > 0
        ? `A refusal path was observed from structured consent-control evidence: ${formatList(labels)}. This confirms availability, not post-click behavior.`
        : "A refusal path was observed from structured consent-control evidence. This confirms availability, not post-click behavior.";
    }
    if (evidenceLabel === "Potential gap") {
      return "A first-layer reject-all or equivalent refusal path was expected from the observed consent surface but was not retained.";
    }
  }

  if (item.id === "accept_consent_control") {
    const labels = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["visibleAcceptLabels", "visible_accept_labels", "acceptButtonLabels", "accept_button_labels", "acceptLabels", "accept_labels", "buttonLabels", "button_labels"]),
      ...extractQuotedButtonLabels(item.criticalEvidence.statusBasis)
    ]).slice(0, 3);
    if (evidenceLabel === "Observed") {
      return labels.length > 0
        ? `An accept consent control was observed from structured consent-control evidence: ${formatList(labels)}. This confirms availability, not post-click behavior.`
        : "An accept consent control was observed from structured consent-control evidence. This confirms availability, not post-click behavior.";
    }
    if (evidenceLabel === "Potential gap") {
      return "A first-layer accept consent control was expected from the observed consent surface but was not retained as structured control evidence.";
    }
  }

  if (item.id === "options_settings_preferences_control") {
    const labels = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["visibleOptionsLabels", "visible_options_labels", "preferenceLabels", "preference_labels", "buttonLabels", "button_labels"]),
      ...extractQuotedButtonLabels(item.criticalEvidence.statusBasis)
    ]).slice(0, 3);
    if (evidenceLabel === "Observed") {
      return labels.length > 0
        ? `An options/settings/preferences control was observed from structured consent-control evidence: ${formatList(labels)}. This confirms availability, not post-click behavior.`
        : "An options/settings/preferences control was observed from structured consent-control evidence. This confirms availability, not post-click behavior.";
    }
    if (evidenceLabel === "Potential gap") {
      return "A first-layer options/settings/preferences control was expected from the observed consent surface but was not retained as structured control evidence.";
    }
  }

  const article13Snippet = getArticle13Snippet(evidence);
  if (article13Snippet) {
    return `${getArticle13RationalePrefix(item)}: ${article13Snippet}`;
  }

  return null;
}

function getArticle13RationalePrefix(item: GdprEprivacyCoverageChecklistItem) {
  if (
    item.id === "supervisory_authority_complaint_disclosure" &&
    getEvidenceLabel(item) === "Partial concern"
  ) {
    return "Policy text referenced complaints, regulators, or data protection authorities, but a complete supervisory-authority complaint-right disclosure was not confirmed";
  }
  if (item.id === "international_transfers_disclosure") {
    return "Policy text included matching international-transfer disclosure evidence";
  }
  if (getEvidenceLabel(item) === "Partial concern") {
    return "Policy evidence was retained, but the matched disclosure text was incomplete or ambiguous";
  }
  if (getEvidenceLabel(item) === "Not confirmed") {
    return "Policy evidence was retained, but row-specific disclosure was not confirmed from the retained extraction";
  }
  if (getEvidenceLabel(item) === "Potential gap") {
    return "Scanner expected this transparency disclosure but did not retain a clear match";
  }
  if (getEvidenceLabel(item) === "Not observed") {
    return "Scanner did not retain a clear matching transparency disclosure";
  }
  return "Policy text included matching disclosure evidence";
}

function getArticle13Snippet(evidence: Record<string, unknown>) {
  const article13Signal = getRecord(evidence.article13Signal);
  const text = getString(article13Signal?.evidenceText) ?? getString(article13Signal?.evidence_text);
  return text ? `"${truncateWholeWord(cleanPolicyExcerptStart(text), 180, "...[more in evidence packet]")}"` : null;
}

function getStrongestEvidenceDetail(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const highlights = getStringArrayFromEvidenceKeys(evidence, ["evidenceHighlights", "evidence_highlights"]);
  if (highlights.length > 0) {
    return cleanEvidenceText(highlights[0] ?? "");
  }
  const vendorPhrase = formatList(getEvidenceVendorNames(item).slice(0, 4));
  const firstSeenMs = getFirstEvidenceMs(item);
  if (vendorPhrase) {
    return joinRationaleParts([`observed vendors include ${vendorPhrase}`, formatFirstSeenPhrase(firstSeenMs)]);
  }
  if (item.criticalEvidence.statusBasis) {
    return cleanEvidenceText(item.criticalEvidence.statusBasis);
  }
  return null;
}

function getEvidenceBackedFallbackRationale(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const evidenceLabel = getEvidenceLabel(item);
  const source = getRetainedEvidenceSourceSummary(item);
  const statusBasis = item.criticalEvidence.statusBasis ? cleanEvidenceText(item.criticalEvidence.statusBasis) : null;
  const strongestDetail = getStrongestEvidenceDetail(item);
  const missingEvidence = getMissingEvidenceSummary(item);
  const policySurface = getPolicySurfaceSummaryDetail(evidence);
  const projectedFindings = getProjectedFindingSummary(evidence);
  const signalState = getSignalObservedSummary(evidence);

  if (policyTextExtractionLimited(item)) {
    return joinRationaleParts([
      `Coverage limited from retained ${source}`,
      statusBasis,
      getPolicyTextExtractionSummary(evidence),
      missingEvidence,
      policySurface
    ]);
  }

  if (evidenceLabel === "Not testable") {
    return joinRationaleParts([
      `Not testable from retained ${source}`,
      missingEvidence ?? statusBasis,
      policySurface
    ]);
  }

  if (evidenceLabel === "Potential gap") {
    return joinRationaleParts([
      `Potential gap from retained ${source}`,
      strongestDetail ?? statusBasis,
      projectedFindings,
      signalState
    ]);
  }

  if (evidenceLabel === "Partial concern") {
    return joinRationaleParts([
      `Partial support from retained ${source}`,
      strongestDetail ?? statusBasis,
      missingEvidence,
      policySurface
    ]);
  }

  if (evidenceLabel === "Not confirmed") {
    return joinRationaleParts([
      `Not confirmed from retained ${source}`,
      strongestDetail ?? statusBasis,
      missingEvidence,
      policySurface
    ]);
  }

  if (evidenceLabel === "Observed") {
    return joinRationaleParts([
      `Observed from retained ${source}`,
      strongestDetail ?? statusBasis,
      projectedFindings,
      policySurface
    ]);
  }

  return joinRationaleParts([
    `Not observed in retained ${source}`,
    strongestDetail ?? statusBasis,
    missingEvidence,
    signalState
  ]);
}

function getRetainedEvidenceSourceSummary(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  if (getRecord(evidence.policySurfaceSummary)) {
    return "policy-surface evidence";
  }
  if (getRecord(evidence.sessionReplayEvidence) || getRecord(evidence.browserDeviceEntropyEvidence) || getEvidenceVendorNames(item).length > 0) {
    return "runtime evidence";
  }
  if (getStringArrayFromEvidenceKeys(evidence, ["projectedFindings", "projected_findings"]).length > 0 || item.criticalEvidence.projectedFindings.length > 0) {
    return "unified finding projection evidence";
  }
  if (item.criticalEvidence.missingOrIncompleteSourceSignals.length > 0) {
    return "source-signal coverage evidence";
  }
  return "scanner evidence";
}

function policyTextExtractionLimited(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const health = getPolicyTextExtractionHealth(evidence);
  const status = getString(health?.policyTextExtractionStatus) ?? getString(health?.policy_text_extraction_status);
  return Boolean(status && status !== "ok");
}

function getPolicyTextExtractionHealth(evidence: Record<string, unknown>) {
  const policySurfaceSummary = getRecord(evidence.policySurfaceSummary) ?? getRecord(evidence.policy_surface_summary);
  return getRecord(evidence.policyTextExtractionHealth) ??
    getRecord(evidence.policy_text_extraction_health) ??
    getRecord(policySurfaceSummary?.policyTextExtractionHealth) ??
    getRecord(policySurfaceSummary?.policy_text_extraction_health);
}

function getPolicyTextExtractionSummary(evidence: Record<string, unknown>) {
  const health = getPolicyTextExtractionHealth(evidence);
  if (!health) {
    return null;
  }
  const status = getString(health.policyTextExtractionStatus) ?? getString(health.policy_text_extraction_status);
  const extracted = getNumber(health.extractedTextLength ?? health.extracted_text_length);
  const required = getNumber(health.minimumTextLengthRequired ?? health.minimum_text_length_required);
  const parts = [
    status ? `policy text extraction ${status}` : "policy text extraction limited",
    typeof extracted === "number" ? `${Math.round(extracted)} characters retained` : null,
    typeof required === "number" ? `${Math.round(required)} required` : null
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") : null;
}

function getMissingEvidenceSummary(item: GdprEprivacyCoverageChecklistItem) {
  const missing = item.criticalEvidence.missingOrIncompleteSourceSignals.slice(0, 2).flatMap((signal) => {
    const expected = getEvidenceValueSummary(signal.expected);
    const actual = getEvidenceValueSummary(signal.actual);
    return expected ? [`expected ${expected}${actual ? `; retained ${actual}` : ""}`] : [];
  });
  return missing.length > 0 ? `Missing or incomplete source signal: ${missing.join("; ")}` : null;
}

function getEvidenceValueSummary(value: unknown) {
  if (typeof value === "string") {
    return cleanEvidenceText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} retained value${value.length === 1 ? "" : "s"}` : "";
  }
  if (value && typeof value === "object") {
    return "structured value";
  }
  return "";
}

function getPolicySurfaceSummaryDetail(evidence: Record<string, unknown>) {
  const summary = getRecord(evidence.policySurfaceSummary);
  if (!summary) {
    return null;
  }
  const urls = uniqueStrings([
    ...getStringArrayFromEvidenceKeys(summary, ["privacyPolicyUrls", "privacy_policy_urls"]),
    ...getStringArrayFromEvidenceKeys(summary, ["cookiePolicyUrls", "cookie_policy_urls"])
  ]).slice(0, 2);
  const urlPhrase = formatList(urls);
  const textCount = getFirstNumberFromRecord(summary, [
    "privacyPolicyTextCharacterCount",
    "privacy_policy_text_character_count",
    "retainedTextCharacterCount",
    "retained_text_character_count"
  ]);
  const guessedOnly = getFirstBooleanFromRecord(summary, [
    "keyPageGuessedOnly",
    "key_page_guessed_only",
    "privacyPolicyGuessedOnly",
    "privacy_policy_guessed_only"
  ]);
  return joinRationaleParts([
    urlPhrase ? `policy surface: ${urlPhrase}` : "policy surface retained",
    typeof textCount === "number" ? `${Math.round(textCount)} policy-text characters retained` : null,
    guessedOnly === true ? "policy attribution was guessed/weak" : null
  ]);
}

function getProjectedFindingSummary(evidence: Record<string, unknown>) {
  const projected = getStringArrayFromEvidenceKeys(evidence, ["projectedFindings", "projected_findings"]);
  const projectedObjects = getNestedRecordStrings(evidence.projectedFindings ?? evidence.projected_findings, ["label", "id"]).slice(0, 3);
  const previews = getNestedRecordStrings(evidence.projectedFindingPreview, ["label", "id"]).slice(0, 3);
  const findingEntities = getNestedRecordStrings(evidence.findingEntities, ["id", "label"]).slice(0, 3);
  const phrase = formatList(uniqueStrings([...projected, ...projectedObjects, ...previews, ...findingEntities]).slice(0, 3));
  return phrase ? `projected finding evidence: ${phrase}` : null;
}

function getSignalObservedSummary(evidence: Record<string, unknown>) {
  const signalObserved = evidence.signalObserved ?? evidence.signal_observed;
  if (signalObserved === true) {
    return "structured signalObserved=true retained";
  }
  if (signalObserved === false) {
    return "structured signalObserved=false retained";
  }
  if (signalObserved === "partial") {
    return "structured signalObserved=partial retained";
  }
  return null;
}

function getCanonicalRuntimeEvidenceSummary(input: {
  fallbackFirstSeenMs: number | null;
  item: GdprEprivacyCoverageChecklistItem;
  lead: string;
  maxEntries?: number;
  rowKind: CanonicalRuntimeEvidenceKind;
}) {
  const entries = getCanonicalRuntimeEvidenceEntries(input.item);
  const matchingEntries = entries.filter((entry) => canonicalEntryMatchesKind(entry, input.rowKind));
  const thirdPartyMatchingEntries = matchingEntries.filter(isThirdPartyCanonicalRuntimeEvidenceEntry);
  const primaryEntries = (
    input.rowKind === "tracking" && thirdPartyMatchingEntries.length > 0 ? thirdPartyMatchingEntries.sort(compareCanonicalRuntimeEvidenceEntries) :
      input.rowKind === "tracking" ? matchingEntries.sort(compareCanonicalRuntimeEvidenceEntries) :
      matchingEntries.length > 0 ? matchingEntries :
        entries
  ).slice(0, input.maxEntries ?? 4);
  if (primaryEntries.length === 0) {
    return null;
  }
  const firstSeenMs = minNumber([
    input.fallbackFirstSeenMs,
    ...primaryEntries.map((entry) => entry.firstSeenMs)
  ]);
  const preConsentObserved = primaryEntries.some((entry) => entry.preConsent === true) || getPreConsentQualifier(input.item) !== null;
  return joinRationaleParts([
    `${input.lead}${preConsentObserved ? " before consent" : ""}: ${formatCanonicalRuntimeEvidenceEntries(primaryEntries, { includeTiming: firstSeenMs === null })}`,
    formatFirstSeenPhrase(firstSeenMs),
    preConsentObserved ? "no consent action was recorded first" : null
  ]);
}

function getCanonicalRuntimeEvidenceEntries(item: GdprEprivacyCoverageChecklistItem): CanonicalRuntimeEvidenceEntry[] {
  const evidence = getRetainedEvidenceRecord(item);
  const rowEntries = uniqueCanonicalRuntimeEvidenceEntries([
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsentThirdPartyTrackerGroups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsent_third_party_tracker_groups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsent_tracker_vendor_evidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preConsentTrackerVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsentThirdPartyCookieStorageGroups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsent_third_party_cookie_storage_groups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.advertisingRetargetingVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.analyticsVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.findingEntities),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.representativeRequests),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.representative_requests)
  ]);
  const rowVendors = new Set(rowEntries.map((entry) => entry.vendor.toLowerCase()));
  const vendorListEntries = getEvidenceVendorNames(item)
    .filter((vendor) => !rowVendors.has(vendor.toLowerCase()))
    .map((vendor) => ({
      category: null,
      firstSeenMs: null,
      party: null,
      preConsent: null,
      priority: null,
      vendor
    }));
  return uniqueCanonicalRuntimeEvidenceEntries([...rowEntries, ...vendorListEntries]);
}

function getCanonicalRuntimeEvidenceEntriesFromRows(value: unknown): CanonicalRuntimeEvidenceEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = getRecord(entry);
    if (!record) {
      return [];
    }
    const vendor = getFirstStringFromRecord(record, [
      "vendor",
      "vendorName",
      "vendor_name",
      "matchedVendorName",
      "matched_vendor_name",
      "name"
    ]);
    if (!vendor) {
      return [];
    }
    return [{
      category: getFirstStringFromRecord(record, ["category", "vendorCategory", "vendor_category", "purpose", "classification"]),
      firstSeenMs: getFirstNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms"]),
      party: getFirstStringFromRecord(record, ["party", "partyType", "party_type", "firstPartyOrThirdParty", "first_party_or_third_party"]),
      preConsent: getFirstBooleanFromRecord(record, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]),
      priority: getFirstStringFromRecord(record, ["priority", "reviewPriority", "review_priority", "trackerPriority", "tracker_priority"]),
      vendor
    }];
  });
}

function canonicalEntryMatchesKind(entry: CanonicalRuntimeEvidenceEntry, kind: CanonicalRuntimeEvidenceKind) {
  const text = `${entry.vendor} ${entry.category ?? ""}`.toLowerCase();
  if (kind === "advertising") {
    return /\b(ad|ads|adtech|advertis|doubleclick|measurement|programmatic|verification)\b/i.test(text);
  }
  if (kind === "analytics") {
    return /\b(analytics|measurement|metrics|stats|tag manager|gtm|google analytics)\b/i.test(text);
  }
  if (kind === "retargeting") {
    return /\b(retarget|remarket|behavioral|audience|identity sync|idsync|cross[- ]site|profile activation|meta pixel|facebook pixel|linkedin insight|tiktok pixel|pinterest tag)\b/i.test(text);
  }
  if (kind === "storage") {
    return /\b(cookie|storage|analytics|measurement|advertis|personal|retarget|audience)\b/i.test(text);
  }
  return /\b(track|tracking|ad|ads|adtech|advertising|advertis\w*|analytics|measurement|retarget|cross[- ]site)\b/i.test(text);
}

function isThirdPartyCanonicalRuntimeEvidenceEntry(entry: CanonicalRuntimeEvidenceEntry) {
  const party = entry.party?.trim().toLowerCase();
  return party === "3rd" || party === "third_party" || party === "third-party" || party === "mixed";
}

function compareCanonicalRuntimeEvidenceEntries(left: CanonicalRuntimeEvidenceEntry, right: CanonicalRuntimeEvidenceEntry) {
  const priorityDelta = getCanonicalRuntimeEvidencePriorityRank(left.priority) - getCanonicalRuntimeEvidencePriorityRank(right.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  const timingDelta = (left.firstSeenMs ?? Number.POSITIVE_INFINITY) - (right.firstSeenMs ?? Number.POSITIVE_INFINITY);
  if (timingDelta !== 0) {
    return timingDelta;
  }
  return left.vendor.localeCompare(right.vendor);
}

function getCanonicalRuntimeEvidencePriorityRank(priority: string | null) {
  const normalized = priority?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "high" || normalized === "concern") {
    return 0;
  }
  if (normalized === "review" || normalized === "review_needed") {
    return 1;
  }
  if (normalized === "medium" || normalized === "partial_concern") {
    return 2;
  }
  if (normalized === "contextual" || normalized === "low") {
    return 3;
  }
  return 4;
}

function formatCanonicalRuntimeEvidenceEntries(entries: CanonicalRuntimeEvidenceEntry[], options: { includeTiming?: boolean } = {}) {
  return formatList(entries.map((entry) => {
    const details = [
      entry.category ? formatEvidenceCategory(entry.category) : null,
      options.includeTiming === true && entry.firstSeenMs !== null ? formatElapsedSeconds(entry.firstSeenMs) : null
    ].filter(Boolean);
    return details.length > 0 ? `${entry.vendor} (${details.join(", ")})` : entry.vendor;
  })) ?? "";
}

function uniqueCanonicalRuntimeEvidenceEntries(entries: CanonicalRuntimeEvidenceEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.vendor.toLowerCase()}|${entry.category ?? ""}|${entry.firstSeenMs ?? ""}|${entry.party ?? ""}|${entry.preConsent ?? ""}|${entry.priority ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getFirstStringFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getFirstBooleanFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function formatEvidenceCategory(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getRetainedEvidenceRecord(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = item.criticalEvidence.retainedEvidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : {};
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function getStringArrayFromEvidenceKeys(evidence: Record<string, unknown>, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => getStringArray(evidence[key])));
}

function getNestedRecordStrings(value: unknown, keys: string[]) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = getRecord(entry);
    if (!record) {
      return [];
    }
    return keys.flatMap((key) => {
      const stringValue = getString(record[key]);
      return stringValue ? [stringValue] : [];
    });
  });
}

function getEmbeddedContentPurposeParts(evidence: Record<string, unknown>) {
  const buckets = getRecord(evidence.embeddedContentPurposeBuckets) ?? getRecord(evidence.embedded_content_purpose_buckets);
  if (!buckets) {
    return [];
  }
  const purposeLabels: Array<[string, string]> = [
    ["videoAdSdk", "video/ad SDK evidence"],
    ["mediaEmbed", "media embed evidence"],
    ["mapEmbed", "map embed evidence"],
    ["socialEmbed", "social embed evidence"],
    ["formOrChatWidget", "form/chat widget evidence"],
    ["fontStaticResource", "lower-risk font/static resource evidence"],
    ["otherEmbeddedContent", "other embedded content evidence"]
  ];
  return purposeLabels.flatMap(([key, label]) => {
    const hosts = uniqueStrings([
      ...getStringArray(buckets[key]),
      ...getStringArray(buckets[toSnakeCase(key)])
    ]).slice(0, 3);
    return hosts.length > 0 ? [{ hosts, label }] : [];
  });
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function formatEmbeddedPurposeParts(parts: Array<{ hosts: string[]; label: string }>) {
  return parts.map((part) => `${part.label} (${formatList(part.hosts) ?? "retained host"}`).join("), ") + ")";
}

function getEvidenceVendorNames(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  return uniqueStrings([
    ...getStringArrayFromEvidenceKeys(evidence, [
      "advertisingRetargetingVendors",
      "advertising_retargeting_vendors",
      "advertisingVendors",
      "advertising_vendors",
      "retargetingBehavioralAdvertisingVendors",
      "retargeting_behavioral_advertising_vendors",
      "advertisingSharingVendors",
      "analyticsVendors",
      "analytics_vendors",
      "thirdPartyTrackingVendors",
      "third_party_tracking_vendors",
      "preconsent_tracker_vendors",
      "preConsentTrackerVendors",
      "runtime_vendors",
      "runtimeVendors",
      "vendors"
    ]),
    ...getNestedRecordStrings(evidence.preconsent_tracker_vendor_evidence, ["vendor", "vendorName", "vendor_name", "matched_vendor_name"]),
    ...getNestedRecordStrings(evidence.findingEntities, ["vendor", "vendorName", "vendor_name", "matched_vendor_name"])
  ]);
}

function getFirstEvidenceMs(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const direct = getFirstNumberFromRecord(evidence, [
    "firstObservedMs",
    "first_observed_ms",
    "firstSeenMs",
    "first_seen_ms",
    "firstRuntimeVendorObservedMs",
    "first_runtime_vendor_observed_ms",
    "firstPreConsentTrackingRequestMs",
    "first_pre_consent_tracking_request_ms",
    "firstPreconsentThirdPartyTrackingObservedMs",
    "first_preconsent_third_party_tracking_observed_ms",
    "firstPreConsentThirdPartyTrackingObservedMs",
    "first_pre_consent_third_party_tracking_observed_ms",
    "firstPreconsentCookieOrStorageObservedMs",
    "first_preconsent_cookie_or_storage_observed_ms",
    "firstPreConsentCookieOrStorageObservedMs",
    "first_pre_consent_cookie_or_storage_observed_ms",
    "firstAdvertisingRetargetingVendorObservedMs",
    "first_advertising_retargeting_vendor_observed_ms",
    "firstAdvertisingVendorObservedMs",
    "first_advertising_vendor_observed_ms",
    "firstRetargetingBehavioralAdvertisingVendorObservedMs",
    "first_retargeting_behavioral_advertising_vendor_observed_ms",
    "firstAnalyticsVendorObservedMs",
    "first_analytics_vendor_observed_ms",
    "firstSocialMediaEmbedObservedMs",
    "first_social_media_embed_observed_ms",
    "firstEmbeddedContentObservedMs",
    "first_embedded_content_observed_ms"
  ]);
  const nested = getFirstNumberFromRows([
    evidence.preconsent_tracker_vendor_evidence,
    evidence.representativeRequests,
    evidence.representative_requests,
    evidence.embeddedContentObservations,
    evidence.embedded_content_observations,
    evidence.socialMediaEmbedObservations,
    evidence.social_media_embed_observations,
    evidence.preConsentCookieExamples,
    evidence.pre_consent_cookie_examples
  ]);
  const textMs = getFirstMsFromText([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation,
    ...getStringArrayFromEvidenceKeys(evidence, ["evidenceHighlights", "evidence_highlights"])
  ]);
  return minNumber([direct, nested, textMs]);
}

function getFirstNumberFromRecord(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return null;
  }
  return minNumber(keys.map((key) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }));
}

function getFirstNumberFromRows(values: unknown[]) {
  const numbers = values.flatMap((value) => Array.isArray(value) ? value : []).flatMap((entry) => {
    const record = getRecord(entry);
    return record ? [getFirstNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms"])] : [];
  });
  return minNumber(numbers);
}

function getFirstMsFromText(values: Array<string | null | undefined>) {
  const numbers = values.flatMap((value) => {
    if (!value) {
      return [];
    }
    return [...value.matchAll(/(\d+(?:\.\d+)?)\s*ms\b/gi)].map((match) => Number(match[1])).filter((number) => Number.isFinite(number) && number >= 0);
  });
  return minNumber(numbers);
}

function minNumber(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return numbers.length > 0 ? Math.min(...numbers) : null;
}

function formatFirstSeenPhrase(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `first seen ${formatElapsedSeconds(value)} after scan start`
    : null;
}

function formatElapsedSeconds(value: number) {
  const seconds = Math.max(0, value) / 1000;
  return `${seconds.toPrecision(3)}s`;
}

function getPreConsentQualifier(item: GdprEprivacyCoverageChecklistItem) {
  return /pre[- ]consent|before consent|before any recorded consent/i.test([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation,
    retainedText(item)
  ].join(" "))
    ? "before any recorded consent action"
    : null;
}

function retainedText(item: GdprEprivacyCoverageChecklistItem) {
  return JSON.stringify(
    item.criticalEvidence.retainedEvidence,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  ).toLowerCase();
}

function extractQuotedButtonLabels(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  return [...value.matchAll(/[“"']([^“"']{2,60}?)(?:[”"'])/g)].map((match) => match[1] ?? "").filter(Boolean);
}

function retainedNumber(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  for (const key of keys) {
    const value = item.criticalEvidence.retainedEvidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function formatList(values: string[]) {
  const uniqueValues = uniqueStrings(values.map((value) => cleanEvidenceText(value)).filter(Boolean));
  if (uniqueValues.length === 0) {
    return null;
  }
  if (uniqueValues.length === 1) {
    return uniqueValues[0] ?? null;
  }
  if (uniqueValues.length === 2) {
    return `${uniqueValues[0]} and ${uniqueValues[1]}`;
  }
  return `${uniqueValues.slice(0, -1).join(", ")}, and ${uniqueValues.at(-1)}`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function joinRationaleParts(parts: Array<string | null | undefined>) {
  const cleanParts = uniqueStrings(parts.flatMap((part) => {
    const cleaned = part ? cleanEvidenceText(part).replace(/[.;]\s*$/g, "") : "";
    return cleaned ? [cleaned] : [];
  }));
  if (cleanParts.length === 0) {
    return "";
  }
  return `${cleanParts.join("; ")}.`;
}

function cleanEvidenceText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function cleanPolicyExcerptStart(value: string) {
  const raw = value.trim();
  const startsWithUnsafeFragment =
    /^[.…]{1,3}[\p{L}\p{N}]/u.test(raw) ||
    /^[\p{Ll}\p{N}]/u.test(raw);
  const cleaned = cleanEvidenceText(raw.replace(/^[.…\s]+/u, "").replace(/^[^\p{L}\p{N}]+/u, ""));
  if (!startsWithUnsafeFragment) {
    return cleaned;
  }
  const firstWordBoundary = cleaned.search(/\s/u);
  return firstWordBoundary > 0 ? cleaned.slice(firstWordBoundary).trimStart() : cleaned;
}

function truncateSentence(value: string, maxLength: number) {
  const cleaned = cleanEvidenceText(value);
  return truncateWholeWord(cleaned, maxLength);
}

function truncateWholeWord(value: string, maxLength: number, suffix = "...") {
  const cleaned = cleanEvidenceText(value);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  const hardLimit = Math.max(1, maxLength - suffix.length);
  const clipped = cleaned.slice(0, hardLimit).trimEnd();
  const lastSpace = clipped.lastIndexOf(" ");
  const wordSafeClip = lastSpace > Math.floor(hardLimit * 0.6)
    ? clipped.slice(0, lastSpace)
    : clipped;
  return `${wordSafeClip.replace(/[,:;.!?]+$/g, "").trimEnd()}${suffix}`;
}
