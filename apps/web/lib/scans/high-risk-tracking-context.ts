export type HighRiskTrackingVendor = {
  category:
    | "dmp"
    | "identity_data_broker"
    | "data_broker"
    | "identity_resolution"
    | "health_adtech"
    | "adtech"
    | "device_signal_adtech"
    | "device_signal"
    | "enterprise_device_risk"
    | "cmp";
  evidence: string[];
  name: string;
  role: string;
};

export type HighRiskTrackingContext = {
  cmpVendors: HighRiskTrackingVendor[];
  cmpVendorName: string | null;
  highRiskVendors: HighRiskTrackingVendor[];
  isSensitiveContext: boolean;
  sensitiveContextLabel: string | null;
};

type VendorRule = {
  category: HighRiskTrackingVendor["category"];
  domains?: string[];
  name: string;
  patterns?: RegExp[];
  role: string;
};

const HIGH_RISK_VENDOR_RULES: VendorRule[] = [
  {
    name: "Experian",
    category: "identity_data_broker",
    role: "credit bureau and consumer data broker",
    domains: ["experian.com", "experianmarketingservices.com"],
    patterns: [/\bexperian\b/i, /\bexperianauts\b/i, /\bexperian-hitwise\b/i]
  },
  {
    name: "Adobe Audience Manager",
    category: "dmp",
    role: "data management platform audience profiling",
    domains: ["demdex.net", "dpm.demdex.net"],
    patterns: [/(^|\b)aam(\b|$)/i, /\bdemdex\b/i, /\bdpm\.demdex\b/i, /\badobe audience manager\b/i]
  },
  {
    name: "ID5",
    category: "identity_resolution",
    role: "cross-site identity resolution",
    domains: ["id5-sync.com", "cdn.id5-sync.com"],
    patterns: [/\bid5(?:id|-sync)?\b/i]
  },
  {
    name: "PulsePoint / ContextWeb",
    category: "health_adtech",
    role: "health-contextual advertising network",
    domains: ["contextweb.com", "pulsepoint.com"],
    patterns: [/\bbh-medscape\b/i]
  },
  {
    name: "Amazon Publisher Services",
    category: "device_signal_adtech",
    role: "advertising device-signal collection",
    domains: ["amazon-adsystem.com", "aax.amazon-adsystem.com"],
    patterns: [/\baps:\d+:deviceSignal\b/i, /\bamazon publisher services\b/i]
  },
  {
    name: "reCAPTCHA Enterprise",
    category: "enterprise_device_risk",
    role: "bot and device-risk telemetry",
    domains: ["google.com", "www.google.com", "gstatic.com", "www.gstatic.com"],
    patterns: [/\/recaptcha\/enterprise(?:\.js|\/)/i, /\brecaptcha enterprise\b/i]
  },
  {
    name: "OneTrust",
    category: "cmp",
    role: "consent management platform",
    domains: ["cookielaw.org", "onetrust.com", "onetrust.io"],
    patterns: [/\botSDKStub\.js\b/i, /\bcookielaw\b/i]
  },
  {
    name: "TrustArc",
    category: "cmp",
    role: "privacy seal or preference management service",
    domains: ["truste.com", "trustarc.com", "privacy-policy.truste.com", "preferences.trustarc.com"],
    patterns: [/\btrustarc\b/i, /\btruste\b/i, /\bnotice_preferences\b/i, /\bnotice_gdpr_prefs\b/i]
  }
];

