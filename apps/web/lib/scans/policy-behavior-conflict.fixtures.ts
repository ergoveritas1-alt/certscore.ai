export const POLICY_BEHAVIOR_CONFLICT_FIXTURES = {
  positiveGpcNotHonored: {
    contradictionEvidence: {
      claim: "The policy states that opt-out preference signals such as GPC are honored.",
      contradictionBasis: "gpc_not_honored",
      policyAnchor: {
        claimType: "gpc_honored",
        sourceUrl: "https://www.example.com/privacy",
        snippet: "We honor opt-out preference signals, including Global Privacy Control, as requests to opt out of sale/share.",
        normalizedClaim: "The policy states that opt-out preference signals such as GPC are honored.",
        confidence: 0.92,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: "gpc_signal_not_honored",
        phase: "gpc_enabled",
        sourceUrl: "https://www.example.com/",
        vendors: ["Meta Pixel"],
        requests: ["https://www.facebook.com/tr?id=123&ev=PageView"],
        cookies: ["_fbp"],
        storageArtifacts: [],
        confidence: 0.88
      },
      conflictBridge: {
        conflictType: "declared_opt_out_honored_but_tracking_persisted_under_opt_out",
        reasoning: "The policy says GPC is honored, but tracking still persisted in a GPC-enabled session.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        policyAnchorPresent: true,
        runtimeAnchorPresent: true,
        conflictBridgePresent: true,
        promotionEligible: true,
        reviewStatus: "complete"
      },
      runtimeEvidenceArtifacts: ["Meta Pixel request observed during GPC-enabled session."],
      runtimeVendors: ["Meta Pixel"],
      supportingSignals: ["privacy.gpc_signal_not_honored"]
    }
  },
  positiveNecessaryOnlyPreconsent: {
    contradictionEvidence: {
      claim: "The policy states that only necessary cookies are used before a choice is made.",
      contradictionBasis: "marketing_preconsent",
      policyAnchor: {
        claimType: "only_necessary_cookies_before_choice",
        sourceUrl: "https://www.example.com/privacy",
        snippet: "Only strictly necessary cookies are used before you make a cookie choice.",
        normalizedClaim: "The policy states that only necessary cookies are used before a choice is made.",
        confidence: 0.9,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: "marketing_vendor_fired_pre_consent",
        phase: "pre_consent",
        sourceUrl: "https://www.example.com/",
        vendors: ["Google Ads"],
        requests: ["https://pagead2.googlesyndication.com/pagead/viewthroughconversion/123"],
        cookies: [],
        storageArtifacts: [],
        confidence: 0.89
      },
      conflictBridge: {
        conflictType: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
        reasoning: "The policy restricts pre-choice cookies to necessary ones, but a marketing vendor fired before consent.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        policyAnchorPresent: true,
        runtimeAnchorPresent: true,
        conflictBridgePresent: true,
        promotionEligible: true,
        reviewStatus: "complete"
      },
      runtimeEvidenceArtifacts: ["Google Ads request observed before any consent interaction."],
      runtimeVendors: ["Google Ads"]
    }
  },
  positiveTrackingAfterReject: {
    contradictionEvidence: {
      claim: "The policy states that tracking is disabled after reject.",
      contradictionBasis: "tracking_after_reject",
      policyAnchor: {
        claimType: "tracking_disabled_after_reject",
        sourceUrl: "https://www.example.com/privacy",
        snippet: "If you reject non-essential cookies, tracking technologies are disabled.",
        normalizedClaim: "The policy states that tracking is disabled after reject.",
        confidence: 0.9,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: "tracking_persisted_after_reject",
        phase: "after_reject",
        sourceUrl: "https://www.example.com/",
        vendors: ["Adobe Analytics"],
        requests: ["https://metrics.example-analytics.com/b/ss/example"],
        cookies: ["AMCV_123"],
        storageArtifacts: [],
        confidence: 0.86
      },
      conflictBridge: {
        conflictType: "declared_tracking_disabled_after_reject_but_tracking_persisted_after_reject",
        reasoning: "The policy says tracking stops after reject, but analytics traffic continued after reject.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        policyAnchorPresent: true,
        runtimeAnchorPresent: true,
        conflictBridgePresent: true,
        promotionEligible: true,
        reviewStatus: "complete"
      },
      runtimeEvidenceArtifacts: ["Adobe Analytics beacon observed after reject interaction."],
      runtimeVendors: ["Adobe Analytics"]
    }
  },
  negativePolicyNotFetched: {
    contradictionEvidence: {
      policyAnchor: {
        claimType: "gpc_honored",
        sourceUrl: "https://www.example.com/privacy",
        snippet: "We honor Global Privacy Control.",
        normalizedClaim: "We honor Global Privacy Control.",
        confidence: 0.8,
        extractionStatus: "discovered"
      },
      runtimeAnchor: {
        observationType: "gpc_signal_not_honored",
        phase: "gpc_enabled",
        sourceUrl: "https://www.example.com/",
        vendors: ["Meta Pixel"],
        requests: ["https://www.facebook.com/tr?id=123"],
        cookies: ["_fbp"],
        storageArtifacts: [],
        confidence: 0.8
      },
      conflictBridge: {
        conflictType: "declared_opt_out_honored_but_tracking_persisted_under_opt_out",
        reasoning: "Tracking still fired.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        policyAnchorPresent: true,
        runtimeAnchorPresent: true,
        conflictBridgePresent: true,
        promotionEligible: false,
        reviewStatus: "policy_semantic_review_incomplete"
      }
    }
  },
  negativeGenericPolicyOnly: {
    contradictionEvidence: {
      policyAnchor: {
        claimType: null,
        sourceUrl: "https://www.example.com/privacy",
        snippet: "We value your privacy.",
        normalizedClaim: "We value your privacy.",
        confidence: 0.72,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: "analytics_vendor_fired_pre_consent",
        phase: "pre_consent",
        sourceUrl: "https://www.example.com/",
        vendors: ["Google Analytics"],
        requests: ["https://www.google-analytics.com/g/collect"],
        cookies: ["_ga"],
        storageArtifacts: [],
        confidence: 0.82
      },
      conflictBridge: {
        conflictType: null,
        reasoning: "Generic privacy language does not form a contradiction.",
        supportsPromotion: false
      },
      evidenceSufficiency: {
        policyAnchorPresent: false,
        runtimeAnchorPresent: true,
        conflictBridgePresent: false,
        promotionEligible: false,
        reviewStatus: "insufficient_evidence_for_policy_behavior_conflict"
      }
    }
  },
  negativeRuntimeEmpty: {
    contradictionEvidence: {
      policyAnchor: {
        claimType: "gpc_honored",
        sourceUrl: "https://www.example.com/privacy",
        snippet: "We honor GPC signals.",
        normalizedClaim: "We honor GPC signals.",
        confidence: 0.88,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: "gpc_signal_not_honored",
        phase: "gpc_enabled",
        sourceUrl: "https://www.example.com/",
        vendors: [],
        requests: [],
        cookies: [],
        storageArtifacts: [],
        confidence: 0.84
      },
      conflictBridge: {
        conflictType: "declared_opt_out_honored_but_tracking_persisted_under_opt_out",
        reasoning: "No retained runtime artifact.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        policyAnchorPresent: true,
        runtimeAnchorPresent: false,
        conflictBridgePresent: false,
        promotionEligible: false,
        reviewStatus: "runtime_tracking_review_incomplete"
      }
    }
  },
  negativeNoMapping: {
    contradictionEvidence: {
      policyAnchor: {
        claimType: "gpc_honored",
        sourceUrl: "https://www.example.com/privacy",
        snippet: "We honor GPC signals.",
        normalizedClaim: "We honor GPC signals.",
        confidence: 0.88,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: "marketing_vendor_fired_pre_consent",
        phase: "pre_consent",
        sourceUrl: "https://www.example.com/",
        vendors: ["Google Ads"],
        requests: ["https://pagead2.googlesyndication.com/pagead/viewthroughconversion/123"],
        cookies: [],
        storageArtifacts: [],
        confidence: 0.84
      },
      conflictBridge: {
        conflictType: null,
        reasoning: "The observed behavior does not map to the policy claim family.",
        supportsPromotion: false
      },
      evidenceSufficiency: {
        policyAnchorPresent: true,
        runtimeAnchorPresent: true,
        conflictBridgePresent: false,
        promotionEligible: false,
        reviewStatus: "possible_policy_runtime_mismatch"
      }
    }
  },
  negativeGeneralCookiesNoContradiction: {
    contradictionEvidence: {
      policyAnchor: {
        claimType: null,
        sourceUrl: "https://www.example.com/privacy",
        snippet: "We use cookies and analytics tools to improve our website.",
        normalizedClaim: "We use cookies and analytics tools to improve our website.",
        confidence: 0.86,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: null,
        phase: "unknown",
        sourceUrl: "https://www.example.com/",
        vendors: ["Google Analytics"],
        requests: ["https://www.google-analytics.com/g/collect"],
        cookies: ["_ga"],
        storageArtifacts: [],
        confidence: 0.8
      },
      conflictBridge: {
        conflictType: null,
        reasoning: "General cookie disclosure plus general analytics behavior is not a contradiction.",
        supportsPromotion: false
      },
      evidenceSufficiency: {
        policyAnchorPresent: false,
        runtimeAnchorPresent: false,
        conflictBridgePresent: false,
        promotionEligible: false,
        reviewStatus: "insufficient_evidence_for_policy_behavior_conflict"
      }
    }
  },
  negativeSchwabLike: {
    contradictionEvidence: {
      claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      contradictionBasis: "possible_cookie_tracking_mismatch",
      policyAnchor: {
        claimType: null,
        sourceUrl: "https://www.schwab.com/legal/privacy",
        snippet:
          "Our privacy notice discusses analytical cookies, marketing cookies, browser-based opt-out signals, and honoring opt-out preference signals such as GPC.",
        normalizedClaim:
          "The policy discusses analytical cookies, marketing cookies, opt-out signals, and honoring GPC.",
        confidence: 0.83,
        extractionStatus: "fetched"
      },
      runtimeAnchor: {
        observationType: null,
        phase: "unknown",
        sourceUrl: "https://www.schwab.com/",
        vendors: [],
        requests: [],
        cookies: [],
        storageArtifacts: [],
        confidence: 0.41
      },
      conflictBridge: {
        conflictType: null,
        reasoning: "Insufficient policy content fetched for semantic review.",
        supportsPromotion: false
      },
      evidenceSufficiency: {
        policyAnchorPresent: false,
        runtimeAnchorPresent: false,
        conflictBridgePresent: false,
        promotionEligible: false,
        reviewStatus: "insufficient_evidence_for_policy_behavior_conflict"
      },
      policySummaryShort:
        "The privacy notice describes cookies, tracking technologies, opt-out preference signals, and honoring GPC.",
      runtimeEvidenceArtifacts: [],
      runtimeVendors: [],
      relatedVendors: [],
      supportingSignals: ["policy_behavior_conflict_candidate"]
    },
    claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
    policySummaryShort:
      "The privacy notice describes cookies, tracking technologies, opt-out preference signals, and honoring GPC."
  }
} as const;
