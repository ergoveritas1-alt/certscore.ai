import test from "node:test";
import assert from "node:assert/strict";
import { buildValidationEvidencePacketForSignal } from "./repository";

function buildBaseRuntimeArtifacts() {
  return {
    consent_post_reject_tracker_evidence_urls: null,
    consent_post_reject_tracker_vendor_names: null,
    consent_reject_persisted_tracker_vendor_names: null,
    consent_reject_reduced_tracking: null
  };
}

test("cookie policy surface missing composes discovery and runtime corroboration from existing scan context", () => {
  const row = {
    category: "disclosure",
    signal_key: "disclosure.cookie_policy_surface_missing",
    signal_label: "Cookie policy surface not detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const thirdPartyCookieCount = {
    category: "privacy",
    signal_key: "privacy.third_party_cookie_count",
    signal_label: "Third-party cookies",
    signal_value_json: 3,
    value_type: "number" as const
  };

  const trackerVendors = {
    category: "privacy",
    signal_key: "privacy.tracker_vendors",
    signal_label: "Tracker vendors",
    signal_value_json: ["Google Analytics", "Meta Pixel"],
    value_type: "string_array" as const
  };

  const preconsentTracking = {
    category: "privacy",
    signal_key: "privacy.preconsent_tracking_detected",
    signal_label: "Pre-consent tracking detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const signalRows = [row, thirdPartyCookieCount, trackerVendors, preconsentTracking];
  const context: Parameters<typeof buildValidationEvidencePacketForSignal>[1] = {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts(),
      key_page_discovery_summary: {
        pageSummaries: [
          {
            attemptCount: 2,
            attemptedUrls: ["https://example.com/cookies", "https://example.com/legal/cookies"],
            bestDiscoverySource: "footer_link",
            guessedOnly: false,
            pageType: "cookie_policy",
            stopReason: "budget_exhausted"
          }
        ]
      },
      script_src_domains: ["www.googletagmanager.com"],
      third_party_request_domains: ["www.google-analytics.com"]
    },
    scanSignalsByKey: new Map(signalRows.map((signal) => [signal.signal_key, signal] as const)),
    snapshot: null
  };

  const evidence = buildValidationEvidencePacketForSignal(row, context);

  assert.ok(evidence);
  assert.equal(evidence?.keyPageAttemptCount, 2);
  assert.deepEqual(evidence?.pageUrls, ["https://example.com/cookies", "https://example.com/legal/cookies"]);
  assert.ok(evidence?.confidenceBasis.some((entry) => /bounded discovery evaluated 2 candidate urls/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /third-party cookies/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /pre-consent tracking detector/i.test(entry)));
  assert.ok(evidence?.runtimeEvidence.includes("observed runtime domain: www.google-analytics.com"));
  assert.ok(evidence?.runtimeEvidence.includes("observed runtime domain: www.googletagmanager.com"));
  assert.ok(
    evidence?.supportingSignals.some(
      (signal) => signal.key === "privacy.third_party_cookie_count" && signal.value === 3
    )
  );
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "privacy.tracker_vendors"));
  assert.ok(evidence?.reviewPolicy.requiredSupportTypes.includes("key_page_coverage_context"));
  assert.deepEqual(
    evidence?.missingEvidence,
    ["The disclosure could still exist at an untested, localized, or consolidated URL outside the bounded discovery scope."]
  );
});

test("privacy policy surface missing reuses the generalized key-page coverage augmenter", () => {
  const row = {
    category: "disclosure",
    signal_key: "disclosure.privacy_policy_surface_missing",
    signal_label: "Privacy policy surface not detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts(),
      key_page_discovery_summary: {
        pageSummaries: [
          {
            attemptCount: 1,
            attemptedUrls: ["https://example.com/privacy"],
            bestDiscoverySource: "footer_link",
            guessedOnly: false,
            pageType: "privacy_policy",
            stopReason: "all_attempts_failed"
          }
        ]
      }
    },
    scanSignalsByKey: new Map([[row.signal_key, row] as const]),
    snapshot: null
  });

  assert.ok(evidence);
  assert.equal(evidence?.keyPageAttemptCount, 1);
  assert.deepEqual(evidence?.pageUrls, ["https://example.com/privacy"]);
  assert.ok(evidence?.reviewPolicy.requiredSupportTypes.includes("key_page_coverage_context"));
  assert.deepEqual(evidence?.missingEvidence, [
    "The disclosure could still exist at an untested, localized, or consolidated URL outside the bounded discovery scope."
  ]);
});

