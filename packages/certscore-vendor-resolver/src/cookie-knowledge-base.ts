export type CanonicalCookieCategory =
  | "advertising"
  | "analytics"
  | "consent_management"
  | "infrastructure"
  | "marketing"
  | "personalization"
  | "security"
  | "session_replay"
  | "tag_management"
  | "unknown";

export type CanonicalCookieKnowledge = {
  category: CanonicalCookieCategory;
  dataTypes: string[];
  description: string;
  essentiality: "essential" | "non_essential" | "unknown";
  name: string;
  vendor: string | null;
};

export type CanonicalCookieContext = {
  cookieDomain?: string | null;
  hostname?: string | null;
  initiatorChain?: readonly string[] | null;
  setterScriptUrl?: string | null;
};

type CookieKnowledgeRule = Omit<CanonicalCookieKnowledge, "name"> & {
  contextHostPatterns?: readonly RegExp[];
  pattern: RegExp;
};

const COOKIE_KNOWLEDGE_RULES: readonly CookieKnowledgeRule[] = [
  {
    pattern: /^sbjs_(?:migrations|current_add|first_add|current|first|udata|session)$/i,
    category: "analytics",
    dataTypes: ["traffic-source attribution", "session attribution"],
    description: "Sourcebuster.js first-party attribution storage used to retain traffic-source, campaign, and session attribution context.",
    essentiality: "non_essential",
    vendor: "Sourcebuster.js",
  },
  {
    pattern: /^_pk_(?:id|ses|ref|cvar|hm)(?:[._-].*)?$/i,
    category: "analytics",
    dataTypes: ["analytics identifier", "visit and session measurement"],
    description: "Matomo analytics cookie used to distinguish visits or retain analytics attribution and session state.",
    essentiality: "non_essential",
    vendor: "Matomo",
  },
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
    contextHostPatterns: [/(?:^|\.)bing\.com$/i, /(?:^|\.)clarity\.ms$/i],
    category: "advertising",
    dataTypes: ["cross-site browser identifier", "advertising identifier"],
    description: "Microsoft browser identifier used across Microsoft services for advertising, site analytics, and related operational purposes.",
    essentiality: "non_essential",
    vendor: "Microsoft Identity Synchronization",
  },
  {
    pattern: /^(?:ANONCHK|MR|SM)$/i,
    contextHostPatterns: [/(?:^|\.)bing\.com$/i, /(?:^|\.)clarity\.ms$/i],
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
    pattern: /^(?:AWSALB|AWSALBCORS|AWSALBTG|AWSALBTGCORS|AWSALBAPP-\d+)$/i,
    category: "infrastructure",
    dataTypes: ["load-balancer target affinity", "session routing"],
    description: "Amazon Web Services load-balancer cookie used to preserve target affinity and route a session to the selected application target.",
    essentiality: "essential",
    vendor: "Amazon Web Services",
  },
  {
    pattern: /^__cflb$/i,
    category: "infrastructure",
    dataTypes: ["load-balancer target affinity", "session routing"],
    description: "Cloudflare load-balancer cookie used to preserve session affinity to a selected origin endpoint.",
    essentiality: "essential",
    vendor: "Cloudflare",
  },
  {
    pattern: /^YSC$/i,
    category: "security",
    dataTypes: ["session identifier", "fraud and abuse prevention"],
    description: "YouTube session cookie used by Google to help detect and resolve fraud, abuse, and security incidents.",
    essentiality: "essential",
    vendor: "Google / YouTube",
  },
  {
    pattern: /^(?:VISITOR_INFO1_LIVE|__Secure-YNID)$/i,
    category: "personalization",
    dataTypes: ["visitor identifier", "content personalization", "service analytics"],
    description: "Google and YouTube visitor cookie used for service analytics and personalized content or recommendations.",
    essentiality: "non_essential",
    vendor: "Google / YouTube",
  },
  {
    pattern: /^(?:__Secure-YEC|AEC)$/i,
    category: "security",
    dataTypes: ["fraud and abuse prevention", "security signal"],
    description: "Google security cookie used to help detect and prevent fraud, abuse, spam, and other malicious activity.",
    essentiality: "essential",
    vendor: "Google / YouTube",
  },
  {
    pattern: /^__Secure-ROLLOUT_TOKEN$/i,
    category: "analytics",
    dataTypes: ["feature rollout assignment", "feature experiment measurement"],
    description: "YouTube cookie used to manage phased feature rollouts and measure feature experiments.",
    essentiality: "non_essential",
    vendor: "Google / YouTube",
  },
  {
    pattern: /^_scid$/i,
    category: "advertising",
    dataTypes: ["advertising identifier", "marketing measurement"],
    description: "Snap pseudonymous visitor identifier used for advertising delivery and marketing measurement.",
    essentiality: "non_essential",
    vendor: "Snap",
  },
  {
    pattern: /^(?:uuid2|anj)$/i,
    category: "advertising",
    dataTypes: ["advertising identifier", "identifier synchronization"],
    description: "Xandr advertising-platform cookie used for pseudonymous audience recognition and advertising identifier synchronization.",
    essentiality: "non_essential",
    vendor: "Xandr",
  },
  {
    pattern: /^(?:mbox|at_check)$/i,
    category: "personalization",
    dataTypes: ["experience assignment", "cookie capability signal"],
    description: "Adobe Target cookie used to support personalized experience assignment or verify browser cookie support for Target activity.",
    essentiality: "non_essential",
    vendor: "Adobe Target",
  },
  {
    pattern: /^(?:_cb|_cb_svref|_chartbeat2)$/i,
    category: "analytics",
    dataTypes: ["visitor identifier", "content engagement", "referrer context"],
    description: "Chartbeat first-party analytics cookie used to distinguish visitors and measure content engagement or referrer context.",
    essentiality: "non_essential",
    vendor: "Chartbeat",
  },
  {
    pattern: /^_ym_visorc(?:_.+)?$/i,
    category: "session_replay",
    dataTypes: ["session replay state", "behavioral analytics"],
    description: "Yandex Metrica cookie used to support Session Replay and related behavioral analytics.",
    essentiality: "non_essential",
    vendor: "Yandex Metrica",
  },
  {
    pattern: /^(?:_cc_id|panoramaId)$/i,
    category: "advertising",
    dataTypes: ["pseudonymous audience identifier", "advertising profile identifier"],
    description: "Lotame pseudonymous identifier used for audience profiles, advertising activation, and measurement.",
    essentiality: "non_essential",
    vendor: "Lotame",
  },
  {
    pattern: /^sa-user-id(?:-v[234])?$/i,
    contextHostPatterns: [/(?:^|\.)stackadapt\.com$/i],
    category: "advertising",
    dataTypes: ["advertising identifier", "cross-site audience identifier"],
    description: "StackAdapt pseudonymous user identifier used for advertising delivery, retargeting, and campaign measurement.",
    essentiality: "non_essential",
    vendor: "StackAdapt",
  },
  {
    pattern: /^(?:id5|3pi|callback)$/i,
    contextHostPatterns: [/(?:^|\.)id5-sync\.com$/i],
    category: "advertising",
    dataTypes: ["identity-resolution identifier", "cookie-sync state"],
    description: "ID5 identity cookie used for pseudonymous user recognition or bounded cookie-synchronization state.",
    essentiality: "non_essential",
    vendor: "ID5",
  },
  {
    pattern: /^(?:tuuid|tuuid_lu)$/i,
    contextHostPatterns: [
      /(?:^|\.)bidswitch\.(?:com|net)$/i,
      /(?:^|\.)360yield\.com$/i,
      /(?:^|\.)impact-ad\.jp$/i,
      /(?:^|\.)company-target\.com$/i,
    ],
    category: "advertising",
    dataTypes: ["advertising identifier", "cookie-sync identifier"],
    description: "BidSwitch integration cookie used for pseudonymous user matching, advertising delivery, and measurement.",
    essentiality: "non_essential",
    vendor: "BidSwitch",
  },
  {
    pattern: /^(?:audit|audit_p|khaos_p)$/i,
    contextHostPatterns: [/(?:^|\.)rubiconproject\.com$/i],
    category: "advertising",
    dataTypes: ["advertising platform state", "pseudonymous advertising identifier"],
    description: "Magnite and Rubicon advertising-platform cookie used for programmatic advertising state or pseudonymous browser recognition.",
    essentiality: "non_essential",
    vendor: "Magnite / Rubicon",
  },
  {
    pattern: /^XANDR_PANID$/i,
    contextHostPatterns: [/(?:^|\.)adnxs\.com$/i],
    category: "advertising",
    dataTypes: ["advertising identifier", "browser identifier"],
    description: "Xandr pseudonymous advertising identifier used to distinguish browsers for advertising delivery and measurement.",
    essentiality: "non_essential",
    vendor: "Xandr",
  },
  {
    pattern: /^i$/i,
    contextHostPatterns: [/(?:^|\.)openx\.net$/i],
    category: "advertising",
    dataTypes: ["advertising identifier", "browser identifier"],
    description: "OpenX pseudonymous browser identifier used for programmatic advertising and related measurement.",
    essentiality: "non_essential",
    vendor: "OpenX",
  },
  {
    pattern: /^g_state$/i,
    contextHostPatterns: [/(?:^|\.)accounts\.google\.com$/i],
    category: "infrastructure",
    dataTypes: ["sign-out state", "authentication user-experience state"],
    description: "Google Identity Services cookie used to retain One Tap or automatic-sign-in sign-out state and prevent repeated sign-in prompts.",
    essentiality: "essential",
    vendor: "Google Identity Services",
  },
  {
    pattern: /^s_cc$/i,
    category: "analytics",
    dataTypes: ["cookie capability signal"],
    description: "Adobe Analytics session cookie used to determine whether the browser supports and accepts cookies.",
    essentiality: "non_essential",
    vendor: "Adobe Analytics",
  },
  {
    pattern: /^utag_main(?:_.+)?$/i,
    category: "tag_management",
    dataTypes: ["visitor identifier", "session metadata", "tag-management state"],
    description: "Tealium iQ cookie family used to maintain visitor, session, event-count, and tag-management state.",
    essentiality: "unknown",
    vendor: "Tealium iQ Tag Management",
  },
  {
    pattern: /^ARRAffinity(?:SameSite)?$/i,
    category: "infrastructure",
    dataTypes: ["load-balancer target affinity", "session routing"],
    description: "Microsoft Azure affinity cookie used to route subsequent requests in a session to the same application instance.",
    essentiality: "essential",
    vendor: "Microsoft Azure",
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
  context: CanonicalCookieContext = {},
): CanonicalCookieKnowledge {
  const name = cookieName?.trim() ?? "";
  const contextHosts = canonicalCookieContextHosts(context);
  const rule = COOKIE_KNOWLEDGE_RULES.find((candidate) =>
    candidate.pattern.test(name) &&
    (!candidate.contextHostPatterns || candidate.contextHostPatterns.some((pattern) =>
      contextHosts.some((hostname) => pattern.test(hostname))
    ))
  );
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

function canonicalCookieContextHosts(context: CanonicalCookieContext): string[] {
  const values = [
    context.cookieDomain,
    context.hostname,
    context.setterScriptUrl,
    // Ancestor presence is not proof that this vendor set this cookie. Retain
    // chains as evidence elsewhere; attribution requires direct host/setter context.
  ];
  return [...new Set(values.map(canonicalCookieContextHostname).filter((value): value is string => Boolean(value)))];
}

function canonicalCookieContextHostname(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed.replace(/^\.+/, "")}`).hostname.toLowerCase();
  } catch {
    return null;
  }
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
