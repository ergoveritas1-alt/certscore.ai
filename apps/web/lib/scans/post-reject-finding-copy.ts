type ActivityDetails = {
  version: 1;
  activityCount: number;
  networkRequestCount: number;
  storageWriteCount: number;
  vendorAttributedActivityCount: number;
  vendors: string[];
  timedActivityCount: number;
  firstObservedMsAfterReject: number | null;
  lastObservedMsAfterReject: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

// Describe the canonical eligible rows before the checklist bounds its display
// sample. This aggregate changes neither finding eligibility nor scoring.
export function summarizePostRejectActivity(rows: Record<string, unknown>[]): ActivityDetails {
  const times = rows.flatMap(row => {
    const time = nonNegativeNumber(row.msAfterReject ?? row.ms_after_reject);
    return time === null ? [] : [time];
  });
  const vendors = rows.flatMap(row => {
    const vendor = row.vendor ?? row.vendorName ?? row.vendor_name;
    return typeof vendor === "string" && vendor.trim() ? [vendor.trim()] : [];
  });
  return {
    version: 1,
    activityCount: rows.length,
    networkRequestCount: rows.filter(row => row.activityType === "network_request").length,
    storageWriteCount: rows.filter(row => row.activityType === "storage_write").length,
    vendorAttributedActivityCount: vendors.length,
    vendors: [...new Set(vendors)],
    timedActivityCount: times.length,
    firstObservedMsAfterReject: times.length ? Math.min(...times) : null,
    lastObservedMsAfterReject: times.length ? Math.max(...times) : null,
  };
}

function readDetails(value: unknown, count: number): ActivityDetails | null {
  const details = record(value);
  if (!details || details.version !== 1 || details.activityCount !== count) return null;
  for (const key of ["networkRequestCount", "storageWriteCount", "vendorAttributedActivityCount", "timedActivityCount"]) {
    const n = nonNegativeNumber(details[key]);
    if (n === null || !Number.isInteger(n) || n > count) return null;
  }
  if ((details.networkRequestCount as number) + (details.storageWriteCount as number) > count ||
      !Array.isArray(details.vendors) || !details.vendors.every(v => typeof v === "string" && v.trim())) return null;
  const first = nonNegativeNumber(details.firstObservedMsAfterReject);
  const last = nonNegativeNumber(details.lastObservedMsAfterReject);
  if (details.timedActivityCount !== 0 && (first === null || last === null || last < first)) return null;
  return details as ActivityDetails;
}

function timingText(first: number, last: number) {
  if (last < 1000) return `${first === last ? first : `${first}–${last}`} ms`;
  const seconds = (ms: number) => Number((ms / 1000).toFixed(2));
  return `${first === last ? seconds(first) : `${seconds(first)}–${seconds(last)}`} s`;
}

/** Copy for an already eligible checklist finding, never an eligibility test. */
export function describePostRejectFinding(value: unknown): { title: string; summary: string } | null {
  const evidence = record(value);
  if (!evidence) return null;
  if ((nonNegativeNumber(evidence.preConsentStorageNotClearedCount) ?? 0) > 0 &&
      evidence.storagePresenceDoesNotEstablishActiveUse === true && evidence.scoreEffect === "none" &&
      evidence.postRejectNonEssentialActivityRetained !== true && evidence.refusalSignalContradictsAction !== true) {
    return {
      title: "Same non-essential identifier remained stored after Reject",
      summary: "The same classified non-essential identifier remained stored after confirmed Reject. No qualifying post-Reject request or storage write was retained; stored presence alone does not show active use.",
    };
  }
  if (evidence.rejectInteractionConfirmed !== true) return null;
  if (evidence.refusalSignalContradictsAction === true) return {
    title: "Consent state contradicted confirmed Reject",
    summary: "The cookie banner’s Reject control was confirmed, but the retained consent state still encoded granted purposes afterward.",
  };
  if (evidence.postRejectNonEssentialActivityRetained !== true) return null;
  const count = nonNegativeNumber(evidence.postRejectNonEssentialRequestCount);
  if (!count || !Number.isInteger(count)) return {
    title: "Non-essential activity after confirmed Reject",
    summary: "After the cookie banner’s Reject control was confirmed, qualifying non-essential requests or storage writes were retained in the post-Reject window.",
  };
  const sample = Array.isArray(evidence.postRejectNonEssentialRequests)
    ? evidence.postRejectNonEssentialRequests.flatMap(row => record(row) ? [record(row)!] : []) : [];
  const details = readDetails(evidence.postRejectActivityDetails, count);
  const sampleDetails = summarizePostRejectActivity(sample);
  const complete = details ?? (sample.length === count ? sampleDetails : null);
  const vendors = complete?.vendors ?? sampleDetails.vendors;
  const vendorLabel = vendors.length <= 2 ? vendors.join(" and ") : `${vendors.slice(0, 2).join(", ")} and other services`;
  const allAttributed = complete?.vendorAttributedActivityCount === count;
  const activity = complete?.networkRequestCount === count ? (count === 1 ? "request" : "requests")
    : complete?.storageWriteCount === count ? (count === 1 ? "storage write" : "storage writes")
    : (count === 1 ? "activity observation" : "activity observations");
  const timing = complete && complete.timedActivityCount === count && complete.firstObservedMsAfterReject !== null && complete.lastObservedMsAfterReject !== null
    ? ` ${timingText(complete.firstObservedMsAfterReject, complete.lastObservedMsAfterReject)} after confirmed Reject`
    : " after confirmed Reject";
  // A historical bounded sample supports an example, not the full time range.
  const example = !complete && sampleDetails.firstObservedMsAfterReject !== null
    ? ` One retained observation occurred ${timingText(sampleDetails.firstObservedMsAfterReject, sampleDetails.firstObservedMsAfterReject)} after confirmed Reject.` : "";
  return {
    title: `${allAttributed && vendorLabel ? vendorLabel : "Non-essential"} activity after Reject`,
    summary: `${count} non-essential ${allAttributed && vendorLabel ? `${vendorLabel} ` : ""}${activity} ${count === 1 ? "was" : "were"} observed${timing}${!allAttributed && vendorLabel ? `, including ${vendorLabel}` : ""}.${example}`,
  };
}
