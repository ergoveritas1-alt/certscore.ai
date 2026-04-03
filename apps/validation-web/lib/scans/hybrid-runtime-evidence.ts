function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getExistingArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const values = getStringArray(record[key]);
    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function getExistingNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function getHybridRuntimeEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRecord(runtimeArtifacts?.hybrid_runtime_evidence ?? runtimeArtifacts?.hybridRuntimeEvidence);
}

export function getHybridConsentAuditCompleted(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  return hybrid && getRecord(hybrid.consentSummary) ? true : null;
}

function getConsentOutcomeSummary(hybrid: Record<string, unknown> | null) {
  return getRecord(hybrid?.consentOutcomeSummary);
}

function getPreconsentTrackerVendors(hybrid: Record<string, unknown> | null) {
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const vendors = requestToVendorObservations
    .filter((row) => row.pre_consent === true || row.preConsent === true)
    .flatMap((row) => (typeof row.vendor === "string" ? [row.vendor] : []));

  return uniqueStrings(vendors);
}

export function getHybridPreconsentViolationCount(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return null;
  }

  const networkSummary = getRecord(hybrid.networkSummary);
  const explicitCount = getNumber(networkSummary?.preConsentThirdPartyRequestCount);
  if (explicitCount !== null) {
    return explicitCount;
  }

  const vendorCount = getPreconsentTrackerVendors(hybrid).length;
  return vendorCount > 0 ? vendorCount : 0;
}

export function getHybridPreconsentTrackerVendors(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getPreconsentTrackerVendors(getHybridRuntimeEvidence(runtimeArtifacts));
}

export function withHybridRuntimeArtifactFallbacks(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  if (!runtimeArtifacts) {
    return runtimeArtifacts ?? null;
  }

  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return runtimeArtifacts;
  }

  const networkSummary = getRecord(hybrid.networkSummary);
  const requestTypeCounts = getRecord(networkSummary?.requestTypeCounts);
  const vendorSummary = getRecord(hybrid.vendorSummary);
  const storageSummary = getRecord(hybrid.storageSummary);
  const requestObservations = getObjectArray(hybrid.requestObservations);
  const cookieWriteObservations = getObjectArray(hybrid.cookieWriteObservations);
  const consentOutcomeSummary = getConsentOutcomeSummary(hybrid);

  const thirdPartyRequestDomains = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["third_party_request_domains", "thirdPartyRequestDomains"]),
    ...getStringArray(vendorSummary?.rawThirdPartyDomains),
    ...requestObservations
      .filter((row) => row.thirdParty === true)
      .flatMap((row) => (typeof row.domain === "string" ? [row.domain] : []))
  ]);
  const initialCookieNames = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["initial_cookie_names", "initialCookieNames"]),
    ...cookieWriteObservations.flatMap((row) => (typeof row.cookieName === "string" ? [row.cookieName] : []))
  ]);
  const initialCookieDomains = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["initial_cookie_domains", "initialCookieDomains"]),
    ...cookieWriteObservations.flatMap((row) => (typeof row.domain === "string" ? [row.domain] : []))
  ]);
  const scriptSrcDomains = uniqueStrings([
    ...getExistingArray(runtimeArtifacts, ["script_src_domains", "scriptSrcDomains"]),
    ...requestObservations
      .filter((row) => row.resourceType === "script")
      .flatMap((row) => (typeof row.domain === "string" ? [row.domain] : []))
  ]);

  const thirdPartyRequestCount =
    getExistingNumber(runtimeArtifacts, ["third_party_request_count", "thirdPartyRequestCount"]) ??
    getNumber(networkSummary?.thirdPartyRequestCount) ??
    thirdPartyRequestDomains.length;
  const initialCookieCount =
    getExistingNumber(runtimeArtifacts, ["initial_cookie_count", "initialCookieCount"]) ??
    getNumber(storageSummary?.cookiesSeenCount) ??
    initialCookieNames.length;
  const scriptTagCount =
    getExistingNumber(runtimeArtifacts, ["script_tag_count", "scriptTagCount"]) ??
    getNumber(requestTypeCounts?.script) ??
    scriptSrcDomains.length;
  const consentAuditCompleted =
    getBoolean(runtimeArtifacts.consent_audit_completed) ?? getHybridConsentAuditCompleted(runtimeArtifacts);
  const consentRejectInteractionSucceeded =
    getBoolean(runtimeArtifacts.consent_reject_interaction_succeeded) ?? getBoolean(consentOutcomeSummary?.rejectInteractionSucceeded);
  const consentRejectReducedTracking =
    getBoolean(runtimeArtifacts.consent_reject_reduced_tracking) ?? getBoolean(consentOutcomeSummary?.rejectReducedTracking);
  const consentRejectReducedThirdPartyCookies =
    getBoolean(runtimeArtifacts.consent_reject_reduced_third_party_cookies) ??
    getBoolean(consentOutcomeSummary?.rejectReducedThirdPartyCookies);

  return {
    ...runtimeArtifacts,
    consent_audit_completed: consentAuditCompleted,
    consent_reject_interaction_succeeded: consentRejectInteractionSucceeded,
    consentRejectInteractionSucceeded: consentRejectInteractionSucceeded,
    consent_reject_reduced_tracking: consentRejectReducedTracking,
    consentRejectReducedTracking: consentRejectReducedTracking,
    consent_reject_reduced_third_party_cookies: consentRejectReducedThirdPartyCookies,
    consentRejectReducedThirdPartyCookies: consentRejectReducedThirdPartyCookies,
    third_party_request_count: thirdPartyRequestCount,
    thirdPartyRequestCount: thirdPartyRequestCount,
    third_party_request_domains: thirdPartyRequestDomains,
    thirdPartyRequestDomains: thirdPartyRequestDomains,
    initial_cookie_count: initialCookieCount,
    initialCookieCount: initialCookieCount,
    initial_cookie_names: initialCookieNames,
    initialCookieNames: initialCookieNames,
    initial_cookie_domains: initialCookieDomains,
    initialCookieDomains: initialCookieDomains,
    script_tag_count: scriptTagCount,
    scriptTagCount: scriptTagCount,
    script_src_domains: scriptSrcDomains,
    scriptSrcDomains: scriptSrcDomains
  };
}
