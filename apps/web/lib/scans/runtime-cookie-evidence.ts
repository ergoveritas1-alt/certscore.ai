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
  responseUrl: string | null;
  sourceRequestUrl: string | null;
  setAtMs: number | null;
  setMethod: string | null;
  timingBasis: string | null;
  evidenceGrade: string | null;
  timingEvidence: "before_consent_cookie_write" | "initial_cookie_snapshot" | "unknown";
};

export type PolicyCookieDisclosureRow = {
  category: string | null;
  cookieName: string | null;
  domain: string | null;
  provider: string | null;
  purpose: string | null;
};

export type CookieDisclosureGapEvidence = {
  cookie_policy_url?: string | null;
  disclosed_cookie_categories: string[];
  disclosed_cookie_names: string[];
  disclosed_cookie_providers: string[];
  matched_runtime_cookies: Array<RuntimeCookieEvidenceRow & { matchType: string }>;
  runtime_cookie_categories: string[];
  runtime_cookie_names: string[];
  unmatched_cookie_categories: string[];
  unmatched_cookie_count: number;
  unmatched_cookie_names: string[];
  unmatched_cookie_vendors: string[];
  unmatched_runtime_cookies: RuntimeCookieEvidenceRow[];
  unmatched_third_party_cookie_count: number;
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
  if (isFunctionalCookieExcludedFromTrackingEvidence(name, domain)) {
    return "necessary";
  }
  if (
    /(^_ga|^_gid|^_gat|ga_|goog|gtm|plausible|analytics|amplitude|segment|mixpanel|posthog|ajs_anonymous_id|ajs_user_id|analytics_session_id|heap|mp_|intercom-id|hubspotutk|__hstc|__hssc|(^|\b)s_ecid(\b|$)|(^|\b)s_sess(\b|$)|(^|\b)s_cc(\b|$)|(^|\b)s_dslv(\b|$)|(^|\b)sat_ppv(\b|$)|^_ali_s_|(^|\b)cna(\b|$)|(^|\b)sca(\b|$)|^yandex|^yuid|aliyun\.com|mmstat\.com|yandex\.(?:ru|com))/i.test(
      normalized
    )
  ) {
    return "analytics";
  }
  if (/(^|\b)aam(\b|$)|(^|\b)dpm(\b|$)|demdex|dpm\.demdex|audience[._-\s]?manager/i.test(normalized)) {
    return "dmp";
  }
  if (
    /(^_fbp|^_fbc|gcl_|ttclid|ttp|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|anusercookie|rtmark|infolinks|doubleclick|criteo|cto_bundle|media\.net|_mkto_trk|muid|fr\b|amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check|optimizely|_vwo|_vis_opt|guest_id_ads|guest_id_marketing|personalization_id|pubmatic|krtbcookie|pugt|spugt|bidswitch|tuuid|id5|casalemedia|cmid|cmps|cmpro|gumgum|3lift|tluid|sync\b|tapad|adsrvr|tdid|tdcpm|rubiconproject|openx|adform|bidr\.io|scorecardresearch|quantserve|crwdcntrl|panoramaid|_pubcid|lijit|mathtag|rlcdn|rlas3|pxrc|pippio|deepintent|amazon-adsystem|stackadapt|onaudience|(^|\b)ide(\b|$)|(^|\b)dextp(\b|$)|(^|\b)tvid(\b|$)|(^|\b)tv_uicr(\b|$)|(^|\b)uid(\b|$)|(^|\b)mc(\b|$)|receive-cookie-deprecation|sailthru|^yabs|sync_cookie_csrf|(^|\b)ftid(\b|$)|(^|\b)bh(\b|$)|ad-privacy|mail\.ru|adriver\.ru)/i.test(
      normalized
    )
  ) {
    return "advertising";
  }
  if (/(qsi_replaysession|qsi_historysession|qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow|fs_uid|hjSession|_hj)/i.test(normalized)) {
    return "session_replay";
  }
  if (
    /(cf_clearance|__cf|recaptcha|akamai|datadome|perimeterx|awsalb|awsalbcors|awsalbtg|akaalb|usp-google|bm_sz|ak_bmsc|_abck|csrf|xsrf|phpsessid|jsessionid|(^|\b)sid($|\b)|(^|\b)session($|\b)|optanonconsent|optanonalertboxclosed|cookieyes-consent|didomi_token|geo_country|trp-country|trp-language)/i.test(
      normalized
    )
  ) {
    return "necessary";
  }
  return "unknown";
}