test("reject control missing adds consent snapshot corroboration from existing snapshot fields", () => {
  const row = {
    category: "privacy",
    signal_key: "privacy.reject_control_missing_detected",
    signal_label: "Reject control missing",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts()
    },
    scanSignalsByKey: new Map([[row.signal_key, row] as const]),
    snapshot: {
      cmp_vendor_name: "OneTrust",
      consent_withdrawal_mechanism_present: false,
      cookie_banner_present: true,
      dark_pattern_reject_button_missing: true,
      legal_coverage_score: 88,
      preconsent_tracking_detected: false,
      privacy_policy_present: true,
      privacy_policy_word_count: 900,
      reject_all_present: false,
      third_party_cookie_set_before_consent: false,
      tracking_before_consent_detected: false
    }
  });

  assert.ok(evidence);
  assert.ok(evidence?.confidenceBasis.some((entry) => /visible consent surface/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /missing reject control/i.test(entry)));
  assert.ok(evidence?.reviewPolicy.requiredSupportTypes.includes("consent_snapshot_context"));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "privacy.cookie_banner_present"));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "privacy.dark_pattern_reject_button_missing"));
  assert.deepEqual(evidence?.missingEvidence, ["Banner HTML or page-level consent UI evidence was not retained in this packet."]);
});

test("privacy policy limited adds policy coverage snapshot corroboration from existing snapshot fields", () => {
  const row = {
    category: "disclosure",
    signal_key: "disclosure.privacy_policy_limited",
    signal_label: "Privacy policy coverage limited",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts()
    },
    scanSignalsByKey: new Map([[row.signal_key, row] as const]),
    snapshot: {
      cmp_vendor_name: null,
      consent_withdrawal_mechanism_present: null,
      cookie_banner_present: true,
      dark_pattern_reject_button_missing: false,
      legal_coverage_score: 42,
      preconsent_tracking_detected: false,
      privacy_policy_present: true,
      privacy_policy_word_count: 180,
      reject_all_present: true,
      third_party_cookie_set_before_consent: false,
      tracking_before_consent_detected: false
    }
  });

  assert.ok(evidence);
  assert.ok(evidence?.confidenceBasis.some((entry) => /privacy policy surface was present/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /180 word/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /coverage score was 42/i.test(entry)));
  assert.ok(evidence?.reviewPolicy.requiredSupportTypes.includes("policy_coverage_snapshot_context"));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "disclosure.privacy_policy_word_count"));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "context.legal_coverage_score"));
  assert.deepEqual(evidence?.missingEvidence, ["Policy excerpts or structured coverage diagnostics were not retained in this packet."]);
});

test("policy behavior conflict uses a typed contradiction packet instead of the generic fallback", () => {
  const row = {
    category: "context",
    signal_key: "context.policy_behavior_conflict_detected",
    signal_label: "Policy/behavior conflict detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const sibling = {
    category: "context",
    signal_key: "context.privacy_cookie_policy_conflict_detected",
    signal_label: "Privacy and cookie policy conflict detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts()
    },
    scanSignalsByKey: new Map([
      [row.signal_key, row] as const,
      [sibling.signal_key, sibling] as const
    ]),
    snapshot: null
  });

  assert.ok(evidence);
  assert.equal(evidence?.claim, "Observed site behavior may conflict with the site’s public-facing policy language.");
  assert.ok(evidence?.confidenceBasis.some((entry) => /policy-versus-behavior conflict detector/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /related contradiction signals/i.test(entry)));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "context.privacy_cookie_policy_conflict_detected"));
  assert.ok(evidence?.missingEvidence.some((entry) => /direct policy excerpts/i.test(entry)));
});

