export type RuntimeCookieEvidenceRow = {
  category: string;
  cookieName: string;
  domain: string | null;
  firstObservedAtMs: number | null;
  initiatorDomain: string | null;
  initiatorUrl: string | null;
  initiatorVendor: string | null;
  nonEssential: boolean;
  party: "first_party" | "third_party" | "unknown";
  setAtMs: number | null;
  setMethod: string | null;
  timingEvidence: "before_consent_cookie_write" | "initial_cookie_snapshot" | "unknown";
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

export function classifyRuntimeCookieCategory(name: string, domain: string | null = null) {
  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
  if (
    /(^_ga|^_gid|^_gat|ga_|goog|gtm|plausible|analytics|amplitude|segment|mixpanel|posthog|ajs_anonymous_id|ajs_user_id|analytics_session_id|heap|mp_|intercom-id|hubspotutk|__hstc|__hssc)/i.test(
      normalized
    )
  ) {
    return "analytics";
  }
  if (
    /(^_fbp|^_fbc|gcl_|ttclid|ttp|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|anusercookie|rtmark|infolinks|doubleclick|criteo|media\.net|_mkto_trk|muid|fr\b|demdex|dpm\.demdex|amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check|optimizely|_vwo|_vis_opt|guest_id_ads|guest_id_marketing|personalization_id)/i.test(
      normalized
    )
  ) {
    return "advertising";
  }
  if (/(qsi_replaysession|qualtrics|hotjar|fullstory|clarity|contentsquare|mouseflow|fs_uid|hjSession|_hj)/i.test(normalized)) {
    return "session_replay";
  }
  if (
    /(cf_clearance|__cf|recaptcha|akamai|datadome|perimeterx|awsalb|awsalbcors|awsalbtg|bm_sz|ak_bmsc|_abck|csrf|xsrf|phpsessid|jsessionid|(^|\b)sid($|\b)|(^|\b)session($|\b)|optanonconsent|cookieyes-consent|didomi_token)/i.test(
      normalized
    )
  ) {
    return "necessary";
  }
  return "unknown";
}

export function isNonEssentialCookieCategory(category: string | null | undefined) {
  return category === "analytics" || category === "advertising" || category === "session_replay";
}

function getCookiePartyType(row: Record<string, unknown>): RuntimeCookieEvidenceRow["party"] {
  if (row.thirdParty === true || row.third_party === true) {
    return "third_party";
  }
  const cookiePartyType = getString(row.cookiePartyType ?? row.cookie_party_type);
  if (cookiePartyType === "third_party" || cookiePartyType === "first_party") {
    return cookiePartyType;
  }
  return "first_party";
}

function isPreconsentCookieWrite(row: Record<string, unknown>, hybrid: Record<string, unknown> | null) {
  if (row.beforeConsent === true || row.before_consent === true) {
    return true;
  }
  const timingEvidence = getString(row.timingEvidence ?? row.timing_evidence);
  if (timingEvidence === "before_consent_cookie_write") {
    return true;
  }
  const setAtMs = getNumber(row.setAtMs ?? row.set_at_ms ?? row.firstObservedAtMs ?? row.first_observed_at_ms);
  const timelineMarkers = getRecord(hybrid?.timelineMarkers ?? hybrid?.timeline_markers);
  const consentChoiceAtMs = getNumber(
    timelineMarkers?.consentChoiceAtMs ??
      timelineMarkers?.consent_choice_at_ms ??
      timelineMarkers?.consentAcceptedAtMs ??
      timelineMarkers?.consent_accepted_at_ms ??
      timelineMarkers?.consentRejectedAtMs ??
      timelineMarkers?.consent_rejected_at_ms
  );
  const consentBannerDetectedMs = getNumber(timelineMarkers?.consentBannerDetectedMs ?? timelineMarkers?.consent_banner_detected_ms);
  const threshold = consentChoiceAtMs ?? consentBannerDetectedMs;
  return setAtMs !== null && threshold !== null && setAtMs < threshold;
}

function normalizeCookieWriteRow(row: Record<string, unknown>, hybrid: Record<string, unknown> | null): RuntimeCookieEvidenceRow | null {
  const cookieName = getString(row.cookieName ?? row.cookie_name ?? row.name);
  if (!cookieName) {
    return null;
  }
  const domain = getString(row.domain ?? row.cookieDomain ?? row.cookie_domain);
  const category = getString(row.category ?? row.cookieCategory ?? row.cookie_category) ?? classifyRuntimeCookieCategory(cookieName, domain);
  const setAtMs = getNumber(row.setAtMs ?? row.set_at_ms);
  const firstObservedAtMs = getNumber(row.firstObservedAtMs ?? row.first_observed_at_ms) ?? setAtMs;
  return {
    category,
    cookieName,
    domain,
    firstObservedAtMs,
    initiatorDomain: getString(row.initiatorDomain ?? row.initiator_domain ?? row.cookieInitiatorDomain ?? row.cookie_initiator_domain),
    initiatorUrl: getString(row.initiatorUrl ?? row.initiator_url ?? row.cookieInitiatorUrl ?? row.cookie_initiator_url),
    initiatorVendor: getString(row.initiatorVendor ?? row.initiator_vendor ?? row.cookieInitiatorVendor ?? row.cookie_initiator_vendor),
    nonEssential: getBoolean(row.nonEssential ?? row.non_essential) ?? isNonEssentialCookieCategory(category),
    party: getCookiePartyType(row),
    setAtMs,
    setMethod: getString(row.cookieSetMethod ?? row.cookie_set_method ?? row.setMethod ?? row.set_method),
    timingEvidence: isPreconsentCookieWrite(row, hybrid) ? "before_consent_cookie_write" : "unknown"
  };
}

function normalizeInitialCookieRow(cookieName: string, domain: string | null): RuntimeCookieEvidenceRow {
  const category = classifyRuntimeCookieCategory(cookieName, domain);
  return {
    category,
    cookieName,
    domain,
    firstObservedAtMs: null,
    initiatorDomain: null,
    initiatorUrl: null,
    initiatorVendor: null,
    nonEssential: isNonEssentialCookieCategory(category),
    party: "unknown",
    setAtMs: null,
    setMethod: "initial_cookie_snapshot",
    timingEvidence: "initial_cookie_snapshot"
  };
}

export function buildRuntimeCookieInventory(input: {
  hybridRuntimeEvidence?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
}) {
  const hybrid = getRecord(input.hybridRuntimeEvidence);
  const runtimeArtifacts = getRecord(input.runtimeArtifacts);
  const cookieWriteRows = getObjectArray(hybrid?.cookieWriteObservations ?? hybrid?.cookie_write_observations)
    .map((row) => normalizeCookieWriteRow(row, hybrid))
    .filter((row): row is RuntimeCookieEvidenceRow => Boolean(row));
  const explicitPreconsentRows = getObjectArray(hybrid?.preconsentCookieEvidence ?? hybrid?.preconsent_cookie_evidence)
    .map((row) => normalizeCookieWriteRow({ ...row, beforeConsent: true }, hybrid))
    .filter((row): row is RuntimeCookieEvidenceRow => Boolean(row));
  const initialCookieNames = getStringArray(runtimeArtifacts?.initial_cookie_names ?? runtimeArtifacts?.initialCookieNames);
  const initialCookieDomains = getStringArray(runtimeArtifacts?.initial_cookie_domains ?? runtimeArtifacts?.initialCookieDomains);
  const initialRows = initialCookieNames.map((cookieName, index) => normalizeInitialCookieRow(cookieName, initialCookieDomains[index] ?? null));
  const rowsByKey = new Map<string, RuntimeCookieEvidenceRow>();
  for (const row of [...cookieWriteRows, ...explicitPreconsentRows, ...initialRows]) {
    const key = `${row.cookieName}\u0000${row.domain ?? ""}`;
    const existing = rowsByKey.get(key);
    if (!existing || existing.timingEvidence !== "before_consent_cookie_write" && row.timingEvidence === "before_consent_cookie_write") {
      rowsByKey.set(key, row);
    }
  }
  const rows = [...rowsByKey.values()];
  const beforeConsentRows = rows.filter((row) => row.timingEvidence === "before_consent_cookie_write");
  const nonEssentialRows = rows.filter((row) => row.nonEssential);
  const unmatchedRows = getObjectArray(hybrid?.unmatchedRuntimeCookies ?? hybrid?.unmatched_runtime_cookies)
    .map((row) => normalizeCookieWriteRow(row, hybrid))
    .filter((row): row is RuntimeCookieEvidenceRow => Boolean(row));
  const unmatchedCookieNames = uniqueStrings([
    ...getStringArray(hybrid?.unmatchedCookieNames ?? hybrid?.unmatched_cookie_names),
    ...unmatchedRows.map((row) => row.cookieName)
  ]);

  return {
    beforeConsentCookieNames: uniqueStrings(beforeConsentRows.map((row) => row.cookieName)),
    beforeConsentRows,
    cookieCategories: uniqueStrings(rows.map((row) => row.category)),
    cookieNames: uniqueStrings(rows.map((row) => row.cookieName)),
    nonEssentialCookieNames: uniqueStrings(nonEssentialRows.map((row) => row.cookieName)),
    rows,
    unmatchedCookieNames,
    unmatchedRows
  };
}
