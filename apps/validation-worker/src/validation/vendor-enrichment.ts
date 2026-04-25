import { query, queryOne } from "@website-signal-risk-scanner/db";
import { getWorkerEnv } from "../env";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ENRICHMENT_SOURCE = "llm_vendor_enrichment";
const RUNTIME_VENDOR_SOURCE = "hybrid_runtime_signature";

type OpenAiVendorPayload = {
  messages: Array<{
    content: string;
    role: "system" | "user";
  }>;
  model?: string;
  response_format?: {
    type: "json_object";
  };
  temperature?: number;
};

type VendorCandidate = {
  beforeConsent: boolean;
  collectionEndpointType: string;
  cookieNames: string[];
  firstPartyOrThirdParty: string;
  hostname: string;
  sampleUrls: string[];
};

type ResolvedRuntimeVendor = {
  beforeConsent: boolean;
  collectionEndpointType: string;
  confidence: number;
  detectionSource: string;
  firstPartyOrThirdParty: string;
  hostname: string;
  sampleUrls: string[];
  vendorCategory: string;
  vendorName: string;
};

type VendorRegistryEntry = {
  canonicalName: string;
  confidence: number;
  cookieNames: string[];
  id: string;
  vendorCategory: string;
};

type VendorDomainPattern = {
  domain: string;
  vendorRegistryId: string;
};

type InferredVendor = {
  aliases: string[];
  canonicalName: string;
  confidence: number;
  cookieNames: string[];
  domains: string[];
  rationale: string;
  vendorCategory: string;
};

type VendorEnrichmentResult = {
  candidateCount: number;
  llmAttempted: boolean;
  llmResolvedCount: number;
  llmSkippedReason: string | null;
  persistedPreconsentViolationCount: number;
  persistedTrackerCount: number;
  registryResolvedCount: number;
  staticResolvedCount: number;
  unresolvedHosts: string[];
};

