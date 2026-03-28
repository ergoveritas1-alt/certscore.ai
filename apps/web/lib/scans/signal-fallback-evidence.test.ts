import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccessibilitySupportFallbackEvidence,
  buildCookiePolicyFallbackEvidence,
  buildSnapshotDisclosureFallbackEvidence,
  buildChildContextFallbackEvidence,
  isChildContextSignalKey
} from "./signal-fallback-evidence";

test("recognizes child-context signal keys including privacy disclosure contradiction key", () => {
  assert.equal(
    isChildContextSignalKey("privacy.children_privacy_context_without_supporting_disclosure"),
    true
  );
  assert.equal(isChildContextSignalKey("context.kid_directed_content_detected"), true);
  assert.equal(isChildContextSignalKey("privacy.preconsent_tracking_detected"), false);
});

test("builds child-context fallback evidence with disclosure support fields", () => {
  const evidence = buildChildContextFallbackEvidence({
    signalKey: "privacy.children_privacy_context_without_supporting_disclosure",
    signalLabel: "Child-directed context without supporting privacy disclosure",
    signalValue: true,
    snapshot: {
      children_audience_likely: true,
      kid_directed_content_detected: true,
      privacy_policy_present: false,
      privacy_contact_channel_type: "none",
      form_collects_birthdate: false,
      mentions_coppa: false
    }
  });

  assert.equal(evidence.childrenAudienceLikely, true);
  assert.equal(evidence.kidDirectedContentDetected, true);
  assert.equal(evidence.privacyPolicyPresent, false);
  assert.equal(evidence.privacyContactChannelType, "none");
  assert.equal(evidence.signalKey, "privacy.children_privacy_context_without_supporting_disclosure");
});

test("builds snapshot disclosure fallback evidence with retained legal coverage and discovery context", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/privacy"],
          bestDiscoverySource: "footer_link",
          pageType: "privacy_policy",
          stopReason: "resolved",
          successfulUrl: "https://www.example.com/privacy"
        },
        {
          attemptedUrls: ["https://www.example.com/terms"],
          bestDiscoverySource: "legal_hub",
          pageType: "terms_of_service",
          stopReason: "resolved",
          successfulUrl: "https://www.example.com/terms"
        },
        {
          attemptedUrls: ["https://www.example.com/contact"],
          bestDiscoverySource: "body_link",
          pageType: "contact",
          stopReason: "resolved",
          successfulUrl: "https://www.example.com/contact"
        }
      ]
    },
    signalKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
    signalLabel: "Bounded key-page discovery unresolved",
    signalValue: true,
    snapshot: {
      affiliate_disclosure_present: true,
      contact_page_present: true,
      privacy_policy_present: true,
      terms_of_service_present: true
    }
  });

  assert.equal(evidence.privacyPolicyPresent, true);
  assert.equal(evidence.termsOfServicePresent, true);
  assert.equal(evidence.contactPagePresent, true);
  assert.equal(evidence.affiliateDisclosurePresent, true);
  assert.equal(evidence.fetchQuality, "thin_content");
  assert.equal(evidence.keyPageDiscoverySource, "footer_link");
  assert.deepEqual(evidence.pageUrls, [
    "https://www.example.com/privacy",
    "https://www.example.com/terms",
    "https://www.example.com/contact"
  ]);
});

test("prefers human-facing urls over machine policy endpoints for bounded discovery evidence", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/privacy"],
          bestDiscoverySource: "footer_link",
          pageType: "privacy_policy",
          stopReason: "resolved",
          successfulUrl: "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
        },
        {
          attemptedUrls: ["https://www.example.com/terms"],
          bestDiscoverySource: "footer_link",
          pageType: "terms_of_service",
          stopReason: "resolved",
          successfulUrl: "https://www.example.com/terms"
        }
      ]
    },
    signalKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
    signalLabel: "Bounded key-page discovery unresolved",
    signalValue: true,
    snapshot: {
      privacy_policy_present: true,
      terms_of_service_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, [
    "https://www.example.com/terms",
    "https://www.example.com/privacy"
  ]);
  assert.deepEqual(evidence.sourceUrls, [
    "https://www.example.com/terms",
    "https://www.example.com/privacy",
    "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
  ]);
});