const HEALTH_CONTEXT_PATTERNS = [
  /\bhealth\b/i,
  /\bmedical\b/i,
  /\bclinic(?:al)?\b/i,
  /\bhospital\b/i,
  /\bpatient\b/i,
  /\bsymptom\b/i,
  /\bcondition\b/i,
  /\bdiagnos/i,
  /\bmedscape\b/i,
  /\bwebmd\b/i,
  /\bmayoclinic\b/i,
  /\beverydayhealth\b/i,
  /\bverywellhealth\b/i,
  /\bdrugs\.com\b/i
];

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getBoolean(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "boolean" ? record[key] === true : null;
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(candidate: string, domain: string) {
  const normalizedCandidate = candidate.toLowerCase().replace(/^\.+/, "");
  const normalizedDomain = domain.toLowerCase().replace(/^\.+/, "");
  return normalizedCandidate === normalizedDomain || normalizedCandidate.endsWith(`.${normalizedDomain}`);
}

function collectTextEvidence(input: {
  hostname?: string | null;
  snapshot?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
  evidenceUrls?: string[];
  thirdPartyDomains?: string[];
}) {
  const snapshot = getRecord(input.snapshot);
  const runtimeArtifacts = getRecord(input.runtimeArtifacts);
  const evidenceUrls = uniqueStrings([
    ...(input.evidenceUrls ?? []),
    ...getStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls"),
    ...getStringArray(runtimeArtifacts, "consent_post_reject_tracker_evidence_urls"),
    ...getStringArray(runtimeArtifacts, "consent_post_accept_tracker_evidence_urls")
  ]);
  const thirdPartyDomains = uniqueStrings([
    ...(input.thirdPartyDomains ?? []),
    ...getStringArray(runtimeArtifacts, "third_party_request_domains"),
    ...getStringArray(snapshot, "third_party_request_domains"),
    ...evidenceUrls.map(hostnameFromUrl)
  ]);
  const textValues = uniqueStrings([
    input.hostname ?? null,
    typeof snapshot?.registered_domain === "string" ? snapshot.registered_domain : null,
    typeof snapshot?.final_url === "string" ? snapshot.final_url : null,
    typeof snapshot?.finalUrl === "string" ? snapshot.finalUrl : null,
    ...evidenceUrls,
    ...thirdPartyDomains,
    ...getStringArray(runtimeArtifacts, "consent_baseline_tracker_script_hosts"),
    ...getStringArray(runtimeArtifacts, "initial_cookie_names"),
    ...getStringArray(runtimeArtifacts, "initialCookieNames"),
    ...getStringArray(runtimeArtifacts, "local_storage_keys"),
    ...getStringArray(runtimeArtifacts, "session_storage_keys")
  ]);

  return { evidenceUrls, textValues, thirdPartyDomains };
}

export function deriveHighRiskTrackingContext(input: {
  hostname?: string | null;
  snapshot?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
  evidenceUrls?: string[];
  thirdPartyDomains?: string[];
}): HighRiskTrackingContext {
  const snapshot = getRecord(input.snapshot);
  const { evidenceUrls, textValues, thirdPartyDomains } = collectTextEvidence(input);
  const haystack = textValues.join("\n");
  const isHealthContext =
    getBoolean(snapshot, "healthcare_site_likely") === true ||
    getBoolean(snapshot, "mentions_health_data") === true ||
    getBoolean(snapshot, "form_collects_health_information") === true ||
    getBoolean(snapshot, "high_sensitivity_data_collection_detected") === true ||
    HEALTH_CONTEXT_PATTERNS.some((pattern) => pattern.test(haystack));

  const highRiskVendors = HIGH_RISK_VENDOR_RULES.flatMap((rule): HighRiskTrackingVendor[] => {
    const evidence = uniqueStrings([
      ...thirdPartyDomains.filter((domain) => (rule.domains ?? []).some((ruleDomain) => domainMatches(domain, ruleDomain))),
      ...textValues.filter((value) => (rule.patterns ?? []).some((pattern) => pattern.test(value))).slice(0, 4)
    ]);

    if (evidence.length === 0) {
      return [];
    }

    return [{
      category: rule.category,
      evidence,
      name: rule.name,
      role: rule.role
    }];
  });

  const cmpVendors = highRiskVendors.filter((vendor) => vendor.category === "cmp");
  const cmpVendorName = cmpVendors[0]?.name ?? null;

  return {
    cmpVendors,
    cmpVendorName,
    highRiskVendors: highRiskVendors.filter((vendor) => vendor.category !== "cmp"),
    isSensitiveContext: isHealthContext,
    sensitiveContextLabel: isHealthContext ? "health information site" : null
  };
}

export function formatHighRiskVendorSummary(vendors: HighRiskTrackingVendor[], limit = 3) {
  return vendors.slice(0, limit).map((vendor) => `${vendor.name} (${vendor.role})`);
}
