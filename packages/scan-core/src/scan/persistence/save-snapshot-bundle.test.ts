import assert from "node:assert/strict";
import test from "node:test";
import type { SnapshotBundle } from "../snapshot/types";
import {
  buildAccessibilityRuleExampleRows,
  buildPreconsentViolationRows,
  buildRuntimeArtifactRow,
  buildSnapshotInsert,
  omitOptionalRuntimeArtifactsColumn
} from "./save-snapshot-bundle";

test("buildRuntimeArtifactRow maps compact runtime evidence for persistence", () => {
  const bundle = {
    snapshot: {
      scanId: "scan-1",
      organizationId: "org-1",
      domainId: "domain-1"
    },
    accessibilityRuleCounts: [],
    compatibilitySignals: [],
    pages: [],
    scanPlan: {
      profile: "balanced",
      prefetchTargetCount: 2,
      expansionTargetCount: 3,
      staticFetchConcurrency: 1,
      browserNavigationTimeoutMs: 12000,
      browserPostLoadWaitMs: 1000,
      blockStylesheetsInBrowser: true
    },
    trackerVendors: [],
    runtimeArtifacts: {
      scanId: "scan-1",
      thirdPartyRequestDomains: ["cdn.example.com", "tracker.example.net"],
      thirdPartyRequestCount: 4,
      initialCookieNames: ["_ga", "consent"],
      initialCookieDomains: [".example.com", ".tracker.example.net"],
      initialCookieCount: 2,
      scriptSrcDomains: ["cdn.example.com"],
      scriptTagCount: 3,
      responseHeaders: {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000"
      },
      domStructureHash: "hash-1",
      domNodeCount: 42,
      consentAuditCompleted: true,
      consentRejectInteractionSucceeded: true,
      consentAcceptInteractionSucceeded: false,
      consentRejectReducedTracking: true,
      consentRejectReducedThirdPartyCookies: true,
      consentBaselineCookieCount: 8,
      consentBaselineThirdPartyCookieCount: 7,
      consentPreconsentViolationCount: 2,
      consentBaselineTrackerEvidenceUrls: ["https://snap.licdn.com/li.lms-analytics/insight.min.js"],
      consentBaselineTrackerVendorNames: ["LinkedIn Insight Tag", "Marketo"],
      sensitivePayloadViolations: [
        {
          detectedType: "email_detected",
          evidenceStrength: "confirmed",
          matchSnippet: "email=al***@example.com",
          requestMethod: "POST",
          requestUrl: "https://tracker.example.net/collect",
          sourceField: "email",
          sourceLocation: "request_body",
          sourcePattern: "keyed_field",
          timestamp: "2026-03-20T14:19:44.000Z",
          vendorHost: "tracker.example.net"
        }
      ],
      keyPageDiscoverySummary: {
        budgets: {
          maxAdditionalFetchAttempts: 8,
          maxCandidates: 20,
          maxFetchAttemptsPerType: 3,
          maxSameBrandCandidatesPerType: 2,
          maxSameBrandSubdomainHosts: 3,
          maxSecondHopLegalHubFetchesPerMissingType: 1,
          maxSitemapFiles: 3,
          maxSitemapIndexChildren: 2
        },
        candidates: [],
        localeHints: ["en"],
        pageSummaries: [
          {
            attemptCount: 1,
            attemptedUrls: ["https://example.com/privacy"],
            bestDiscoverySource: "sitemap",
            guessedOnly: false,
            pageType: "privacy_policy",
            stopReason: "all_attempts_failed",
            successfulUrl: null,
            successfulHostRelation: null,
            surfaceDetected: true
          }
        ],
        sameBrandSubdomainHostsInspected: [],
        sitemapFilesFetched: ["https://example.com/sitemap.xml"],
        sitemapIndexUrlsFetched: [],
        sitemapUrls: ["https://example.com/sitemap.xml"]
      },
      consentRejectPersistedTrackerVendorNames: ["LinkedIn Insight Tag"],
      consentRejectNewTrackerVendorNames: [],
      consentRejectClickCount: 1,
      consentAcceptClickCount: 0,
      consentOptInClicks: 1,
      consentOptOutClicks: 3,
      consentBlockerType: "extra_click_path",
      consentBlockerUrl: "https://example.com/",
      consentBlockerPageTitle: "Privacy Preferences",
      consentBlockerTextSnippet: "Manage preferences",
      consentEvidencePassCount: 1,
      consentFrictionDelta: 2,
      consentRedirectOrAuthRequired: false,
      consentOptInEvidenceLog: [
        {
          action: "accept",
          selectorHint: "button#accept",
          stepIndex: 1,
          text: "Accept all",
          urlAfterClick: "https://example.com/"
        }
      ],
      consentOptOutEvidenceLog: [
        {
          action: "preferences",
          selectorHint: "button#manage",
          stepIndex: 1,
          text: "Manage preferences",
          urlAfterClick: "https://example.com/"
        },
        {
          action: "toggle",
          selectorHint: "input#analytics",
          stepIndex: 2,
          text: "Analytics cookies",
          urlAfterClick: "https://example.com/"
        },
        {
          action: "save",
          selectorHint: "button#save",
          stepIndex: 3,
          text: "Save choices",
          urlAfterClick: "https://example.com/"
        }
      ],
      consentPostRejectCookieCount: 3,
      consentPostRejectThirdPartyCookieCount: 1,
      consentPostRejectTrackerEvidenceUrls: ["https://snap.licdn.com/li.lms-analytics/insight.min.js"],
      consentPostRejectTrackerVendorNames: ["LinkedIn Insight Tag"],
      consentAcceptNewTrackerVendorNames: ["Google Ads"],
      consentPostAcceptCookieCount: 10,
      consentPostAcceptThirdPartyCookieCount: 8,
      consentPostAcceptTrackerEvidenceUrls: ["https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123"],
      consentPostAcceptTrackerVendorNames: ["Google Ads", "LinkedIn Insight Tag"],
      buildPhaseSummaries: [
        {
          attempts: 1,
          completedAt: "2026-03-20T14:20:05.000Z",
          durationMs: 1200,
          errorCategory: null,
          message: null,
          metadata: {
            homepageUrl: "https://example.com/"
          },
          outcome: "success",
          phase: "browser_runtime_capture",
          recoverable: false,
          startedAt: "2026-03-20T14:20:03.800Z"
        }
      ]
    }
  } as unknown as SnapshotBundle;

  assert.deepEqual(buildRuntimeArtifactRow(bundle), {
    scan_id: "scan-1",
    organization_id: "org-1",
    domain_id: "domain-1",
    third_party_request_domains: ["cdn.example.com", "tracker.example.net"],
    third_party_request_count: 4,
    initial_cookie_names: ["_ga", "consent"],
    initial_cookie_domains: [".example.com", ".tracker.example.net"],
    initial_cookie_count: 2,
    script_src_domains: ["cdn.example.com"],
    script_tag_count: 3,
    response_headers: {
      "content-security-policy": "default-src 'self'",
      "strict-transport-security": "max-age=31536000"
    },
    dom_structure_hash: "hash-1",
    dom_node_count: 42,
    consent_audit_completed: true,
    consent_reject_interaction_succeeded: true,
    consent_accept_interaction_succeeded: false,
    consent_reject_reduced_tracking: true,
    consent_reject_reduced_third_party_cookies: true,
    consent_baseline_cookie_count: 8,
    consent_baseline_third_party_cookie_count: 7,
    consent_preconsent_violation_count: 2,
    consent_baseline_tracker_evidence_urls: ["https://snap.licdn.com/li.lms-analytics/insight.min.js"],
    consent_baseline_tracker_vendor_names: ["LinkedIn Insight Tag", "Marketo"],
    sensitive_payload_violations: [
      {
        detectedType: "email_detected",
        evidenceStrength: "confirmed",
        matchSnippet: "email=al***@example.com",
        requestMethod: "POST",
        requestUrl: "https://tracker.example.net/collect",
        sourceField: "email",
        sourceLocation: "request_body",
        sourcePattern: "keyed_field",
        timestamp: "2026-03-20T14:19:44.000Z",
        vendorHost: "tracker.example.net"
      }
    ],
    key_page_discovery_summary: {
      budgets: {
        maxAdditionalFetchAttempts: 8,
        maxCandidates: 20,
        maxFetchAttemptsPerType: 3,
        maxSameBrandCandidatesPerType: 2,
        maxSameBrandSubdomainHosts: 3,
        maxSecondHopLegalHubFetchesPerMissingType: 1,
        maxSitemapFiles: 3,
        maxSitemapIndexChildren: 2
      },
      candidates: [],
      localeHints: ["en"],
      pageSummaries: [
        {
          attemptCount: 1,
          attemptedUrls: ["https://example.com/privacy"],
          bestDiscoverySource: "sitemap",
          guessedOnly: false,
          pageType: "privacy_policy",
          stopReason: "all_attempts_failed",
          successfulUrl: null,
          successfulHostRelation: null,
          surfaceDetected: true
        }
      ],
      sameBrandSubdomainHostsInspected: [],
      sitemapFilesFetched: ["https://example.com/sitemap.xml"],
      sitemapIndexUrlsFetched: [],
      sitemapUrls: ["https://example.com/sitemap.xml"]
    },
    consent_reject_persisted_tracker_vendor_names: ["LinkedIn Insight Tag"],
    consent_reject_new_tracker_vendor_names: [],
    consent_reject_click_count: 1,
    consent_accept_click_count: 0,
    consent_opt_in_clicks: 1,
    consent_opt_out_clicks: 3,
    consent_blocker_type: "extra_click_path",
    consent_blocker_url: "https://example.com/",
    consent_blocker_page_title: "Privacy Preferences",
    consent_blocker_text_snippet: "Manage preferences",
    consent_evidence_pass_count: 1,
    consent_friction_delta: 2,
    consent_redirect_or_auth_required: false,
    consent_opt_in_evidence_log: [
      {
        action: "accept",
        selectorHint: "button#accept",
        stepIndex: 1,
        text: "Accept all",
        urlAfterClick: "https://example.com/"
      }
    ],
    consent_opt_out_evidence_log: [
      {
        action: "preferences",
        selectorHint: "button#manage",
        stepIndex: 1,
        text: "Manage preferences",
        urlAfterClick: "https://example.com/"
      },
      {
        action: "toggle",
        selectorHint: "input#analytics",
        stepIndex: 2,
        text: "Analytics cookies",
        urlAfterClick: "https://example.com/"
      },
      {
        action: "save",
        selectorHint: "button#save",
        stepIndex: 3,
        text: "Save choices",
        urlAfterClick: "https://example.com/"
      }
    ],
    consent_post_reject_cookie_count: 3,
    consent_post_reject_third_party_cookie_count: 1,
    consent_post_reject_tracker_evidence_urls: ["https://snap.licdn.com/li.lms-analytics/insight.min.js"],
    consent_post_reject_tracker_vendor_names: ["LinkedIn Insight Tag"],
    consent_accept_new_tracker_vendor_names: ["Google Ads"],
    consent_post_accept_cookie_count: 10,
    consent_post_accept_third_party_cookie_count: 8,
    consent_post_accept_tracker_evidence_urls: ["https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123"],
    consent_post_accept_tracker_vendor_names: ["Google Ads", "LinkedIn Insight Tag"],
    build_phase_summaries: [
      {
        attempts: 1,
        completedAt: "2026-03-20T14:20:05.000Z",
        durationMs: 1200,
        errorCategory: null,
        message: null,
        metadata: {
          homepageUrl: "https://example.com/"
        },
        outcome: "success",
        phase: "browser_runtime_capture",
        recoverable: false,
        startedAt: "2026-03-20T14:20:03.800Z"
      }
    ]
  });
});

