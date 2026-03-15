import type { DetectionSource, VendorCategory } from "@website-signal-risk-scanner/shared";

export type VendorSignature = {
  id: string;
  name: string;
  category: VendorCategory;
  confidence: number;
  allowFirstPartyProxy?: boolean;
  hostnamePatterns?: string[];
  pathFragments?: string[];
  htmlPatterns?: RegExp[];
  textPatterns?: RegExp[];
  domMarkers?: string[];
  detectionSource: DetectionSource;
};

export function isFirstPartyHost(host: string | null, pageDomain: string) {
  return host === pageDomain || (host ? host.endsWith(`.${pageDomain}`) : false);
}

export function analyzeVendorRequestMatch(url: string, signature: VendorSignature, pageDomain: string) {
  try {
    const requestUrl = new URL(url);
    const isFirstParty = isFirstPartyHost(requestUrl.hostname, pageDomain);
    const hostMatch =
      signature.hostnamePatterns?.some(
        (pattern) => requestUrl.hostname === pattern || requestUrl.hostname.endsWith(`.${pattern}`)
      ) ?? false;

    const fullPath = `${requestUrl.pathname}${requestUrl.search}`.toLowerCase();
    const pathMatches =
      signature.pathFragments?.some((fragment) => fullPath.includes(fragment.toLowerCase())) ?? false;

    if (hostMatch) {
      if (signature.pathFragments?.length && !pathMatches) {
        return null;
      }

      return {
        collectionEndpointType: isFirstParty ? ("first_party_subdomain" as const) : ("direct_third_party" as const),
        requestHost: requestUrl.hostname
      };
    }

    if (isFirstParty && signature.allowFirstPartyProxy && pathMatches) {
      return {
        collectionEndpointType: "first_party_collection_proxy" as const,
        requestHost: requestUrl.hostname
      };
    }

    return null;
  } catch {
    return null;
  }
}

function pattern(source: string) {
  return new RegExp(source, "i");
}