test("drops weak root placeholder evidence for cookie policy present", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.cnn.com/#"],
          bestDiscoverySource: "footer_link",
          pageType: "cookie_policy",
          stopReason: "resolved",
          successfulPageTitle: "Breaking News, Latest News and Videos | CNN",
          successfulUrl: "https://www.cnn.com/"
        }
      ]
    },
    signalKey: "disclosure.cookie_policy_present",
    signalLabel: "Cookie policy fetched",
    signalValue: true,
    snapshot: {}
  });

  assert.deepEqual(evidence.pageUrls, []);
  assert.deepEqual(evidence.sourceUrls, []);
  assert.deepEqual(evidence.policySnippets, []);
  assert.equal(evidence.fetchQuality, "unreachable");
});

test("uses linked best-candidate urls for terms surfaces when no fetch succeeded", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: [],
          bestCandidateAnchorText: "Terms of Use",
          bestCandidateUrl: "https://www.cnn.com/terms",
          bestDiscoverySource: "same_brand_subdomain",
          pageType: "terms_of_service",
          stopReason: "budget_exhausted",
          successfulUrl: null
        }
      ]
    },
    signalKey: "disclosure.terms_of_service_present",
    signalLabel: "Terms page fetched",
    signalValue: true,
    snapshot: {
      terms_of_service_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.cnn.com/terms"]);
  assert.deepEqual(evidence.policySnippets, ["Terms of Use"]);
});

test("prefers explicit fetch quality from key-page summaries when provided upstream", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/contact"],
          bestDiscoverySource: "footer_link",
          fetchQuality: "blocked_interstitial",
          pageType: "contact",
          stopReason: "resolved",
          successfulPageTitle: "Contact Us | Example",
          successfulUrl: "https://www.example.com/contact"
        }
      ]
    },
    signalKey: "disclosure.contact_page_present",
    signalLabel: "Contact page fetched",
    signalValue: true,
    snapshot: {
      contact_page_present: true
    }
  });

  assert.equal(evidence.fetchQuality, "blocked_interstitial");
});

test("keeps canonical root-domain terms urls from companion signals when retained policy evidence is locale-only", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://arabic.example.com/terms"],
          bestCandidateAnchorText: "Terms of Use",
          bestCandidateUrl: "https://arabic.example.com/terms",
          bestDiscoverySource: "same_brand_subdomain",
          pageType: "terms_of_service",
          stopReason: "resolved",
          successfulPageTitle: "شروط وأحكام الاستخدام",
          successfulUrl: "https://arabic.example.com/terms"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "terms_of_service",
        page_url: "https://arabic.example.com/terms",
        policy_summary_short: "شروط وأحكام الاستخدام"
      }
    ],
    relatedSignals: [
      {
        key: "disclosure.terms_of_service_extraction_limited",
        value: "https://www.example.com/terms"
      }
    ],
    signalKey: "disclosure.terms_of_service_present",
    signalLabel: "Terms page fetched",
    signalValue: true,
    snapshot: {
      terms_of_service_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, [
    "https://www.example.com/terms",
    "https://arabic.example.com/terms"
  ]);
  assert.deepEqual(evidence.sourceUrls, [
    "https://www.example.com/terms",
    "https://arabic.example.com/terms"
  ]);
  assert.deepEqual(evidence.policySnippets, ["Terms of Use"]);
});

test("prefers human-facing privacy policy urls over machine endpoints for privacy policy present", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/privacy"],
          bestDiscoverySource: "footer_link",
          pageType: "privacy_policy",
          stopReason: "resolved",
          successfulUrl: "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
        }
      ]
    },
    signalKey: "disclosure.privacy_policy_present",
    signalLabel: "Privacy policy fetched",
    signalValue: true,
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/privacy"]);
  assert.deepEqual(evidence.sourceUrls, [
    "https://www.example.com/privacy",
    "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
  ]);
});

test("builds targeted-advertising choices fallback evidence from retained privacy surfaces", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/privacy-choices"],
          bestDiscoverySource: "footer_link",
          pageType: "privacy_policy",
          stopReason: "resolved",
          successfulPageTitle: "Your Privacy Choices | Example",
          successfulUrl: "https://www.example.com/privacy-choices"
        }
      ]
    },
    signalKey: "privacy.do_not_sell_link_present",
    signalLabel: "Do-not-sell link present",
    signalValue: true,
    snapshot: {
      do_not_sell_link_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/privacy-choices"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/privacy-choices"]);
  assert.deepEqual(evidence.policySnippets, ["Your Privacy Choices | Example"]);
});

