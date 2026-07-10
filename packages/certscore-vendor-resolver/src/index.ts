import type {
  EndpointGeographyPrecision,
  EndpointGeographyStatus,
  EvidenceRef,
  NormalizedVendorObservation,
  VendorMatchSourceType,
} from "@certscore/contracts";

export const CANONICAL_VENDOR_RESOLVER_VERSION = "certscore-vendor-resolver-2026-07-08";

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

interface VendorRule {
  entity: string;
  vendor: string;
  product: string;
  purpose: NormalizedVendorObservation["purpose"];
  regulatoryRelevance: string[];
  confidence: number;
  hostPatterns?: RegExp[];
  urlPatterns?: RegExp[];
  cookiePatterns?: RegExp[];
  globalPatterns?: RegExp[];
  storageKeyPatterns?: RegExp[];
  domSelectorPatterns?: RegExp[];
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
    hostPatterns: [/^p\.tvpixel\.com$/i],
    urlPatterns: [/^https:\/\/p\.tvpixel\.com\/(?:com|com\.snowplowanalytics\.snowplow|pixel|event)\b/i],
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
    purpose: "advertising",
    regulatoryRelevance: ["consent", "advertising", "analytics", "ad_measurement", "cross_site_tracking"],
    confidence: 0.93,
    hostPatterns: [/\.yandex\.(?:ru|com|net)$/i, /^yandex\.(?:ru|com|net)$/i],
    urlPatterns: [/\/(?:watch|metrika|metrika_match|ads|yabs|sync|setuid)\b/i],
    cookiePatterns: [/^yabs-sid$/i, /^sync_cookie_csrf$/i, /^yandexuid$/i, /^yuid/i],
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
    hostPatterns: [/\.permutive\.com$/i],
    urlPatterns: [/\/v2\/events/i, /\/track/i],
    storageKeyPatterns: [/^permutive/i, /^fedID\.permutive/i, /^fedID\.permutative/i],
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
    hostPatterns: [/\.taboola\.com$/i],
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
    hostPatterns: [/\.datadoghq\.com$/i, /\.browser-intake-datadoghq\.com$/i],
    urlPatterns: [/\/api\/v2\/rum/i, /\/v1\/input/i],
    basisLabel: "datadog_rum_endpoint",
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
    hostPatterns: [/^www\.clarity\.ms$/i, /^scripts\.clarity\.ms$/i, /^n\.clarity\.ms$/i, /^f\.clarity\.ms$/i],
    urlPatterns: [/^https:\/\/(?:www|scripts|n|f)\.clarity\.ms\/(?:tag|collect)\b/i],
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
        ? matchesAny(hostname, rule.hostPatterns)
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
