import React from "react";
import { EvidenceJsonBlock } from "./evidence-json-block";
import { VendorBrandChip } from "./vendor-brand-chip";

type RegulatoryChecklistEvidenceDetailsProps = {
  evidenceRefs?: string[];
  jsonPayload: string;
};

type ResultTraceEvent = {
  chips: string[];
  detail?: string;
  rawDetails: string[];
  stage: "After choice" | "Before consent" | "Consent / opt-out action" | "Evidence retained" | "Gate decision" | "Scan started";
  status: "fail" | "info" | "pass" | "warn";
  title: string;
  vendorLabel?: string;
};

type ResultExplanationRow = {
  detail: string;
  label: string;
  tone: "good" | "info" | "warn" | "bad";
};

type CorrectionGuidance = {
  kind: "none" | "steps";
  message?: string;
  steps: string[];
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function quote(value: string) {
  return JSON.stringify(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function getRetainedEvidence(jsonPayload: string) {
  try {
    const parsed = JSON.parse(jsonPayload) as unknown;
    return getRecord(getRecord(parsed)?.retainedEvidence);
  } catch {
    return null;
  }
}

function getParsedEvidence(jsonPayload: string) {
  try {
    const parsed = JSON.parse(jsonPayload) as unknown;
    return getRecord(parsed);
  } catch {
    return null;
  }
}

function firstDefined<T>(values: T[]) {
  return values.find((value) => value !== null && value !== undefined);
}

function formatArrayLine(label: string, values: string[], limit = 3) {
  if (values.length === 0) {
    return null;
  }
  const selected = values.slice(0, limit).map((value) => quote(value));
  const suffix = values.length > limit ? `, +${values.length - limit} more` : "";
  return `${quote(label)}: [${selected.join(", ")}${suffix}]`;
}

function formatScalarLine(label: string, value: unknown) {
  const normalized = firstDefined([
    getString(value),
    getBoolean(value),
    getNumber(value)
  ]);
  if (normalized === null || normalized === undefined) {
    return null;
  }
  return `${quote(label)}: ${typeof normalized === "string" ? quote(normalized) : String(normalized)}`;
}

function formatShortTextLine(label: string, value: unknown, maxLength = 120) {
  const normalized = getString(value);
  if (!normalized) {
    return null;
  }
  const trimmed = normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
  return `${quote(label)}: ${quote(trimmed)}`;
}

function formatMs(value: unknown) {
  const numeric = getNumber(value);
  return typeof numeric === "number" ? `${Math.round(numeric)}ms` : null;
}

function formatHumanTimeMs(value: unknown) {
  const numeric = getNumber(value);
  if (typeof numeric !== "number") {
    return null;
  }
  if (numeric < 1000) {
    return `${Math.round(numeric)}ms`;
  }
  return `${(numeric / 1000).toFixed(numeric < 10000 ? 1 : 0)}s`;
}

function getFirstNumberFromKeys(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function formatFirstObservedSuffix(value: unknown) {
  const formatted = formatHumanTimeMs(value);
  return formatted ? `; first observed ${formatted} after scan start` : "";
}

function formatObservedListLine(label: string, values: string[], firstObservedMs: unknown, limit = 3) {
  if (values.length === 0) {
    return null;
  }
  const selected = values.slice(0, limit);
  const suffix = values.length > limit ? `, +${values.length - limit} more` : "";
  return `${label}: ${selected.join(", ")}${suffix}${formatFirstObservedSuffix(firstObservedMs)}.`;
}

function formatTraceValue(value: unknown, maxLength = 140): string | null {
  const scalar = firstDefined([
    getString(value),
    getBoolean(value),
    getNumber(value)
  ]);
  if (scalar !== null && scalar !== undefined) {
    return typeof scalar === "string" ? truncateTraceText(scalar, maxLength) : String(scalar);
  }
  if (Array.isArray(value)) {
    const stringValues = getStringArray(value);
    if (stringValues.length > 0) {
      const selected = stringValues.slice(0, 3).map((entry) => quote(truncateTraceText(entry, 72)));
      const suffix = stringValues.length > 3 ? `, +${stringValues.length - 3} more` : "";
      return `[${selected.join(", ")}${suffix}]`;
    }
    const compactValues = value
      .slice(0, 3)
      .map((entry) => formatTraceValue(entry, 72))
      .filter((entry): entry is string => Boolean(entry));
    return compactValues.length > 0 ? `[${compactValues.join(", ")}${value.length > 3 ? `, +${value.length - 3} more` : ""}]` : null;
  }
  const record = getRecord(value);
  if (record) {
    const entries = Object.entries(record)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .slice(0, 4)
      .map(([key, entry]) => {
        const formatted = formatTraceValue(entry, 72);
        return formatted ? `${key}: ${formatted}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));
    return entries.length > 0 ? `{ ${entries.join(", ")}${Object.keys(record).length > 4 ? ", ..." : ""} }` : null;
  }
  return null;
}

function formatSmokingGunExample(row: unknown) {
  const record = getRecord(row);
  if (!record) {
    return null;
  }
  const kind = getString(record.kind);
  const label = getString(record.label);
  const eventId = getString(record.eventId);
  const eventType = getString(record.eventType);
  const timestampMs = formatMs(record.timestampMs);
  const capturedAtMs = formatMs(record.capturedAtMs);
  const cookieName = getString(record.cookieName);
  const cookieDomain = getString(record.cookieDomain);
  const cookieParty = getString(record.cookieParty);
  const cookiePurpose = getString(record.cookiePurpose);
  const host = getString(record.host);
  const path = getString(record.path);
  const url = getString(record.url);
  const scenario = getString(record.scenario);
  const consentState = getString(record.consentState);
  const sourceModule = getString(record.sourceModule);
  const endpointCategory = getString(record.endpointCategory);
  const action = getString(record.action);
  const actionSucceeded = getBoolean(record.actionSucceeded);
  const vendor = getString(record.vendor);
  const purpose = getString(record.purpose);
  const collectionEndpointObserved = getBoolean(record.collectionEndpointObserved);
  const observed = getBoolean(record.observed);

  const subject = cookieName ?? label ?? vendor ?? host ?? url ?? eventId ?? kind ?? "retained evidence";
  const parts = [
    cookieName ? `${quote("cookieName")}: ${quote(cookieName)}` : null,
    cookieDomain ? `${quote("cookieDomain")}: ${quote(cookieDomain)}` : null,
    host && !cookieName ? `${quote("host")}: ${quote(host)}` : null,
    path && !cookieName ? `${quote("path")}: ${quote(path)}` : null,
    timestampMs ? `${quote("timestampMs")}: ${timestampMs}` : null,
    capturedAtMs && !timestampMs ? `${quote("capturedAtMs")}: ${capturedAtMs}` : null,
    consentState ? `${quote("consentState")}: ${quote(consentState)}` : null,
    scenario ? `${quote("scenario")}: ${quote(scenario)}` : null,
    cookieParty ? `${quote("cookieParty")}: ${quote(cookieParty)}` : null,
    cookiePurpose ? `${quote("cookiePurpose")}: ${quote(cookiePurpose)}` : null,
    endpointCategory ? `${quote("endpointCategory")}: ${quote(endpointCategory)}` : null,
    action ? `${quote("action")}: ${quote(action)}` : null,
    typeof actionSucceeded === "boolean" ? `${quote("actionSucceeded")}: ${actionSucceeded}` : null,
    purpose && purpose !== cookiePurpose && purpose !== endpointCategory ? `${quote("purpose")}: ${quote(purpose)}` : null,
    vendor && vendor !== subject ? `${quote("vendor")}: ${quote(vendor)}` : null,
    typeof collectionEndpointObserved === "boolean" ? `${quote("collectionEndpointObserved")}: ${collectionEndpointObserved}` : null,
    typeof observed === "boolean" && typeof collectionEndpointObserved !== "boolean" ? `${quote("observed")}: ${observed}` : null,
    sourceModule ? `${quote("sourceModule")}: ${quote(sourceModule)}` : null,
    eventType ? `${quote("eventType")}: ${quote(eventType)}` : null,
    eventId ? `${quote("eventId")}: ${quote(eventId)}` : null,
    url && !cookieName ? `${quote("url")}: ${quote(truncateTraceText(url, 96))}` : null,
  ].filter((part): part is string => Boolean(part));

  return `${quote(subject)}${parts.length > 0 ? `, ${parts.join(", ")}` : ""}`;
}

function getSmokingGunEvidenceRows(retainedEvidence: Record<string, unknown> | null) {
  const rows = Array.isArray(retainedEvidence?.smokingGunEvidence)
    ? retainedEvidence.smokingGunEvidence
    : [];
  return uniqueStrings(rows
    .map(formatSmokingGunExample)
    .filter((row): row is string => Boolean(row)))
    .slice(0, 5);
}

function getSmokingGunEvidenceRecords(retainedEvidence: Record<string, unknown> | null) {
  return Array.isArray(retainedEvidence?.smokingGunEvidence)
    ? retainedEvidence.smokingGunEvidence.map(getRecord).filter((row): row is Record<string, unknown> => Boolean(row))
    : [];
}

function truncateTraceText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function getNestedStringArrays(rows: unknown, keys: string[]) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((row) => {
    const record = getRecord(row);
    const entities = getRecord(record?.entities);
    if (!entities) {
      return [];
    }
    return keys.flatMap((key) => getStringArray(entities[key]));
  });
}

function getRowSpecificEvidenceRows(parsed: Record<string, unknown> | null, retainedEvidence: Record<string, unknown> | null) {
  if (!retainedEvidence) {
    return [];
  }
  const family = getString(parsed?.evidenceFamily);
  const coverageArea = getString(parsed?.coverageArea)?.toLowerCase() ?? "";
  const rows: Array<string | null> = [];
  const smokingGunRows = getSmokingGunEvidenceRows(retainedEvidence);
  if (smokingGunRows.length > 0) {
    return smokingGunRows;
  }
  const firstVendorObservedMs = getFirstNumberFromKeys(retainedEvidence, [
    "firstObservedMs",
    "first_observed_ms",
    "firstSeenMs",
    "first_seen_ms",
    "firstRuntimeVendorObservedMs",
    "first_runtime_vendor_observed_ms",
    "firstAdvertisingRetargetingVendorObservedMs",
    "first_advertising_retargeting_vendor_observed_ms",
    "firstAdvertisingVendorObservedMs",
    "first_advertising_vendor_observed_ms",
    "firstRetargetingBehavioralAdvertisingVendorObservedMs",
    "first_retargeting_behavioral_advertising_vendor_observed_ms",
    "firstAnalyticsVendorObservedMs",
    "first_analytics_vendor_observed_ms",
    "firstEmbeddedContentObservedMs",
    "first_embedded_content_observed_ms"
  ]);
  const article13Signal = getRecord(retainedEvidence.article13Signal);
  const article13EvidenceText = getString(article13Signal?.evidenceText) ?? getString(article13Signal?.evidence_text);
  if (article13EvidenceText) {
    const policySurfaceSummary = getRecord(retainedEvidence.policySurfaceSummary);
    return uniqueStrings([
      `Matched disclosure snippet: ${truncateTraceText(article13EvidenceText, 180)}`,
      formatArrayLine("policyUrls", getStringArray(policySurfaceSummary?.privacyPolicyUrls ?? policySurfaceSummary?.privacy_policy_urls), 2)
    ].filter((row): row is string => Boolean(row))).slice(0, 3);
  }

  if (family === "notice_surface" || /privacy notice/.test(coverageArea)) {
    rows.push(
      formatScalarLine("privacyNoticeObserved", retainedEvidence.privacyNoticeObserved),
      formatArrayLine("verifiedPrivacyNoticeUrls", getStringArray(retainedEvidence.verifiedPrivacyNoticeUrls)),
      formatArrayLine("blockedPrivacyNoticeUrls", getStringArray(retainedEvidence.blockedPrivacyNoticeUrls)),
      formatArrayLine("attemptedPrivacyNoticeUrls", getStringArray(retainedEvidence.attemptedPrivacyNoticeUrls))
    );
  } else if (family === "collection_notice" || /notice at collection/.test(coverageArea)) {
    rows.push(
      formatScalarLine("collectionContextObserved", retainedEvidence.collectionContextObserved),
      formatArrayLine("collectionContextUrls", getStringArray(retainedEvidence.collectionContextUrls)),
      formatScalarLine("collectionNoticeCueObserved", retainedEvidence.collectionNoticeCueObserved),
      formatArrayLine("collectionSurfaceVisitedUrls", getStringArray(retainedEvidence.collectionSurfaceVisitedUrls)),
      formatArrayLine("collectionSurfaceBlockedUrls", getStringArray(retainedEvidence.collectionSurfaceBlockedUrls))
    );
  } else if (family === "sale_share_control" || /do not sell|sell or share/.test(coverageArea)) {
    rows.push(
      formatScalarLine("saleShareApplicabilityObserved", retainedEvidence.saleShareApplicabilityObserved),
      formatScalarLine("runtimeVendorRequestUrlCoherence", retainedEvidence.runtimeVendorRequestUrlCoherence),
      formatArrayLine("advertisingSharingVendors", getStringArray(retainedEvidence.advertisingSharingVendors)),
      formatArrayLine("unmatchedAdvertisingSharingVendorLabels", getStringArray(retainedEvidence.unmatchedAdvertisingSharingVendorLabels)),
      formatArrayLine("saleShareRequestUrls", getStringArray(retainedEvidence.saleShareRequestUrls)),
      formatScalarLine("doNotSellSharePathObserved", retainedEvidence.doNotSellSharePathObserved)
    );
  } else if (family === "gpc_handling" || /gpc/.test(coverageArea)) {
    rows.push(
      formatScalarLine("gpcTestRan", retainedEvidence.gpcTestRan),
      formatScalarLine("gpcSignalSent", retainedEvidence.gpcSignalSent),
      formatScalarLine("gpcRecognitionObserved", retainedEvidence.gpcRecognitionObserved),
      formatScalarLine("trackerCountDelta", retainedEvidence.trackerCountDelta),
      formatScalarLine("thirdPartyCookieCountDelta", retainedEvidence.thirdPartyCookieCountDelta)
    );
  } else if (family === "adtech_sharing_runtime" || /advertising/.test(coverageArea)) {
    rows.push(
      formatObservedListLine(
        "Advertising/retargeting vendors observed",
        [
          ...getStringArray(retainedEvidence.advertisingRetargetingVendors),
          ...getStringArray(retainedEvidence.advertisingSharingVendors)
        ],
        firstVendorObservedMs
      ),
      formatScalarLine("targetedAdvertisingSignalsObserved", retainedEvidence.targetedAdvertisingSignalsObserved),
      formatScalarLine("runtimeVendorRequestUrlCoherence", retainedEvidence.runtimeVendorRequestUrlCoherence),
      formatArrayLine("saleShareRequestUrls", getStringArray(retainedEvidence.saleShareRequestUrls))
    );
  } else if (/analytics vendor|analytics.*observed|measurement vendor/.test(coverageArea)) {
    rows.push(
      formatObservedListLine(
        "Analytics vendors observed",
        getStringArray(retainedEvidence.analyticsVendors),
        firstVendorObservedMs
      ),
      formatScalarLine("analyticsVendorCount", retainedEvidence.analyticsVendorCount)
    );
  } else if (/embedded.*third-party|embedded.*content|third-party embedded/.test(coverageArea)) {
    rows.push(
      formatObservedListLine(
        "Embedded third-party content observed",
        getStringArray(retainedEvidence.embeddedContentHosts),
        firstVendorObservedMs
      ),
      formatScalarLine("embeddedContentObservationCount", retainedEvidence.embeddedContentObservationCount)
    );
  } else if (/session replay|behavioral analytics/.test(coverageArea)) {
    const sessionReplayEvidence = getRecord(retainedEvidence.sessionReplayEvidence);
    rows.push(
      formatObservedListLine(
        "Session replay vendors observed",
        getStringArray(sessionReplayEvidence?.vendors),
        getFirstNumberFromKeys(sessionReplayEvidence, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms"])
      )
    );
  } else if (family === "rights_methods" || /rights/.test(coverageArea)) {
    rows.push(
      formatScalarLine("consumerRightsRequestMethodObserved", retainedEvidence.consumerRightsRequestMethodObserved),
      formatArrayLine("consumerRightsRequestMethodUrls", getStringArray(retainedEvidence.consumerRightsRequestMethodUrls)),
      formatArrayLine("consumerRightsRequestMethodTypes", getStringArray(retainedEvidence.consumerRightsRequestMethodTypes)),
      formatArrayLine("rightsMethodExtractionSurfaces", getStringArray(retainedEvidence.rightsMethodExtractionSurfaces)),
      formatArrayLine("rightsMethodExtractionLimitations", getStringArray(retainedEvidence.rightsMethodExtractionLimitations))
    );
  } else if (family === "post_opt_out_tracking" || /post-opt-out|post opt-out/.test(coverageArea)) {
    rows.push(
      formatScalarLine("optOutInteractionConfirmed", retainedEvidence.optOutInteractionConfirmed),
      formatScalarLine("optOutSavedOrApplied", retainedEvidence.optOutSavedOrApplied),
      formatArrayLine("preOptOutSaleShareRequests", getStringArray(retainedEvidence.preOptOutSaleShareRequests)),
      formatArrayLine("postOptOutSaleShareRequests", getStringArray(retainedEvidence.postOptOutSaleShareRequests)),
      formatArrayLine("postOptOutPersistedVendors", getStringArray(retainedEvidence.postOptOutPersistedVendors))
    );
  } else if (family?.startsWith("cipa_") || /cipa/i.test(coverageArea)) {
    rows.push(
      formatScalarLine("cipaSensitive", retainedEvidence.cipaSensitive),
      formatScalarLine("directEvidenceObserved", retainedEvidence.directEvidenceObserved),
      formatScalarLine("thirdPartyReceiptObserved", retainedEvidence.thirdPartyReceiptObserved),
      formatArrayLine("vendors", getStringArray(retainedEvidence.vendors)),
      formatArrayLine("requestUrls", getStringArray(retainedEvidence.requestUrls))
    );
  } else if (/runtime vendor disclosure|vendor disclosure|disclosure mismatch|disclosure alignment/.test(coverageArea)) {
    const missingSignalFields = Array.isArray(parsed?.missingOrIncompleteSourceSignals)
      ? parsed.missingOrIncompleteSourceSignals.flatMap((signal) => {
          const record = getRecord(signal);
          const field = getString(record?.field);
          return field ? [field] : [];
        })
      : [];
    const unmatchedCookieNames = [
      ...getStringArray(retainedEvidence.unmatched_cookie_names),
      ...getNestedStringArrays(retainedEvidence.findingEntities, ["unmatched_cookie_names"])
    ];

    rows.push(
      formatShortTextLine("basis", parsed?.statusBasis),
      formatScalarLine("selectedEvidenceStrength", retainedEvidence.selectedEvidenceStrength),
      formatArrayLine("unmatched_cookie_names", unmatchedCookieNames),
      formatArrayLine("missingEvidenceFields", missingSignalFields, 2)
    );
  }

  if (rows.filter(Boolean).length === 0) {
    rows.push(
      formatScalarLine("statusBasis", parsed?.statusBasis),
      formatArrayLine("missingSourceSignals", getStringArray(getRecord(parsed?.missingOrIncompleteSourceSignals)?.field))
    );
  }

  return uniqueStrings(rows.filter((row): row is string => Boolean(row))).slice(0, 4);
}

function getEvidenceSummaryRows(input: RegulatoryChecklistEvidenceDetailsProps) {
  const parsed = getParsedEvidence(input.jsonPayload);
  const retainedEvidence = getRetainedEvidence(input.jsonPayload);
  const smokingGunRows = getSmokingGunEvidenceRows(retainedEvidence);
  if (smokingGunRows.length > 0) {
    return smokingGunRows.slice(0, 3);
  }

  const highlights = uniqueStrings(getStringArray(retainedEvidence?.evidenceHighlights));
  if (highlights.length > 0) {
    return highlights.slice(0, 3);
  }

  const sessionReplayEvidence = getRecord(retainedEvidence?.sessionReplayEvidence);
  const sessionReplayVendors = getStringArray(sessionReplayEvidence?.vendors);
  if (sessionReplayVendors.length > 0) {
    const firstSeenMs = getNumber(sessionReplayEvidence?.firstSeenMs);
    const collectionEndpointObserved = getBoolean(sessionReplayEvidence?.collectionEndpointObserved);
    const consentState = getStringArray(sessionReplayEvidence?.consentStates)[0];
    return sessionReplayVendors.slice(0, 3).map((vendor) =>
      [
        quote(vendor),
        consentState ? `${quote("consentState")}: ${quote(consentState)}` : null,
        typeof firstSeenMs === "number" ? `${quote("firstSeenMs")}: ${Math.round(firstSeenMs)}` : null,
        typeof collectionEndpointObserved === "boolean"
          ? `${quote("collectionEndpointObserved")}: ${collectionEndpointObserved}`
          : null
      ].filter((value): value is string => Boolean(value)).join(", ")
    );
  }

  const rowSpecificRows = getRowSpecificEvidenceRows(parsed, retainedEvidence);
  if (rowSpecificRows.length > 0) {
    return rowSpecificRows;
  }

  return uniqueStrings(getStringArray(input.evidenceRefs)
    .map((value) => value.replace(/^Evidence flag:\s*/i, "").replace(/[_:]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0))
    .slice(0, 3);
}

function humanizeTraceToken(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatResultStatus(value: string | null) {
  return value ? humanizeTraceToken(value) : "Available";
}

function resultTraceStatusFromParsed(parsed: Record<string, unknown>) {
  const assessmentStatus = getString(parsed.assessmentStatus);
  const evidenceState = getString(parsed.evidenceState);
  const status = getString(parsed.status);
  if (assessmentStatus === "gap_observed" || /gap/i.test(status ?? "")) {
    return "fail" as const;
  }
  if (
    evidenceState === "not_testable" ||
    assessmentStatus === "coverage_limitation" ||
    assessmentStatus === "needs_evidence" ||
    /not testable|coverage|insufficient/i.test(status ?? "")
  ) {
    return "warn" as const;
  }
  if (assessmentStatus === "review_signal" || /review|potential/i.test(status ?? "")) {
    return "warn" as const;
  }
  return "pass" as const;
}

function resultTraceStatusLabel(status: ResultTraceEvent["status"]) {
  switch (status) {
    case "fail":
      return "Failed";
    case "pass":
      return "Passed";
    case "warn":
      return "Needs review";
    case "info":
    default:
      return "Observed";
  }
}

function getPrimaryTraceSubject(record: Record<string, unknown>) {
  return getString(record.cookieName) ??
    getString(record.label) ??
    getString(record.vendor) ??
    getString(record.host) ??
    getString(record.path) ??
    getString(record.eventId) ??
    "A retained signal";
}

function getTraceVendorLabel(record: Record<string, unknown>) {
  return getString(record.vendor) ?? getString(record.host) ?? getString(record.cookieDomain) ?? getString(record.label);
}

function normalizeTraceChip(value: string | null | undefined) {
  return value ? humanizeTraceToken(value).replace(/\bPre Consent\b/i, "Pre-consent") : null;
}

function buildSmokingGunTraceEvent(record: Record<string, unknown>, coverageArea: string): ResultTraceEvent {
  const subject = getPrimaryTraceSubject(record);
  const vendorLabel = getTraceVendorLabel(record);
  const kind = getString(record.kind) ?? getString(record.eventType);
  const consentState = getString(record.consentState);
  const purpose = getString(record.cookiePurpose) ?? getString(record.purpose) ?? getString(record.endpointCategory);
  const party = getString(record.cookieParty);
  const scenario = getString(record.scenario);
  const timing = formatHumanTimeMs(record.timestampMs) ?? formatHumanTimeMs(record.capturedAtMs);
  const action = getString(record.action);
  const actionSucceeded = getBoolean(record.actionSucceeded);
  const collectionEndpointObserved = getBoolean(record.collectionEndpointObserved);
  const observed = getBoolean(record.observed);
  const isBeforeConsent = /pre[_ -]?consent/i.test(consentState ?? "") || /before consent|pre-consent/i.test(coverageArea);
  const stage: ResultTraceEvent["stage"] = action
    ? "Consent / opt-out action"
    : /post|after/i.test(consentState ?? "")
      ? "After choice"
      : isBeforeConsent
        ? "Before consent"
        : "Evidence retained";
  const status: ResultTraceEvent["status"] =
    action && actionSucceeded === false ? "warn" :
      collectionEndpointObserved === false || observed === false ? "warn" :
        isBeforeConsent && /advertising|tracking|target/i.test(purpose ?? coverageArea) ? "fail" :
          "info";
  const purposeLabel = normalizeTraceChip(purpose);
  const partyLabel = normalizeTraceChip(party);
  const stateLabel = normalizeTraceChip(consentState);
  const kindLabel = normalizeTraceChip(kind);
  const chips = uniqueStrings([purposeLabel, partyLabel, stateLabel, kindLabel].filter((chip): chip is string => Boolean(chip))).slice(0, 4);
  const title = action
    ? `${humanizeTraceToken(action)} ${actionSucceeded === true ? "succeeded" : actionSucceeded === false ? "did not produce strong action proof" : "was attempted"}.`
    : isBeforeConsent
      ? `${subject} was observed${timing ? ` ${timing} after scan start` : ""}, before any consent action was recorded.`
      : `${subject} was retained as evidence${timing ? ` ${timing} after scan start` : ""}.`;
  const detail = purpose
    ? `${humanizeTraceToken(purpose)} ${kind ?? "signal"}${isBeforeConsent ? " appeared before consent" : " was observed"}${party ? ` as ${party.replace(/_/g, " ")}` : ""}.`
    : getString(record.url) ?? getString(record.path) ?? undefined;
  const rawDetails = [
    getString(record.cookieName) ? `cookieName=${getString(record.cookieName)}` : null,
    getString(record.cookieDomain) ? `domain=${getString(record.cookieDomain)}` : null,
    getString(record.host) ? `host=${getString(record.host)}` : null,
    getString(record.eventId) ? `eventId=${getString(record.eventId)}` : null,
    getString(record.sourceModule) ? `source=${getString(record.sourceModule)}` : null,
    scenario ? `scenario=${scenario}` : null,
  ].filter((part): part is string => Boolean(part));

  return { chips, detail, rawDetails, stage, status, title, vendorLabel: vendorLabel ?? undefined };
}

function formatFriendlySmokingGun(record: Record<string, unknown>, coverageArea: string) {
  const subject = getPrimaryTraceSubject(record);
  const consentState = getString(record.consentState);
  const timing = formatHumanTimeMs(record.timestampMs) ?? formatHumanTimeMs(record.capturedAtMs);
  const purpose = getString(record.cookiePurpose) ?? getString(record.purpose) ?? getString(record.endpointCategory);
  const party = getString(record.cookieParty);
  const host = getString(record.host) ?? getString(record.cookieDomain);
  const beforeConsent = /pre[_ -]?consent/i.test(consentState ?? "") || /before consent|pre-consent/i.test(coverageArea);
  const details = [
    host ? `on ${host}` : null,
    purpose ? `for ${purpose.replace(/_/g, " ")}` : null,
    party ? `as ${party.replace(/_/g, " ")}` : null,
    timing ? `${timing} after scan start` : null
  ].filter((part): part is string => Boolean(part));
  return `${subject} was observed${beforeConsent ? " before consent" : ""}${details.length > 0 ? ` (${details.join(", ")})` : ""}.`;
}

function cleanEvidenceRef(value: string) {
  return value
    .replace(/^Evidence flag:\s*/i, "")
    .replace(/^Evidence:\s*/i, "")
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFriendlyEvidenceRows(
  parsed: Record<string, unknown>,
  retainedEvidence: Record<string, unknown> | null,
  evidenceRefs: string[]
) {
  const coverageArea = getString(parsed.coverageArea) ?? "this row";
  const smokingGunRows = getSmokingGunEvidenceRecords(retainedEvidence)
    .map((record) => formatFriendlySmokingGun(record, coverageArea));
  if (smokingGunRows.length > 0) {
    return uniqueStrings(smokingGunRows).slice(0, 3);
  }

  const highlights = uniqueStrings(getStringArray(retainedEvidence?.evidenceHighlights)
    .map((value) => truncateTraceText(value.replace(/"/g, ""), 150)));
  if (highlights.length > 0) {
    return highlights.slice(0, 3);
  }

  const rowSpecificRows = getRowSpecificEvidenceRows(parsed, retainedEvidence)
    .map((value) => truncateTraceText(value.replace(/"/g, ""), 150));
  if (rowSpecificRows.length > 0) {
    const onlyBasisFallback = rowSpecificRows.every((value) => /^statusBasis\s*:/i.test(value));
    if (onlyBasisFallback && evidenceRefs.length > 0) {
      return uniqueStrings(evidenceRefs.map(cleanEvidenceRef).filter(Boolean)).slice(0, 3);
    }
    return rowSpecificRows.slice(0, 3);
  }

  return uniqueStrings(evidenceRefs.map(cleanEvidenceRef).filter(Boolean)).slice(0, 3);
}

function getFriendlyMissingEvidenceRows(parsed: Record<string, unknown>) {
  const missingSignals = Array.isArray(parsed.missingOrIncompleteSourceSignals)
    ? parsed.missingOrIncompleteSourceSignals.map(getRecord).filter((signal): signal is Record<string, unknown> => Boolean(signal))
    : [];
  return missingSignals.slice(0, 3).map((signal) => {
    const field = getString(signal.field) ?? "Required evidence";
    const whyNeeded = getString(signal.whyNeeded);
    return whyNeeded
      ? `${field}: ${truncateTraceText(whyNeeded, 150)}`
      : `${field} was missing or incomplete.`;
  });
}

function getResultExplanationRows(input: RegulatoryChecklistEvidenceDetailsProps): ResultExplanationRow[] {
  const parsed = getParsedEvidence(input.jsonPayload);
  const retainedEvidence = getRetainedEvidence(input.jsonPayload);
  if (!parsed) {
    return [];
  }

  const assessmentStatus = getString(parsed.assessmentStatus);
  const status = getString(parsed.status);
  const statusBasis = getString(parsed.statusBasis);
  const traceStatus = resultTraceStatusFromParsed(parsed);
  const resultTone: ResultExplanationRow["tone"] =
    traceStatus === "fail" ? "bad" :
      traceStatus === "warn" ? "warn" :
        traceStatus === "pass" ? "good" :
          "info";
  const evidenceRows = getFriendlyEvidenceRows(parsed, retainedEvidence, getStringArray(input.evidenceRefs));
  const missingRows = getFriendlyMissingEvidenceRows(parsed);
  const rows: ResultExplanationRow[] = [
  ];

  if (statusBasis) {
    rows.push({
      detail: truncateTraceText(statusBasis, 220),
      label: "Basis",
      tone: resultTone === "bad" ? "bad" : resultTone === "warn" ? "warn" : "info"
    });
  }

  if (evidenceRows.length > 0) {
    rows.push({
      detail: evidenceRows.join(" "),
      label: evidenceRows.length === 1 ? "Evidence used" : "Evidence used",
      tone: "info"
    });
  }

  if (missingRows.length > 0) {
    rows.push({
      detail: missingRows.join(" "),
      label: "Limits",
      tone: "warn"
    });
  }

  return rows.slice(0, 4);
}

function getResultTraceEvents(input: RegulatoryChecklistEvidenceDetailsProps): ResultTraceEvent[] {
  const parsed = getParsedEvidence(input.jsonPayload);
  const retainedEvidence = getRetainedEvidence(input.jsonPayload);
  if (!parsed) {
    return [];
  }
  const coverageArea = getString(parsed.coverageArea) ?? "Coverage area";
  const pipeline = getRecord(parsed.pipeline);
  const sourceModule = getString(pipeline?.sourceModule);
  const projectionStage = getString(pipeline?.projectionStage);
  const assessmentStatus = getString(parsed.assessmentStatus);
  const evidenceState = getString(parsed.evidenceState);
  const status = getString(parsed.status);
  const statusBasis = getString(parsed.statusBasis);
  const missingSignals = Array.isArray(parsed.missingOrIncompleteSourceSignals)
    ? parsed.missingOrIncompleteSourceSignals.filter(getRecord)
    : [];
  const smokingGunEvents = getSmokingGunEvidenceRecords(retainedEvidence)
    .map((record) => buildSmokingGunTraceEvent(record, coverageArea));
  const retainedRows = smokingGunEvents.length > 0 ? [] : getRowSpecificEvidenceRows(parsed, retainedEvidence);
  const evidenceRefs = getStringArray(input.evidenceRefs);
  const events: ResultTraceEvent[] = [
    {
      chips: [sourceModule ? humanizeTraceToken(sourceModule) : "Scan row", projectionStage ? humanizeTraceToken(projectionStage) : "Coverage policy"].slice(0, 2),
      detail: sourceModule || projectionStage ? [sourceModule ? `source=${sourceModule}` : null, projectionStage ? `stage=${projectionStage}` : null].filter(Boolean).join(" · ") : undefined,
      rawDetails: [getString(parsed.evidenceFamily) ? `family=${getString(parsed.evidenceFamily)}` : null].filter((part): part is string => Boolean(part)),
      stage: "Scan started",
      status: "info",
      title: `${coverageArea} was evaluated for this scan.`,
    },
    ...smokingGunEvents,
  ];

  if (retainedRows.length > 0) {
    for (const row of retainedRows.slice(0, 5)) {
      events.push({
        chips: ["Retained signal"],
        rawDetails: [row],
        stage: "Evidence retained",
        status: "info",
        title: row,
      });
    }
  }

  for (const signal of missingSignals.slice(0, 4)) {
    const field = getString(signal.field) ?? "required evidence";
    events.push({
      chips: ["Required source gate"],
      detail: truncateTraceText(getString(signal.whyNeeded) ?? "A required source signal was missing or incomplete.", 180),
      rawDetails: [
        getString(signal.source) ? `source=${getString(signal.source)}` : null,
        formatTraceValue(signal.actual) ? `actual=${formatTraceValue(signal.actual)}` : null,
        formatTraceValue(signal.expected) ? `expected=${formatTraceValue(signal.expected)}` : null,
      ].filter((part): part is string => Boolean(part)),
      stage: "Gate decision",
      status: "warn",
      title: `${field} was not complete enough for this gate.`,
    });
  }

  events.push({
    chips: [assessmentStatus ? `Assessment: ${formatResultStatus(assessmentStatus)}` : null, evidenceState ? `Evidence: ${formatResultStatus(evidenceState)}` : null].filter((chip): chip is string => Boolean(chip)),
    detail: statusBasis ? truncateTraceText(statusBasis, 220) : undefined,
    rawDetails: [
      assessmentStatus ? `assessmentStatus=${assessmentStatus}` : null,
      evidenceState ? `evidenceState=${evidenceState}` : null,
      status ? `status=${status}` : null,
      missingSignals.length === 0 ? "missingSourceSignals=none retained for this row" : null,
    ].filter((part): part is string => Boolean(part)),
    stage: "Gate decision",
    status: resultTraceStatusFromParsed(parsed),
    title: `Gate: ${coverageArea}`,
  });

  if (evidenceRefs.length > 0) {
    for (const evidenceRef of evidenceRefs) {
      events.push({
        chips: ["Evidence ref"],
        rawDetails: [evidenceRef],
        stage: "Evidence retained",
        status: "info",
        title: evidenceRef,
      });
    }
  }

  return events;
}

function getTraceSubjects(retainedEvidence: Record<string, unknown> | null) {
  const smokingGunRows = Array.isArray(retainedEvidence?.smokingGunEvidence)
    ? retainedEvidence.smokingGunEvidence
    : [];
  const subjects = smokingGunRows.flatMap((row) => {
    const record = getRecord(row);
    if (!record) {
      return [];
    }
    return [
      getString(record.cookieName),
      getString(record.vendor),
      getString(record.host),
      getString(record.label),
    ].filter((value): value is string => Boolean(value));
  });
  return uniqueStrings(subjects).slice(0, 4);
}

function formatSubjectList(subjects: string[], fallback: string) {
  if (subjects.length === 0) {
    return fallback;
  }
  if (subjects.length === 1) {
    return subjects[0]!;
  }
  const head = subjects.slice(0, -1).join(", ");
  return `${head}, and ${subjects[subjects.length - 1]}`;
}

function isPolicyDisclosureNotConfirmed(parsed: Record<string, unknown>, retainedEvidence: Record<string, unknown> | null) {
  const status = getString(parsed.status) ?? getString(parsed.statusLabel);
  const assessmentStatus = getString(parsed.assessmentStatus);
  const signalObserved = retainedEvidence?.signalObserved;
  const pipeline = getRecord(parsed.pipeline);
  const concernPolicyKey = getString(pipeline?.concernPolicyKey);
  return (
    (status === "Not confirmed" && assessmentStatus === "review_signal") ||
    signalObserved === "not_confirmed_row_specific_extraction" ||
    signalObserved === "not_confirmed_policy_disclosure_extraction" ||
    Boolean(concernPolicyKey?.endsWith(".not_confirmed"))
  );
}

function getCorrectionGuidance(jsonPayload: string): CorrectionGuidance {
  const parsed = getParsedEvidence(jsonPayload);
  if (!parsed) {
    return { kind: "none", steps: [] };
  }
  const coverageArea = getString(parsed.coverageArea) ?? "this coverage area";
  const normalizedCoverageArea = coverageArea.toLowerCase();
  const assessmentStatus = getString(parsed.assessmentStatus);
  const evidenceState = getString(parsed.evidenceState);
  const status = getString(parsed.status) ?? getString(parsed.statusLabel);
  const retainedEvidence = getRetainedEvidence(jsonPayload);
  const traceSubjects = getTraceSubjects(retainedEvidence);
  const subjectList = formatSubjectList(traceSubjects, "the signals shown in the result trace");
  const isGapOrReview =
    assessmentStatus === "gap_observed" ||
    assessmentStatus === "review_signal" ||
    /gap|review|potential/i.test(status ?? "");
  const isNotTestable =
    evidenceState === "not_testable" ||
    assessmentStatus === "coverage_limitation" ||
    assessmentStatus === "needs_evidence" ||
    /not testable|insufficient evidence|coverage/i.test(status ?? "");
  const isPositiveOrClearOutcome =
    !isGapOrReview &&
    !isNotTestable &&
    (
      assessmentStatus === "checked" ||
      assessmentStatus === "not_applicable" ||
      evidenceState === "observed" ||
      evidenceState === "not_observed" ||
      evidenceState === "not_applicable" ||
      /observed|not observed|checked|out of scope|not applicable/i.test(status ?? "")
    );

  const verifyStep = "Rerun the v2 scan and confirm the row changes from a gap/review signal to observed, checked, not observed, or a documented coverage limitation.";
  const evidenceStep = "Keep a short internal record of the changed control, policy surface, or tag-setting rule so the next scan can be reviewed against the same evidence.";

  if (isPolicyDisclosureNotConfirmed(parsed, retainedEvidence)) {
    return {
      kind: "steps",
      steps: [
        "Review the retained privacy-policy surface for the row-specific disclosure.",
        "If the disclosure exists, improve scanner extraction or matcher coverage, or add an internal review note.",
        "If the disclosure is missing, update the privacy notice or internal review record.",
        "Rerun the scan and confirm the row changes to Observed, Partial support, Not confirmed, or a documented coverage limitation.",
      ],
    };
  }

  if (isPositiveOrClearOutcome) {
    const statusText = status ?? assessmentStatus ?? "checked";
    return {
      kind: "none",
      message: `${coverageArea} is currently rated ${statusText}. No site remediation is indicated from this row alone; rerun after material site, policy, or tag changes.`,
      steps: [],
    };
  }

  if (isNotTestable && !isGapOrReview) {
    return {
      kind: "steps",
      steps: [
        `This row is not fully testable for ${coverageArea} in the retained scan context, so the next step is to improve observability rather than remediate a confirmed issue.`,
        "Run the missing scanner module or repair the blocked page/path noted in the evidence packet.",
        "Confirm the relevant page, policy, or user-choice control is reachable without authentication or bot challenge.",
        "Retest with the same scan profile so this row can move from not testable to observed or not observed.",
        evidenceStep,
      ],
    };
  }

  if (/cookies? or storage before consent|storage before consent/.test(normalizedCoverageArea)) {
    return {
      kind: "steps",
      steps: [
      `Inventory ${subjectList} and confirm which tag, script, or response sets each item before consent.`,
      "Configure the CMP/tag manager so non-essential cookies and browser storage are not written until the user has made the appropriate consent choice.",
      "Put analytics, advertising, personalization, and cross-site measurement tags behind the matching consent category.",
      "Clear existing test cookies and verify a fresh first visit does not set those non-essential cookies before consent.",
      verifyStep,
    ]};
  }

  if (/pre-consent third-party tracking|targeted advertising/.test(normalizedCoverageArea)) {
    return {
      kind: "steps",
      steps: [
      `Identify ${subjectList} and the page-load rule that caused the request before consent or opt-out was applied.`,
      "Move advertising, retargeting, analytics, and cross-site measurement requests behind the relevant consent or opt-out gate.",
      "Check tag-manager firing rules, embedded pixels, iframes, and ad slots for requests that fire on initial page load.",
      "Verify a fresh pre-consent visit does not call the listed tracking endpoints.",
      verifyStep,
    ]};
  }

  if (/consent banner|preference surface|cookie notice/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Confirm the first visible consent or cookie notice clearly explains the relevant cookie/tracking use.",
      "Make accept, reject, and manage-preference choices easy to locate from the same initial surface where applicable.",
      "Ensure the cookie notice or policy link opens a reachable page with current, bounded cookie/tracking details.",
      "Test the flow in a fresh browser context with no prior consent cookies.",
      verifyStep,
    ]};
  }

  if (/decline|reject option|reject-all|refusal path/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add or expose a clear reject-all or equivalent refusal control wherever the consent surface offers accept-all.",
      "Keep the reject path reachable without requiring unnecessary extra steps compared with accepting.",
      "Confirm the reject action stores a durable refusal state and closes or updates the consent surface.",
      "Verify the scanner can observe successful reject action proof in a fresh run.",
      verifyStep,
    ]};
  }

  if (/tracking after refusal|post[- ]reject|post opt-out|post-opt-out/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Confirm the reject or opt-out action completed successfully before comparing post-choice tracking.",
      `Review ${subjectList} and any other vendors, cookies, or endpoints that persisted after the user choice.`,
      "Update tag-manager, ad-tech, and CMP integrations so non-essential tracking is suppressed after refusal or opt-out.",
      "Test pre-choice and post-choice traffic in isolated browser contexts and compare the same page journey.",
      verifyStep,
    ]};
  }

  if (/withdrawal|post-choice consent controls|preference/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add a persistent footer, privacy page, or settings control that lets users reopen cookie or consent preferences.",
      "Make the control label clear, such as Cookie Settings, Privacy Choices, or Manage Preferences.",
      "Verify a user can change a prior choice and that tags update after the new choice is saved.",
      "Retest after clearing prior consent state and after making an initial choice.",
      verifyStep,
    ]};
  }

  if (/privacy notice/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add or repair a public privacy notice link in a predictable location such as the footer.",
      "Ensure the notice page loads without authentication, bot challenge, or broken redirects.",
      "Include clear sections for data collection, use, sharing, cookies/tracking, rights, and contact paths as applicable.",
      "Verify the scanner can fetch the notice and retain a bounded evidence excerpt.",
      verifyStep,
    ]};
  }

  if (/notice at collection/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Place a privacy or collection notice near forms, sign-up flows, checkout, account creation, or other data-entry points.",
      "Make the notice visible before the user submits personal information.",
      "Link the notice to the relevant privacy notice or collection-specific explanation.",
      "Test the specific collection page, not only the homepage or footer.",
      verifyStep,
    ]};
  }

  if (/do not sell|sell or share|privacy choices|opt-out/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add a clear Do Not Sell or Share, Your Privacy Choices, or equivalent opt-out path where applicable.",
      "Ensure the link is reachable from the homepage footer and relevant privacy surfaces.",
      "Make the opt-out control complete without broken redirects, blocked pages, or ambiguous save states.",
      "Verify advertising or sharing-related tags respect the saved opt-out choice.",
      verifyStep,
    ]};
  }

  if (/gpc|global privacy control/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Detect the Sec-GPC signal on relevant requests and route it into the same preference system as other opt-out choices.",
      "Show or retain a bounded acknowledgement when the signal is recognized, if your experience supports that.",
      "Suppress sale/share or targeted-advertising tags when GPC is active where applicable.",
      "Run a GPC-enabled browser test and compare the resulting cookies, requests, and opt-out state.",
      verifyStep,
    ]};
  }

  if (/session replay|fingerprinting|behavior/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      `Review ${subjectList} and any other replay, behavioral analytics, or fingerprinting-like vendor signals.`,
      "Disable recording on sensitive forms, account pages, health/financial inputs, and other high-risk entry points.",
      "Gate replay or behavioral analytics behind the appropriate consent category where required by your policy.",
      "Verify collection endpoints do not receive sensitive field values or unmasked interaction content.",
      verifyStep,
    ]};
  }

  if (/vendor alignment|disclosure alignment|runtime vendor/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      `Compare ${subjectList} against the privacy/cookie disclosures and confirm whether each observed runtime vendor is disclosed clearly enough for review.`,
      "Add missing vendors or categories to the relevant notice, or remove/replace unexpected runtime vendors.",
      "Confirm vendor ownership where domains are operated by an ad-tech, analytics, or infrastructure partner.",
      "Retest after policy and tag changes so runtime and disclosure evidence can be matched.",
      verifyStep,
    ]};
  }

  if (/cross-border|endpoint/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      `Identify ${subjectList} and any other third-party endpoint hosts shown in the trace.`,
      "Confirm where each endpoint is operated, processed, or routed, using vendor documentation if needed.",
      "Update transfer, vendor, or subprocessors disclosures when the retained policy surface does not cover the observed processing context.",
      "Remove or regionalize endpoints that are not needed for the tested page or visitor context.",
      verifyStep,
    ]};
  }

  if (/rights/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add a clear method for users to exercise privacy rights, such as a web form, email, portal, or toll-free number where applicable.",
      "Make the method reachable from the privacy notice and relevant footer/privacy-choice surfaces.",
      "Describe the request types supported and any verification steps users should expect.",
      "Verify the scanner can find and retain the rights-request method evidence.",
      verifyStep,
    ]};
  }

  if (isGapOrReview) {
    return { kind: "steps", steps: [
      `Review the result trace and evidence packet for the specific signal behind ${coverageArea}.`,
      "Update the affected consent, policy, tag-manager, vendor, or user-choice implementation.",
      "Retest in a fresh browser context so prior cookies or preferences do not hide the change.",
      verifyStep,
      evidenceStep,
    ]};
  }

  return {
    kind: "none",
    message: `${coverageArea} does not currently indicate a corrective action from this scan row.`,
    steps: [],
  };
}

function resultTraceStatusClass(status: ResultTraceEvent["status"]) {
  switch (status) {
    case "fail":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "pass":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "info":
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
}

function stageAccentClass(status: ResultTraceEvent["status"]) {
  switch (status) {
    case "fail":
      return "border-l-rose-300";
    case "pass":
      return "border-l-emerald-300";
    case "warn":
      return "border-l-amber-300";
    case "info":
    default:
      return "border-l-sky-300";
  }
}

function explanationRowClass(tone: ResultExplanationRow["tone"]) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50/50";
    case "bad":
      return "border-rose-200 bg-rose-50/50";
    case "warn":
      return "border-amber-200 bg-amber-50/50";
    case "info":
    default:
      return "border-slate-200 bg-white";
  }
}

function explanationLabelClass(tone: ResultExplanationRow["tone"]) {
  switch (tone) {
    case "good":
      return "text-emerald-800";
    case "bad":
      return "text-rose-800";
    case "warn":
      return "text-amber-900";
    case "info":
    default:
      return "text-slate-500";
  }
}

export function RegulatoryChecklistCorrectionSteps({
  defaultOpen = false,
  jsonPayload,
}: Pick<RegulatoryChecklistEvidenceDetailsProps, "jsonPayload"> & {
  defaultOpen?: boolean;
}) {
  const guidance = getCorrectionGuidance(jsonPayload);
  if (guidance.steps.length === 0 && !guidance.message) {
    return null;
  }

  return (
    <details className="mt-1 rounded-md border border-slate-200 bg-white" open={defaultOpen || undefined}>
      <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Correction steps
      </summary>
      {guidance.kind === "none" ? (
        <div className="max-h-[50vh] overflow-y-auto border-t border-slate-200 bg-emerald-50/40 px-2.5 py-2">
          <p className="text-xs leading-5 text-slate-700">{guidance.message}</p>
        </div>
      ) : (
        <ol className="max-h-[50vh] space-y-1.5 overflow-y-auto border-t border-slate-200 bg-emerald-50/40 px-2.5 py-2">
          {guidance.steps.map((step, index) => (
            <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 text-xs leading-5 text-slate-700" key={`${index}:${step}`}>
              <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-emerald-200 bg-white text-[9px] font-semibold text-emerald-700">
                {index + 1}
              </span>
              <span className="min-w-0 break-words text-xs leading-5 text-slate-700">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

export function RegulatoryChecklistActiveTrace({
  defaultOpen = false,
  evidenceRefs,
  jsonPayload,
}: RegulatoryChecklistEvidenceDetailsProps & {
  defaultOpen?: boolean;
}) {
  const parsed = getParsedEvidence(jsonPayload);
  const explanationRows = getResultExplanationRows({ evidenceRefs, jsonPayload });
  if (!parsed || explanationRows.length === 0) {
    return null;
  }

  return (
    <details className="mt-1 rounded-md border border-slate-200 bg-white" open={defaultOpen || undefined}>
      <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Why this result?
      </summary>
      <div className="max-h-[50vh] overflow-y-auto border-t border-slate-200 bg-slate-50/60 px-2.5 py-2">
        <dl className="space-y-1.5">
          {explanationRows.map((row) => (
            <div className={`rounded-md border px-2.5 py-1.5 ${explanationRowClass(row.tone)}`} key={`${row.label}:${row.detail}`}>
              <dt className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${explanationLabelClass(row.tone)}`}>
                {row.label}
              </dt>
              <dd className="mt-1 text-xs leading-5 text-slate-800">{row.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

export function RegulatoryChecklistEvidenceDetails(input: RegulatoryChecklistEvidenceDetailsProps) {
  const evidenceSummaryRows = getEvidenceSummaryRows(input);

  return (
    <>
      {evidenceSummaryRows.length > 0 ? (
        <div className="border-t border-slate-200 px-2.5 py-1.5">
          <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] leading-5 text-sky-950">
            {evidenceSummaryRows.map((row, index) => (
              <p className="font-mono" key={`${index}:${row}`}>{row}</p>
            ))}
          </div>
        </div>
      ) : null}
      <EvidenceJsonBlock
        payload={input.jsonPayload}
        className="rounded-none border-t border-slate-800"
        preClassName="max-h-48 px-2.5 py-2 pr-12 font-mono text-[11px] leading-5"
      />
    </>
  );
}
