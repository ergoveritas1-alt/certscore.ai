import assert from "node:assert/strict";
import test from "node:test";

import { getGuideSampleFindings, getSampleFindingById } from "./sample-finding-json";

const PUBLIC_SAMPLE_HYGIENE_PATTERN =
  /surface_priority|appeared_in_executive_summary|regulatory_lanes|normalized_concern_ids|concern_policy_rule_ids|policy_anchors|conflict_bridge|privacy\.preconsent_tracking_detected|Production finding corpus|scan_id|fxvipsignals\.com|e54bf2cf|preconsent_violation_count|partial_scan|fullQuery|full_query|cookieValue|cookie_value|payloadBody|sensitivePayload|personalData/i;

const PUBLIC_SAMPLE_USER_DATA_PATTERN =
  /\b(?:userData|personalData|userEnteredValue|user_entered_value|userValue|user_value|emailAddress|email_address|phoneNumber|phone_number|fullName|full_name|firstName|first_name|lastName|last_name|ssn|dob)\b|(?:^|["&?;\s])(?:email|phone|full_name|first_name|last_name|ssn|dob)=/i;

const REAL_PRE_CONSENT_SAMPLE_DOMAIN_PATTERN =
  /google-analytics\.com|googletagmanager\.com|Google Analytics|Google Tag Manager/i;

function assertPublicIllustrativeSampleIsSanitized(sample: NonNullable<ReturnType<typeof getSampleFindingById>>) {
  const serialized = JSON.stringify(sample);

  assert.doesNotMatch(serialized, PUBLIC_SAMPLE_HYGIENE_PATTERN);
  assert.doesNotMatch(serialized, /https?:\/\/[^"]+\?[^"]+/);
  assert.doesNotMatch(serialized, /"runtime_anchors":\s*\[\s*\][\s\S]{0,160}strong/i);
}

test("guide sample findings resolve from the guide slug instead of falling back to pre-consent content", () => {
  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/rtb-cookie-syncing",
      title: "RTB cookie syncing: what it means and how to review it"
    }).map((sample) => sample.findingId),
    ["rtb_cookie_sync_observed"]
  );

  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/session-replay-risk",
      title: "Session replay risk: what website owners should review"
    }).map((sample) => sample.findingId),
    ["session_recording_services_detected"]
  );

  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/accessibility-homepage-signals",
      title: "Accessibility homepage signals: what automated scans can surface"
    }).map((sample) => sample.findingId),
    ["accessibility_risk_score"]
  );
});

test("policy and disclosure guides expose representative sample evidence", () => {
  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/cookie-banner-requirements",
      title: "Cookie Banner Requirements"
    }).map((sample) => sample.findingId),
    ["cookie_banner_control_gap", "third_party_cookie_pre_consent"]
  );

  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/website-privacy-policy-requirements",
      title: "Website Privacy Policy Requirements"
    }).map((sample) => sample.findingId),
    ["privacy_policy_thin_coverage"]
  );

  assert.deepEqual(
    getGuideSampleFindings({
      path: "/guides/website-disclosure-requirements",
      title: "Website Disclosure Requirements"
    }).map((sample) => sample.findingId),
    ["endorsement_disclosure_gap"]
  );
});

test("public sample findings do not expose internal temp paths", () => {
  const samples = [
    ...getGuideSampleFindings({
      path: "/guides/cookie-banner-requirements",
      title: "Cookie Banner Requirements"
    }),
    ...getGuideSampleFindings({
      path: "/guides/third-party-cookies-before-consent",
      title: "Third-party cookies before consent"
    })
  ];

  for (const sample of samples) {
    assert.doesNotMatch(JSON.stringify(sample.payload), /tmp\/|auto-next/i);
  }
});

