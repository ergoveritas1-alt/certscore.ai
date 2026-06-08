import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicNanoDocumentExtraction, normalizeNanoDocumentExtraction } from "./nano-document-extraction";

test("normalizeNanoDocumentExtraction maps parsed nano output into policy-style fields", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText: "This privacy policy explains access and deletion rights. Contact privacy@example.com.",
    parsed: {
      policyAmbiguityScore: 61,
      policyCoverageRatio: 0.72,
      policyChildrenReference: "none",
      policyDsarMechanism: "partial",
      policyMentions: [{ topic: "gpc_disclosure" }],
      policyRightsSignals: ["access_request", "delete_request"],
      policySnippetCount: 4,
      policyStructurallyWeak: false,
      policySummaryShort: "Privacy policy discloses access and deletion rights.",
      policyTransferMechanisms: ["sccs"],
      policyRetentionPeriods: [{ period: "30 days", scope: "analytics logs" }],
      privacyContactChannelType: "email",
      semanticConfidence: 0.81
    },
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy"
    }
  });

  assert.equal(result.extractionStatus, "ready");
  assert.equal(result.extractedFields.page_type, "privacy_policy");
  assert.equal(result.extractedFields.page_url, "https://example.com/privacy");
  assert.equal(result.extractedFields.policy_dsar_mechanism, "partial");
  assert.equal(result.extractedFields.policy_ambiguity_score, 61);
  assert.equal(result.extractedFields.policy_coverage_ratio, 0.72);
  assert.deepEqual(result.extractedFields.policy_rights_signals, ["access_request", "delete_request"]);
  assert.equal(result.extractedFields.policy_snippet_count, 4);
  assert.equal(result.extractedFields.policy_structurally_weak, false);
  assert.deepEqual(result.extractedFields.policy_transfer_mechanisms, ["sccs"]);
  assert.equal(result.extractedFields.privacy_contact_channel_type, "email");
  assert.equal(result.semanticConfidence, 0.81);
});

test("normalizeNanoDocumentExtraction maps public AI disclosure semantics", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText:
      "Responsible AI Notice. Our AI-powered assistant helps users compare insurance options. Users are interacting with an automated assistant. Some summaries may be AI-generated. We use automated decision-making for recommendations, and you may request human review or appeal a decision.",
    parsed: {
      policySummaryShort: "Responsible AI notice."
    },
    row: {
      canonical_url: "https://example.com/responsible-ai",
      document_type: "ai_notice",
      title: "Responsible AI Notice"
    }
  });

  assert.equal(result.extractionStatus, "ready");
  assert.deepEqual(result.extractedFields.ai_feature_claims, [
    "ai_powered_feature",
    "chatbot_or_virtual_assistant",
    "generative_ai"
  ]);
  assert.equal(result.extractedFields.ai_interaction_disclosure_present, true);
  assert.equal(result.extractedFields.ai_transparency_notice_present, true);
  assert.equal(result.extractedFields.ai_generated_content_label_present, true);
  assert.equal(result.extractedFields.ai_automated_decision_disclosure_present, true);
  assert.equal(result.extractedFields.ai_human_review_path_present, true);
  assert.deepEqual(result.extractedFields.ai_sensitive_contexts, ["insurance"]);
});

test("normalizeNanoDocumentExtraction backfills strong mention topics and email contact from document text", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText:
      "We honor Global Privacy Control (GPC). We may use cookies and pixels for targeted advertising with advertising partners. Contact privacy@example.com for questions.",
    parsed: {
      policyMentions: [],
      policySummaryShort: "Privacy notice."
    },
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      title: "Privacy Notice"
    }
  });

  assert.equal(result.extractionStatus, "ready");
  assert.equal(result.extractedFields.privacy_contact_channel_type, "email");
  assert.deepEqual(result.extractedFields.policy_mentions, [
    { topic: "gpc_disclosure" },
    { topic: "tracking_technologies_disclosure" },
    { topic: "targeted_advertising_disclosure" },
    { topic: "third_party_advertising_disclosure" }
  ]);
});

test("buildDeterministicNanoDocumentExtraction keeps rendered policy-center text usable when LLM is unavailable", () => {
  const result = buildDeterministicNanoDocumentExtraction({
    documentText: `
      Klaviyo Privacy Policy. We collect personal data and personal information to provide our services.
      We use cookies and pixels for targeted advertising and analytics. We support Global Privacy Control.
      California residents may opt out of sale or sharing and may request access, deletion, correction, portability, and opt-out rights.
      Contact privacy@klaviyo.com for privacy questions. We retain personal data for as long as reasonably necessary.
    `.repeat(4),
    metadataReason: "openai_429",
    row: {
      canonical_url: "https://privacy.klaviyo.com/policies/?name=klaviyo-privacy-policy",
      document_type: "privacy_policy",
      title: "Klaviyo Privacy Policy"
    }
  });

  assert.equal(result.extractionStatus, "ready");
  assert.equal(result.metadata.extraction_mode, "deterministic_document_semantics");
  assert.equal(result.metadata.extraction_fallback_reason, "openai_429");
  assert.equal(result.extractedFields.policy_structurally_weak, false);
  assert.equal(result.extractedFields.policy_snippet_count, 1);
  assert.equal(result.extractedFields.policy_coverage_ratio, 0.62);
  assert.deepEqual(result.extractedFields.policy_mentions, [
    { topic: "gpc_disclosure" },
    { topic: "tracking_technologies_disclosure" },
    { topic: "targeted_advertising_disclosure" }
  ]);
  assert.ok((result.extractedFields.policy_rights_signals as string[]).includes("access_request"));
});