test("accessibility risk score uses structured score evidence instead of generic fallback copy", () => {
  const row = {
    category: "accessibility",
    signal_key: "accessibility.accessibility_risk_score",
    signal_label: "Accessibility risk score",
    signal_value_json: 84,
    value_type: "number" as const
  };

  const ariaIssues = {
    category: "accessibility",
    signal_key: "accessibility.wcag_aria_error_count",
    signal_label: "ARIA issues",
    signal_value_json: 11,
    value_type: "number" as const
  };

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts()
    },
    scanSignalsByKey: new Map([
      [row.signal_key, row] as const,
      [ariaIssues.signal_key, ariaIssues] as const
    ]),
    snapshot: null
  });

  assert.ok(evidence);
  assert.ok(evidence?.confidenceBasis.some((entry) => /accessibility risk score: 84/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /does not determine full conformance/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /related automated accessibility signals/i.test(entry)));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "accessibility.accessibility_risk_score"));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "accessibility.wcag_aria_error_count"));
});

test("guessed-only key-page discovery lowers privacy policy absence confidence", () => {
  const row = {
    category: "disclosure",
    signal_key: "disclosure.privacy_policy_surface_missing",
    signal_label: "Privacy policy surface not detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts(),
      key_page_discovery_summary: {
        pageSummaries: [
          {
            attemptCount: 2,
            attemptedUrls: ["https://example.com/privacy", "https://example.com/legal/privacy"],
            bestDiscoverySource: "guessed_slug",
            guessedOnly: true,
            pageType: "privacy_policy",
            stopReason: "budget_exhausted"
          }
        ]
      }
    },
    scanSignalsByKey: new Map([[row.signal_key, row] as const]),
    snapshot: null
  });

  assert.ok(evidence);
  assert.equal(evidence?.reviewPolicy.detectorStrength, "weak");
  assert.ok(evidence?.confidenceBasis.some((entry) => /guessed candidate paths/i.test(entry)));
  assert.ok(evidence?.reviewPolicy.rubric.inconclusiveIf.some((entry) => /guessed paths/i.test(entry)));
});

test("accessibility findings retain page-level rule examples when available", () => {
  const row = {
    category: "accessibility",
    signal_key: "accessibility.wcag_error_count_total",
    signal_label: "WCAG errors",
    signal_value_json: 24,
    value_type: "number" as const
  };

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [
      {
        description: "Elements must have sufficient color contrast",
        help: "Fix contrast",
        help_url: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        impact: "serious",
        node_count: 8,
        page_url: "https://example.com/checkout",
        representative_selectors: [".checkout-button"],
        rule_code: "color-contrast",
        rule_group: "contrast",
        severity: "high"
      },
      {
        description: "Buttons must have discernible text",
        help: "Fix button name",
        help_url: "https://dequeuniversity.com/rules/axe/4.10/button-name",
        impact: "serious",
        node_count: 4,
        page_url: "https://example.com/signup",
        representative_selectors: ["button.submit"],
        rule_code: "button-name",
        rule_group: "name-role-value",
        severity: "medium"
      }
    ],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts()
    },
    scanSignalsByKey: new Map([[row.signal_key, row] as const]),
    snapshot: null
  });

  assert.ok(evidence);
  assert.deepEqual(evidence?.pageUrls, ["https://example.com/checkout", "https://example.com/signup"]);
  assert.equal(evidence?.missingEvidence.length, 0);
  assert.ok(evidence?.confidenceBasis.some((entry) => /representative page-level examples/i.test(entry)));
  assert.ok(evidence?.runtimeEvidence.some((entry) => /color-contrast on https:\/\/example.com\/checkout/i.test(entry)));
});

