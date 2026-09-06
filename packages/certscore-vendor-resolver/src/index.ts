import type {
  EndpointGeographyPrecision,
  EndpointGeographyStatus,
  EvidenceRef,
  NormalizedVendorObservation,
  VendorMatchSourceType,
  VendorServicePurpose,
  VendorRegistryIdentity,
  VendorRegistryAttribution,
} from "@certscore/contracts";

export {
  isCanonicalIdSyncEndpoint,
  resolveCanonicalCookieKnowledge,
  resolveCanonicalVendorLegalContext,
  type CanonicalCookieCategory,
  type CanonicalCookieContext,
  type CanonicalCookieKnowledge,
  type CanonicalVendorLegalContext,
  type TransferMechanism,
} from "./cookie-knowledge-base";

export const CANONICAL_VENDOR_RESOLVER_VERSION = "certscore-vendor-resolver-2026-09-05-attribution-v1";

export type VendorResolverEvidenceType =
  | "request"
  | "response"
  | "script"
  | "cookie"
  | "iframe"
  | "cmp_runtime";

export interface VendorResolverInput {
  evidenceId?: string;
  type: VendorResolverEvidenceType;
  url?: string;
  hostname?: string;
  cookieName?: string;
  globalName?: string;
  storageKey?: string;
  domSelector?: string;
  evidenceRef?: EvidenceRef;
  sourceEventType?: string;
  sourceScanner?: string;
  scenario?: string;
  consentStateAtTime?: NormalizedVendorObservation["matchSources"][number]["consentStateAtTime"];
  matchSource?: VendorMatchSourceType;
}

/**
 * A bounded, already-sanitized observation used to identify repeated endpoints
 * that the canonical resolver does not yet recognize. This is discovery input,
 * not a registry rule or vendor attribution.
 */
export type UnknownVendorCandidateInput = {
  cookieNames?: string[];
  domainId?: string;
  hostname?: string;
  scanId: string;
  source: "request" | "response" | "script";
  thirdParty: boolean;
  url?: string;
};

export type UnknownVendorCandidate = {
  candidateKey: string;
  cookieNames: string[];
  distinctPathCount: number;
  distinctScanCount: number;
  distinctSiteCount: number;
  hostname: string;
  observationCount: number;
  pathTemplates: string[];
  priorityScore: number;
  recommendedAction: "deterministic_review" | "observe_more";
  requiresOwnerResearch: true;
  sampleEndpoints: string[];
  sourceTypes: Array<"request" | "response" | "script">;
};

export type UnknownVendorCandidateQueue = {
  excluded: {
    invalidOrFirstParty: number;
    knownCanonical: number;
    missingConcretePath: number;
  };
  candidates: UnknownVendorCandidate[];
  inputObservationCount: number;
};

export type EndpointGeographyResolution = {
  basis: string[];
  jurisdiction?: string;
  locationLabel?: string;
  precision?: EndpointGeographyPrecision;
  provider?: string;
  region?: string;
  status: EndpointGeographyStatus;
};

export type EndpointGeographyResolverInput = {
  collectionEndpointObserved: boolean;
  hostname?: string;
  thirdParty: boolean;
};

export type VendorDisplayCategory =
  | "A/B Testing"
  | "Advertising"
  | "Analytics"
  | "Authentication"
  | "CDN"
  | "Cookie compliance"
  | "Customer support"
  | "Embedded media"
  | "Marketing automation"
  | "Payment processors"
  | "Performance monitoring"
  | "Personalisation"
  | "Security"
  | "Session replay"
  | "Tag management"
  | "Unknown";

export type VendorDisplayCategoryInput = {
  product?: string | null;
  purpose?: NormalizedVendorObservation["purpose"] | string | null;
  regulatoryRelevance?: readonly string[] | null;
  vendor?: string | null;
};

export type CanonicalVendorLabelResolution = {
  basis: string;
  confidence: number;
  displayCategory: VendorDisplayCategory;
  entity: string;
  product: string;
  purpose: NormalizedVendorObservation["purpose"];
  servicePurpose: VendorServicePurpose;
  regulatoryRelevance: string[];
  vendor: string;
};

export type CanonicalEntityOwnerResolution = CanonicalVendorLabelResolution;

/** Literal mention lookup over canonical identities; never a legal-disclosure sufficiency judgment. */
export function findCanonicalVendorMention(text: string, identity: Pick<NormalizedVendorObservation, "vendor" | "product" | "entity">): { scope: "product" | "vendor" | "entity"; start: number; end: number } | undefined {
  const matchingRules = rules.filter(rule => rule.vendor === identity.vendor && rule.product === identity.product && rule.entity === identity.entity);
  if (!matchingRules.length || text.length > 1_000_000) return undefined;
  const candidates = [
    ...[identity.product, ...matchingRules.flatMap(rule => rule.aliases ?? [])].map(term => ({ term, scope: "product" as const })),
    { term: identity.vendor, scope: "vendor" as const }, { term: identity.entity, scope: "entity" as const },
  ];
  for (const { term, scope } of candidates) {
    if (!term || term.trim().length < 4) continue; // Short/ambiguous names do not establish a mention.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (match) return { scope, start: match.index, end: match.index + match[0].length };
  }
  return undefined;
}

interface VendorRule {
  /** Frozen identifiers: preserve through label changes; never regenerate at runtime. */
  identity: VendorRegistryIdentity;
  review?: {
    reviewedAt: string;
    reviewer: string;
    sourceUrls: string[];
  };
  entity: string;
  vendor: string;
  product: string;
  purpose: NormalizedVendorObservation["purpose"];
  servicePurpose: VendorServicePurpose;
  regulatoryRelevance: string[];
  confidence: number;
  aliases?: string[];
  hostPatterns?: RegExp[];
  urlPatterns?: RegExp[];
  cookiePatterns?: RegExp[];
  globalPatterns?: RegExp[];
  storageKeyPatterns?: RegExp[];
  domSelectorPatterns?: RegExp[];
  excludeHostPatterns?: RegExp[];
  requireUrlPatternMatch?: boolean;
  requireHostPatternForCookieMatch?: boolean;
  allowUrlPatternWithoutHostMatch?: boolean;
  suppressCookieMatchedHostname?: boolean;
  basisLabel: string;
}