type QueryError = {
  code?: string | null;
  message?: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

type StaticVendorRule = {
  cookieNames?: string[];
  domains: string[];
  vendorCategory: VendorRegistryEntry["vendorCategory"];
  vendorName: string;
};

const STATIC_VENDOR_RULES: StaticVendorRule[] = [
  { vendorName: "Google Ads", vendorCategory: "advertising", domains: ["googleadservices.com", "g.doubleclick.net"] },
  { vendorName: "DoubleClick / Floodlight", vendorCategory: "advertising", domains: ["doubleclick.net", "fls.doubleclick.net"] },
  { vendorName: "Google Ad Manager", vendorCategory: "advertising", domains: ["securepubads.g.doubleclick.net"] },
  { vendorName: "Adobe Audience Manager", vendorCategory: "advertising", domains: ["demdex.net", "dpm.demdex.net", "fandangollc.demdex.net"] },
  { vendorName: "Adobe Analytics", vendorCategory: "analytics", domains: ["omtrdc.net", "tt.omtrdc.net"] },
  { vendorName: "Criteo", vendorCategory: "advertising", domains: ["criteo.com", "criteo.net", "static.criteo.net", "grid-bidder.criteo.com"], cookieNames: ["cto_bundle"] },
  { vendorName: "ID5", vendorCategory: "identity", domains: ["id5-sync.com", "cdn.id5-sync.com"], cookieNames: ["id5id", "id5id_v2"] },
  { vendorName: "OpenX", vendorCategory: "advertising", domains: ["openx.net", "openxcdn.net", "oa.openxcdn.net"] },
  { vendorName: "Rubicon Project", vendorCategory: "advertising", domains: ["rubiconproject.com", "micro.rubiconproject.com"] },
  { vendorName: "The Trade Desk", vendorCategory: "advertising", domains: ["adsrvr.org", "insight.adsrvr.org"], cookieNames: ["TDID", "TDCPM"] },
  { vendorName: "LiveIntent", vendorCategory: "advertising", domains: ["liadm.com"] },
  { vendorName: "Lotame", vendorCategory: "identity", domains: ["crwdcntrl.net", "tags.crwdcntrl.net"], cookieNames: ["_cc_id"] },
  { vendorName: "LiveRamp", vendorCategory: "identity", domains: ["rlcdn.com", "idsync.rlcdn.com"] },
  { vendorName: "Nielsen / Exelate", vendorCategory: "advertising", domains: ["exelator.com", "loadm.exelator.com"] },
  { vendorName: "Quantcast", vendorCategory: "advertising", domains: ["quantserve.com", "cms.quantserve.com"] },
  { vendorName: "FreeWheel", vendorCategory: "advertising", domains: ["fwmrm.net", "dmp.v.fwmrm.net"] },
  { vendorName: "DoubleVerify", vendorCategory: "advertising", domains: ["doubleverify.com", "pub.doubleverify.com", "dv.tech", "vtrk.dv.tech"] },
  { vendorName: "ScorecardResearch", vendorCategory: "analytics", domains: ["scorecardresearch.com", "sb.scorecardresearch.com"] },
  { vendorName: "PubMatic", vendorCategory: "advertising", domains: ["pubmatic.com", "hbopenbid.pubmatic.com"] },
  { vendorName: "Index Exchange", vendorCategory: "advertising", domains: ["casalemedia.com", "casale.com"] },
  { vendorName: "GumGum", vendorCategory: "advertising", domains: ["gumgum.com"] },
  { vendorName: "TripleLift", vendorCategory: "advertising", domains: ["3lift.com"] },
  { vendorName: "Bidswitch", vendorCategory: "advertising", domains: ["bidswitch.net"] },
  { vendorName: "Meta Pixel", vendorCategory: "advertising", domains: ["facebook.com", "facebook.net", "connect.facebook.net"] },
  { vendorName: "Snap Pixel", vendorCategory: "advertising", domains: ["sc-static.net", "snapchat.com", "tr.snapchat.com", "tr6.snapchat.com"] },
  { vendorName: "Tapad", vendorCategory: "advertising", domains: ["tapad.com", "pixel.tapad.com"] },
  { vendorName: "TikTok", vendorCategory: "advertising", domains: ["analytics.tiktok.com", "ads.tiktok.com", "tiktok.com", "tiktokw.us"], cookieNames: ["_ttp"] },
  { vendorName: "OneTrust", vendorCategory: "functional", domains: ["onetrust.com", "onetrust.io"] },
  { vendorName: "Netflix Assets", vendorCategory: "functional", domains: ["nflxext.com", "nflximg.net", "nflxso.net"] },
  { vendorName: "Netflix Logging", vendorCategory: "functional", domains: ["logs.netflix.com", "ichnaea-web.netflix.com"] },
  { vendorName: "Netflix Web Platform", vendorCategory: "functional", domains: ["www.netflix.com", "web.prod.cloud.netflix.com"] }
];

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function normalizeUrlEvidence(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().replace(/^\.+/, "").toLowerCase();
}

function getHostnameFromUrl(value: string | null | undefined) {
  const normalized = normalizeUrlEvidence(value);
  if (!normalized) {
    return null;
  }

  try {
    return normalizeHostname(new URL(normalized).hostname);
  } catch {
    return null;
  }
}

function getRequestUrlsFromRow(row: Record<string, unknown>) {
  const directUrls = uniqueStrings([
    normalizeUrlEvidence(getString(row.url)),
    normalizeUrlEvidence(getString(row.requestUrl)),
    normalizeUrlEvidence(getString(row.request_url)),
    ...getStringArray(row.sampleUrls ?? row.sample_urls).map((value) => normalizeUrlEvidence(value))
  ]);
  if (directUrls.length > 0) {
    return directUrls;
  }

  const domain = normalizeHostname(getString(row.hostname) ?? getString(row.domain));
  const pathSample = getString(row.pathSample) ?? getString(row.path_sample);
  if (!domain || !pathSample) {
    return [];
  }

  const normalizedPath = pathSample.startsWith("/") ? pathSample : `/${pathSample}`;
  return uniqueStrings([normalizeUrlEvidence(`https://${domain}${normalizedPath}`)]);
}

function isPreconsentRequestRow(row: Record<string, unknown>, hybrid: Record<string, unknown> | null) {
  if (row.preConsent === true || row.pre_consent === true || row.beforeConsent === true || row.before_consent === true) {
    return true;
  }
  const phase = getString(row.phase);
  if (phase === "before_interaction" || phase === "before_consent" || phase === "baseline") {
    return true;
  }

  const tsMs = typeof row.ts_ms === "number" ? row.ts_ms : typeof row.tsMs === "number" ? row.tsMs : null;
  const timelineMarkers = getRecord(hybrid?.timelineMarkers ?? hybrid?.timeline_markers);
  const consentBannerDetectedMs =
    typeof timelineMarkers?.consentBannerDetectedMs === "number"
      ? timelineMarkers.consentBannerDetectedMs
      : typeof timelineMarkers?.consent_banner_detected_ms === "number"
        ? timelineMarkers.consent_banner_detected_ms
        : null;
  return tsMs !== null && consentBannerDetectedMs !== null && tsMs < consentBannerDetectedMs;
}

function requestRowMatchesHost(row: Record<string, unknown>, hostname: string) {
  const rowHosts = uniqueStrings([
    normalizeHostname(getString(row.hostname)),
    normalizeHostname(getString(row.domain)),
    ...getRequestUrlsFromRow(row).map((url) => getHostnameFromUrl(url))
  ]);
  return rowHosts.some((rowHost) => rowHost === hostname);
}

function getRequestUrlsForHost(hybrid: Record<string, unknown> | null, hostname: string) {
  const requestObservations = getObjectArray(hybrid?.requestObservations ?? hybrid?.request_observations);
  return uniqueStrings(
    requestObservations
      .filter((row) => requestRowMatchesHost(row, hostname))
      .flatMap((row) => getRequestUrlsFromRow(row))
  ).slice(0, 5);
}

function getPreconsentRequestUrlsForHost(hybrid: Record<string, unknown> | null, hostname: string) {
  const requestObservations = getObjectArray(hybrid?.requestObservations ?? hybrid?.request_observations);
  return uniqueStrings(
    requestObservations
      .filter((row) => requestRowMatchesHost(row, hostname))
      .filter((row) => isPreconsentRequestRow(row, hybrid))
      .flatMap((row) => getRequestUrlsFromRow(row))
  ).slice(0, 5);
}

function normalizeVendorCategory(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["advertising", "analytics", "functional", "social", "identity", "session_replay", "personalization", "unknown"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "ads") {
    return "advertising";
  }
  if (normalized === "cdn_infra" || normalized === "fraud_security") {
    return "functional";
  }
  return "unknown";
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

async function callOpenAiVendorJson(input: { apiKey: string; payload: OpenAiVendorPayload }) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input.payload)
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI vendor enrichment call failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
}

function errorLooksLikeQuotaFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("429") || message.includes("insufficient_quota") || message.includes("quota");
}

function getHybridRuntimeEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRecord(runtimeArtifacts?.hybrid_runtime_evidence ?? runtimeArtifacts?.hybridRuntimeEvidence);
}

function isMissingTableError(error: QueryError | null | undefined, tableName: string) {
  const message = `${error?.message ?? ""}`.toLowerCase();
  return `${error?.code ?? ""}` === "PGRST205" || message.includes(tableName.toLowerCase());
}

export function collectVendorEnrichmentCandidates(input: {
  requestedHostname: string;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
}) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const domainVendorRegistry = getObjectArray(input.runtimeArtifacts?.domainVendorRegistry ?? input.runtimeArtifacts?.domain_vendor_registry);
  const cookieWriteObservations = getObjectArray(hybrid?.cookieWriteObservations);
  const cnameCandidates = getObjectArray(hybrid?.cnameCandidates);
  const rows = new Map<string, VendorCandidate>();
  const requestedHostname = normalizeHostname(input.requestedHostname);

  const getOrCreate = (hostname: string, defaults?: Partial<VendorCandidate>) => {
    const normalizedHost = normalizeHostname(hostname);
    if (!normalizedHost) {
      return null;
    }

    const existing = rows.get(normalizedHost);
    if (existing) {
      if (defaults?.beforeConsent) {
        existing.beforeConsent = true;
      }
      if (defaults?.collectionEndpointType) {
        existing.collectionEndpointType = defaults.collectionEndpointType;
      }
      if (defaults?.firstPartyOrThirdParty) {
        existing.firstPartyOrThirdParty = defaults.firstPartyOrThirdParty;
      }
      existing.cookieNames = uniqueStrings([...existing.cookieNames, ...(defaults?.cookieNames ?? [])]);
      existing.sampleUrls = uniqueStrings([...existing.sampleUrls, ...(defaults?.sampleUrls ?? [])]).slice(0, 5);
      return existing;
    }

    const next: VendorCandidate = {
      beforeConsent: defaults?.beforeConsent === true,
      collectionEndpointType: defaults?.collectionEndpointType ?? "unknown",
      cookieNames: uniqueStrings(defaults?.cookieNames ?? []),
      firstPartyOrThirdParty: defaults?.firstPartyOrThirdParty ?? "unknown",
      hostname: normalizedHost,
      sampleUrls: uniqueStrings(defaults?.sampleUrls ?? []).slice(0, 5)
    };
    rows.set(normalizedHost, next);
    return next;
  };

  for (const row of requestToVendorObservations) {
    const vendor = getString(row.vendor);
    if (vendor && vendor !== "unresolved") {
      continue;
    }
    const hostname = normalizeHostname(getString(row.hostname));
    if (!hostname) {
      continue;
    }
    const beforeConsent = row.preConsent === true || row.pre_consent === true;
    getOrCreate(hostname, {
      beforeConsent,
      collectionEndpointType: "request",
      firstPartyOrThirdParty: isFirstPartyProxyHost(hostname, requestedHostname) ? "first_party_proxy" : "third_party",
      sampleUrls: uniqueStrings([
        ...(beforeConsent ? [...getRequestUrlsFromRow(row), ...getRequestUrlsForHost(hybrid, hostname)] : []),
        ...getPreconsentRequestUrlsForHost(hybrid, hostname)
      ])
    });
  }

  for (const row of domainVendorRegistry) {
    const vendor = getString(row.vendorName) ?? getString(row.vendor_name);
    if (vendor) {
      continue;
    }
    const hostname = normalizeHostname(getString(row.endpointHostname) ?? getString(row.endpoint_hostname));
    if (!hostname) {
      continue;
    }
    const beforeConsent =
      typeof row.beforeConsentUiRequestCount === "number"
        ? row.beforeConsentUiRequestCount > 0
        : typeof row.before_consent_ui_request_count === "number"
          ? Number(row.before_consent_ui_request_count) > 0
          : false;
    getOrCreate(hostname, {
      beforeConsent,
      collectionEndpointType: "request",
      firstPartyOrThirdParty: isFirstPartyProxyHost(hostname, requestedHostname) ? "first_party_proxy" : "third_party",
      sampleUrls: uniqueStrings([
        ...(beforeConsent ? [...getStringArray(row.sampleUrls ?? row.sample_urls), ...getRequestUrlsForHost(hybrid, hostname)] : []),
        ...getPreconsentRequestUrlsForHost(hybrid, hostname)
      ])
    });
  }

  const rawThirdPartyDomains = uniqueStrings([
    ...getStringArray(getRecord(hybrid?.vendorSummary)?.rawThirdPartyDomains),
    ...getStringArray(getRecord(hybrid?.vendor_summary)?.raw_third_party_domains),
    ...getStringArray(input.runtimeArtifacts?.third_party_request_domains),
    ...getStringArray(input.runtimeArtifacts?.thirdPartyRequestDomains),
    ...getStringArray(input.runtimeArtifacts?.script_src_domains),
    ...getStringArray(input.runtimeArtifacts?.scriptSrcDomains)
  ]);
  const hasPreconsentRuntime =
    input.snapshot?.preconsent_tracking_detected === true ||
    input.snapshot?.tracking_before_consent_detected === true ||
    getRecord(hybrid?.networkSummary)?.preConsentThirdPartyRequestCount !== undefined ||
    getRecord(hybrid?.network_summary)?.pre_consent_third_party_request_count !== undefined;

  for (const hostname of rawThirdPartyDomains) {
    const normalizedHost = normalizeHostname(hostname);
    if (!normalizedHost) {
      continue;
    }
    const staticVendorMatch = matchCandidateToStaticRules({
      beforeConsent: false,
      collectionEndpointType: "request",
      cookieNames: [],
      firstPartyOrThirdParty: "third_party",
      hostname: normalizedHost,
      sampleUrls: []
    });
    if (!staticVendorMatch) {
      continue;
    }
    getOrCreate(normalizedHost, {
      beforeConsent: hasPreconsentRuntime,
      collectionEndpointType: "request",
      firstPartyOrThirdParty: "third_party",
      sampleUrls: hasPreconsentRuntime ? getPreconsentRequestUrlsForHost(hybrid, normalizedHost) : []
    });
  }

  const promoteCookiesAsBeforeConsent =
    input.snapshot?.third_party_cookie_set_before_consent === true || input.snapshot?.first_party_cookie_set_before_consent === true;

  for (const row of cookieWriteObservations) {
    const hostname = normalizeHostname(
      getString(row.domain) ?? getString(row.cookieDomain) ?? getString(row.cookie_domain) ?? getString(row.cookieInitiatorDomain)
    );
    const cookieName = getString(row.cookieName) ?? getString(row.cookie_name);
    const isThirdParty =
      row.thirdParty === true ||
      getString(row.cookiePartyType) === "third_party" ||
      getString(row.cookie_party_type) === "third_party";
    if (!hostname || !cookieName || !isThirdParty) {
      continue;
    }
    getOrCreate(hostname, {
      beforeConsent: row.beforeConsent === true || row.before_consent === true || promoteCookiesAsBeforeConsent,
      collectionEndpointType: "cookie",
      cookieNames: [cookieName],
      firstPartyOrThirdParty: "third_party"
    });
  }

  for (const row of cnameCandidates) {
    const hostname = normalizeHostname(getString(row.subdomain));
    if (!hostname) {
      continue;
    }
    const beforeConsent = input.snapshot?.tracking_before_consent_detected === true;
    getOrCreate(hostname, {
      beforeConsent,
      collectionEndpointType: "cname",
      firstPartyOrThirdParty: "first_party",
      sampleUrls: uniqueStrings([
        ...(beforeConsent ? [...getStringArray(row.sampleUrls ?? row.sample_urls), ...getRequestUrlsForHost(hybrid, hostname)] : []),
        ...getPreconsentRequestUrlsForHost(hybrid, hostname)
      ])
    });
  }

  return [...rows.values()].filter((row) => row.hostname !== requestedHostname);
}