export const TRACKER_VENDOR_SIGNATURES: VendorSignature[] = [
  {
    id: "google_analytics",
    name: "Google Analytics",
    category: "analytics",
    confidence: 0.95,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["google-analytics.com", "analytics.google.com"],
    pathFragments: ["/g/collect", "/collect", "gtag/js"],
    htmlPatterns: [pattern("google-analytics"), pattern("gtag\\("), pattern("ga\\(")],
    detectionSource: "script_signature"
  },
  {
    id: "adobe_analytics",
    name: "Adobe Analytics",
    category: "analytics",
    confidence: 0.94,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["omtrdc.net", "2o7.net", "adobedc.net", "demdex.net"],
    pathFragments: ["/b/ss/", "/id", "/event", "/s-code"],
    htmlPatterns: [pattern("s_gi\\("), pattern("adobe analytics"), pattern("adobedc"), pattern("demdex")],
    detectionSource: "script_signature"
  },
  {
    id: "google_tag_manager",
    name: "Google Tag Manager",
    category: "tag_manager",
    confidence: 0.95,
    hostnamePatterns: ["googletagmanager.com"],
    pathFragments: ["/gtm.js", "/gtag/js"],
    htmlPatterns: [pattern("googletagmanager"), pattern("dataLayer")],
    detectionSource: "script_signature"
  },
  {
    id: "google_ads",
    name: "Google Ads",
    category: "advertising",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["googleadservices.com", "doubleclick.net"],
    pathFragments: ["/pagead/", "/conversion"],
    htmlPatterns: [pattern("googleads"), pattern("doubleclick")],
    detectionSource: "script_signature"
  },
  {
    id: "meta_pixel",
    name: "Meta Pixel",
    category: "advertising",
    confidence: 0.95,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["facebook.net", "facebook.com"],
    pathFragments: ["/tr", "/fbevents.js"],
    htmlPatterns: [pattern("fbq\\("), pattern("fbevents")],
    detectionSource: "script_signature"
  },
  {
    id: "linkedin_insight",
    name: "LinkedIn Insight Tag",
    category: "advertising",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["snap.licdn.com", "linkedin.com"],
    pathFragments: ["insight.min.js", "/collect"],
    htmlPatterns: [pattern("_linkedin_data_partner_ids"), pattern("licdn")],
    detectionSource: "script_signature"
  },
  {
    id: "tiktok_pixel",
    name: "TikTok Pixel",
    category: "advertising",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["analytics.tiktok.com", "tiktok.com"],
    pathFragments: ["/pixel", "/i18n/pixel"],
    htmlPatterns: [pattern("ttq\\.")],
    detectionSource: "script_signature"
  },
  {
    id: "pinterest_tag",
    name: "Pinterest Tag",
    category: "advertising",
    confidence: 0.85,
    hostnamePatterns: ["ct.pinterest.com", "pinimg.com"],
    htmlPatterns: [pattern("pintrk")],
    detectionSource: "script_signature"
  },
  {
    id: "reddit_pixel",
    name: "Reddit Pixel",
    category: "advertising",
    confidence: 0.85,
    hostnamePatterns: ["redditstatic.com", "reddit.com"],
    htmlPatterns: [pattern("rdt\\(")],
    detectionSource: "script_signature"
  },
  {
    id: "hotjar",
    name: "Hotjar",
    category: "session_replay",
    confidence: 0.95,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["hotjar.com", "hotjar.io"],
    pathFragments: ["/hotjar-", "/modules."],
    htmlPatterns: [pattern("hj\\("), pattern("hotjar")],
    detectionSource: "script_signature"
  },
  {
    id: "fullstory",
    name: "FullStory",
    category: "session_replay",
    confidence: 0.95,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["fullstory.com", "fsd2.com", "fullstoryedge.com"],
    pathFragments: ["/rec/page", "/fs.js", "/edge", "/v1/web"],
    htmlPatterns: [pattern("FS\\.identify"), pattern("fullstory")],
    detectionSource: "script_signature"
  },
  {
    id: "microsoft_clarity",
    name: "Microsoft Clarity",
    category: "session_replay",
    confidence: 0.95,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["clarity.ms"],
    htmlPatterns: [pattern("clarity\\("), pattern("clarity.ms")],
    detectionSource: "script_signature"
  },
  {
    id: "segment",
    name: "Segment",
    category: "analytics",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["segment.com", "segment.io", "cdn.segment.com", "api.segment.io"],
    pathFragments: ["/analytics.js", "/v1/p", "/v1/t", "/next-integrations"],
    htmlPatterns: [pattern("analytics\\.load"), pattern("segment")],
    detectionSource: "script_signature"
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "analytics",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["mixpanel.com"],
    htmlPatterns: [pattern("mixpanel")],
    detectionSource: "script_signature"
  },
  {
    id: "amplitude",
    name: "Amplitude",
    category: "analytics",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["amplitude.com", "amplitudeusercontent.com"],
    pathFragments: ["/2/httpapi", "/batch", "/analytics-browser"],
    htmlPatterns: [pattern("amplitude")],
    detectionSource: "script_signature"
  },
  {
    id: "heap",
    name: "Heap",
    category: "analytics",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["heapanalytics.com", "heap.io"],
    pathFragments: ["/js/heap-", "/api/track", "/api/add_event_props"],
    htmlPatterns: [pattern("heap\\.load"), pattern("heapanalytics")],
    detectionSource: "script_signature"
  },
  {
    id: "posthog",
    name: "PostHog",
    category: "analytics",
    confidence: 0.9,
    allowFirstPartyProxy: true,
    hostnamePatterns: ["posthog.com", "posthog.net", "i.posthog.com", "us.i.posthog.com", "eu.i.posthog.com"],
    pathFragments: ["/static/array.js", "/e/", "/decide/"],
    htmlPatterns: [pattern("posthog"), pattern("posthog\\.init")],
    detectionSource: "script_signature"
  },
  {
    id: "rudderstack",
    name: "RudderStack",
    category: "analytics",
    confidence: 0.9,
    hostnamePatterns: ["rudderstack.com", "rsinsights.com"],
    pathFragments: ["/v1/batch", "/v1/track", "/v1/page", "/rsa.min.js"],
    htmlPatterns: [pattern("rudderanalytics"), pattern("rudderstack")],
    detectionSource: "script_signature"
  },
  {
    id: "tealium",
    name: "Tealium",
    category: "tag_manager",
    confidence: 0.9,
    hostnamePatterns: ["tiqcdn.com", "tealiumiq.com", "tealium.com"],
    pathFragments: ["/utag/", "/utag.js", "/utag.sync.js"],
    htmlPatterns: [pattern("utag"), pattern("tealium")],
    detectionSource: "script_signature"
  },
  {
    id: "hubspot_analytics",
    name: "HubSpot",
    category: "marketing",
    confidence: 0.9,
    hostnamePatterns: ["hs-scripts.com", "hubspot.com", "hsforms.com"],
    htmlPatterns: [pattern("HubSpot"), pattern("hs-form")],
    detectionSource: "script_signature"
  },
  {
    id: "marketo",
    name: "Marketo",
    category: "marketing",
    confidence: 0.85,
    hostnamePatterns: ["marketo.net", "marketo.com"],
    htmlPatterns: [pattern("MktoForms2"), pattern("marketo")],
    detectionSource: "script_signature"
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    category: "marketing",
    confidence: 0.85,
    hostnamePatterns: ["klaviyo.com"],
    htmlPatterns: [pattern("klaviyo")],
    detectionSource: "script_signature"
  },
  {
    id: "braze",
    name: "Braze",
    category: "marketing",
    confidence: 0.88,
    hostnamePatterns: ["braze.com", "braze.eu", "appboycdn.com", "appboy.com"],
    pathFragments: ["/web-sdk/", "/api/v3/data", "/api/v3/track"],
    htmlPatterns: [pattern("braze"), pattern("appboy")],
    detectionSource: "script_signature"
  }
];

