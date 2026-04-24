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
  }
];