const rules: VendorRule[] = [
  {
    identity: {"entityId":"ent_40ea5a6e6ed8","vendorId":"ven_fbfadd693eb0","serviceId":"svc_87aa1c33c3af"},
    entity: "BST DSGVO Cookie",
    vendor: "BST DSGVO Cookie",
    product: "BST DSGVO Cookie notice plugin, non-TCF",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.98,
    urlPatterns: [
      /(?:^|\/)wp-content\/plugins\/bst-dsgvo-cookie(?:\/|[?#]|$)/i,
    ],
    allowUrlPatternWithoutHostMatch: true,
    domSelectorPatterns: [/^\.bst-popup-link$/i, /^a\.bst-popup-link$/i],
    basisLabel: "bst_dsgvo_cookie_notice_runtime",
  },
  {
    identity: {"entityId":"ent_ce252597a83c","vendorId":"ven_b631758c92ce","serviceId":"svc_415e8379f158"},
    entity: "DSGVO All in One for WP",
    vendor: "DSGVO All in One",
    product: "DSGVO All in One / tarteaucitron consent manager",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "preference_tooling"],
    confidence: 0.98,
    hostPatterns: [/(?:^|\.)tarteaucitron\.io$/i],
    urlPatterns: [/dsgvo-all-in-one/i, /dsgvoaio/i, /tarteaucitron(?:\.min)?\.js(?:[?#]|$)/i],
    allowUrlPatternWithoutHostMatch: true,
    cookiePatterns: [/^dsgvoaio(?:_create)?$/i, /^tarteaucitron$/i],
    globalPatterns: [/^(?:window\.)?(?:dsgvoaio|tarteaucitron)$/i],
    storageKeyPatterns: [/^dsgvoaio(?:_create)?$/i, /^tarteaucitron$/i],
    domSelectorPatterns: [
      /^#tarteaucitron(?:Root|AlertBig|Personalize|CloseAlert)$/i,
      /^\[id\^=['"]?tarteaucitron/i,
      /^\[class\*=['"]?dsgvoaio/i,
    ],
    basisLabel: "dsgvoaio_tarteaucitron_cmp_runtime",
  },
  {
    identity: {"entityId":"ent_471903a5cc9e","vendorId":"ven_4231b9cf3eac","serviceId":"svc_4baa7e8a2ab1"},
    entity: "Drupal",
    vendor: "Drupal",
    product: "Drupal EU Cookie Compliance module, non-TCF",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "preference_tooling"],
    confidence: 0.96,
    urlPatterns: [
      /(?:^|\/)modules\/contrib\/eu_cookie_compliance(?:\/|[?#]|$)/i,
      /(?:^|\/)libraries\/eu_cookie_compliance(?:\/|[?#]|$)/i,
      /eu_cookie_compliance(?:\.min)?\.js(?:[?#]|$)/i,
    ],
    cookiePatterns: [/^cookie-agreed(?:-.+)?$/i],
    globalPatterns: [/^drupalSettings\.eu_cookie_compliance$/i],
    domSelectorPatterns: [
      /^#sliding-popup$/i,
      /^\.eu-cookie-compliance-banner$/i,
      /^\[id\*=['"]?eu-cookie-compliance/i,
      /^\[class\*=['"]?eu-cookie-compliance/i,
    ],
    basisLabel: "drupal_eu_cookie_compliance_module",
  },
  {
    identity: {"entityId":"ent_260a503f2258","vendorId":"ven_9f5e076ea329","serviceId":"svc_032b0828a742"},
    entity: "Borlabs GmbH",
    vendor: "Borlabs",
    product: "Borlabs Cookie CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "preference_tooling"],
    confidence: 0.96,
    hostPatterns: [/\.borlabs\.io$/i],
    urlPatterns: [/\/borlabs-cookie\//i, /borlabs-cookie(?:\.min)?\.js(?:[?#]|$)/i],
    allowUrlPatternWithoutHostMatch: true,
    cookiePatterns: [/^borlabs-cookie$/i, /^borlabsCookie$/i],
    globalPatterns: [/^BorlabsCookie$/i],
    storageKeyPatterns: [/^borlabs-cookie$/i, /^borlabsCookie$/i],
    domSelectorPatterns: [/^#BorlabsCookieBox$/i, /^\[data-borlabs-cookie-consent-required\]$/i, /^\.brlbs-/i],
    basisLabel: "borlabs_cookie_cmp_runtime",
  },
  {
    identity: {"entityId":"ent_b54fd607f963","vendorId":"ven_fe6fe2d26227","serviceId":"svc_809a31cf0661"},
    entity: "Sourcebuster.js",
    vendor: "Sourcebuster.js",
    product: "Sourcebuster first-party attribution",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["first_party_attribution", "storage_technology", "order_attribution"],
    confidence: 0.99,
    urlPatterns: [
      /(?:^|\/)sourcebuster(?:\.min)?\.js(?:[?#]|$)/i,
      /woocommerce\/assets\/js\/sourcebuster\/sourcebuster(?:\.min)?\.js(?:[?#]|$)/i,
    ],
    allowUrlPatternWithoutHostMatch: true,
    cookiePatterns: [/^sbjs_(?:migrations|current_add|first_add|current|first|udata|session)$/i],
    storageKeyPatterns: [/^sbjs_(?:migrations|current_add|first_add|current|first|udata|session)$/i],
    basisLabel: "sourcebuster_first_party_attribution",
  },
  {
    identity: {"entityId":"ent_cb105c7edd82","vendorId":"ven_659922e607da","serviceId":"svc_f1ae4be532ba"},
    entity: "Dealfront Group GmbH",
    vendor: "Leadfeeder",
    product: "Leadfeeder Website Visitor Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "b2b_visitor_identification", "audience_measurement"],
    confidence: 0.97,
    hostPatterns: [/^(?:sc|tr)\.lfeeder\.com$/i],
    urlPatterns: [
      /^https:\/\/sc\.lfeeder\.com\/lftracker[^/]*\.js(?:[?#]|$)/i,
      /^https:\/\/tr\.lfeeder\.com\/(?:[?#]|$)/i,
    ],
    cookiePatterns: [/^_lfa(?:_.*)?$/i],
    basisLabel: "leadfeeder_visitor_analytics",
  },
  {
    identity: {"entityId":"ent_4ae3e735a6c2","vendorId":"ven_409fc900a643","serviceId":"svc_a173301b602d"},
    entity: "Axel Springer SE",
    vendor: "Axel Springer",
    product: "Axel Springer publisher infrastructure",
    purpose: "infrastructure",
    servicePurpose: "Infrastructure",
    regulatoryRelevance: ["publisher_infrastructure"],
    confidence: 0.96,
    hostPatterns: [/(?:^|\.)bild\.de$/i, /(?:^|\.)bildstatic\.de$/i],
    basisLabel: "axel_springer_publisher_infrastructure",
  },
  {
    identity: {"entityId":"ent_1fd14588af3b","vendorId":"ven_b47e7e26ac84","serviceId":"svc_6ad30218d79b"},
    entity: "Agora S.A.",
    vendor: "Agora",
    product: "Agora publisher infrastructure",
    purpose: "infrastructure",
    servicePurpose: "Infrastructure",
    regulatoryRelevance: ["publisher_infrastructure"],
    confidence: 0.96,
    hostPatterns: [/(?:^|\.)agora\.pl$/i, /(?:^|\.)gazeta\.pl$/i, /(?:^|\.)im-g\.pl$/i, /(?:^|\.)wyborcza\.pl$/i],
    basisLabel: "agora_publisher_infrastructure",
  },
  {
    identity: {"entityId":"ent_7d1ca4cec6af","vendorId":"ven_b433ca6e5f26","serviceId":"svc_0985901773cc"},
    entity: "Gremi Media S.A.",
    vendor: "Gremi Media",
    product: "Gremi Media publisher infrastructure",
    purpose: "infrastructure",
    servicePurpose: "Infrastructure",
    regulatoryRelevance: ["publisher_infrastructure"],
    confidence: 0.96,
    hostPatterns: [/(?:^|\.)rp\.pl$/i, /(?:^|\.)gremimedia\.pl$/i],
    basisLabel: "gremi_media_publisher_infrastructure",
  },
  {
    identity: {"entityId":"ent_fd9c526e83d6","vendorId":"ven_6f36fa3acb8d","serviceId":"svc_83d13c8fe334"},
    entity: "Gemius S.A.",
    vendor: "Gemius",
    product: "Gemius audience measurement",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["audience_measurement"],
    confidence: 0.94,
    hostPatterns: [/(?:^|\.)gemius\.pl$/i],
    basisLabel: "gemius_audience_measurement",
  },
  {
    identity: {"entityId":"ent_072cef417e28","vendorId":"ven_92127270e7b2","serviceId":"svc_a5297d93262b"},
    entity: "Salesmanago S.A.",
    vendor: "Salesmanago",
    product: "Salesmanago marketing automation",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["marketing_automation"],
    confidence: 0.94,
    hostPatterns: [/(?:^|\.)salesmanago\.pl$/i, /(?:^|\.)salesmanago\.com$/i],
    cookiePatterns: [/^(smuuid|smvr|_smvs)$/i],
    basisLabel: "salesmanago_marketing_automation",
  },
  {
    identity: {"entityId":"ent_de92c9928c81","vendorId":"ven_6ce27e0da583","serviceId":"svc_085f348d8f64"},
    entity: "LiveRamp Holdings, Inc.",
    vendor: "LiveRamp",
    product: "Data Plus Math / LiveRamp",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement", "tv_attribution"],
    confidence: 0.93,
    hostPatterns: [/^(?:p|c)\.tvpixel\.com$/i],
    urlPatterns: [/^https:\/\/p\.tvpixel\.com\/(?:com|com\.snowplowanalytics\.snowplow|pixel|event)\b/i, /^https:\/\/c\.tvpixel\.com\/js\/current\/dpm_pixel_min\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "data_plus_math_tvpixel_ad_measurement_endpoint",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_7dd5fa017f5c"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Fonts",
    purpose: "infrastructure",
    servicePurpose: "Font delivery",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^fonts\.googleapis\.com$/i, /^fonts\.gstatic\.com$/i],
    urlPatterns: [/\/css2?\b/i, /\/s\//i],
    basisLabel: "google_fonts_cdn",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_40dd10d1f7ff"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "embedded_content", "static_assets", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^gstatic\.com$/i, /^(?!fonts\.)[^.]+\.gstatic\.com$/i],
    basisLabel: "google_static_assets_infrastructure",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_66704c1e3d82"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google reCAPTCHA",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^(?:www\.)?google\.com$/i, /^www\.recaptcha\.net$/i, /^www\.gstatic\.com$/i],
    urlPatterns: [/\/recaptcha\/(?:api|api2|enterprise)\b/i, /\/recaptcha\/releases\//i],
    requireUrlPatternMatch: true,
    basisLabel: "google_recaptcha_security_runtime",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_4a7bd8ea1b6d"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Experience Cloud consent propagation",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent", "consent_management"],
    confidence: 0.99,
    hostPatterns: [/\.demdex\.net$/i],
    urlPatterns: [/\/ee\/v1\/privacy\/set-consent\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_experience_cloud_consent_propagation_endpoint",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_610b46f286f1"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Fonts / Typekit",
    purpose: "infrastructure",
    servicePurpose: "Font delivery",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^use\.typekit\.net$/i, /^p\.typekit\.net$/i],
    basisLabel: "adobe_fonts_typekit_cdn",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_e408c48d1f67","serviceId":"svc_700f63946606"},
    entity: "Google LLC",
    vendor: "YouTube",
    product: "YouTube Image CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "embedded_content", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^i\.ytimg\.com$/i, /^img\.youtube\.com$/i],
    urlPatterns: [/\/(?:vi|an_webp|sb|s_p|ggpht)\//i],
    basisLabel: "youtube_image_cdn_infrastructure",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_185810046411"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Interactive Media Ads",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "video_ad_measurement", "ad_delivery"],
    confidence: 0.93,
    hostPatterns: [/^imasdk\.googleapis\.com$/i],
    urlPatterns: [/\/js\/sdkloader\/ima3(?:_dai)?\.js\b/i],
    basisLabel: "google_ima_sdk",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_cc54feb7bf93"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Sign-in",
    purpose: "infrastructure",
    servicePurpose: "Authentication",
    regulatoryRelevance: ["authentication", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^accounts\.google\.com$/i],
    urlPatterns: [/\/gsi\/client\b/i],
    globalPatterns: [/^google\.accounts$/i],
    basisLabel: "google_identity_services_script",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_2c15b4657695"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Tag Manager",
    purpose: "tag_management",
    servicePurpose: "Tag management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^(?:www\.)?googletagmanager\.com$/i],
    urlPatterns: [/\/gtm\.js\b/i, /[?&]id=GTM-/i],
    cookiePatterns: [/^_dc_gtm_/i],
    storageKeyPatterns: [/^_dc_gtm_/i],
    basisLabel: "gtm_host_or_container",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_eb4b02b9df00"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Experience Platform Launch",
    purpose: "tag_management",
    servicePurpose: "Tag management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^assets\.adobedtm\.com$/i],
    urlPatterns: [/\/(?:launch-[^/]+|EX[^/]+-libraryCode_source)\.min\.js\b/i],
    basisLabel: "adobe_launch_tag_management_script",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_a450a87ceb39"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Audience Manager / Experience Cloud",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_management", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.demdex\.net$/i],
    urlPatterns: [/\/(?:id(?:\/rd)?|event)\b/i, /\/ibs:/i, /\/demconf\.jpg\b/i],
    cookiePatterns: [/^demdex$/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_demdex_audience_manager_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_d58370a2a657"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Analytics / Experience Cloud",
    aliases: ["Adobe Analytics"],
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.omtrdc\.net$/i, /\.2o7\.net$/i],
    urlPatterns: [/\/b\/ss\//i, /[?&]AQB=1\b/i],
    cookiePatterns: [/^s_ecid$/i, /^AMCV_/i, /^s_vi$/i],
    basisLabel: "adobe_analytics_or_experience_cloud_endpoint",
  },
  {
    identity: {"entityId":"ent_dc18c8f6da81","vendorId":"ven_72c6542b55a1","serviceId":"svc_5804137c3437"},
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Retail",
    aliases: ["Amazon.de"],
    purpose: "infrastructure",
    servicePurpose: "Commerce",
    regulatoryRelevance: ["service_delivery", "first_party_runtime", "retail_platform"],
    confidence: 0.99,
    hostPatterns: [/^(?:www\.)?amazon\.de$/i],
    cookiePatterns: [/^ubid(?:-[a-z0-9]+)?$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "amazon_de_retail_site_or_ubid_cookie",
  },
  {
    identity: {"entityId":"ent_dc18c8f6da81","vendorId":"ven_72c6542b55a1","serviceId":"svc_2177d3dfc3bb"},
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Ads",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.amazon-adsystem\.com$/i, /^aax\.amazon-adsystem\.com$/i],
    excludeHostPatterns: [/^c\.amazon-adsystem\.com$/i, /\.aps\.amazon-adsystem\.com$/i],
    urlPatterns: [/\/e\/dt\b/i, /\/x\/px\//i],
    cookiePatterns: [/^ad-id$/i, /^ad-privacy$/i],
    basisLabel: "amazon_ads_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_dc18c8f6da81","vendorId":"ven_72c6542b55a1","serviceId":"svc_2177d3dfc3bb"},
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Ads",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement"],
    confidence: 0.92,
    hostPatterns: [
      /^ara\.paa-reporting-advertising\.amazon$/i,
      /^prod\.tahoe-analytics\.publishers\.advertising\.a2z\.com$/i,
    ],
    urlPatterns: [/\/aat\b/i, /\/logevent\/putRecords\b/i],
    basisLabel: "amazon_ads_reporting_endpoint",
  },
  {
    identity: {"entityId":"ent_a0b4dd0c63a8","vendorId":"ven_f20d537bb1d5","serviceId":"svc_62e3f31e746c"},
    entity: "DoubleVerify Holdings, Inc.",
    vendor: "DoubleVerify",
    product: "DoubleVerify",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_verification", "brand_safety"],
    confidence: 0.92,
    hostPatterns: [/\.doubleverify\.com$/i],
    urlPatterns: [/\/(?:event\.(?:png|jpg)|bsevent\.gif)\b/i],
    basisLabel: "doubleverify_ad_verification_endpoint",
  },
  {
    identity: {"entityId":"ent_76a598e9ca68","vendorId":"ven_d570a7a5f19f","serviceId":"svc_727b1ef55c7f"},
    entity: "The Trade Desk, Inc.",
    vendor: "The Trade Desk",
    product: "The Trade Desk",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.adsrvr\.org$/i],
    urlPatterns: [/\/track/i, /\/pixel/i],
    cookiePatterns: [/^TDID$/i, /^TDCPM$/i],
    basisLabel: "trade_desk_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_33db581bc4d1","vendorId":"ven_193b236ec81b","serviceId":"svc_42a99d1912db"},
    entity: "Criteo SA",
    vendor: "Criteo",
    product: "Criteo",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/(?:^|\.)criteo\.com$/i, /(?:^|\.)criteo\.net$/i],
    urlPatterns: [/\/r\/d/i, /\/dis\/dis\.aspx/i],
    cookiePatterns: [/^cto_bundle$/i],
    suppressCookieMatchedHostname: true,
    storageKeyPatterns: [/criteo/i],
    basisLabel: "criteo_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_33db581bc4d1","vendorId":"ven_193b236ec81b","serviceId":"svc_42a99d1912db"},
    entity: "Criteo SA",
    vendor: "Criteo",
    product: "Criteo",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.99,
    hostPatterns: [/(?:^|\.)criteo\.com$/i, /(?:^|\.)criteo\.net$/i],
    cookiePatterns: [/^uid$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "criteo_owned_uid_cookie",
  },
  {
    identity: {"entityId":"ent_75093695083c","vendorId":"ven_3424aa242301","serviceId":"svc_d31adceaf8cb"},
    entity: "AdRiver LLC",
    vendor: "AdRiver",
    product: "AdRiver",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "ad_measurement"],
    confidence: 0.92,
    hostPatterns: [/\.adriver\.ru$/i, /^adriver\.ru$/i],
    urlPatterns: [/\/(?:cgi-bin|images|js|banners|ad|erle)\b/i],
    basisLabel: "adriver_ad_endpoint",
  },
  {
    identity: {"entityId":"ent_f3a28d9ca5a3","vendorId":"ven_ff543a55ab92","serviceId":"svc_e7985c4c15ba"},
    entity: "Yandex LLC",
    vendor: "Yandex",
    product: "Yandex Ads / Metrica",
    aliases: ["Yandex Ads"],
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "analytics", "ad_measurement", "cross_site_tracking"],
    confidence: 0.93,
    hostPatterns: [/\.yandex\.(?:ru|com|net)$/i, /^yandex\.(?:ru|com|net)$/i],
    urlPatterns: [/\/(?:watch|metrika|metrika_match|ads|yabs|sync|setuid)\b/i],
    cookiePatterns: [
      /^yabs-sid$/i,
      /^sync_cookie_csrf(?:_secondary)?$/i,
      /^yandexuid$/i,
      /^yuid/i,
      /^(?:pi|i|bh|ymex|_yasc)$/i,
    ],
    requireHostPatternForCookieMatch: true,
    requireUrlPatternMatch: true,
    basisLabel: "yandex_ads_metrica_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_bae714c8b394","vendorId":"ven_18dec5b332c4","serviceId":"svc_7813229229a5"},
    entity: "VK Company Limited",
    vendor: "VK / Mail.ru",
    product: "VK / Mail.ru Ads",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "analytics", "ad_measurement"],
    confidence: 0.9,
    hostPatterns: [/\.mail\.ru$/i, /^mail\.ru$/i, /\.mytarget\.ru$/i],
    urlPatterns: [/\/(?:counter|top|tracker|ads?|sync|pixel)\b/i],
    cookiePatterns: [/^tmr_lvid/i, /^top100_id$/i],
    basisLabel: "vk_mail_ru_ads_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_711bd2d50e10","vendorId":"ven_ffef62e22aab","serviceId":"svc_bae1c0a7acb7"},
    entity: "Permutive Ltd",
    vendor: "Permutive",
    product: "Permutive",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_segmentation"],
    confidence: 0.93,
    hostPatterns: [/\.permutive\.com$/i, /^[0-9a-f-]+\.edge\.permutive\.app$/i],
    urlPatterns: [/\/v2\/events/i, /\/track/i, /^https:\/\/[0-9a-f-]+\.edge\.permutive\.app\/[0-9a-f-]+-web\.js\b/i],
    storageKeyPatterns: [/^permutive/i, /^fedID\.permutive/i, /^fedID\.permutative/i],
    requireUrlPatternMatch: true,
    basisLabel: "permutive_event_endpoint",
  },
  {
    identity: {"entityId":"ent_58e68839dcd6","vendorId":"ven_8adaca9c6bb6","serviceId":"svc_7510b5fdae69"},
    entity: "Lotame Solutions, Inc.",
    vendor: "Lotame",
    product: "Lotame",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_segmentation"],
    confidence: 0.93,
    hostPatterns: [/\.crwdcntrl\.net$/i, /\.lotame\.com$/i],
    urlPatterns: [/\/lt\//i, /\/pixel/i],
    cookiePatterns: [/^lotame_/i],
    basisLabel: "lotame_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_de92c9928c81","vendorId":"ven_6ce27e0da583","serviceId":"svc_57692cc931af"},
    entity: "LiveRamp Holdings, Inc.",
    vendor: "LiveRamp",
    product: "LiveRamp",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution"],
    confidence: 0.93,
    hostPatterns: [/\.rlcdn\.com$/i, /\.liveramp\.com$/i],
    urlPatterns: [
      /^https:\/\/(?:[^/]+\.)?(?:rlcdn\.com|liveramp\.com)\/(?:id|cm|api\/identity|[0-9]+\.gif)\b/i,
    ],
    cookiePatterns: [/^rlas3$/i, /^pxrc$/i],
    basisLabel: "liveramp_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_f7d958363f08","vendorId":"ven_ac89b74a109c","serviceId":"svc_268ac94b5bd0"},
    entity: "PubMatic, Inc.",
    vendor: "PubMatic",
    product: "PubMatic",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.pubmatic\.com$/i],
    urlPatterns: [/\/AdServer\//i, /\/sync/i],
    cookiePatterns: [/^PUBMDCID$/i],
    basisLabel: "pubmatic_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_f245f8bbe41c","vendorId":"ven_0ecb9d4c6e30","serviceId":"svc_4d593f96c504"},
    entity: "Magnite, Inc.",
    vendor: "Magnite",
    product: "Magnite / Rubicon",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.rubiconproject\.com$/i, /\.magnite\.com$/i],
    urlPatterns: [/\/a\/api\//i, /\/usync/i, /\/sync/i],
    cookiePatterns: [/^khaos$/i, /^rpb$/i],
    basisLabel: "magnite_rubicon_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_ea85d9fc1696","vendorId":"ven_aa402315c565","serviceId":"svc_4fb52a341b4e"},
    entity: "OpenX Technologies, Inc.",
    vendor: "OpenX",
    product: "OpenX",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.openx\.net$/i],
    urlPatterns: [/\/w\/1\.0\//i, /\/sync/i],
    cookiePatterns: [/^i$/i, /^pd$/i],
    requireHostPatternForCookieMatch: true,
    suppressCookieMatchedHostname: true,
    basisLabel: "openx_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_84c2e8ca7de2","vendorId":"ven_7b60d2b55ecf","serviceId":"svc_ef6e92e725a6"},
    entity: "Index Exchange Inc.",
    vendor: "Index Exchange",
    product: "Index Exchange",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.casalemedia\.com$/i, /\.indexww\.com$/i],
    urlPatterns: [/\/casale/i, /\/sync/i, /\/usermatch/i, /\/(?:r|c|i)?rum\b/i, /\/openrtb\//i],
    cookiePatterns: [/^CMID$/i, /^CMPS$/i],
    basisLabel: "index_exchange_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_8ee9ab8abec7","vendorId":"ven_977144eb302e","serviceId":"svc_c996dc25382a"},
    entity: "Taboola.com Ltd.",
    vendor: "Taboola",
    product: "Taboola",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "content_recommendation"],
    confidence: 0.93,
    hostPatterns: [/(?:^|\.)taboola\.com$/i],
    urlPatterns: [/\/trc\//i, /\/libtrc\/[^/]+\/loader\.js\b/i, /\/pixel/i, /\/sync/i, /^https:\/\/beacon\.taboola\.com\//i],
    cookiePatterns: [/^t_gid$/i],
    storageKeyPatterns: [/^tbl[_-]/i, /^taboola\b/i],
    basisLabel: "taboola_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_07b43961baa7","vendorId":"ven_92435d31b261","serviceId":"svc_281671062863"},
    entity: "Integral Ad Science, Inc.",
    vendor: "Integral Ad Science",
    product: "Integral Ad Science",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_verification", "brand_safety"],
    confidence: 0.92,
    hostPatterns: [/\.adsafeprotected\.com$/i, /\.integralads\.com$/i, /\.iasds01\.com$/i],
    urlPatterns: [/\/(?:services|jload|dt|pixel|verify)\b/i],
    basisLabel: "integral_ad_science_endpoint",
  },
  {
    identity: {"entityId":"ent_f104789eebbc","vendorId":"ven_5ef51af080a2","serviceId":"svc_d87510e5cbb6"},
    entity: "TransUnion LLC",
    vendor: "TransUnion",
    product: "Neustar / AGKN",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution"],
    confidence: 0.91,
    hostPatterns: [/\.agkn\.com$/i],
    urlPatterns: [/\/(?:pixel|sync|getuid|uid|dnt|optout)?\b/i],
    basisLabel: "neustar_agkn_endpoint",
  },
  {
    identity: {"entityId":"ent_43ee3560d896","vendorId":"ven_9950a38dd5b8","serviceId":"svc_81f7b3b3edeb"},
    entity: "RevJet, Inc.",
    vendor: "RevJet",
    product: "RevJet",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement"],
    confidence: 0.9,
    hostPatterns: [/\.revjet\.com$/i],
    urlPatterns: [/\/(?:pixel|pix|track|event|sync)\b/i],
    basisLabel: "revjet_endpoint",
  },
  {
    identity: {"entityId":"ent_5a70e8cea8f0","vendorId":"ven_4083bdea0917","serviceId":"svc_86f72e045490"},
    entity: "Spotify AB",
    vendor: "Spotify",
    product: "Spotify Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement"],
    confidence: 0.9,
    hostPatterns: [/^pixel\.byspotify\.com$/i, /^pixels\.spotify\.com$/i],
    urlPatterns: [/\/(?:ping|v1\/config|v1\/ingest)\b/i],
    basisLabel: "spotify_pixel_endpoint",
  },
  {
    identity: {"entityId":"ent_7e986bfffa8e","vendorId":"ven_2102bce7ebe4","serviceId":"svc_68c79c82b7ca"},
    entity: "Medallia, Inc.",
    vendor: "Medallia",
    product: "Medallia Digital",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "customer_experience"],
    confidence: 0.9,
    hostPatterns: [/\.digital-cloud\.medallia\.com$/i, /\.medallia\.com$/i],
    urlPatterns: [/\/api\/web\/events\b/i, /\/analytics/i],
    basisLabel: "medallia_digital_analytics_endpoint",
  },
  {
    identity: {"entityId":"ent_e16206c91be3","vendorId":"ven_2ec196d6e80a","serviceId":"svc_07851125605c"},
    entity: "Attentive Mobile Inc.",
    vendor: "Attentive",
    product: "Attentive",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "analytics", "marketing_automation"],
    confidence: 0.9,
    hostPatterns: [/\.attentivemobile\.com$/i],
    urlPatterns: [/\/(?:ct-ev|events?|track|collect)\b/i],
    basisLabel: "attentive_event_endpoint",
  },
  {
    identity: {"entityId":"ent_dff1b032ff37","vendorId":"ven_cf31e910ce46","serviceId":"svc_c3d658ad32ed"},
    entity: "Klaviyo, Inc.",
    vendor: "Klaviyo",
    product: "Klaviyo",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "marketing_automation", "email_personalization"],
    confidence: 0.94,
    hostPatterns: [/^(?:static|static-tracking)\.klaviyo\.com$/i, /^(?:fast\.)?a\.klaviyo\.com$/i],
    urlPatterns: [/\/(?:onsite|media\/js|client|track|events?|api|ajax)\b/i, /\/klaviyo(?:\.js)?\b/i],
    cookiePatterns: [/^__kla_id$/i],
    storageKeyPatterns: [/^klaviyo/i, /^__kla/i],
    requireUrlPatternMatch: false,
    basisLabel: "klaviyo_marketing_automation_runtime",
  },
  {
    identity: {"entityId":"ent_b4aefbd8ef6c","vendorId":"ven_babd585b5148","serviceId":"svc_825ea49f7898"},
    entity: "Datability Solutions Private Limited",
    vendor: "iZooto",
    product: "iZooto Web Push",
    purpose: "advertising",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "marketing_automation", "push_notifications", "audience_engagement"],
    confidence: 0.91,
    hostPatterns: [/^(?:cdn|cdnimg|err|events?|api|l|www)\.izooto\.com$/i, /^izooto\.com$/i],
    urlPatterns: [/\/(?:scripts?\/)?(?:sdk\/)?izooto(?:\.min)?\.js\b/i, /\/(?:event|events|push|subscribe|notification|webpush)\b/i],
    storageKeyPatterns: [/^izooto/i, /^_izooto/i],
    basisLabel: "izooto_web_push_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_741da3642ba4"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Ads Pixel Library",
    purpose: "advertising",
    servicePurpose: "Advertising library",
    regulatoryRelevance: ["consent", "advertising", "advertising_library", "marketing_automation"],
    confidence: 0.93,
    hostPatterns: [/^(?:js\.)?hsadspixel\.net$/i, /\.hsadspixel\.net$/i],
    urlPatterns: [/\/(?:fb|pixels?)(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_ads_pixel_library_load",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_d0cd347d0234"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Ads Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "marketing_pixel", "advertising_collection", "marketing_automation"],
    confidence: 0.95,
    hostPatterns: [/^(?:js\.)?hsadspixel\.net$/i, /\.hsadspixel\.net$/i],
    urlPatterns: [/\/(?:events?|track|collect|pixel)(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_ads_collection_request",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_800257f6ce66"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Scripts",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "marketing_automation", "email_personalization", "third_party_runtime"],
    confidence: 0.93,
    hostPatterns: [/^(?:js|js-eu1)\.hs-scripts\.com$/i],
    urlPatterns: [/\/\d+\.js\b/i, /\/(?:shell|loader|embed|scripts?)\b/i],
    basisLabel: "hubspot_marketing_scripts_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_868137f85728"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Forms",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "lead_capture", "forms", "marketing_automation"],
    confidence: 0.92,
    hostPatterns: [/^forms(?:-[a-z0-9]+)?\.hscollectedforms\.net$/i],
    urlPatterns: [/\/(?:collected-forms|forms|submissions?|embed|v\d+)/i],
    basisLabel: "hubspot_forms_lead_capture_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_3fa84772b378"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot API",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "crm", "marketing_automation", "lead_capture"],
    confidence: 0.91,
    hostPatterns: [/^api(?:-[a-z0-9]+)?\.hubapi\.com$/i],
    urlPatterns: [/\/(?:contacts|forms|events|analytics|collector|track|crm|v\d+)/i],
    basisLabel: "hubspot_crm_marketing_api_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_31314b4487bf"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Banner",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "preference_tooling"],
    confidence: 0.92,
    hostPatterns: [/^js(?:-[a-z0-9]+)?\.hs-banner\.com$/i],
    urlPatterns: [/\/(?:banner|cookie|consent|preferences?)/i],
    basisLabel: "hubspot_banner_consent_preference_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_9b547f4290e0"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Analytics",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_analytics", "marketing_automation"],
    confidence: 0.93,
    hostPatterns: [/^js(?:-[a-z0-9]+)?\.hs-analytics\.net$/i],
    urlPatterns: [/\/(?:analytics|events?|track|collect|embed|v\d+)/i],
    basisLabel: "hubspot_marketing_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_caa7846b4ffb","vendorId":"ven_22b65197d868","serviceId":"svc_6348bf07d8c8"},
    entity: "BrightLine Partners LLC",
    vendor: "BrightLine",
    product: "BrightLine",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "video_ad_measurement", "ad_event_tracking"],
    confidence: 0.88,
    hostPatterns: [/\.brightline\.tv$/i],
    urlPatterns: [/\/(?:beacon|collect|collector|event|events|measure|measurement|metrics|pixel|track|tracking)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "brightline_video_ad_measurement_endpoint",
  },
  {
    identity: {"entityId":"ent_a057089670aa","vendorId":"ven_7e542e277fe6","serviceId":"svc_4369be9f5be9"},
    entity: "Outbrain Inc.",
    vendor: "Outbrain",
    product: "Outbrain",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "content_recommendation"],
    confidence: 0.93,
    hostPatterns: [/\.outbrain\.com$/i],
    urlPatterns: [/\/networkRedir/i, /\/pixels/i],
    cookiePatterns: [/^obuid$/i],
    basisLabel: "outbrain_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_f1257c380cf2","vendorId":"ven_f80aba3af485","serviceId":"svc_8d97f827cd35"},
    entity: "Pinterest, Inc.",
    vendor: "Pinterest",
    product: "Pinterest Tag",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^ct\.pinterest\.com$/i, /^s\.pinimg\.com$/i],
    urlPatterns: [/\/ct\.html/i, /\/ct\/core\.js/i],
    cookiePatterns: [/^_pin_unauth$/i],
    basisLabel: "pinterest_tag_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_8dc0787fe589","vendorId":"ven_f62dd36174a7","serviceId":"svc_600e8045b29d"},
    entity: "Reddit, Inc.",
    vendor: "Reddit",
    product: "Reddit Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^www\.redditstatic\.com$/i, /^alb\.reddit\.com$/i, /^pixel-config\.reddit\.com$/i],
    urlPatterns: [/\/pixel/i, /\/r\/pixel/i, /\/v\d+\/config\b/i],
    basisLabel: "reddit_pixel_endpoint",
  },
  {
    identity: {"entityId":"ent_0e487a8fc467","vendorId":"ven_ef1feb6654c0","serviceId":"svc_a246a27df504"},
    entity: "X Corp.",
    vendor: "X/Twitter",
    product: "X/Twitter Social Widgets",
    aliases: ["X Corp."],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "social_embed", "cross_site_tracking"],
    confidence: 0.93,
    hostPatterns: [/^platform\.twitter\.com$/i, /^syndication\.twitter\.com$/i, /^cdn\.syndication\.twimg\.com$/i],
    urlPatterns: [/\/widgets\.js\b/i, /\/embed/i, /\/timeline/i, /\/tweet/i],
    cookiePatterns: [/^personalization_id$/i, /^guest_id(?:_ads|_marketing)?$/i, /^muc_ads$/i],
    basisLabel: "twitter_social_widget_runtime",
  },
  {
    identity: {"entityId":"ent_0e487a8fc467","vendorId":"ven_ef1feb6654c0","serviceId":"svc_7df44b1021f5"},
    entity: "X Corp.",
    vendor: "X/Twitter",
    product: "Twitter Pixel",
    aliases: ["X Corp."],
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^static\.ads-twitter\.com$/i, /^analytics\.twitter\.com$/i, /^t\.co$/i],
    urlPatterns: [/\/uwt\.js\b/i, /\/i\/adsct\b/i, /\/adsct\b/i],
    basisLabel: "twitter_pixel_endpoint",
  },
  {
    identity: {"entityId":"ent_098a25c940d7","vendorId":"ven_9fdf551e85e9","serviceId":"svc_d33afda1a520"},
    entity: "Tapad, Inc.",
    vendor: "Tapad",
    product: "Tapad",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution", "cross_site_tracking"],
    confidence: 0.93,
    hostPatterns: [/\.tapad\.com$/i],
    urlPatterns: [/\/(?:pixel|idsync|sync)\b/i],
    cookiePatterns: [/^TapAd_DID$/i, /^TapAd_TS$/i],
    basisLabel: "tapad_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_309f2be0f059","vendorId":"ven_40a38c84227c","serviceId":"svc_60de7d9b1320"},
    entity: "Singular Labs, Inc.",
    vendor: "Singular",
    product: "Singular Attribution",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "attribution"],
    confidence: 0.93,
    hostPatterns: [/\.singular\.net$/i],
    urlPatterns: [/\/(?:api|sdk|event|events|launch)\b/i],
    basisLabel: "singular_attribution_endpoint",
  },
  {
    identity: {"entityId":"ent_8c5743b8bcc3","vendorId":"ven_7d01b9307332","serviceId":"svc_3e2000e600ab"},
    entity: "Snap Inc.",
    vendor: "Snap",
    product: "Snap Pixel",
    aliases: ["Snapchat Pixel"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^tr\.snapchat\.com$/i, /^sc-static\.net$/i],
    urlPatterns: [/\/scevent/i, /\/snap-pixel/i],
    cookiePatterns: [/^sc_at$/i],
    basisLabel: "snap_pixel_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_77d4f4329230","vendorId":"ven_5e57636b11b7","serviceId":"svc_2a51cde91fb3"},
    entity: "Quantcast Corporation",
    vendor: "Quantcast",
    product: "Quantcast Measure",
    purpose: "advertising",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "advertising", "audience_measurement"],
    confidence: 0.93,
    hostPatterns: [/\.quantserve\.com$/i, /\.quantcast\.com$/i],
    urlPatterns: [/\/pixel/i, /\/qacct/i],
    cookiePatterns: [/^mc$/i, /^d$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "quantcast_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_3ca93e81ac7e"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ad Traffic Quality",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "ad_quality", "fraud_prevention", "advertising"],
    confidence: 0.9,
    hostPatterns: [/^ep\d+\.adtrafficquality\.google$/i],
    urlPatterns: [/\/getconfig\/sodar\b/i, /\/pagead\/(?:sodar|gen_204)\b/i, /\/bg\/[^/]+\.js\b/i],
    basisLabel: "google_ad_traffic_quality_endpoint",
  },
  {
    identity: {"entityId":"ent_c6bffa688fd1","vendorId":"ven_d9ec4ccacefe","serviceId":"svc_7535a9f00ff7"},
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Zaraz",
    purpose: "tag_management",
    servicePurpose: "Tag management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^zaraz\./i],
    urlPatterns: [/\/cdn-cgi\/zaraz\//i],
    storageKeyPatterns: [/^_zaraz_/i],
    basisLabel: "cloudflare_zaraz_tag_management",
  },
  {
    identity: {"entityId":"ent_d377b536ddb4","vendorId":"ven_d5739e6f9849","serviceId":"svc_346843d8e937"},
    entity: "Segment.io, Inc.",
    vendor: "Segment",
    product: "Segment",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "customer_data_platform"],
    confidence: 0.94,
    hostPatterns: [/\.segment\.com$/i, /^api\.segment\.io$/i, /^cdn\.segment\.com$/i],
    urlPatterns: [/\/v1\/track/i, /\/analytics\.js/i],
    cookiePatterns: [/^ajs_/i],
    storageKeyPatterns: [/^ajs_/i],
    basisLabel: "segment_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_c8803189bf0f","vendorId":"ven_391f0aa28060","serviceId":"svc_3444b41b8a09"},
    entity: "RudderStack Inc.",
    vendor: "RudderStack",
    product: "RudderStack",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "customer_data_platform"],
    confidence: 0.93,
    hostPatterns: [/\.rudderstack\.com$/i],
    urlPatterns: [/\/v1\/track/i, /\/rudder-analytics/i],
    cookiePatterns: [/^rl_/i],
    storageKeyPatterns: [/^rl_/i],
    basisLabel: "rudderstack_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_ff5de0edcbb3","vendorId":"ven_c902109c8051","serviceId":"svc_615ad117f1bb"},
    entity: "Amplitude, Inc.",
    vendor: "Amplitude",
    product: "Amplitude Remote Configuration",
    purpose: "analytics",
    servicePurpose: "Analytics configuration",
    regulatoryRelevance: ["analytics", "configuration_connection"],
    confidence: 0.96,
    hostPatterns: [/^sr-client-cfg\.amplitude\.com$/i],
    urlPatterns: [/^https:\/\/sr-client-cfg\.amplitude\.com\/config(?:\/|\?|$)/i],
    basisLabel: "amplitude_remote_configuration_connection",
  },
  {
    identity: {"entityId":"ent_ff5de0edcbb3","vendorId":"ven_c902109c8051","serviceId":"svc_654976237213"},
    entity: "Amplitude, Inc.",
    vendor: "Amplitude",
    product: "Amplitude",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics"],
    confidence: 0.94,
    hostPatterns: [/\.amplitude\.com$/i],
    urlPatterns: [/\/2\/httpapi/i, /\/batch/i],
    cookiePatterns: [/^amplitude_id_/i, /^AMP_(?!MKTG_)[A-Za-z0-9_-]+$/i, /^AMP_MKTG_[A-Za-z0-9_-]+$/i],
    storageKeyPatterns: [/^amplitude_id_/i, /^AMP_(?!MKTG_)[A-Za-z0-9_-]+$/i, /^AMP_MKTG_[A-Za-z0-9_-]+$/i],
    basisLabel: "amplitude_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_94e53ad514f7","vendorId":"ven_4cc49549c279","serviceId":"svc_62bd18b81200"},
    entity: "Mixpanel, Inc.",
    vendor: "Mixpanel",
    product: "Mixpanel",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics"],
    confidence: 0.94,
    hostPatterns: [/\.mixpanel\.com$/i],
    urlPatterns: [/\/track/i, /\/engage/i],
    cookiePatterns: [/^mp_/i],
    storageKeyPatterns: [/^mp_/i],
    basisLabel: "mixpanel_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_d6b6c9c69eff","vendorId":"ven_60b7ef9ccf18","serviceId":"svc_a49305232d5c"},
    entity: "PostHog, Inc.",
    vendor: "PostHog",
    product: "PostHog",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics"],
    confidence: 0.93,
    hostPatterns: [/\.posthog\.com$/i],
    urlPatterns: [/\/e\/?$/i, /\/batch/i],
    cookiePatterns: [/^ph_/i, /posthog/i],
    storageKeyPatterns: [/^ph_/i, /posthog/i],
    basisLabel: "posthog_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_0de60cbe278d","vendorId":"ven_1e18c58558ef","serviceId":"svc_052d9ac72468"},
    entity: "New Relic, Inc.",
    vendor: "New Relic",
    product: "New Relic Browser",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring"],
    confidence: 0.92,
    hostPatterns: [/\.nr-data\.net$/i, /\.newrelic\.com$/i],
    urlPatterns: [/\/1\//i, /\/bam\//i],
    basisLabel: "new_relic_monitoring_endpoint",
  },
  {
    identity: {"entityId":"ent_005ede59d602","vendorId":"ven_3f51c0e2ea48","serviceId":"svc_054b50ba12af"},
    entity: "Akamai Technologies, Inc.",
    vendor: "Akamai",
    product: "Akamai mPulse",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring"],
    confidence: 0.92,
    hostPatterns: [/\.go-mpulse\.net$/i],
    urlPatterns: [/\/(?:boomerang|akamai|mPulse|beacon|rum)\b/i],
    basisLabel: "akamai_mpulse_monitoring_endpoint",
  },
  {
    identity: {"entityId":"ent_b8a32b243804","vendorId":"ven_815aec78c36b","serviceId":"svc_c629d5118d27"},
    entity: "HUMAN Security, Inc.",
    vendor: "HUMAN",
    product: "PerimeterX / HUMAN Bot Defense",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "bot_detection"],
    confidence: 0.92,
    hostPatterns: [/\.px-cloud\.net$/i],
    urlPatterns: [/\/(?:api|collector|px|xhr|init|captcha)\b/i],
    basisLabel: "human_perimeterx_security_endpoint",
  },
  {
    identity: {"entityId":"ent_68663ae47c3d","vendorId":"ven_7bf41eae56ff","serviceId":"svc_29a9baf1ee68"},
    entity: "Forter, Inc.",
    vendor: "Forter",
    product: "Forter Fraud Prevention",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "fraud_prevention"],
    confidence: 0.92,
    hostPatterns: [/\.forter\.com$/i],
    urlPatterns: [/\/(?:beacon|js|profile|v\d+)\b/i],
    basisLabel: "forter_security_endpoint",
  },
  {
    identity: {"entityId":"ent_9ff5fb4617c0","vendorId":"ven_9fa84909ce5c","serviceId":"svc_2d8e4012859a"},
    entity: "Sprinklr, Inc.",
    vendor: "Sprinklr",
    product: "Sprinklr Live Chat",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["customer_support"],
    confidence: 0.9,
    hostPatterns: [/^(?:prod\d+-)?live-chat\.sprinklr\.com$/i],
    urlPatterns: [/\/(?:live-chat|chat|messaging|widget)\b/i],
    basisLabel: "sprinklr_live_chat_endpoint",
  },
  {
    identity: {"entityId":"ent_c2abebe09a5e","vendorId":"ven_2ecfbcb28563","serviceId":"svc_afc11d2fd6de"},
    entity: "Datadog, Inc.",
    vendor: "Datadog",
    product: "Datadog RUM",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring"],
    confidence: 0.92,
    hostPatterns: [/\.datadoghq\.com$/i, /\.browser-intake-datadoghq\.com$/i, /^www\.datadoghq-browser-agent\.com$/i],
    urlPatterns: [/\/api\/v2\/rum/i, /\/v1\/input/i, /\/(?:[a-z0-9]+\/)?v\d+\/datadog-rum(?:-v\d+)?\.js\b/i, /\/datadog-rum(?:-[a-z0-9]+)?\.js\b/i],
    basisLabel: "datadog_rum_endpoint",
  },
  {
    identity: {"entityId":"ent_be65c6fb1de0","vendorId":"ven_19e86025c751","serviceId":"svc_d9a5ace531de"},
    entity: "Vercel Inc.",
    vendor: "Vercel",
    product: "Vercel Speed Insights",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "web_vitals", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^vitals\.vercel-insights\.com$/i],
    urlPatterns: [/^https:\/\/vitals\.vercel-insights\.com\/v1\/vitals\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "vercel_speed_insights_vitals",
  },
  {
    identity: {"entityId":"ent_fd441809cd03","vendorId":"ven_d60aa90fa57e","serviceId":"svc_a84a6ccf9ab5"},
    entity: "SpeedCurve Limited",
    vendor: "SpeedCurve",
    product: "SpeedCurve LUX RUM",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "web_vitals", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.speedcurve\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.speedcurve\.com\/js\/lux\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "speedcurve_lux_rum_script",
  },
  {
    identity: {"entityId":"ent_b7232f61a7cb","vendorId":"ven_811482b1b479","serviceId":"svc_c3db1d3bb4a8"},
    entity: "Wistia, Inc.",
    vendor: "Wistia",
    product: "Wistia Embedded Player",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^fast\.wistia\.com$/i],
    urlPatterns: [/^https:\/\/fast\.wistia\.com\/(?:player\.js|embed\/(?:[A-Za-z0-9]+\.js|medias\/[A-Za-z0-9]+\/swatch)|assets\/external\/E-v1\.js)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "wistia_embedded_player_runtime",
  },
  {
    identity: {"entityId":"ent_e761d503b4c9","vendorId":"ven_96c34b3b8a93","serviceId":"svc_74c7dae6f13f"},
    entity: "Flowplayer AB",
    vendor: "Flowplayer",
    product: "Flowplayer Native",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.flowplayer\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.flowplayer\.com\/releases\/native\/\d+\/(?:stable|canary|v\d+\.\d+\.\d+)\/(?:default\/)?flowplayer(?:\.min)?\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "flowplayer_native_runtime",
  },
  {
    identity: {"entityId":"ent_510b9958a217","vendorId":"ven_4358838cd53e","serviceId":"svc_1cb5a052f488"},
    entity: "Siteimprove A/S",
    vendor: "Siteimprove",
    product: "Siteimprove Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^siteimproveanalytics\.com$/i],
    urlPatterns: [/^https:\/\/siteimproveanalytics\.com\/js\/siteanalyze_\d+\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "siteimprove_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_a74982546647","vendorId":"ven_b5c3c27046ab","serviceId":"svc_2ca11d389da3"},
    entity: "6sense Insights, Inc.",
    vendor: "6sense",
    product: "6sense WebTag",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["analytics", "account_based_marketing", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:\d+|j)\.6sc\.co$/i],
    urlPatterns: [/^https:\/\/(?:\d+|j)\.6sc\.co\/(?:6si\.min\.js|j\/[0-9a-f-]+\.js)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "6sense_webtag_runtime",
  },
  {
    identity: {"entityId":"ent_98856c97bc73","vendorId":"ven_f2b8b3c7cdc6","serviceId":"svc_7725fda21bf1"},
    entity: "Monotype Imaging Holdings Inc.",
    vendor: "Monotype",
    product: "Monotype Web Fonts",
    purpose: "infrastructure",
    servicePurpose: "Font delivery",
    regulatoryRelevance: ["font_delivery", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^fast\.fonts\.net$/i],
    urlPatterns: [/^https:\/\/fast\.fonts\.net\/(?:cssapi\/[0-9a-f-]+\.css|jsapi(?:\/|$)|t\/\d+\.css)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "monotype_web_fonts_runtime",
  },
  {
    identity: {"entityId":"ent_8839694b121a","vendorId":"ven_65533ab4f3e9","serviceId":"svc_995947db7df3"},
    entity: "UserWay, Inc.",
    vendor: "UserWay",
    product: "UserWay Accessibility Widget",
    purpose: "infrastructure",
    servicePurpose: "Accessibility",
    regulatoryRelevance: ["accessibility_widget", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:cdn|api)\.userway\.org$/i],
    urlPatterns: [
      /^https:\/\/cdn\.userway\.org\/widget\.js\b/i,
      /^https:\/\/api\.userway\.org\/api\/v1\/tunings\/[A-Za-z0-9_-]+(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "userway_accessibility_widget",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_0dc085cde9c8"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Maps embed",
    purpose: "infrastructure",
    servicePurpose: "Embedded maps",
    regulatoryRelevance: ["maps", "location_services", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^(?:www\.)?google\.com$/i],
    urlPatterns: [/^https:\/\/(?:www\.)?google\.com\/maps\/embed(?:\/|\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_maps_iframe_embed",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_c1d270d90998"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Maps JavaScript API",
    purpose: "infrastructure",
    servicePurpose: "Maps / location services",
    regulatoryRelevance: ["maps", "location_services", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^maps\.googleapis\.com$/i],
    urlPatterns: [
      /^https:\/\/maps\.googleapis\.com\/maps\/api\/js(?:\?|$)/i,
      /^https:\/\/maps\.googleapis\.com\/maps-api-v3\/api\/js\/\d+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.js(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "google_maps_javascript_api_runtime",
  },
  {
    identity: {"entityId":"ent_b6f6fb20db55","vendorId":"ven_472da8991901","serviceId":"svc_45f829332dbb"},
    entity: "SpryMedia Ltd",
    vendor: "DataTables",
    product: "DataTables CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "table_ui", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^cdn\.datatables\.net$/i],
    urlPatterns: [
      /^https:\/\/cdn\.datatables\.net\/(?:\d+\.\d+\.\d+|[a-z][a-z0-9-]*\/\d+\.\d+\.\d+)\/(?:css|js)\/[A-Za-z0-9_.-]+\.(?:css|js)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "datatables_cdn_runtime",
  },
  {
    identity: {"entityId":"ent_a3c6b6fd103b","vendorId":"ven_39485213584b","serviceId":"svc_62984242770c"},
    entity: "Salesforce, Inc.",
    vendor: "Salesforce",
    product: "Salesforce Messaging for In-App and Web",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["customer_support", "messaging", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^[a-z0-9-]+\.my\.salesforce-scrt\.com$/i],
    urlPatterns: [
      /^https:\/\/[a-z0-9-]+\.my\.salesforce-scrt\.com\/embeddedservice\/v1\/(?:businesshours|embedded-service-config)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "salesforce_messaging_embedded_service_runtime",
  },
  {
    identity: {"entityId":"ent_9bfb91e5bf01","vendorId":"ven_77837aa017a4","serviceId":"svc_c836dc1b2e79"},
    entity: "Branch Metrics, Inc.",
    vendor: "Branch",
    product: "Branch Deep Linking and Attribution",
    aliases: ["Branch.io"],
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["attribution", "deep_linking", "identifier", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^app\.link$/i, /^api2\.branch\.io$/i],
    cookiePatterns: [/^_s$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "branch_deep_linking_attribution_runtime",
  },
  {
    identity: {"entityId":"ent_23159026abdc","vendorId":"ven_223ad63b4a38","serviceId":"svc_95894fda68f4"},
    entity: "WisePops SAS",
    vendor: "WisePops",
    product: "WisePops Onsite Campaigns",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["marketing_automation", "personalization", "analytics", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^(?:[a-z0-9-]+\.)?wisepops\.net$/i],
    cookiePatterns: [/^wisepops(?:_(?:visitor|visits|session))?$/i],
    basisLabel: "wisepops_campaign_runtime_or_cookie",
  },
  {
    identity: {"entityId":"ent_628b8ad916e8","vendorId":"ven_32baae51c5cb","serviceId":"svc_50c6faad804a"},
    entity: "Webflow, Inc.",
    vendor: "Webflow",
    product: "Webflow Hosted Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^cdn\.prod\.website-files\.com$/i],
    urlPatterns: [
      /^https:\/\/cdn\.prod\.website-files\.com\/(?:[0-9a-f]{20,}(?:\/|$)|gsap\/\d+\.\d+\.\d+\/(?:CustomEase|MotionPathPlugin|ScrollTrigger|SplitText|gsap)\.min\.js(?:\?|$))/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "webflow_hosted_assets_runtime",
  },
  {
    identity: {"entityId":"ent_8bbd70a41619","vendorId":"ven_f5a28e5d8496","serviceId":"svc_3da620fd0d82"},
    entity: "Trustpilot A/S",
    vendor: "Trustpilot",
    product: "Trustpilot TrustBox",
    purpose: "infrastructure",
    servicePurpose: "Reviews widget",
    regulatoryRelevance: ["embedded_content", "reviews_widget", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^widget\.trustpilot\.com$/i],
    urlPatterns: [
      /^https:\/\/widget\.trustpilot\.com\/(?:bootstrap\/v\d+\/tp\.widget\.bootstrap\.min\.js|trustboxes\/[A-Za-z0-9_-]+\/main\.js)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "trustpilot_trustbox_runtime",
  },
  {
    identity: {"entityId":"ent_1983e2d6b873","vendorId":"ven_07763de3ff77","serviceId":"svc_c2f44a64dd4b"},
    entity: "Quora, Inc.",
    vendor: "Quora",
    product: "Quora Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "conversion_tracking", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^a\.quora\.com$/i],
    urlPatterns: [/^https:\/\/a\.quora\.com\/qevents\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "quora_pixel_runtime",
  },
  {
    identity: {"entityId":"ent_f07f8f00fa6e","vendorId":"ven_6c624eb06c23","serviceId":"svc_d4119a904bd8"},
    entity: "Ensighten, Inc.",
    vendor: "Ensighten",
    product: "Ensighten Manage",
    purpose: "tag_management",
    servicePurpose: "Tag management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^nexus\.ensighten\.com$/i],
    urlPatterns: [
      /^https:\/\/nexus\.ensighten\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/(?:Bootstrap\.js|code\/[A-Za-z0-9_-]+|serverComponent\.php)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "ensighten_manage_runtime",
  },
  {
    identity: {"entityId":"ent_4d5dc8bae9fe","vendorId":"ven_c8e8388abbc4","serviceId":"svc_9618643c7b38"},
    entity: "TrafficJunky Inc.",
    vendor: "TrafficJunky",
    product: "TrafficJunky Advertising",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_sync", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^static\.trafficjunky\.com$/i],
    urlPatterns: [
      /^https:\/\/static\.trafficjunky\.com\/(?:ab\/ads_test\.js|invocation\/(?:embeddedads|idsync)\/production\/[A-Za-z0-9_.-]+\.js)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "trafficjunky_advertising_runtime",
  },
  {
    identity: {"entityId":"ent_19f82b78e929","vendorId":"ven_a8d1956b0f19","serviceId":"svc_7ef5835755a8"},
    entity: "SHE Media, LLC",
    vendor: "SHE Media",
    product: "BlogHer Ads",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_monetization", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^ads\.blogherads\.com$/i],
    urlPatterns: [
      /^https:\/\/ads\.blogherads\.com\/(?:static\/(?:blogherads\.js|chunks\/[A-Za-z0-9_.-]+\.js)|sk\/\d+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/header\.js)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "blogher_ads_runtime",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_1132db27c16e"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Programmable Search Engine",
    purpose: "infrastructure",
    servicePurpose: "Site search",
    regulatoryRelevance: ["embedded_search", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^(?:cse|www)\.google\.com$/i],
    urlPatterns: [
      /^https:\/\/cse\.google\.com\/(?:cse(?:\/cse)?\.js|adsense\/search\/async-ads\.js)(?:\?|$)/i,
      /^https:\/\/www\.google\.com\/cse\/(?:cse\.js|static\/(?:css|element|images)\/[^?#]+)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "google_programmable_search_runtime",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_bd499319f7b6"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Hosted Libraries",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "script_delivery", "style_delivery", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^ajax\.googleapis\.com$/i],
    urlPatterns: [/^https:\/\/ajax\.googleapis\.com\/ajax\/libs\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_hosted_libraries_cdn",
  },
  {
    identity: {"entityId":"ent_960edad00018","vendorId":"ven_5766c622b94f","serviceId":"svc_0bf55ffe11e3"},
    entity: "OpenJS Foundation",
    vendor: "jQuery",
    product: "jQuery CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "script_delivery", "style_delivery", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^code\.jquery\.com$/i],
    urlPatterns: [
      /^https:\/\/code\.jquery\.com\/(?:jquery-[0-9.]+(?:\.slim)?(?:\.min)?\.js|ui\/[0-9.]+\/(?:jquery-ui(?:\.min)?\.js|themes\/[A-Za-z0-9_-]+\/jquery-ui(?:\.min)?\.css))(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "jquery_official_cdn",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_868137f85728"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Forms",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "lead_capture", "forms", "marketing_automation"],
    confidence: 0.96,
    hostPatterns: [/^js\.hsforms\.net$/i, /^js\.hscollectedforms\.net$/i, /^forms(?:-[a-z0-9]+)?\.hsforms\.com$/i],
    urlPatterns: [
      /^https:\/\/js\.hsforms\.net\/forms\/(?:embed\/v2|v2)\.js(?:\?|$)/i,
      /^https:\/\/js\.hscollectedforms\.net\/collectedforms\.js(?:\?|$)/i,
      /^https:\/\/forms(?:-[a-z0-9]+)?\.hsforms\.com\/embed\/v3\/(?:form\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/json|counters\.gif)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_forms_embed_runtime",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_e2b6db8813da"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Dynamic Media / Scene7",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^s7[a-z0-9-]*\.scene7\.com$/i],
    urlPatterns: [/^https:\/\/s7[a-z0-9-]*\.scene7\.com\/is\/(?:image|content)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./:-]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_dynamic_media_scene7_delivery",
  },
  {
    identity: {"entityId":"ent_014d159dd867","vendorId":"ven_d08a11c352e7","serviceId":"svc_1503685ce801"},
    entity: "DataDome SAS",
    vendor: "DataDome",
    product: "DataDome Challenge",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^(?:static|geo|ct)\.captcha-delivery\.com$/i],
    urlPatterns: [
      /^https:\/\/static\.captcha-delivery\.com\/(?:captcha\/assets\/|common\/(?:Logo-|fonts\/))/i,
      /^https:\/\/geo\.captcha-delivery\.com\/(?:captcha|interstitial)\/?(?:\?|$)/i,
      /^https:\/\/ct\.captcha-delivery\.com\/(?:c|i)\.js(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "datadome_challenge_runtime",
  },
  {
    identity: {"entityId":"ent_7c06b50ef95a","vendorId":"ven_f91cfe82e4cc","serviceId":"svc_b007bf3ed110"},
    entity: "Automattic Inc.",
    vendor: "WordPress.com",
    product: "Jetpack Stats",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^stats\.wp\.com$/i],
    urlPatterns: [/^https:\/\/stats\.wp\.com\/(?:w|e-\d+)\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "jetpack_stats_runtime",
  },
  {
    identity: {"entityId":"ent_b8003a48d5be","vendorId":"ven_295d9471c73c","serviceId":"svc_d241d7ddbf2e"},
    entity: "Parse.ly, Inc.",
    vendor: "Parse.ly",
    product: "Parse.ly Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^(?:cdn|experiments)\.parsely\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.parsely\.com\/keys\/[^/]+\/p\.js\b/i, /^https:\/\/experiments\.parsely\.com\/vip-experiments\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "parsely_tracking_script",
  },
  {
    identity: {"entityId":"ent_5cc4a6af01c6","vendorId":"ven_71191fef3288","serviceId":"svc_0bd7da5b630e"},
    entity: "mParticle, Inc.",
    vendor: "mParticle",
    product: "mParticle Web SDK",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["analytics", "customer_data_platform", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^jssdkcdns\.mparticle\.com$/i],
    urlPatterns: [/^https:\/\/jssdkcdns\.mparticle\.com\/js\/v2(?:\/[^/]+)?\/mparticle\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "mparticle_web_sdk",
  },
  {
    identity: {"entityId":"ent_1684381c3935","vendorId":"ven_e9f2d86eafe7","serviceId":"svc_3ce048a95179"},
    entity: "Functional Software, Inc.",
    vendor: "Sentry",
    product: "Sentry",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "telemetry", "diagnostics"],
    confidence: 0.92,
    hostPatterns: [
      /^sentry\.io$/i,
      /^(?:.+\.)sentry\.io$/i,
      /^(?:.+\.)ingest\.[^.]+\.sentry\.io$/i,
    ],
    urlPatterns: [/\/api\/\d+\/envelope/i, /\/api\/\d+\/store/i],
    basisLabel: "sentry_monitoring_endpoint",
  },
  {
    identity: {"entityId":"ent_005ede59d602","vendorId":"ven_3f51c0e2ea48","serviceId":"svc_c097395388a6"},
    entity: "Akamai Technologies, Inc.",
    vendor: "Akamai",
    product: "Akamai Bot Manager / Edge",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "infrastructure"],
    confidence: 0.9,
    cookiePatterns: [/^_abck$/i, /^bm_sz$/i, /^bm_sv$/i, /^bm_mi$/i, /^ak_bmsc$/i, /^akaas_/i, /^akamai_/i],
    basisLabel: "akamai_security_cookie",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_84e490a5370b"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Analytics",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics"],
    confidence: 0.96,
    hostPatterns: [/^google-analytics\.com$/i, /^www\.google-analytics\.com$/i, /^ssl\.google-analytics\.com$/i, /^region\d+\.google-analytics\.com$/i],
    urlPatterns: [
      /^https:\/\/(?:www|region\d+)\.google-analytics\.com\/(?:g\/collect|collect|j\/collect)\b/i,
      /^https:\/\/(?:www|ssl)\.google-analytics\.com\/analytics\.js\b/i,
    ],
    cookiePatterns: [/^_ga(?:_.+)?$/i, /^_gid$/i, /^_gat/i],
    storageKeyPatterns: [/^_ga(?:_.+)?$/i, /^_gid$/i, /^_gat/i],
    basisLabel: "ga_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_e0cf701651e0"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Publisher Tag",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "publisher_ad_server"],
    confidence: 0.95,
    hostPatterns: [/^securepubads\.g\.doubleclick\.net$/i, /^www\.googletagservices\.com$/i],
    urlPatterns: [/\/tag\/js\/gpt\.js\b/i, /\/gampad\//i],
    basisLabel: "google_publisher_tag_endpoint",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_a6bdbb4fc8f8"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google AdSense",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery"],
    confidence: 0.95,
    hostPatterns: [/^pagead2\.googlesyndication\.com$/i],
    urlPatterns: [/\/pagead\/js\/adsbygoogle\.js\b/i, /\/pagead\//i],
    basisLabel: "google_adsense_endpoint",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_a6bdbb4fc8f8"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google AdSense",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^www\.google\.com$/i],
    urlPatterns: [/^https:\/\/www\.google\.com\/adsense\/(?:domains\/caf|search\/ads)\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_adsense_search_and_domain_scripts",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_19ddbb9af87c"},
    entity: "Google LLC",
    vendor: "Google",
    product: "DoubleClick Floodlight",
    aliases: ["DoubleClick / Floodlight"],
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement", "conversion_tracking"],
    confidence: 0.94,
    hostPatterns: [/^fls\.doubleclick\.net$/i, /^ad\.doubleclick\.net$/i],
    urlPatterns: [/\/activityi?\b/i, /\/ddm\/activity\//i],
    basisLabel: "doubleclick_floodlight_endpoint",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_75fe585b7662"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    aliases: ["Google Ads", "DoubleClick"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.96,
    // pagead2.googlesyndication.com is owned by the canonical AdSense rule above.
    // Keeping it here produces two product identities for the same endpoint.
    hostPatterns: [/\.doubleclick\.net$/i, /^googleads\.g\.doubleclick\.net$/i],
    urlPatterns: [
      /\/pagead\//i,
      /\/gampad\//i,
      // Floodlight activity URLs belong to the more specific rule above.
      /\/pcs\/activeview\b/i,
    ],
    cookiePatterns: [/^IDE$/i, /^test_cookie$/i],
    storageKeyPatterns: [/^_gcl_/i],
    basisLabel: "doubleclick_ad_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_75fe585b7662"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    aliases: ["Google Ads", "DoubleClick"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^www\.google\.com$/i],
    urlPatterns: [/^https:\/\/www\.google\.com\/(?:pagead\/|ads\/|aclk\b|.*conversion)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_ads_measurement_endpoint",
  },
  {
    identity: {"entityId":"ent_f2a82736f68e","vendorId":"ven_043da4442d9b","serviceId":"svc_ac2d2705d0d1"},
    entity: "Meta Platforms, Inc.",
    vendor: "Meta",
    product: "Meta Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.96,
    hostPatterns: [/^connect\.facebook\.net$/i, /^www\.facebook\.com$/i],
    urlPatterns: [
      /^https:\/\/www\.facebook\.com\/tr(?:[/?#]|$)/i,
      /^https:\/\/connect\.facebook\.net\/(?:[^/?#]+\/)?fbevents\.js(?:[?#]|$)/i,
    ],
    allowUrlPatternWithoutHostMatch: true,
    cookiePatterns: [/^_fbp$/i, /^_fbc$/i],
    storageKeyPatterns: [/^_fbp$/i, /^_fbc$/i],
    requireUrlPatternMatch: true,
    basisLabel: "meta_pixel_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_f2a82736f68e","vendorId":"ven_6a03b1eeab38","serviceId":"svc_ac21cb004610"},
    entity: "Meta Platforms, Inc.",
    vendor: "Facebook",
    product: "Facebook Page Plugin",
    purpose: "infrastructure",
    servicePurpose: "Social media embed",
    regulatoryRelevance: ["embedded_content", "social_embed", "social_media", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^www\.facebook\.com$/i],
    urlPatterns: [/^https:\/\/www\.facebook\.com\/plugins\/page\.php(?:[?#]|$)/i],
    allowUrlPatternWithoutHostMatch: true,
    requireUrlPatternMatch: true,
    basisLabel: "facebook_page_plugin_embed",
  },
  {
    identity: {"entityId":"ent_02b1b951db45","vendorId":"ven_3e5a5b1911ca","serviceId":"svc_ac4e7a5227e2"},
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Microsoft Clarity",
    purpose: "session_replay",
    servicePurpose: "Session replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.95,
    hostPatterns: [/^(?:www|scripts|n|f|c|i)\.clarity\.ms$/i, /^clarity\.ms$/i],
    urlPatterns: [/^https:\/\/(?:www|scripts|n|f|i)\.clarity\.ms\/(?:tag|collect|c\.gif)\b/i, /^https:\/\/c\.clarity\.ms\/c\.gif\b/i],
    cookiePatterns: [/^_clck$/i, /^_clsk$/i],
    storageKeyPatterns: [/^_clck$/i, /^_clsk$/i],
    basisLabel: "clarity_script_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_02b1b951db45","vendorId":"ven_3e5a5b1911ca","serviceId":"svc_ac4e7a5227e2"},
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Microsoft Clarity",
    purpose: "session_replay",
    servicePurpose: "Session replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay", "cross_site_tracking"],
    confidence: 0.98,
    hostPatterns: [/(?:^|\.)clarity\.ms$/i],
    cookiePatterns: [/^CLID$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "clarity_third_party_clid_cookie",
  },
  {
    identity: {"entityId":"ent_02b1b951db45","vendorId":"ven_3e5a5b1911ca","serviceId":"svc_6a5528eb390c"},
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Microsoft Identity Synchronization",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "identifier_sync", "cross_site_tracking", "advertising_measurement"],
    confidence: 0.96,
    hostPatterns: [/(?:^|\.)bing\.com$/i, /(?:^|\.)clarity\.ms$/i],
    urlPatterns: [/^https:\/\/c\.bing\.com\/c\.gif(?:\?|$)/i],
    cookiePatterns: [/^(?:ANONCHK|MR|MUID|SM)$/i],
    requireHostPatternForCookieMatch: true,
    requireUrlPatternMatch: true,
    basisLabel: "microsoft_bing_identity_sync_pixel",
  },
  {
    identity: {"entityId":"ent_02b1b951db45","vendorId":"ven_3e5a5b1911ca","serviceId":"svc_b00591af0c94"},
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Microsoft browser identity support",
    purpose: "unknown",
    servicePurpose: "Unknown",
    regulatoryRelevance: ["consent", "browser_identifier", "purpose_review_required"],
    confidence: 0.9,
    hostPatterns: [/(?:^|\.)bing\.com$/i],
    cookiePatterns: [/^SRM_B$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "microsoft_bing_srm_b_cookie_owner_only",
  },
  {
    identity: {"entityId":"ent_1426519b043f","vendorId":"ven_d468b10758fc","serviceId":"svc_a15b06b1caef"},
    entity: "Hotjar Ltd",
    vendor: "Hotjar",
    product: "Hotjar",
    purpose: "session_replay",
    servicePurpose: "Session replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.95,
    hostPatterns: [/\.hotjar\.com$/i, /\.hotjar\.io$/i],
    urlPatterns: [/\/c\/hotjar-/i, /\/api\/v2\/client\/sites\//i],
    cookiePatterns: [/^_hj/i],
    storageKeyPatterns: [/^_hj/i],
    basisLabel: "hotjar_script_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_f6de818ab901","vendorId":"ven_8d61e9e3c23a","serviceId":"svc_fec18582701c"},
    entity: "FullStory, Inc.",
    vendor: "FullStory",
    product: "FullStory",
    purpose: "session_replay",
    servicePurpose: "Session replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.95,
    hostPatterns: [/\.fullstory\.com$/i, /^rs\.fullstory\.com$/i, /^edge\.fullstory\.com$/i, /\.fullstoryedge\.com$/i],
    urlPatterns: [/\/s\/fs\.js\b/i, /\/rec\//i, /\/s\/settings\//i],
    cookiePatterns: [/^fs_uid$/i],
    storageKeyPatterns: [/^fs_uid$/i, /^FS_/],
    basisLabel: "fullstory_script_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_199da4f22bee","vendorId":"ven_7d252d7df941","serviceId":"svc_bb928ab6a14d"},
    entity: "TikTok Technology Limited",
    vendor: "TikTok",
    product: "TikTok Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.95,
    hostPatterns: [/^analytics\.tiktok\.com$/i, /^business-api\.tiktok\.com$/i],
    urlPatterns: [/\/i18n\/pixel\/events\.js\b/i, /\/api\/v2\/pixel\//i],
    cookiePatterns: [/^_ttp$/i, /^ttclid$/i],
    storageKeyPatterns: [/^_ttp$/i, /^ttclid$/i],
    basisLabel: "tiktok_pixel_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_3ee0b5177739","vendorId":"ven_cce9dd548420","serviceId":"svc_358664959597"},
    entity: "LinkedIn Corporation",
    vendor: "LinkedIn",
    product: "LinkedIn Insight Tag",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.95,
    hostPatterns: [/^snap\.licdn\.com$/i],
    urlPatterns: [/\/li\.lms-analytics\/insight\.min\.js\b/i, /\/collect\//i],
    cookiePatterns: [/^bcookie$/i, /^li_sugr$/i, /^bscookie$/i],
    basisLabel: "linkedin_insight_endpoint_or_cookie",
  },
  {
    identity: {"entityId":"ent_3ee0b5177739","vendorId":"ven_cce9dd548420","serviceId":"svc_ab2c715ef6da"},
    entity: "LinkedIn Corporation",
    vendor: "LinkedIn",
    product: "LinkedIn Ads Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking", "ad_measurement"],
    confidence: 0.95,
    hostPatterns: [/^px\.ads\.linkedin\.com$/i],
    urlPatterns: [/\/(?:collect|db_sync|setuid|wa\/?)\b/i],
    basisLabel: "linkedin_ads_pixel_endpoint",
  },
  {
    identity: {"entityId":"ent_49667358bbaf","vendorId":"ven_97ee6fd4e1fe","serviceId":"svc_230b10f7628f"},
    entity: "OneTrust, LLC",
    vendor: "OneTrust",
    product: "OneTrust CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.95,
    hostPatterns: [/\.onetrust\.com$/i, /^cdn\.cookielaw\.org$/i],
    urlPatterns: [/\/scripttemplates\/otSDKStub\.js\b/i],
    cookiePatterns: [/^OptanonConsent$/i, /^OptanonAlertBoxClosed$/i],
    globalPatterns: [/^OneTrust$/i, /^Optanon$/i, /^OptanonWrapper$/i],
    storageKeyPatterns: [/^OptanonConsent$/i, /^OptanonAlertBoxClosed$/i],
    domSelectorPatterns: [/^#onetrust-banner-sdk$/i, /^#onetrust-consent-sdk$/i, /^\.ot-sdk-container$/i],
    basisLabel: "onetrust_cmp_script_or_cookie",
  },
  {
    identity: {"entityId":"ent_b877c8057f45","vendorId":"ven_19137695b23e","serviceId":"svc_ede9331f0c3a"},
    entity: "Consentmanager",
    vendor: "Consentmanager",
    product: "Consentmanager CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.94,
    hostPatterns: [/^cdn\.consentmanager\.net$/i],
    urlPatterns: [/\/(?:delivery|cmp|choice|consent)/i],
    basisLabel: "consentmanager_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_45fdad1e7962","vendorId":"ven_fec78ab340fc","serviceId":"svc_908d37930594"},
    entity: "Stripe, Inc.",
    vendor: "Stripe",
    product: "Stripe.js",
    purpose: "security",
    servicePurpose: "Payment processors",
    regulatoryRelevance: ["payment_processing", "fraud_prevention", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^js\.stripe\.com$/i, /^m\.stripe\.network$/i],
    urlPatterns: [/\/v3\b/i, /\/inner\.html\b/i],
    globalPatterns: [/^Stripe$/i],
    basisLabel: "stripe_js_payment_runtime",
  },
  {
    identity: {"entityId":"ent_eb11d9612170","vendorId":"ven_2b2ace8f0d60","serviceId":"svc_223d6f758020"},
    entity: "jsDelivr",
    vendor: "jsDelivr",
    product: "jsDelivr CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^cdn\.jsdelivr\.net$/i],
    basisLabel: "jsdelivr_cdn_host",
  },
  {
    identity: {"entityId":"ent_c6bffa688fd1","vendorId":"ven_dda291efda4a","serviceId":"svc_9c097781c146"},
    entity: "Cloudflare, Inc.",
    vendor: "cdnjs",
    product: "cdnjs CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "script_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdnjs\.cloudflare\.com$/i],
    basisLabel: "cdnjs_cdn_host",
  },
  {
    identity: {"entityId":"ent_c6bffa688fd1","vendorId":"ven_a86b4df6afb7","serviceId":"svc_d2a0a47ab738"},
    entity: "Cloudflare, Inc.",
    vendor: "BootstrapCDN",
    product: "BootstrapCDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "script_delivery", "style_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^maxcdn\.bootstrapcdn\.com$/i, /^stackpath\.bootstrapcdn\.com$/i],
    basisLabel: "bootstrapcdn_host",
  },
  {
    identity: {"entityId":"ent_31c0793c7b6c","vendorId":"ven_30f8c31187a5","serviceId":"svc_30edf95d4d3c"},
    entity: "npm, Inc.",
    vendor: "unpkg",
    product: "unpkg CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "script_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^unpkg\.com$/i],
    basisLabel: "unpkg_cdn_host",
  },
  {
    identity: {"entityId":"ent_0ef21e006afd","vendorId":"ven_a3c5c558c918","serviceId":"svc_6baf7a5879b9"},
    entity: "Tilda Publishing",
    vendor: "Tilda",
    product: "Tilda CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "script_delivery", "style_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.tildacdn\.com$/i],
    basisLabel: "tilda_cdn_host",
  },
  {
    identity: {"entityId":"ent_4de26ead61ae","vendorId":"ven_45bd755c9c4b","serviceId":"svc_1b6cdc799bd9"},
    entity: "Amazon Web Services, Inc.",
    vendor: "Amazon CloudFront",
    product: "CloudFront Distribution",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "content_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^d[a-z0-9]{8,}\.cloudfront\.net$/i, /\.cloudfront\.net$/i],
    basisLabel: "aws_cloudfront_distribution_host",
  },
  {
    identity: {"entityId":"ent_2de43de76943","vendorId":"ven_5a11f02b27f8","serviceId":"svc_9c88766d4cb3"},
    entity: "DatoCMS",
    vendor: "DatoCMS",
    product: "DatoCMS Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery"],
    confidence: 0.92,
    hostPatterns: [/^www\.datocms-assets\.com$/i],
    basisLabel: "datocms_assets_cdn_host",
  },
  {
    identity: {"entityId":"ent_2dff983ccf7c","vendorId":"ven_cdb9a6b820a7","serviceId":"svc_95124a686a90"},
    entity: "Contentful GmbH",
    vendor: "Contentful",
    product: "Contentful Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^images\.ctfassets\.net$/i, /^assets\.ctfassets\.net$/i, /\.ctfassets\.net$/i],
    basisLabel: "contentful_assets_cdn_host",
  },
  {
    identity: {"entityId":"ent_5d38bfb460c5","vendorId":"ven_6be772247d22","serviceId":"svc_3ab3ce03b2bc"},
    entity: "Framer B.V.",
    vendor: "Framer",
    product: "Framer Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^framerusercontent\.com$/i, /\.framerusercontent\.com$/i],
    basisLabel: "framer_static_assets_cdn_host",
  },
  {
    identity: {"entityId":"ent_a3c6b6fd103b","vendorId":"ven_39485213584b","serviceId":"svc_6c5eafcd6e8d"},
    entity: "Salesforce, Inc.",
    vendor: "Salesforce",
    product: "Salesforce Static Assets",
    purpose: "infrastructure",
    servicePurpose: "Font delivery",
    regulatoryRelevance: ["cdn", "font_delivery", "static_assets", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^sfdcstatic\.com$/i, /\.sfdcstatic\.com$/i],
    basisLabel: "salesforce_static_assets_cdn_host",
  },
  {
    identity: {"entityId":"ent_b3052e9ea6a0","vendorId":"ven_4bdf9bc904e5","serviceId":"svc_6fff3adf750b"},
    entity: "Mux, Inc.",
    vendor: "Mux",
    product: "Mux Image",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery"],
    confidence: 0.92,
    hostPatterns: [/^image\.mux\.com$/i],
    basisLabel: "mux_image_media_delivery_host",
  },
  {
    identity: {"entityId":"ent_bfec64a4340d","vendorId":"ven_0a99e38dd32f","serviceId":"svc_16fc2e7f923c"},
    entity: "Piano Software Inc.",
    vendor: "Piano",
    product: "Piano (Tinypass)",
    purpose: "infrastructure",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["consent", "personalization", "paywall", "subscription", "cdn", "script_delivery", "supporting_assets", "audience_management"],
    confidence: 0.95,
    hostPatterns: [/\.piano\.io$/i, /\.tinypass\.com$/i],
    urlPatterns: [/\/api\//i, /\/xbuilder\//i, /\/tinypass/i, /\/(?:assets?|scripts?|resources?)\//i],
    cookiePatterns: [/^_pctx$/i, /^_pcid$/i, /^_pprv$/i, /^pa_user$/i, /^pa_privacy$/i, /^pnes_/i, /^pcid$/i],
    basisLabel: "piano_tinypass_paywall_personalization_runtime",
  },
  {
    identity: {"entityId":"ent_bfec64a4340d","vendorId":"ven_0a99e38dd32f","serviceId":"svc_56dd161955db"},
    entity: "Piano Software Inc.",
    vendor: "Piano",
    product: "Cxense",
    purpose: "analytics",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["consent", "personalization", "audience_management", "analytics"],
    confidence: 0.93,
    hostPatterns: [/\.cxense\.com$/i],
    urlPatterns: [/\/cx\.js\b/i, /\/cce\//i, /\/p1\.js\b/i],
    basisLabel: "cxense_personalization_runtime",
  },
  {
    identity: {"entityId":"ent_68471a8f6a59","vendorId":"ven_5642d0785d2e","serviceId":"svc_41ff88f88bb4"},
    entity: "Optimizely, Inc.",
    vendor: "Optimizely",
    product: "Optimizely",
    purpose: "analytics",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["consent", "experimentation", "ab_testing", "personalization"],
    confidence: 0.93,
    hostPatterns: [/\.optimizely\.com$/i],
    urlPatterns: [/\/js\/\d+\.js\b/i],
    cookiePatterns: [/^optimizely/i],
    storageKeyPatterns: [/^optimizely/i],
    basisLabel: "optimizely_experimentation_runtime",
  },
  {
    identity: {"entityId":"ent_ad54cd7f206c","vendorId":"ven_940972e767db","serviceId":"svc_17de2e8c09d3"},
    entity: "Wingify Software Pvt. Ltd.",
    vendor: "VWO",
    product: "VWO consent state",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent", "consent_management"],
    confidence: 0.99,
    cookiePatterns: [/^_vwo_consent$/i],
    basisLabel: "vwo_exact_consent_state_cookie",
  },
  {
    identity: {"entityId":"ent_ad54cd7f206c","vendorId":"ven_940972e767db","serviceId":"svc_17ca122a811a"},
    entity: "Wingify Software Pvt. Ltd.",
    vendor: "VWO",
    product: "Visual Website Optimizer",
    purpose: "analytics",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["consent", "analytics", "experimentation", "ab_testing", "personalization"],
    confidence: 0.92,
    hostPatterns: [/\.visualwebsiteoptimizer\.com$/i, /^dev\.visualwebsiteoptimizer\.com$/i],
    urlPatterns: [/\/(?:j\.php|track|collect|settings|visitor|event)\b/i],
    cookiePatterns: [/^_vis_opt_/i, /^_vwo/i],
    storageKeyPatterns: [/^_vwo/i, /^vwo/i],
    basisLabel: "vwo_experimentation_runtime",
  },
  {
    identity: {"entityId":"ent_c6bffa688fd1","vendorId":"ven_d9ec4ccacefe","serviceId":"svc_6aba5550ede0"},
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Bot Management",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention"],
    confidence: 0.93,
    cookiePatterns: [/^__cf_bm$/i, /^_cfuvid$/i, /^cf_clearance$/i, /^cf_chl_/i],
    suppressCookieMatchedHostname: true,
    basisLabel: "cloudflare_bot_management_cookie",
  },
  {
    identity: {"entityId":"ent_1a007e52f2d1","vendorId":"ven_afd3cfb36b22","serviceId":"svc_08ae6db04e12"},
    entity: "OpenAI, L.L.C.",
    vendor: "OpenAI",
    product: "OpenAI advertising measurement",
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising_measurement", "conversion_measurement", "event_tracking"],
    confidence: 0.98,
    hostPatterns: [/^bzrcdn\.openai\.com$/i, /^bzr\.openai\.com$/i],
    urlPatterns: [
      /^https:\/\/bzrcdn\.openai\.com\/sdk\/oaiq\.min\.js(?:[?#]|$)/i,
      /^https:\/\/bzr\.openai\.com\/(?:[?#]|$)/i,
      /^https:\/\/bzr\.openai\.com\/(?:event|events|collect|track)(?:[/?#]|$)/i,
    ],
    basisLabel: "openai_advertising_measurement_runtime",
  },
  {
    identity: {"entityId":"ent_d78d15183f34","vendorId":"ven_6e7e8382f76f","serviceId":"svc_819794210d06"},
    entity: "Comscore, Inc.",
    vendor: "ScorecardResearch / Comscore",
    product: "ScorecardResearch",
    aliases: ["Scorecard Research"],
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "advertising_measurement", "market_research"],
    confidence: 0.92,
    hostPatterns: [/(?:^|\.)scorecardresearch\.com$/i],
    urlPatterns: [/\/b\?/i, /\/p\?/i],
    cookiePatterns: [/^UID$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "scorecardresearch_audience_measurement_endpoint",
  },
  {
    identity: {"entityId":"ent_d22b7c10a6cc","vendorId":"ven_f57cc309672a","serviceId":"svc_ad01c980e08d"},
    entity: "Bombora, Inc.",
    vendor: "Bombora",
    product: "Bombora Visitor Insights",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_intelligence", "b2b_intent_data"],
    confidence: 0.91,
    hostPatterns: [/\.ml314\.com$/i],
    urlPatterns: [/\/taglw\.js\b/i, /\/Home\/Index\b/i],
    cookiePatterns: [/^(pi|tp|u)$/i],
    requireHostPatternForCookieMatch: true,
    basisLabel: "bombora_ml314_visitor_insights",
  },
  {
    identity: {"entityId":"ent_a9151fb5220f","vendorId":"ven_4bb03629233e","serviceId":"svc_ff14e59e8f8c"},
    entity: "ZoomInfo Technologies LLC",
    vendor: "ZoomInfo",
    product: "ZoomInfo WebSights",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "b2b_intent_data", "lead_enrichment", "cross_site_tracking"],
    confidence: 0.91,
    hostPatterns: [/\.zoominfo\.com$/i, /^zoominfo\.com$/i, /\.zi-scripts\.com$/i],
    urlPatterns: [/\/(?:pixel|collect|track|analytics|websights|visitor|tag)\b/i, /\/zi(?:-tag)?\.js\b/i],
    basisLabel: "zoominfo_websights_b2b_tracking_endpoint",
  },
  {
    identity: {"entityId":"ent_d1b988bac823","vendorId":"ven_7f33d8e31621","serviceId":"svc_8d0252778260"},
    entity: "Claydar, Inc.",
    vendor: "Claydar",
    product: "Claydar",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_analytics", "lead_enrichment", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.claydar\.com$/i, /^api\.claydar\.com$/i],
    urlPatterns: [/\/(?:collect|track|analytics|event|visitor|pixel)\b/i],
    basisLabel: "claydar_marketing_analytics_endpoint",
  },
  {
    identity: {"entityId":"ent_5d38bfb460c5","vendorId":"ven_6be772247d22","serviceId":"svc_7da58a2ef704"},
    entity: "Framer B.V.",
    vendor: "Framer",
    product: "Framer Analytics",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "site_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^events\.framer\.com$/i],
    urlPatterns: [/\/(?:script|event|collect|track)\b/i],
    basisLabel: "framer_analytics_endpoint",
  },
  {
    identity: {"entityId":"ent_114192b1f70c","vendorId":"ven_c2c89eab7e16","serviceId":"svc_1393e11af83b"},
    entity: "Atlassian Pty Ltd",
    vendor: "Atlassian Statuspage",
    product: "Statuspage",
    purpose: "infrastructure",
    servicePurpose: "Service status",
    regulatoryRelevance: ["status_monitoring", "availability", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.statuspage\.io$/i],
    basisLabel: "atlassian_statuspage_infrastructure",
  },
  {
    identity: {"entityId":"ent_cbab96e6d218","vendorId":"ven_f98525a8e457","serviceId":"svc_5e987b4ec4f1"},
    entity: "Intercom, Inc.",
    vendor: "Intercom",
    product: "Intercom Messenger",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["customer_support", "chat_widget", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/\.intercomcdn\.com$/i, /\.intercom\.io$/i],
    urlPatterns: [/\/(?:widget|messenger|frame|launcher|app)\b/i],
    basisLabel: "intercom_messenger_runtime",
  },
  {
    identity: {"entityId":"ent_fcf15053e43a","vendorId":"ven_b19928ad73c2","serviceId":"svc_308766b8760b"},
    entity: "Usercentrics A/S",
    vendor: "Cookiebot",
    product: "Cookiebot CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.95,
    hostPatterns: [/\.cookiebot\.com$/i, /^consent\.cookiebot\.com$/i, /^(?:consent|consentcdn)\.cookiebot\.eu$/i],
    urlPatterns: [/\/uc\.js\b/i, /\/consentconfig\//i],
    cookiePatterns: [/^CookieConsent$/i],
    globalPatterns: [/^Cookiebot$/i],
    storageKeyPatterns: [/^CookieConsent$/i, /^CookiebotConsent$/i],
    domSelectorPatterns: [/^#CybotCookiebotDialog$/i, /^#CookiebotWidget$/i],
    basisLabel: "cookiebot_cmp_script_or_cookie",
  },
  {
    identity: {"entityId":"ent_b59b8072cabe","vendorId":"ven_87461ee265b8","serviceId":"svc_9d8fa80829f0"},
    entity: "Kentico Software s.r.o.",
    vendor: "Kentico",
    product: "Kentico Xperience CMS",
    purpose: "infrastructure",
    servicePurpose: "Content management",
    regulatoryRelevance: ["content_management", "functional_storage"],
    confidence: 0.98,
    cookiePatterns: [/^CMSCsrfCookie$/i, /^CMSPreferredCulture$/i],
    suppressCookieMatchedHostname: true,
    basisLabel: "kentico_xperience_functional_cookie",
  },
  {
    identity: {"entityId":"ent_37bdbede5506","vendorId":"ven_b6746870f3dc","serviceId":"svc_e8503f1d0e61"},
    entity: "Didomi SAS",
    vendor: "Didomi",
    product: "Didomi CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.95,
    hostPatterns: [/\.didomi\.io$/i],
    urlPatterns: [/\/sdk\/didomi/i, /\/notice\//i],
    cookiePatterns: [/^didomi_token$/i, /^euconsent-v2$/i],
    globalPatterns: [/^Didomi$/i],
    storageKeyPatterns: [/^didomi_/i, /^euconsent-v2$/i],
    domSelectorPatterns: [/^#didomi-host$/i, /^\.didomi-popup/i],
    basisLabel: "didomi_cmp_script_or_cookie",
  },
  {
    identity: {"entityId":"ent_37bdbede5506","vendorId":"ven_b6746870f3dc","serviceId":"svc_e8503f1d0e61"},
    entity: "Didomi SAS",
    vendor: "Didomi",
    product: "Didomi CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "preference_tooling", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^sdk\.privacy-center\.org$/i],
    urlPatterns: [
      /^https:\/\/sdk\.privacy-center\.org\/(?:[A-Za-z0-9_-]+\/loader\.js|sdk\/[A-Za-z0-9_.-]+\/[^?#]+|v2\/loader\.js)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "didomi_privacy_center_web_sdk",
  },
  {
    identity: {"entityId":"ent_7c8ef7e99d60","vendorId":"ven_bbcea9b60472","serviceId":"svc_b0dc52a7ab05"},
    entity: "TrustArc Inc.",
    vendor: "TrustArc",
    product: "TrustArc CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.94,
    hostPatterns: [/\.trustarc\.com$/i, /^consent-pref\.truste\.com$/i],
    urlPatterns: [/\/notice\?/i, /\/get\?/i],
    cookiePatterns: [/^notice_preferences$/i, /^cmapi_cookie_privacy$/i],
    globalPatterns: [/^truste$/i, /^TrustArc$/i],
    storageKeyPatterns: [/^notice_preferences$/i, /^cmapi_cookie_privacy$/i],
    domSelectorPatterns: [/^#truste-consent-track$/i, /^#teconsent$/i, /^\.truste_/i],
    basisLabel: "trustarc_cmp_script_or_cookie",
  },
  {
    identity: {"entityId":"ent_ddffb63c61a6","vendorId":"ven_290f8e907a53","serviceId":"svc_a3e0756f02d8"},
    entity: "Sourcepoint Technologies, Inc.",
    vendor: "Sourcepoint",
    product: "Sourcepoint CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.94,
    hostPatterns: [/\.sourcepointcmp\.com$/i, /\.privacy-mgmt\.com$/i],
    urlPatterns: [/\/wrapperMessagingWithoutDetection\.js\b/i, /\/ccpa\/?$/i, /\/gdpr\/?$/i],
    cookiePatterns: [/^_sp_su$/i, /^_sp_v1_/i, /^_sp_user_consent(?:_|$)/i, /^_sp_(?:local_state|non_keyed_local_state|enable_dfp_personalized_ads)$/i, /^sp_choice$/i],
    globalPatterns: [/^_sp_$/i, /^sourcepoint$/i],
    storageKeyPatterns: [/^_sp_su$/i, /^_sp_v1_/i, /^_sp_user_consent(?:_|$)/i, /^_sp_(?:local_state|non_keyed_local_state|enable_dfp_personalized_ads)$/i, /^sp_choice$/i],
    domSelectorPatterns: [/^#sp_message_container_/i, /^\.sp_message_container/i],
    basisLabel: "sourcepoint_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_fcf15053e43a","vendorId":"ven_9736f4df6047","serviceId":"svc_7ed3d9c156a8"},
    entity: "Usercentrics A/S",
    vendor: "Usercentrics",
    product: "Usercentrics CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.94,
    hostPatterns: [/\.usercentrics\.eu$/i, /\.usercentrics\.com$/i],
    urlPatterns: [/\/browser-ui\//i, /\/cmp\/browser-ui\//i, /\/settings\/[^/]+\/latest/i],
    cookiePatterns: [/^uc_settings$/i, /^ucString$/i, /^uc_user_interaction$/i],
    globalPatterns: [/^UC_UI$/i, /^UC_UI_CMP$/i, /^usercentrics$/i],
    storageKeyPatterns: [/^uc_/i, /^ucSettings$/i],
    domSelectorPatterns: [/^#usercentrics-root$/i, /^#uc-center-container$/i],
    basisLabel: "usercentrics_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_e6ff840fe5ec","vendorId":"ven_508129f29d8b","serviceId":"svc_1e881935a3a5"},
    entity: "Osano, Inc.",
    vendor: "Osano",
    product: "Osano CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.94,
    hostPatterns: [/\.osano\.com$/i],
    urlPatterns: [/\/consent-manager\//i, /\/osano\.js\b/i],
    cookiePatterns: [/^osano_consentmanager$/i, /^osano_consentmanager_uuid$/i],
    globalPatterns: [/^Osano$/i],
    storageKeyPatterns: [/^osano/i],
    domSelectorPatterns: [/^#osano-cm/i, /^\.osano-cm/i],
    basisLabel: "osano_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_041dc9ac546e","vendorId":"ven_54eb16f4dfa6","serviceId":"svc_5a225124bfd7"},
    entity: "Ketch Kloud, Inc.",
    vendor: "Ketch",
    product: "Ketch CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.93,
    hostPatterns: [/\.ketchcdn\.com$/i, /\.ketch\.com$/i],
    urlPatterns: [/\/web\/v\d+\/config/i, /\/ketch\.js\b/i],
    cookiePatterns: [/^ketch_consent$/i],
    globalPatterns: [/^ketch$/i, /^Ketch$/i],
    storageKeyPatterns: [/^ketch/i],
    domSelectorPatterns: [/^#ketch-banner$/i, /^\.ketch-consent/i],
    basisLabel: "ketch_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_77d4f4329230","vendorId":"ven_5e57636b11b7","serviceId":"svc_ad0d22feecc7"},
    entity: "Quantcast Corporation",
    vendor: "Quantcast",
    product: "Quantcast Choice CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.93,
    hostPatterns: [/\.quantcast\.moloco\.com$/i, /\.quantcast\.com$/i, /^quantcast\.mgr\.consensu\.org$/i],
    urlPatterns: [/\/choice\//i, /\/cmp2/i],
    cookiePatterns: [/^euconsent-v2$/i, /^qcS?Choice/i],
    globalPatterns: [/^__qcCmp$/i],
    storageKeyPatterns: [/^qc/i, /^quantcast/i],
    domSelectorPatterns: [/^#qc-cmp2-container$/i, /^\.qc-cmp2/i],
    basisLabel: "quantcast_choice_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_e9a8cd182091","vendorId":"ven_c67a1e56ea44","serviceId":"svc_23892ac13794"},
    entity: "CookieYes Limited",
    vendor: "CookieYes",
    product: "CookieYes CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.92,
    hostPatterns: [/\.cookieyes\.com$/i],
    urlPatterns: [/\/client_data\//i, /\/cookieyes\.js\b/i],
    cookiePatterns: [/^cookieyes-consent$/i, /^cky-consent$/i, /^cookielawinfo-checkbox-/i, /^viewed_cookie_policy$/i],
    globalPatterns: [/^CookieYes$/i, /^ckySettings$/i],
    storageKeyPatterns: [/^cookieyes/i, /^cky-/i],
    domSelectorPatterns: [/^\.cky-consent-container$/i, /^#cookieyes$/i],
    basisLabel: "cookieyes_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_98537541b6ba","vendorId":"ven_9f4590197452","serviceId":"svc_e133cf7165c7"},
    entity: "Iubenda s.r.l.",
    vendor: "Iubenda",
    product: "Iubenda CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.92,
    hostPatterns: [/\.iubenda\.com$/i],
    urlPatterns: [/\/iubenda_cs\.js\b/i, /\/cs\/iubenda_cs/i],
    cookiePatterns: [/^_iub_cs-/i, /^iubenda_/i],
    globalPatterns: [/^_iub$/i, /^Iubenda$/i],
    storageKeyPatterns: [/^_iub/i, /^iubenda/i],
    domSelectorPatterns: [/^#iubenda-cs-banner$/i, /^\.iubenda-cs/i],
    basisLabel: "iubenda_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_aed481d00f96","vendorId":"ven_efb6b1c36f89","serviceId":"svc_f883ba3c0436"},
    entity: "Termly, Inc.",
    vendor: "Termly",
    product: "Termly CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.91,
    hostPatterns: [/\.termly\.io$/i],
    urlPatterns: [/\/embed\.min\.js\b/i, /\/resource-blocker/i],
    cookiePatterns: [/^terml[iy]_gtm_template_default_consents$/i, /^termly-consent$/i],
    globalPatterns: [/^Termly$/i],
    storageKeyPatterns: [/^termly/i],
    domSelectorPatterns: [/^#termly-code-snippet-support$/i, /^\.termly-cookie/i],
    basisLabel: "termly_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_e4705d55806c","vendorId":"ven_4f22b8c3519d","serviceId":"svc_cfd5b620b754"},
    entity: "Cookie Information A/S",
    vendor: "Cookie Information",
    product: "Cookie Information CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.91,
    hostPatterns: [/\.cookieinformation\.com$/i],
    urlPatterns: [/\/uc\.js\b/i, /\/Consent\.js\b/i],
    cookiePatterns: [/^CookieInformationConsent$/i],
    globalPatterns: [/^CookieInformation$/i],
    storageKeyPatterns: [/^CookieInformation/i],
    domSelectorPatterns: [/^#coiOverlay$/i, /^\.coi-/i],
    basisLabel: "cookie_information_cmp_runtime_or_endpoint",
  },
  {
    identity: {"entityId":"ent_2a1f962eee17","vendorId":"ven_774ea15b1e97","serviceId":"svc_90f9fb6fd997"},
    entity: "Tealium, Inc.",
    vendor: "Tealium",
    product: "Tealium iQ Tag Management",
    purpose: "tag_management",
    servicePurpose: "Tag management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/\.tiqcdn\.com$/i, /\.tealiumiq\.com$/i],
    urlPatterns: [/\/utag(?:\.|\/)/i],
    basisLabel: "tealium_iq_tag_management_endpoint",
  },
  {
    identity: {"entityId":"ent_395ac70d51af","vendorId":"ven_9d8bc46c0fd8","serviceId":"svc_e83fd412d654"},
    entity: "ID5 Technology, Inc.",
    vendor: "ID5",
    product: "ID5 Identity",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution", "cross_site_tracking"],
    confidence: 0.91,
    hostPatterns: [/\.id5-sync\.com$/i],
    urlPatterns: [/\/(?:sync|eids|gdpr|api)\b/i],
    basisLabel: "id5_identity_sync_endpoint",
  },
  {
    identity: {"entityId":"ent_4f20860b7a59","vendorId":"ven_738de05d454e","serviceId":"svc_ffb36e67cf2e"},
    entity: "LiveIntent, Inc.",
    vendor: "LiveIntent",
    product: "LiveIntent",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution", "cross_site_tracking"],
    confidence: 0.91,
    hostPatterns: [/\.liadm\.com$/i],
    urlPatterns: [/\/(?:sync|pixel|collect|match)\b/i],
    basisLabel: "liveintent_liadm_endpoint",
  },
  {
    identity: {"entityId":"ent_c77df19fd748","vendorId":"ven_56818faf03c6","serviceId":"svc_1745d2f44b07"},
    entity: "StackAdapt, Inc.",
    vendor: "StackAdapt",
    product: "StackAdapt",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.91,
    hostPatterns: [/\.stackadapt\.com$/i],
    urlPatterns: [/\/(?:sync|pixel|track|event)\b/i],
    basisLabel: "stackadapt_advertising_endpoint",
  },
  {
    identity: {"entityId":"ent_48a7f75b2613","vendorId":"ven_f64bcbc44539","serviceId":"svc_178b0e447a10"},
    entity: "Media.net Advertising FZ-LLC",
    vendor: "Media.net",
    product: "Media.net",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "contextual_advertising"],
    confidence: 0.91,
    hostPatterns: [/\.media\.net$/i],
    urlPatterns: [/\/(?:pixel|sync|prebid|event)\b/i],
    basisLabel: "media_net_advertising_endpoint",
  },
  {
    identity: {"entityId":"ent_b0901f16edb8","vendorId":"ven_82e262c03d09","serviceId":"svc_f1b5d7d743f9"},
    entity: "Braze, Inc.",
    vendor: "Braze",
    product: "Braze",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "marketing_automation", "personalization"],
    confidence: 0.91,
    hostPatterns: [/\.appboycdn\.com$/i, /\.braze\.com$/i],
    urlPatterns: [/\/(?:api|sdk|track|events)\b/i],
    storageKeyPatterns: [/^ab\.storage\.[A-Za-z0-9_.-]+$/],
    basisLabel: "braze_marketing_automation_endpoint",
  },
  {
    identity: {"entityId":"ent_3610b8bcde9a","vendorId":"ven_ba0c0e979e07","serviceId":"svc_35b452873ace"},
    entity: "Snowplow Analytics Ltd",
    vendor: "Snowplow",
    product: "Snowplow Analytics",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "event_tracking", "first_party_runtime"],
    confidence: 0.99,
    cookiePatterns: [/^_sp_(?:id|ses)\.[A-Za-z0-9]+$/],
    storageKeyPatterns: [/^snowplowOutQueue_[A-Za-z0-9_.-]+$/],
    basisLabel: "snowplow_browser_storage",
  },
  {
    identity: {"entityId":"ent_45a9ed0dbf4f","vendorId":"ven_fe7a77d280a8","serviceId":"svc_ea5a3fc9c17c"},
    entity: "Contentsquare SA",
    vendor: "Contentsquare",
    product: "Contentsquare",
    purpose: "session_replay",
    servicePurpose: "Session replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.91,
    hostPatterns: [/\.contentsquare\.net$/i, /\.contentsquare\.com$/i],
    urlPatterns: [/\/(?:collect|track|events|pixel)\b/i],
    basisLabel: "contentsquare_behavioral_analytics_endpoint",
  },
  {
    identity: {"entityId":"ent_b6164f2206e6","vendorId":"ven_8b91fc0f9614","serviceId":"svc_65e1e4917fad"},
    entity: "Quantum Metric, Inc.",
    vendor: "Quantum Metric",
    product: "Quantum Metric",
    purpose: "session_replay",
    servicePurpose: "Session replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.91,
    hostPatterns: [/\.quantummetric\.com$/i],
    urlPatterns: [/\/(?:collect|track|events|pixel)\b/i],
    basisLabel: "quantum_metric_behavioral_analytics_endpoint",
  },
  {
    identity: {"entityId":"ent_02b1b951db45","vendorId":"ven_3e5a5b1911ca","serviceId":"svc_1dc03beaa9fd"},
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Microsoft Advertising / Bing UET",
    aliases: ["Microsoft Bing Ads", "Bing UET", "Microsoft Advertising"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "conversion_tracking"],
    confidence: 0.91,
    hostPatterns: [/^bat\.bing\.com$/i],
    urlPatterns: [/\/(?:action|p|bat)\b/i],
    cookiePatterns: [/^_uetsid$/i, /^_uetvid$/i],
    storageKeyPatterns: [/^_uetsid$/i, /^_uetvid$/i],
    basisLabel: "microsoft_bing_uet_endpoint",
  },
  {
    identity: {"entityId":"ent_dc18c8f6da81","vendorId":"ven_72c6542b55a1","serviceId":"svc_23af9c3c0a4c"},
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Publisher Services",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_ad_server", "programmatic_ads"],
    confidence: 0.91,
    hostPatterns: [/\.aps\.amazon-adsystem\.com$/i, /^c\.amazon-adsystem\.com$/i],
    urlPatterns: [/\/(?:aps|prebid|config|sync)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "amazon_publisher_services_endpoint",
  },
  {
    identity: {"entityId":"ent_02b1b951db45","vendorId":"ven_4595c561af47","serviceId":"svc_6a75ecdd4b22"},
    entity: "Microsoft Corporation",
    vendor: "Xandr",
    product: "Xandr / AppNexus",
    aliases: ["AppNexus / Xandr"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads", "identity_resolution"],
    confidence: 0.92,
    hostPatterns: [/\.adnxs\.com$/i, /^adnxs\.com$/i],
    urlPatterns: [/\/(?:sync|getuid|prebid|ut)\b/i],
    basisLabel: "xandr_appnexus_endpoint",
  },
  {
    identity: {"entityId":"ent_26efb1f3134e","vendorId":"ven_b25123724e0c","serviceId":"svc_8e592637d98d"},
    entity: "TripleLift, Inc.",
    vendor: "TripleLift",
    product: "TripleLift",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.91,
    hostPatterns: [/\.3lift\.com$/i],
    urlPatterns: [/\/(?:sync|pixel|prebid|event)\b/i],
    basisLabel: "triplelift_advertising_endpoint",
  },
  {
    identity: {"entityId":"ent_6f46c7c0e18b","vendorId":"ven_280a2f0e0993","serviceId":"svc_b66181c3ad12"},
    entity: "FreeWheel Media, Inc.",
    vendor: "FreeWheel",
    product: "FreeWheel",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "video_advertising"],
    confidence: 0.91,
    hostPatterns: [/\.fwmrm\.net$/i],
    urlPatterns: [/\/(?:ad|dmp|sync|visitor)\b/i],
    basisLabel: "freewheel_video_advertising_endpoint",
  },
  {
    identity: {"entityId":"ent_6cfb0c4b39b9","vendorId":"ven_5adf22b00c10","serviceId":"svc_83ea47d76575"},
    entity: "Teads S.A.S.",
    vendor: "Teads",
    product: "Teads Video Advertising",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "video_advertising", "targeted_advertising"],
    confidence: 0.92,
    hostPatterns: [/\.teads\.tv$/i, /^teads\.tv$/i],
    urlPatterns: [/\/(?:sync|pixel|collect|impression|event)\b/i],
    basisLabel: "teads_video_advertising_endpoint",
  },
  {
    identity: {"entityId":"ent_74a0a0479beb","vendorId":"ven_f871acdc4272","serviceId":"svc_647d04fbde3d"},
    entity: "OneSignal, Inc.",
    vendor: "OneSignal",
    product: "OneSignal Web Push",
    purpose: "advertising",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "push_notifications", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdn\.onesignal\.com$/i, /^onesignal\.com$/i],
    urlPatterns: [/\/sdks\/(?:web\/)?(?:v\d+\/)?OneSignal(?:SDK)?[^/]*\.js\b/i, /\/api\/v1\/(?:players|notifications|sync)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "onesignal_web_push_runtime",
  },
  {
    identity: {"entityId":"ent_3cb0fb347628","vendorId":"ven_c782c366c93e","serviceId":"svc_8dc8bf89b1a5"},
    entity: "Zendesk, Inc.",
    vendor: "Zendesk",
    product: "Zendesk Web Widget",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["consent", "customer_support", "chat_widget", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^static\.zdassets\.com$/i, /^ekr\.zdassets\.com$/i],
    urlPatterns: [/\/ekr\/snippet\.js\b/i, /\/web_widget\//i, /\/embeddable\//i],
    requireUrlPatternMatch: true,
    basisLabel: "zendesk_web_widget_runtime",
  },
  {
    identity: {"entityId":"ent_fb4a53336d55","vendorId":"ven_3ff63ac488f6","serviceId":"svc_647315422962"},
    entity: "Nielsen Holdings plc",
    vendor: "Nielsen",
    product: "Nielsen Digital Audience Measurement",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "audience_measurement", "analytics", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.imrworldwide\.com$/i],
    urlPatterns: [/\/cgi-bin\/(?:m|gn)\b/i, /\/ggcmb\d*\//i, /\/log\b/i, /^https:\/\/cdn-gl\.imrworldwide\.com\/(?:conf\/[A-Za-z0-9_-]+|novms\/(?:html\/ls\.html|js\/\d+\/nlsSDK\d+\.bundle\.min\.js))(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "nielsen_imrworldwide_audience_measurement",
  },
  {
    identity: {"entityId":"ent_c3d10167fda2","vendorId":"ven_6094469a8d62","serviceId":"svc_52ebc4b5fee5"},
    entity: "Chartbeat, Inc.",
    vendor: "Chartbeat",
    product: "Chartbeat Publisher Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^static\.chartbeat\.com$/i, /^ping\.chartbeat\.net$/i, /\.chartbeat\.(?:com|net)$/i],
    urlPatterns: [/\/chartbeat[^/]*\.js\b/i, /\/ping\b/i, /^https:\/\/static\.chartbeat\.com\/js\/subscriptions\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "chartbeat_publisher_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_b9c26d3daee7","vendorId":"ven_df86fd89d1dc","serviceId":"svc_a57ce6806888"},
    entity: "hCaptcha, Inc.",
    vendor: "hCaptcha",
    product: "hCaptcha",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^(?:js|api|newassets|imgs)\.hcaptcha\.com$/i, /\.hcaptcha\.com$/i],
    urlPatterns: [/\/1\/api\.js\b/i, /\/captcha\//i, /\/checksiteconfig\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "hcaptcha_security_runtime",
  },
  {
    identity: {"entityId":"ent_73c2fe5996cc","vendorId":"ven_8502e515b7ce","serviceId":"svc_22f3c688ea8a"},
    entity: "Matomo",
    vendor: "Matomo",
    product: "Matomo Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.matomo\.cloud$/i],
    urlPatterns: [/\/(?:matomo|piwik)\.(?:js|php)\b/i],
    requireUrlPatternMatch: true,
    allowUrlPatternWithoutHostMatch: true,
    cookiePatterns: [/^_pk_(?:id|ses|ref|cvar|hm)(?:[._-].*)?$/i],
    basisLabel: "matomo_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_006fe4e04d8d","vendorId":"ven_613d75d47045","serviceId":"svc_b867c5e0c36f"},
    entity: "Umami Software, Inc.",
    vendor: "Umami",
    product: "Umami Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^(?:cloud|gateway)\.umami\.is$/i],
    urlPatterns: [/\/script\.js(?:\?|$)/i, /\/api\/send(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "umami_cloud_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_c6bffa688fd1","vendorId":"ven_d9ec4ccacefe","serviceId":"svc_a419d4db0ac0"},
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Web Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^static\.cloudflareinsights\.com$/i, /^cloudflareinsights\.com$/i],
    urlPatterns: [/\/beacon(?:\.min)?\.js\b/i],
    basisLabel: "cloudflare_web_analytics_beacon",
  },
  {
    identity: {"entityId":"ent_c6bffa688fd1","vendorId":"ven_d9ec4ccacefe","serviceId":"svc_0397cbce05dc"},
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Turnstile",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^challenges\.cloudflare\.com$/i],
    urlPatterns: [/^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/(?:api\.js|[bg]\/[a-f0-9]+\/api\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "cloudflare_turnstile_runtime",
  },
  {
    identity: {"entityId":"ent_c6bffa688fd1","vendorId":"ven_d9ec4ccacefe","serviceId":"svc_77550e74599c"},
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Challenge Platform",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^challenges\.cloudflare\.com$/i],
    urlPatterns: [/^https:\/\/challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform\/[^?#]+/i],
    requireUrlPatternMatch: true,
    basisLabel: "cloudflare_challenge_platform_runtime",
  },
  {
    identity: {"entityId":"ent_57f4a70d988a","vendorId":"ven_cb1bd0830ab8","serviceId":"svc_866ad01302cc"},
    entity: "Vimeo, Inc.",
    vendor: "Vimeo",
    product: "Vimeo Embedded Player",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^player\.vimeo\.com$/i, /^f\.vimeocdn\.com$/i],
    urlPatterns: [
      /^https:\/\/player\.vimeo\.com\/(?:video\/\d+|api\/player\.js)\b/i,
      /^https:\/\/f\.vimeocdn\.com\/(?:js_opt\/modules\/utils\/vuid\.min\.js|p\/\d+\.\d+\.\d+\/(?:css\/player\.css|js\/(?:player|vendor)\.module\.js))(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "vimeo_embedded_player_runtime",
  },
  {
    identity: {"entityId":"ent_4bb72043e45f","vendorId":"ven_73865349f2c7","serviceId":"svc_d72b859caa55"},
    entity: "Qualified.com, Inc.",
    vendor: "Qualified",
    product: "Qualified Conversational Marketing",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["consent", "customer_support", "lead_generation", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^js\.qualified\.com$/i, /^app\.qualified\.com$/i],
    urlPatterns: [/\/(?:qualified|widget|conversation|visitor)\b/i],
    basisLabel: "qualified_conversational_marketing_runtime",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_e408c48d1f67","serviceId":"svc_351876d0cf93"},
    entity: "Google LLC",
    vendor: "YouTube",
    product: "YouTube Embedded Player",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^www\.youtube\.com$/i, /^www\.youtube-nocookie\.com$/i],
    urlPatterns: [/^https:\/\/(?:www\.youtube\.com|www\.youtube-nocookie\.com)\/embed(?:\/[A-Za-z0-9_-]+)?(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "youtube_embedded_player_iframe_runtime",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_e408c48d1f67","serviceId":"svc_06b640973fc3"},
    entity: "Google LLC",
    vendor: "YouTube",
    product: "YouTube Player Runtime Library",
    purpose: "infrastructure",
    servicePurpose: "Media delivery",
    regulatoryRelevance: ["script_delivery", "media_support", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^www\.youtube\.com$/i, /^www\.youtube-nocookie\.com$/i],
    urlPatterns: [/\/iframe_api\b/i, /\/player_api\b/i, /\/s\/(?:_|player)\//i, /\/generate_204\b/i, /^https:\/\/www\.youtube\.com\/youtubei\/v1\/log_event(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "youtube_player_runtime_library",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_b7dc7f4acb26"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Funding Choices CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^fundingchoicesmessages\.google\.com$/i],
    urlPatterns: [/\/i\/pub-\d+/i, /\/f\/AGSKWxI/i, /\/f\/AGSKWxU/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_funding_choices_cmp_runtime",
  },
  {
    identity: {"entityId":"ent_a3c6b6fd103b","vendorId":"ven_39485213584b","serviceId":"svc_7935aa64abf2"},
    entity: "Salesforce, Inc.",
    vendor: "Salesforce",
    product: "Salesforce Account Engagement",
    aliases: ["Pardot"],
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "lead_generation", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^pi\.pardot\.com$/i],
    urlPatterns: [/\/pd\.js\b/i, /\/analytics\b/i],
    requireUrlPatternMatch: true,
    cookiePatterns: [/^visitor_id\d+$/i, /^pardot$/i, /^lpv\d+$/i],
    basisLabel: "salesforce_account_engagement_pardot_runtime",
  },
  {
    identity: {"entityId":"ent_bee5f2164c17","vendorId":"ven_c172662bb44d","serviceId":"svc_ab2039885ab9"},
    entity: "Awin AG",
    vendor: "AWIN",
    product: "AWIN Affiliate Tracking",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "affiliate_tracking", "conversion_tracking"],
    confidence: 0.9,
    hostPatterns: [/^www\.dwin1\.com$/i],
    urlPatterns: [/\/\d+\.js\b/i],
    requireUrlPatternMatch: true,
    cookiePatterns: [/^aw\d+$/i, /^_aw_(?:m|j|sn)_/i],
    basisLabel: "awin_mastertag_dwin1_runtime",
  },
  {
    identity: {"entityId":"ent_987aa8d911b1","vendorId":"ven_b83a12660dfc","serviceId":"svc_745d77b8b637"},
    entity: "ShareThis, Inc.",
    vendor: "ShareThis",
    product: "ShareThis Widgets",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "social_sharing", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^platform-api\.sharethis\.com$/i],
    urlPatterns: [/\/js\/sharethis\.js\b/i],
    cookiePatterns: [/^__unam$/i],
    basisLabel: "sharethis_widget_runtime",
  },
  {
    identity: {"entityId":"ent_4276f0286b4a","vendorId":"ven_40b025185da7","serviceId":"svc_4d363d381a46"},
    entity: "Pendo.io, Inc.",
    vendor: "Pendo",
    product: "Pendo",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdn\.pendo\.io$/i],
    urlPatterns: [/\/agent\/static\/[^/]+\/pendo\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "pendo_web_sdk_runtime",
  },
  {
    identity: {"entityId":"ent_6b10a0738ce5","vendorId":"ven_e596f4fb3a86","serviceId":"svc_be851b0bbe9c"},
    entity: "Plausible Analytics",
    vendor: "Plausible",
    product: "Plausible Analytics",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["analytics", "cookieless_analytics", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^plausible\.io$/i],
    urlPatterns: [/\/js\/(?:script|plausible)[^/]*\.js\b/i, /\/api\/event\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "plausible_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_3132d7340439","vendorId":"ven_9ea9620cf33b","serviceId":"svc_88b690df8238"},
    entity: "Fonticons, Inc.",
    vendor: "Font Awesome",
    product: "Font Awesome Kits CDN",
    purpose: "infrastructure",
    servicePurpose: "Font delivery",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^kit\.fontawesome\.com$/i, /^ka-p\.fontawesome\.com$/i],
    urlPatterns: [
      /^https:\/\/kit\.fontawesome\.com\/(?:[a-f0-9]+\.js|[a-f0-9]+\/[A-Za-z0-9_-]+\/kit-upload\.css)(?:\?|$)/i,
      /^https:\/\/ka-p\.fontawesome\.com\/(?:assets\/[a-f0-9]+\/[A-Za-z0-9_./-]+\.css|releases\/v\d+\.\d+\.\d+\/(?:css\/pro(?:-v[45]-(?:font-face|shims))?\.min\.css|webfonts\/[A-Za-z0-9_.-]+\.woff2))(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "font_awesome_kit_runtime",
  },
  {
    identity: {"entityId":"ent_de4d7102d8d2","vendorId":"ven_fe9658c3ab82","serviceId":"svc_851fec9d56a9"},
    entity: "Cloudinary, Inc.",
    vendor: "Cloudinary",
    product: "Cloudinary Media CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^res\.cloudinary\.com$/i],
    urlPatterns: [/\/image\/(?:upload|fetch)\//i, /\/video\/upload\//i],
    requireUrlPatternMatch: true,
    basisLabel: "cloudinary_media_delivery_runtime",
  },
  {
    identity: {"entityId":"ent_f27d60a02788","vendorId":"ven_e78e673dcccf","serviceId":"svc_4bf18cbaa7de"},
    entity: "LongTail Ad Solutions, Inc.",
    vendor: "JW Player",
    product: "JW Player",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdn\.jwplayer\.com$/i],
    urlPatterns: [/\/libraries\/[A-Za-z0-9]{8}\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "jw_player_cloud_hosted_library",
  },
  {
    identity: {"entityId":"ent_a7e02383b5c1","vendorId":"ven_c9742fa8fb77","serviceId":"svc_de4b71b34c27"},
    entity: "Brightcove, Inc.",
    vendor: "Brightcove",
    product: "Brightcove Player",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^players\.brightcove\.net$/i],
    urlPatterns: [/\/index(?:\.min)?\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "brightcove_player_runtime",
  },
  {
    identity: {"entityId":"ent_6d3794cfe2a0","vendorId":"ven_ac233c57b8ac","serviceId":"svc_619417431bf1"},
    entity: "Transcend, Inc.",
    vendor: "Transcend",
    product: "Transcend Consent Management",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "preference_tooling", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^(?:cdn\.)?transcend-cdn\.com$/i, /^cdntranscend\.[a-z0-9.-]+$/i],
    urlPatterns: [/^https:\/\/(?:cdn\.)?transcend-cdn\.com\/cm\/[A-Za-z0-9_-]+\/(?:airgap\.js|cm\.css|translations\/[A-Za-z]{2}(?:-[A-Za-z]{2})?\.json|ui\.js)(?:\?|$)/i, /^https:\/\/cdntranscend\.[a-z0-9.-]+\/(?:airgap\.js|cm\.css|translations\/[A-Za-z]{2}(?:-[A-Za-z]{2})?\.json|ui\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "transcend_consent_runtime_assets",
  },
  {
    identity: {"entityId":"ent_d765eac37c54","vendorId":"ven_668a0dc33606","serviceId":"svc_6161a2f320ea"},
    entity: "Confiant Inc.",
    vendor: "Confiant",
    product: "Confiant Ad Security",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "ad_security", "malvertising_protection", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.confiant-integrations\.net$/i],
    urlPatterns: [/^https:\/\/cdn\.confiant-integrations\.net\/(?:[A-Za-z0-9_-]+\/gpt_and_prebid\/config|gptprebidnative\/[A-Za-z0-9_-]+\/wrap)\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "confiant_ad_security_runtime",
  },
  {
    identity: {"entityId":"ent_f07f8f00fa6e","vendorId":"ven_6c624eb06c23","serviceId":"svc_d4119a904bd8"},
    entity: "Ensighten, Inc.",
    vendor: "Ensighten",
    product: "Ensighten Manage",
    purpose: "tag_management",
    servicePurpose: "Tag management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^activate\.platform\.californiatimes\.com$/i],
    urlPatterns: [/^https:\/\/activate\.platform\.californiatimes\.com\/caltimes\/latimes\/(?:Bootstrap\.js|code\/[a-f0-9]{32}\.js|serverComponent\.php)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ensighten_manage_california_times_cname",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_c1d270d90998"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Maps JavaScript API",
    purpose: "infrastructure",
    servicePurpose: "Maps / location services",
    regulatoryRelevance: ["maps", "location_services", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^maps\.googleapis\.com$/i],
    urlPatterns: [/^https:\/\/maps\.googleapis\.com\/maps\/api\/mapsjs\/gen_204(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_maps_javascript_api_telemetry",
  },
  {
    identity: {"entityId":"ent_8839694b121a","vendorId":"ven_65533ab4f3e9","serviceId":"svc_995947db7df3"},
    entity: "UserWay, Inc.",
    vendor: "UserWay",
    product: "UserWay Accessibility Widget",
    purpose: "infrastructure",
    servicePurpose: "Accessibility",
    regulatoryRelevance: ["accessibility_widget", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.userway\.org$/i],
    urlPatterns: [/^https:\/\/cdn\.userway\.org\/(?:widgetapp\/[0-9.-]+\/[^?#]+|styles\/[^?#]+\.(?:css|woff2?))(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "userway_widget_support_assets",
  },
  {
    identity: {"entityId":"ent_f3a28d9ca5a3","vendorId":"ven_ff543a55ab92","serviceId":"svc_cb9680dc7678"},
    entity: "Yandex LLC",
    vendor: "Yandex",
    product: "Yandex Metrica",
    aliases: ["Yandex Webvisor"],
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "session_replay"],
    confidence: 0.96,
    hostPatterns: [/^mc\.yandex\.(?:com|ru)$/i, /^mc\.webvisor\.org$/i],
    urlPatterns: [/^https:\/\/(?:mc\.yandex\.(?:com|ru)|mc\.webvisor\.org)\/(?:metrika|webvisor|watch\/[A-Za-z0-9_-]+|[A-Za-z0-9_-]{4,}|sync_cookie_image_(?:check|decide|start|finish)|ytm-config)(?:[/?#]|$)/i],
    cookiePatterns: [/^_ym_(?:uid|d|isad)$/i, /^_ymab_param$/i],
    requireUrlPatternMatch: true,
    basisLabel: "yandex_metrica_webvisor_runtime",
  },
  {
    identity: {"entityId":"ent_e761d503b4c9","vendorId":"ven_96c34b3b8a93","serviceId":"svc_74c7dae6f13f"},
    entity: "Flowplayer AB",
    vendor: "Flowplayer",
    product: "Flowplayer Native",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.flowplayer\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.flowplayer\.com\/releases\/native\/\d+\/(?:stable|canary|v\d+\.\d+\.\d+)\/plugins\/(?:ads|asel|cuepoints|dash|drm|float-on-scroll|ga4|keyboard)(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "flowplayer_native_plugins",
  },
  {
    identity: {"entityId":"ent_e9a8cd182091","vendorId":"ven_c67a1e56ea44","serviceId":"svc_23892ac13794"},
    entity: "CookieYes Limited",
    vendor: "CookieYes",
    product: "CookieYes CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn-cookieyes\.com$/i],
    urlPatterns: [/^https:\/\/cdn-cookieyes\.com\/client_data\/[A-Za-z0-9_-]+\/script\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "cookieyes_client_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_28a6ed80ab56"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Web Interactives",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "marketing_automation", "personalization", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^js\.hubspot\.com$/i],
    urlPatterns: [/^https:\/\/js\.hubspot\.com\/web-interactives-embed\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_web_interactives_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_aec6aaec591e"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Calls to Action",
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "lead_capture", "marketing_automation", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:no-cache\.hubspot\.com|cta-service-cms2\.hubspot\.com)$/i],
    urlPatterns: [/^https:\/\/no-cache\.hubspot\.com\/cta\/default\/[^/?#]+\/[^/?#]+(?:[/?#]|$)/i, /^https:\/\/cta-service-cms2\.hubspot\.com\/(?:ctas\/v2|combinedConfigs)(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_cta_runtime",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_1ffe31bfc7ae"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Live Chat",
    purpose: "customer_support",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "customer_support", "lead_capture", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^api\.hubspot\.com$/i],
    urlPatterns: [/^https:\/\/api\.hubspot\.com\/livechat-public\/(?:v\d+\/)?[^?#]+/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_live_chat_api",
  },
  {
    identity: {"entityId":"ent_182562f6476e","vendorId":"ven_32eb0adcc0a3","serviceId":"svc_9b547f4290e0"},
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Analytics",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_analytics", "marketing_automation"],
    confidence: 0.96,
    hostPatterns: [/^track\.hubspot\.com$/i],
    urlPatterns: [/^https:\/\/track\.hubspot\.com\/(?:__ptq|ptq)\.gif(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_ptq_tracking_pixel",
  },
  {
    identity: {"entityId":"ent_b7232f61a7cb","vendorId":"ven_811482b1b479","serviceId":"svc_c3db1d3bb4a8"},
    entity: "Wistia, Inc.",
    vendor: "Wistia",
    product: "Wistia Embedded Player",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^fast\.wistia\.(?:com|net)$/i],
    urlPatterns: [/^https:\/\/fast\.wistia\.(?:com|net)\/(?:assets\/external\/[A-Za-z0-9_.-]+|embed\/medias\/[A-Za-z0-9_-]+\.(?:json|jsonp)|captions\/[A-Za-z0-9_-]+\.vtt|chapters\/[A-Za-z0-9_-]+\.json|market[o]?Form\/[^?#]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "wistia_embed_support_assets",
  },
  {
    identity: {"entityId":"ent_3132d7340439","vendorId":"ven_9ea9620cf33b","serviceId":"svc_88b690df8238"},
    entity: "Fonticons, Inc.",
    vendor: "Font Awesome",
    product: "Font Awesome Kits CDN",
    purpose: "infrastructure",
    servicePurpose: "Font delivery",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:kit|use)\.fontawesome\.com$/i],
    urlPatterns: [/^https:\/\/(?:kit|use)\.fontawesome\.com\/(?:[a-f0-9]+\.(?:css|js)|releases\/v\d+\.\d+\.\d+\/(?:css|webfonts)\/[^?#]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "font_awesome_kit_and_release_assets",
  },
  {
    identity: {"entityId":"ent_082d31780b21","vendorId":"ven_064a59c898b6","serviceId":"svc_d386bcf85bed"},
    entity: "InMobi Pte. Ltd.",
    vendor: "InMobi",
    product: "InMobi Choice CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "tcf", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cmp\.inmobi\.com$/i],
    urlPatterns: [/^https:\/\/cmp\.inmobi\.com\/(?:choice\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/choice\.js|geoip|GVL-v[23]\/[A-Za-z0-9_.-]+\.json|vendor-list\/[^?#]+|tcfv2\/vendor-list\/[^?#]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "inmobi_choice_cmp_runtime",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_b7dc7f4acb26"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Funding Choices CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^fundingchoicesmessages\.google\.com$/i],
    urlPatterns: [/^https:\/\/fundingchoicesmessages\.google\.com\/(?:el|i)\/[A-Za-z0-9_-]+={0,2}(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_funding_choices_message_runtime",
  },
  {
    identity: {"entityId":"ent_892ed09c91c1","vendorId":"ven_e238c5b3009b","serviceId":"svc_9c459578df5e"},
    entity: "MarsFlag GmbH",
    vendor: "MarsFlag",
    product: "MarsFlag Site Search",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["embedded_search", "search_analytics", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^(?:c|ce\.mf|s\.mp)\.marsflag\.com$/i],
    urlPatterns: [/^https:\/\/(?:c|ce\.mf)\.marsflag\.com\/[^?#]+\.(?:css|js|woff2?)(?:\?|$)/i, /^https:\/\/s\.mp\.marsflag\.com\/[^?#]+\.json(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "marsflag_site_search_runtime",
  },
  {
    identity: {"entityId":"ent_ebc0b57e8147","vendorId":"ven_d613bd401913","serviceId":"svc_ea3f5d3b787c"},
    entity: "Membrana Media",
    vendor: "Membrana Media",
    product: "Membrana Media Monetization",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_monetization", "third_party_runtime"],
    confidence: 0.93,
    hostPatterns: [/^cdn\.membrana\.media$/i],
    urlPatterns: [/^https:\/\/cdn\.membrana\.media\/(?:geolocation|scripts?\/[^?#]+|ym\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "membrana_media_monetization_runtime",
  },
  {
    identity: {"entityId":"ent_d053f3d00831","vendorId":"ven_f309f143e4d6","serviceId":"svc_9ffbd9de9a97"},
    entity: "Podscribe, Inc.",
    vendor: "Podscribe",
    product: "Podscribe Attribution",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "conversion_tracking", "podcast_attribution"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.pdst\.fm$/i],
    urlPatterns: [/^https:\/\/cdn\.pdst\.fm\/ping(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "podscribe_attribution_pixel_runtime",
  },
  {
    identity: {"entityId":"ent_1e6ee36270d6","vendorId":"ven_3f65e4a42cb7","serviceId":"svc_e919c6cdcaa7"},
    entity: "Innovid Corp.",
    vendor: "TVSquared",
    product: "TVSquared Attribution",
    aliases: ["InnovidXP TVSquared"],
    purpose: "advertising",
    servicePurpose: "Advertising measurement",
    regulatoryRelevance: ["consent", "advertising", "tv_attribution", "ad_measurement"],
    confidence: 0.95,
    hostPatterns: [/^collector-\d+\.us\.tvsquared\.com$/i],
    urlPatterns: [/^https:\/\/collector-\d+\.us\.tvsquared\.com\/tv2track\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "tvsquared_tv_attribution_runtime",
  },
  {
    identity: {"entityId":"ent_a7de5f27b875","vendorId":"ven_920cd0c7a2f1","serviceId":"svc_a2db74764c01"},
    entity: "Qualtrics, LLC",
    vendor: "Qualtrics",
    product: "Qualtrics Site Intercept",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "customer_experience", "survey", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^siteintercept\.qualtrics\.com$/i, /^(?:[a-z0-9-]+\.)+siteintercept\.qualtrics\.com$/i],
    urlPatterns: [/^https:\/\/(?:[a-z0-9-]+\.)*siteintercept\.qualtrics\.com\/(?:SIE(?:\/|$)|WRSiteInterceptEngine\/|dxjsmodule\/|targeting\/|chunks\/CoreModule)[^?#]*(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "qualtrics_site_intercept_runtime",
  },
  {
    identity: {"entityId":"ent_1684381c3935","vendorId":"ven_e9f2d86eafe7","serviceId":"svc_6d5fe9e94105"},
    entity: "Functional Software, Inc.",
    vendor: "Sentry",
    product: "Sentry Browser SDK",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "telemetry", "diagnostics", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^browser\.sentry-cdn\.com$/i],
    urlPatterns: [/^https:\/\/browser\.sentry-cdn\.com\/\d+(?:\.\d+){1,2}\/bundle(?:\.[A-Za-z0-9_-]+)*(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "sentry_browser_sdk_runtime",
  },
  {
    identity: {"entityId":"ent_b57e037eefe0","vendorId":"ven_07e096ba01d4","serviceId":"svc_04a24b8642a0"},
    entity: "Queryly, Inc.",
    vendor: "Queryly",
    product: "Queryly Site Search",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["embedded_search", "search_analytics", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:www\.)?queryly\.com$/i],
    urlPatterns: [/^https:\/\/(?:www\.)?queryly\.com\/js\/queryly\.v4(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "queryly_site_search_runtime",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_b1de1efcab0a"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Marketo Engage Munchkin",
    aliases: ["Marketo Munchkin"],
    purpose: "analytics",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "analytics", "lead_tracking", "marketing_automation"],
    confidence: 0.98,
    hostPatterns: [/^munchkin\.marketo\.net$/i],
    urlPatterns: [/^https:\/\/munchkin\.marketo\.net\/(?:\d+\/)?munchkin(?:-beta)?\.js(?:\?|$)/i],
    cookiePatterns: [/^_mkto_trk$/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_marketo_munchkin_runtime",
  },
  {
    identity: {"entityId":"ent_28dfd3da0857","vendorId":"ven_023325ef5929","serviceId":"svc_63eb7807f384"},
    entity: "AB Tasty SAS",
    vendor: "AB Tasty",
    product: "AB Tasty Experimentation",
    purpose: "analytics",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["consent", "experimentation", "ab_testing", "personalization"],
    confidence: 0.95,
    hostPatterns: [/^try\.abtasty\.com$/i],
    urlPatterns: [/^https:\/\/try\.abtasty\.com\/(?:[A-Za-z0-9_-]+(?:\.js|\/main\.[a-f0-9]+\.js)?|shared\/(?:[A-Za-z0-9_-]+|[A-Za-z0-9_-]+\.[a-f0-9]+\.js))(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ab_tasty_experimentation_runtime",
  },
  {
    identity: {"entityId":"ent_dc18c8f6da81","vendorId":"ven_72c6542b55a1","serviceId":"svc_23af9c3c0a4c"},
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Publisher Services",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_ad_server", "programmatic_ads"],
    confidence: 0.98,
    hostPatterns: [/^c\.amazon-adsystem\.com$/i, /^client\.aps\.amazon-adsystem\.com$/i],
    urlPatterns: [
      /^https:\/\/c\.amazon-adsystem\.com\/aax2\/apstag\.js(?:\?|$)/i,
      /^https:\/\/client\.aps\.amazon-adsystem\.com\/publisher\.js(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "amazon_publisher_services_apstag_runtime",
  },
  {
    identity: {"entityId":"ent_058321a378b7","vendorId":"ven_384b7efb7366","serviceId":"svc_37c54209bda6"},
    entity: "LiveInternet LLC",
    vendor: "LiveInternet",
    product: "LiveInternet Analytics Counter",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^counter\.yadro\.ru$/i],
    urlPatterns: [/^https:\/\/counter\.yadro\.ru\/(?:hit(?:_[A-Za-z0-9_-]+)?|logo)(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "liveinternet_analytics_counter",
  },
  {
    identity: {"entityId":"ent_7c06b50ef95a","vendorId":"ven_f91cfe82e4cc","serviceId":"svc_b007bf3ed110"},
    entity: "Automattic Inc.",
    vendor: "WordPress.com",
    product: "Jetpack Stats",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^pixel\.wp\.com$/i],
    urlPatterns: [/^https:\/\/pixel\.wp\.com\/g\.gif(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "jetpack_stats_pixel",
  },
  {
    identity: {"entityId":"ent_722c38f8cd03","vendorId":"ven_b288d201e371","serviceId":"svc_cc2c3a8d1b4d"},
    entity: "Intellimize, Inc.",
    vendor: "Intellimize",
    product: "Intellimize Personalization",
    purpose: "analytics",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["consent", "personalization", "experimentation", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.intellimize\.co$/i],
    urlPatterns: [/^https:\/\/cdn\.intellimize\.co\/snippet\/[A-Za-z0-9_-]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "intellimize_personalization_runtime",
  },
  {
    identity: {"entityId":"ent_49667358bbaf","vendorId":"ven_97ee6fd4e1fe","serviceId":"svc_230b10f7628f"},
    entity: "OneTrust, LLC",
    vendor: "OneTrust",
    product: "OneTrust CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^cookie-cdn\.cookiepro\.com$/i],
    urlPatterns: [/^https:\/\/cookie-cdn\.cookiepro\.com\/(?:consent\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|scripttemplates\/(?:\d+(?:\.\d+)*\/)?(?:otBannerSdk|otSDKStub)\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "onetrust_cookiepro_cmp_runtime",
  },
  {
    identity: {"entityId":"ent_4a0fc5e3710c","vendorId":"ven_55c9370276a0","serviceId":"svc_57dfd7bb655b"},
    entity: "Ad Lightning, Inc.",
    vendor: "Ad Lightning",
    product: "Ad Lightning Ad Quality",
    purpose: "security",
    servicePurpose: "Security",
    regulatoryRelevance: ["security", "ad_security", "malvertising_protection", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^tagan\.adlightning\.com$/i],
    urlPatterns: [/^https:\/\/tagan\.adlightning\.com\/[A-Za-z0-9_-]+\/op\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ad_lightning_ad_quality_runtime",
  },
  {
    identity: {"entityId":"ent_041dc9ac546e","vendorId":"ven_54eb16f4dfa6","serviceId":"svc_5a225124bfd7"},
    entity: "Ketch Kloud, Inc.",
    vendor: "Ketch",
    product: "Ketch CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "tcf", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.ketchjs\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.ketchjs\.com\/(?:ketchtag\/stable\/v\d+(?:\.\d+)*\/ketch-sdk\.js|plugins\/v\d+\/tcf\/stub\.js|web\/v\d+\/ketch\.js|tcf\/v\d+\/stub\.js|ketch\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ketch_cmp_cdn_runtime",
  },
  {
    identity: {"entityId":"ent_18f4ccb66aba","vendorId":"ven_b560258f1c2b","serviceId":"svc_0cc73f6e7b72"},
    entity: "Blockthrough Inc.",
    vendor: "Blockthrough",
    product: "Blockthrough Ad Recovery",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "adblock_recovery", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^btloader\.com$/i],
    urlPatterns: [/^https:\/\/btloader\.com\/tag(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "blockthrough_ad_recovery_tag",
  },
  {
    identity: {"entityId":"ent_f3a28d9ca5a3","vendorId":"ven_ff543a55ab92","serviceId":"svc_6152d8f87697"},
    entity: "Yandex LLC",
    vendor: "Yandex",
    product: "Yandex Advertising Network",
    aliases: ["YAN"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "programmatic_ads", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^yastatic\.net$/i],
    urlPatterns: [/^https:\/\/yastatic\.net\/partner-code-bundles\/[A-Za-z0-9_-]+\/[a-f0-9]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "yandex_advertising_network_partner_bundle",
  },
  {
    identity: {"entityId":"ent_63770faf6cda","vendorId":"ven_62d4f5693cb2","serviceId":"svc_0433cff396c5"},
    entity: "NextRoll, Inc.",
    vendor: "AdRoll",
    product: "AdRoll Pixel",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "conversion_tracking", "remarketing", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^s\.adroll\.com$/i],
    urlPatterns: [/^https:\/\/s\.adroll\.com\/j\/(?:[A-Z0-9]+\/)?roundtrip\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "adroll_roundtrip_pixel_runtime",
  },
  {
    identity: {"entityId":"ent_02b1b951db45","vendorId":"ven_3e5a5b1911ca","serviceId":"svc_e95ad56e0b05"},
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Azure Monitor Application Insights",
    purpose: "performance_monitoring",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["analytics", "performance_monitoring", "real_user_monitoring", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^js\.monitor\.azure\.com$/i],
    urlPatterns: [/^https:\/\/js\.monitor\.azure\.com\/scripts\/[ab]\/ai\.(?:\d+|\d+\.gbl)(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "azure_application_insights_web_sdk",
  },
  {
    identity: {"entityId":"ent_94d491ee9011","vendorId":"ven_53a4f0c5cf42","serviceId":"svc_80850eb6dd98"},
    entity: "Gladly Software, Inc.",
    vendor: "Gladly",
    product: "Gladly Chat",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["customer_support", "chat", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^cdn\.gladly\.com$/i],
    urlPatterns: [
      /^https:\/\/cdn\.gladly\.com\/(?:chat-sdk\/widget\.js|assets\/chat-sdk\/[^/?#]+|orgs\/configs\/chat\/[A-Za-z0-9.-]+\.json)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "gladly_chat_sdk_runtime",
  },
  {
    identity: {"entityId":"ent_167259c90ee5","vendorId":"ven_ca00646e36bd","serviceId":"svc_23582349f80c"},
    entity: "Marfeel Solutions, S.L.",
    vendor: "Marfeel",
    product: "Marfeel Analytics SDK",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "behavioral_analytics", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^sdk\.mrf\.io$/i],
    urlPatterns: [/^https:\/\/sdk\.mrf\.io\/statics\/(?:marfeel-sdk(?:\.es5)?\.js|[a-f0-9]+\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "marfeel_analytics_sdk_runtime",
  },
  {
    identity: {"entityId":"ent_6fff1c50ae7d","vendorId":"ven_504baab29c26","serviceId":"svc_8e5458ac4a59"},
    entity: "U.S. General Services Administration",
    vendor: "GSA",
    product: "Digital Analytics Program",
    aliases: ["GSA DAP"],
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "government_service", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^dap\.digitalgov\.gov$/i],
    urlPatterns: [/^https:\/\/dap\.digitalgov\.gov\/(?:Universal-Federated-Analytics(?:-Min)?\.js|web-vitals\/dist\/web-vitals(?:\.attribution)?\.iife\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "gsa_digital_analytics_program_runtime",
  },
  {
    identity: {"entityId":"ent_87d2d12313fc","vendorId":"ven_d50cdbb2b171","serviceId":"svc_cecbc5b7ef30"},
    entity: "Connatix Native Exchange Inc.",
    vendor: "Connatix",
    product: "Connatix Video Player",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "video_ad_delivery", "embedded_content", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^cd\.connatix\.com$/i],
    urlPatterns: [/^https:\/\/cd\.connatix\.com\/connatix\.player\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "connatix_video_player_runtime",
  },
  {
    identity: {"entityId":"ent_f3a28d9ca5a3","vendorId":"ven_ff543a55ab92","serviceId":"svc_6152d8f87697"},
    entity: "Yandex LLC",
    vendor: "Yandex",
    product: "Yandex Advertising Network",
    aliases: ["YAN"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "programmatic_ads", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^yastatic\.net$/i],
    urlPatterns: [/^https:\/\/yastatic\.net\/partner-code-bundles\/libs\/libs-[a-f0-9]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "yandex_advertising_network_shared_bundle",
  },
  {
    identity: {"entityId":"ent_dc18c8f6da81","vendorId":"ven_72c6542b55a1","serviceId":"svc_2177d3dfc3bb"},
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Ads",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^m\.media-amazon\.com$/i],
    urlPatterns: [/^https:\/\/m\.media-amazon\.com\/images\/G\/01\/csm\/showads\.v2\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "amazon_ads_showads_runtime",
  },
  {
    identity: {"entityId":"ent_c8803189bf0f","vendorId":"ven_391f0aa28060","serviceId":"svc_3444b41b8a09"},
    entity: "RudderStack Inc.",
    vendor: "RudderStack",
    product: "RudderStack",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "customer_data_platform", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^cdn\.rudderlabs\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.rudderlabs\.com\/(?:v\d+\/modern\/rsa(?:-plugins)?\.min\.js|\d+(?:\.\d+){2}\/modern\/plugins\/[A-Za-z0-9_.-]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "rudderstack_v3_web_sdk_runtime",
  },
  {
    identity: {"entityId":"ent_058321a378b7","vendorId":"ven_384b7efb7366","serviceId":"svc_37c54209bda6"},
    entity: "LiveInternet LLC",
    vendor: "LiveInternet",
    product: "LiveInternet Analytics Counter",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^counter\.yadro\.ru$/i],
    urlPatterns: [/^https:\/\/counter\.yadro\.ru\/logo_[A-Za-z0-9_-]+(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "liveinternet_branded_counter_logo",
  },
  {
    identity: {"entityId":"ent_082d31780b21","vendorId":"ven_064a59c898b6","serviceId":"svc_d386bcf85bed"},
    entity: "InMobi Pte. Ltd.",
    vendor: "InMobi",
    product: "InMobi Choice CMP",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "tcf", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^cmp\.inmobi\.com$/i],
    urlPatterns: [/^https:\/\/cmp\.inmobi\.com\/tcfv2\/(?:\d+\/)?(?:cmp2(?:ui-es)?\.js|google-atp-list\.json)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "inmobi_choice_tcf_runtime",
  },
  {
    identity: {"entityId":"ent_87d2d12313fc","vendorId":"ven_d50cdbb2b171","serviceId":"svc_cecbc5b7ef30"},
    entity: "Connatix Native Exchange Inc.",
    vendor: "Connatix",
    product: "Connatix Video Player",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "video_ad_delivery", "embedded_content", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cds\.connatix\.com$/i],
    urlPatterns: [/^https:\/\/cds\.connatix\.com\/p\/[A-Za-z0-9_-]+\/(?:connatix\.player\.js|elLoader\.js|p\/plugins\/prebid-cache-scraper-\d+\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "connatix_publisher_player_runtime",
  },
  {
    identity: {"entityId":"ent_546768605795","vendorId":"ven_b9e27aad5c51","serviceId":"svc_53cadf4b2144"},
    entity: "NBCUniversal Media, LLC",
    vendor: "NBCUniversal",
    product: "MPS Publisher Advertising Runtime",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_ad_server", "programmatic_ads", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^mps\.nbcuni\.com$/i],
    urlPatterns: [/^https:\/\/mps\.nbcuni\.com\/fetch\/ext\/load-[A-Za-z0-9_-]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "nbcuniversal_mps_publisher_runtime",
  },
  {
    identity: {"entityId":"ent_f9f92b0d8592","vendorId":"ven_221d059e0253","serviceId":"svc_f6b062c2bd88"},
    entity: "Versant Media Group, Inc.",
    vendor: "Versant",
    product: "MPS Publisher Advertising Runtime",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_ad_server", "programmatic_ads", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^app\.mps\.vsnt\.net$/i],
    urlPatterns: [/^https:\/\/app\.mps\.vsnt\.net\/(?:fetch\/ext\/load-[A-Za-z0-9_-]+\.js|request\/page\/json\/params\/?)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "versant_mps_publisher_runtime",
  },
  {
    identity: {"entityId":"ent_7694436b5b56","vendorId":"ven_f6c936af9edf","serviceId":"svc_aaca2b4f03c4"},
    entity: "ExoClick, S.L.",
    vendor: "ExoClick",
    product: "ExoClick Publisher Ad Provider",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "programmatic_ads", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^a\.(?:magsrv|pemsrv)\.com$/i, /^s\.magsrv\.com$/i],
    urlPatterns: [/^https:\/\/a\.(?:magsrv|pemsrv)\.com\/ad-provider\.js(?:\?|$)/i, /^https:\/\/s\.magsrv\.com\/v1\/api\.php(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "exoclick_publisher_ad_provider",
  },
  {
    identity: {"entityId":"ent_f3a0ce7ab768","vendorId":"ven_67dd3d8e908b","serviceId":"svc_648a116f378d"},
    entity: "RTB House S.A.",
    vendor: "RTB House",
    product: "RTB House Retargeting Tag",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "retargeting", "behavioral_advertising", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^tags\.creativecdn\.com$/i],
    urlPatterns: [/^https:\/\/tags\.creativecdn\.com\/[A-Za-z0-9_-]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "rtb_house_retargeting_tag",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_387746b3be19"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Marketo Measure",
    aliases: ["Bizible"],
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_attribution", "lead_tracking", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^cdn\.bizible\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.bizible\.com\/scripts\/bizible\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_marketo_measure_bizible_runtime",
  },
  {
    identity: {"entityId":"ent_db5e08114f31","vendorId":"ven_9bbb6e49f10c","serviceId":"svc_d239eef20619"},
    entity: "G2.com, Inc.",
    vendor: "G2",
    product: "G2 Conversion Tracking",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "conversion_tracking", "marketing_attribution", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^tracking\.g2crowd\.com$/i],
    urlPatterns: [/^https:\/\/tracking\.g2crowd\.com\/attribution_tracking\/conversions\/\d+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "g2_conversion_tracking_runtime",
  },
  {
    identity: {"entityId":"ent_1903358e214c","vendorId":"ven_d22bcb754b4b","serviceId":"svc_45ea8ac66aae"},
    entity: "Aditude, Inc.",
    vendor: "Aditude",
    product: "HTL BID",
    aliases: ["Hashtag Labs HTL BID"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "header_bidding", "programmatic_ads", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^htlbid\.com$/i],
    urlPatterns: [/^https:\/\/htlbid\.com\/v3\/[A-Za-z0-9.-]+\/htlbid\.(?:js|css)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "aditude_htl_bid_runtime",
  },
  {
    identity: {"entityId":"ent_83e784f24ab7","vendorId":"ven_a8911d80275c","serviceId":"svc_4de1ff28b016"},
    entity: "LivePerson, Inc.",
    vendor: "LivePerson",
    product: "LivePerson Web Messaging",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["customer_support", "chat", "messaging", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^lptag\.liveperson\.net$/i, /^lpcdn\.lpsnmedia\.net$/i],
    urlPatterns: [/^https:\/\/lptag\.liveperson\.net\/(?:tag\/tag\.js|lptag\/api\/account\/[A-Za-z0-9_-]+\/configuration\/applications)(?:\?|$)/i, /^https:\/\/lpcdn\.lpsnmedia\.net\/le_(?:secure_storage|unified_window)\/[^?#]+(?:\?|$)/i],
    cookiePatterns: [/^LPVID$/i, /^LPSID-[A-Za-z0-9_-]+$/i, /^LPCID-[A-Za-z0-9_-]+$/i, /^LPCKEY-[A-Za-z0-9_-]+$/i],
    storageKeyPatterns: [/^LPVID$/i, /^LPSID-[A-Za-z0-9_-]+$/i, /^lpLastVisit-[A-Za-z0-9_-]+$/i, /^lpTabId$/i, /^lpPmCalleeDfs$/i],
    requireUrlPatternMatch: true,
    basisLabel: "liveperson_web_messaging_runtime",
  },
  {
    identity: {"entityId":"ent_cfab93b3f370","vendorId":"ven_40ac9b32c274","serviceId":"svc_a70f676073fc"},
    entity: "Sitecore Corporation A/S",
    vendor: "Sitecore",
    product: "Sitecore Experience Analytics",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["consent", "analytics", "visitor_tracking", "first_party_runtime"],
    confidence: 1,
    cookiePatterns: [/^SC_ANALYTICS_GLOBAL_COOKIE$/],
    basisLabel: "sitecore_experience_analytics_cookie",
  },
  {
    identity: {"entityId":"ent_fd511f940e3b","vendorId":"ven_b2aeb72c3116","serviceId":"svc_a6ee1e703e18"},
    entity: "SolarWinds Worldwide, LLC",
    vendor: "Pingdom",
    product: "Pingdom Real User Monitoring",
    aliases: ["Pingdom RUM"],
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "real_user_monitoring", "telemetry", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^rum-static\.pingdom\.net$/i],
    urlPatterns: [/^https:\/\/rum-static\.pingdom\.net\/(?:prum\.min\.js|pa-[a-f0-9]+\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "pingdom_real_user_monitoring_runtime",
  },
  {
    identity: {"entityId":"ent_446d0895884c","vendorId":"ven_9b17bd2a281a","serviceId":"svc_0f284eec28d6"},
    entity: "LaunchDarkly Holdings, Inc.",
    vendor: "LaunchDarkly",
    product: "LaunchDarkly Client SDK",
    purpose: "analytics",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["experimentation", "feature_flags", "personalization", "analytics", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^app\.launchdarkly\.com$/i, /^clientstream\.launchdarkly\.com$/i],
    urlPatterns: [/^https:\/\/app\.launchdarkly\.com\/sdk\/(?:evalx\/[A-Za-z0-9_-]+\/contexts\/[A-Za-z0-9_-]+|goals\/[A-Za-z0-9_-]+)(?:\?|$)/i, /^https:\/\/clientstream\.launchdarkly\.com\/eval\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "launchdarkly_client_sdk_runtime",
  },
  {
    identity: {"entityId":"ent_6ef3ba0d8ccc","vendorId":"ven_a44a7b190718","serviceId":"svc_efbafe98baa4"},
    entity: "Ahrefs Pte. Ltd.",
    vendor: "Ahrefs",
    product: "Ahrefs Web Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["analytics", "audience_measurement", "interaction_measurement", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^analytics\.ahrefs\.com$/i],
    urlPatterns: [/^https:\/\/analytics\.ahrefs\.com\/analytics\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ahrefs_web_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_9837ea64670a","vendorId":"ven_7a7b4db29ba7","serviceId":"svc_4c9fd8b996c5"},
    entity: "Pushly, LLC",
    vendor: "Pushly",
    product: "Pushly Web Push",
    purpose: "advertising",
    servicePurpose: "Marketing automation",
    regulatoryRelevance: ["consent", "push_notifications", "audience_engagement", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.p-n\.io$/i],
    urlPatterns: [/^https:\/\/cdn\.p-n\.io\/pushly-sdk\.min\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "pushly_web_push_sdk",
  },
  {
    identity: {"entityId":"ent_9318b10a9a97","vendorId":"ven_1a3476516230","serviceId":"svc_8337782389a6"},
    entity: "Baidu, Inc.",
    vendor: "Baidu",
    product: "Baidu Tongji Analytics",
    aliases: ["Baidu Analytics"],
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^hm\.baidu\.com$/i],
    urlPatterns: [/^https:\/\/hm\.baidu\.com\/hm\.(?:js|gif)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "baidu_tongji_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_7c06b50ef95a","vendorId":"ven_f91cfe82e4cc","serviceId":"svc_33847bc95db2"},
    entity: "Automattic Inc.",
    vendor: "WordPress.com",
    product: "Automattic Analytics",
    purpose: "analytics",
    servicePurpose: "Audience measurement",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^s0\.wp\.com$/i],
    urlPatterns: [/^https:\/\/s0\.wp\.com\/wp-content\/(?:js\/bilmur\.min\.js|mu-plugins\/a8c-analytics\/(?:[A-Za-z0-9_.-]+\/)?a8c-analytics\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "automattic_a8c_analytics_runtime",
  },
  {
    identity: {"entityId":"ent_5262e317b747","vendorId":"ven_24d36c542550","serviceId":"svc_7f66b799f7cf"},
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Edge Delivery Services RUM",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "real_user_monitoring", "telemetry", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^rum\.hlx\.page$/i],
    urlPatterns: [/^https:\/\/rum\.hlx\.page\/\.rum\/[^/?#]+\/[^/?#]+\/dist\/(?:micro|rum-standalone)\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_edge_delivery_rum_runtime",
  },
  {
    identity: {"entityId":"ent_7509263a9ab6","vendorId":"ven_b460db2a4c04","serviceId":"svc_1d1f09eb2bf1"},
    entity: "Google LLC",
    vendor: "Google",
    product: "Subscribe with Google",
    purpose: "infrastructure",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["subscriptions", "embedded_content", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^news\.google\.com$/i],
    urlPatterns: [/^https:\/\/news\.google\.com\/swg\/js\/v1\/swg(?:-button|-gaa)?\.(?:js|css)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_subscribe_with_google_runtime",
  },
  {
    identity: {"entityId":"ent_f3236488b92e","vendorId":"ven_494a08c9d3fd","serviceId":"svc_84b60ce55ad6"},
    entity: "Bluesky PBLLC",
    vendor: "Bluesky",
    product: "Bluesky Embedded Post",
    purpose: "infrastructure",
    servicePurpose: "Social media embed",
    regulatoryRelevance: ["embedded_content", "social_media", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^embed\.bsky\.app$/i],
    urlPatterns: [/^https:\/\/embed\.bsky\.app\/static\/embed\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "bluesky_embedded_post_runtime",
  },
  {
    identity: {"entityId":"ent_f2a82736f68e","vendorId":"ven_0c97475796db","serviceId":"svc_859d56a254e8"},
    entity: "Meta Platforms, Inc.",
    vendor: "Instagram",
    product: "Instagram Embedded Post",
    purpose: "infrastructure",
    servicePurpose: "Social media embed",
    regulatoryRelevance: ["embedded_content", "social_media", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^www\.instagram\.com$/i],
    urlPatterns: [/^https:\/\/www\.instagram\.com\/embed\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "instagram_embedded_post_runtime",
  },
  {
    identity: {"entityId":"ent_67965ce1f545","vendorId":"ven_eba4c45044f7","serviceId":"svc_1e0d2ade2baf"},
    entity: "Tencent Holdings Ltd.",
    vendor: "Tencent Cloud",
    product: "Tencent Cloud Aegis RUM",
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "real_user_monitoring", "telemetry", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^tam\.cdn-go\.cn$/i],
    urlPatterns: [/^https:\/\/tam\.cdn-go\.cn\/aegis-sdk\/latest\/aegis\.min\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "tencent_cloud_aegis_rum_runtime",
  },
  {
    identity: {"entityId":"ent_a91508974e7f","vendorId":"ven_04a95e7dfe3d","serviceId":"svc_56a9cc837df1"},
    entity: "DebugBear Ltd.",
    vendor: "DebugBear",
    product: "DebugBear Real User Monitoring",
    aliases: ["DebugBear RUM"],
    purpose: "performance_monitoring",
    servicePurpose: "Performance monitoring",
    regulatoryRelevance: ["performance_monitoring", "real_user_monitoring", "telemetry", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.debugbear\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.debugbear\.com\/[A-Za-z0-9_-]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "debugbear_real_user_monitoring_runtime",
  },
  {
    identity: {"entityId":"ent_546768605795","vendorId":"ven_b9e27aad5c51","serviceId":"svc_de09237f05e2"},
    entity: "NBCUniversal Media, LLC",
    vendor: "NBCUniversal",
    product: "NBC News Media CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^(?:media-cldnry|media3)\.s-nbcnews\.com$/i],
    urlPatterns: [/^https:\/\/media-cldnry\.s-nbcnews\.com\/image\/upload\/[^?#]+(?:\?|$)/i, /^https:\/\/media3\.s-nbcnews\.com\/i\/newscms\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "nbcuniversal_news_media_cdn",
  },
  {
    identity: {"entityId":"ent_92555d96aa38","vendorId":"ven_cd7cc0c72485","serviceId":"svc_1902fe1b3506"},
    entity: "Fandango Media, LLC",
    vendor: "Fandango at Home",
    product: "Fandango at Home Media CDN",
    aliases: ["Vudu Media CDN"],
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^images2\.vudu\.com$/i],
    urlPatterns: [/^https:\/\/images2\.vudu\.com\/assets\/content\/(?:poster|background)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "fandango_at_home_media_cdn",
  },
  {
    identity: {"entityId":"ent_f9c14c6b4ba8","vendorId":"ven_ef29f64ac45c","serviceId":"svc_da2eba842ec9"},
    entity: "Brightspot, Inc.",
    vendor: "Brightspot",
    product: "Brightspot Content CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "content_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^[A-Za-z0-9-]+\.brightspotcdn\.com$/i],
    urlPatterns: [
      /^https:\/\/[A-Za-z0-9-]+\.brightspotcdn\.com\/(?:dims4\/|resource\/[^/?#]+\/styleguide\/)[^?#]+(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "brightspot_content_cdn",
  },
  {
    identity: {"entityId":"ent_921f1c35a45d","vendorId":"ven_2ceb9c67fcae","serviceId":"svc_ef5df506a791"},
    entity: "Hammy Media Ltd.",
    vendor: "xHamster",
    product: "xHamster Content CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.98,
    hostPatterns: [/^static-ah\.xhcdn\.com$/i, /^ic-(?:(?:vt|vrm)-nss|nss)\.xhcdn\.com$/i],
    urlPatterns: [
      /^https:\/\/static-ah\.xhcdn\.com\/(?:xh-desktop|xh-images|xh-shared)\/[^?#]+(?:\?|$)/i,
      /^https:\/\/ic-(?:(?:vt|vrm)-nss|nss)\.xhcdn\.com\/a\/[^?#]+(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "xhamster_content_cdn",
  },
  {
    identity: {"entityId":"ent_ee921b3d61d8","vendorId":"ven_b8f40673b44a","serviceId":"svc_39963f1db288"},
    entity: "WGCZ Holding a.s.",
    vendor: "XNXX",
    product: "XNXX Content CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.98,
    hostPatterns: [/^assets-cdn77\.xnxx-cdn\.com$/i],
    urlPatterns: [/^https:\/\/assets-cdn77\.xnxx-cdn\.com\/(?:v-[a-f0-9]+\/v3|v3)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "xnxx_content_cdn",
  },
  {
    identity: {"entityId":"ent_87d067d83a1e","vendorId":"ven_04baa06c0aba","serviceId":"svc_a476d52e4c08"},
    entity: "eBay Inc.",
    vendor: "eBay",
    product: "eBay Static Content CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "content_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^ir\.ebaystatic\.com$/i, /^i\.ebayimg\.com$/i],
    urlPatterns: [
      /^https:\/\/ir\.ebaystatic\.com\/(?:cr\/(?:ebay-rum\/cdn-assets|v\/(?:c01|c1))|rs\/c|pictures\/aw)\/[^?#]+(?:\?|$)/i,
      /^https:\/\/i\.ebayimg\.com\/(?:00|images)\/[^?#]+(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "ebay_static_content_cdn",
  },
  {
    identity: {"entityId":"ent_f2a82736f68e","vendorId":"ven_0c97475796db","serviceId":"svc_7fb82ee11aeb"},
    entity: "Meta Platforms, Inc.",
    vendor: "Instagram",
    product: "Instagram Media CDN",
    aliases: ["Instagram CDN"],
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "social_media"],
    confidence: 0.99,
    hostPatterns: [/^scontent-[a-z0-9-]+\.cdninstagram\.com$/i],
    urlPatterns: [/^https:\/\/scontent-[a-z0-9-]+\.cdninstagram\.com\/v\/t51\.(?:71878|82787)-15\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "instagram_media_cdn",
  },
  {
    identity: {"entityId":"ent_d6a1d1aceac8","vendorId":"ven_b84dff54d159","serviceId":"svc_eabdd711e10b"},
    entity: "WebMD LLC",
    vendor: "WebMD",
    product: "WebMD Static Content CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "content_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^img(?:\.lb(?:\.staging)?)?\.wbmdstatic\.com$/i],
    urlPatterns: [/^https:\/\/img(?:\.lb(?:\.staging)?)?\.wbmdstatic\.com\/(?:vim\/live\/|webmd_(?:v1_)?static_vue\/)[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "webmd_static_content_cdn",
  },
  {
    identity: {"entityId":"ent_dc18c8f6da81","vendorId":"ven_72c6542b55a1","serviceId":"svc_3540703b1731"},
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Media CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "content_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^m\.media-amazon\.com$/i, /^images-eu\.ssl-images-amazon\.com$/i],
    urlPatterns: [
      /^https:\/\/m\.media-amazon\.com\/images\/(?:G\/(?:01\/gno|42)|I)\/[^?#]+(?:\?|$)/i,
      /^https:\/\/images-eu\.ssl-images-amazon\.com\/images\/G\/42\/[^?#]+(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "amazon_media_content_cdn",
  },
  {
    identity: {"entityId":"ent_f3a28d9ca5a3","vendorId":"ven_ff543a55ab92","serviceId":"svc_7459c3d9e5e7"},
    entity: "Yandex LLC",
    vendor: "Yandex",
    product: "Yandex Hosted Runtime Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "maps", "games"],
    confidence: 0.99,
    hostPatterns: [/^yastatic\.net$/i],
    urlPatterns: [
      /^https:\/\/yastatic\.net\/(?:react\/\d+\.\d+\.\d+\/|s3\/(?:front-maps-static|games-static)\/)[^?#]+(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "yandex_hosted_runtime_assets",
  },
  {
    identity: {"entityId":"ent_a3c6b6fd103b","vendorId":"ven_39485213584b","serviceId":"svc_41f75939c484"},
    entity: "Salesforce, Inc.",
    vendor: "Salesforce",
    product: "Salesforce Embedded Service Chat",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["customer_support", "chat", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^[a-z0-9-]+\.my\.site\.com$/i],
    urlPatterns: [
      /^https:\/\/[a-z0-9-]+\.my\.site\.com\/[A-Za-z0-9_-]+\/assets\/(?:js\/bootstrap\.min\.js|styles\/bootstrap\.min\.css)(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "salesforce_embedded_service_chat_runtime",
  },
  {
    identity: {"entityId":"ent_65fb7880d373","vendorId":"ven_9f535cab9021","serviceId":"svc_94276d2e7c63"},
    entity: "NICE Ltd.",
    vendor: "NICE CXone",
    product: "NICE CXone Live Chat",
    purpose: "customer_support",
    servicePurpose: "Customer support",
    regulatoryRelevance: ["customer_support", "chat", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^home-[a-z0-9-]+\.niceincontact\.com$/i],
    urlPatterns: [/^https:\/\/home-[a-z0-9-]+\.niceincontact\.com\/inContact\/ChatClient\/js\/embed\.min\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "nice_cxone_live_chat_runtime",
  },
  {
    identity: {"entityId":"ent_9cfaa54c9182","vendorId":"ven_26e7f4ed508a","serviceId":"svc_3ea5c7125451"},
    entity: "Sanity AS",
    vendor: "Sanity",
    product: "Sanity Image CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery"],
    confidence: 0.99,
    hostPatterns: [/^cdn\.sanity\.io$/i],
    urlPatterns: [/^https:\/\/cdn\.sanity\.io\/images\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "sanity_image_cdn",
  },
  {
    identity: {"entityId":"ent_1b9c2494aaa1","vendorId":"ven_59846cc3b6e9","serviceId":"svc_ea24dc264bba"},
    entity: "DPG Media Group N.V.",
    vendor: "DPG Media",
    product: "DPG Media Privacy Consent",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "privacy_choices", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^myprivacy-static\.dpgmedia\.net$/i, /^myprivacy\.dpgmedia\.be$/i],
    urlPatterns: [
      /^https:\/\/myprivacy-static\.dpgmedia\.net\/consent(?:\.js|\/resources\/)[^?#]*(?:\?|$)/i,
      /^https:\/\/myprivacy\.dpgmedia\.be\/consent(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "dpg_media_privacy_consent_runtime",
  },
  {
    identity: {"entityId":"ent_19b7eb3ce74d","vendorId":"ven_0cb5ae89b0bd","serviceId":"svc_44c221134570"},
    entity: "Advance Magazine Publishers Inc.",
    vendor: "Condé Nast",
    product: "Condé Nast Advertising Runtime",
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "header_bidding", "publisher_monetization"],
    confidence: 0.99,
    hostPatterns: [/^ads-static\.conde\.digital$/i],
    urlPatterns: [/^https:\/\/ads-static\.conde\.digital\/production\/cns\/builds\/[A-Za-z0-9_-]+\/(?:prebid\.min|pixelpropagate\.min|v\d+)\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "conde_nast_advertising_runtime",
  },
  {
    identity: {"entityId":"ent_19b7eb3ce74d","vendorId":"ven_0cb5ae89b0bd","serviceId":"svc_12e7874094b2"},
    entity: "Advance Magazine Publishers Inc.",
    vendor: "Condé Nast",
    product: "Condé Nast Privacy Runtime",
    purpose: "consent_management",
    servicePurpose: "Consent management",
    regulatoryRelevance: ["consent_management", "privacy_choices", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^privacy\.condenastdigital\.com$/i],
    urlPatterns: [/^https:\/\/privacy\.condenastdigital\.com\/fides\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "conde_nast_privacy_runtime",
  },
  {
    identity: {"entityId":"ent_a2021c85eaed","vendorId":"ven_89d8794be394","serviceId":"svc_2521ff87cd6e"},
    entity: "Grammarly, Inc.",
    vendor: "Grammarly",
    product: "Grammarly Runtime Telemetry",
    purpose: "analytics",
    servicePurpose: "Analytics",
    regulatoryRelevance: ["analytics", "telemetry", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^f-log-at\.grammarly\.io$/i],
    urlPatterns: [/^https:\/\/f-log-at\.grammarly\.io\/log(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "grammarly_runtime_telemetry",
  },
  {
    identity: {"entityId":"ent_5095c10a0154","vendorId":"ven_ec30bdf2129a","serviceId":"svc_67d03aa70653"},
    entity: "Ninetailed GmbH",
    vendor: "Ninetailed",
    product: "Ninetailed Personalization",
    purpose: "analytics",
    servicePurpose: "Personalisation",
    regulatoryRelevance: ["personalization", "profile_management", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^experience\.ninetailed\.co$/i],
    urlPatterns: [/^https:\/\/experience\.ninetailed\.co\/v2\/organizations\/[A-Za-z0-9_-]+\/environments\/[A-Za-z0-9_-]+\/profiles(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ninetailed_personalization_runtime",
  },
  {
    identity: {"entityId":"ent_86ce96cd8c0e","vendorId":"ven_69c379de28e8","serviceId":"svc_7b7854a77e61"},
    entity: "fluct, Inc.",
    vendor: "Fluct",
    product: "Fluct Publisher Advertising",
    aliases: ["ADINGO"],
    purpose: "advertising",
    servicePurpose: "Advertising",
    regulatoryRelevance: ["consent", "advertising", "header_bidding", "publisher_monetization"],
    confidence: 0.98,
    hostPatterns: [/^fam\.adingo\.jp$/i, /^pdn\.adingo\.jp$/i],
    urlPatterns: [
      /^https:\/\/fam\.adingo\.jp\/bid-strap\/[A-Za-z0-9_-]+\/pb\.js(?:\?|$)/i,
      /^https:\/\/pdn\.adingo\.jp\/p\.js(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "fluct_adingo_publisher_advertising_runtime",
  },
  {
    identity: {"entityId":"ent_cfdc038bcf5c","vendorId":"ven_c8da4b80d8fd","serviceId":"svc_e6a07906409a"},
    entity: "Houzz Inc.",
    vendor: "Houzz",
    product: "Houzz Static Content CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "content_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^www\.hzcdn\.io$/i],
    urlPatterns: [/^https:\/\/www\.hzcdn\.io\/bff\/static\/(?:css|js|media)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "houzz_static_content_cdn",
  },
  {
    identity: {"entityId":"ent_3c34e31e721c","vendorId":"ven_e5fa52925eff","serviceId":"svc_cc34f8818b71"},
    entity: "PolySpeak",
    vendor: "PolySpeak",
    product: "PolySpeak Web Runtime",
    purpose: "infrastructure",
    servicePurpose: "Content delivery",
    regulatoryRelevance: ["hosted_assets", "content_delivery", "third_party_runtime"],
    confidence: 0.98,
    hostPatterns: [/^web-cdn\.polyspeak\.ai$/i],
    urlPatterns: [/^https:\/\/web-cdn\.polyspeak\.ai\/polyweb-static\/[A-Za-z0-9_.-]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "polyspeak_web_runtime",
  },
  {
    identity: {"entityId":"ent_85318184242b","vendorId":"ven_bc6cf00fdcfe","serviceId":"svc_cf50f0f1cad0"},
    entity: "Aylo Freesites Ltd.",
    vendor: "RedTube",
    product: "RedTube Static Content CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "content_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^ei\.rdtcdn\.com$/i],
    urlPatterns: [/^https:\/\/ei\.rdtcdn\.com\/www-static\/cdn_files\/redtube\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "redtube_static_content_cdn",
  },
  {
    identity: {"entityId":"ent_eb27d0a27447","vendorId":"ven_88a01f9fb5b6","serviceId":"svc_521bf1e446df"},
    entity: "Vinted UAB",
    vendor: "Vinted",
    product: "Vinted Marketplace Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^marketplace-web-assets\.vinted\.com$/i],
    urlPatterns: [/^https:\/\/marketplace-web-assets\.vinted\.com\/_next\/static\/(?:chunks|css|media)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "vinted_marketplace_web_assets",
  },
  {
    identity: {"entityId":"ent_1caf8de764a9","vendorId":"ven_347e0a939c49","serviceId":"svc_f85bee825b83"},
    entity: "Argos Limited",
    vendor: "Argos",
    product: "Argos Media CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^media\.4rgos\.it$/i],
    urlPatterns: [/^https:\/\/media\.4rgos\.it\/i\/Argos\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "argos_media_cdn",
  },
  {
    identity: {"entityId":"ent_7958a6fe863a","vendorId":"ven_eea6f01ad886","serviceId":"svc_c90687bddf9b"},
    entity: "Bonnier News AB",
    vendor: "Bonnier News",
    product: "Bonnier News Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^static\.bonniernews\.se$/i],
    urlPatterns: [/^https:\/\/static\.bonniernews\.se\/(?:ba\/|bundles\/)[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "bonnier_news_static_assets",
  },
  {
    identity: {"entityId":"ent_d3a1e428e6d2","vendorId":"ven_a9b95e01ed69","serviceId":"svc_c2572ca0eb26"},
    entity: "Info Edge (India) Limited",
    vendor: "Naukri",
    product: "Naukri Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^static\.naukimg\.com$/i],
    urlPatterns: [/^https:\/\/static\.naukimg\.com\/s\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "naukri_static_assets",
  },
  {
    identity: {"entityId":"ent_f2a82736f68e","vendorId":"ven_043da4442d9b","serviceId":"svc_2b4e4c9bee0c"},
    entity: "Meta Platforms, Inc.",
    vendor: "Meta",
    product: "Facebook Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "social_media"],
    confidence: 0.99,
    hostPatterns: [/^static\.xx\.fbcdn\.net$/i],
    urlPatterns: [/^https:\/\/static\.xx\.fbcdn\.net\/rsrc\.php\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "facebook_static_assets",
  },
  {
    identity: {"entityId":"ent_eff84ee75283","vendorId":"ven_e6903d061001","serviceId":"svc_24356d03cd50"},
    entity: "ZAM Network, LLC",
    vendor: "Wowhead",
    product: "Wowhead Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^wow\.zamimg\.com$/i],
    urlPatterns: [/^https:\/\/wow\.zamimg\.com\/(?:css|images|js)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "wowhead_static_assets",
  },
  {
    identity: {"entityId":"ent_1430aee3b38b","vendorId":"ven_4cdb8ffc9311","serviceId":"svc_831844ed6f0a"},
    entity: "RCS MediaGroup S.p.A.",
    vendor: "RCS MediaGroup",
    product: "Gazzetta Web Components",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^components2\.gazzettaobjects\.it$/i],
    urlPatterns: [/^https:\/\/components2\.gazzettaobjects\.it\/rcs_[A-Za-z0-9_-]+\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "gazzetta_web_components",
  },
  {
    identity: {"entityId":"ent_fd0925d23d2e","vendorId":"ven_26c7492fa328","serviceId":"svc_cf42838b362a"},
    entity: "Forbes Media LLC",
    vendor: "Forbes",
    product: "Forbes Media Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^i\.forbesimg\.com$/i, /^imageio\.forbes\.com$/i],
    urlPatterns: [
      /^https:\/\/i\.forbesimg\.com\/assets\/[^?#]+(?:\?|$)/i,
      /^https:\/\/i\.forbesimg\.com\/simple-site\/_next\/static\/[^?#]+(?:\?|$)/i,
      /^https:\/\/imageio\.forbes\.com\/specials-images\/imageserve\/[A-Za-z0-9_-]+\/[^?#]+(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "forbes_media_assets",
  },
  {
    identity: {"entityId":"ent_2e99bb76e8a7","vendorId":"ven_c62a72a9d065","serviceId":"svc_996e827577b4"},
    entity: "Dante International S.A.",
    vendor: "eMAG",
    product: "eMAG Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^s13emagst\.akamaized\.net$/i],
    urlPatterns: [/^https:\/\/s13emagst\.akamaized\.net\/(?:assets|layout)\/ro\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "emag_static_assets",
  },
  {
    identity: {"entityId":"ent_971f4694b16b","vendorId":"ven_a0241a8fbce9","serviceId":"svc_2dc4575bcb31"},
    entity: "The New York Times Company",
    vendor: "The New York Times",
    product: "New York Times Media Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^static01\.nyt\.com$/i],
    urlPatterns: [/^https:\/\/static01\.nyt\.com\/(?:vi-assets\/static-assets|video-static\/betamax)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "new_york_times_media_assets",
  },
  {
    identity: {"entityId":"ent_45d99037babd","vendorId":"ven_d6a4fd4c6442","serviceId":"svc_197ecf8f2dd0"},
    entity: "Ant Group Co., Ltd.",
    vendor: "Ant Group",
    product: "Alipay Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^gw\.alipayobjects\.com$/i],
    urlPatterns: [/^https:\/\/gw\.alipayobjects\.com\/(?:os\/lib\/[A-Za-z0-9@._-]+|render\/p\/yuyan\/[A-Za-z0-9_-]+)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "alipay_web_assets",
  },
  {
    identity: {"entityId":"ent_ba001a18020d","vendorId":"ven_846122110ab0","serviceId":"svc_3dfaea701062"},
    entity: "Walmart Inc.",
    vendor: "Walmart",
    product: "Walmart Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^i5\.(?:walmart|samsclub)images\.com$/i],
    urlPatterns: [/^https:\/\/i5\.(?:walmart|samsclub)images\.com\/(?:dfw|beacon)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "walmart_static_assets",
  },
  {
    identity: {"entityId":"ent_eb820af249fc","vendorId":"ven_e3f6ebdd08d0","serviceId":"svc_2ca08bd54dd0"},
    entity: "Apple Inc.",
    vendor: "Apple",
    product: "Apple Media CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "third_party_runtime"],
    confidence: 0.99,
    hostPatterns: [/^is\d+-ssl\.mzstatic\.com$/i],
    urlPatterns: [/^https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "apple_media_cdn",
  },
  {
    identity: {"entityId":"ent_3c255efc765c","vendorId":"ven_2b7d650a05a9","serviceId":"svc_36c8249e7945"},
    entity: "GitHub, Inc.",
    vendor: "GitHub",
    product: "GitHub Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^github\.githubassets\.com$/i],
    urlPatterns: [/^https:\/\/github\.githubassets\.com\/assets\/[A-Za-z0-9_.-]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "github_static_assets",
  },
  {
    identity: {"entityId":"ent_85318184242b","vendorId":"ven_a729bda08768","serviceId":"svc_a22b9e5a3678"},
    entity: "Aylo Freesites Ltd.",
    vendor: "Pornhub",
    product: "Pornhub Static Runtime",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^cdn1d-static-shared\.phncdn\.com$/i, /^cdn1-smallimg\.phncdn\.com$/i],
    urlPatterns: [
      /^https:\/\/cdn1d-static-shared\.phncdn\.com\/(?:head\/load|timings)-\d+\.\d+\.\d+\.js(?:\?|$)/i,
      /^https:\/\/cdn1-smallimg\.phncdn\.com\/[A-Za-z0-9_-]+\/rta-1\.gif(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "pornhub_static_runtime",
  },
  {
    identity: {"entityId":"ent_61806432a44d","vendorId":"ven_2eaf20ecd0a4","serviceId":"svc_47c63037ec37"},
    entity: "Contentstack Inc.",
    vendor: "Contentstack",
    product: "Contentstack Image CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery"],
    confidence: 0.99,
    hostPatterns: [/^(?:eu-)?images\.contentstack\.com$/i],
    urlPatterns: [/^https:\/\/(?:eu-)?images\.contentstack\.com\/v3\/assets\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "contentstack_image_cdn",
  },
  {
    identity: {"entityId":"ent_01ebc69d88a1","vendorId":"ven_2967b08fd939","serviceId":"svc_6291060ae358"},
    entity: "Recruit Co., Ltd.",
    vendor: "Hot Pepper",
    product: "Hot Pepper Media Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^imgfp\.hotp\.jp$/i],
    urlPatterns: [/^https:\/\/imgfp\.hotp\.jp\/SYS\/PC\/(?:css|images)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hot_pepper_media_assets",
  },
  {
    identity: {"entityId":"ent_fb83a0668f63","vendorId":"ven_90b78987a5f8","serviceId":"svc_9d7c01e7b3d4"},
    entity: "iHeartMedia, Inc.",
    vendor: "iHeartMedia",
    product: "iHeart Embedded Media",
    purpose: "infrastructure",
    servicePurpose: "Embedded media",
    regulatoryRelevance: ["embedded_content", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^www\.iheart\.com$/i],
    urlPatterns: [/^https:\/\/www\.iheart\.com\/(?:playlist\/[^?#]+|v\d+\.\d+\.\d+\/[a-f0-9]+\/bundles\/[A-Za-z0-9_.-]+\.widget\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "iheart_embedded_media",
  },
  {
    identity: {"entityId":"ent_b16bd3e7785f","vendorId":"ven_0413e7676f39","serviceId":"svc_17837d9e47df"},
    entity: "Jusbrasil Tecnologia Ltda.",
    vendor: "Jusbrasil",
    product: "Jusbrasil Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^static\.jusbr\.com$/i],
    urlPatterns: [/^https:\/\/static\.jusbr\.com\/(?:libs\/[^?#]+|web\/alabama\/_next\/static\/[^?#]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "jusbrasil_static_assets",
  },
  {
    identity: {"entityId":"ent_f9568de460b1","vendorId":"ven_b04f6e7c3d56","serviceId":"svc_54ee1ee640c9"},
    entity: "FACEIT Ltd.",
    vendor: "FACEIT",
    product: "FACEIT Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^cdn-frontend\.faceit-cdn\.net$/i],
    urlPatterns: [/^https:\/\/cdn-frontend\.faceit-cdn\.net\/web-next\/_next\/static\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "faceit_web_assets",
  },
  {
    identity: {"entityId":"ent_0baaadc76b82","vendorId":"ven_d704e7e3fea9","serviceId":"svc_b743f88f0bb9"},
    entity: "Freelancer Technology Pty Limited",
    vendor: "Freelancer",
    product: "Freelancer Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^www\.f-cdn\.com$/i],
    urlPatterns: [/^https:\/\/www\.f-cdn\.com\/assets\/main\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "freelancer_web_assets",
  },
  {
    identity: {"entityId":"ent_345be4695e28","vendorId":"ven_d4c713754740","serviceId":"svc_c389cd2a108b"},
    entity: "bol.com B.V.",
    vendor: "bol.com",
    product: "bol.com Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^assets\.s-bol\.com$/i],
    urlPatterns: [/^https:\/\/assets\.s-bol\.com\/_remix\/[A-Za-z0-9_.-]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "bol_web_assets",
  },
  {
    identity: {"entityId":"ent_e63c05b13051","vendorId":"ven_88d4f0ee6da3","serviceId":"svc_53f5e79fa259"},
    entity: "ARD-aktuell",
    vendor: "Tagesschau",
    product: "Tagesschau Image CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^images\.tagesschau\.de$/i],
    urlPatterns: [/^https:\/\/images\.tagesschau\.de\/image\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "tagesschau_image_cdn",
  },
  {
    identity: {"entityId":"ent_ff28de1e07c8","vendorId":"ven_c8521d28e89e","serviceId":"svc_2a3fccdb09de"},
    entity: "Magazine Luiza S.A.",
    vendor: "Magazine Luiza",
    product: "Magazine Luiza Media CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^(?:wx|s)\.mlcdn\.com\.br$/i],
    urlPatterns: [/^https:\/\/wx\.mlcdn\.com\.br\/(?:ponzi\/assets|site\/shared)\/[^?#]+(?:\?|$)/i, /^https:\/\/s\.mlcdn\.com\.br\/banner\/campanhas\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "magazine_luiza_media_cdn",
  },
  {
    identity: {"entityId":"ent_d39f93963b49","vendorId":"ven_9466ccc2ce9a","serviceId":"svc_e6882f521ef9"},
    entity: "Hürriyet Gazetecilik ve Matbaacılık A.Ş.",
    vendor: "Hürriyet",
    product: "Hürriyet Image CDN",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^image\.hurimg\.com$/i],
    urlPatterns: [/^https:\/\/image\.hurimg\.com\/i\/hurriyet\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hurriyet_image_cdn",
  },
  {
    identity: {"entityId":"ent_13c6c25fe84d","vendorId":"ven_722e3148968a","serviceId":"svc_16ff2befddad"},
    entity: "El Mercurio S.A.P.",
    vendor: "Emol",
    product: "Emol Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^static\.emol\.cl$/i],
    urlPatterns: [/^https:\/\/static\.emol\.cl\/emol50\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "emol_static_assets",
  },
  {
    identity: {"entityId":"ent_1d78066fd8c9","vendorId":"ven_575c80f2dc0d","serviceId":"svc_3ec46a93fff3"},
    entity: "Industria de Diseño Textil, S.A.",
    vendor: "Zara",
    product: "Zara Static Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^static\.zara\.net$/i],
    urlPatterns: [/^https:\/\/static\.zara\.net\/stdstatic\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "zara_static_assets",
  },
  {
    identity: {"entityId":"ent_3b60a767d2a1","vendorId":"ven_c078c522fe03","serviceId":"svc_4b49b9922ccd"},
    entity: "Bennett, Coleman and Company Limited",
    vendor: "The Economic Times",
    product: "Economic Times Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^js\.etimg\.com$/i],
    urlPatterns: [/^https:\/\/js\.etimg\.com\/etnextweball\/_next\/static\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "economic_times_web_assets",
  },
  {
    identity: {"entityId":"ent_4e1867d5fec9","vendorId":"ven_3c700d411bb3","serviceId":"svc_d3b352a7f471"},
    entity: "ASOS plc",
    vendor: "ASOS",
    product: "ASOS Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^assets\.asosservices\.com$/i],
    urlPatterns: [/^https:\/\/assets\.asosservices\.com\/asos-ui\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "asos_web_assets",
  },
  {
    identity: {"entityId":"ent_cd6cbc21fce3","vendorId":"ven_da76d79b1822","serviceId":"svc_214f8040adb5"},
    entity: "Trip.com Group Limited",
    vendor: "Trip.com",
    product: "Trip.com Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^aw-s\.tripcdn\.com$/i],
    urlPatterns: [/^https:\/\/aw-s\.tripcdn\.com\/NFES\/mfe_[A-Za-z0-9_-]+\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "trip_web_assets",
  },
  {
    identity: {"entityId":"ent_1427d33aff94","vendorId":"ven_c58f2fbb63ff","serviceId":"svc_9e282fcd98e0"},
    entity: "Expedia Group, Inc.",
    vendor: "Expedia",
    product: "Expedia Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^c\.travel-assets\.com$/i],
    urlPatterns: [/^https:\/\/c\.travel-assets\.com\/lotus-home-ui\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "expedia_web_assets",
  },
  {
    identity: {"entityId":"ent_2a81c5ea0c91","vendorId":"ven_57a48477d13b","serviceId":"svc_89e71eaf1404"},
    entity: "Washington University in St. Louis",
    vendor: "Washington University in St. Louis",
    product: "Washington University Web Assets",
    purpose: "infrastructure",
    servicePurpose: "Infrastructure",
    regulatoryRelevance: ["hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^washu\.edu$/i],
    urlPatterns: [/^https:\/\/washu\.edu\/app\/plugins\/[A-Za-z0-9_-]+\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "washington_university_web_assets",
  },
  {
    identity: {"entityId":"ent_cdeeccb439be","vendorId":"ven_a179dcfd3a76","serviceId":"svc_3bb560c7bd9a"},
    entity: "Fair Economy Media GmbH",
    vendor: "Fair Economy Media",
    product: "Fair Economy Media Web Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "hosted_assets", "publisher_infrastructure"],
    confidence: 0.99,
    hostPatterns: [/^resources\.faireconomy\.media$/i],
    urlPatterns: [/^https:\/\/resources\.faireconomy\.media\/(?:css|fonts|js\.min)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "fair_economy_media_web_assets",
  },
  {
    identity: {"entityId":"ent_f068a66d9336","vendorId":"ven_43aa14125bd9","serviceId":"svc_7f6659b74be9"},
    entity: "Alibaba Group Holding Limited",
    vendor: "Alibaba",
    product: "Alibaba and Lazada Hosted Assets",
    purpose: "infrastructure",
    servicePurpose: "CDN",
    regulatoryRelevance: ["cdn", "media_delivery", "hosted_assets"],
    confidence: 0.99,
    hostPatterns: [/^img\.alicdn\.com$/i, /^g\.lazcdn\.com$/i],
    urlPatterns: [/^https:\/\/img\.alicdn\.com\/imgextra\/i[1-4]\/[^?#]+(?:\?|$)/i, /^https:\/\/g\.lazcdn\.com\/g\/(?:code\/npm|lazada-search-fe|lzd)\/[^?#]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "alibaba_lazada_hosted_assets",
  },
];

export function resolveVendorDisplayCategory(input: VendorDisplayCategoryInput): VendorDisplayCategory {
  const label = `${input.vendor ?? ""} ${input.product ?? ""}`.toLowerCase();
  const relevance = (input.regulatoryRelevance ?? []).join(" ").toLowerCase();
  const purpose = typeof input.purpose === "string" ? input.purpose.toLowerCase() : "";
  const haystack = `${label} ${relevance} ${purpose}`;

  if (/google sign.?in|identity services|authentication/.test(haystack)) {
    return "Authentication";
  }
  if (/stripe|payment_processing|payment processor/.test(haystack)) {
    return "Payment processors";
  }
  if (/cloudflare bot management|bot_detection|fraud_prevention|security/.test(haystack)) {
    return "Security";
  }
  if (/onetrust|cookiebot|usercentrics|didomi|hubspot banner|consent_management|cookie compliance|cmp\b/.test(haystack)) {
    return "Cookie compliance";
  }
  if (/hubspot ads pixel/.test(haystack)) {
    return "Advertising";
  }
  if (/hubspot analytics/.test(haystack)) {
    return "Analytics";
  }
  if (/klaviyo|izooto|hubspot|marketing_automation|marketing automation|push_notifications|push notifications|email_personalization|email personalization|lead_capture|lead capture|crm/.test(haystack)) {
    return "Marketing automation";
  }
  if (purpose === "advertising") {
    return "Advertising";
  }
  if (/piano|tinypass|cxense|personalization|personalisation|paywall|subscription|audience_management/.test(haystack)) {
    return "Personalisation";
  }
  if (
    (
      /\bembedded_content\b|\bsocial_embed\b|\bvideo_player\b/.test(relevance) &&
      /\bembed(?:ded)?\b|\bplayer\b|\bplugin\b|\bwidget\b/.test(label)
    ) ||
    /\bvideo_player\b|\bsocial_embed\b/.test(purpose)
  ) {
    return "Embedded media";
  }
  if (/jsdelivr|cdn\b|font_delivery|content delivery/.test(haystack)) {
    return "CDN";
  }
  if (/optimizely|experimentation|ab_testing|a\/b/.test(haystack)) {
    return "A/B Testing";
  }
  if (/session_replay|session replay|clarity|hotjar|fullstory/.test(haystack)) {
    return "Session replay";
  }
  if (/tag_management|tag management|tag_manager|google tag manager/.test(haystack)) {
    return "Tag management";
  }
  if (/comscore|scorecardresearch/.test(haystack)) {
    return "Analytics";
  }
  if (/advertising|ad_delivery|ad_measurement|programmatic|brand_safety|floodlight|adsense|publisher tag|quantcast|integral ad science|bombora/.test(haystack)) {
    return "Advertising";
  }
  if (/analytics|measurement|audience_measurement/.test(haystack)) {
    return "Analytics";
  }
  if (/performance_monitoring|performance monitoring/.test(haystack)) {
    return "Performance monitoring";
  }
  if (/customer_support|customer support/.test(haystack)) {
    return "Customer support";
  }

  return "Unknown";
}

/** Registry metadata, not a second registry or an observation of actual use. */
export function getCanonicalVendorPurposeDefinitions() {
  return rules.map(({ entity, vendor, product, purpose, servicePurpose, basisLabel, confidence, regulatoryRelevance }) => ({
    entity, vendor, product, purpose, servicePurpose, ruleId: basisLabel, confidence,
    regulatoryRelevance: [...regulatoryRelevance],
  }));
}

/** One registry manifest for QA and maintenance. Imported rules are not represented
 * as independently reviewed, and these metadata never create findings. */
export function getCanonicalVendorRegistryManifest() {
  return {
    contractVersion: "vendor-registry-manifest-v1" as const,
    resolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
    rules: rules.map(rule => ({
      ruleId: rule.basisLabel,
      ...rule.identity,
      entity: rule.entity,
      vendor: rule.vendor,
      product: rule.product,
      purpose: rule.purpose,
      servicePurpose: rule.servicePurpose,
      review: rule.review
        ? { status: "source_reviewed" as const, ...rule.review, sourceUrls: [...rule.review.sourceUrls] }
        : { status: "legacy_unreviewed" as const },
    })),
  };
}

export type CanonicalVendorResolution =
  | { status: "resolved"; observation: NormalizedVendorObservation }
  | { status: "ambiguous" | "unrecognized"; observation: null };

const matchStrength: Record<VendorRegistryAttribution["matchKind"], number> = {
  endpoint: 3, cookie_context: 3, runtime_signature: 3, cookie_name: 2, hostname: 1,
};

/** Resolve ONE observed resource, not a batch of unrelated evidence. Specific
 * signatures beat host-only matches. Equally specific different services remain
 * ambiguous; array order and numeric rule confidence cannot break that tie. */
export function resolveCanonicalVendor(input: VendorResolverInput): CanonicalVendorResolution {
  const candidates = resolveVendorObservations([input]);
  if (!candidates.length) return { status: "unrecognized", observation: null };
  const strength = (row: NormalizedVendorObservation) => matchStrength[row.registryAttribution!.matchKind];
  const maximum = Math.max(...candidates.map(strength));
  const strongest = candidates.filter(row => strength(row) === maximum);
  return strongest.length === 1
    ? { status: "resolved", observation: strongest[0]! }
    : { status: "ambiguous", observation: null };
}

/** Resolve a precise service identity, including retained pre-v1 observations.
 * Vendor/host ownership alone must not borrow another product's purpose. */
export function resolveCanonicalServicePurpose(input: {
  product?: string | null;
  vendor?: string | null;
  entity?: string | null;
}): VendorServicePurpose {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const product = input.product ? normalize(input.product) : "";
  if (!product) return "Unknown";
  const matches = rules.filter((rule) =>
    [rule.product, ...(rule.aliases ?? [])].some((candidate) => normalize(candidate) === product) &&
    (!input.vendor || normalize(rule.vendor) === normalize(input.vendor)) &&
    (!input.entity || normalize(rule.entity) === normalize(input.entity))
  );
  const purposes = new Set(matches.map((rule) => rule.servicePurpose));
  return purposes.size === 1 ? matches[0]!.servicePurpose : "Unknown";
}

export function resolveCanonicalVendorLabel(value: string | null | undefined): CanonicalVendorLabelResolution | null {
  const normalizedValue = value?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedValue)) {
    const hostnameObservation = resolveCanonicalVendor({
      type: "request",
      hostname: normalizedValue,
      matchSource: "network_request",
    }).observation;
    if (hostnameObservation) {
      return canonicalVendorLabelResolution(hostnameObservation, "canonical_hostname_label");
    }
  }

  const matchesLabel = (rule: VendorRule, label: string) =>
    [rule.product, rule.vendor, ...(rule.aliases ?? [])]
      .some((candidate) => candidate.trim().replace(/\s+/g, " ").toLowerCase() === label);
  const productRules = rules.filter((rule) =>
    [rule.product, ...(rule.aliases ?? [])]
      .some((candidate) => candidate.trim().replace(/\s+/g, " ").toLowerCase() === normalizedValue),
  );
  const candidateRules = productRules.length > 0
    ? productRules
    : rules.filter((rule) => matchesLabel(rule, normalizedValue));
  if (candidateRules.length === 0) {
    return null;
  }

  const identities = new Set(candidateRules.map((rule) => `${rule.entity}\u0000${rule.vendor}\u0000${rule.product}\u0000${rule.purpose}`));
  if (identities.size !== 1) {
    return null;
  }

  const primaryRule = candidateRules.reduce((best, rule) => rule.confidence > best.confidence ? rule : best);
  const regulatoryRelevance = unique(candidateRules.flatMap((rule) => rule.regulatoryRelevance));
  return {
    basis: `canonical_${productRules.length > 0 ? "product" : "vendor"}_label`,
    confidence: primaryRule.confidence,
    displayCategory: resolveVendorDisplayCategory({
      product: primaryRule.product,
      purpose: primaryRule.purpose,
      regulatoryRelevance,
      vendor: primaryRule.vendor,
    }),
    entity: primaryRule.entity,
    product: primaryRule.product,
    purpose: primaryRule.purpose,
    servicePurpose: primaryRule.servicePurpose,
    regulatoryRelevance,
    vendor: primaryRule.vendor,
  };
}

function canonicalVendorLabelResolution(
  observation: NormalizedVendorObservation,
  basis: string,
): CanonicalVendorLabelResolution {
  return {
    basis,
    confidence: observation.confidence,
    displayCategory: resolveVendorDisplayCategory(observation),
    entity: observation.entity,
    product: observation.product ?? observation.vendor,
    purpose: observation.purpose,
    servicePurpose: observation.servicePurpose ?? "Unknown",
    regulatoryRelevance: observation.regulatoryRelevance,
    vendor: observation.vendor,
  };
}

const explicitInfrastructureRegionPatterns = [
  {
    basis: "aws_region_hostname",
    provider: "AWS",
    pattern: /(?:^|\.)((?:af|ap|ca|eu|il|me|mx|sa|us)-(?:central|north|northeast|northwest|south|southeast|southwest|east|west)-\d)(?:\.|$)/i,
  },
  {
    basis: "gcp_region_hostname",
    provider: "GCP",
    pattern: /(?:^|\.)((?:asia|australia|europe|me|northamerica|southamerica|us)-(?:central|east|west|north|south|northeast|southeast|southwest)\d)(?:\.|$)/i,
  },
  {
    basis: "azure_region_hostname",
    provider: "Azure",
    pattern: /(?:^|\.)(australiaeast|australiasoutheast|brazilsouth|canadacentral|canadaeast|centralindia|centralus|eastasia|eastus2?|francecentral|germanywestcentral|japaneast|japanwest|koreacentral|northcentralus|northeurope|norwayeast|southafricanorth|southcentralus|southeastasia|swedencentral|switzerlandnorth|uksouth|ukwest|westeurope|westus2?|westus3)(?:\.|$)/i,
  },
] as const;

type ProviderRegionMetadata = {
  jurisdiction: string;
  locationLabel: string;
};

const providerRegionMetadata: Record<string, Partial<Record<string, ProviderRegionMetadata>>> = {
  AWS: {
    "us-east-1": { jurisdiction: "US", locationLabel: "AWS US East (N. Virginia)" },
    "us-east-2": { jurisdiction: "US", locationLabel: "AWS US East (Ohio)" },
    "us-west-1": { jurisdiction: "US", locationLabel: "AWS US West (N. California)" },
    "us-west-2": { jurisdiction: "US", locationLabel: "AWS US West (Oregon)" },
    "eu-west-1": { jurisdiction: "IE", locationLabel: "AWS Europe (Ireland)" },
    "eu-west-2": { jurisdiction: "GB", locationLabel: "AWS Europe (London)" },
    "eu-west-3": { jurisdiction: "FR", locationLabel: "AWS Europe (Paris)" },
    "eu-central-1": { jurisdiction: "DE", locationLabel: "AWS Europe (Frankfurt)" },
  },
  GCP: {
    "us-central1": { jurisdiction: "US", locationLabel: "Google Cloud Iowa" },
    "us-east1": { jurisdiction: "US", locationLabel: "Google Cloud South Carolina" },
    "us-east4": { jurisdiction: "US", locationLabel: "Google Cloud Northern Virginia" },
    "us-west1": { jurisdiction: "US", locationLabel: "Google Cloud Oregon" },
    "europe-west1": { jurisdiction: "BE", locationLabel: "Google Cloud Belgium" },
    "europe-west2": { jurisdiction: "GB", locationLabel: "Google Cloud London" },
    "europe-west3": { jurisdiction: "DE", locationLabel: "Google Cloud Frankfurt" },
    "europe-west4": { jurisdiction: "NL", locationLabel: "Google Cloud Netherlands" },
  },
  Azure: {
    centralus: { jurisdiction: "US", locationLabel: "Azure Central US" },
    eastus: { jurisdiction: "US", locationLabel: "Azure East US" },
    eastus2: { jurisdiction: "US", locationLabel: "Azure East US 2" },
    westus: { jurisdiction: "US", locationLabel: "Azure West US" },
    westus2: { jurisdiction: "US", locationLabel: "Azure West US 2" },
    westus3: { jurisdiction: "US", locationLabel: "Azure West US 3" },
    northeurope: { jurisdiction: "IE", locationLabel: "Azure North Europe" },
    westeurope: { jurisdiction: "NL", locationLabel: "Azure West Europe" },
    uksouth: { jurisdiction: "GB", locationLabel: "Azure UK South" },
    ukwest: { jurisdiction: "GB", locationLabel: "Azure UK West" },
  },
};

export function resolveEndpointGeography(
  input: EndpointGeographyResolverInput,
): EndpointGeographyResolution | undefined {
  const hostname = normalizeHostname(input.hostname);
  if (!input.thirdParty || !input.collectionEndpointObserved) {
    return undefined;
  }
  if (!hostname) {
    return {
      basis: ["host_only_endpoint_geography", "hostname_missing"],
      status: "unknown",
    };
  }

  for (const candidate of explicitInfrastructureRegionPatterns) {
    const match = candidate.pattern.exec(hostname);
    const region = match?.[1]?.toLowerCase();
    if (region) {
      const metadata = providerRegionMetadata[candidate.provider]?.[region];
      return {
        basis: [
          "host_only_endpoint_geography",
          candidate.basis,
          ...(metadata ? ["provider_region_catalog"] : []),
        ],
        jurisdiction: metadata?.jurisdiction,
        locationLabel: metadata?.locationLabel,
        precision: metadata ? "provider_region" : undefined,
        provider: candidate.provider,
        region,
        status: "region_observed",
      };
    }
  }

  return {
    basis: ["host_only_endpoint_geography", "no_explicit_region_in_hostname"],
    status: "unknown",
  };
}

/**
 * Resolves legal-entity ownership from a canonical registry hostname match.
 * Product attribution remains path-bounded in resolveVendorObservations; this
 * owner-only projection is used for party and entity consolidation.
 */
export function resolveCanonicalEntityOwner(
  value: string | null | undefined
): CanonicalEntityOwnerResolution | null {
  const hostname = normalizeHostname(value?.trim().replace(/^\.+/, ""));
  if (!hostname) {
    return null;
  }
  const candidates = rules.filter((rule) => (
    matchesAny(hostname, rule.hostPatterns) &&
    !matchesAny(hostname, rule.excludeHostPatterns)
  ));
  if (candidates.length === 0 || new Set(candidates.map((rule) => rule.entity)).size !== 1) {
    return null;
  }
  const primaryRule = candidates.reduce((best, rule) => rule.confidence > best.confidence ? rule : best);
  return {
    basis: `${primaryRule.basisLabel}:canonical_entity_owner`,
    confidence: primaryRule.confidence,
    displayCategory: resolveVendorDisplayCategory(primaryRule),
    entity: primaryRule.entity,
    product: primaryRule.product,
    purpose: primaryRule.purpose,
    // Host ownership alone does not establish which of its services was used.
    servicePurpose: new Set(candidates.map((rule) => rule.servicePurpose)).size === 1
      ? primaryRule.servicePurpose : "Unknown",
    regulatoryRelevance: unique(candidates.flatMap((rule) => rule.regulatoryRelevance)),
    vendor: primaryRule.vendor
  };
}

export function resolveVendorObservations(
  inputs: VendorResolverInput[],
): NormalizedVendorObservation[] {
  const observations = new Map<string, NormalizedVendorObservation>();

  for (const input of inputs) {
    const url = input.url;
    // A supplied display/registrable hostname must not override the actual URL
    // authority. Cookie Domain remains a separate, explicit storage scope.
    const hostname = normalizeHostname(input.type === "cookie"
      ? input.hostname ?? hostnameFromUrl(url)
      : hostnameFromUrl(url) ?? input.hostname);
    const cookieName = input.cookieName;
    const globalName = input.globalName;
    const storageKey = input.storageKey;
    const domSelector = input.domSelector;

    for (const rule of rules) {
      const matchedHost = hostname
        ? matchesAny(hostname, rule.hostPatterns) && !matchesAny(hostname, rule.excludeHostPatterns)
        : false;
      const matchedUrlPattern = url ? matchesAny(url, rule.urlPatterns) : false;
      const matchedUrl = matchedUrlPattern && (
        !rule.hostPatterns ||
        matchedHost ||
        rule.allowUrlPatternWithoutHostMatch === true
      );
      const matchedCookie = cookieName
        ? matchesAny(cookieName, rule.cookiePatterns)
        : false;
      const matchedGlobal = globalName
        ? matchesAny(globalName, rule.globalPatterns)
        : false;
      const matchedStorageKey = storageKey
        ? matchesAny(storageKey, rule.storageKeyPatterns)
        : false;
      const matchedDomSelector = domSelector
        ? matchesAny(domSelector, rule.domSelectorPatterns)
        : false;

      // A cookie's Domain attribute identifies where the browser stores/sends it;
      // it does not prove that every product associated with that host set it.
      // Cookie observations therefore require a cookie-name signature. The source
      // response/request remains available as separate endpoint evidence.
      if (input.type === "cookie" && !matchedCookie) {
        continue;
      }
      if (input.type === "cookie" && matchedCookie && rule.requireHostPatternForCookieMatch && !matchedHost) {
        continue;
      }

      if (
        !matchedHost &&
        !matchedUrl &&
        !matchedCookie &&
        !matchedGlobal &&
        !matchedStorageKey &&
        !matchedDomSelector
      ) {
        continue;
      }
      if (
        rule.requireUrlPatternMatch &&
        !matchedUrl &&
        !matchedCookie &&
        !matchedGlobal &&
        !matchedStorageKey &&
        !matchedDomSelector
      ) {
        continue;
      }

      const key = rule.identity.serviceId;

      const existing = observations.get(key);
      const matchKind: VendorRegistryAttribution["matchKind"] = input.type === "cookie"
        ? matchedHost ? "cookie_context" : "cookie_name"
        : matchedUrl ? "endpoint"
          : matchedGlobal || matchedStorageKey || matchedDomSelector ? "runtime_signature"
            : matchedCookie ? "cookie_name" : "hostname";
      const registryAttribution: VendorRegistryAttribution = {
        contractVersion: "vendor-registry-attribution-v1",
        resolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
        ...rule.identity,
        ruleIds: [rule.basisLabel],
        matchKind,
      };
      const basis = [
        rule.basisLabel,
        input.type,
        matchedHost ? "hostname_match" : undefined,
        matchedUrl ? "url_pattern_match" : undefined,
        matchedCookie ? "cookie_name_match" : undefined,
        matchedGlobal ? "global_match" : undefined,
        matchedStorageKey ? "storage_key_match" : undefined,
        matchedDomSelector ? "dom_selector_match" : undefined,
      ].filter((value): value is string => Boolean(value));
      const matchedEvidenceRefs = inputEvidenceRefs(input, {
        hostname,
        matchedUrl,
      });
      const matchedUrls = matchedUrl && url ? [url] : [];
      const matchedHostnames = hostname && isMatchedHostnameCandidate(hostname) && shouldAttachMatchedHostname(rule, {
        matchedHost,
        matchedUrl,
        matchedCookie,
        matchedGlobal,
        matchedStorageKey,
        matchedDomSelector,
      })
        ? [hostname]
        : [];
      const matchSources = matchSourcesForInput({
        input,
        rule,
        basis,
        hostname,
        url,
        cookieName,
        matchedHost,
        matchedUrl,
        matchedCookie,
        matchedGlobal,
        matchedStorageKey,
        matchedDomSelector,
        globalName,
        storageKey,
        domSelector,
      });

      if (existing) {
        observations.set(key, {
          ...existing,
          registryAttribution: {
            ...registryAttribution,
            ruleIds: unique([...existing.registryAttribution!.ruleIds, rule.basisLabel]).sort(),
            matchKind: matchStrength[existing.registryAttribution!.matchKind] > matchStrength[matchKind]
              ? existing.registryAttribution!.matchKind : matchKind,
          },
          basis: unique([...existing.basis, ...basis]),
          matchedEvidenceIds: unique([
            ...existing.matchedEvidenceIds,
            ...(input.evidenceId ? [input.evidenceId] : []),
          ]),
          matchedEvidenceRefs: uniqueEvidenceRefs([
            ...existing.matchedEvidenceRefs,
            ...matchedEvidenceRefs,
          ]),
          matchSources: uniqueMatchSources([
            ...existing.matchSources,
            ...matchSources,
          ]),
          matchedHostnames: unique([
            ...existing.matchedHostnames,
            ...matchedHostnames,
          ]),
          matchedUrls: unique([...existing.matchedUrls, ...matchedUrls]),
          matchedCookieNames: unique([
            ...existing.matchedCookieNames,
            ...(cookieName ? [cookieName] : []),
          ]),
        });
        continue;
      }

      observations.set(key, {
        observationId: stableObservationId(rule, hostname, cookieName, url),
        entity: rule.entity,
        vendor: rule.vendor,
        product: rule.product,
        purpose: rule.purpose,
        servicePurpose: rule.servicePurpose,
        registryAttribution,
        confidence: rule.confidence,
        basis,
        regulatoryRelevance: rule.regulatoryRelevance,
        matchedEvidenceIds: input.evidenceId ? [input.evidenceId] : [],
        matchedEvidenceRefs,
        matchSources,
        matchedHostnames,
        matchedUrls,
        matchedCookieNames: cookieName ? [cookieName] : [],
      });
    }
  }

  return [...observations.values()];
}

/**
 * Creates a review queue from repeated, unresolved third-party endpoints.
 *
 * This deliberately does not infer a vendor from a hostname, collapse hosts to
 * a registrable domain, or emit a rule. A candidate is only a request for
 * deterministic evidence collection and owner/product research.
 */
export function buildUnknownVendorCandidateQueue(
  inputs: UnknownVendorCandidateInput[],
): UnknownVendorCandidateQueue {
  const excluded = {
    invalidOrFirstParty: 0,
    knownCanonical: 0,
    missingConcretePath: 0,
  };
  const candidates = new Map<string, {
    cookieNames: Set<string>;
    hostname: string;
    observationCount: number;
    paths: Set<string>;
    sampleEndpoints: Set<string>;
    scanIds: Set<string>;
    siteIds: Set<string>;
    sourceTypes: Set<"request" | "response" | "script">;
  }>();

  for (const input of inputs) {
    if (!input.thirdParty) {
      excluded.invalidOrFirstParty += 1;
      continue;
    }
    const hostname = normalizeUnknownCandidateHostname(input.hostname ?? hostnameFromUrl(input.url));
    if (!hostname) {
      excluded.invalidOrFirstParty += 1;
      continue;
    }
    const pathTemplate = unknownCandidatePathTemplate(input.url, hostname);
    if (!pathTemplate) {
      excluded.missingConcretePath += 1;
      continue;
    }
    if (resolveVendorObservations([{ type: input.source, hostname, url: input.url }]).length > 0) {
      excluded.knownCanonical += 1;
      continue;
    }

    const existing = candidates.get(hostname) ?? {
      cookieNames: new Set<string>(),
      hostname,
      observationCount: 0,
      paths: new Set<string>(),
      sampleEndpoints: new Set<string>(),
      scanIds: new Set<string>(),
      siteIds: new Set<string>(),
      sourceTypes: new Set<"request" | "response" | "script">(),
    };
    existing.observationCount += 1;
    existing.paths.add(pathTemplate);
    existing.sampleEndpoints.add(`https://${hostname}${pathTemplate}`);
    existing.scanIds.add(input.scanId);
    if (input.domainId) {
      existing.siteIds.add(input.domainId);
    }
    existing.sourceTypes.add(input.source);
    for (const cookieName of input.cookieNames ?? []) {
      const normalizedCookie = cookieName.trim();
      if (normalizedCookie && normalizedCookie.length <= 128) {
        existing.cookieNames.add(normalizedCookie);
      }
    }
    candidates.set(hostname, existing);
  }

  return {
    inputObservationCount: inputs.length,
    excluded,
    candidates: [...candidates.values()]
      .map((candidate) => {
        const distinctPathCount = candidate.paths.size;
        const distinctScanCount = candidate.scanIds.size;
        const distinctSiteCount = candidate.siteIds.size;
        const priorityScore =
          distinctSiteCount * 5 +
          distinctScanCount * 2 +
          Math.min(candidate.observationCount, 50) +
          Math.min(distinctPathCount, 10);
        const recommendedAction: UnknownVendorCandidate["recommendedAction"] =
          distinctSiteCount >= 3 && distinctScanCount >= 3 && distinctPathCount >= 1
            ? "deterministic_review"
            : "observe_more";
        return {
          candidateKey: `unknown-endpoint:${candidate.hostname}`,
          hostname: candidate.hostname,
          observationCount: candidate.observationCount,
          distinctScanCount,
          distinctSiteCount,
          distinctPathCount,
          pathTemplates: [...candidate.paths].sort().slice(0, 8),
          sampleEndpoints: [...candidate.sampleEndpoints].sort().slice(0, 5),
          cookieNames: [...candidate.cookieNames].sort().slice(0, 12),
          sourceTypes: [...candidate.sourceTypes].sort(),
          priorityScore,
          recommendedAction,
          requiresOwnerResearch: true as const,
        };
      })
      .sort((left, right) =>
        right.priorityScore - left.priorityScore ||
        right.distinctSiteCount - left.distinctSiteCount ||
        left.hostname.localeCompare(right.hostname),
      ),
  };
}

function normalizeUnknownCandidateHostname(value: string | undefined): string | null {
  const normalized = normalizeHostname(value);
  if (!normalized || normalized === "localhost" || normalized.includes(":")) {
    return null;
  }
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(normalized)) {
    return null;
  }
  return normalized;
}

function unknownCandidatePathTemplate(url: string | undefined, expectedHostname: string): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (normalizeUnknownCandidateHostname(parsed.hostname) !== expectedHostname) {
      return null;
    }
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 6)
      .map(redactUnknownCandidatePathSegment);
    return segments.length > 0 ? `/${segments.join("/")}` : "/";
  } catch {
    return null;
  }
}

function redactUnknownCandidatePathSegment(segment: string): string {
  const decoded = safeDecodeURIComponent(segment);
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded) ||
    /^[a-f0-9]{16,}$/i.test(decoded) ||
    /^\d{3,}$/.test(decoded) ||
    decoded.includes("@") ||
    decoded.length > 32
  ) {
    return ":id";
  }
  return decoded.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 32) || ":value";
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function inputEvidenceRefs(input: VendorResolverInput, match: {
  hostname: string | undefined;
  matchedUrl: boolean;
}): EvidenceRef[] {
  if (input.evidenceRef) {
    return [boundedEvidenceRefForMatch(input.evidenceRef, match)];
  }
  if (!input.evidenceId) {
    return [];
  }
  return [{
    refId: `ref_${input.evidenceId}`,
    eventId: input.evidenceId,
    eventType: input.sourceEventType ?? input.type,
    ...(match.matchedUrl ? { url: input.url } : {}),
    label: input.cookieName ?? input.globalName ?? input.storageKey ?? input.domSelector ?? match.hostname,
  }];
}

function boundedEvidenceRefForMatch(ref: EvidenceRef, match: {
  hostname: string | undefined;
  matchedUrl: boolean;
}): EvidenceRef {
  if (match.matchedUrl) {
    return ref;
  }
  return {
    refId: ref.refId,
    eventId: ref.eventId,
    artifactId: ref.artifactId,
    eventType: ref.eventType,
    label: ref.label ?? match.hostname ?? ref.eventId ?? ref.artifactId ?? ref.refId,
  };
}

function matchSourcesForInput(input: {
  input: VendorResolverInput;
  rule: VendorRule;
  basis: string[];
  hostname: string | undefined;
  url: string | undefined;
  cookieName: string | undefined;
  globalName: string | undefined;
  storageKey: string | undefined;
  domSelector: string | undefined;
  matchedHost: boolean;
  matchedUrl: boolean;
  matchedCookie: boolean;
  matchedGlobal: boolean;
  matchedStorageKey: boolean;
  matchedDomSelector: boolean;
}): NormalizedVendorObservation["matchSources"] {
  const sources: NormalizedVendorObservation["matchSources"] = [];
  if (input.matchedHost && input.hostname) {
    sources.push(matchSource({
      input: input.input,
      source: sourceForUrlLikeInput(input.input),
      matchedField: "hostname",
      matchedValueRedacted: input.hostname,
      resolverBasis: input.basis,
      confidence: input.rule.confidence,
    }));
  }
  if (input.matchedUrl && input.url) {
    sources.push(matchSource({
      input: input.input,
      source: sourceForUrlLikeInput(input.input),
      matchedField: "url_pattern",
      matchedValueRedacted: redactUrlForMatch(input.url),
      resolverBasis: input.basis,
      confidence: input.rule.confidence,
    }));
  }
  if (input.matchedCookie && input.cookieName) {
    sources.push(matchSource({
      input: input.input,
      source: input.input.matchSource ?? "cookie_name",
      matchedField: "cookie_name",
      matchedValueRedacted: input.cookieName,
      resolverBasis: input.basis,
      confidence: input.rule.confidence,
    }));
  }
  if (input.matchedGlobal && input.globalName) {
    sources.push(matchSource({
      input: input.input,
      source: "cmp_runtime_probe",
      matchedField: "global_name",
      matchedValueRedacted: input.globalName,
      resolverBasis: input.basis,
      confidence: input.rule.confidence,
    }));
  }
  if (input.matchedStorageKey && input.storageKey) {
    sources.push(matchSource({
      input: input.input,
      source: "storage_key",
      matchedField: "storage_key",
      matchedValueRedacted: input.storageKey,
      resolverBasis: input.basis,
      confidence: input.rule.confidence,
    }));
  }
  if (input.matchedDomSelector && input.domSelector) {
    sources.push(matchSource({
      input: input.input,
      source: "cmp_runtime_probe",
      matchedField: "dom_selector",
      matchedValueRedacted: input.domSelector,
      resolverBasis: input.basis,
      confidence: input.rule.confidence,
    }));
  }
  return sources;
}

function shouldAttachMatchedHostname(rule: VendorRule, match: {
  matchedCookie: boolean;
  matchedDomSelector: boolean;
  matchedGlobal: boolean;
  matchedHost: boolean;
  matchedStorageKey: boolean;
  matchedUrl: boolean;
}): boolean {
  if (!rule.suppressCookieMatchedHostname) {
    return true;
  }
  return match.matchedHost ||
    match.matchedUrl ||
    match.matchedGlobal ||
    match.matchedStorageKey ||
    match.matchedDomSelector ||
    !match.matchedCookie;
}

function isMatchedHostnameCandidate(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]*\.)+[a-z0-9-]{2,}$/i.test(value.trim());
}

function matchSource(input: {
  input: VendorResolverInput;
  source: VendorMatchSourceType;
  matchedField: string;
  matchedValueRedacted: string;
  resolverBasis: string[];
  confidence: number;
}): NormalizedVendorObservation["matchSources"][number] {
  return {
    source: input.source,
    sourceEventId: input.input.evidenceId,
    sourceEventType: input.input.sourceEventType ?? input.input.type,
    sourceScanner: input.input.sourceScanner,
    scenario: input.input.scenario,
    consentStateAtTime: input.input.consentStateAtTime,
    matchedField: input.matchedField,
    matchedValueRedacted: input.matchedValueRedacted,
    resolverBasis: input.resolverBasis,
    confidence: input.confidence,
  };
}

function sourceForUrlLikeInput(input: VendorResolverInput): VendorMatchSourceType {
  if (input.matchSource) {
    return input.matchSource;
  }
  if (input.type === "script") {
    return "script_url";
  }
  if (input.type === "iframe") {
    return "iframe_url";
  }
  if (input.type === "response") {
    return "network_response";
  }
  return "network_request";
}

function redactUrlForMatch(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.search) {
      parsed.search = "?[redacted_query]";
    }
    return parsed.toString();
  } catch {
    return "[redacted_url]";
  }
}

function matchesAny(value: string, patterns: RegExp[] | undefined): boolean {
  return patterns?.some((pattern) => pattern.test(value)) ?? false;
}

function hostnameFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function normalizeHostname(hostname: string | undefined): string | undefined {
  return hostname?.replace(/\.$/, "").toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueEvidenceRefs(refs: EvidenceRef[]): EvidenceRef[] {
  const byKey = new Map<string, EvidenceRef>();
  for (const ref of refs) {
    byKey.set(`${ref.refId}:${ref.eventId ?? ""}:${ref.artifactId ?? ""}`, ref);
  }
  return [...byKey.values()];
}

function uniqueMatchSources(
  sources: NormalizedVendorObservation["matchSources"],
): NormalizedVendorObservation["matchSources"] {
  const byKey = new Map<string, NormalizedVendorObservation["matchSources"][number]>();
  for (const source of sources) {
    byKey.set(
      [
        source.source,
        source.sourceEventId ?? "",
        source.matchedField,
        source.matchedValueRedacted ?? "",
        source.matchedValueHash ?? "",
      ].join("|"),
      source,
    );
  }
  return [...byKey.values()];
}

function stableObservationId(
  rule: VendorRule,
  hostname?: string,
  cookieName?: string,
  url?: string,
): string {
  const raw = [rule.vendor, rule.product, hostname, cookieName, url]
    .filter(Boolean)
    .join(":")
    .toLowerCase();

  let hash = 0;
  for (const char of raw) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `vendor_${hash.toString(16)}`;
}