test("drops homepage and root placeholder evidence for targeted-advertising choices when a specific privacy path exists", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/privacy", "https://www.example.com/#"],
          bestCandidateAnchorText: "Your Privacy Choices",
          bestDiscoverySource: "footer_link",
          pageType: "privacy_policy",
          stopReason: "resolved",
          successfulPageTitle: "Privacy Policy",
          successfulUrl: "https://www.example.com/privacy"
        },
        {
          attemptedUrls: ["https://www.example.com/#"],
          bestDiscoverySource: "footer_link",
          pageType: "cookie_policy",
          stopReason: "resolved",
          successfulPageTitle: "Breaking News, Latest News and Videos | Example",
          successfulUrl: "https://www.example.com/"
        }
      ]
    },
    signalKey: "privacy.do_not_sell_link_present",
    signalLabel: "Do-not-sell link present",
    signalValue: true,
    snapshot: {
      do_not_sell_link_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/privacy"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/privacy"]);
  assert.deepEqual(evidence.policySnippets, ["Your Privacy Choices"]);
});

test("builds affiliate disclosure fallback evidence from affiliate page summaries only", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/privacy"],
          bestDiscoverySource: "footer_link",
          pageType: "privacy_policy",
          stopReason: "resolved",
          successfulUrl: "https://www.example.com/privacy"
        },
        {
          attemptedUrls: ["https://www.example.com/affiliate-disclosure"],
          bestDiscoverySource: "footer_link",
          pageType: "affiliate_disclosure",
          stopReason: "resolved",
          successfulUrl: "https://www.example.com/affiliate-disclosure"
        }
      ]
    },
    signalKey: "commerce.affiliate_disclosure_present",
    signalLabel: "Affiliate disclosure present",
    signalValue: true,
    snapshot: {
      affiliate_disclosure_present: true
    }
  });

  assert.equal(evidence.keyPageAttemptCount, 1);
  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/affiliate-disclosure"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/affiliate-disclosure"]);
  assert.deepEqual(evidence.policySnippets, []);
});

test("prefers retained affiliate page evidence over privacy-policy fallback when both exist", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/affiliate-disclosure"],
          bestDiscoverySource: "footer_link",
          pageType: "affiliate_disclosure",
          stopReason: "covered",
          successfulPageTitle: "Affiliate Disclosure | Example",
          successfulUrl: "https://www.example.com/affiliate-disclosure"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy-policy",
        policy_summary_short:
          "Affiliate Disclosure | Example This site may earn a commission from qualifying links and recommendations."
      }
    ],
    signalKey: "commerce.affiliate_disclosure_present",
    signalLabel: "Affiliate disclosure present",
    signalValue: true,
    snapshot: {
      affiliate_disclosure_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/affiliate-disclosure"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/affiliate-disclosure"]);
  assert.deepEqual(evidence.policySnippets, [
    "Affiliate Disclosure | Example",
    "Affiliate Disclosure | Example This site may earn a commission from qualifying links and recommendations."
  ]);
});

test("prefers user-facing affiliate urls over machine policy endpoints when both are retained", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/affiliates"],
          bestDiscoverySource: "footer_link",
          pageType: "affiliate_disclosure",
          stopReason: "resolved",
          successfulPageTitle: "Affiliate Disclosure | Example",
          successfulUrl: "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
        }
      ]
    },
    signalKey: "commerce.affiliate_disclosure_present",
    signalLabel: "Affiliate disclosure present",
    signalValue: true,
    snapshot: {
      affiliate_disclosure_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/affiliates"]);
  assert.deepEqual(evidence.sourceUrls, [
    "https://www.example.com/affiliates",
    "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
  ]);
});

