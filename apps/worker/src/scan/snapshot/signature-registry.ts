import type { DetectionSource, VendorCategory } from "@website-signal-risk-scanner/shared";

export type VendorSignature = {
  id: string;
  name: string;
  category: VendorCategory;
  confidence: number;
  hostnamePatterns?: string[];
  pathFragments?: string[];
  htmlPatterns?: RegExp[];
  textPatterns?: RegExp[];
  domMarkers?: string[];
  detectionSource: DetectionSource;
};

function pattern(source: string) {
  return new RegExp(source, "i");
}

export const TRACKER_VENDOR_SIGNATURES: VendorSignature[] = [
  {
    id: "google_analytics",
    name: "Google Analytics",
    category: "analytics",
    confidence: 0.95,
    hostnamePatterns: ["google-analytics.com", "analytics.google.com"],
    pathFragments: ["/g/collect", "/collect", "gtag/js"],
    htmlPatterns: [pattern("google-analytics"), pattern("gtag\\("), pattern("ga\\(")],
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
    hostnamePatterns: ["fullstory.com", "fsd2.com"],
    htmlPatterns: [pattern("FS\\.identify"), pattern("fullstory")],
    detectionSource: "script_signature"
  },
  {
    id: "microsoft_clarity",
    name: "Microsoft Clarity",
    category: "session_replay",
    confidence: 0.95,
    hostnamePatterns: ["clarity.ms"],
    htmlPatterns: [pattern("clarity\\("), pattern("clarity.ms")],
    detectionSource: "script_signature"
  },
  {
    id: "segment",
    name: "Segment",
    category: "analytics",
    confidence: 0.9,
    hostnamePatterns: ["segment.com", "segment.io"],
    htmlPatterns: [pattern("analytics\\.load"), pattern("segment")],
    detectionSource: "script_signature"
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "analytics",
    confidence: 0.9,
    hostnamePatterns: ["mixpanel.com"],
    htmlPatterns: [pattern("mixpanel")],
    detectionSource: "script_signature"
  },
  {
    id: "amplitude",
    name: "Amplitude",
    category: "analytics",
    confidence: 0.9,
    hostnamePatterns: ["amplitude.com"],
    htmlPatterns: [pattern("amplitude")],
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
    htmlPatterns: [pattern("usercentrics")],
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
