import type { FindingSeverity } from "@website-signal-risk-scanner/shared";

export type TrackerSignature = {
  defaultSeverity: FindingSeverity;
  defaultWeight: number;
  displayName: string;
  hostnamePatterns: string[];
  key: string;
  pathFragments?: string[];
};

export const TRACKER_SIGNATURES: TrackerSignature[] = [
  {
    key: "google_analytics",
    displayName: "Google Analytics",
    hostnamePatterns: ["google-analytics.com", "analytics.google.com"],
    pathFragments: ["/g/collect", "/collect"],
    defaultSeverity: "low",
    defaultWeight: 2
  },
  {
    key: "google_tag_manager",
    displayName: "Google Tag Manager",
    hostnamePatterns: ["googletagmanager.com"],
    pathFragments: ["/gtm.js", "/gtag/js"],
    defaultSeverity: "low",
    defaultWeight: 2
  },
  {
    key: "meta_pixel",
    displayName: "Meta Pixel",
    hostnamePatterns: ["facebook.net", "facebook.com"],
    pathFragments: ["/tr", "/fbevents.js"],
    defaultSeverity: "low",
    defaultWeight: 2
  },
  {
    key: "tiktok_pixel",
    displayName: "TikTok Pixel",
    hostnamePatterns: ["analytics.tiktok.com", "tiktok.com"],
    pathFragments: ["/pixel", "/i18n/pixel"],
    defaultSeverity: "low",
    defaultWeight: 2
  },
  {
    key: "linkedin_insight",
    displayName: "LinkedIn Insight Tag",
    hostnamePatterns: ["snap.licdn.com", "linkedin.com"],
    pathFragments: ["/li.lms-analytics/insight.min.js", "/collect"],
    defaultSeverity: "low",
    defaultWeight: 2
  },
  {
    key: "hotjar",
    displayName: "Hotjar",
    hostnamePatterns: ["hotjar.com", "hotjar.io"],
    pathFragments: ["/c/hotjar-", "/modules."],
    defaultSeverity: "low",
    defaultWeight: 2
  }
];
