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
  }
];