test("cookie disclosure gap uses typed runtime and disclosure context instead of generic fallback", () => {
  const row = {
    category: "privacy",
    signal_key: "privacy.cookie_runtime_disclosure_gap_detected",
    signal_label: "Cookie disclosure gap detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const signalRows: Parameters<typeof buildValidationEvidencePacketForSignal>[1]["scanSignalsByKey"] = new Map();
  signalRows.set(row.signal_key, row);
  signalRows.set("privacy.third_party_cookie_count", {
    category: "privacy",
    signal_key: "privacy.third_party_cookie_count",
    signal_label: "Third-party cookies",
    signal_value_json: 4,
    value_type: "number" as const
  });
  signalRows.set("privacy.tracker_vendors", {
    category: "privacy",
    signal_key: "privacy.tracker_vendors",
    signal_label: "Tracker vendors",
    signal_value_json: ["Google Analytics", "Meta Pixel"],
    value_type: "string_array" as const
  });
  signalRows.set("disclosure.cookie_policy_surface_missing", {
    category: "disclosure",
    signal_key: "disclosure.cookie_policy_surface_missing",
    signal_label: "Cookie policy surface not detected",
    signal_value_json: true,
    value_type: "boolean" as const
  });

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts(),
      key_page_discovery_summary: {
        pageSummaries: [
          {
            attemptCount: 2,
            attemptedUrls: ["https://example.com/cookies"],
            bestDiscoverySource: "footer_link",
            guessedOnly: false,
            pageType: "cookie_policy",
            stopReason: "budget_exhausted"
          }
        ]
      },
      script_src_domains: ["www.googletagmanager.com"],
      third_party_request_domains: ["www.google-analytics.com"]
    },
    scanSignalsByKey: signalRows,
    snapshot: null
  });

  assert.ok(evidence);
  assert.equal(evidence?.claim, "Observed cookie or tracker activity may not be fully reflected in the current cookie disclosure surface.");
  assert.deepEqual(evidence?.pageUrls, ["https://example.com/cookies"]);
  assert.ok(evidence?.confidenceBasis.some((entry) => /cookie runtime-versus-disclosure gap detector/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /4 third-party cookie/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /google analytics/i.test(entry)));
  assert.ok(evidence?.runtimeEvidence.includes("observed runtime domain: www.google-analytics.com"));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "disclosure.cookie_policy_surface_missing"));
});

test("session replay evidence uses dedicated replay runtime and disclosure context when available", () => {
  const row = {
    category: "context",
    signal_key: "context.session_replay_without_disclosure_detected",
    signal_label: "Session replay without disclosure detected",
    signal_value_json: true,
    value_type: "boolean" as const
  };

  const signalRows: Parameters<typeof buildValidationEvidencePacketForSignal>[1]["scanSignalsByKey"] = new Map();
  signalRows.set(row.signal_key, row);
  signalRows.set("privacy.session_replay_runtime_detected", {
    category: "privacy",
    signal_key: "privacy.session_replay_runtime_detected",
    signal_label: "Session replay runtime detected",
    signal_value_json: true,
    value_type: "boolean" as const
  });
  signalRows.set("privacy.session_replay_runtime_vendors", {
    category: "privacy",
    signal_key: "privacy.session_replay_runtime_vendors",
    signal_label: "Session replay runtime vendors",
    signal_value_json: ["FullStory"],
    value_type: "string_array" as const
  });
  signalRows.set("disclosure.session_replay_disclosure_pages", {
    category: "disclosure",
    signal_key: "disclosure.session_replay_disclosure_pages",
    signal_label: "Session replay disclosure pages",
    signal_value_json: ["https://example.com/privacy"],
    value_type: "string_array" as const
  });

  const evidence = buildValidationEvidencePacketForSignal(row, {
    accessibilityRuleExamples: [],
    runtimeArtifacts: {
      ...buildBaseRuntimeArtifacts(),
      script_src_domains: ["edge.fullstory.com"],
      third_party_request_domains: []
    },
    scanSignalsByKey: signalRows,
    snapshot: null
  });

  assert.ok(evidence);
  assert.ok(evidence?.confidenceBasis.some((entry) => /likely replay vendors detected: fullstory/i.test(entry)));
  assert.ok(evidence?.confidenceBasis.some((entry) => /possible session-replay disclosure mentions/i.test(entry)));
  assert.deepEqual(evidence?.policyEvidence, ["https://example.com/privacy"]);
  assert.ok(evidence?.reviewPolicy.requiredSupportTypes.includes("disclosure_context"));
  assert.ok(evidence?.runtimeEvidence.includes("edge.fullstory.com"));
  assert.ok(evidence?.supportingSignals.some((signal) => signal.key === "privacy.session_replay_runtime_vendors"));
});