export function collectResolvedRuntimeVendors(input: {
  requestedHostname: string;
  runtimeArtifacts: Record<string, unknown> | null;
}) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const rows = new Map<string, ResolvedRuntimeVendor>();

  for (const row of requestToVendorObservations) {
    const vendorName = getString(row.vendor);
    if (!vendorName || vendorName === "unresolved") {
      continue;
    }
    const hostname = normalizeHostname(getString(row.hostname));
    const requestedHostname = normalizeHostname(input.requestedHostname);
    if (!hostname || hostname === requestedHostname) {
      continue;
    }

    const vendorCategory = normalizeVendorCategory(getString(row.category));
    const evidenceSource = RUNTIME_VENDOR_SOURCE;
    const confidenceLabel = getString(row.confidence);
    const confidence = confidenceLabel === "high" ? 0.95 : confidenceLabel === "medium" ? 0.7 : 0.45;
    const key = `${vendorName}|${hostname}|${evidenceSource}`;
    const existing = rows.get(key);
    const beforeConsent = row.preConsent === true || row.pre_consent === true;
    if (existing) {
      existing.beforeConsent = existing.beforeConsent || beforeConsent;
      existing.sampleUrls = uniqueStrings([
        ...existing.sampleUrls,
        ...(beforeConsent ? [...getRequestUrlsFromRow(row), ...getRequestUrlsForHost(hybrid, hostname)] : []),
        ...getPreconsentRequestUrlsForHost(hybrid, hostname)
      ]).slice(0, 5);
      continue;
    }

    rows.set(key, {
      beforeConsent,
      collectionEndpointType: "request",
      confidence,
      detectionSource: evidenceSource,
      firstPartyOrThirdParty: "third_party",
      hostname,
      sampleUrls: uniqueStrings([
        ...(beforeConsent ? [...getRequestUrlsFromRow(row), ...getRequestUrlsForHost(hybrid, hostname)] : []),
        ...getPreconsentRequestUrlsForHost(hybrid, hostname)
      ]).slice(0, 5),
      vendorCategory,
      vendorName
    });
  }

  return [...rows.values()];
}