test("omitOptionalRuntimeArtifactsColumn removes unsupported optional runtime fields", () => {
  const strippedRow = omitOptionalRuntimeArtifactsColumn(
    {
      build_phase_summaries: [{ phase: "browser_runtime_capture" }],
      scan_id: "scan-1",
      third_party_request_count: 1
    },
    "Could not find the 'build_phase_summaries' column of 'scan_runtime_artifacts' in the schema cache"
  );

  assert.deepEqual(strippedRow, {
    scan_id: "scan-1",
    third_party_request_count: 1
  });
});

test("buildSnapshotInsert omits policy enrichment id until policy rows exist", () => {
  const bundle = {
    snapshot: {
      scanId: "scan-1",
      policyEnrichmentId: "policy-1"
    }
  } as unknown as SnapshotBundle;

  assert.deepEqual(buildSnapshotInsert(bundle, { omitPolicyEnrichmentId: true }), {
    scan_id: "scan-1",
    policy_enrichment_id: null
  });

  assert.deepEqual(buildSnapshotInsert(bundle), {
    scan_id: "scan-1",
    policy_enrichment_id: "policy-1"
  });
});

test("buildPreconsentViolationRows persists vendor-level pre-consent evidence", () => {
  const bundle = {
    snapshot: {
      scanId: "scan-1",
      organizationId: "org-1",
      domainId: "domain-1"
    },
    runtimeArtifacts: {
      consentBaselineTrackerVendorNames: ["LinkedIn Insight Tag", "Marketo"],
      consentBaselineTrackerEvidenceUrls: [
        "https://snap.licdn.com/li.lms-analytics/insight.min.js",
        "https://px.ads.linkedin.com/collect?v=2",
        "https://munchkin.marketo.net/munchkin.js"
      ]
    },
    trackerVendors: [
      {
        scanId: "scan-1",
        vendorName: "LinkedIn Insight Tag",
        vendorCategory: "advertising",
        detectionSource: "runtime_request",
        confidence: 0.92,
        firstPartyOrThirdParty: "third_party",
        collectionEndpointType: "direct_third_party",
        beforeConsent: true,
        scriptHost: "snap.licdn.com",
        matchedSignatureId: "linkedin-insight"
      },
      {
        scanId: "scan-1",
        vendorName: "Marketo",
        vendorCategory: "analytics",
        detectionSource: "runtime_request",
        confidence: 0.85,
        firstPartyOrThirdParty: "third_party",
        collectionEndpointType: "direct_third_party",
        beforeConsent: true,
        scriptHost: "munchkin.marketo.net",
        matchedSignatureId: "marketo-munchkin"
      }
    ]
  } as unknown as SnapshotBundle;

  assert.deepEqual(buildPreconsentViolationRows(bundle), [
    {
      scan_id: "scan-1",
      organization_id: "org-1",
      domain_id: "domain-1",
      vendor_name: "LinkedIn Insight Tag",
      vendor_category: "advertising",
      detection_source: "runtime_request",
      confidence: 0.92,
      first_party_or_third_party: "third_party",
      collection_endpoint_type: "direct_third_party",
      script_host: "snap.licdn.com",
      matched_signature_id: "linkedin-insight",
      evidence_urls: [
        "https://snap.licdn.com/li.lms-analytics/insight.min.js",
        "https://px.ads.linkedin.com/collect?v=2"
      ]
    },
    {
      scan_id: "scan-1",
      organization_id: "org-1",
      domain_id: "domain-1",
      vendor_name: "Marketo",
      vendor_category: "analytics",
      detection_source: "runtime_request",
      confidence: 0.85,
      first_party_or_third_party: "third_party",
      collection_endpoint_type: "direct_third_party",
      script_host: "munchkin.marketo.net",
      matched_signature_id: "marketo-munchkin",
      evidence_urls: ["https://munchkin.marketo.net/munchkin.js"]
    }
  ]);
});

