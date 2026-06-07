import React from "react";
import { EvidenceJsonBlock } from "./evidence-json-block";

type RegulatoryChecklistEvidenceDetailsProps = {
  evidenceRefs?: string[];
  jsonPayload: string;
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
      formatScalarLine("targetedAdvertisingSignalsObserved", retainedEvidence.targetedAdvertisingSignalsObserved),
      formatScalarLine("runtimeVendorRequestUrlCoherence", retainedEvidence.runtimeVendorRequestUrlCoherence),
      formatArrayLine("advertisingSharingVendors", getStringArray(retainedEvidence.advertisingSharingVendors)),
      formatArrayLine("saleShareRequestUrls", getStringArray(retainedEvidence.saleShareRequestUrls))
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

export function RegulatoryChecklistEvidenceDetails(input: RegulatoryChecklistEvidenceDetailsProps) {
  const evidenceSummaryRows = getEvidenceSummaryRows(input);

  return (
    <>
      {evidenceSummaryRows.length > 0 ? (
        <div className="border-t border-slate-200 px-3 py-2">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
            {evidenceSummaryRows.map((row, index) => (
              <p className="font-mono" key={`${index}:${row}`}>{row}</p>
            ))}
          </div>
        </div>
      ) : null}
      <EvidenceJsonBlock
        payload={input.jsonPayload}
        className="rounded-none border-t border-slate-800"
        preClassName="max-h-72 px-3 py-3 pr-12 font-mono text-[11px] leading-5"
      />
    </>
  );
}