export function isFunctionalCookieExcludedFromTrackingEvidence(name: string | null | undefined, domain: string | null = null) {
  const normalized = `${name ?? ""} ${domain ?? ""}`.toLowerCase();
  return /(^|\b)(optanonconsent|optanonalertboxclosed|cookieconsent|euconsent-v2|tcfv2|cmapi_cookie_privacy|notice_preferences|notice_gdpr_prefs|cookieyes-consent|didomi_token|geo_country|trp-country|trp-language|__cf_bm|cf_clearance|bigipserver|awsalb|awsalbcors|awsalbtg|akaalb|usp-google|bm_sz|ak_bmsc|_abck|csrf|xsrf|phpsessid|jsessionid)|(^|\b)_sp_/.test(
    normalized
  );
}

export function isNonEssentialCookieCategory(category: string | null | undefined) {
  return category === "analytics" || category === "advertising" || category === "dmp" || category === "session_replay" || category === "personalization";
}

function inferCookieProvider(name: string, domain: string | null = null) {
  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
  if (/^_ga|^_gid|^_gat|ga_|goog|gtm|doubleclick/.test(normalized)) {
    return "Google";
  }
  if (/^_fbp|^_fbc|facebook|connect\.facebook|fbcdn/.test(normalized)) {
    return "Meta";
  }
  if (/criteo|cto_bundle/.test(normalized)) {
    return "Criteo";
  }
  if (/doubleclick|googlesyndication|googleads|__gads|__gpi|__eoi/.test(normalized)) {
    return "Google";
  }
  if (/pubmatic|krtbcookie|pugt|spugt/.test(normalized)) {
    return "PubMatic";
  }
  if (/casalemedia|cmid|cmps|cmpro/.test(normalized)) {
    return "Index Exchange";
  }
  if (/bidswitch|tuuid/.test(normalized)) {
    return "BidSwitch";
  }
  if (/id5/.test(normalized)) {
    return "ID5";
  }
  if (/gumgum/.test(normalized)) {
    return "GumGum";
  }
  if (/3lift|tluid/.test(normalized)) {
    return "TripleLift";
  }
  if (/tapad/.test(normalized)) {
    return "Tapad";
  }
  if (/adsrvr|tdid|tdcpm/.test(normalized)) {
    return "The Trade Desk";
  }
  if (/rubiconproject/.test(normalized)) {
    return "Magnite/Rubicon";
  }
  if (/openx/.test(normalized)) {
    return "OpenX";
  }
  if (/^_ttp|ttclid|tiktok/.test(normalized)) {
    return "TikTok";
  }
  if (/(^|\b)aam(\b|$)|demdex|dpm\.demdex|audience[._-\s]?manager/.test(normalized)) {
    return "Adobe Audience Manager";
  }
  if (/amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check/.test(normalized)) {
    return "Adobe Experience Cloud";
  }
  if (/qsi_replaysession|qualtrics|siteintercept/.test(normalized)) {
    return "Qualtrics";
  }
  if (/hotjar|_hj/.test(normalized)) {
    return "Hotjar";
  }
  if (/fullstory|fs_uid/.test(normalized)) {
    return "FullStory";
  }
  if (/clarity|muid/.test(normalized)) {
    return "Microsoft";
  }
  if (/optimizely/.test(normalized)) {
    return "Optimizely";
  }
  if (/_vwo|_vis_opt/.test(normalized)) {
    return "VWO";
  }
  if (/hubspot|__hstc|__hssc/.test(normalized)) {
    return "HubSpot";
  }
  if (/segment|ajs_anonymous_id|ajs_user_id/.test(normalized)) {
    return "Segment";
  }
  if (/_ali_s_|aliyun|mmstat|(^|\b)cna(\b|$)|(^|\b)sca(\b|$)/.test(normalized)) {
    return "Alibaba / Umeng Analytics";
  }
  if (/yandex|yuid|yabs/.test(normalized)) {
    return /yabs|sync_cookie_csrf/.test(normalized) ? "Yandex Ads" : "Yandex";
  }
  if (/mail\.ru|(^|\b)ftid(\b|$)|(^|\b)bh(\b|$)/.test(normalized)) {
    return "Mail.ru / VK Ads";
  }
  if (/adriver/.test(normalized)) {
    return "Adriver";
  }
  if (/amazon-adsystem|ad-privacy/.test(normalized)) {
    return "Amazon Ads";
  }
  if (/xiaomi|mi\.com|xm_user_bucket|^xm_/.test(normalized)) {
    return "Xiaomi";
  }
  if (/mixpanel|mp_/.test(normalized)) {
    return "Mixpanel";
  }
  if (/heap/.test(normalized)) {
    return "Heap";
  }
  return null;
}