test("pre-consent public sample is illustrative and evidence-backed", () => {
  const sample = getSampleFindingById("pre_consent_tracking_detected");

  assert.ok(sample);

  const payload = sample.payload as Record<string, unknown>;
  const serialized = JSON.stringify(payload);

  assert.match(serialized, /example\.com/);
  assert.match(serialized, /tagmanager\.example/);
  assert.match(serialized, /analytics\.example/);
  assert.match(serialized, /request_samples/);
  assert.match(serialized, /cookie_samples/);
  assert.match(serialized, /runtime_anchors/);
  assert.match(serialized, /queryRedacted|query_redacted/);
  assert.match(serialized, /valueRedacted|value_redacted/);
  assert.match(serialized, /supporting_context_only/);
  assert.match(serialized, /finding_supporting_artifact/);
  assert.equal(sample.sourceLabel, "Illustrative public evidence sample");
  assert.doesNotMatch(serialized, REAL_PRE_CONSENT_SAMPLE_DOMAIN_PATTERN);
  assert.doesNotMatch(serialized, /preconsent_violation_count/);
  assert.doesNotMatch(serialized, /fxvipsignals\.com|e54bf2cf/);
  assert.doesNotMatch(serialized, /partial_scan|incomplete_pages/);
  assert.doesNotMatch(serialized, /"scan_id"/);
  assert.doesNotMatch(serialized, /"runtime_anchors":\s*\[\s*\]/);
  assertPublicIllustrativeSampleIsSanitized(sample);
});

