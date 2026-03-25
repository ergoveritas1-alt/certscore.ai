import assert from "node:assert/strict";
import test from "node:test";
import {
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
  assert.equal(evidence.keyPageDiscoverySource, "footer_link");
  assert.deepEqual(evidence.pageUrls, [
    "https://www.example.com/privacy",
    "https://www.example.com/terms",
    "https://www.example.com/contact"
  ]);
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