export const CMP_VENDOR_SIGNATURES: VendorSignature[] = [
  {
    id: "onetrust",
    name: "OneTrust",
    category: "cmp",
    confidence: 0.97,
    hostnamePatterns: ["onetrust.com", "cookielaw.org"],
    htmlPatterns: [pattern("onetrust"), pattern("optanon")],
    domMarkers: ["#onetrust-banner-sdk", "#onetrust-consent-sdk"],
    detectionSource: "dom"
  },
  {
    id: "cookiebot",
    name: "Cookiebot",
    category: "cmp",
    confidence: 0.96,
    hostnamePatterns: ["cookiebot.com"],
    htmlPatterns: [pattern("Cookiebot"), pattern("CybotCookiebotDialog")],
    domMarkers: ["#CybotCookiebotDialog"],
    detectionSource: "dom"
  },
  {
    id: "trustarc",
    name: "TrustArc",
    category: "cmp",
    confidence: 0.95,
    hostnamePatterns: ["trustarc.com", "truste.com"],
    htmlPatterns: [pattern("trustarc"), pattern("truste")],
    detectionSource: "dom"
  },
  {
    id: "didomi",
    name: "Didomi",
    category: "cmp",
    confidence: 0.95,
    hostnamePatterns: ["didomi.io"],
    htmlPatterns: [pattern("didomi"), pattern("__didomi")],
    detectionSource: "dom"
  },
  {
    id: "usercentrics",
    name: "Usercentrics",
    category: "cmp",
    confidence: 0.94,
    hostnamePatterns: ["usercentrics.eu", "usercentrics.com"],
    htmlPatterns: [pattern("usercentrics"), pattern("uc-consent"), pattern("__ucCmp")],
    detectionSource: "dom"
  },
  {
    id: "iubenda",
    name: "Iubenda",
    category: "cmp",
    confidence: 0.94,
    hostnamePatterns: ["iubenda.com", "iubenda.net"],
    pathFragments: ["/cs/", "/cookie_solution/", "/consent_solution/"],
    htmlPatterns: [pattern("iubenda"), pattern("_iub"), pattern("iubenda_cs_configuration")],
    domMarkers: ["iubenda-cs-banner", "iubenda-cs-container", "iubenda-cs"],
    detectionSource: "dom"
  },
  {
    id: "osano",
    name: "Osano",
    category: "cmp",
    confidence: 0.92,
    hostnamePatterns: ["osano.com"],
    htmlPatterns: [pattern("osano")],
    detectionSource: "dom"
  },
  {
    id: "termly",
    name: "Termly",
    category: "cmp",
    confidence: 0.9,
    hostnamePatterns: ["termly.io"],
    htmlPatterns: [pattern("termly")],
    detectionSource: "dom"
  }
];

export const ACCESSIBILITY_WIDGET_SIGNATURES: VendorSignature[] = [
  {
    id: "userway",
    name: "UserWay",
    category: "accessibility_widget",
    confidence: 0.96,
    hostnamePatterns: ["userway.org"],
    htmlPatterns: [pattern("userway")],
    detectionSource: "script_signature"
  },
  {
    id: "accessibe",
    name: "accessiBe",
    category: "accessibility_widget",
    confidence: 0.96,
    hostnamePatterns: ["accessibe.com"],
    htmlPatterns: [pattern("accessibe"), pattern("acsb")],
    detectionSource: "script_signature"
  },
  {
    id: "audioeye",
    name: "AudioEye",
    category: "accessibility_widget",
    confidence: 0.94,
    hostnamePatterns: ["audioeye.com"],
    htmlPatterns: [pattern("audioeye")],
    detectionSource: "script_signature"
  },
  {
    id: "equalweb",
    name: "EqualWeb",
    category: "accessibility_widget",
    confidence: 0.94,
    hostnamePatterns: ["equalweb.com"],
    htmlPatterns: [pattern("equalweb")],
    detectionSource: "script_signature"
  }
];