test("illustrative public samples remain sanitized for client exposure", () => {
  const samples = [
    getSampleFindingById("pre_consent_tracking_detected"),
    getSampleFindingById("third_party_cookie_pre_consent"),
    getSampleFindingById("reject_tracking_persists_after_reject"),
    getSampleFindingById("rtb_cookie_sync_observed"),
    getSampleFindingById("cross_domain_identifier_sharing_observed"),
    getSampleFindingById("cookie_disclosure_gap"),
    getSampleFindingById("long_lived_cookie_retention_review"),
    getSampleFindingById("policy_behavior_contradiction_detected"),
    getSampleFindingById("session_recording_services_detected"),
    getSampleFindingById("possible_session_replay_on_sensitive_input_surface"),
    getSampleFindingById("session_replay_present_with_sensitive_surfaces_observed"),
    getSampleFindingById("sensitive_data_collection_with_third_party_tracking_present"),
    getSampleFindingById("fingerprinting_related_signals_observed"),
    getSampleFindingById("probable_fingerprinting")
  ].filter((sample): sample is NonNullable<ReturnType<typeof getSampleFindingById>> => sample !== null);

  for (const sample of samples) {
    assert.equal(sample.sourceLabel, "Illustrative public evidence sample");
    assertPublicIllustrativeSampleIsSanitized(sample);
    assert.doesNotMatch(JSON.stringify(sample.payload), /marketwatch\.com|betterment\.com|abc\.com|doubleclick\.net|adnxs\.com|adsrvr\.org|demdex\.net|criteo\.com/i);
    assert.doesNotMatch(JSON.stringify(sample.payload), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  }

  assert.equal(getSampleFindingById("rtb_cookie_sync_observed")?.payload.criticality, "high");
  assert.equal(getSampleFindingById("cross_domain_identifier_sharing_observed")?.payload.criticality, "high");
  assert.match(JSON.stringify(getSampleFindingById("cookie_disclosure_gap")?.payload), /runtime_vendor_not_disclosed/);
  assert.match(JSON.stringify(getSampleFindingById("cookie_disclosure_gap")?.payload), /policySurfacesSearched/);
  assert.match(JSON.stringify(getSampleFindingById("policy_behavior_contradiction_detected")?.payload), /runtime_vendor_not_disclosed/);
  assert.match(JSON.stringify(getSampleFindingById("policy_behavior_contradiction_detected")?.payload), /strongerFindingHandling/);
  assert.equal(getSampleFindingById("long_lived_cookie_retention_review")?.label, "Long-lived cookie retention review");
  assert.match(JSON.stringify(getSampleFindingById("long_lived_cookie_retention_review")?.payload), /cookieRetentionEvidence/);
  assert.match(JSON.stringify(getSampleFindingById("long_lived_cookie_retention_review")?.payload), /CertScore product review threshold/);
  assert.equal(getSampleFindingById("third_party_cookie_pre_consent")?.label, "Third-party cookie or storage observed before consent");
  assert.equal(getSampleFindingById("session_recording_services_detected")?.label, "Session replay service signal observed");
  assert.equal(
    getSampleFindingById("session_replay_present_with_sensitive_surfaces_observed")?.label,
    "Session replay observed with sensitive input surfaces"
  );
  assert.equal(getSampleFindingById("session_replay_present_with_sensitive_surfaces_observed")?.payload.criticality, "high");
  assert.equal(
    getSampleFindingById("possible_session_replay_on_sensitive_input_surface")?.payload.criticality,
    "critical"
  );
  assert.match(
    JSON.stringify(getSampleFindingById("possible_session_replay_on_sensitive_input_surface")?.payload),
    /visual-capture settings/
  );
  assert.doesNotMatch(
    JSON.stringify(getSampleFindingById("possible_session_replay_on_sensitive_input_surface")?.payload),
    /masking, screenshots, keystroke capture/
  );
  assert.equal(getSampleFindingById("sensitive_data_collection_with_third_party_tracking_present")?.payload.criticality, "high");
  assert.equal(getSampleFindingById("cpra_cba_opt_out_missing")?.label, "CPRA / privacy choice opt-out review signal");
  assert.equal(getSampleFindingById("cpra_cba_opt_out_missing")?.sourceLabel, "Illustrative public evidence sample");
  assert.equal(getSampleFindingById("cpra_cba_opt_out_missing")?.payload.criticality, "high");
  assert.match(
    JSON.stringify(getSampleFindingById("cpra_cba_opt_out_missing")?.payload),
    /https:\/\/example\.com\/privacy/
  );
  assert.match(
    JSON.stringify(getSampleFindingById("cpra_cba_opt_out_missing")?.payload),
    /cross-context behavioral advertising/
  );
  assert.doesNotMatch(
    JSON.stringify(getSampleFindingById("cpra_cba_opt_out_missing")?.payload),
    /\bCBA\b|scan_id|fullQuery|full_query|cookieValue|cookie_value|payloadBody|sensitivePayload|personalData|https?:\/\/[^"]+\?[^"]+/i
  );
  assert.equal(getSampleFindingById("fingerprinting_related_signals_observed")?.label, "Fingerprinting-related browser/device signals observed");
  assert.equal(getSampleFindingById("fingerprinting_related_signals_observed")?.payload.criticality, "high");
  assert.doesNotMatch(
    JSON.stringify(getSampleFindingById("fingerprinting_related_signals_observed")?.payload),
    PUBLIC_SAMPLE_USER_DATA_PATTERN
  );
  assert.match(
    JSON.stringify(getSampleFindingById("fingerprinting_related_signals_observed")?.payload),
    /does not determine persistent fingerprint creation, personal identity, identity resolution, user singling-out/
  );
  assert.equal(getSampleFindingById("probable_fingerprinting")?.label, "Probable browser/device fingerprinting review signal");
  assert.equal(getSampleFindingById("probable_fingerprinting")?.payload.criticality, "critical");
  assert.doesNotMatch(
    JSON.stringify(getSampleFindingById("probable_fingerprinting")?.payload),
    PUBLIC_SAMPLE_USER_DATA_PATTERN
  );
  assert.match(JSON.stringify(getSampleFindingById("probable_fingerprinting")?.payload), /raw_values_not_retained/);
  assert.match(
    JSON.stringify(getSampleFindingById("probable_fingerprinting")?.payload),
    /clustered high-entropy browser\/device signal pattern that may warrant probable fingerprinting review/
  );
  assert.doesNotMatch(
    JSON.stringify(getSampleFindingById("probable_fingerprinting")?.payload),
    /strong enough to warrant probable fingerprinting review/
  );
  assert.match(
    JSON.stringify(getSampleFindingById("probable_fingerprinting")?.payload),
    /does not determine persistent fingerprint creation, personal identity, identity resolution, user singling-out, complete identity graph/
  );
  assert.equal(
    getSampleFindingById("cross_domain_identifier_sharing_observed")?.label,
    "Identifier-like values observed across domains"
  );
});
