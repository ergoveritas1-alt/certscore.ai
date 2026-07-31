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
