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

function getEvidenceSummaryRows(input: RegulatoryChecklistEvidenceDetailsProps) {
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
