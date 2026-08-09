export type CanonicalCookieCategory =
  | "advertising"
  | "analytics"
  | "consent_management"
  | "marketing"
  | "personalization"
  | "security"
  | "unknown";

export type CanonicalCookieKnowledge = {
  category: CanonicalCookieCategory;
  dataTypes: string[];
  description: string;
  essentiality: "essential" | "non_essential" | "unknown";
  name: string;
  vendor: string | null;
};

type CookieKnowledgeRule = Omit<CanonicalCookieKnowledge, "name"> & {
  pattern: RegExp;
};

const COOKIE_KNOWLEDGE_RULES: readonly CookieKnowledgeRule[] = [
  {
    pattern: /^ubid(?:-[a-z0-9]+)?$/i,
    category: "analytics",
    dataTypes: ["persistent browser identifier", "anonymous user identifier"],
    description: "Amazon persistent browser identifier used to distinguish devices and anonymous users in event and engagement measurement.",
    essentiality: "non_essential",
    vendor: "Amazon",
  },
  {
    pattern: /^_gcl_au$/i,
    category: "advertising",
    dataTypes: ["conversion identifier", "browser identifier"],
    description: "Used by Google advertising services to measure ad and conversion activity.",
    essentiality: "non_essential",
    vendor: "Google",
  },
  {
    pattern: /^_ga(?:_.+)?$|^_gid$|^_gat(?:_.+)?$/i,
    category: "analytics",
    dataTypes: ["analytics identifier", "browser identifier"],
    description: "Used by Google Analytics to distinguish browsers and measure site usage and engagement.",
    essentiality: "non_essential",
    vendor: "Google",
  },
  {
    pattern: /^_fb[pc]$/i,
    category: "advertising",
    dataTypes: ["advertising identifier", "browser identifier"],
    description: "Used by Meta advertising services to measure advertising activity and associate browser visits with campaigns.",
    essentiality: "non_essential",
    vendor: "Meta",
  },
  {
    pattern: /^CLID$/i,
    category: "analytics",
    dataTypes: ["cross-site browser identifier", "behavioral analytics identifier"],
    description: "Microsoft Clarity third-party identifier recording when Clarity first observed the browser across sites using Clarity.",
    essentiality: "non_essential",
    vendor: "Microsoft Clarity",
  },
  {
    pattern: /^MUID$/i,
    category: "advertising",
    dataTypes: ["cross-site browser identifier", "advertising identifier"],
    description: "Microsoft browser identifier used across Microsoft services for advertising, site analytics, and related operational purposes.",
    essentiality: "non_essential",
    vendor: "Microsoft Identity Synchronization",
  },
  {
    pattern: /^(?:ANONCHK|MR|SM)$/i,
    category: "advertising",
    dataTypes: ["identifier synchronization signal", "advertising storage signal"],
    description: "Microsoft support cookie used to manage, refresh, or synchronize the MUID browser identifier across Microsoft domains.",
    essentiality: "non_essential",
    vendor: "Microsoft Identity Synchronization",
  },
  {
    pattern: /^_uetsid$/i,
    category: "advertising",
    dataTypes: ["advertising session identifier", "conversion measurement identifier"],
    description: "Microsoft Advertising UET session identifier used to measure advertising and conversion activity on the site.",
    essentiality: "non_essential",
    vendor: "Microsoft Advertising / Bing UET",
  },
  {
    pattern: /^_uetvid$/i,
    category: "advertising",
    dataTypes: ["advertising visitor identifier", "conversion measurement identifier"],
    description: "Microsoft Advertising UET pseudonymous visitor identifier used to measure advertising and conversion activity on the site.",
    essentiality: "non_essential",
    vendor: "Microsoft Advertising / Bing UET",
  },
  {
    pattern: /^(?:__gads|__gpi)$/i,
    category: "advertising",
    dataTypes: ["publisher advertising identifier", "advertising measurement"],
    description: "Google publisher advertising identifier used for advertising and publisher measurement activity.",
    essentiality: "non_essential",
    vendor: "Google",
  },
  {
    pattern: /^__hstc$/i,
    category: "analytics",
    dataTypes: ["visitor identifier", "session metadata", "content engagement"],
    description: "HubSpot visitor-tracking cookie containing visitor and session history used to measure site engagement.",
    essentiality: "non_essential",
    vendor: "HubSpot",
  },
  {
    pattern: /^hubspotutk$/i,
    category: "analytics",
    dataTypes: ["visitor identifier", "contact-deduplication identifier"],
    description: "HubSpot pseudonymous visitor identifier used to recognize visitors and deduplicate submitted contacts.",
    essentiality: "non_essential",
    vendor: "HubSpot",
  },
  {
    pattern: /^__hssc$/i,
    category: "analytics",
    dataTypes: ["session identifier", "session metadata"],
    description: "HubSpot session cookie used to track the current visit and session activity.",
    essentiality: "non_essential",
    vendor: "HubSpot",
  },
  {
    pattern: /^__hssrc$/i,
    category: "analytics",
    dataTypes: ["session state"],
    description: "HubSpot session-state cookie used to determine whether a visitor has restarted a browser session.",
    essentiality: "non_essential",
    vendor: "HubSpot",
  },
  {
    pattern: /^lidc$/i,
    category: "security",
    dataTypes: ["data-center routing"],
    description: "LinkedIn cookie used to facilitate data-center selection for LinkedIn services.",
    essentiality: "essential",
    vendor: "LinkedIn",
  },
  {
    pattern: /^li_gc$/i,
    category: "consent_management",
    dataTypes: ["consent preference"],
    description: "LinkedIn cookie used to store a guest's consent preference for non-essential cookies.",
    essentiality: "essential",
    vendor: "LinkedIn",
  },
  {
    pattern: /^li_sugr$/i,
    category: "advertising",
    dataTypes: ["probabilistic identity match", "advertising identifier"],
    description: "LinkedIn cookie used to make a probabilistic match of a user's identity for advertising activity.",
    essentiality: "non_essential",
    vendor: "LinkedIn",
  },
  {
    pattern: /^ttcsid(?:_.+)?$/i,
    category: "advertising",
    dataTypes: ["advertising event identifier", "conversion measurement"],
    description: "TikTok Pixel cookie used to match events with people who engage with TikTok content and improve advertising measurement.",
    essentiality: "non_essential",
    vendor: "TikTok",
  },
  {
    pattern: /^aam_uuid$/i,
    category: "advertising",
    dataTypes: ["audience identifier", "ID-sync identifier"],
    description: "Adobe Audience Manager identifier used for advertising audience and ID-sync activity.",
    essentiality: "non_essential",
    vendor: "Adobe",
  },
  {
    pattern: /^sailthru(?:_|$)/i,
    category: "marketing",
    dataTypes: ["visitor identifier", "campaign engagement"],
    description: "Supports Sailthru marketing personalization and campaign engagement measurement.",
    essentiality: "non_essential",
    vendor: "Sailthru",
  },
  {
    pattern: /^_parsely_(?:session|visitor)$/i,
    category: "analytics",
    dataTypes: ["visitor identifier", "content engagement"],
    description: "Used by Parse.ly to measure visitor and content engagement.",
    essentiality: "non_essential",
    vendor: "Parse.ly",
  },
  {
    pattern: /^cX_[PG]$/i,
    category: "personalization",
    dataTypes: ["visitor identifier", "audience segment"],
    description: "Used by Cxense for audience segmentation and content personalization.",
    essentiality: "non_essential",
    vendor: "Cxense",
  },
  {
    pattern: /^_lr_geo_location$/i,
    category: "advertising",
    dataTypes: ["coarse location", "audience identifier"],
    description: "LiveRamp advertising context derived from the visitor's coarse geographic location.",
    essentiality: "non_essential",
    vendor: "LiveRamp",
  },
  {
    pattern: /^fw_vcid2$/i,
    category: "advertising",
    dataTypes: ["video advertising identifier"],
    description: "FreeWheel visitor identifier used for video advertising delivery and measurement.",
    essentiality: "non_essential",
    vendor: "FreeWheel",
  },
  {
    pattern: /^(?:ak_bmsc|bm_(?:mi|sv|sz)|_abck|akaas_.+)$/i,
    category: "security",
    dataTypes: ["bot-management signal", "session security"],
    description: "Akamai edge-security cookie used to distinguish automated traffic and protect the site.",
    essentiality: "essential",
    vendor: "Akamai",
  },
  {
    pattern: /^(?:__cf_bm|cf_clearance|_cfuvid)$/i,
    category: "security",
    dataTypes: ["bot-management signal", "session security"],
    description: "Cloudflare security cookie used for bot management and protected-session continuity.",
    essentiality: "essential",
    vendor: "Cloudflare",
  },
  {
    pattern: /^_dd_s$/i,
    category: "security",
    dataTypes: ["session diagnostics"],
    description: "Datadog session cookie used for bounded runtime monitoring and diagnostics.",
    essentiality: "essential",
    vendor: "Datadog",
  },
  {
    pattern: /^(?:OptanonConsent|OptanonAlertBoxClosed)$/i,
    category: "consent_management",
    dataTypes: ["consent preference"],
    description: "Stores the visitor's OneTrust consent choices and consent-state metadata.",
    essentiality: "essential",
    vendor: "OneTrust",
  },
  {
    pattern: /^(?:usprivacy|euconsent-v2|gpp)$/i,
    category: "consent_management",
    dataTypes: ["privacy preference"],
    description: "Stores a standardized privacy or consent preference string.",
    essentiality: "essential",
    vendor: null,
  },
  {
    pattern: /^(?:demdex|dpm)$/i,
    category: "advertising",
    dataTypes: ["audience identifier", "ID-sync identifier"],
    description: "Adobe Audience Manager identifier used for advertising audience matching.",
    essentiality: "non_essential",
    vendor: "Adobe",
  },
  {
    pattern: /^(?:cto_bundle|uid)$/i,
    category: "advertising",
    dataTypes: ["advertising identifier", "audience segment"],
    description: "Advertising identifier used for audience matching and ad delivery.",
    essentiality: "non_essential",
    vendor: null,
  },
  {
    pattern: /^test_cookie$/i,
    category: "advertising",
    dataTypes: ["cookie capability signal"],
    description: "Used by Google advertising services to test whether the browser accepts cookies.",
    essentiality: "non_essential",
    vendor: "Google",
  },
] as const;