test("falls back to retained policy enrichment evidence for affiliate disclosure when no affiliate page summary exists", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/privacy-policy"],
          bestDiscoverySource: "footer_link",
          pageType: "privacy_policy",
          stopReason: "covered",
          successfulPageTitle: "Affiliate Disclosure | Example",
          successfulUrl: "https://www.example.com/privacy-policy"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy-policy",
        policy_summary_short:
          "Affiliate Disclosure | Example This site may earn a commission from qualifying links and recommendations."
      }
    ],
    signalKey: "commerce.affiliate_disclosure_present",
    signalLabel: "Affiliate disclosure present",
    signalValue: true,
    snapshot: {
      affiliate_disclosure_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/privacy-policy"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/privacy-policy"]);
  assert.deepEqual(evidence.policySnippets, [
    "Affiliate Disclosure | Example This site may earn a commission from qualifying links and recommendations."
  ]);
});

test("keeps retained affiliate summary text when the affiliate page path resolves through a machine endpoint", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/affiliates"],
          bestDiscoverySource: "footer_link",
          pageType: "affiliate_disclosure",
          stopReason: "resolved",
          successfulUrl: "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "affiliate_disclosure",
        page_url: "https://www.example.com/affiliates",
        policy_summary_short:
          "We may earn a commission from purchases made through links on this page."
      }
    ],
    signalKey: "commerce.affiliate_disclosure_present",
    signalLabel: "Affiliate disclosure present",
    signalValue: true,
    snapshot: {
      affiliate_disclosure_present: true
    }
  });

  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/affiliates"]);
  assert.deepEqual(evidence.sourceUrls, [
    "https://www.example.com/affiliates",
    "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
  ]);
  assert.deepEqual(evidence.policySnippets, [
    "We may earn a commission from purchases made through links on this page."
  ]);
});

test("builds accessibility support fallback evidence from retained support page discovery", () => {
  const evidence = buildAccessibilitySupportFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/accessibility"],
          bestDiscoverySource: "footer_link",
          pageType: "accessibility_statement",
          stopReason: "resolved",
          successfulPageTitle: "Accessibility Help | Example",
          successfulUrl: "https://www.example.com/accessibility"
        },
        {
          attemptedUrls: ["https://www.example.com/contact"],
          bestDiscoverySource: "body_link",
          pageType: "contact",
          stopReason: "resolved",
          successfulPageTitle: "Contact Us | Example",
          successfulUrl: "https://www.example.com/contact"
        }
      ]
    },
    signalKey: "accessibility.accessibility_contact_method_present",
    signalLabel: "Accessibility contact method detected",
    signalValue: true,
    snapshot: {
      accessibility_contact_method_present: true
    }
  });

  assert.equal(evidence.accessibilityContactMethodPresent, true);
  assert.equal(evidence.fetchQuality, "verified_content");
  assert.equal(evidence.keyPageAttemptCount, 2);
  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/accessibility"]);
  assert.deepEqual(evidence.policySnippets, ["Accessibility Help | Example"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/accessibility"]);
});

test("builds cookie policy obstruction fallback evidence from cookie-policy enrichment and discovery rows", () => {
  const evidence = buildCookiePolicyFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/cookies"],
          bestDiscoverySource: "footer_link",
          pageType: "cookie_policy",
          stopReason: "resolved",
          successfulUrl: "https://www.example.com/cookies"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "cookie_policy",
        page_url: "https://www.example.com/cookies",
        policy_summary_short:
          "Cookie Notice | Example Learn more about the cookies, vendors, and retention periods used across the site."
      }
    ],
    signalKey: "disclosure.cookie_policy_structurally_obstructed",
    signalLabel: "Cookie policy structurally obstructed",
    signalValue: true
  });

  assert.equal(evidence.keyPageAttemptCount, 1);
  assert.equal(evidence.fetchQuality, "verified_content");
  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/cookies"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/cookies"]);
  assert.deepEqual(evidence.policySnippets, [
    "Cookie Notice | Example Learn more about the cookies, vendors, and retention periods used across the site."
  ]);
});

test("prefers retained cookie-policy rows over weak homepage-style cookie targets", () => {
  const evidence = buildCookiePolicyFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/#"],
          bestDiscoverySource: "footer_link",
          pageType: "cookie_policy",
          stopReason: "resolved",
          successfulPageTitle: "Example Homepage",
          successfulUrl: "https://www.example.com/"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "cookie_policy",
        page_url: "https://privacy.example.com/cookie-notice",
        policy_summary_short: "Cookie Notice | Example Structured cookie disclosure is available on the privacy center."
      }
    ],
    signalKey: "disclosure.cookie_policy_structurally_obstructed",
    signalLabel: "Cookie policy structurally obstructed",
    signalValue: true
  });

  assert.deepEqual(evidence.pageUrls, ["https://privacy.example.com/cookie-notice"]);
  assert.deepEqual(evidence.sourceUrls, ["https://privacy.example.com/cookie-notice"]);
  assert.deepEqual(evidence.policySnippets, [
    "Cookie Notice | Example Structured cookie disclosure is available on the privacy center."
  ]);
});

