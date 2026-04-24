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
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-50-39.134Z/betterment-com/accept_all/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-50-39.134Z/betterment-com/accept_all/first-load.png"
      ],
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      uiFacts: [
        "banner_present",
        "accept_action_observed",
        "reject_action_observed",
        "manage_action_observed",
        "balanced_accept_reject_actions"
      ],
      visualFacts: [
        "Your PrivacyBetterment uses cookies and similar technologies as described in our privacy policy. You can manage your cookie settings at any time.Accept AllOpen preferencesReject All"
      ]
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "dark_pattern_consent",
    findingId: "accept_more_prominent_than_reject",
    id: "live-dark-pattern-negative-betterment-com-accept_all-2026-03-26t19-50-39-134z",
    negativeControlReason: "Verified first-layer accept and reject actions were both visible/actionable; no dark-pattern control asymmetry should surface.",
    notes: "Live consent audit observed a balanced first-layer consent control set. Review screenshot before promotion as a dark-pattern negative control.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-50-39.134Z/betterment-com/fresh_visit/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-50-39.134Z/betterment-com/fresh_visit/first-load.png"
      ],
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      uiFacts: [
        "banner_present",
        "accept_action_observed",
        "reject_action_observed",
        "manage_action_observed",
        "balanced_accept_reject_actions"
      ],
      visualFacts: [
        "Your PrivacyBetterment uses cookies and similar technologies as described in our privacy policy. You can manage your cookie settings at any time.Accept AllOpen preferencesReject All"
      ]
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "dark_pattern_consent",
    findingId: "accept_more_prominent_than_reject",
    id: "live-dark-pattern-negative-betterment-com-fresh_visit-2026-03-26t19-50-39-134z",
    negativeControlReason: "Verified first-layer accept and reject actions were both visible/actionable; no dark-pattern control asymmetry should surface.",
    notes: "Live consent audit observed a balanced first-layer consent control set. Review screenshot before promotion as a dark-pattern negative control.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-50-39.134Z/betterment-com/reject_all/banner.png",
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-50-39.134Z/betterment-com/reject_all/first-load.png"
      ],
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      uiFacts: [
        "banner_present",
        "accept_action_observed",
        "reject_action_observed",
        "manage_action_observed",
        "balanced_accept_reject_actions"
      ],
      visualFacts: [
        "Your PrivacyBetterment uses cookies and similar technologies as described in our privacy policy. You can manage your cookie settings at any time.Accept AllOpen preferencesReject All"
      ]
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "dark_pattern_consent",
    findingId: "accept_more_prominent_than_reject",
    id: "live-dark-pattern-negative-betterment-com-reject_all-2026-03-26t19-50-39-134z",
    negativeControlReason: "Verified first-layer accept and reject actions were both visible/actionable; no dark-pattern control asymmetry should surface.",
    notes: "Live consent audit observed a balanced first-layer consent control set. Review screenshot before promotion as a dark-pattern negative control.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level dark-pattern evidence needs raw screenshot and action-control review before surfacing.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-04-18T06-31-31.445Z/certscore-ai/fresh_visit/banner.png"
      ],
      consentActionableChoiceObserved: false,
      consentSurfaceObserved: true,
      uiFacts: [
        "reject_path_less_direct"
      ],
      visualFacts: [
        "Surface website evidence across privacy, consent, accessibility, and disclosures .Automated scanning for pre-consent tracking, consent flow failures, third-party data collection, disclosure gaps, accessibility signals, and policy-to-behavior contradictions. Built for teams that need reviewable evidence, not checklists.Scan a websiteSee sample findingsNo legal advice. No certification. Findings reflect automated analysis of public website signals and should be reviewed in context.Scan a homepageStart with a lightweight homepage scan that previews the kinds of findings and observable signals CertScore can surface before signup.",
        "No interaction wait completed for 12000 ms."
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "dark_pattern_consent",
    findingId: "reject_button_missing",
    id: "live-report-certscore-ai-F002-2026-04-18t06-31-31-445z",
    notes: "Report-level live audit finding: A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Report-level dark-pattern evidence needs raw screenshot and action-control review before surfacing.",
    evidence: {
      artifactRefs: [
        "/Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T03-48-38.600Z/amazon-com/fresh_visit/banner.png"
      ],
      consentActionableChoiceObserved: false,
      consentSurfaceObserved: true,
      uiFacts: [
        "reject_path_less_direct"
      ],
      visualFacts: [
        "{\AUI_72554\:\"C\",\AUI_TEMPLATE_WEBLAB_CACHE_333406\:\"C\",\BW_AUI_CXC_ALERT_MEASUREMENT_1074111\:\"C\"}typeof uex === 'function' && uex('ld', 'portal-bb', {wb: 1}) !function(){function n(n,t){var r=i(n);return t&&(r=r(\"instance\",t)),r}var r=[],c=0,i=function(t){return function(){var n=c++;return r.push([t,[].slice.call(arguments,0),n,{time:Date.now()}]),i(n)}};n._s=r,this.csa=n}();; csa('Config', {}); if (window.csa) { csa(\"Config\", { 'Application': 'Retail:Prod:www.amazon.com', 'Events.Namespace': 'csa', 'ObfuscatedMarketplaceId': 'ATVPDKIKX0DER', 'Events.SushiEndpoint': 'https://unagi.amazon.com/1/events/com.amazon.csm.csa.prod', 'Events.SushiCsaVIP': 'unagi.amazon.com', 'Events.SushiCsaSourceGroup': 'com.amazon.csm.csa.prod', 'Events.SushiCsaCustomSourceGroup': 'com.amazon.csm.customsg.prod', 'Events.SushiEndpointPattern': 'https://%s/1/events/%s', 'CacheDetection.RequestID': \"E0HR0705V72M3PCJGEZK\", 'CacheDetection.Callback': window.ue && ue.reset, 'Transport.nonBatchSchema': \"csa.UEData.3\", 'LCP.elementDedup': 1, 'actorType': '-1', 'lob': '1' }); csa(\"Events\")(\"setEntity\", { page: {requestId: \"E0HR0705V72M3PCJGEZK\", meaningful: \"interactive\"}, session: {id: \"131-4344547-1051959\"} }); } !function(r){var e,i,o=\"splice\",u=r.csa,f={},c={},a=r.csa._s,l=0,s=0,g=-1,h={},d={},v={},n=Object.keys,p=function(){};function t(n,t){return u(n,t)}function b(n,t){var r=c[n]||{};k(r,t),c[n]=r,s++,D(O,0)}function m(n,t,r){var i=!0;return t=S(t),r&&r.buffered&&(i=(v[n]||[]).every(function(n){return!1!==t(n)})),i?(h[n]||(h[n]=[]),h[n].push(t),function(){!function(n,t){var r=h[n];r&&r[o](r.indexOf(t),1)}(n,t)}):p}function w(n,t){if(t=S(t),n in d)return t(d[n]),p;return m(n,function(n){return t(n),!1})}function y(n,t){if(u(\"Errors\")(\"logError\",n),f.DEBUG)throw t||n}function E(){return Math.abs(4294967295*Math.random()|0).toString(36)}function S(n,t){return function(){try{return n.apply(this,arguments)}catch(n){y(n.message||n,n)}}}function D(n,t){return r.setTimeout(S(n),t)}function O(){for(var n=0;n<a.length;){var t=a[n],r=t[0]in c;if(!r&&!i)return void(l=a.length);r?(a[o](l=n,1),U(t)):n++}g=s}function U(n){var t=c[n[0]],r=n[1],i=r[0];if(!t||!t[i])return y(\"Undefined function: \"+t+\"/\"+i);e=n[3],c[n[2]]=t[i].apply(t,r.slice(1))||{},e=0}function I(){i=1,O()}function k(t,r){n(r).forEach(function(n){t[n]=r[n]})}w(\"$beforeunload\",I),b(\"Config\",{instance:function(n){k(f,n)}}),u.plugin=S(function(n){n(t)}),t.config=f,t.register=b,t.on=m,t.once=w,t.blank=p,t.emit=function(n,t,r){for(var i=h[n]||[],e=0;e<i.length;)!1===i[e](t)?i[o](e,1):e++;d[n]=t||{},r&&r.buffered&&(v[n]||(v[n]=[]),100<=v[n].length&&v[n].shift(),v[n].push(t||{}))},t.UUID=function(){return[E(),E(),E(),E()].join(\"-\")},t.time=function(n){var t=e?new Date(e.time):new Date;return\"ISO\"===n?t.toISOString():t.getTime()},t.error=y,t.warn=function(n,t){if(u(\"Errors\")(\"logWarn\",n),f.DEBUG)throw t||n},t.exec=S,t.timeout=D,t.interval=function(n,t){return r.setInterval(S(n),t)},(t.global=r).csa._s.push=function(n){n[0]in c&&(!a.length||i)?(U(n),a.length&&g!==s&&O()):a[o](l++,0,n)},O(),f[\"StubCalls.Cleanup.Onload\"]&&w(\"$load\",I),D(function(){D(I,f.SkipMissingPluginsTimeout||5e3)},1)}(\"undefined\"!=typeof window?window:global);csa.plugin(function(o){var f=\"addEventListener\",e=\"requestAnimationFrame\",t=o.exec,r=o.global,u=o.on;o.raf=function(n){if(r[e])return r[e](t(n))},o.on=function(n,e,t,r){if(n&&\"function\"==typeof n[f]){var i=o.exec(t);return n[f](e,i,r),function(){n.removeEventListener(e,i,r)}}return\"string\"==typeof n?u(n,e,t,r):o.blank}});csa.plugin(function(o){var t,n,r={},e=\"localStorage\",c=\"sessionStorage\",a=\"local\",i=\"session\",u=o.exec;function s(e,t){var n;try{r[t]=!!(n=o.global[e]),n=n||{}}catch(e){r[t]=!(n={})}return n}function f(){t=t||s(e,a),n=n||s(c,i)}function l(e){return e&&e[i]?n:t}o.store=u(function(e,t,n){f();var o=l(n);return e?t?void(o[e]=t):o[e]:Object.keys(o)}),o.storageSupport=u(function(){return f(),r}),o.deleteStored=u(function(e,t){f();var n=l(t);if(\"function\"==typeof e)for(var o",
        "No interaction wait completed for 12000 ms."
      ]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "dark_pattern_consent",
    findingId: "reject_button_missing",
    id: "live-report-amazon-com-F002-2026-03-26t03-48-38-600z",
    notes: "Report-level live audit finding: A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      signalKey: "accessibility.accessibility_support_path_missing",
      snapshotEvidence: {
        accessibility_contact_method_present: false,
        accessibility_statement_present: false,
        verified_public_surfaces_count: 2
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found Discover's public accessibility page and feedback path, so the missing accessibility support-path interpretation is a false positive.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://www.discover.com/accessibility/?ICMPGN=PUB_FTR_ACCESSIBILITY"
      }
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "accessibility_support_path_missing",
    id: "live-demotion-accessibility-discover-com-2026-04-24",
    negativeControlReason: "Public accessibility support path exists despite retained snapshot absence booleans.",
    notes: "Live production demotion audit found a reachable accessibility surface and feedback path outside CertScore's retained signal evidence.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      signalKey: "accessibility.accessibility_support_path_missing",
      snapshotEvidence: {
        accessibility_contact_method_present: false,
        accessibility_statement_present: false,
        verified_public_surfaces_count: 2
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found Ally's accessibility page and accessibility feedback form, so the missing support-path interpretation should not promote.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://www.ally.com/accessibility/"
      }
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "accessibility_support_path_missing",
    id: "live-demotion-accessibility-ally-com-2026-04-24",
    negativeControlReason: "Public accessibility support path exists despite retained snapshot absence booleans.",
    notes: "Live production demotion audit found a reachable accessibility surface and support path outside CertScore's retained signal evidence.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      signalKey: "accessibility.accessibility_support_path_missing",
      snapshotEvidence: {
        accessibility_contact_method_present: false,
        accessibility_statement_present: false,
        verified_public_surfaces_count: 2
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found BlackRock's public accessibility page, so the missing accessibility support-path interpretation is not externally promotable.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://www.blackrock.com/corporate/accessibility"
      }
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "accessibility_support_path_missing",
    id: "live-demotion-accessibility-blackrock-com-2026-04-24",
    negativeControlReason: "Public accessibility surface exists despite retained snapshot absence booleans.",
    notes: "Live production demotion audit found a reachable accessibility surface outside CertScore's retained signal evidence.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      signalKey: "privacy.sale_sharing_controls_missing",
      snapshotEvidence: {
        do_not_sell_link_present: false,
        retargeting_pixel_detected: true
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found Discover's privacy statement with privacy-choice/control language, so a missing sale/sharing control should not promote.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://www.discover.com/privacy-statement/?ICMPGN=PUB_FTR_QL_PRIVACY"
      }
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "sale_sharing_controls_missing",
    id: "live-demotion-sale-sharing-discover-com-2026-04-24",
    negativeControlReason: "A privacy-choice/control path exists despite retained do-not-sell absence and retargeting booleans.",
    notes: "Live production demotion audit found a control path outside CertScore's retained sale/sharing signal evidence.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      signalKey: "privacy.sale_sharing_controls_missing",
      snapshotEvidence: {
        do_not_sell_link_present: false,
        retargeting_pixel_detected: true
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found BlackRock's privacy notice with opt-out/control language, so the missing sale/sharing control interpretation should not promote.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://www.blackrock.com/corporate/compliance/privacy-notice"
      }
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "sale_sharing_controls_missing",
    id: "live-demotion-sale-sharing-blackrock-com-2026-04-24",
    negativeControlReason: "A privacy-choice/control path exists despite retained do-not-sell absence and retargeting booleans.",
    notes: "Live production demotion audit found a control path outside CertScore's retained sale/sharing signal evidence.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      signalKey: "privacy.sale_sharing_controls_missing",
      snapshotEvidence: {
        advertising_tracker_count: 6,
        do_not_sell_link_present: false,
        mentions_data_sale_or_sharing: false,
        retargeting_pixel_detected: true
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL probe did not corroborate sale/sharing disclosure or a missing control path; runtime retargeting alone is insufficient.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://raymondjames.com"
      }
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "sale_sharing_controls_missing",
    id: "live-demotion-sale-sharing-raymondjames-com-2026-04-24",
    negativeControlReason: "Runtime retargeting without a retained sale/sharing policy anchor is insufficient for missing-control promotion.",
    notes: "Live production demotion audit treated retargeting-only evidence as insufficient for external surfacing.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Own URL review found targeted-advertising disclosure language but did not find a control path in the bounded probe; this needs reviewer confirmation before promotion.",
    evidence: {
      policyAnchor: {
        claimType: "targeted_advertising_disclosure",
        confidence: 0.78,
        extractionStatus: "fetched",
        sourceUrl: "https://bestforex-signals.com/privacy-policy",
        snippet: "Policy language references advertising, cookies, or targeted advertising practices, but the bounded URL probe did not find a matching opt-out control."
      },
      signalKey: "privacy.sale_sharing_controls_missing",
      snapshotEvidence: {
        do_not_sell_link_present: false,
        retargeting_pixel_detected: true
      },
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL review found sale/sharing or targeted-advertising disclosure language but did not find a control path in the bounded probe.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://bestforex-signals.com/privacy-policy"
      }
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "sale_sharing_controls_missing",
    id: "live-review-sale-sharing-bestforex-signals-com-2026-04-24",
    notes: "Live production demotion audit identified a candidate that should remain review-only until policy and control-path evidence are anchored together.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Own URL review did not find a substantive privacy policy page; retain as review-only until a concrete policy URL and snippet are retained.",
    evidence: {
      signalKey: "disclosure.privacy_policy_present",
      snapshotEvidence: {
        privacy_policy_present: true
      },
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL probe did not find a substantive privacy policy page; do not promote from a thin footer or inferred policy signal alone.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://atlas-finance.org"
      }
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "privacy_policy_present",
    id: "live-review-privacy-policy-atlas-finance-org-2026-04-24",
    notes: "Live positive-surface audit found insufficient policy-page evidence for an otherwise present privacy-policy signal.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Own URL review did not find a privacy-specific contact channel; generic contact/support evidence is not enough for this positive finding.",
    evidence: {
      signalKey: "privacy.privacy_contact_path_present",
      snapshotEvidence: {
        privacy_contact_method_present: false
      },
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL probe did not find a privacy-specific contact channel; generic support/contact evidence should remain review-only.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://altsignals.io"
      }
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "privacy_contact_path_present",
    id: "live-review-privacy-contact-altsignals-io-2026-04-24",
    notes: "Live positive-surface audit found no privacy-specific contact path for a candidate positive privacy-contact finding.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Own URL review did not find a concrete privacy-rights path; generic or inferred rights signals should remain review-only.",
    evidence: {
      signalKey: "privacy.privacy_rights_path_present",
      snapshotEvidence: {
        data_access_request_present: false,
        data_deletion_request_present: false,
        privacy_request_form_present: false
      },
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL probe did not find a concrete privacy-rights path, portal, form, email, or request instruction.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://bestforex-signals.com"
      }
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "privacy_rights_path_present",
    id: "live-review-privacy-rights-bestforex-signals-com-2026-04-24",
    notes: "Live positive-surface audit found no concrete rights mechanism for a candidate privacy-rights positive finding.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  },
  {
    evidence: {
      signalKey: "financial.pricing_or_fee_transparency_unclear",
      snapshotEvidence: {
        fee_related_text_present: true,
        pricing_page_present: true
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found fee/pricing language with nearby material terms context, so pricing transparency should not promote.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://www.blackrock.com/us/individual/products/529-college-savings-plans"
      }
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "pricing_or_fee_transparency_unclear",
    id: "live-demotion-pricing-blackrock-com-2026-04-24",
    negativeControlReason: "Fee or pricing language has nearby material terms context.",
    notes: "Live positive-surface audit found enough balancing fee/terms context to demote the pricing-transparency interpretation.",
    scenarioType: "negative_control",
    sourceKind: "live_artifact"
  },
  {
    downgradeReason: "Own URL probe did not find enough pricing context to confirm or demote; keep the pricing transparency interpretation review-only.",
    evidence: {
      signalKey: "financial.pricing_or_fee_transparency_unclear",
      snapshotEvidence: {
        fee_related_text_present: true,
        pricing_page_present: true
      },
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL probe did not find enough pricing context to confirm or demote the transparency finding.",
        reviewedAt: "2026-04-24",
        reviewedUrl: "https://bestcopytrading.com/"
      }
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "production_surfaced_calibration",
    findingId: "pricing_or_fee_transparency_unclear",
    id: "live-review-pricing-bestcopytrading-com-2026-04-24",
    notes: "Live positive-surface audit found insufficient pricing-page context for external surfacing.",
    scenarioType: "borderline_review",
    sourceKind: "live_artifact"
  }
];