test("buildPreconsentViolationRows infers vendor metadata from evidence URLs when tracker inventory is missing", () => {
  const bundle = {
    snapshot: {
      scanId: "scan-1",
      organizationId: "org-1",
      domainId: "domain-1"
    },
    runtimeArtifacts: {
      consentBaselineTrackerVendorNames: ["LinkedIn Insight Tag"],
      consentBaselineTrackerEvidenceUrls: [
        "https://snap.licdn.com/li.lms-analytics/insight.min.js",
        "https://px.ads.linkedin.com/collect?v=2"
      ]
    },
    trackerVendors: []
  } as unknown as SnapshotBundle;

  assert.deepEqual(buildPreconsentViolationRows(bundle), [
    {
      scan_id: "scan-1",
      organization_id: "org-1",
      domain_id: "domain-1",
      vendor_name: "LinkedIn Insight Tag",
      vendor_category: "advertising",
      detection_source: "script_signature",
      confidence: 0.9,
      first_party_or_third_party: "unknown",
      collection_endpoint_type: "direct_third_party",
      script_host: null,
      matched_signature_id: "linkedin_insight",
      evidence_urls: [
        "https://snap.licdn.com/li.lms-analytics/insight.min.js",
        "https://px.ads.linkedin.com/collect?v=2"
      ]
    }
  ]);
});

test("buildAccessibilityRuleExampleRows persists representative selectors and help metadata", () => {
  const bundle = {
    snapshot: {
      scanId: "scan-1",
      organizationId: "org-1",
      domainId: "domain-1"
    },
    accessibilityRuleExamples: [
      {
        scanId: "scan-1",
        pageUrl: "https://example.com/",
        ruleCode: "color-contrast",
        ruleGroup: "color",
        severity: "medium",
        impact: "serious",
        help: "Elements must meet minimum color contrast ratio thresholds",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        description: "Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
        nodeCount: 3,
        representativeSelectors: ["button.primary", "a.hero-link"]
      }
    ]
  } as unknown as SnapshotBundle;

  assert.deepEqual(buildAccessibilityRuleExampleRows(bundle), [
    {
      scan_id: "scan-1",
      organization_id: "org-1",
      domain_id: "domain-1",
      page_url: "https://example.com/",
      rule_code: "color-contrast",
      rule_group: "color",
      severity: "medium",
      impact: "serious",
      help: "Elements must meet minimum color contrast ratio thresholds",
      help_url: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
      description: "Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
      node_count: 3,
      representative_selectors: ["button.primary", "a.hero-link"]
    }
  ]);
});