function getHybridPageHostname(hybrid: Record<string, unknown> | null) {
  const navigationSummary = getRecord(hybrid?.navigationSummary ?? hybrid?.navigation_summary);
  const url = getString(
    navigationSummary?.finalUrl ??
      navigationSummary?.final_url ??
      navigationSummary?.initialUrl ??
      navigationSummary?.initial_url
  );
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalizeHostForCookieParty(value: string | null | undefined) {
  return value?.trim().replace(/^\./, "").replace(/^www\./, "").toLowerCase() ?? null;
}

function roughEtldPlusOne(hostname: string | null | undefined) {
  const parts = (hostname ?? "").replace(/^\./, "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return new Set(["co.uk", "com.au", "com.br", "co.jp", "co.nz", "com.mx"]).has(lastTwo) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : lastTwo;
}

function isSameSiteCookieDomain(cookieDomain: string | null, pageHostname: string | null) {
  const normalizedCookieDomain = normalizeHostForCookieParty(cookieDomain);
  const normalizedPageHostname = normalizeHostForCookieParty(pageHostname);
  if (!normalizedCookieDomain || !normalizedPageHostname) {
    return false;
  }
  return (
    normalizedCookieDomain === normalizedPageHostname ||
    normalizedPageHostname.endsWith(`.${normalizedCookieDomain}`) ||
    normalizedCookieDomain.endsWith(`.${normalizedPageHostname}`) ||
    roughEtldPlusOne(normalizedCookieDomain) === roughEtldPlusOne(normalizedPageHostname)
  );
}

function getCookiePartyType(
  row: Record<string, unknown>,
  domain: string | null,
  hybrid: Record<string, unknown> | null
): RuntimeCookieEvidenceRow["party"] {
  if (isSameSiteCookieDomain(domain, getHybridPageHostname(hybrid))) {
    return "first_party";
  }
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
  if (timingEvidence === "before_consent_cookie_write" || timingEvidence === "initial_cookie_snapshot_with_visible_cmp") {
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
  const explicitCategory = getString(row.category ?? row.cookieCategory ?? row.cookie_category);
  const inferredCategory = classifyRuntimeCookieCategory(cookieName, domain);
  const category = explicitCategory && explicitCategory !== "unknown" ? explicitCategory : inferredCategory;
  const rawSetAtMs = getNumber(row.setAtMs ?? row.set_at_ms);
  const setAtMs = rawSetAtMs !== null && rawSetAtMs >= 0 ? rawSetAtMs : null;
  const rawFirstObservedAtMs = getNumber(row.firstObservedAtMs ?? row.first_observed_at_ms);
  const firstObservedAtMs = rawFirstObservedAtMs !== null && rawFirstObservedAtMs >= 0 ? rawFirstObservedAtMs : setAtMs;
  return {
    category,
    cookieName,
    domain,
    firstObservedAtMs,
    initiatorDomain: getString(row.initiatorDomain ?? row.initiator_domain ?? row.cookieInitiatorDomain ?? row.cookie_initiator_domain),
    initiatorUrl: getString(row.initiatorUrl ?? row.initiator_url ?? row.cookieInitiatorUrl ?? row.cookie_initiator_url),
    initiatorVendor: getString(row.initiatorVendor ?? row.initiator_vendor ?? row.cookieInitiatorVendor ?? row.cookie_initiator_vendor),
    nonEssential: getBoolean(row.nonEssential ?? row.non_essential) ?? isNonEssentialCookieCategory(category),
    party: getCookiePartyType(row, domain, hybrid),
    responseUrl: getString(row.responseUrl ?? row.response_url),
    sourceRequestUrl: getString(row.sourceRequestUrl ?? row.source_request_url ?? row.responseUrl ?? row.response_url ?? row.initiatorUrl ?? row.initiator_url),
    setAtMs,
    setMethod: getString(row.cookieSetMethod ?? row.cookie_set_method ?? row.setMethod ?? row.set_method),
    timingBasis: getString(row.timingBasis ?? row.timing_basis ?? row.timingEvidence ?? row.timing_evidence),
    evidenceGrade: getString(row.evidenceGrade ?? row.evidence_grade),
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
    responseUrl: null,
    sourceRequestUrl: null,
    setAtMs: null,
    setMethod: "initial_cookie_snapshot",
    timingBasis: "initial_cookie_snapshot",
    evidenceGrade: null,
    timingEvidence: "initial_cookie_snapshot"
  };
}

export function buildRuntimeCookieInventory(input: {
  hybridRuntimeEvidence?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
}) {
  const runtimeArtifacts = getRecord(input.runtimeArtifacts);
  const hybrid =
    getRecord(input.hybridRuntimeEvidence) ??
    getRecord(runtimeArtifacts?.hybrid_runtime_evidence ?? runtimeArtifacts?.hybridRuntimeEvidence);
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
  const runtimePolicyReconciliationRows = getObjectArray(
    hybrid?.runtimePolicyReconciliations ?? hybrid?.runtime_policy_reconciliations
  );
  const genericCookieGapUnmatchedRows = runtimePolicyReconciliationRows
    .filter((row) => {
      const signalKey = getString(row.signalKey ?? row.signal_key);
      const findingId = getString(row.findingId ?? row.finding_id);
      const subjectKind = getString(row.subjectKind ?? row.subject_kind);
      return (
        subjectKind === "cookie" &&
        (signalKey === "privacy.cookie_runtime_disclosure_gap_detected" || findingId === "cookie_disclosure_gap")
      );
    })
    .flatMap((row) => getObjectArray(row.unmatchedRuntimeItems ?? row.unmatched_runtime_items));
  const unmatchedRows = [
    ...getObjectArray(hybrid?.unmatchedRuntimeCookies ?? hybrid?.unmatched_runtime_cookies),
    ...genericCookieGapUnmatchedRows
  ]
    .map((row) => normalizeCookieWriteRow(row, hybrid))
    .filter((row): row is RuntimeCookieEvidenceRow => Boolean(row))
    .filter((row, index, allRows) => {
      const key = `${row.cookieName}\u0000${row.domain ?? ""}`;
      return allRows.findIndex((candidate) => `${candidate.cookieName}\u0000${candidate.domain ?? ""}` === key) === index;
    });
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

function normalizeCookieToken(value: string | null | undefined) {
  return value ? value.trim().toLowerCase() : null;
}

function normalizeDomainToken(value: string | null | undefined) {
  const normalized = normalizeCookieToken(value);
  return normalized?.replace(/^\.+/, "") ?? null;
}

export function normalizePolicyCookieDisclosures(disclosures: unknown): PolicyCookieDisclosureRow[] {
  return getObjectArray(disclosures).map((row) => {
    const cookieName = getString(row.cookieName ?? row.cookie_name ?? row.name);
    const domain = getString(row.domain ?? row.cookieDomain ?? row.cookie_domain);
    const provider = getString(row.provider ?? row.vendor ?? row.serviceProvider ?? row.service_provider);
    const purpose = getString(row.purpose ?? row.description ?? row.use ?? row.usage);
    const category = getString(row.category ?? row.cookieCategory ?? row.cookie_category ?? row.purposeCategory ?? row.purpose_category);
    return {
      category,
      cookieName,
      domain,
      provider,
      purpose
    };
  });
}

function disclosureMatchesRuntimeCookie(row: RuntimeCookieEvidenceRow, disclosure: PolicyCookieDisclosureRow) {
  const runtimeName = normalizeCookieToken(row.cookieName);
  const disclosedName = normalizeCookieToken(disclosure.cookieName);
  if (runtimeName && disclosedName && (runtimeName === disclosedName || runtimeName.startsWith(disclosedName) || disclosedName.startsWith(runtimeName))) {
    return "name";
  }

  const runtimeDomain = normalizeDomainToken(row.domain ?? row.initiatorDomain);
  const disclosedDomain = normalizeDomainToken(disclosure.domain);
  if (
    runtimeDomain &&
    disclosedDomain &&
    (runtimeDomain === disclosedDomain || runtimeDomain.endsWith(`.${disclosedDomain}`) || disclosedDomain.endsWith(`.${runtimeDomain}`))
  ) {
    return "domain";
  }

  const runtimeProvider = normalizeCookieToken(row.initiatorVendor ?? inferCookieProvider(row.cookieName, row.domain));
  const disclosedProvider = normalizeCookieToken(disclosure.provider);
  if (runtimeProvider && disclosedProvider && (runtimeProvider.includes(disclosedProvider) || disclosedProvider.includes(runtimeProvider))) {
    return "provider";
  }

  return null;
}

function shouldEvaluateCookieForDisclosureGap(row: RuntimeCookieEvidenceRow) {
  return row.nonEssential || row.party === "third_party" && row.category !== "necessary";
}

export function buildCookieDisclosureGapEvidence(input: {
  cookiePolicyUrl?: string | null;
  disclosures: unknown;
  inventory: ReturnType<typeof buildRuntimeCookieInventory>;
}): CookieDisclosureGapEvidence {
  const disclosedRows = normalizePolicyCookieDisclosures(input.disclosures);
  const matchedRuntimeCookies: Array<RuntimeCookieEvidenceRow & { matchType: string }> = [];
  const unmatchedRuntimeCookies: RuntimeCookieEvidenceRow[] = [];

  for (const row of input.inventory.rows.filter(shouldEvaluateCookieForDisclosureGap)) {
    const matchType = disclosedRows.map((disclosure) => disclosureMatchesRuntimeCookie(row, disclosure)).find(Boolean) ?? null;
    if (matchType) {
      matchedRuntimeCookies.push({ ...row, matchType });
    } else {
      unmatchedRuntimeCookies.push(row);
    }
  }

  return {
    cookie_policy_url: input.cookiePolicyUrl ?? null,
    disclosed_cookie_categories: uniqueStrings(disclosedRows.map((row) => row.category)),
    disclosed_cookie_names: uniqueStrings(disclosedRows.map((row) => row.cookieName)),
    disclosed_cookie_providers: uniqueStrings(disclosedRows.map((row) => row.provider)),
    matched_runtime_cookies: matchedRuntimeCookies,
    runtime_cookie_categories: input.inventory.cookieCategories,
    runtime_cookie_names: input.inventory.cookieNames,
    unmatched_cookie_categories: uniqueStrings(unmatchedRuntimeCookies.map((row) => row.category)),
    unmatched_cookie_count: unmatchedRuntimeCookies.length,
    unmatched_cookie_names: uniqueStrings(unmatchedRuntimeCookies.map((row) => row.cookieName)),
    unmatched_cookie_vendors: uniqueStrings(
      unmatchedRuntimeCookies.map((row) => row.initiatorVendor ?? inferCookieProvider(row.cookieName, row.domain))
    ),
    unmatched_runtime_cookies: unmatchedRuntimeCookies,
    unmatched_third_party_cookie_count: unmatchedRuntimeCookies.filter((row) => row.party === "third_party").length
  };
}
