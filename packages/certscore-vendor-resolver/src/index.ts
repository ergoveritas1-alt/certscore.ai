import type {
  EndpointGeographyPrecision,
  EndpointGeographyStatus,
  EvidenceRef,
  NormalizedVendorObservation,
  VendorMatchSourceType,
} from "@certscore/contracts";

export const CANONICAL_VENDOR_RESOLVER_VERSION = "certscore-vendor-resolver-2026-07-14-wave10-final-replay";

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
  regulatoryRelevance: string[];
  vendor: string;
};

interface VendorRule {
  entity: string;
  vendor: string;
  product: string;
  purpose: NormalizedVendorObservation["purpose"];
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
  suppressCookieMatchedHostname?: boolean;
  basisLabel: string;
}

const rules: VendorRule[] = [
  {
    entity: "Axel Springer SE",
    vendor: "Axel Springer",
    product: "Axel Springer publisher infrastructure",
    purpose: "infrastructure",
    regulatoryRelevance: ["publisher_infrastructure"],
    confidence: 0.96,
    hostPatterns: [/(?:^|\.)bild\.de$/i, /(?:^|\.)bildstatic\.de$/i],
    basisLabel: "axel_springer_publisher_infrastructure",
  },
  {
    entity: "Agora S.A.",
    vendor: "Agora",
    product: "Agora publisher infrastructure",
    purpose: "infrastructure",
    regulatoryRelevance: ["publisher_infrastructure"],
    confidence: 0.96,
    hostPatterns: [/(?:^|\.)agora\.pl$/i, /(?:^|\.)gazeta\.pl$/i, /(?:^|\.)im-g\.pl$/i, /(?:^|\.)wyborcza\.pl$/i],
    basisLabel: "agora_publisher_infrastructure",
  },
  {
    entity: "Gremi Media S.A.",
    vendor: "Gremi Media",
    product: "Gremi Media publisher infrastructure",
    purpose: "infrastructure",
    regulatoryRelevance: ["publisher_infrastructure"],
    confidence: 0.96,
    hostPatterns: [/(?:^|\.)rp\.pl$/i, /(?:^|\.)gremimedia\.pl$/i],
    basisLabel: "gremi_media_publisher_infrastructure",
  },
  {
    entity: "Gemius S.A.",
    vendor: "Gemius",
    product: "Gemius audience measurement",
    purpose: "analytics",
    regulatoryRelevance: ["audience_measurement"],
    confidence: 0.94,
    hostPatterns: [/(?:^|\.)gemius\.pl$/i],
    basisLabel: "gemius_audience_measurement",
  },
  {
    entity: "Salesmanago S.A.",
    vendor: "Salesmanago",
    product: "Salesmanago marketing automation",
    purpose: "analytics",
    regulatoryRelevance: ["marketing_automation"],
    confidence: 0.94,
    hostPatterns: [/(?:^|\.)salesmanago\.pl$/i, /(?:^|\.)salesmanago\.com$/i],
    cookiePatterns: [/^(smuuid|smvr|_smvs)$/i],
    basisLabel: "salesmanago_marketing_automation",
  },
  {
    entity: "LiveRamp Holdings, Inc.",
    vendor: "LiveRamp",
    product: "Data Plus Math / LiveRamp",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement", "tv_attribution"],
    confidence: 0.93,
    hostPatterns: [/^(?:p|c)\.tvpixel\.com$/i],
    urlPatterns: [/^https:\/\/p\.tvpixel\.com\/(?:com|com\.snowplowanalytics\.snowplow|pixel|event)\b/i, /^https:\/\/c\.tvpixel\.com\/js\/current\/dpm_pixel_min\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "data_plus_math_tvpixel_ad_measurement_endpoint",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Fonts",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^fonts\.googleapis\.com$/i, /^fonts\.gstatic\.com$/i],
    urlPatterns: [/\/css2?\b/i, /\/s\//i],
    basisLabel: "google_fonts_cdn",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Static Assets",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "embedded_content", "static_assets", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^gstatic\.com$/i, /^(?!fonts\.)[^.]+\.gstatic\.com$/i],
    basisLabel: "google_static_assets_infrastructure",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google reCAPTCHA",
    purpose: "security",
    regulatoryRelevance: ["bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^(?:www\.)?google\.com$/i, /^www\.recaptcha\.net$/i, /^www\.gstatic\.com$/i],
    urlPatterns: [/\/recaptcha\/(?:api|api2|enterprise)\b/i, /\/recaptcha\/releases\//i],
    requireUrlPatternMatch: true,
    basisLabel: "google_recaptcha_security_runtime",
  },
  {
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Fonts / Typekit",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^use\.typekit\.net$/i, /^p\.typekit\.net$/i],
    basisLabel: "adobe_fonts_typekit_cdn",
  },
  {
    entity: "Google LLC",
    vendor: "YouTube",
    product: "YouTube Image CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "media_delivery", "embedded_content", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^i\.ytimg\.com$/i, /^img\.youtube\.com$/i],
    urlPatterns: [/\/(?:vi|an_webp|sb|s_p|ggpht)\//i],
    basisLabel: "youtube_image_cdn_infrastructure",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Interactive Media Ads",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "video_ad_measurement", "ad_delivery"],
    confidence: 0.93,
    hostPatterns: [/^imasdk\.googleapis\.com$/i],
    urlPatterns: [/\/js\/sdkloader\/ima3(?:_dai)?\.js\b/i],
    basisLabel: "google_ima_sdk",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Sign-in",
    purpose: "infrastructure",
    regulatoryRelevance: ["authentication", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^accounts\.google\.com$/i],
    urlPatterns: [/\/gsi\/client\b/i],
    globalPatterns: [/^google\.accounts$/i],
    basisLabel: "google_identity_services_script",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Tag Manager",
    purpose: "tag_management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^(?:www\.)?googletagmanager\.com$/i],
    urlPatterns: [/\/gtm\.js\b/i, /[?&]id=GTM-/i],
    cookiePatterns: [/^_dc_gtm_/i],
    storageKeyPatterns: [/^_dc_gtm_/i],
    basisLabel: "gtm_host_or_container",
  },
  {
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Experience Platform Launch",
    purpose: "tag_management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^assets\.adobedtm\.com$/i],
    urlPatterns: [/\/(?:launch-[^/]+|EX[^/]+-libraryCode_source)\.min\.js\b/i],
    basisLabel: "adobe_launch_tag_management_script",
  },
  {
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Audience Manager / Experience Cloud",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_management", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.demdex\.net$/i],
    urlPatterns: [/\/(?:id(?:\/rd)?|event)\b/i, /\/ibs:/i, /\/demconf\.jpg\b/i],
    cookiePatterns: [/^demdex$/i],
    basisLabel: "adobe_demdex_audience_manager_endpoint_or_cookie",
  },
  {
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Analytics / Experience Cloud",
    aliases: ["Adobe Analytics"],
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.omtrdc\.net$/i, /\.2o7\.net$/i],
    urlPatterns: [/\/b\/ss\//i, /[?&]AQB=1\b/i],
    cookiePatterns: [/^s_ecid$/i, /^AMCV_/i, /^s_vi$/i],
    basisLabel: "adobe_analytics_or_experience_cloud_endpoint",
  },
  {
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Ads",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.amazon-adsystem\.com$/i, /^aax\.amazon-adsystem\.com$/i],
    excludeHostPatterns: [/^c\.amazon-adsystem\.com$/i, /\.aps\.amazon-adsystem\.com$/i],
    urlPatterns: [/\/e\/dt\b/i, /\/x\/px\//i],
    cookiePatterns: [/^ad-id$/i, /^ad-privacy$/i],
    basisLabel: "amazon_ads_endpoint_or_cookie",
  },
  {
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Ads",
    purpose: "advertising",
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
    entity: "DoubleVerify Holdings, Inc.",
    vendor: "DoubleVerify",
    product: "DoubleVerify",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_verification", "brand_safety"],
    confidence: 0.92,
    hostPatterns: [/\.doubleverify\.com$/i],
    urlPatterns: [/\/(?:event\.(?:png|jpg)|bsevent\.gif)\b/i],
    basisLabel: "doubleverify_ad_verification_endpoint",
  },
  {
    entity: "The Trade Desk, Inc.",
    vendor: "The Trade Desk",
    product: "The Trade Desk",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.adsrvr\.org$/i],
    urlPatterns: [/\/track/i, /\/pixel/i],
    cookiePatterns: [/^TDID$/i, /^TDCPM$/i],
    basisLabel: "trade_desk_endpoint_or_cookie",
  },
  {
    entity: "Criteo SA",
    vendor: "Criteo",
    product: "Criteo",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/\.criteo\.com$/i, /\.criteo\.net$/i],
    urlPatterns: [/\/r\/d/i, /\/dis\/dis\.aspx/i],
    cookiePatterns: [/^uid$/i, /^cto_bundle$/i],
    suppressCookieMatchedHostname: true,
    storageKeyPatterns: [/criteo/i],
    basisLabel: "criteo_endpoint_or_cookie",
  },
  {
    entity: "AdRiver LLC",
    vendor: "AdRiver",
    product: "AdRiver",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "ad_measurement"],
    confidence: 0.92,
    hostPatterns: [/\.adriver\.ru$/i, /^adriver\.ru$/i],
    urlPatterns: [/\/(?:cgi-bin|images|js|banners|ad|erle)\b/i],
    basisLabel: "adriver_ad_endpoint",
  },
  {
    entity: "Yandex LLC",
    vendor: "Yandex",
    product: "Yandex Ads / Metrica",
    aliases: ["Yandex Ads"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "analytics", "ad_measurement", "cross_site_tracking"],
    confidence: 0.93,
    hostPatterns: [/\.yandex\.(?:ru|com|net)$/i, /^yandex\.(?:ru|com|net)$/i],
    urlPatterns: [/\/(?:watch|metrika|metrika_match|ads|yabs|sync|setuid)\b/i],
    cookiePatterns: [/^yabs-sid$/i, /^sync_cookie_csrf$/i, /^yandexuid$/i, /^yuid/i],
    requireUrlPatternMatch: true,
    basisLabel: "yandex_ads_metrica_endpoint_or_cookie",
  },
  {
    entity: "VK Company Limited",
    vendor: "VK / Mail.ru",
    product: "VK / Mail.ru Ads",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "analytics", "ad_measurement"],
    confidence: 0.9,
    hostPatterns: [/\.mail\.ru$/i, /^mail\.ru$/i, /\.mytarget\.ru$/i],
    urlPatterns: [/\/(?:counter|top|tracker|ads?|sync|pixel)\b/i],
    cookiePatterns: [/^tmr_lvid/i, /^top100_id$/i],
    basisLabel: "vk_mail_ru_ads_endpoint_or_cookie",
  },
  {
    entity: "Permutive Ltd",
    vendor: "Permutive",
    product: "Permutive",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_segmentation"],
    confidence: 0.93,
    hostPatterns: [/\.permutive\.com$/i, /^[0-9a-f-]+\.edge\.permutive\.app$/i],
    urlPatterns: [/\/v2\/events/i, /\/track/i, /^https:\/\/[0-9a-f-]+\.edge\.permutive\.app\/[0-9a-f-]+-web\.js\b/i],
    storageKeyPatterns: [/^permutive/i, /^fedID\.permutive/i, /^fedID\.permutative/i],
    requireUrlPatternMatch: true,
    basisLabel: "permutive_event_endpoint",
  },
  {
    entity: "Lotame Solutions, Inc.",
    vendor: "Lotame",
    product: "Lotame",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_segmentation"],
    confidence: 0.93,
    hostPatterns: [/\.crwdcntrl\.net$/i, /\.lotame\.com$/i],
    urlPatterns: [/\/lt\//i, /\/pixel/i],
    cookiePatterns: [/^lotame_/i],
    basisLabel: "lotame_endpoint_or_cookie",
  },
  {
    entity: "LiveRamp Holdings, Inc.",
    vendor: "LiveRamp",
    product: "LiveRamp",
    purpose: "advertising",
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
    entity: "PubMatic, Inc.",
    vendor: "PubMatic",
    product: "PubMatic",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.pubmatic\.com$/i],
    urlPatterns: [/\/AdServer\//i, /\/sync/i],
    cookiePatterns: [/^PUBMDCID$/i],
    basisLabel: "pubmatic_endpoint_or_cookie",
  },
  {
    entity: "Magnite, Inc.",
    vendor: "Magnite",
    product: "Magnite / Rubicon",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.rubiconproject\.com$/i, /\.magnite\.com$/i],
    urlPatterns: [/\/a\/api\//i, /\/usync/i, /\/sync/i],
    cookiePatterns: [/^khaos$/i, /^rpb$/i],
    basisLabel: "magnite_rubicon_endpoint_or_cookie",
  },
  {
    entity: "OpenX Technologies, Inc.",
    vendor: "OpenX",
    product: "OpenX",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.openx\.net$/i],
    urlPatterns: [/\/w\/1\.0\//i, /\/sync/i],
    cookiePatterns: [/^i$/i, /^pd$/i],
    suppressCookieMatchedHostname: true,
    basisLabel: "openx_endpoint_or_cookie",
  },
  {
    entity: "Index Exchange Inc.",
    vendor: "Index Exchange",
    product: "Index Exchange",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.93,
    hostPatterns: [/\.casalemedia\.com$/i, /\.indexww\.com$/i],
    urlPatterns: [/\/casale/i, /\/sync/i, /\/usermatch/i, /\/(?:r|c|i)?rum\b/i, /\/openrtb\//i],
    cookiePatterns: [/^CMID$/i, /^CMPS$/i],
    basisLabel: "index_exchange_endpoint_or_cookie",
  },
  {
    entity: "Taboola.com Ltd.",
    vendor: "Taboola",
    product: "Taboola",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "content_recommendation"],
    confidence: 0.93,
    hostPatterns: [/(?:^|\.)taboola\.com$/i],
    urlPatterns: [/\/trc\//i, /\/libtrc\/[^/]+\/loader\.js\b/i, /\/pixel/i, /\/sync/i, /^https:\/\/beacon\.taboola\.com\//i],
    cookiePatterns: [/^t_gid$/i],
    storageKeyPatterns: [/^tbl[_-]/i, /^taboola\b/i],
    basisLabel: "taboola_endpoint_or_cookie",
  },
  {
    entity: "Integral Ad Science, Inc.",
    vendor: "Integral Ad Science",
    product: "Integral Ad Science",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_verification", "brand_safety"],
    confidence: 0.92,
    hostPatterns: [/\.adsafeprotected\.com$/i, /\.integralads\.com$/i, /\.iasds01\.com$/i],
    urlPatterns: [/\/(?:services|jload|dt|pixel|verify)\b/i],
    basisLabel: "integral_ad_science_endpoint",
  },
  {
    entity: "TransUnion LLC",
    vendor: "TransUnion",
    product: "Neustar / AGKN",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution"],
    confidence: 0.91,
    hostPatterns: [/\.agkn\.com$/i],
    urlPatterns: [/\/(?:pixel|sync|getuid|uid|dnt|optout)?\b/i],
    basisLabel: "neustar_agkn_endpoint",
  },
  {
    entity: "RevJet, Inc.",
    vendor: "RevJet",
    product: "RevJet",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement"],
    confidence: 0.9,
    hostPatterns: [/\.revjet\.com$/i],
    urlPatterns: [/\/(?:pixel|pix|track|event|sync)\b/i],
    basisLabel: "revjet_endpoint",
  },
  {
    entity: "Spotify AB",
    vendor: "Spotify",
    product: "Spotify Pixel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement"],
    confidence: 0.9,
    hostPatterns: [/^pixel\.byspotify\.com$/i, /^pixels\.spotify\.com$/i],
    urlPatterns: [/\/(?:ping|v1\/config|v1\/ingest)\b/i],
    basisLabel: "spotify_pixel_endpoint",
  },
  {
    entity: "Medallia, Inc.",
    vendor: "Medallia",
    product: "Medallia Digital",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "customer_experience"],
    confidence: 0.9,
    hostPatterns: [/\.digital-cloud\.medallia\.com$/i, /\.medallia\.com$/i],
    urlPatterns: [/\/api\/web\/events\b/i, /\/analytics/i],
    basisLabel: "medallia_digital_analytics_endpoint",
  },
  {
    entity: "Attentive Mobile Inc.",
    vendor: "Attentive",
    product: "Attentive",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_automation"],
    confidence: 0.9,
    hostPatterns: [/\.attentivemobile\.com$/i],
    urlPatterns: [/\/(?:ct-ev|events?|track|collect)\b/i],
    basisLabel: "attentive_event_endpoint",
  },
  {
    entity: "Klaviyo, Inc.",
    vendor: "Klaviyo",
    product: "Klaviyo",
    purpose: "analytics",
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
    entity: "Datability Solutions Private Limited",
    vendor: "iZooto",
    product: "iZooto Web Push",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "marketing_automation", "push_notifications", "audience_engagement"],
    confidence: 0.91,
    hostPatterns: [/^(?:cdn|cdnimg|err|events?|api|l|www)\.izooto\.com$/i, /^izooto\.com$/i],
    urlPatterns: [/\/(?:scripts?\/)?(?:sdk\/)?izooto(?:\.min)?\.js\b/i, /\/(?:event|events|push|subscribe|notification|webpush)\b/i],
    storageKeyPatterns: [/^izooto/i, /^_izooto/i],
    basisLabel: "izooto_web_push_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Ads Pixel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "marketing_pixel", "marketing_automation"],
    confidence: 0.93,
    hostPatterns: [/^(?:js\.)?hsadspixel\.net$/i, /\.hsadspixel\.net$/i],
    urlPatterns: [/\/(?:fb|pixel|events?|track|collect|ads)/i],
    basisLabel: "hubspot_ads_pixel_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Scripts",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "marketing_automation", "email_personalization", "third_party_runtime"],
    confidence: 0.93,
    hostPatterns: [/^(?:js|js-eu1)\.hs-scripts\.com$/i],
    urlPatterns: [/\/\d+\.js\b/i, /\/(?:shell|loader|embed|scripts?)\b/i],
    basisLabel: "hubspot_marketing_scripts_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Forms",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "lead_capture", "forms", "marketing_automation"],
    confidence: 0.92,
    hostPatterns: [/^forms(?:-[a-z0-9]+)?\.hscollectedforms\.net$/i],
    urlPatterns: [/\/(?:collected-forms|forms|submissions?|embed|v\d+)/i],
    basisLabel: "hubspot_forms_lead_capture_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot API",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "crm", "marketing_automation", "lead_capture"],
    confidence: 0.91,
    hostPatterns: [/^api(?:-[a-z0-9]+)?\.hubapi\.com$/i],
    urlPatterns: [/\/(?:contacts|forms|events|analytics|collector|track|crm|v\d+)/i],
    basisLabel: "hubspot_crm_marketing_api_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Banner",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "preference_tooling"],
    confidence: 0.92,
    hostPatterns: [/^js(?:-[a-z0-9]+)?\.hs-banner\.com$/i],
    urlPatterns: [/\/(?:banner|cookie|consent|preferences?)/i],
    basisLabel: "hubspot_banner_consent_preference_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_analytics", "marketing_automation"],
    confidence: 0.93,
    hostPatterns: [/^js(?:-[a-z0-9]+)?\.hs-analytics\.net$/i],
    urlPatterns: [/\/(?:analytics|events?|track|collect|embed|v\d+)/i],
    basisLabel: "hubspot_marketing_analytics_runtime",
  },
  {
    entity: "BrightLine Partners LLC",
    vendor: "BrightLine",
    product: "BrightLine",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "video_ad_measurement", "ad_event_tracking"],
    confidence: 0.88,
    hostPatterns: [/\.brightline\.tv$/i],
    urlPatterns: [/\/(?:beacon|collect|collector|event|events|measure|measurement|metrics|pixel|track|tracking)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "brightline_video_ad_measurement_endpoint",
  },
  {
    entity: "Outbrain Inc.",
    vendor: "Outbrain",
    product: "Outbrain",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "content_recommendation"],
    confidence: 0.93,
    hostPatterns: [/\.outbrain\.com$/i],
    urlPatterns: [/\/networkRedir/i, /\/pixels/i],
    cookiePatterns: [/^obuid$/i],
    basisLabel: "outbrain_endpoint_or_cookie",
  },
  {
    entity: "Pinterest, Inc.",
    vendor: "Pinterest",
    product: "Pinterest Tag",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^ct\.pinterest\.com$/i, /^s\.pinimg\.com$/i],
    urlPatterns: [/\/ct\.html/i, /\/ct\/core\.js/i],
    cookiePatterns: [/^_pin_unauth$/i],
    basisLabel: "pinterest_tag_endpoint_or_cookie",
  },
  {
    entity: "Reddit, Inc.",
    vendor: "Reddit",
    product: "Reddit Pixel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^www\.redditstatic\.com$/i, /^alb\.reddit\.com$/i, /^pixel-config\.reddit\.com$/i],
    urlPatterns: [/\/pixel/i, /\/r\/pixel/i, /\/v\d+\/config\b/i],
    basisLabel: "reddit_pixel_endpoint",
  },
  {
    entity: "X Corp.",
    vendor: "X/Twitter",
    product: "X/Twitter Social Widgets",
    aliases: ["X Corp."],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "social_embed", "cross_site_tracking"],
    confidence: 0.93,
    hostPatterns: [/^platform\.twitter\.com$/i, /^syndication\.twitter\.com$/i, /^cdn\.syndication\.twimg\.com$/i],
    urlPatterns: [/\/widgets\.js\b/i, /\/embed/i, /\/timeline/i, /\/tweet/i],
    basisLabel: "twitter_social_widget_runtime",
  },
  {
    entity: "X Corp.",
    vendor: "X/Twitter",
    product: "Twitter Pixel",
    aliases: ["X Corp."],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^static\.ads-twitter\.com$/i, /^analytics\.twitter\.com$/i, /^t\.co$/i],
    urlPatterns: [/\/uwt\.js\b/i, /\/i\/adsct\b/i, /\/adsct\b/i],
    basisLabel: "twitter_pixel_endpoint",
  },
  {
    entity: "Tapad, Inc.",
    vendor: "Tapad",
    product: "Tapad",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution", "cross_site_tracking"],
    confidence: 0.93,
    hostPatterns: [/\.tapad\.com$/i],
    urlPatterns: [/\/(?:pixel|idsync|sync)\b/i],
    cookiePatterns: [/^TapAd_DID$/i, /^TapAd_TS$/i],
    basisLabel: "tapad_endpoint_or_cookie",
  },
  {
    entity: "Singular Labs, Inc.",
    vendor: "Singular",
    product: "Singular Attribution",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "attribution"],
    confidence: 0.93,
    hostPatterns: [/\.singular\.net$/i],
    urlPatterns: [/\/(?:api|sdk|event|events|launch)\b/i],
    basisLabel: "singular_attribution_endpoint",
  },
  {
    entity: "Snap Inc.",
    vendor: "Snap",
    product: "Snap Pixel",
    aliases: ["Snapchat Pixel"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^tr\.snapchat\.com$/i, /^sc-static\.net$/i],
    urlPatterns: [/\/scevent/i, /\/snap-pixel/i],
    cookiePatterns: [/^sc_at$/i],
    basisLabel: "snap_pixel_endpoint_or_cookie",
  },
  {
    entity: "Quantcast Corporation",
    vendor: "Quantcast",
    product: "Quantcast Measure",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_measurement"],
    confidence: 0.93,
    hostPatterns: [/\.quantserve\.com$/i, /\.quantcast\.com$/i],
    urlPatterns: [/\/pixel/i, /\/qacct/i],
    cookiePatterns: [/^mc$/i, /^d$/i],
    basisLabel: "quantcast_endpoint_or_cookie",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ad Traffic Quality",
    purpose: "security",
    regulatoryRelevance: ["security", "ad_quality", "fraud_prevention", "advertising"],
    confidence: 0.9,
    hostPatterns: [/^ep\d+\.adtrafficquality\.google$/i],
    urlPatterns: [/\/getconfig\/sodar\b/i, /\/pagead\/(?:sodar|gen_204)\b/i, /\/bg\/[^/]+\.js\b/i],
    basisLabel: "google_ad_traffic_quality_endpoint",
  },
  {
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Zaraz",
    purpose: "tag_management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^zaraz\./i],
    urlPatterns: [/\/cdn-cgi\/zaraz\//i],
    storageKeyPatterns: [/^_zaraz_/i],
    basisLabel: "cloudflare_zaraz_tag_management",
  },
  {
    entity: "Segment.io, Inc.",
    vendor: "Segment",
    product: "Segment",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "customer_data_platform"],
    confidence: 0.94,
    hostPatterns: [/\.segment\.com$/i, /^api\.segment\.io$/i, /^cdn\.segment\.com$/i],
    urlPatterns: [/\/v1\/track/i, /\/analytics\.js/i],
    cookiePatterns: [/^ajs_/i],
    storageKeyPatterns: [/^ajs_/i],
    basisLabel: "segment_endpoint_or_cookie",
  },
  {
    entity: "RudderStack Inc.",
    vendor: "RudderStack",
    product: "RudderStack",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "customer_data_platform"],
    confidence: 0.93,
    hostPatterns: [/\.rudderstack\.com$/i],
    urlPatterns: [/\/v1\/track/i, /\/rudder-analytics/i],
    cookiePatterns: [/^rl_/i],
    storageKeyPatterns: [/^rl_/i],
    basisLabel: "rudderstack_endpoint_or_cookie",
  },
  {
    entity: "Amplitude, Inc.",
    vendor: "Amplitude",
    product: "Amplitude",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics"],
    confidence: 0.94,
    hostPatterns: [/\.amplitude\.com$/i],
    urlPatterns: [/\/2\/httpapi/i, /\/batch/i],
    cookiePatterns: [/^amplitude_id_/i],
    storageKeyPatterns: [/^amplitude_id_/i],
    basisLabel: "amplitude_endpoint_or_cookie",
  },
  {
    entity: "Mixpanel, Inc.",
    vendor: "Mixpanel",
    product: "Mixpanel",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics"],
    confidence: 0.94,
    hostPatterns: [/\.mixpanel\.com$/i],
    urlPatterns: [/\/track/i, /\/engage/i],
    cookiePatterns: [/^mp_/i],
    storageKeyPatterns: [/^mp_/i],
    basisLabel: "mixpanel_endpoint_or_cookie",
  },
  {
    entity: "PostHog, Inc.",
    vendor: "PostHog",
    product: "PostHog",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics"],
    confidence: 0.93,
    hostPatterns: [/\.posthog\.com$/i],
    urlPatterns: [/\/e\/?$/i, /\/batch/i],
    cookiePatterns: [/^ph_/i, /posthog/i],
    storageKeyPatterns: [/^ph_/i, /posthog/i],
    basisLabel: "posthog_endpoint_or_cookie",
  },
  {
    entity: "New Relic, Inc.",
    vendor: "New Relic",
    product: "New Relic Browser",
    purpose: "performance_monitoring",
    regulatoryRelevance: ["performance_monitoring"],
    confidence: 0.92,
    hostPatterns: [/\.nr-data\.net$/i, /\.newrelic\.com$/i],
    urlPatterns: [/\/1\//i, /\/bam\//i],
    basisLabel: "new_relic_monitoring_endpoint",
  },
  {
    entity: "Akamai Technologies, Inc.",
    vendor: "Akamai",
    product: "Akamai mPulse",
    purpose: "performance_monitoring",
    regulatoryRelevance: ["performance_monitoring"],
    confidence: 0.92,
    hostPatterns: [/\.go-mpulse\.net$/i],
    urlPatterns: [/\/(?:boomerang|akamai|mPulse|beacon|rum)\b/i],
    basisLabel: "akamai_mpulse_monitoring_endpoint",
  },
  {
    entity: "HUMAN Security, Inc.",
    vendor: "HUMAN",
    product: "PerimeterX / HUMAN Bot Defense",
    purpose: "security",
    regulatoryRelevance: ["security", "bot_detection"],
    confidence: 0.92,
    hostPatterns: [/\.px-cloud\.net$/i],
    urlPatterns: [/\/(?:api|collector|px|xhr|init|captcha)\b/i],
    basisLabel: "human_perimeterx_security_endpoint",
  },
  {
    entity: "Forter, Inc.",
    vendor: "Forter",
    product: "Forter Fraud Prevention",
    purpose: "security",
    regulatoryRelevance: ["security", "fraud_prevention"],
    confidence: 0.92,
    hostPatterns: [/\.forter\.com$/i],
    urlPatterns: [/\/(?:beacon|js|profile|v\d+)\b/i],
    basisLabel: "forter_security_endpoint",
  },
  {
    entity: "Sprinklr, Inc.",
    vendor: "Sprinklr",
    product: "Sprinklr Live Chat",
    purpose: "customer_support",
    regulatoryRelevance: ["customer_support"],
    confidence: 0.9,
    hostPatterns: [/^(?:prod\d+-)?live-chat\.sprinklr\.com$/i],
    urlPatterns: [/\/(?:live-chat|chat|messaging|widget)\b/i],
    basisLabel: "sprinklr_live_chat_endpoint",
  },
  {
    entity: "Datadog, Inc.",
    vendor: "Datadog",
    product: "Datadog RUM",
    purpose: "performance_monitoring",
    regulatoryRelevance: ["performance_monitoring"],
    confidence: 0.92,
    hostPatterns: [/\.datadoghq\.com$/i, /\.browser-intake-datadoghq\.com$/i, /^www\.datadoghq-browser-agent\.com$/i],
    urlPatterns: [/\/api\/v2\/rum/i, /\/v1\/input/i, /\/(?:[a-z0-9]+\/)?v\d+\/datadog-rum(?:-v\d+)?\.js\b/i, /\/datadog-rum(?:-[a-z0-9]+)?\.js\b/i],
    basisLabel: "datadog_rum_endpoint",
  },
  {
    entity: "Vercel Inc.",
    vendor: "Vercel",
    product: "Vercel Speed Insights",
    purpose: "performance_monitoring",
    regulatoryRelevance: ["performance_monitoring", "web_vitals", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^vitals\.vercel-insights\.com$/i],
    urlPatterns: [/^https:\/\/vitals\.vercel-insights\.com\/v1\/vitals\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "vercel_speed_insights_vitals",
  },
  {
    entity: "SpeedCurve Limited",
    vendor: "SpeedCurve",
    product: "SpeedCurve LUX RUM",
    purpose: "performance_monitoring",
    regulatoryRelevance: ["performance_monitoring", "web_vitals", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.speedcurve\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.speedcurve\.com\/js\/lux\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "speedcurve_lux_rum_script",
  },
  {
    entity: "Wistia, Inc.",
    vendor: "Wistia",
    product: "Wistia Embedded Player",
    purpose: "infrastructure",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^fast\.wistia\.com$/i],
    urlPatterns: [/^https:\/\/fast\.wistia\.com\/(?:player\.js|embed\/(?:[A-Za-z0-9]+\.js|medias\/[A-Za-z0-9]+\/swatch)|assets\/external\/E-v1\.js)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "wistia_embedded_player_runtime",
  },
  {
    entity: "Flowplayer AB",
    vendor: "Flowplayer",
    product: "Flowplayer Native",
    purpose: "infrastructure",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.flowplayer\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.flowplayer\.com\/releases\/native\/\d+\/(?:stable|canary|v\d+\.\d+\.\d+)\/(?:default\/)?flowplayer(?:\.min)?\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "flowplayer_native_runtime",
  },
  {
    entity: "Siteimprove A/S",
    vendor: "Siteimprove",
    product: "Siteimprove Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^siteimproveanalytics\.com$/i],
    urlPatterns: [/^https:\/\/siteimproveanalytics\.com\/js\/siteanalyze_\d+\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "siteimprove_analytics_runtime",
  },
  {
    entity: "6sense Insights, Inc.",
    vendor: "6sense",
    product: "6sense WebTag",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "account_based_marketing", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:\d+|j)\.6sc\.co$/i],
    urlPatterns: [/^https:\/\/(?:\d+|j)\.6sc\.co\/(?:6si\.min\.js|j\/[0-9a-f-]+\.js)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "6sense_webtag_runtime",
  },
  {
    entity: "Monotype Imaging Holdings Inc.",
    vendor: "Monotype",
    product: "Monotype Web Fonts",
    purpose: "infrastructure",
    regulatoryRelevance: ["font_delivery", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^fast\.fonts\.net$/i],
    urlPatterns: [/^https:\/\/fast\.fonts\.net\/(?:cssapi\/[0-9a-f-]+\.css|jsapi(?:\/|$)|t\/\d+\.css)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "monotype_web_fonts_runtime",
  },
  {
    entity: "UserWay, Inc.",
    vendor: "UserWay",
    product: "UserWay Accessibility Widget",
    purpose: "infrastructure",
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
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Maps JavaScript API",
    purpose: "infrastructure",
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
    entity: "SpryMedia Ltd",
    vendor: "DataTables",
    product: "DataTables CDN",
    purpose: "infrastructure",
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
    entity: "Salesforce, Inc.",
    vendor: "Salesforce",
    product: "Salesforce Messaging for In-App and Web",
    purpose: "customer_support",
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
    entity: "Webflow, Inc.",
    vendor: "Webflow",
    product: "Webflow Hosted Assets",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "hosted_assets", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^cdn\.prod\.website-files\.com$/i],
    urlPatterns: [
      /^https:\/\/cdn\.prod\.website-files\.com\/(?:[0-9a-f]{20,}(?:\/|$)|gsap\/\d+\.\d+\.\d+\/(?:ScrollTrigger|SplitText|gsap)\.min\.js(?:\?|$))/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "webflow_hosted_assets_runtime",
  },
  {
    entity: "Trustpilot A/S",
    vendor: "Trustpilot",
    product: "Trustpilot TrustBox",
    purpose: "infrastructure",
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
    entity: "Quora, Inc.",
    vendor: "Quora",
    product: "Quora Pixel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "conversion_tracking", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^a\.quora\.com$/i],
    urlPatterns: [/^https:\/\/a\.quora\.com\/qevents\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "quora_pixel_runtime",
  },
  {
    entity: "Ensighten, Inc.",
    vendor: "Ensighten",
    product: "Ensighten Manage",
    purpose: "tag_management",
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
    entity: "TrafficJunky Inc.",
    vendor: "TrafficJunky",
    product: "TrafficJunky Advertising",
    purpose: "advertising",
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
    entity: "SHE Media, LLC",
    vendor: "SHE Media",
    product: "BlogHer Ads",
    purpose: "advertising",
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
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Programmable Search Engine",
    purpose: "infrastructure",
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
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Forms",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "lead_capture", "forms", "marketing_automation"],
    confidence: 0.96,
    hostPatterns: [/^js\.hsforms\.net$/i, /^forms\.hsforms\.com$/i],
    urlPatterns: [
      /^https:\/\/js\.hsforms\.net\/forms\/(?:embed\/v2|v2)\.js(?:\?|$)/i,
      /^https:\/\/forms\.hsforms\.com\/embed\/v3\/form\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/json(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_forms_embed_runtime",
  },
  {
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Dynamic Media / Scene7",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "media_delivery", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^s7[a-z0-9-]*\.scene7\.com$/i],
    urlPatterns: [/^https:\/\/s7[a-z0-9-]*\.scene7\.com\/is\/(?:image|content)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./:-]+(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_dynamic_media_scene7_delivery",
  },
  {
    entity: "DataDome SAS",
    vendor: "DataDome",
    product: "DataDome Challenge",
    purpose: "security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^(?:static|geo|ct)\.captcha-delivery\.com$/i],
    urlPatterns: [
      /^https:\/\/static\.captcha-delivery\.com\/(?:captcha\/assets\/|common\/(?:Logo-|fonts\/))/i,
      /^https:\/\/geo\.captcha-delivery\.com\/(?:captcha|interstitial)(?:\?|$)/i,
      /^https:\/\/ct\.captcha-delivery\.com\/(?:c|i)\.js(?:\?|$)/i,
    ],
    requireUrlPatternMatch: true,
    basisLabel: "datadome_challenge_runtime",
  },
  {
    entity: "Automattic Inc.",
    vendor: "WordPress.com",
    product: "Jetpack Stats",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^stats\.wp\.com$/i],
    urlPatterns: [/^https:\/\/stats\.wp\.com\/(?:w|e-\d+)\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "jetpack_stats_runtime",
  },
  {
    entity: "Parse.ly, Inc.",
    vendor: "Parse.ly",
    product: "Parse.ly Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^(?:cdn|experiments)\.parsely\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.parsely\.com\/keys\/[^/]+\/p\.js\b/i, /^https:\/\/experiments\.parsely\.com\/vip-experiments\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "parsely_tracking_script",
  },
  {
    entity: "mParticle, Inc.",
    vendor: "mParticle",
    product: "mParticle Web SDK",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "customer_data_platform", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^jssdkcdns\.mparticle\.com$/i],
    urlPatterns: [/^https:\/\/jssdkcdns\.mparticle\.com\/js\/v2(?:\/[^/]+)?\/mparticle\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "mparticle_web_sdk",
  },
  {
    entity: "Functional Software, Inc.",
    vendor: "Sentry",
    product: "Sentry",
    purpose: "performance_monitoring",
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
    entity: "Akamai Technologies, Inc.",
    vendor: "Akamai",
    product: "Akamai Bot Manager / Edge",
    purpose: "security",
    regulatoryRelevance: ["security", "infrastructure"],
    confidence: 0.9,
    cookiePatterns: [/^_abck$/i, /^bm_sz$/i, /^ak_bmsc$/i, /^akaas_/i, /^akamai_/i],
    basisLabel: "akamai_security_cookie",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Analytics",
    purpose: "analytics",
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
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Publisher Tag",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery", "publisher_ad_server"],
    confidence: 0.95,
    hostPatterns: [/^securepubads\.g\.doubleclick\.net$/i, /^www\.googletagservices\.com$/i],
    urlPatterns: [/\/tag\/js\/gpt\.js\b/i, /\/gampad\//i],
    basisLabel: "google_publisher_tag_endpoint",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google AdSense",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_delivery"],
    confidence: 0.95,
    hostPatterns: [/^pagead2\.googlesyndication\.com$/i],
    urlPatterns: [/\/pagead\/js\/adsbygoogle\.js\b/i, /\/pagead\//i],
    basisLabel: "google_adsense_endpoint",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "DoubleClick Floodlight",
    aliases: ["DoubleClick / Floodlight"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "ad_measurement", "conversion_tracking"],
    confidence: 0.94,
    hostPatterns: [/^fls\.doubleclick\.net$/i, /^ad\.doubleclick\.net$/i],
    urlPatterns: [/\/activityi\b/i, /\/ddm\/activity\//i],
    basisLabel: "doubleclick_floodlight_endpoint",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    aliases: ["Google Ads", "DoubleClick"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.96,
    hostPatterns: [/\.doubleclick\.net$/i, /^googleads\.g\.doubleclick\.net$/i, /^pagead2\.googlesyndication\.com$/i],
    urlPatterns: [
      /\/pagead\//i,
      /\/gampad\//i,
      /\/activityi/i,
      /\/pcs\/activeview\b/i,
    ],
    cookiePatterns: [/^IDE$/i, /^test_cookie$/i],
    storageKeyPatterns: [/^_gcl_/i],
    basisLabel: "doubleclick_ad_endpoint_or_cookie",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Ads / DoubleClick",
    aliases: ["Google Ads", "DoubleClick"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.94,
    hostPatterns: [/^www\.google\.com$/i],
    urlPatterns: [/^https:\/\/www\.google\.com\/(?:pagead\/|ads\/|aclk\b|.*conversion)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_ads_measurement_endpoint",
  },
  {
    entity: "Meta Platforms, Inc.",
    vendor: "Meta",
    product: "Meta Pixel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.96,
    hostPatterns: [/^connect\.facebook\.net$/i, /^www\.facebook\.com$/i],
    urlPatterns: [/\/tr\b/i, /\/fbevents\.js\b/i],
    cookiePatterns: [/^_fbp$/i, /^_fbc$/i],
    storageKeyPatterns: [/^_fbp$/i, /^_fbc$/i],
    basisLabel: "meta_pixel_endpoint_or_cookie",
  },
  {
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Microsoft Clarity",
    purpose: "session_replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.95,
    hostPatterns: [/^www\.clarity\.ms$/i, /^scripts\.clarity\.ms$/i, /^n\.clarity\.ms$/i, /^f\.clarity\.ms$/i, /^c\.clarity\.ms$/i],
    urlPatterns: [/^https:\/\/(?:www|scripts|n|f)\.clarity\.ms\/(?:tag|collect)\b/i, /^https:\/\/c\.clarity\.ms\/c\.gif\b/i],
    cookiePatterns: [/^_clck$/i, /^_clsk$/i],
    storageKeyPatterns: [/^_clck$/i, /^_clsk$/i],
    basisLabel: "clarity_script_endpoint_or_cookie",
  },
  {
    entity: "Hotjar Ltd",
    vendor: "Hotjar",
    product: "Hotjar",
    purpose: "session_replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.95,
    hostPatterns: [/\.hotjar\.com$/i, /\.hotjar\.io$/i],
    urlPatterns: [/\/c\/hotjar-/i, /\/api\/v2\/client\/sites\//i],
    cookiePatterns: [/^_hj/i],
    storageKeyPatterns: [/^_hj/i],
    basisLabel: "hotjar_script_endpoint_or_cookie",
  },
  {
    entity: "FullStory, Inc.",
    vendor: "FullStory",
    product: "FullStory",
    purpose: "session_replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.95,
    hostPatterns: [/\.fullstory\.com$/i, /^rs\.fullstory\.com$/i, /^edge\.fullstory\.com$/i, /\.fullstoryedge\.com$/i],
    urlPatterns: [/\/s\/fs\.js\b/i, /\/rec\//i, /\/s\/settings\//i],
    cookiePatterns: [/^fs_uid$/i],
    storageKeyPatterns: [/^fs_uid$/i, /^FS_/i],
    basisLabel: "fullstory_script_endpoint_or_cookie",
  },
  {
    entity: "TikTok Technology Limited",
    vendor: "TikTok",
    product: "TikTok Pixel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.95,
    hostPatterns: [/^analytics\.tiktok\.com$/i, /^business-api\.tiktok\.com$/i],
    urlPatterns: [/\/i18n\/pixel\/events\.js\b/i, /\/api\/v2\/pixel\//i],
    cookiePatterns: [/^_ttp$/i, /^ttclid$/i],
    storageKeyPatterns: [/^_ttp$/i, /^ttclid$/i],
    basisLabel: "tiktok_pixel_endpoint_or_cookie",
  },
  {
    entity: "LinkedIn Corporation",
    vendor: "LinkedIn",
    product: "LinkedIn Insight Tag",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking"],
    confidence: 0.95,
    hostPatterns: [/^snap\.licdn\.com$/i],
    urlPatterns: [/\/li\.lms-analytics\/insight\.min\.js\b/i, /\/collect\//i],
    cookiePatterns: [/^bcookie$/i, /^li_sugr$/i, /^bscookie$/i],
    basisLabel: "linkedin_insight_endpoint_or_cookie",
  },
  {
    entity: "LinkedIn Corporation",
    vendor: "LinkedIn",
    product: "LinkedIn Ads Pixel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking", "ad_measurement"],
    confidence: 0.95,
    hostPatterns: [/^px\.ads\.linkedin\.com$/i],
    urlPatterns: [/\/(?:collect|db_sync|setuid|wa\/?)\b/i],
    basisLabel: "linkedin_ads_pixel_endpoint",
  },
  {
    entity: "OneTrust, LLC",
    vendor: "OneTrust",
    product: "OneTrust CMP",
    purpose: "consent_management",
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
    entity: "Consentmanager",
    vendor: "Consentmanager",
    product: "Consentmanager CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.94,
    hostPatterns: [/^cdn\.consentmanager\.net$/i],
    urlPatterns: [/\/(?:delivery|cmp|choice|consent)/i],
    basisLabel: "consentmanager_cmp_runtime_or_endpoint",
  },
  {
    entity: "Stripe, Inc.",
    vendor: "Stripe",
    product: "Stripe.js",
    purpose: "security",
    regulatoryRelevance: ["payment_processing", "fraud_prevention", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^js\.stripe\.com$/i, /^m\.stripe\.network$/i],
    urlPatterns: [/\/v3\b/i, /\/inner\.html\b/i],
    globalPatterns: [/^Stripe$/i],
    basisLabel: "stripe_js_payment_runtime",
  },
  {
    entity: "jsDelivr",
    vendor: "jsDelivr",
    product: "jsDelivr CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^cdn\.jsdelivr\.net$/i],
    basisLabel: "jsdelivr_cdn_host",
  },
  {
    entity: "Cloudflare, Inc.",
    vendor: "cdnjs",
    product: "cdnjs CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "script_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdnjs\.cloudflare\.com$/i],
    basisLabel: "cdnjs_cdn_host",
  },
  {
    entity: "Cloudflare, Inc.",
    vendor: "BootstrapCDN",
    product: "BootstrapCDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "script_delivery", "style_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^maxcdn\.bootstrapcdn\.com$/i, /^stackpath\.bootstrapcdn\.com$/i],
    basisLabel: "bootstrapcdn_host",
  },
  {
    entity: "npm, Inc.",
    vendor: "unpkg",
    product: "unpkg CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "script_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^unpkg\.com$/i],
    basisLabel: "unpkg_cdn_host",
  },
  {
    entity: "Tilda Publishing",
    vendor: "Tilda",
    product: "Tilda CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "script_delivery", "style_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.tildacdn\.com$/i],
    basisLabel: "tilda_cdn_host",
  },
  {
    entity: "Amazon Web Services, Inc.",
    vendor: "Amazon CloudFront",
    product: "CloudFront Distribution",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "content_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^d[a-z0-9]{8,}\.cloudfront\.net$/i, /\.cloudfront\.net$/i],
    basisLabel: "aws_cloudfront_distribution_host",
  },
  {
    entity: "DatoCMS",
    vendor: "DatoCMS",
    product: "DatoCMS Assets",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery"],
    confidence: 0.92,
    hostPatterns: [/^www\.datocms-assets\.com$/i],
    basisLabel: "datocms_assets_cdn_host",
  },
  {
    entity: "Contentful GmbH",
    vendor: "Contentful",
    product: "Contentful Assets",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/^images\.ctfassets\.net$/i, /^assets\.ctfassets\.net$/i, /\.ctfassets\.net$/i],
    basisLabel: "contentful_assets_cdn_host",
  },
  {
    entity: "Framer B.V.",
    vendor: "Framer",
    product: "Framer Static Assets",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^framerusercontent\.com$/i, /\.framerusercontent\.com$/i],
    basisLabel: "framer_static_assets_cdn_host",
  },
  {
    entity: "Salesforce, Inc.",
    vendor: "Salesforce",
    product: "Salesforce Static Assets",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "font_delivery", "static_assets", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^sfdcstatic\.com$/i, /\.sfdcstatic\.com$/i],
    basisLabel: "salesforce_static_assets_cdn_host",
  },
  {
    entity: "Mux, Inc.",
    vendor: "Mux",
    product: "Mux Image",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "media_delivery", "content_delivery"],
    confidence: 0.92,
    hostPatterns: [/^image\.mux\.com$/i],
    basisLabel: "mux_image_media_delivery_host",
  },
  {
    entity: "Piano Software Inc.",
    vendor: "Piano",
    product: "Piano (Tinypass)",
    purpose: "infrastructure",
    regulatoryRelevance: ["consent", "personalization", "paywall", "subscription", "cdn", "script_delivery", "supporting_assets", "audience_management"],
    confidence: 0.95,
    hostPatterns: [/\.piano\.io$/i, /\.tinypass\.com$/i],
    urlPatterns: [/\/api\//i, /\/xbuilder\//i, /\/tinypass/i, /\/(?:assets?|scripts?|resources?)\//i],
    cookiePatterns: [/^_pctx$/i, /^_pcid$/i, /^_pprv$/i, /^pa_user$/i, /^pa_privacy$/i, /^pnes_/i, /^pcid$/i],
    basisLabel: "piano_tinypass_paywall_personalization_runtime",
  },
  {
    entity: "Piano Software Inc.",
    vendor: "Piano",
    product: "Cxense",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "personalization", "audience_management", "analytics"],
    confidence: 0.93,
    hostPatterns: [/\.cxense\.com$/i],
    urlPatterns: [/\/cx\.js\b/i, /\/cce\//i, /\/p1\.js\b/i],
    basisLabel: "cxense_personalization_runtime",
  },
  {
    entity: "Optimizely, Inc.",
    vendor: "Optimizely",
    product: "Optimizely",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "experimentation", "ab_testing", "personalization"],
    confidence: 0.93,
    hostPatterns: [/\.optimizely\.com$/i],
    urlPatterns: [/\/js\/\d+\.js\b/i],
    cookiePatterns: [/^optimizely/i],
    storageKeyPatterns: [/^optimizely/i],
    basisLabel: "optimizely_experimentation_runtime",
  },
  {
    entity: "Wingify Software Pvt. Ltd.",
    vendor: "VWO",
    product: "Visual Website Optimizer",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "experimentation", "ab_testing", "personalization"],
    confidence: 0.92,
    hostPatterns: [/\.visualwebsiteoptimizer\.com$/i, /^dev\.visualwebsiteoptimizer\.com$/i],
    urlPatterns: [/\/(?:j\.php|track|collect|settings|visitor|event)\b/i],
    cookiePatterns: [/^_vis_opt_/i, /^_vwo/i],
    storageKeyPatterns: [/^_vwo/i, /^vwo/i],
    basisLabel: "vwo_experimentation_runtime",
  },
  {
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Bot Management",
    purpose: "security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention"],
    confidence: 0.93,
    cookiePatterns: [/^__cf_bm$/i, /^cf_clearance$/i, /^cf_chl_/i],
    suppressCookieMatchedHostname: true,
    basisLabel: "cloudflare_bot_management_cookie",
  },
  {
    entity: "Comscore, Inc.",
    vendor: "ScorecardResearch / Comscore",
    product: "ScorecardResearch",
    aliases: ["Scorecard Research"],
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "advertising_measurement", "market_research"],
    confidence: 0.92,
    hostPatterns: [/\.scorecardresearch\.com$/i],
    urlPatterns: [/\/b\?/i, /\/p\?/i],
    basisLabel: "scorecardresearch_audience_measurement_endpoint",
  },
  {
    entity: "Bombora, Inc.",
    vendor: "Bombora",
    product: "Bombora Visitor Insights",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "audience_intelligence", "b2b_intent_data"],
    confidence: 0.91,
    hostPatterns: [/\.ml314\.com$/i],
    urlPatterns: [/\/taglw\.js\b/i, /\/Home\/Index\b/i],
    cookiePatterns: [/^(pi|tp|u)$/i],
    basisLabel: "bombora_ml314_visitor_insights",
  },
  {
    entity: "ZoomInfo Technologies LLC",
    vendor: "ZoomInfo",
    product: "ZoomInfo WebSights",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "b2b_intent_data", "lead_enrichment", "cross_site_tracking"],
    confidence: 0.91,
    hostPatterns: [/\.zoominfo\.com$/i, /^zoominfo\.com$/i, /\.zi-scripts\.com$/i],
    urlPatterns: [/\/(?:pixel|collect|track|analytics|websights|visitor|tag)\b/i, /\/zi(?:-tag)?\.js\b/i],
    basisLabel: "zoominfo_websights_b2b_tracking_endpoint",
  },
  {
    entity: "Claydar, Inc.",
    vendor: "Claydar",
    product: "Claydar",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_analytics", "lead_enrichment", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.claydar\.com$/i, /^api\.claydar\.com$/i],
    urlPatterns: [/\/(?:collect|track|analytics|event|visitor|pixel)\b/i],
    basisLabel: "claydar_marketing_analytics_endpoint",
  },
  {
    entity: "Framer B.V.",
    vendor: "Framer",
    product: "Framer Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "site_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^events\.framer\.com$/i],
    urlPatterns: [/\/(?:script|event|collect|track)\b/i],
    basisLabel: "framer_analytics_endpoint",
  },
  {
    entity: "Atlassian Pty Ltd",
    vendor: "Atlassian Statuspage",
    product: "Statuspage",
    purpose: "infrastructure",
    regulatoryRelevance: ["status_monitoring", "availability", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.statuspage\.io$/i],
    basisLabel: "atlassian_statuspage_infrastructure",
  },
  {
    entity: "Intercom, Inc.",
    vendor: "Intercom",
    product: "Intercom Messenger",
    purpose: "customer_support",
    regulatoryRelevance: ["customer_support", "chat_widget", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/\.intercomcdn\.com$/i, /\.intercom\.io$/i],
    urlPatterns: [/\/(?:widget|messenger|frame|launcher|app)\b/i],
    basisLabel: "intercom_messenger_runtime",
  },
  {
    entity: "Usercentrics A/S",
    vendor: "Cookiebot",
    product: "Cookiebot CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.95,
    hostPatterns: [/\.cookiebot\.com$/i, /^consent\.cookiebot\.com$/i],
    urlPatterns: [/\/uc\.js\b/i, /\/consentconfig\//i],
    cookiePatterns: [/^CookieConsent$/i],
    globalPatterns: [/^Cookiebot$/i],
    storageKeyPatterns: [/^CookieConsent$/i, /^CookiebotConsent$/i],
    domSelectorPatterns: [/^#CybotCookiebotDialog$/i, /^#CookiebotWidget$/i],
    basisLabel: "cookiebot_cmp_script_or_cookie",
  },
  {
    entity: "Didomi SAS",
    vendor: "Didomi",
    product: "Didomi CMP",
    purpose: "consent_management",
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
    entity: "TrustArc Inc.",
    vendor: "TrustArc",
    product: "TrustArc CMP",
    purpose: "consent_management",
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
    entity: "Sourcepoint Technologies, Inc.",
    vendor: "Sourcepoint",
    product: "Sourcepoint CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.94,
    hostPatterns: [/\.sourcepointcmp\.com$/i, /\.privacy-mgmt\.com$/i],
    urlPatterns: [/\/wrapperMessagingWithoutDetection\.js\b/i, /\/ccpa\/?$/i, /\/gdpr\/?$/i],
    cookiePatterns: [/^_sp_/i, /^sp_choice$/i],
    globalPatterns: [/^_sp_$/i, /^sourcepoint$/i],
    storageKeyPatterns: [/^_sp_/i, /^sp_choice$/i],
    domSelectorPatterns: [/^#sp_message_container_/i, /^\.sp_message_container/i],
    basisLabel: "sourcepoint_cmp_runtime_or_endpoint",
  },
  {
    entity: "Usercentrics A/S",
    vendor: "Usercentrics",
    product: "Usercentrics CMP",
    purpose: "consent_management",
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
    entity: "Osano, Inc.",
    vendor: "Osano",
    product: "Osano CMP",
    purpose: "consent_management",
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
    entity: "Ketch Kloud, Inc.",
    vendor: "Ketch",
    product: "Ketch CMP",
    purpose: "consent_management",
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
    entity: "Quantcast Corporation",
    vendor: "Quantcast",
    product: "Quantcast Choice CMP",
    purpose: "consent_management",
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
    entity: "CookieYes Limited",
    vendor: "CookieYes",
    product: "CookieYes CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management"],
    confidence: 0.92,
    hostPatterns: [/\.cookieyes\.com$/i],
    urlPatterns: [/\/client_data\//i, /\/cookieyes\.js\b/i],
    cookiePatterns: [/^cookieyes-consent$/i, /^cky-consent$/i],
    globalPatterns: [/^CookieYes$/i, /^ckySettings$/i],
    storageKeyPatterns: [/^cookieyes/i, /^cky-/i],
    domSelectorPatterns: [/^\.cky-consent-container$/i, /^#cookieyes$/i],
    basisLabel: "cookieyes_cmp_runtime_or_endpoint",
  },
  {
    entity: "Iubenda s.r.l.",
    vendor: "Iubenda",
    product: "Iubenda CMP",
    purpose: "consent_management",
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
    entity: "Termly, Inc.",
    vendor: "Termly",
    product: "Termly CMP",
    purpose: "consent_management",
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
    entity: "Cookie Information A/S",
    vendor: "Cookie Information",
    product: "Cookie Information CMP",
    purpose: "consent_management",
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
    entity: "Tealium, Inc.",
    vendor: "Tealium",
    product: "Tealium iQ Tag Management",
    purpose: "tag_management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.92,
    hostPatterns: [/\.tiqcdn\.com$/i, /\.tealiumiq\.com$/i],
    urlPatterns: [/\/utag(?:\.|\/)/i],
    basisLabel: "tealium_iq_tag_management_endpoint",
  },
  {
    entity: "ID5 Technology, Inc.",
    vendor: "ID5",
    product: "ID5 Identity",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution", "cross_site_tracking"],
    confidence: 0.91,
    hostPatterns: [/\.id5-sync\.com$/i],
    urlPatterns: [/\/(?:sync|eids|gdpr|api)\b/i],
    basisLabel: "id5_identity_sync_endpoint",
  },
  {
    entity: "LiveIntent, Inc.",
    vendor: "LiveIntent",
    product: "LiveIntent",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "identity_resolution", "cross_site_tracking"],
    confidence: 0.91,
    hostPatterns: [/\.liadm\.com$/i],
    urlPatterns: [/\/(?:sync|pixel|collect|match)\b/i],
    basisLabel: "liveintent_liadm_endpoint",
  },
  {
    entity: "StackAdapt, Inc.",
    vendor: "StackAdapt",
    product: "StackAdapt",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.91,
    hostPatterns: [/\.stackadapt\.com$/i],
    urlPatterns: [/\/(?:sync|pixel|track|event)\b/i],
    basisLabel: "stackadapt_advertising_endpoint",
  },
  {
    entity: "Media.net Advertising FZ-LLC",
    vendor: "Media.net",
    product: "Media.net",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "contextual_advertising"],
    confidence: 0.91,
    hostPatterns: [/\.media\.net$/i],
    urlPatterns: [/\/(?:pixel|sync|prebid|event)\b/i],
    basisLabel: "media_net_advertising_endpoint",
  },
  {
    entity: "Braze, Inc.",
    vendor: "Braze",
    product: "Braze",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "marketing_automation", "personalization"],
    confidence: 0.91,
    hostPatterns: [/\.appboycdn\.com$/i, /\.braze\.com$/i],
    urlPatterns: [/\/(?:api|sdk|track|events)\b/i],
    basisLabel: "braze_marketing_automation_endpoint",
  },
  {
    entity: "Contentsquare SA",
    vendor: "Contentsquare",
    product: "Contentsquare",
    purpose: "session_replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.91,
    hostPatterns: [/\.contentsquare\.net$/i, /\.contentsquare\.com$/i],
    urlPatterns: [/\/(?:collect|track|events|pixel)\b/i],
    basisLabel: "contentsquare_behavioral_analytics_endpoint",
  },
  {
    entity: "Quantum Metric, Inc.",
    vendor: "Quantum Metric",
    product: "Quantum Metric",
    purpose: "session_replay",
    regulatoryRelevance: ["consent", "behavioral_analytics", "session_replay"],
    confidence: 0.91,
    hostPatterns: [/\.quantummetric\.com$/i],
    urlPatterns: [/\/(?:collect|track|events|pixel)\b/i],
    basisLabel: "quantum_metric_behavioral_analytics_endpoint",
  },
  {
    entity: "Microsoft Corporation",
    vendor: "Microsoft",
    product: "Microsoft Advertising / Bing UET",
    aliases: ["Microsoft Bing Ads", "Bing UET", "Microsoft Advertising"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "conversion_tracking"],
    confidence: 0.91,
    hostPatterns: [/^bat\.bing\.com$/i],
    urlPatterns: [/\/(?:action|p|bat)\b/i],
    basisLabel: "microsoft_bing_uet_endpoint",
  },
  {
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Publisher Services",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_ad_server", "programmatic_ads"],
    confidence: 0.91,
    hostPatterns: [/\.aps\.amazon-adsystem\.com$/i, /^c\.amazon-adsystem\.com$/i],
    urlPatterns: [/\/(?:aps|prebid|config|sync)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "amazon_publisher_services_endpoint",
  },
  {
    entity: "Microsoft Corporation",
    vendor: "Xandr",
    product: "Xandr / AppNexus",
    aliases: ["AppNexus / Xandr"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads", "identity_resolution"],
    confidence: 0.92,
    hostPatterns: [/\.adnxs\.com$/i, /^adnxs\.com$/i],
    urlPatterns: [/\/(?:sync|getuid|prebid|ut)\b/i],
    basisLabel: "xandr_appnexus_endpoint",
  },
  {
    entity: "TripleLift, Inc.",
    vendor: "TripleLift",
    product: "TripleLift",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "programmatic_ads"],
    confidence: 0.91,
    hostPatterns: [/\.3lift\.com$/i],
    urlPatterns: [/\/(?:sync|pixel|prebid|event)\b/i],
    basisLabel: "triplelift_advertising_endpoint",
  },
  {
    entity: "FreeWheel Media, Inc.",
    vendor: "FreeWheel",
    product: "FreeWheel",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "video_advertising"],
    confidence: 0.91,
    hostPatterns: [/\.fwmrm\.net$/i],
    urlPatterns: [/\/(?:ad|dmp|sync|visitor)\b/i],
    basisLabel: "freewheel_video_advertising_endpoint",
  },
  {
    entity: "Teads S.A.S.",
    vendor: "Teads",
    product: "Teads Video Advertising",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "video_advertising", "targeted_advertising"],
    confidence: 0.92,
    hostPatterns: [/\.teads\.tv$/i, /^teads\.tv$/i],
    urlPatterns: [/\/(?:sync|pixel|collect|impression|event)\b/i],
    basisLabel: "teads_video_advertising_endpoint",
  },
  {
    entity: "OneSignal, Inc.",
    vendor: "OneSignal",
    product: "OneSignal Web Push",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "push_notifications", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdn\.onesignal\.com$/i, /^onesignal\.com$/i],
    urlPatterns: [/\/sdks\/(?:web\/)?(?:v\d+\/)?OneSignal(?:SDK)?[^/]*\.js\b/i, /\/api\/v1\/(?:players|notifications|sync)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "onesignal_web_push_runtime",
  },
  {
    entity: "Zendesk, Inc.",
    vendor: "Zendesk",
    product: "Zendesk Web Widget",
    purpose: "customer_support",
    regulatoryRelevance: ["consent", "customer_support", "chat_widget", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^static\.zdassets\.com$/i, /^ekr\.zdassets\.com$/i],
    urlPatterns: [/\/ekr\/snippet\.js\b/i, /\/web_widget\//i, /\/embeddable\//i],
    requireUrlPatternMatch: true,
    basisLabel: "zendesk_web_widget_runtime",
  },
  {
    entity: "Nielsen Holdings plc",
    vendor: "Nielsen",
    product: "Nielsen Digital Audience Measurement",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "audience_measurement", "analytics", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.imrworldwide\.com$/i],
    urlPatterns: [/\/cgi-bin\/(?:m|gn)\b/i, /\/ggcmb\d*\//i, /\/log\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "nielsen_imrworldwide_audience_measurement",
  },
  {
    entity: "Chartbeat, Inc.",
    vendor: "Chartbeat",
    product: "Chartbeat Publisher Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^static\.chartbeat\.com$/i, /^ping\.chartbeat\.net$/i, /\.chartbeat\.(?:com|net)$/i],
    urlPatterns: [/\/chartbeat[^/]*\.js\b/i, /\/ping\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "chartbeat_publisher_analytics_runtime",
  },
  {
    entity: "hCaptcha, Inc.",
    vendor: "hCaptcha",
    product: "hCaptcha",
    purpose: "security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^(?:js|api|newassets|imgs)\.hcaptcha\.com$/i, /\.hcaptcha\.com$/i],
    urlPatterns: [/\/1\/api\.js\b/i, /\/captcha\//i, /\/checksiteconfig\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "hcaptcha_security_runtime",
  },
  {
    entity: "Matomo Cloud",
    vendor: "Matomo",
    product: "Matomo Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/\.matomo\.cloud$/i],
    urlPatterns: [/\/(?:matomo|piwik)\.(?:js|php)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "matomo_cloud_analytics_runtime",
  },
  {
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Web Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^static\.cloudflareinsights\.com$/i, /^cloudflareinsights\.com$/i],
    urlPatterns: [/\/beacon(?:\.min)?\.js\b/i],
    basisLabel: "cloudflare_web_analytics_beacon",
  },
  {
    entity: "Cloudflare, Inc.",
    vendor: "Cloudflare",
    product: "Cloudflare Turnstile",
    purpose: "security",
    regulatoryRelevance: ["security", "bot_detection", "fraud_prevention", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^challenges\.cloudflare\.com$/i],
    urlPatterns: [/\/turnstile\/v0\/api\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "cloudflare_turnstile_runtime",
  },
  {
    entity: "Vimeo, Inc.",
    vendor: "Vimeo",
    product: "Vimeo Embedded Player",
    purpose: "infrastructure",
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
    entity: "Qualified.com, Inc.",
    vendor: "Qualified",
    product: "Qualified Conversational Marketing",
    purpose: "customer_support",
    regulatoryRelevance: ["consent", "customer_support", "lead_generation", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^js\.qualified\.com$/i, /^app\.qualified\.com$/i],
    urlPatterns: [/\/(?:qualified|widget|conversation|visitor)\b/i],
    basisLabel: "qualified_conversational_marketing_runtime",
  },
  {
    entity: "Google LLC",
    vendor: "YouTube",
    product: "YouTube Embedded Player",
    purpose: "infrastructure",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^www\.youtube\.com$/i, /^www\.youtube-nocookie\.com$/i],
    urlPatterns: [/\/embed\/[A-Za-z0-9_-]+/i, /\/iframe_api\b/i, /\/player_api\b/i, /\/s\/(?:_|player)\//i, /\/generate_204\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "youtube_embedded_player_iframe_runtime",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Funding Choices CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^fundingchoicesmessages\.google\.com$/i],
    urlPatterns: [/\/i\/pub-\d+/i, /\/f\/AGSKWxI/i, /\/f\/AGSKWxU/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_funding_choices_cmp_runtime",
  },
  {
    entity: "Salesforce, Inc.",
    vendor: "Salesforce",
    product: "Salesforce Account Engagement",
    aliases: ["Pardot"],
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "lead_generation", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^pi\.pardot\.com$/i],
    urlPatterns: [/\/pd\.js\b/i, /\/analytics\b/i],
    requireUrlPatternMatch: true,
    cookiePatterns: [/^visitor_id\d+$/i, /^pardot$/i, /^lpv\d+$/i],
    basisLabel: "salesforce_account_engagement_pardot_runtime",
  },
  {
    entity: "Awin AG",
    vendor: "AWIN",
    product: "AWIN Affiliate Tracking",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "affiliate_tracking", "conversion_tracking"],
    confidence: 0.9,
    hostPatterns: [/^www\.dwin1\.com$/i],
    urlPatterns: [/\/\d+\.js\b/i],
    requireUrlPatternMatch: true,
    cookiePatterns: [/^aw\d+$/i, /^_aw_(?:m|j|sn)_/i],
    basisLabel: "awin_mastertag_dwin1_runtime",
  },
  {
    entity: "ShareThis, Inc.",
    vendor: "ShareThis",
    product: "ShareThis Widgets",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "social_sharing", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^platform-api\.sharethis\.com$/i],
    urlPatterns: [/\/js\/sharethis\.js\b/i],
    cookiePatterns: [/^__unam$/i],
    basisLabel: "sharethis_widget_runtime",
  },
  {
    entity: "Pendo.io, Inc.",
    vendor: "Pendo",
    product: "Pendo",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "product_analytics", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdn\.pendo\.io$/i],
    urlPatterns: [/\/agent\/static\/[^/]+\/pendo\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "pendo_web_sdk_runtime",
  },
  {
    entity: "Plausible Analytics",
    vendor: "Plausible",
    product: "Plausible Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "cookieless_analytics", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^plausible\.io$/i],
    urlPatterns: [/\/js\/(?:script|plausible)[^/]*\.js\b/i, /\/api\/event\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "plausible_analytics_runtime",
  },
  {
    entity: "Fonticons, Inc.",
    vendor: "Font Awesome",
    product: "Font Awesome Kits CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^kit\.fontawesome\.com$/i, /^ka-p\.fontawesome\.com$/i],
    urlPatterns: [/^https:\/\/kit\.fontawesome\.com\/[a-f0-9]+\.js\b/i, /^https:\/\/ka-p\.fontawesome\.com\/(?:assets\/[a-f0-9]+\/[^/]+\.css|releases\/v\d+\.\d+\.\d+\/css\/pro(?:-v[45]-(?:font-face|shims))?\.min\.css)\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "font_awesome_kit_runtime",
  },
  {
    entity: "Cloudinary, Inc.",
    vendor: "Cloudinary",
    product: "Cloudinary Media CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^res\.cloudinary\.com$/i],
    urlPatterns: [/\/image\/(?:upload|fetch)\//i, /\/video\/upload\//i],
    requireUrlPatternMatch: true,
    basisLabel: "cloudinary_media_delivery_runtime",
  },
  {
    entity: "LongTail Ad Solutions, Inc.",
    vendor: "JW Player",
    product: "JW Player",
    purpose: "infrastructure",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^cdn\.jwplayer\.com$/i],
    urlPatterns: [/\/libraries\/[A-Za-z0-9]{8}\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "jw_player_cloud_hosted_library",
  },
  {
    entity: "Brightcove, Inc.",
    vendor: "Brightcove",
    product: "Brightcove Player",
    purpose: "infrastructure",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.9,
    hostPatterns: [/^players\.brightcove\.net$/i],
    urlPatterns: [/\/index(?:\.min)?\.js\b/i],
    requireUrlPatternMatch: true,
    basisLabel: "brightcove_player_runtime",
  },
  {
    entity: "Transcend, Inc.",
    vendor: "Transcend",
    product: "Transcend Consent Management",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "preference_tooling", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^(?:cdn\.)?transcend-cdn\.com$/i],
    urlPatterns: [/^https:\/\/(?:cdn\.)?transcend-cdn\.com\/cm\/[A-Za-z0-9_-]+\/(?:airgap\.js|cm\.css|translations\/[A-Za-z]{2}(?:-[A-Za-z]{2})?\.json|ui\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "transcend_consent_runtime_assets",
  },
  {
    entity: "Confiant Inc.",
    vendor: "Confiant",
    product: "Confiant Ad Security",
    purpose: "security",
    regulatoryRelevance: ["security", "ad_security", "malvertising_protection", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.confiant-integrations\.net$/i],
    urlPatterns: [/^https:\/\/cdn\.confiant-integrations\.net\/(?:[A-Za-z0-9_-]+\/gpt_and_prebid\/config|gptprebidnative\/[A-Za-z0-9_-]+\/wrap)\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "confiant_ad_security_runtime",
  },
  {
    entity: "Ensighten, Inc.",
    vendor: "Ensighten",
    product: "Ensighten Manage",
    purpose: "tag_management",
    regulatoryRelevance: ["tag_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^activate\.platform\.californiatimes\.com$/i],
    urlPatterns: [/^https:\/\/activate\.platform\.californiatimes\.com\/caltimes\/latimes\/(?:Bootstrap\.js|code\/[a-f0-9]{32}\.js|serverComponent\.php)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ensighten_manage_california_times_cname",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Maps JavaScript API",
    purpose: "infrastructure",
    regulatoryRelevance: ["maps", "location_services", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^maps\.googleapis\.com$/i],
    urlPatterns: [/^https:\/\/maps\.googleapis\.com\/maps\/api\/mapsjs\/gen_204(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_maps_javascript_api_telemetry",
  },
  {
    entity: "UserWay, Inc.",
    vendor: "UserWay",
    product: "UserWay Accessibility Widget",
    purpose: "infrastructure",
    regulatoryRelevance: ["accessibility_widget", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.userway\.org$/i],
    urlPatterns: [/^https:\/\/cdn\.userway\.org\/(?:widgetapp\/[0-9.-]+\/[^?#]+|styles\/[^?#]+\.(?:css|woff2?))(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "userway_widget_support_assets",
  },
  {
    entity: "Yandex LLC",
    vendor: "Yandex",
    product: "Yandex Metrica",
    aliases: ["Yandex Webvisor"],
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "audience_measurement", "session_replay"],
    confidence: 0.96,
    hostPatterns: [/^mc\.yandex\.(?:com|ru)$/i, /^mc\.webvisor\.org$/i],
    urlPatterns: [/^https:\/\/(?:mc\.yandex\.(?:com|ru)|mc\.webvisor\.org)\/(?:metrika|webvisor|watch\/[A-Za-z0-9_-]+|[A-Za-z0-9_-]{4,}|sync_cookie_image_(?:check|decide|start|finish)|ytm-config)(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "yandex_metrica_webvisor_runtime",
  },
  {
    entity: "Flowplayer AB",
    vendor: "Flowplayer",
    product: "Flowplayer Native",
    purpose: "infrastructure",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.flowplayer\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.flowplayer\.com\/releases\/native\/\d+\/(?:stable|canary|v\d+\.\d+\.\d+)\/plugins\/(?:ads|asel|cuepoints|dash|drm|float-on-scroll|ga4|keyboard)(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "flowplayer_native_plugins",
  },
  {
    entity: "CookieYes Limited",
    vendor: "CookieYes",
    product: "CookieYes CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn-cookieyes\.com$/i],
    urlPatterns: [/^https:\/\/cdn-cookieyes\.com\/client_data\/[A-Za-z0-9_-]+\/script\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "cookieyes_client_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Web Interactives",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "marketing_automation", "personalization", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^js\.hubspot\.com$/i],
    urlPatterns: [/^https:\/\/js\.hubspot\.com\/web-interactives-embed\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_web_interactives_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Calls to Action",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "lead_capture", "marketing_automation", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:no-cache\.hubspot\.com|cta-service-cms2\.hubspot\.com)$/i],
    urlPatterns: [/^https:\/\/no-cache\.hubspot\.com\/cta\/default\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\.js)?(?:[/?#]|$)/i, /^https:\/\/cta-service-cms2\.hubspot\.com\/(?:ctas\/v2|combinedConfigs)(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_cta_runtime",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Live Chat",
    purpose: "customer_support",
    regulatoryRelevance: ["consent", "customer_support", "lead_capture", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^api\.hubspot\.com$/i],
    urlPatterns: [/^https:\/\/api\.hubspot\.com\/livechat-public\/(?:v\d+\/)?[^?#]+/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_live_chat_api",
  },
  {
    entity: "HubSpot, Inc.",
    vendor: "HubSpot",
    product: "HubSpot Analytics",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "marketing_analytics", "marketing_automation"],
    confidence: 0.96,
    hostPatterns: [/^track\.hubspot\.com$/i],
    urlPatterns: [/^https:\/\/track\.hubspot\.com\/(?:__ptq|ptq)\.gif(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "hubspot_ptq_tracking_pixel",
  },
  {
    entity: "Wistia, Inc.",
    vendor: "Wistia",
    product: "Wistia Embedded Player",
    purpose: "infrastructure",
    regulatoryRelevance: ["embedded_content", "media_delivery", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^fast\.wistia\.(?:com|net)$/i],
    urlPatterns: [/^https:\/\/fast\.wistia\.(?:com|net)\/(?:assets\/external\/[A-Za-z0-9_.-]+|embed\/medias\/[A-Za-z0-9_-]+\.(?:json|jsonp)|captions\/[A-Za-z0-9_-]+\.vtt|chapters\/[A-Za-z0-9_-]+\.json|market[o]?Form\/[^?#]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "wistia_embed_support_assets",
  },
  {
    entity: "Fonticons, Inc.",
    vendor: "Font Awesome",
    product: "Font Awesome Kits CDN",
    purpose: "infrastructure",
    regulatoryRelevance: ["cdn", "font_delivery", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:kit|use)\.fontawesome\.com$/i],
    urlPatterns: [/^https:\/\/(?:kit|use)\.fontawesome\.com\/(?:[a-f0-9]+\.(?:css|js)|releases\/v\d+\.\d+\.\d+\/(?:css|webfonts)\/[^?#]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "font_awesome_kit_and_release_assets",
  },
  {
    entity: "InMobi Pte. Ltd.",
    vendor: "InMobi",
    product: "InMobi Choice CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "tcf", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cmp\.inmobi\.com$/i],
    urlPatterns: [/^https:\/\/cmp\.inmobi\.com\/(?:choice\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/choice\.js|geoip|GVL-v[23]\/[A-Za-z0-9_.-]+\.json|vendor-list\/[^?#]+|tcfv2\/vendor-list\/[^?#]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "inmobi_choice_cmp_runtime",
  },
  {
    entity: "Google LLC",
    vendor: "Google",
    product: "Google Funding Choices CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^fundingchoicesmessages\.google\.com$/i],
    urlPatterns: [/^https:\/\/fundingchoicesmessages\.google\.com\/(?:el|i)\/[A-Za-z0-9_-]+={0,2}(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "google_funding_choices_message_runtime",
  },
  {
    entity: "MarsFlag GmbH",
    vendor: "MarsFlag",
    product: "MarsFlag Site Search",
    purpose: "analytics",
    regulatoryRelevance: ["embedded_search", "search_analytics", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^(?:c|ce\.mf|s\.mp)\.marsflag\.com$/i],
    urlPatterns: [/^https:\/\/(?:c|ce\.mf)\.marsflag\.com\/[^?#]+\.(?:css|js|woff2?)(?:\?|$)/i, /^https:\/\/s\.mp\.marsflag\.com\/[^?#]+\.json(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "marsflag_site_search_runtime",
  },
  {
    entity: "Membrana Media",
    vendor: "Membrana Media",
    product: "Membrana Media Monetization",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_monetization", "third_party_runtime"],
    confidence: 0.93,
    hostPatterns: [/^cdn\.membrana\.media$/i],
    urlPatterns: [/^https:\/\/cdn\.membrana\.media\/(?:geolocation|scripts?\/[^?#]+|ym\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "membrana_media_monetization_runtime",
  },
  {
    entity: "Podscribe, Inc.",
    vendor: "Podscribe",
    product: "Podscribe Attribution",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "conversion_tracking", "podcast_attribution"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.pdst\.fm$/i],
    urlPatterns: [/^https:\/\/cdn\.pdst\.fm\/ping(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "podscribe_attribution_pixel_runtime",
  },
  {
    entity: "Innovid Corp.",
    vendor: "TVSquared",
    product: "TVSquared Attribution",
    aliases: ["InnovidXP TVSquared"],
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "tv_attribution", "ad_measurement"],
    confidence: 0.95,
    hostPatterns: [/^collector-\d+\.us\.tvsquared\.com$/i],
    urlPatterns: [/^https:\/\/collector-\d+\.us\.tvsquared\.com\/tv2track\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "tvsquared_tv_attribution_runtime",
  },
  {
    entity: "Qualtrics, LLC",
    vendor: "Qualtrics",
    product: "Qualtrics Site Intercept",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "customer_experience", "survey", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^siteintercept\.qualtrics\.com$/i, /^(?:[a-z0-9-]+\.)+siteintercept\.qualtrics\.com$/i],
    urlPatterns: [/^https:\/\/(?:[a-z0-9-]+\.)*siteintercept\.qualtrics\.com\/(?:SIE(?:\/|$)|WRSiteInterceptEngine\/|dxjsmodule\/|targeting\/|chunks\/CoreModule)[^?#]*(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "qualtrics_site_intercept_runtime",
  },
  {
    entity: "Functional Software, Inc.",
    vendor: "Sentry",
    product: "Sentry Browser SDK",
    purpose: "performance_monitoring",
    regulatoryRelevance: ["performance_monitoring", "telemetry", "diagnostics", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^browser\.sentry-cdn\.com$/i],
    urlPatterns: [/^https:\/\/browser\.sentry-cdn\.com\/\d+(?:\.\d+){1,2}\/bundle(?:\.[A-Za-z0-9_-]+)*(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "sentry_browser_sdk_runtime",
  },
  {
    entity: "Queryly, Inc.",
    vendor: "Queryly",
    product: "Queryly Site Search",
    purpose: "analytics",
    regulatoryRelevance: ["embedded_search", "search_analytics", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^(?:www\.)?queryly\.com$/i],
    urlPatterns: [/^https:\/\/(?:www\.)?queryly\.com\/js\/queryly\.v4(?:\.min)?\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "queryly_site_search_runtime",
  },
  {
    entity: "Adobe Inc.",
    vendor: "Adobe",
    product: "Adobe Marketo Engage Munchkin",
    aliases: ["Marketo Munchkin"],
    purpose: "analytics",
    regulatoryRelevance: ["consent", "analytics", "lead_tracking", "marketing_automation"],
    confidence: 0.98,
    hostPatterns: [/^munchkin\.marketo\.net$/i],
    urlPatterns: [/^https:\/\/munchkin\.marketo\.net\/(?:\d+\/)?munchkin(?:-beta)?\.js(?:\?|$)/i],
    cookiePatterns: [/^_mkto_trk$/i],
    requireUrlPatternMatch: true,
    basisLabel: "adobe_marketo_munchkin_runtime",
  },
  {
    entity: "AB Tasty SAS",
    vendor: "AB Tasty",
    product: "AB Tasty Experimentation",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "experimentation", "ab_testing", "personalization"],
    confidence: 0.95,
    hostPatterns: [/^try\.abtasty\.com$/i],
    urlPatterns: [/^https:\/\/try\.abtasty\.com\/(?:[A-Za-z0-9_-]+(?:\/main\.[a-f0-9]+\.js)?|shared\/[A-Za-z0-9_-]+)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ab_tasty_experimentation_runtime",
  },
  {
    entity: "Amazon.com, Inc.",
    vendor: "Amazon",
    product: "Amazon Publisher Services",
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "publisher_ad_server", "programmatic_ads"],
    confidence: 0.98,
    hostPatterns: [/^c\.amazon-adsystem\.com$/i],
    urlPatterns: [/^https:\/\/c\.amazon-adsystem\.com\/aax2\/apstag\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "amazon_publisher_services_apstag_runtime",
  },
  {
    entity: "LiveInternet LLC",
    vendor: "LiveInternet",
    product: "LiveInternet Analytics Counter",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^counter\.yadro\.ru$/i],
    urlPatterns: [/^https:\/\/counter\.yadro\.ru\/(?:hit(?:_[A-Za-z0-9_-]+)?|logo)(?:[/?#]|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "liveinternet_analytics_counter",
  },
  {
    entity: "Automattic Inc.",
    vendor: "WordPress.com",
    product: "Jetpack Stats",
    purpose: "analytics",
    regulatoryRelevance: ["analytics", "audience_measurement", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^pixel\.wp\.com$/i],
    urlPatterns: [/^https:\/\/pixel\.wp\.com\/g\.gif(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "jetpack_stats_pixel",
  },
  {
    entity: "Intellimize, Inc.",
    vendor: "Intellimize",
    product: "Intellimize Personalization",
    purpose: "analytics",
    regulatoryRelevance: ["consent", "personalization", "experimentation", "third_party_runtime"],
    confidence: 0.95,
    hostPatterns: [/^cdn\.intellimize\.co$/i],
    urlPatterns: [/^https:\/\/cdn\.intellimize\.co\/snippet\/[A-Za-z0-9_-]+\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "intellimize_personalization_runtime",
  },
  {
    entity: "OneTrust, LLC",
    vendor: "OneTrust",
    product: "OneTrust CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "third_party_runtime"],
    confidence: 0.97,
    hostPatterns: [/^cookie-cdn\.cookiepro\.com$/i],
    urlPatterns: [/^https:\/\/cookie-cdn\.cookiepro\.com\/(?:consent\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|scripttemplates\/(?:\d+(?:\.\d+)*\/)?(?:otBannerSdk|otSDKStub)\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "onetrust_cookiepro_cmp_runtime",
  },
  {
    entity: "Ad Lightning, Inc.",
    vendor: "Ad Lightning",
    product: "Ad Lightning Ad Quality",
    purpose: "security",
    regulatoryRelevance: ["security", "ad_security", "malvertising_protection", "third_party_runtime"],
    confidence: 0.94,
    hostPatterns: [/^tagan\.adlightning\.com$/i],
    urlPatterns: [/^https:\/\/tagan\.adlightning\.com\/[A-Za-z0-9_-]+\/op\.js(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ad_lightning_ad_quality_runtime",
  },
  {
    entity: "Ketch Kloud, Inc.",
    vendor: "Ketch",
    product: "Ketch CMP",
    purpose: "consent_management",
    regulatoryRelevance: ["consent_management", "tcf", "third_party_runtime"],
    confidence: 0.96,
    hostPatterns: [/^cdn\.ketchjs\.com$/i],
    urlPatterns: [/^https:\/\/cdn\.ketchjs\.com\/(?:ketchtag\/stable\/v\d+(?:\.\d+)*\/ketch-sdk\.js|plugins\/v\d+\/tcf\/stub\.js|web\/v\d+\/ketch\.js|tcf\/v\d+\/stub\.js|ketch\.js)(?:\?|$)/i],
    requireUrlPatternMatch: true,
    basisLabel: "ketch_cmp_cdn_runtime",
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

export function resolveCanonicalVendorLabel(value: string | null | undefined): CanonicalVendorLabelResolution | null {
  const normalizedValue = value?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedValue)) {
    const hostnameObservation = resolveVendorObservations([{
      type: "request",
      hostname: normalizedValue,
      matchSource: "network_request",
    }])[0];
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

export function resolveVendorObservations(
  inputs: VendorResolverInput[],
): NormalizedVendorObservation[] {
  const observations = new Map<string, NormalizedVendorObservation>();

  for (const input of inputs) {
    const url = input.url;
    const hostname = normalizeHostname(input.hostname ?? hostnameFromUrl(url));
    const cookieName = input.cookieName;
    const globalName = input.globalName;
    const storageKey = input.storageKey;
    const domSelector = input.domSelector;

    for (const rule of rules) {
      const matchedHost = hostname
        ? matchesAny(hostname, rule.hostPatterns) && !matchesAny(hostname, rule.excludeHostPatterns)
        : false;
      const matchedUrlPattern = url ? matchesAny(url, rule.urlPatterns) : false;
      const matchedUrl = matchedUrlPattern && (!rule.hostPatterns || matchedHost);
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

      const key = [
        rule.entity,
        rule.product,
      ].join("|");

      const existing = observations.get(key);
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