function matchCandidateToRegistry(input: {
  candidate: VendorCandidate;
  registryEntriesById: Map<string, VendorRegistryEntry>;
  registryPatterns: VendorDomainPattern[];
}) {
  const pattern = input.registryPatterns.find(
    (row) => input.candidate.hostname === row.domain || input.candidate.hostname.endsWith(`.${row.domain}`)
  );
  if (pattern) {
    return input.registryEntriesById.get(pattern.vendorRegistryId) ?? null;
  }

  for (const entry of input.registryEntriesById.values()) {
    if (entry.cookieNames.some((cookieName) => input.candidate.cookieNames.includes(cookieName))) {
      return entry;
    }
  }

  return null;
}

function matchCandidateToStaticRules(candidate: VendorCandidate): VendorRegistryEntry | null {
  const rule = STATIC_VENDOR_RULES.find((entry) => {
    const hostMatched = entry.domains.some((domain) => candidate.hostname === domain || candidate.hostname.endsWith(`.${domain}`));
    if (hostMatched) {
      return true;
    }
    return (entry.cookieNames ?? []).some((cookieName) => candidate.cookieNames.includes(cookieName));
  });

  if (!rule) {
    return null;
  }

  return {
    canonicalName: rule.vendorName,
    confidence: 0.9,
    cookieNames: [...(rule.cookieNames ?? [])],
    id: `static:${rule.vendorName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    vendorCategory: rule.vendorCategory
  };
}

function isFirstPartyProxyHost(hostname: string, requestedHostname: string | null) {
  if (!requestedHostname) {
    return false;
  }

  return hostname === requestedHostname || hostname.endsWith(`.${requestedHostname}`);
}

async function inferVendorsWithLlm(input: { candidates: VendorCandidate[]; domain: string }) {
  const env = getWorkerEnv();

  if (!env.LLM_ENRICHMENT_ENABLED || !env.OPENAI_API_KEY || input.candidates.length === 0) {
    return [];
  }

  const payloadBody: OpenAiVendorPayload = {
    model: env.VALIDATION_OPENAI_MODEL,
    temperature: 0,
    response_format: {
      type: "json_object"
    },
    messages: [
      {
        role: "system",
        content:
          "You classify unresolved website vendors from hostnames, sample URLs, and cookie names. Return JSON with key vendors. Each item must include canonicalName, vendorCategory, domains, cookieNames, aliases, confidence, and rationale. Prefer precise product or company names. If the evidence looks first-party owned, name the site owner service cluster instead of inventing a third-party vendor. Allowed vendorCategory values: advertising, analytics, functional, social, identity, session_replay, personalization, unknown."
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            domain: input.domain,
            unresolvedCandidates: input.candidates
          },
          null,
          2
        )
      }
    ]
  };

  let payload;
  try {
    payload = await callOpenAiVendorJson({
      apiKey: env.OPENAI_API_KEY,
      payload: payloadBody
    });
  } catch (error) {
    const fallbackModel = env.VALIDATION_NANO_MODEL?.trim();
    const primaryModel = env.VALIDATION_OPENAI_MODEL?.trim();
    const canRetryWithFallback =
      Boolean(fallbackModel) &&
      Boolean(primaryModel) &&
      fallbackModel !== primaryModel &&
      errorLooksLikeQuotaFailure(error);

    if (!canRetryWithFallback) {
      throw error;
    }

    payload = await callOpenAiVendorJson({
      apiKey: env.OPENAI_API_KEY,
      payload: {
        ...payloadBody,
        model: fallbackModel
      }
    });
  }

  const rawContent = payload.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJson(rawContent)) as {
    vendors?: Array<{
      aliases?: string[];
      canonicalName?: string;
      confidence?: number;
      cookieNames?: string[];
      domains?: string[];
      rationale?: string;
      vendorCategory?: string;
    }>;
  };

  return (parsed.vendors ?? [])
    .map((row) => ({
      aliases: uniqueStrings(row.aliases ?? []),
      canonicalName: getString(row.canonicalName) ?? "",
      confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? Math.max(0, Math.min(1, row.confidence)) : 0.5,
      cookieNames: uniqueStrings(row.cookieNames ?? []),
      domains: uniqueStrings((row.domains ?? []).map((domain) => normalizeHostname(domain))),
      rationale: getString(row.rationale) ?? "",
      vendorCategory: normalizeVendorCategory(row.vendorCategory)
    }))
    .filter((row) => row.canonicalName.length > 0 && row.domains.length > 0);
}

async function persistRegistryEntries(input: {
  inferredVendors: InferredVendor[];
}) {
  for (const vendor of input.inferredVendors) {
    const registryRow = await queryOne<{ id: string }>(
      `
        insert into vendor_registry (
          aliases,
          canonical_name,
          confidence,
          cookie_names,
          description,
          evidence_json,
          source,
          updated_at,
          vendor_category
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (canonical_name) do update
          set aliases = excluded.aliases,
              confidence = excluded.confidence,
              cookie_names = excluded.cookie_names,
              description = excluded.description,
              evidence_json = excluded.evidence_json,
              source = excluded.source,
              updated_at = excluded.updated_at,
              vendor_category = excluded.vendor_category
        returning id
      `,
      [
        vendor.aliases,
        vendor.canonicalName,
        vendor.confidence,
        vendor.cookieNames,
        vendor.rationale,
        { rationale: vendor.rationale },
        ENRICHMENT_SOURCE,
        new Date().toISOString(),
        vendor.vendorCategory
      ]
    );

    if (!registryRow) {
      throw new Error(`Failed to upsert vendor registry entry ${vendor.canonicalName}: unknown error`);
    }

    await query(
      `
        insert into vendor_domain_patterns (
          confidence,
          domain,
          match_type,
          source,
          vendor_registry_id
        )
        select
          (value->>'confidence')::float8,
          value->>'domain',
          value->>'match_type',
          value->>'source',
          (value->>'vendor_registry_id')::uuid
        from jsonb_array_elements($1::jsonb) as value
        on conflict (domain) do update
          set confidence = excluded.confidence,
              match_type = excluded.match_type,
              source = excluded.source,
              vendor_registry_id = excluded.vendor_registry_id
      `,
      [
        JSON.stringify(
          vendor.domains.map((domain) => ({
            confidence: vendor.confidence,
            domain,
            match_type: "suffix",
            source: ENRICHMENT_SOURCE,
            vendor_registry_id: registryRow.id
          }))
        )
      ]
    ).catch((error) => {
      throw new Error(`Failed to upsert vendor domain patterns for ${vendor.canonicalName}: ${getErrorMessage(error)}`);
    });
    if (!registryRow) {
      throw new Error(`Failed to upsert vendor domain patterns for ${vendor.canonicalName}`);
    }
  }
}

export async function enrichUnknownScanVendors(input: { hostname: string; scanId: string }): Promise<VendorEnrichmentResult> {
  const optionalMany = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
    query<T>(text, values, { readOnly: true })
      .then((result) => ({ data: result.rows, error: null as QueryError | null }))
      .catch((error) => ({ data: [] as T[], error: { message: getErrorMessage(error) } as QueryError }));

  let scan: Record<string, unknown> | null;
  let runtimeArtifacts: Record<string, unknown> | null;
  let snapshot: Record<string, unknown> | null;
  let registryResult: { data: Array<Record<string, unknown>>; error: QueryError | null };
  let patternResult: { data: Array<Record<string, unknown>>; error: QueryError | null };
  try {
    [scan, runtimeArtifacts, snapshot, registryResult, patternResult] = await Promise.all([
      queryOne<Record<string, unknown>>(`select id, organization_id, domain_id from scans where id = $1`, [input.scanId], { readOnly: true }),
      queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [input.scanId], { readOnly: true }),
      queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [input.scanId], { readOnly: true }),
      optionalMany<Record<string, unknown>>(`select id, canonical_name, vendor_category, cookie_names, confidence from vendor_registry`),
      optionalMany<Record<string, unknown>>(`select vendor_registry_id, domain from vendor_domain_patterns`)
    ]);
  } catch (error) {
    throw new Error(`Failed to load vendor enrichment inputs for ${input.scanId}: ${getErrorMessage(error)}`);
  }

  const registryError = registryResult.error;
  const patternError = patternResult.error;
  const registryRows = registryResult.data;
  const patternRows = patternResult.data;
  if (registryError && !isMissingTableError(registryError, "vendor_registry")) {
    throw new Error(`Failed to load vendor registry: ${registryError.message}`);
  }
  if (patternError && !isMissingTableError(patternError, "vendor_domain_patterns")) {
    throw new Error(`Failed to load vendor domain patterns: ${patternError.message}`);
  }
  if (!scan || !runtimeArtifacts) {
    return {
      candidateCount: 0,
      llmAttempted: false,
      llmResolvedCount: 0,
      llmSkippedReason: "missing_scan_or_runtime_artifacts",
      persistedPreconsentViolationCount: 0,
      persistedTrackerCount: 0,
      registryResolvedCount: 0,
      staticResolvedCount: 0,
      unresolvedHosts: []
    };
  }

  const candidates = collectVendorEnrichmentCandidates({
    requestedHostname: input.hostname,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null
  });
  const resolvedRuntimeVendors = collectResolvedRuntimeVendors({
    requestedHostname: input.hostname,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null
  });
  if (candidates.length === 0) {
    if (resolvedRuntimeVendors.length === 0) {
      return {
        candidateCount: 0,
        llmAttempted: false,
        llmResolvedCount: 0,
        llmSkippedReason: "no_unresolved_candidates",
        persistedPreconsentViolationCount: 0,
        persistedTrackerCount: 0,
        registryResolvedCount: 0,
        staticResolvedCount: 0,
        unresolvedHosts: []
      };
    }
  }

  const registryEntriesById = new Map<string, VendorRegistryEntry>(
    ((registryError ? [] : registryRows ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.id),
      {
        canonicalName: String(row.canonical_name ?? ""),
        confidence: typeof row.confidence === "number" ? row.confidence : 0.5,
        cookieNames: getStringArray(row.cookie_names),
        id: String(row.id),
        vendorCategory: normalizeVendorCategory(getString(row.vendor_category))
      }
    ])
  );
  const registryPatterns = ((patternError ? [] : patternRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    domain: normalizeHostname(getString(row.domain)) ?? "",
    vendorRegistryId: String(row.vendor_registry_id ?? "")
  }));

  const matchedCandidates = new Map<string, VendorRegistryEntry>();
  const unresolvedCandidates: VendorCandidate[] = [];
  const env = getWorkerEnv();
  const llmResolvedHosts = new Set<string>();
  let llmAttempted = false;
  let llmResolvedCount = 0;
  let llmSkippedReason: string | null = null;
  let staticResolvedCount = 0;

  for (const candidate of candidates) {
    const matched = matchCandidateToRegistry({
      candidate,
      registryEntriesById,
      registryPatterns
    });
    if (matched) {
      matchedCandidates.set(candidate.hostname, matched);
      continue;
    }

    const staticMatch = matchCandidateToStaticRules(candidate);
    if (staticMatch) {
      matchedCandidates.set(candidate.hostname, staticMatch);
      staticResolvedCount += 1;
    } else {
      unresolvedCandidates.push(candidate);
    }
  }

  if (unresolvedCandidates.length > 0) {
    let inferredVendors: InferredVendor[] = [];

    if (!env.LLM_ENRICHMENT_ENABLED) {
      llmSkippedReason = "llm_enrichment_disabled";
    } else if (!env.OPENAI_API_KEY) {
      llmSkippedReason = "missing_openai_api_key";
    } else {
      llmAttempted = true;
      try {
        inferredVendors = await inferVendorsWithLlm({
          candidates: unresolvedCandidates,
          domain: input.hostname
        });
      } catch (error) {
        llmSkippedReason = error instanceof Error ? error.message : "llm_enrichment_failed";
        if (errorLooksLikeQuotaFailure(error)) {
          console.info("Vendor enrichment LLM quota exhausted; continuing with registry-only matches.", {
            error: llmSkippedReason,
            hostname: input.hostname,
            scanId: input.scanId
          });
        } else {
          console.warn("Vendor enrichment LLM inference failed; continuing with registry-only matches.", {
            error: llmSkippedReason,
            hostname: input.hostname,
            scanId: input.scanId
          });
        }
      }
    }

    if (!registryError && !patternError) {
      await persistRegistryEntries({
        inferredVendors
      });
    }

    for (const inferredVendor of inferredVendors) {
      const entry: VendorRegistryEntry = {
        canonicalName: inferredVendor.canonicalName,
        confidence: inferredVendor.confidence,
        cookieNames: inferredVendor.cookieNames,
        id: inferredVendor.canonicalName,
        vendorCategory: inferredVendor.vendorCategory
      };
      for (const domain of inferredVendor.domains) {
        for (const candidate of unresolvedCandidates) {
          if (candidate.hostname === domain || candidate.hostname.endsWith(`.${domain}`)) {
            matchedCandidates.set(candidate.hostname, entry);
            llmResolvedHosts.add(candidate.hostname);
          }
        }
      }
    }
  }

  llmResolvedCount = llmResolvedHosts.size;

  if (matchedCandidates.size === 0 && resolvedRuntimeVendors.length === 0) {
    return {
      candidateCount: candidates.length,
      llmAttempted,
      llmResolvedCount,
      llmSkippedReason,
      persistedPreconsentViolationCount: 0,
      persistedTrackerCount: 0,
      registryResolvedCount: matchedCandidates.size - llmResolvedCount - staticResolvedCount,
      staticResolvedCount,
      unresolvedHosts: unresolvedCandidates.map((candidate) => candidate.hostname).filter((hostname) => !matchedCandidates.has(hostname))
    };
  }

  await Promise.all([
    query(`delete from scan_tracker_vendors where scan_id = $1 and detection_source = $2`, [input.scanId, ENRICHMENT_SOURCE]),
    query(`delete from scan_preconsent_violations where scan_id = $1 and detection_source = $2`, [input.scanId, ENRICHMENT_SOURCE]),
    query(`delete from scan_tracker_vendors where scan_id = $1 and detection_source = any($2::text[])`, [input.scanId, [RUNTIME_VENDOR_SOURCE, "signature"]]),
    query(`delete from scan_preconsent_violations where scan_id = $1 and detection_source = any($2::text[])`, [input.scanId, [RUNTIME_VENDOR_SOURCE, "signature"]])
  ]);

  const trackerRows = [
    ...resolvedRuntimeVendors.map((vendor) => ({
      before_consent: vendor.beforeConsent,
      collection_endpoint_type: vendor.collectionEndpointType,
      confidence: vendor.confidence,
      detection_source: vendor.detectionSource,
      domain_id: scan.domain_id,
      first_party_or_third_party: vendor.firstPartyOrThirdParty,
      matched_signature_id: null,
      organization_id: scan.organization_id,
      scan_id: input.scanId,
      script_host: vendor.hostname,
      vendor_category: vendor.vendorCategory,
      vendor_name: vendor.vendorName
    })),
    ...candidates.flatMap((candidate) => {
    const matched = matchedCandidates.get(candidate.hostname);
    if (!matched) {
      return [];
    }
    return [
      {
        before_consent: candidate.beforeConsent,
        collection_endpoint_type: candidate.collectionEndpointType,
        confidence: matched.confidence,
        detection_source: ENRICHMENT_SOURCE,
        domain_id: scan.domain_id,
        first_party_or_third_party: candidate.firstPartyOrThirdParty,
        matched_signature_id: `vendor_registry:${matched.id}`,
        organization_id: scan.organization_id,
        scan_id: input.scanId,
        script_host: candidate.hostname,
        vendor_category: matched.vendorCategory,
        vendor_name: matched.canonicalName
      }
    ];
  })
  ];

  if (trackerRows.length > 0) {
    await query(
      `
        insert into scan_tracker_vendors (
          scan_id,
          organization_id,
          domain_id,
          vendor_name,
          vendor_category,
          detection_source,
          confidence,
          first_party_or_third_party,
          before_consent,
          script_host,
          matched_signature_id,
          collection_endpoint_type
        )
        select
          scan_id,
          organization_id,
          domain_id,
          vendor_name,
          vendor_category,
          detection_source,
          confidence,
          first_party_or_third_party,
          before_consent,
          script_host,
          matched_signature_id,
          collection_endpoint_type
        from jsonb_populate_recordset(null::scan_tracker_vendors, $1::jsonb)
      `,
      [JSON.stringify(trackerRows)]
    ).catch((error) => {
      throw new Error(`Failed to persist enriched tracker vendors for ${input.scanId}: ${getErrorMessage(error)}`);
    });
  }

  const preconsentRows = new Map<string, Record<string, unknown>>();
  for (const vendor of resolvedRuntimeVendors) {
    if (!vendor.beforeConsent) {
      continue;
    }
    const existing = preconsentRows.get(vendor.vendorName);
    if (existing) {
      existing.evidence_urls = uniqueStrings([...(getStringArray(existing.evidence_urls) ?? []), ...vendor.sampleUrls]);
      continue;
    }
    preconsentRows.set(vendor.vendorName, {
      collection_endpoint_type: vendor.collectionEndpointType,
      confidence: vendor.confidence,
      detection_source: vendor.detectionSource,
      domain_id: scan.domain_id,
      evidence_urls: vendor.sampleUrls,
      first_party_or_third_party: vendor.firstPartyOrThirdParty,
      matched_signature_id: null,
      organization_id: scan.organization_id,
      scan_id: input.scanId,
      script_host: vendor.hostname,
      vendor_category: vendor.vendorCategory,
      vendor_name: vendor.vendorName
    });
  }
  for (const candidate of candidates) {
    if (!candidate.beforeConsent) {
      continue;
    }
    const matched = matchedCandidates.get(candidate.hostname);
    if (!matched) {
      continue;
    }
    const existing = preconsentRows.get(matched.canonicalName);
    if (existing) {
      existing.evidence_urls = uniqueStrings([...(getStringArray(existing.evidence_urls) ?? []), ...candidate.sampleUrls]);
      continue;
    }
    preconsentRows.set(matched.canonicalName, {
      collection_endpoint_type: candidate.collectionEndpointType,
      confidence: matched.confidence,
      detection_source: ENRICHMENT_SOURCE,
      domain_id: scan.domain_id,
      evidence_urls: candidate.sampleUrls,
      first_party_or_third_party: candidate.firstPartyOrThirdParty,
      matched_signature_id: `vendor_registry:${matched.id}`,
      organization_id: scan.organization_id,
      scan_id: input.scanId,
      script_host: candidate.hostname,
      vendor_category: matched.vendorCategory,
      vendor_name: matched.canonicalName
    });
  }

  if (preconsentRows.size > 0) {
    const preconsentEvidenceUrls = uniqueStrings(
      [...preconsentRows.values()].flatMap((row) => getStringArray(row.evidence_urls))
    );
    if (preconsentEvidenceUrls.length > 0) {
      await query(
        `
          update scan_runtime_artifacts
             set consent_baseline_tracker_evidence_urls = (
                   select coalesce(array_agg(distinct url order by url), '{}'::text[])
                     from unnest(coalesce(consent_baseline_tracker_evidence_urls, '{}'::text[]) || $2::text[]) as merged(url)
                    where length(trim(url)) > 0
                 ),
                 updated_at = timezone('utc', now())
           where scan_id = $1
        `,
        [input.scanId, preconsentEvidenceUrls]
      ).catch((error) => {
        throw new Error(`Failed to retain pre-consent tracker evidence URLs for ${input.scanId}: ${getErrorMessage(error)}`);
      });
    }

    await query(
      `
        insert into scan_preconsent_violations (
          scan_id,
          organization_id,
          domain_id,
          vendor_name,
          vendor_category,
          detection_source,
          confidence,
          first_party_or_third_party,
          collection_endpoint_type,
          script_host,
          matched_signature_id,
          evidence_urls
        )
        select
          scan_id,
          organization_id,
          domain_id,
          vendor_name,
          vendor_category,
          detection_source,
          confidence,
          first_party_or_third_party,
          collection_endpoint_type,
          script_host,
          matched_signature_id,
          evidence_urls
        from jsonb_populate_recordset(null::scan_preconsent_violations, $1::jsonb)
      `,
      [JSON.stringify([...preconsentRows.values()])]
    ).catch((error) => {
      throw new Error(`Failed to persist enriched pre-consent violations for ${input.scanId}: ${getErrorMessage(error)}`);
    });
  }

  return {
    candidateCount: candidates.length,
    llmAttempted,
    llmResolvedCount,
    llmSkippedReason,
    persistedPreconsentViolationCount: preconsentRows.size,
    persistedTrackerCount: trackerRows.length,
    registryResolvedCount: matchedCandidates.size - llmResolvedCount - staticResolvedCount,
    staticResolvedCount,
    unresolvedHosts: unresolvedCandidates.map((candidate) => candidate.hostname).filter((hostname) => !matchedCandidates.has(hostname))
  };
}