test("drops weak homepage cookie placeholders when no better cookie policy row is retained", () => {
  const evidence = buildCookiePolicyFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/#"],
          bestDiscoverySource: "footer_link",
          pageType: "cookie_policy",
          stopReason: "resolved",
          successfulPageTitle: "Example Homepage",
          successfulUrl: "https://www.example.com/"
        }
      ]
    },
    signalKey: "disclosure.cookie_policy_structurally_obstructed",
    signalLabel: "Cookie policy structurally obstructed",
    signalValue: true
  });

  assert.deepEqual(evidence.pageUrls, []);
  assert.deepEqual(evidence.sourceUrls, []);
  assert.deepEqual(evidence.policySnippets, []);
  assert.equal(evidence.keyPageAttemptCount, 1);
  assert.equal(evidence.fetchQuality, "unreachable");
});

test("reanchors cookie fallback evidence to a fetchable privacy notice when the cookie url is blocked", () => {
  const evidence = buildCookiePolicyFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/legal/cookies"],
          bestDiscoverySource: "footer_link",
          fetchQuality: "blocked_interstitial",
          pageType: "cookie_policy",
          stopReason: "blocked_interstitial",
          successfulUrl: "https://www.example.com/legal/cookies"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/us-privacy-notice",
        policy_summary_short:
          "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
      }
    ],
    signalKey: "disclosure.cookie_policy_present",
    signalLabel: "Cookie policy fetched",
    signalValue: true
  });

  assert.equal(evidence.fetchQuality, "verified_content");
  assert.equal(evidence.pageUrl, "https://www.example.com/us-privacy-notice");
  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/us-privacy-notice"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/us-privacy-notice"]);
  assert.deepEqual(evidence.policySnippets, [
    "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
  ]);
});

test("reanchors snapshot cookie-surface fallback evidence to privacy notice text when available", () => {
  const evidence = buildSnapshotDisclosureFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/legal/cookies"],
          bestDiscoverySource: "footer_link",
          fetchQuality: "blocked_interstitial",
          pageType: "cookie_policy",
          stopReason: "blocked_interstitial",
          successfulUrl: "https://www.example.com/legal/cookies"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/us-privacy-notice",
        policy_summary_short:
          "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
      }
    ],
    signalKey: "disclosure.cookie_policy_present",
    signalLabel: "Cookie policy fetched",
    signalValue: true,
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(evidence.fetchQuality, "verified_content");
  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/us-privacy-notice"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/us-privacy-notice"]);
  assert.deepEqual(evidence.policySnippets, [
    "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
  ]);
});

test("prefers a stronger privacy notice over a generic cookie path when the cookie path has no readable snippet", () => {
  const evidence = buildCookiePolicyFallbackEvidence({
    keyPageDiscoverySummary: {
      pageSummaries: [
        {
          attemptedUrls: ["https://www.example.com/cookies"],
          bestDiscoverySource: "footer_link",
          fetchQuality: "verified_content",
          pageType: "cookie_policy",
          successfulPageTitle: "",
          successfulUrl: "https://www.example.com/cookies"
        }
      ]
    },
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/legal/privacy/us-residents",
        policy_summary_short:
          "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
      }
    ],
    signalKey: "disclosure.cookie_policy_present",
    signalLabel: "Cookie policy fetched",
    signalValue: true
  });

  assert.equal(evidence.fetchQuality, "verified_content");
  assert.equal(evidence.pageUrl, "https://www.example.com/legal/privacy/us-residents");
  assert.deepEqual(evidence.pageUrls, ["https://www.example.com/legal/privacy/us-residents"]);
  assert.deepEqual(evidence.sourceUrls, ["https://www.example.com/legal/privacy/us-residents"]);
  assert.deepEqual(evidence.policySnippets, [
    "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
  ]);
});