export const PAYMENT_VENDOR_SIGNATURES: VendorSignature[] = [
  {
    id: "stripe",
    name: "Stripe",
    category: "payment",
    confidence: 0.96,
    hostnamePatterns: ["stripe.com"],
    htmlPatterns: [pattern("stripe"), pattern("js.stripe.com")],
    detectionSource: "script_signature"
  },
  {
    id: "paypal",
    name: "PayPal",
    category: "payment",
    confidence: 0.94,
    hostnamePatterns: ["paypal.com", "paypalobjects.com"],
    htmlPatterns: [pattern("paypal")],
    detectionSource: "script_signature"
  },
  {
    id: "braintree",
    name: "Braintree",
    category: "payment",
    confidence: 0.92,
    hostnamePatterns: ["braintreegateway.com"],
    htmlPatterns: [pattern("braintree")],
    detectionSource: "script_signature"
  },
  {
    id: "shopify_pay",
    name: "Shop Pay",
    category: "payment",
    confidence: 0.9,
    hostnamePatterns: ["shopify.com", "shop.app"],
    htmlPatterns: [pattern("shopify-payment"), pattern("shop pay")],
    detectionSource: "script_signature"
  }
];

export const CHAT_VENDOR_SIGNATURES: VendorSignature[] = [
  {
    id: "ada",
    name: "Ada",
    category: "chat_support",
    confidence: 0.95,
    hostnamePatterns: ["ada.support", "ada.cx"],
    htmlPatterns: [pattern("\\bask ada\\b"), pattern("ada support"), pattern("ada-widget")],
    detectionSource: "script_signature"
  },
  {
    id: "intercom",
    name: "Intercom",
    category: "chat_support",
    confidence: 0.94,
    hostnamePatterns: ["intercom.io", "intercomcdn.com"],
    htmlPatterns: [pattern("intercom")],
    detectionSource: "script_signature"
  },
  {
    id: "zendesk",
    name: "Zendesk",
    category: "chat_support",
    confidence: 0.92,
    hostnamePatterns: ["zdassets.com", "zendesk.com"],
    htmlPatterns: [pattern("zendesk"), pattern("zE\\(")],
    detectionSource: "script_signature"
  },
  {
    id: "drift",
    name: "Drift",
    category: "chat_support",
    confidence: 0.92,
    hostnamePatterns: ["driftt.com", "drift.com"],
    htmlPatterns: [pattern("drift")],
    detectionSource: "script_signature"
  },
  {
    id: "forethought",
    name: "Forethought",
    category: "chat_support",
    confidence: 0.93,
    hostnamePatterns: ["forethought.ai"],
    htmlPatterns: [pattern("forethought"), pattern("solve widget"), pattern("agatha")],
    detectionSource: "script_signature"
  }
];

export const CMS_SIGNATURES: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "WordPress", patterns: [pattern("wp-content"), pattern("wp-includes")] },
  { name: "Shopify", patterns: [pattern("cdn\\.shopify\\.com"), pattern("shopify") ] },
  { name: "Webflow", patterns: [pattern("webflow") ] },
  { name: "Squarespace", patterns: [pattern("squarespace"), pattern("static\\.squarespace") ] },
  { name: "Wix", patterns: [pattern("wixstatic"), pattern("wix\\.com") ] }
];

export const FRONTEND_FRAMEWORK_SIGNATURES: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "Next.js", patterns: [pattern("_next/"), pattern("__NEXT_DATA__")] },
  { name: "React", patterns: [pattern("react"), pattern("data-reactroot")] },
  { name: "Vue", patterns: [pattern("vue"), pattern("__NUXT__")] },
  { name: "Angular", patterns: [pattern("ng-version"), pattern("angular")] },
  { name: "Svelte", patterns: [pattern("svelte")] }
];

export const HOSTING_SIGNATURES: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "Cloudflare", patterns: [pattern("cloudflare"), pattern("cf-ray")] },
  { name: "Vercel", patterns: [pattern("vercel"), pattern("x-vercel")] },
  { name: "Netlify", patterns: [pattern("netlify")] },
  { name: "Fastly", patterns: [pattern("fastly")] },
  { name: "Shopify", patterns: [pattern("shopify")] }
];