export function resolveCanonicalCookieKnowledge(
  cookieName: string | null | undefined,
): CanonicalCookieKnowledge {
  const name = cookieName?.trim() ?? "";
  const rule = COOKIE_KNOWLEDGE_RULES.find((candidate) => candidate.pattern.test(name));
  if (!rule) {
    return {
      category: "unknown",
      dataTypes: [],
      description: "Purpose is not yet classified in the canonical cookie knowledge base; manual review is recommended.",
      essentiality: "unknown",
      name,
      vendor: null,
    };
  }
  return {
    category: rule.category,
    dataTypes: [...rule.dataTypes],
    description: rule.description,
    essentiality: rule.essentiality,
    name,
    vendor: rule.vendor,
  };
}

export type TransferMechanism = {
  basis: string;
  mechanism: "adequacy_decision" | "dpf_certified" | "sccs_assumed_unverified" | "unknown";
  verifiedAsOf: string;
};

export type CanonicalVendorLegalContext = {
  controllingEntity: string;
  headquartersCountry: string;
  transferMechanism: TransferMechanism;
};

const VERIFIED_AS_OF = "2026-07-23";

const VENDOR_LEGAL_CONTEXT = new Map<string, CanonicalVendorLegalContext>([
  ["Adobe Inc.", {
    controllingEntity: "Adobe Inc.",
    headquartersCountry: "US",
    transferMechanism: { basis: "US-controlled vendor; mechanism requires current vendor/legal verification.", mechanism: "sccs_assumed_unverified", verifiedAsOf: VERIFIED_AS_OF },
  }],
  ["Google LLC", {
    controllingEntity: "Google LLC",
    headquartersCountry: "US",
    transferMechanism: { basis: "US-controlled vendor; mechanism requires current vendor/legal verification.", mechanism: "sccs_assumed_unverified", verifiedAsOf: VERIFIED_AS_OF },
  }],
  ["LiveRamp Holdings, Inc.", {
    controllingEntity: "LiveRamp Holdings, Inc.",
    headquartersCountry: "US",
    transferMechanism: { basis: "US-controlled vendor; mechanism requires current vendor/legal verification.", mechanism: "sccs_assumed_unverified", verifiedAsOf: VERIFIED_AS_OF },
  }],
  ["Taboola.com Ltd.", {
    controllingEntity: "Taboola.com Ltd.",
    headquartersCountry: "US",
    transferMechanism: { basis: "US-controlled vendor; mechanism requires current vendor/legal verification.", mechanism: "sccs_assumed_unverified", verifiedAsOf: VERIFIED_AS_OF },
  }],
  ["Criteo SA", {
    controllingEntity: "Criteo SA",
    headquartersCountry: "FR",
    transferMechanism: { basis: "Controlling entity is established in an EU member state; no cross-border transfer mechanism is inferred from headquarters alone.", mechanism: "unknown", verifiedAsOf: VERIFIED_AS_OF },
  }],
  ["OneTrust, LLC", {
    controllingEntity: "OneTrust, LLC",
    headquartersCountry: "US",
    transferMechanism: { basis: "US-controlled vendor; mechanism requires current vendor/legal verification.", mechanism: "sccs_assumed_unverified", verifiedAsOf: VERIFIED_AS_OF },
  }],
]);

export function resolveCanonicalVendorLegalContext(
  entity: string | null | undefined,
): CanonicalVendorLegalContext | null {
  return entity ? VENDOR_LEGAL_CONTEXT.get(entity) ?? null : null;
}

const ID_SYNC_HOST_PATTERNS = [
  /^cm\.g\.doubleclick\.net$/i,
  /^am-match\.taboola\.com$/i,
  /^ats\.rlcdn\.com$/i,
  /(?:^|\.)demdex\.net$/i,
  /^gum\.criteo\.com$/i,
] as const;

export function isCanonicalIdSyncEndpoint(hostname: string | null | undefined) {
  const normalized = hostname?.trim().replace(/^\.+/, "").toLowerCase();
  return Boolean(normalized && ID_SYNC_HOST_PATTERNS.some((pattern) => pattern.test(normalized)));
}