test("normalizeNanoDocumentExtraction infers transfer, rights, do-not-sell, and cookie table structure from document text", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText: `
      We support Global Privacy Control and opt-out preference signals.
      California residents may use the Do Not Sell or Share My Personal Information link.
      You may request access, deletion, correction, portability, and opt-out rights by contacting privacy@example.com.
      We transfer personal data pursuant to the Data Privacy Framework.
      google.com _ga, _gid Third Party
      bizible.js _biz_nA, _biz_flagsA First Party
      We do not knowingly collect data from children under 16.
    `,
    parsed: {
      policyMentions: [],
      policyRightsSignals: [],
      policyTransferMechanisms: [],
      policyDoNotSell: "unknown",
      policyChildrenReference: "unknown",
      policyCookieDisclosures: [],
      policySummaryShort: "Privacy notice."
    },
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      title: "Privacy Notice"
    }
  });

  assert.deepEqual(result.extractedFields.policy_transfer_mechanisms, ["dpf"]);
  assert.deepEqual(result.extractedFields.policy_rights_signals, [
    "access_request",
    "delete_request",
    "correction_request",
    "portability_request",
    "opt_out_request"
  ]);
  assert.equal(result.extractedFields.policy_do_not_sell, "present_text");
  assert.equal(result.extractedFields.policy_children_reference, "under_16");
  assert.equal(Array.isArray(result.extractedFields.policy_cookie_disclosures), true);
  assert.equal((result.extractedFields.policy_cookie_disclosures as unknown[]).length >= 2, true);
});

test("normalizeNanoDocumentExtraction treats substantive terms disclaimers as ready semantics", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText: `
      Terms of Use. Laws vary by state and are constantly changing. As a result, we make no representation, warranty or guarantee as to the accuracy, applicability or reliability of the information on this site.
      By accessing alz.org, you are agreeing to the foregoing, and assume all associated risks, and, to the fullest extent allowed by law waive all rights to sue or seek to hold the Alzheimer's Association liable for any matter arising from or related to your use of alz.org.
      The Alzheimer's Association retains copyright on the content of this site unless otherwise noted.
    `,
    parsed: {},
    row: {
      canonical_url: "https://www.alz.org/about/terms-of-use",
      document_type: "terms_of_service",
      title: "Terms of Use"
    }
  });

  assert.equal(result.extractionStatus, "ready");
  assert.deepEqual(result.extractedFields.policy_actionable_flags, [
    "warranty_disclaimer_present",
    "liability_waiver_present",
    "content_use_restrictions_present"
  ]);
  assert.match(
    String(result.extractedFields.policy_summary_short),
    /warranty|waive all rights to sue|copyright/i
  );
});

test("normalizeNanoDocumentExtraction infers retention disclosure from criteria-based retention language and explicit periods", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText:
      "How Is Your Personal Information Retained? We retain your personal information for as long as reasonably necessary to fulfill the purposes described in this Privacy Policy or for the period legally permitted or required. The retention period varies based on a number of factors, including Guest needs, business needs, legal obligations, potential risks of harm, and information type. Biometric information will be deleted within 3 years of your last interaction with us. ALPR information is stored for approximately 30 days before it is permanently deleted.",
    parsed: {},
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      title: "Privacy Policy"
    }
  });

  const retention = Array.isArray(result.extractedFields.policy_retention_periods)
    ? result.extractedFields.policy_retention_periods
    : [];

  assert.equal(retention.length > 0, true);
  assert.equal(retention.some((entry) => typeof entry === "string" && entry.includes("3 years")), true);
  assert.equal(retention.some((entry) => typeof entry === "string" && entry.includes("30 days")), true);
  assert.equal(
    retention.some(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        (entry as Record<string, unknown>).basis === "criteria_based"
    ),
    true
  );
});

test("normalizeNanoDocumentExtraction scopes retention periods to retention sections", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText:
      "Promotional offer valid for 12 months. Loyalty points expire after 18 years in this synthetic example. How Is Your Personal Information Retained? We retain your personal information for as long as reasonably necessary to fulfill the purposes described in this Privacy Policy. The retention period varies based on a number of factors, including Guest needs, business needs, legal obligations, potential risks of harm, and information type. Biometric information will be deleted within 3 years of your last interaction with us. ALPR information is stored for approximately 30 days before it is permanently deleted.",
    parsed: {},
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      title: "Privacy Policy"
    }
  });

  const retention = Array.isArray(result.extractedFields.policy_retention_periods)
    ? result.extractedFields.policy_retention_periods
    : [];
  const periodStrings = retention.filter((entry): entry is string => typeof entry === "string");

  assert.equal(periodStrings.includes("12 months"), false);
  assert.equal(periodStrings.includes("18 years"), false);
  assert.equal(periodStrings.includes("3 years"), true);
  assert.equal(periodStrings.includes("30 days"), true);
});

test("normalizeNanoDocumentExtraction infers retention disclosure from 'how long do we keep' prose", () => {
  const result = normalizeNanoDocumentExtraction({
    documentText:
      "How long do we keep your Personal Data? We may retain your Personal Data for a period of time consistent with the original purpose of collection or as long as required to fulfill our legal and regulatory obligations. After expiry of the applicable retention periods, your Personal Data will be deleted.",
    parsed: {},
    row: {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      title: "Privacy Statement"
    }
  });

  const retention = Array.isArray(result.extractedFields.policy_retention_periods)
    ? result.extractedFields.policy_retention_periods
    : [];

  assert.equal(retention.length > 0, true);
  assert.equal(
    retention.some(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        (entry as Record<string, unknown>).basis === "criteria_based"
    ),
    true
  );
});
