import type { PrivacyRuntimeFindingDatasetExample } from "./privacy-runtime-findings.dataset";

export const PRIVACY_RUNTIME_FINDINGS_REVIEWED_EXAMPLES: PrivacyRuntimeFindingDatasetExample[] = [
  {
    evidence: {
      requestUrls: [
        "https://www.certscore.ai/",
        "https://certscore.ai/",
        "https://certscore.ai/_next/image",
        "https://certscore.ai/_next/static/css/f2cf9f2e9d954c67.css",
        "https://certscore.ai/_next/static/chunks/webpack-f0128176a21a6226.js",
        "https://certscore.ai/_next/static/chunks/d98a2fc4-46a64405dee3214e.js",
        "https://certscore.ai/_next/static/chunks/8243-f197d750e451a0a1.js",
        "https://certscore.ai/_next/static/chunks/main-app-802f286b85b693ea.js"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-certscore-ai-accept_all-2026-04-24t21-20-06-922z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.certscore.ai/",
        "https://certscore.ai/",
        "https://certscore.ai/_next/image",
        "https://certscore.ai/_next/static/css/f2cf9f2e9d954c67.css",
        "https://certscore.ai/_next/static/chunks/webpack-f0128176a21a6226.js",
        "https://certscore.ai/_next/static/chunks/d98a2fc4-46a64405dee3214e.js",
        "https://certscore.ai/_next/static/chunks/8243-f197d750e451a0a1.js",
        "https://certscore.ai/_next/static/chunks/main-app-802f286b85b693ea.js"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-certscore-ai-custom_preferences-2026-04-24t21-20-06-922z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.certscore.ai/",
        "https://certscore.ai/",
        "https://certscore.ai/_next/image",
        "https://certscore.ai/_next/static/css/f2cf9f2e9d954c67.css",
        "https://certscore.ai/_next/static/chunks/webpack-f0128176a21a6226.js",
        "https://certscore.ai/_next/static/chunks/d98a2fc4-46a64405dee3214e.js",
        "https://certscore.ai/_next/static/chunks/8243-f197d750e451a0a1.js",
        "https://certscore.ai/_next/static/chunks/main-app-802f286b85b693ea.js"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-certscore-ai-fresh_visit-2026-04-24t21-20-06-922z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.certscore.ai/",
        "https://certscore.ai/",
        "https://certscore.ai/_next/image",
        "https://certscore.ai/_next/static/css/f2cf9f2e9d954c67.css",
        "https://certscore.ai/_next/static/chunks/webpack-f0128176a21a6226.js",
        "https://certscore.ai/_next/static/chunks/d98a2fc4-46a64405dee3214e.js",
        "https://certscore.ai/_next/static/chunks/8243-f197d750e451a0a1.js",
        "https://certscore.ai/_next/static/chunks/main-app-802f286b85b693ea.js"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-certscore-ai-fresh_visit_gpc-2026-04-24t21-20-06-922z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.certscore.ai/",
        "https://certscore.ai/",
        "https://certscore.ai/_next/image",
        "https://certscore.ai/_next/static/css/f2cf9f2e9d954c67.css",
        "https://certscore.ai/_next/static/chunks/webpack-f0128176a21a6226.js",
        "https://certscore.ai/_next/static/chunks/d98a2fc4-46a64405dee3214e.js",
        "https://certscore.ai/_next/static/chunks/8243-f197d750e451a0a1.js",
        "https://certscore.ai/_next/static/chunks/main-app-802f286b85b693ea.js"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-certscore-ai-reject_all-2026-04-24t21-20-06-922z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      requestUrls: [
        "https://gum.criteo.com/sync"
      ],
      sequenceEvidence: true,
      vendors: [
        "Criteo"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-www-walmart-com-F005-2026-04-24t21-26-36-145z",
    notes: "Report-level live audit finding: In the signal-enabled session, first-load tracking signals did not show a clear reduction relative to the control session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.duckduckgo.com/",
        "https://duckduckgo.com/",
        "https://duckduckgo.com/static-assets/font/ProximaNova-RegIt-webfont.woff2",
        "https://duckduckgo.com/country.json",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Regular.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Medium.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Bold.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansDisplay-Regular.woff2"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-duckduckgo-com-fresh_visit-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.duckduckgo.com/",
        "https://duckduckgo.com/",
        "https://duckduckgo.com/static-assets/font/ProximaNova-RegIt-webfont.woff2",
        "https://duckduckgo.com/country.json",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Regular.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Medium.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Bold.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansDisplay-Regular.woff2"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-duckduckgo-com-fresh_visit_gpc-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.duckduckgo.com/",
        "https://duckduckgo.com/",
        "https://duckduckgo.com/static-assets/font/ProximaNova-RegIt-webfont.woff2",
        "https://duckduckgo.com/country.json",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Regular.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Medium.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansProduct-Bold.woff2",
        "https://duckduckgo.com/static-assets/font/DuckSansDisplay-Regular.woff2"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-duckduckgo-com-reject_all-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.ikea.com/",
        "https://www.ikea.com/global/assets/fonts/woff2/noto-ikea-400.latin.5a052965.woff2",
        "https://www.ikea.com/global/assets/fonts/woff2/noto-ikea-700.latin.a3f10ed8.woff2",
        "https://www.ikea.com/global/en/esi/common/_astro/ikea-font-styles.8a11632f.css",
        "https://www.ikea.com/global/en/esi/common/_astro/extractFromInline.1e307705.css",
        "https://www.ikea.com/global/en/esi/common/_astro/FragmentCommon.CTdT-_OG.css",
        "https://www.ikea.com/global/en/esi/common/initOnetrust-4dd3d3a0.js",
        "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review",
        "strictly_necessary"
      ],
      vendors: [
        "Consent Management Platform"
      ]
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-ikea-com-fresh_visit-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.ikea.com/",
        "https://www.ikea.com/global/assets/fonts/woff2/noto-ikea-400.latin.5a052965.woff2",
        "https://www.ikea.com/global/assets/fonts/woff2/noto-ikea-700.latin.a3f10ed8.woff2",
        "https://www.ikea.com/global/en/esi/common/_astro/ikea-font-styles.8a11632f.css",
        "https://www.ikea.com/global/en/esi/common/_astro/extractFromInline.1e307705.css",
        "https://www.ikea.com/global/en/esi/common/_astro/FragmentCommon.CTdT-_OG.css",
        "https://www.ikea.com/global/en/esi/common/initOnetrust-4dd3d3a0.js",
        "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review",
        "strictly_necessary"
      ],
      vendors: [
        "Consent Management Platform"
      ]
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-ikea-com-reject_all-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-nytimes-com/accept_all/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-nytimes-com/accept_all/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://www.googletagmanager.com/gtm.js",
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://c.amazon-adsystem.com/aax2/apstag.js",
        "https://config.aps.amazon-adsystem.com/configs/3030",
        "https://c.amazon-adsystem.com/cdn/prod/config",
        "https://c.amazon-adsystem.com/bao-csm/aps-comm/aps_csm.js",
        "https://aax.amazon-adsystem.com/e/dtb/bid",
        "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m202604210101/pubads_impl.js"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "Google Tag Manager",
        "DoubleClick",
        "Amazon Ads",
        "Criteo",
        "AppNexus / Xandr"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-nytimes-com-accept_all-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-nytimes-com/fresh_visit/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-nytimes-com/fresh_visit/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://c.amazon-adsystem.com/aax2/apstag.js",
        "https://www.googletagmanager.com/gtm.js",
        "https://config.aps.amazon-adsystem.com/configs/3030",
        "https://c.amazon-adsystem.com/cdn/prod/config",
        "https://c.amazon-adsystem.com/bao-csm/aps-comm/aps_csm.js",
        "https://aax.amazon-adsystem.com/e/dtb/bid",
        "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m202604220101/pubads_impl.js"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "advertising_marketing",
        "analytics"
      ],
      vendors: [
        "DoubleClick",
        "Amazon Ads",
        "Google Tag Manager",
        "Criteo",
        "AppNexus / Xandr"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-nytimes-com-fresh_visit-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-theguardian-com/accept_all/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-theguardian-com/accept_all/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://www3.doubleclick.net/",
        "https://c.amazon-adsystem.com/aax2/apstag.js",
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/971225648/",
        "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m202604210101/pubads_impl.js",
        "https://ib.adnxs.com/getuidj",
        "https://config.aps.amazon-adsystem.com/configs/3722",
        "https://c.amazon-adsystem.com/cdn/prod/config"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "advertising_marketing"
      ],
      vendors: [
        "DoubleClick",
        "Amazon Ads",
        "AppNexus / Xandr",
        "Criteo"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-theguardian-com-accept_all-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-theguardian-com/fresh_visit/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-theguardian-com/fresh_visit/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://www3.doubleclick.net/",
        "https://c.amazon-adsystem.com/aax2/apstag.js",
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/971225648/",
        "https://config.aps.amazon-adsystem.com/configs/3722",
        "https://c.amazon-adsystem.com/cdn/prod/config",
        "https://c.amazon-adsystem.com/bao-csm/aps-comm/aps_csm.js",
        "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m202604210101/pubads_impl.js"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "advertising_marketing"
      ],
      vendors: [
        "DoubleClick",
        "Amazon Ads",
        "AppNexus / Xandr",
        "Criteo"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-theguardian-com-fresh_visit-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-theguardian-com/fresh_visit_gpc/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-theguardian-com/fresh_visit_gpc/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://www3.doubleclick.net/",
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m202604210101/pubads_impl.js",
        "https://securepubads.g.doubleclick.net/pagead/managed/dict/m202604230101/gpt",
        "https://cm.g.doubleclick.net/partnerpixels",
        "https://static.criteo.net/js/ld/publishertag.ids.js",
        "https://securepubads.g.doubleclick.net/gampad/ads",
        "https://gum.criteo.com/syncframe"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "advertising_marketing"
      ],
      vendors: [
        "DoubleClick",
        "Criteo"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-theguardian-com-fresh_visit_gpc-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-walmart-com/accept_all/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-walmart-com/accept_all/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://gum.criteo.com/sync",
        "https://secure.adnxs.com/getuid",
        "https://secure.adnxs.com/bounce"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "advertising_marketing"
      ],
      vendors: [
        "Criteo",
        "AppNexus / Xandr"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-walmart-com-accept_all-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-walmart-com/fresh_visit/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-walmart-com/fresh_visit/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://gum.criteo.com/sync"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "advertising_marketing"
      ],
      vendors: [
        "Criteo"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-walmart-com-fresh_visit-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-walmart-com/fresh_visit_gpc/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-26-36.145Z/www-walmart-com/fresh_visit_gpc/first-load.png"
      ],
      consentBannerDetectedMs: 12000,
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: [
        "https://gum.criteo.com/sync"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "advertising_marketing"
      ],
      vendors: [
        "Criteo"
      ]
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-www-walmart-com-fresh_visit_gpc-2026-04-24t21-26-36-145z",
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.wikipedia.org/",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/sprite-e49fbf32.svg",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/index-a9b103e1fc.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/gt-ie9-507b16b6be.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikinews-logo_sister.png"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-wikipedia-org-accept_all-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.wikipedia.org/",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/sprite-e49fbf32.svg",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/index-a9b103e1fc.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/gt-ie9-507b16b6be.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikinews-logo_sister.png"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-wikipedia-org-custom_preferences-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.wikipedia.org/",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/sprite-e49fbf32.svg",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/index-a9b103e1fc.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/gt-ie9-507b16b6be.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikinews-logo_sister.png"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-wikipedia-org-fresh_visit-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.wikipedia.org/",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/sprite-e49fbf32.svg",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/index-a9b103e1fc.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/gt-ie9-507b16b6be.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikinews-logo_sister.png"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-wikipedia-org-fresh_visit_gpc-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      requestUrls: [
        "https://www.wikipedia.org/",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/sprite-e49fbf32.svg",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/index-a9b103e1fc.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/js/gt-ie9-507b16b6be.js",
        "https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikinews-logo_sister.png"
      ],
      sequenceEvidence: false,
      vendorCategories: [
        "unknown_needs_manual_review"
      ],
      vendors: []
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-preconsent-negative-www-wikipedia-org-reject_all-2026-04-24t21-26-36-145z",
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-44-18.012Z/www-bestbuy-com/fresh_visit_gpc/first-load.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-44-18.012Z/www-bestbuy-com/fresh_visit_gpc/banner.png"
      ],
      detectionSource: "live_consent_audit_report",
      requestUrls: [
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://www.googletagmanager.com/gtag/js",
        "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m202604210101/pubads_impl.js",
        "https://securepubads.g.doubleclick.net/pagead/managed/dict/m202604230101/gpt",
        "https://ad.doubleclick.net/activity;src=4448269;type=bbycom;cat=BBY-S0;rcb=2;ord=4654468581826;npa=0;auiddc=1743222283.1777067241;u3=not_provided;u5=null;u6=anonymous;u7=en-US;u14=undefined;u15=undefined;u16=not_provided;u18=not_provided;u19=not_provided;u20=not_provided;uaa=x86;uab=64;uafvl=Not%253AA-Brand%3B99.0.0.0%7CHeadlessChrome%3B145.0.7632.6%7CChromium%3B145.0.7632.6;uamb=0;uam=;uap=macOS;uapv=10_15_7;uaw=0;pscdl=noapi;frm=0;_tu=IFA;gtm=45fe64m2h1v9179369925za200zd9179369925xec;gcd=13l3l3l3l1l1;dma=0;dc_fmt=3;tag_exp=0~115616986~115938466~115938468~117266400;epver=2;dc_random=1777067241_5n9pzaieU-neDKQ_CCmuu8kONBYo6FTNew;~oref=https%3A%2F%2Fwww.bestbuy.com%2F",
        "https://4448269.fls.doubleclick.net/activityi;src=4448269;type=bbycom;cat=BBY-S0;rcb=2;ord=4654468581826;npa=0;auiddc=1743222283.1777067241;u3=not_provided;u5=null;u6=anonymous;u7=en-US;u14=undefined;u15=undefined;u16=not_provided;u18=not_provided;u19=not_provided;u20=not_provided;uaa=x86;uab=64;uafvl=Not%253AA-Brand%3B99.0.0.0%7CHeadlessChrome%3B145.0.7632.6%7CChromium%3B145.0.7632.6;uamb=0;uam=;uap=macOS;uapv=10_15_7;uaw=0;pscdl=noapi;frm=0;_tu=IFA;gtm=45fe64m2h1v9179369925za200zd9179369925xec;gcd=13l3l3l3l1l1;dma=0;dc_fmt=2;tag_exp=0~115616986~115938466~115938468~117266400;epver=2;dc_random=1777067241_5n9pzaieU-neDKQ_CCmuu8kONBYo6FTNew;_dc_test=1;~oref=https%3A%2F%2Fwww.bestbuy.com%2F",
        "https://4448269.fls.doubleclick.net/activityi;dc_pre=COPUtq27h5QDFT9iCAQdREMW3Q;src=4448269;type=bbycom;cat=BBY-S0;rcb=2;ord=4654468581826;npa=0;auiddc=1743222283.1777067241;u3=not_provided;u5=null;u6=anonymous;u7=en-US;u14=undefined;u15=undefined;u16=not_provided;u18=not_provided;u19=not_provided;u20=not_provided;uaa=x86;uab=64;uafvl=Not%253AA-Brand%3B99.0.0.0%7CHeadlessChrome%3B145.0.7632.6%7CChromium%3B145.0.7632.6;uamb=0;uam=;uap=macOS;uapv=10_15_7;uaw=0;pscdl=noapi;frm=0;_tu=IFA;gtm=45fe64m2h1v9179369925za200zd9179369925xec;gcd=13l3l3l3l1l1;dma=0;dc_fmt=2;tag_exp=0~115616986~115938466~115938468~117266400;epver=2;dc_random=1777067241_5n9pzaieU-neDKQ_CCmuu8kONBYo6FTNew;_dc_test=1;~oref=https%3A%2F%2Fwww.bestbuy.com%2F",
        "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1066288264/"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "DoubleClick",
        "Google Tag Manager"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-www-bestbuy-com-F005-2026-04-24t21-44-18-012z",
    notes: "Report-level live audit finding: In the signal-enabled session, first-load tracking signals did not show a clear reduction relative to the control session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-44-18.012Z/www-homedepot-com/fresh_visit_gpc/first-load.png",
        "/Users/benmasek/WC01/apps/validation-worker/apps/validation-worker/artifacts/live-consent-audit/2026-04-24T21-44-18.012Z/www-homedepot-com/fresh_visit_gpc/banner.png"
      ],
      detectionSource: "live_consent_audit_report",
      requestUrls: [
        "https://fls.doubleclick.net/activityj;src=3518820;type=thd;cat=thd001;u16=11593195990479194363267518960751017778;u26=https%3A%2F%2Fwww.homedepot.com%2F;u5=;u1=The%20Home%20Depot",
        "https://www.facebook.com/tr",
        "https://ib.adnxs.com/getuidp",
        "https://ct.pinterest.com/user",
        "https://www.googletagmanager.com/gtag/js",
        "https://fls.doubleclick.net/activityj;dc_pre=CLXE2qe8h5QDFc7F_QUd_OQzNQ;src=3518820;type=thd;cat=thd001;u16=11593195990479194363267518960751017778;u26=https%3A%2F%2Fwww.homedepot.com%2F;u5=;u1=The%20Home%20Depot",
        "https://www.google-analytics.com/analytics.js",
        "https://ad.doubleclick.net/activity;src=3518820;type=thd;cat=homed00b;rcb=16;ord=2691893779300;npa=0;auiddc=737683712.1777067499;pscdl=noapi;frm=0;_tu=IFA;gtm=45fe64m2v9190728172za200xec;gcd=13l3l3l3l1l1;dma=0;dc_fmt=3;tag_exp=0~115616985~115938465~115938468~117266401~118167058~118463261;epver=2;match_id=efcf1eaa-6ffe-4bef-bc80-3c751a870e4d;dc_random=1777067498_6OiUMt3gNof129U_MfjQ0GfQJD_nhVHbsw;~oref=https%3A%2F%2Fwww.homedepot.com%2F"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "AppNexus / Xandr",
        "DoubleClick",
        "Google Analytics",
        "Google Tag Manager",
        "Meta / Facebook",
        "Pinterest"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-www-homedepot-com-F005-2026-04-24t21-44-18-012z",
    notes: "Report-level live audit finding: In the signal-enabled session, first-load tracking signals did not show a clear reduction relative to the control session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T03-48-38.600Z/amazon-com/reject_all/banner.png"
      ],
      detectionSource: "live_consent_audit_report",
      requestUrls: [
        "https://m.media-amazon.com/images/S/sash/lwkLI5Y5l98hd1z.js",
        "https://images-na.ssl-images-amazon.com/images/G/01/DiscoTec/2026/Luxury/BTF/Fragrance_BLUE_Desk_1X._SY116_CB786089226_.jpg",
        "https://aes.us-east.ono.axp.amazon-adsystem.com/x/px",
        "https://m.media-amazon.com/images/I/91dn5m6T1dL.js",
        "https://m.media-amazon.com/images/S/sash/ixaPoep689xE8E8.js",
        "https://images-na.ssl-images-amazon.com/images/G/01/digital/video/merch/TV/LAZU_S1_DashboardCard_370x304_POST_Final_noLocale_PV00047252._SY304_CB799903168_.jpg",
        "https://images-na.ssl-images-amazon.com/images/G/01/AmazonMusic/2024/Marketing/30DaysFreeEvergreenRefresh/GW/US-EN_012125_AMURefresh_ACQ_GW_379x304._SY304_CB552900543_.jpg",
        "https://m.media-amazon.com/images/I/71OJ9NQfrXL._AC_SY200_.jpg"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "Amazon Ads",
        "AppNexus / Xandr",
        "DoubleClick",
        "Google Analytics",
        "Meta / Facebook"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-amazon-com-F003-2026-03-26t03-48-38-600z",
    notes: "Report-level live audit finding: After an explicit reject-path interaction, likely non-essential requests or identifiers still appeared during the post-choice or refreshed session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T03-48-38.600Z/booking-com/reject_all/banner.png"
      ],
      detectionSource: "live_consent_audit_report",
      requestUrls: [
        "https://gtp-mktg.booking.com/g/collect",
        "https://bat.bing.com/actionp/0",
        "https://pagead2.googlesyndication.com/pagead/gen_204",
        "https://pagead2.googlesyndication.com/pcs/activeview",
        "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        "https://t-cf.bstatic.com/design-assets/assets/v3.176.0/illustrations-traveller/FreeCancellation.png",
        "https://cf.bstatic.com/psb/capla/static/js/node_modules_bookingcom_bui-react_components_BUIProvider_BUIProvider_context_js-_f41b1.84b3c981.js",
        "https://www.googletagmanager.com/gtm.js"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "AppNexus / Xandr",
        "Criteo",
        "DoubleClick",
        "Google Analytics",
        "Google Tag Manager",
        "Meta / Facebook"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-booking-com-F003-2026-03-26t03-48-38-600z",
    notes: "Report-level live audit finding: After an explicit reject-path interaction, likely non-essential requests or identifiers still appeared during the post-choice or refreshed session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T03-48-38.600Z/shein-com/reject_all/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T03-48-38.600Z/shein-com/reject_all/preferences-center.png"
      ],
      detectionSource: "live_consent_audit_report",
      requestUrls: [
        "https://tr.snapchat.com/p",
        "https://bat.bing.com/actionp/0",
        "https://us.shein.com/bff-api/user-api/privacy-banner-api/query_user_latest_cookie",
        "https://us.shein.com/bff-api/abt/merge/get_abt_by_poskey",
        "https://us.shein.com/devices/v3/profile/web",
        "https://us.shein.com/risk/verify/identity/validation/publish/sign/rule",
        "https://www.googletagmanager.com/gtag/js",
        "https://dynamic.criteo.com/js/ld/ld.js"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "AppNexus / Xandr",
        "Criteo",
        "DoubleClick",
        "Google Analytics",
        "Google Tag Manager",
        "Meta / Facebook",
        "Pinterest",
        "Snap"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-shein-com-F003-2026-03-26t03-48-38-600z",
    notes: "Report-level live audit finding: After an explicit reject-path interaction, likely non-essential requests or identifiers still appeared during the post-choice or refreshed session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T03-48-38.600Z/temu-com/reject_all/banner.png"
      ],
      detectionSource: "live_consent_audit_report",
      requestUrls: [
        "https://www.temu.com/login.html",
        "https://static.kwcdn.com/m-assets/assets/modernjs/biz_layout_anti_fraud_popup_b46a00bccd57d4a6ab99.js",
        "https://www.temu.com/api/static/config/get_front_end_page_config",
        "https://connect.facebook.net/en_US/sdk.js",
        "https://connect.facebook.net/en_US/bundle/sdk.js/",
        "https://pftka-us.temu.com/pmm/api/pmm/front_err"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "Meta / Facebook"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-temu-com-F003-2026-03-26t03-48-38-600z",
    notes: "Report-level live audit finding: After an explicit reject-path interaction, likely non-essential requests or identifiers still appeared during the post-choice or refreshed session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T03-48-38.600Z/tiktok-com/reject_all/banner.png"
      ],
      detectionSource: "live_consent_audit_report",
      requestUrls: [
        "https://lf16-tiktok-web.tiktokcdn-us.com/obj/tiktok-web-tx/tiktok_privacy_protection_framework/loader/2.0.0.302/index.js",
        "https://lf16-cdn-tos.tiktokcdn-us.com/obj/static-tx/tiktok-infra/csp/sdk-pre/slardar.web.pre.js",
        "https://lf16-tiktok-web.tiktokcdn-us.com/obj/tiktok-web-tx/tiktok_privacy_protection_framework/loader/2.0.0.302/core.js",
        "https://p16-common-sign.tiktokcdn-us.com/tos-no1a-p-0037-no/oE6IYKhMIDcIIvIDeQUGeLCjFdALAYFA5mUTIe~tplv-tiktokx-origin.image",
        "https://lf16-tiktok-web.tiktokcdn-us.com/obj/tiktok-web-tx/tiktok_privacy_protection_framework/loader/2.0.0.302/devtools.js",
        "https://lf16-tiktok-web.tiktokcdn-us.com/obj/tiktok-web-tx/tiktok/webapp/main/react-v18/webapp-desktop/static/js/async/video-player.7470febe.js",
        "https://www.tiktok.com/tiktok/ppf/api/eligibility/v2",
        "https://www.tiktok.com/tiktok/v1/csp/pa_prompt"
      ],
      sequenceEvidence: true,
      vendorCategories: [
        "analytics",
        "advertising_marketing"
      ],
      vendors: [
        "DoubleClick",
        "Meta / Facebook"
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "live-report-tiktok-com-F003-2026-03-26t03-48-38-600z",
    notes: "Report-level live audit finding: After an explicit reject-path interaction, likely non-essential requests or identifiers still appeared during the post-choice or refreshed session.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  }
];
