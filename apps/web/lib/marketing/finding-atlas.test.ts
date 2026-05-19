import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getFindingReferenceItems } from "./finding-atlas";
import { CERT_SCORE_FINDING_REGISTRY } from "../scans/finding-registry";
import {
  getFindingReferencePageCopy,
  getFindingReferencePath,
  getReferenceNotes
} from "../../app/findings/findings-reference-page";
import { getWhyThisMattersCopy } from "../../components/marketing/findings/finding-atlas-browser";

const PROHIBITED_OVERCLAIM_PATTERNS = [
  /\bviolation\b/i,
  /\billegal\b/i,
  /\bnon-compliant\b/i,
  /\bproves\b/i,
  /\bcertifies compliance\b/i,
  /\bdetermines compliance\b/i,
  /\blegal determination\b/i,
  /\bguaranteed\b/i,
  /\bdefinitive\b/i
];

function stripAllowedCaveats(value: string) {
  return value
    .replace(/not a legal conclusion, certification, or compliance determination/gi, "")
    .replace(/not (?:a )?(?:CPRA )?legal determination/gi, "")
    .replace(/does not determine legal status/gi, "")
    .replace(/does not determine deception, unfairness, or legal status/gi, "");
}

const PUBLIC_SAMPLE_HYGIENE_PATTERN =
  /surface_priority|appeared_in_executive_summary|regulatory_lanes|normalized_concern_ids|concern_policy_rule_ids|policy_anchors|conflict_bridge|privacy\.preconsent_tracking_detected|Production finding corpus|scan_id|fxvipsignals\.com|e54bf2cf|preconsent_violation_count|partial_scan|fullQuery|full_query|cookieValue|cookie_value|payloadBody|sensitivePayload|personalData/i;

const PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN =
  /surface_priority|appeared_in_executive_summary|regulatory_lanes|normalized_concern_ids|concern_policy_rule_ids|policy_anchors|conflict_bridge|scan_id|screenshot|rawDom|raw_dom|outerHTML|innerHTML|fxvipsignals\.com|e54bf2cf|fullQuery|full_query|cookieValue|cookie_value|payloadBody|sensitivePayload|personalData/i;

const PUBLIC_SAMPLE_USER_DATA_PATTERN =
  /\b(?:userData|personalData|userEnteredValue|user_entered_value|userValue|user_value|emailAddress|email_address|phoneNumber|phone_number|fullName|full_name|firstName|first_name|lastName|last_name|ssn|dob)\b|(?:^|["&?;\s])(?:email|phone|full_name|first_name|last_name|ssn|dob)=/i;

const REAL_PRE_CONSENT_SAMPLE_DOMAIN_PATTERN =
  /google-analytics\.com|googletagmanager\.com|Google Analytics|Google Tag Manager/i;

const ACCESSIBILITY_BATCH_FINDING_IDS = [
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "keyboard_navigation_accessibility_issue"
] as const;

const CONSENT_UI_BATCH_FINDING_IDS = [
  "reject_option_missing_or_hidden",
  "forced_consent_interaction",
  "asymmetric_consent_ui",
  "consent_dark_patterns_detected"
] as const;

const RUNTIME_TRACKING_BATCH_FINDING_IDS = [
  "third_party_cookie_pre_consent",
  "reject_tracking_persists_after_reject",
  "rtb_cookie_sync_observed",
  "cross_domain_identifier_sharing_observed"
] as const;

const SESSION_REPLAY_BATCH_FINDING_IDS = [
  "session_recording_services_detected",
  "possible_session_replay_on_sensitive_input_surface",
  "sensitive_data_collection_with_third_party_tracking_present"
] as const;

const FINGERPRINTING_BATCH_FINDING_IDS = [
  "fingerprinting_related_signals_observed",
  "probable_fingerprinting"
] as const;

const REVIEWED_FINDING_REFERENCE_IDS = [
  "pre_consent_tracking_detected",
  "visual_contrast_accessibility_issue",
  ...ACCESSIBILITY_BATCH_FINDING_IDS,
  ...CONSENT_UI_BATCH_FINDING_IDS,
  ...RUNTIME_TRACKING_BATCH_FINDING_IDS,
  ...SESSION_REPLAY_BATCH_FINDING_IDS,
  ...FINGERPRINTING_BATCH_FINDING_IDS,
  "cpra_cba_opt_out_missing"
] as const;

function makePublicHiddenSampleJson(finding: ReturnType<typeof getFindingReferenceItems>[number]) {
  const payload = finding.sample.payload as Record<string, unknown>;
  const confidence = typeof payload.confidence === "string" ? payload.confidence : "review";
  const directVsInferred = typeof payload.direct_vs_inferred === "string" ? payload.direct_vs_inferred : "observation";

  return {
    findingId: finding.id,
    label: finding.title,
    category: finding.category,
    criticality: finding.criticality,
    confidence,
    directVsInferred,
    evidence: {
      summary: finding.observed,
      examples: finding.exampleEvidence.map((example) => ({
        title: example.title,
        lines: example.code.split("\n")
      }))
    }
  };
}

test("homepage finding examples align with each finding subtype", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

  assert.match(findings.get("pre_consent_tracking_detected")?.exampleEvidence[0]?.code ?? "", /supporting_context_only/);
  assert.match(findings.get("pre_consent_tracking_detected")?.exampleEvidence[0]?.code ?? "", /classified_non_essential/);
  assert.match(findings.get("visual_contrast_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=color-contrast/);
  assert.match(findings.get("semantic_labeling_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=label/);
  assert.match(findings.get("text_alternative_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=image-alt/);
  assert.match(findings.get("keyboard_navigation_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=keyboard/);
  assert.match(findings.get("third_party_cookie_pre_consent")?.exampleEvidence[0]?.code ?? "", /artifact=storage_001/);
  assert.match(findings.get("reject_tracking_persists_after_reject")?.exampleEvidence[0]?.code ?? "", /artifact=req_002/);
  assert.match(findings.get("rtb_cookie_sync_observed")?.exampleEvidence[0]?.code ?? "", /artifact=req_003/);
  assert.match(findings.get("cross_domain_identifier_sharing_observed")?.exampleEvidence[0]?.code ?? "", /artifact=req_004/);
  assert.match(findings.get("session_recording_services_detected")?.exampleEvidence[0]?.code ?? "", /artifact=req_005/);
  assert.match(findings.get("possible_session_replay_on_sensitive_input_surface")?.exampleEvidence[0]?.code ?? "", /artifact=replay_sensitive_001/);
  assert.match(findings.get("sensitive_data_collection_with_third_party_tracking_present")?.exampleEvidence[0]?.code ?? "", /artifact=sensitive_tracking_001/);
  assert.match(findings.get("fingerprinting_related_signals_observed")?.exampleEvidence[0]?.code ?? "", /artifact=fingerprint_related_001/);
  assert.match(findings.get("probable_fingerprinting")?.exampleEvidence[0]?.code ?? "", /artifact=fingerprint_cluster_001/);
  assert.match(findings.get("reject_option_missing_or_hidden")?.exampleEvidence[0]?.code ?? "", /artifact=consent_ui_001/);
  assert.match(findings.get("forced_consent_interaction")?.exampleEvidence[0]?.code ?? "", /artifact=consent_ui_002/);
  assert.match(findings.get("asymmetric_consent_ui")?.exampleEvidence[0]?.code ?? "", /artifact=consent_ui_003/);
  assert.match(findings.get("consent_dark_patterns_detected")?.exampleEvidence[0]?.code ?? "", /artifact=consent_ui_004/);
});

test("homepage finding samples use the active finding id and label", () => {
  for (const finding of getFindingReferenceItems()) {
    const payload = finding.sample.payload;
    const payloadFindingId = payload.finding_id ?? payload.findingId ?? payload.id;
    const payloadLabel = payload.finding_label ?? payload.label ?? payload.title;

    assert.equal(finding.sample.findingId, finding.id, `${finding.id} sample id should match finding id`);
    assert.equal(payloadFindingId, finding.id, `${finding.id} payload id should match finding id`);
    assert.equal(finding.sample.label, finding.title, `${finding.id} sample label should match finding title`);
    assert.equal(payloadLabel, finding.title, `${finding.id} payload label should match finding title`);
  }
});

test("finding atlas related ids resolve to registry entries", () => {
  const registryIds = new Set(Object.values(CERT_SCORE_FINDING_REGISTRY).map((definition) => definition.id));

  for (const finding of getFindingReferenceItems()) {
    for (const relatedFindingId of finding.relatedFindingIds) {
      assert.ok(
        registryIds.has(relatedFindingId),
        `${finding.id} relatedFindingId ${relatedFindingId} should exist in the finding registry`
      );
    }
  }
});

test("prohibited overclaiming patterns do not match harmless substrings", () => {
  const harmless = "Automated evidence may not determine whether remediation improves the experience.";
  const provesPattern = PROHIBITED_OVERCLAIM_PATTERNS.find((pattern) => pattern.source.includes("proves"));

  assert.ok(provesPattern);
  assert.doesNotMatch(harmless, provesPattern);
  assert.match("This proves compliance.", provesPattern);
});

test("pre-consent atlas copy keeps evidence and regulatory caveats explicit", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "pre_consent_tracking_detected");

  assert.ok(finding);
  assert.match(finding.observed, /classified non-essential/);
  assert.match(finding.observed, /prior consent state associated with that purpose/);
  assert.doesNotMatch(finding.observed, /authorizing that purpose/);
  assert.match(finding.detectionMethodology, /tag manager/);
  assert.match(finding.detectionMethodology, /vendor name alone/);
  assert.match(finding.detectionMethodology, /request or storage artifact, including vendor attribution where available/);
  assert.doesNotMatch(finding.detectionMethodology, /vendor-attributed runtime event/);
  assert.doesNotMatch(finding.reviewQuestions.join("\n"), /vendor-attributed event/);
  assert.match(finding.reviewQuestions.join("\n"), /vendor attribution where available/);
  assert.match(finding.confidenceSemantics, /consent timing/);
  assert.match(finding.confidenceSemantics, /non-essential request or storage classification/);
  assert.match(finding.confidenceSemantics, /runtime anchors/);
  assert.match(finding.confidenceSemantics, /usable coverage/);
  assert.doesNotMatch(finding.confidenceSemantics, /vendor alone|vendor, request|post-interaction/i);
  assert.ok(finding.evidenceStandard);
  assert.match(finding.evidenceStandard.strong.join(" "), /Consent timeline sequence/);
  assert.match(finding.evidenceStandard.auditOnly.join(" "), /tag manager/);
  assert.match(finding.evidenceStandard.insufficient.join(" "), /Snapshot booleans/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /query_redacted=true/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /value_redacted=true/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /observed_prior_consent_state_for_purpose=false/);
  assert.doesNotMatch(finding.exampleEvidence.map((example) => example.code).join("\n"), /authorized_prior_consent_state_observed/);
  assert.ok(
    finding.limitations.some((limitation) => /not a legal conclusion, certification, or compliance determination/i.test(limitation))
  );
  assert.ok(
    finding.limitations.some((limitation) => /tag manager, vendor name, policy disclosure, or cookie name is not enough by itself/i.test(limitation))
  );
  assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /may be relevant to consent timing/);
  assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status/);
});

test("finding atlas browser renders evidence standards from atlas data", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.match(source, /function EvidenceStandard\(\{ finding \}/);
  assert.match(source, /const \{ evidenceStandard: standard \} = finding/);
  assert.match(source, /<section className="space-y-3">[\s\S]*<EvidenceExampleCards examples=\{finding\.exampleEvidence\} \/>[\s\S]*<\/section>[\s\S]*<RegulatoryReviewContext finding=\{finding\} \/>[\s\S]*<EvidenceStandard finding=\{finding\} \/>[\s\S]*Common causes/);
  assert.match(source, /<summary[\s\S]*View redacted sample JSON/);
  assert.match(source, /<summary[\s\S]*Hide redacted sample JSON/);
  assert.match(source, /<EvidenceExampleCards examples=\{finding\.exampleEvidence\} \/>[\s\S]*<details id=\{`\$\{finding\.id\}-example-json`\}/);
  assert.doesNotMatch(source, /Vendor or request activity before consent/);
});

test("reviewed finding reference pages render populated header and why-this-matters copy", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

  for (const findingId of REVIEWED_FINDING_REFERENCE_IDS) {
    const finding = findings.get(findingId);

    assert.ok(finding, `${findingId} should exist in the finding atlas`);

    const copy = getFindingReferencePageCopy(finding);
    const whyThisMatters = getWhyThisMattersCopy(finding);
    const renderedText = [
      "Finding reference",
      finding.title,
      copy.pageDescription,
      "Observed",
      finding.observed,
      "Why this matters",
      whyThisMatters
    ].join("\n");

    assert.ok(finding.title.trim().length > 0, `${findingId} title should be populated`);
    assert.ok(copy.pageDescription.trim().length > 0, `${findingId} page description should be populated`);
    assert.ok(whyThisMatters.trim().length > 0, `${findingId} why-this-matters copy should be populated`);
    assert.doesNotMatch(renderedText, /\bundefined\b/, `${findingId} rendered reference text should not contain undefined`);
    assert.ok(renderedText.indexOf("Observed") < renderedText.indexOf("Why this matters"), `${findingId} should render Observed before Why this matters`);
  }
});

test("finding atlas index groups all reviewed findings with registry context", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");
  const pageSource = readFileSync("apps/web/app/findings/findings-reference-page.tsx", "utf8");

  assert.match(pageSource, /CertScore's findings registry explains the automated observations/);
  assert.match(pageSource, /How to read a finding/);
  assert.match(pageSource, /Findings are automated public-web observations for review/);
  assert.match(pageSource, /finding references are reviewed periodically/);
  assert.match(source, /Consent and choice architecture/);
  assert.match(source, /Third-party tracking and adtech/);
  assert.match(source, /Fingerprinting and device signals/);
  assert.match(source, /Privacy choice \/ CPRA/);
  assert.match(source, /finding\.category[\s\S]*formatChipLabel\(finding\.criticality\)[\s\S]*finding\.benchmark\.contextLabel/);

  for (const findingId of REVIEWED_FINDING_REFERENCE_IDS) {
    assert.match(source, new RegExp(findingId), `${findingId} should be present in the grouped registry index`);
  }
});

test("reference notes include content currency note", () => {
  for (const finding of getFindingReferenceItems()) {
    assert.match(getReferenceNotes(finding).join("\n"), /Finding reference content is reviewed periodically/);
  }
});

test("finding atlas browser uses family-aware evidence footer text", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.match(source, /Evidence levels explain how CertScore treats retained accessibility artifacts\. They are not legal conclusions\./);
  assert.match(source, /Evidence levels explain how CertScore treats retained consent-surface artifacts\. They are not legal conclusions\./);
  assert.match(source, /Evidence levels explain how CertScore treats retained runtime artifacts\. They are not legal conclusions\./);
  assert.match(source, /Evidence levels explain how CertScore treats retained public-surface and runtime artifacts\. They are not legal conclusions\./);
});

test("finding atlas browser uses clearer regulatory labels", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.match(source, /Legal and regulatory frameworks/);
  assert.match(source, /More context in reference notes/);
  assert.match(source, /Additional framework context appears in the Reference notes section near the bottom of this page/);
  assert.doesNotMatch(source, />Technical standards</);
  assert.doesNotMatch(source, /Additional context in notes/);
});

test("fingerprinting relationship callouts render only for the fingerprinting pair", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.match(source, /FINGERPRINTING_RELATIONSHIP_COPY/);
  assert.match(source, /lower-tier fingerprinting\/device-signal review signal/);
  assert.match(source, /higher-tier fingerprinting\/device-signal review signal/);
  assert.match(source, /const copy = FINGERPRINTING_RELATIONSHIP_COPY\[finding\.id\]/);
});

test("common remediation approaches and prevalence notes are targeted", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");
  const remediationIds = [
    "pre_consent_tracking_detected",
    "reject_tracking_persists_after_reject",
    "rtb_cookie_sync_observed",
    "probable_fingerprinting",
    "sensitive_data_collection_with_third_party_tracking_present"
  ];
  const prevalenceIds = [
    "pre_consent_tracking_detected",
    "reject_tracking_persists_after_reject",
    "rtb_cookie_sync_observed",
    "probable_fingerprinting"
  ];

  assert.match(source, /Common remediation approaches/);
  assert.match(source, /PREVALENCE_INTERPRETATION_NOTES/);
  for (const findingId of remediationIds) {
    assert.match(source, new RegExp(`${findingId}:`), `${findingId} should have remediation guidance`);
  }
  for (const findingId of prevalenceIds) {
    assert.match(source, new RegExp(`${findingId}:`), `${findingId} should have a prevalence interpretation note`);
  }
});

test("finding atlas browser uses context-aware related reading", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.match(source, /function getRelatedReadingLinks\(finding: FindingReferenceItem\)/);
  assert.match(source, /finding\.category === "Accessibility"[\s\S]*ACCESSIBILITY_RELATED_READING/);
  assert.match(source, /ACCESSIBILITY_RELATED_READING = \[[\s\S]*\/guides\/wcag-website-checklist[\s\S]*Accessibility signals[\s\S]*\]/);
  assert.doesNotMatch(source, /ACCESSIBILITY_RELATED_READING = \[[\s\S]*Tracking before consent[\s\S]*\]/);
  assert.doesNotMatch(source, /ACCESSIBILITY_RELATED_READING = \[[\s\S]*Cookie consent enforcement[\s\S]*\]/);
  assert.doesNotMatch(source, /ACCESSIBILITY_RELATED_READING = \[[\s\S]*Third-party cookies and RTB sync[\s\S]*\]/);
  assert.match(source, /PRIVACY_RELATED_READING = \[[\s\S]*Tracking before consent[\s\S]*Cookie consent enforcement[\s\S]*Third-party cookies and RTB sync[\s\S]*Session replay risk/);
  assert.match(source, /TRACKING_RELATED_READING = \[[\s\S]*Tracking before consent[\s\S]*Cookie consent enforcement[\s\S]*Third-party cookies before consent[\s\S]*Third-party cookies and RTB sync[\s\S]*\]/);
  assert.match(source, /finding\.category === "Cookies" \|\| finding\.category === "Third-party tracking"[\s\S]*TRACKING_RELATED_READING/);
  assert.match(source, /!\s*compact && relatedReadingLinks\.length > 0/);
});

test("pre-consent criticality badge is derived from atlas criticality", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "pre_consent_tracking_detected");
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.equal(finding?.criticality, "high");
  assert.match(source, /const severityLabel = formatChipLabel\(finding\.criticality\);/);
  assert.doesNotMatch(source, /pre_consent_tracking_detected"[\s\S]{0,120}\?\s*"Critical"/);
});

test("pre-consent public sample payload uses sanitized illustrative evidence", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "pre_consent_tracking_detected");

  assert.ok(finding);

  const serializedPayload = JSON.stringify(finding.sample.payload);
  const serializedHiddenSampleJson = JSON.stringify(makePublicHiddenSampleJson(finding));
  const renderedExampleEvidence = finding.exampleEvidence.map((example) => example.code).join("\n");

  assert.match(serializedPayload, /example\.com/);
  assert.match(serializedPayload, /tagmanager\.example/);
  assert.match(serializedPayload, /analytics\.example/);
  assert.match(serializedPayload, /preConsentTrackingRequestCount/);
  assert.match(serializedPayload, /queryRedacted|query_redacted/);
  assert.match(serializedPayload, /valueRedacted|value_redacted/);
  assert.match(serializedPayload, /finding_supporting_artifact/);
  assert.match(serializedPayload, /supporting_context_only/);
  assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
  assert.doesNotMatch(serializedPayload, REAL_PRE_CONSENT_SAMPLE_DOMAIN_PATTERN);
  assert.doesNotMatch(serializedHiddenSampleJson, REAL_PRE_CONSENT_SAMPLE_DOMAIN_PATTERN);
  assert.doesNotMatch(renderedExampleEvidence, REAL_PRE_CONSENT_SAMPLE_DOMAIN_PATTERN);
  assert.doesNotMatch(serializedPayload, /preconsent_violation_count/);
  assert.doesNotMatch(serializedPayload, /fxvipsignals\.com|e54bf2cf/);
  assert.doesNotMatch(serializedPayload, /partial_scan|incomplete_pages/);
  assert.doesNotMatch(serializedPayload, /"runtime_anchors":\s*\[\s*\]/);
  assert.doesNotMatch(JSON.stringify(finding.sample), PUBLIC_SAMPLE_HYGIENE_PATTERN);
});

test("pre-consent example timeline labels distinguish context from finding evidence", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.match(source, /Example Tag Manager loaded[\s\S]*supporting context only/);
  assert.match(source, /Example Analytics collect request fired[\s\S]*classified non-essential artifact/);
});

test("evidence standards are present for reviewed template findings only", () => {
  const findings = getFindingReferenceItems();
  const pilot = findings.find((finding) => finding.id === "pre_consent_tracking_detected");
  const contrast = findings.find((finding) => finding.id === "visual_contrast_accessibility_issue");

  assert.ok(pilot?.evidenceStandard);
  assert.ok(contrast?.evidenceStandard);
  assert.deepEqual(Object.keys(contrast.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  for (const findingId of ACCESSIBILITY_BATCH_FINDING_IDS) {
    const finding = findings.find((item) => item.id === findingId);

    assert.ok(finding?.evidenceStandard, `${findingId} should have an evidence standard`);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  }
  for (const findingId of CONSENT_UI_BATCH_FINDING_IDS) {
    const finding = findings.find((item) => item.id === findingId);

    assert.ok(finding?.evidenceStandard, `${findingId} should have an evidence standard`);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  }
  for (const findingId of RUNTIME_TRACKING_BATCH_FINDING_IDS) {
    const finding = findings.find((item) => item.id === findingId);

    assert.ok(finding?.evidenceStandard, `${findingId} should have an evidence standard`);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  }
  for (const findingId of SESSION_REPLAY_BATCH_FINDING_IDS) {
    const finding = findings.find((item) => item.id === findingId);

    assert.ok(finding?.evidenceStandard, `${findingId} should have an evidence standard`);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  }
  for (const findingId of FINGERPRINTING_BATCH_FINDING_IDS) {
    const finding = findings.find((item) => item.id === findingId);

    assert.ok(finding?.evidenceStandard, `${findingId} should have an evidence standard`);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  }
});

test("accessibility batch findings use the approved evidence-first template", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

  for (const findingId of ACCESSIBILITY_BATCH_FINDING_IDS) {
    const finding = findings.get(findingId);

    assert.ok(finding, `${findingId} should exist`);
    assert.equal(finding.id, findingId);
    assert.equal(finding.category, "Accessibility");
    assert.equal(finding.criticality, "medium");
    assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
    assert.notEqual(finding.benchmark.sourceLabel, "Illustrative public evidence sample");
    assert.match(finding.observed, /Retained automated accessibility evidence/);
    assert.match(finding.detectionMethodology, /retains representative automated accessibility evidence/i);
    assert.match(finding.detectionMethodology, /does not infer full WCAG conformance or non-conformance/);
    assert.match(finding.confidenceSemantics, /Good when representative automated/);
    assert.match(finding.confidenceSemantics, /Manual review is still needed/);
    assert.ok(finding.evidenceStandard);
    assert.match(finding.evidenceStandard.strong.join(" "), /rule ID, affected selector or element reference, page URL/);
    assert.match(finding.evidenceStandard.good.join(" "), /selector or element reference, page URL, impact label/);
    assert.match(finding.evidenceStandard.auditOnly.join(" "), /retained evidence lacks enough detail|automated evidence is incomplete/);
    assert.match(finding.evidenceStandard.insufficient.join(" "), /Selector alone without rule ID/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /role=finding_supporting_artifact/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /https:\/\/example\.com\//);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /\[data-example-component=/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /manual_review_needed=true|manual_keyboard_review_needed=true/);
    assert.ok(finding.commonCauses.length >= 5);
    assert.ok(finding.reviewQuestions.length >= 9);
    assert.ok(finding.limitations.length >= 7);
    assert.match(finding.limitations.join("\n"), /not a legal conclusion, certification, or determination of WCAG conformance or non-conformance/);
    assert.match(finding.limitations.join("\n"), /Manual .*review is needed|Manual keyboard review is needed/);
    assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /WCAG-oriented accessibility review/);
    assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status or WCAG conformance/);
    assert.match(getReferenceNotes(finding).join("\n"), /Automated accessibility evidence can support WCAG-oriented review/);
    assert.doesNotMatch(getReferenceNotes(finding).join("\n"), /EDPB consent guidance|CNIL cookie\/tracker/);
    assert.equal(finding.sample.payload.observed, finding.observed);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_HYGIENE_PATTERN);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
  }
});

test("accessibility batch public samples do not expose screenshots or internal sample evidence", () => {
  for (const findingId of ACCESSIBILITY_BATCH_FINDING_IDS) {
    const finding = getFindingReferenceItems().find((item) => item.id === findingId);

    assert.ok(finding);

    const serializedSamplePayload = JSON.stringify(finding.sample.payload);
    const serializedEvidenceStandard = JSON.stringify(finding.evidenceStandard ?? {});

    assert.match(serializedSamplePayload, /example\.com/);
    assert.doesNotMatch(serializedSamplePayload, PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
    assert.doesNotMatch(serializedSamplePayload, /https?:\/\/[^"]+\?[^"]+/);

    if (findingId === "text_alternative_accessibility_issue") {
      assert.doesNotMatch(serializedSamplePayload, /screenshot/i);
      assert.match(serializedEvidenceStandard, /screenshot/i);
    }
  }
});

test("consent UI batch findings use the approved evidence-first template", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

  for (const findingId of CONSENT_UI_BATCH_FINDING_IDS) {
    const finding = findings.get(findingId);

    assert.ok(finding, `${findingId} should exist`);
    assert.equal(finding.id, findingId);
    assert.ok(finding.category === "Consent" || finding.category === "Consumer protection");
    assert.equal(finding.criticality, "medium");
    assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
    assert.notEqual(finding.benchmark.sourceLabel, "Illustrative public evidence sample");
    assert.match(finding.observed, /Retained consent-surface evidence/);
    assert.match(finding.detectionMethodology, /retains representative .*consent-surface evidence|retains representative evidence for consent prompts/);
    assert.match(finding.detectionMethodology, /review signals/);
    assert.match(finding.confidenceSemantics, /Good when retained consent-surface evidence/);
    assert.match(finding.confidenceSemantics, /Manual review is still needed/);
    assert.ok(finding.evidenceStandard);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
    assert.match(finding.evidenceStandard.strong.join(" "), /Retained consent-surface evidence|Retained evidence/);
    assert.match(finding.evidenceStandard.good.join(" "), /manual review/);
    assert.match(finding.evidenceStandard.auditOnly.join(" "), /retained evidence|retained artifact/);
    assert.match(finding.evidenceStandard.insufficient.join(" "), /automated UI evidence|consent-surface evidence/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /role=finding_supporting_artifact/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /https:\/\/example\.com\//);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /manual_review_needed=true|manual review should confirm/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /insufficient_without|audit_only_without|not_a_finding_determination/);
    assert.ok(finding.commonCauses.length >= 5);
    assert.ok(finding.reviewQuestions.length >= 8);
    assert.ok(finding.limitations.length >= 6);
    assert.match(finding.limitations.join("\n"), /automated consent (?:UI|UX) review signal/);
    assert.match(finding.limitations.join("\n"), /not a legal conclusion, certification, compliance determination/);
    assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /may be relevant to consent/);
    assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status/);
    assert.equal(finding.sample.payload.observed, finding.observed);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_HYGIENE_PATTERN);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
  }

  const forcedConsent = findings.get("forced_consent_interaction");

  assert.ok(forcedConsent);
  assert.match(
    forcedConsent.detectionMethodology,
    /does not determine whether consent was freely given, and does not determine legal status, deception, unfairness, consent validity, or compliance status/
  );
  assert.doesNotMatch(forcedConsent.exampleEvidence.map((example) => example.code).join("\n"), /accept_clicked_required/);
  assert.match(forcedConsent.exampleEvidence.map((example) => example.code).join("\n"), /interaction_required_claim/);
});

test("consent UI batch public copy avoids determinative choice-architecture claims", () => {
  for (const findingId of CONSENT_UI_BATCH_FINDING_IDS) {
    const finding = getFindingReferenceItems().find((item) => item.id === findingId);

    assert.ok(finding);

    const publicText = [
      finding.observed,
      finding.detectionMethodology,
      finding.confidenceSemantics,
      ...finding.exampleEvidence.flatMap((example) => [example.title, example.code]),
      JSON.stringify(finding.evidenceStandard ?? {}),
      ...finding.reviewQuestions,
      ...finding.limitations,
      finding.regulatoryContext?.primaryConcern.displayCopy,
      finding.regulatoryContext?.displayCaution,
      JSON.stringify(finding.sample.payload)
    ].filter(Boolean).join("\n");

    assert.doesNotMatch(publicText, /\bdeceptive\b/i);
    assert.doesNotMatch(publicText, /\bunlawful\b/i);
    assert.doesNotMatch(publicText, /\binvalid consent\b/i);
    assert.doesNotMatch(publicText, /\bnon-compliance\b/i);
    assert.doesNotMatch(publicText, /\bdark pattern(?!_label)/i);
    assert.match(publicText, /does not determine|not_a_finding_determination|manual review/);
  }
});

test("consent UI regulatory applicability copy stays review-oriented", () => {
  const findings = getFindingReferenceItems().filter((finding) =>
    CONSENT_UI_BATCH_FINDING_IDS.includes(finding.id as (typeof CONSENT_UI_BATCH_FINDING_IDS)[number])
  );

  for (const finding of findings) {
    const appliesWhenCopy = [
      ...(finding.regulatoryContext?.technicalStandards ?? []).map((item) => item.appliesWhen),
      ...(finding.regulatoryContext?.jurisdictionalContexts ?? []).map((item) => item.appliesWhen)
    ].join("\n");
    const regulatoryCopy = [
      finding.regulatoryContext?.primaryConcern.displayCopy,
      finding.regulatoryContext?.displayCaution,
      appliesWhenCopy
    ].filter(Boolean).join("\n");

    assert.doesNotMatch(appliesWhenCopy, /A banner offers accept on the first layer but no equivalent reject/i);
    assert.doesNotMatch(appliesWhenCopy, /Design choices may manipulate/i);
    assert.doesNotMatch(appliesWhenCopy, /^Reject is hidden/im);
    assert.doesNotMatch(appliesWhenCopy, /^The consent overlay blocks/im);
    assert.doesNotMatch(regulatoryCopy, /dark pattern detected/i);
    assert.doesNotMatch(regulatoryCopy, /\bdark pattern\b/i);
    assert.match(regulatoryCopy, /may|suggests|review|does not determine/i);
  }
});

test("consent UI related reading remains consent and privacy-choice specific", () => {
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.match(source, /CONSENT_RELATED_READING = \[[\s\S]*Tracking before consent[\s\S]*Cookie consent enforcement[\s\S]*Cookie banner requirements[\s\S]*\]/);
  assert.match(source, /finding\.category === "Consent" \|\| finding\.category === "Consumer protection"[\s\S]*CONSENT_RELATED_READING/);
  const consentRelatedReading = source.match(/const CONSENT_RELATED_READING = \[([\s\S]*?)\];/)?.[1] ?? "";

  assert.doesNotMatch(consentRelatedReading, /Accessibility signals/);
  assert.doesNotMatch(consentRelatedReading, /Third-party cookies and RTB sync/);
  assert.match(source, /retained consent-surface artifacts/);
});

test("CPRA privacy choice finding uses evidence-first public reference copy", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "cpra_cba_opt_out_missing");
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.ok(finding);
  assert.equal(finding.id, "cpra_cba_opt_out_missing");
  assert.equal(finding.title, "CPRA / privacy choice opt-out review signal");
  assert.notEqual(finding.title, "CPRA CBA opt-out missing");
  assert.equal(finding.category, "Disclosure gaps");
  assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
  assert.equal(finding.sample.payload.criticality, finding.criticality);
  assert.match(finding.observed, /Retained public-surface and runtime evidence/);
  assert.match(finding.observed, /cross-context behavioral advertising/);
  assert.match(finding.detectionMethodology, /does not determine legal status, CPRA applicability, sale\/share status, cross-context behavioral advertising status, opt-out failure, GPC handling, or compliance status/);
  assert.match(finding.confidenceSemantics, /Good when retained evidence includes advertising or sale\/share-related review signals/);
  assert.match(finding.confidenceSemantics, /Manual review is still needed/);
  assert.ok(finding.evidenceStandard);
  assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  assert.match(finding.evidenceStandard.strong.join(" "), /Retained evidence includes public page URL/);
  assert.match(finding.evidenceStandard.good.join(" "), /manual review/);
  assert.match(finding.evidenceStandard.auditOnly.join(" "), /retained evidence/);
  assert.match(finding.evidenceStandard.insufficient.join(" "), /Vendor name alone/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /artifact=privacy_choice_001/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /https:\/\/example\.com\/privacy/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /manual_review_needed=true|manual review should confirm/);
  assert.ok(finding.commonCauses.length >= 5);
  assert.ok(finding.reviewQuestions.length >= 9);
  assert.ok(finding.limitations.length >= 7);
  assert.equal(
    finding.limitations.filter(
      (limitation) => limitation === "Not detected means not observed in the scan scope; it is not proof of absence."
    ).length,
    1
  );
  assert.match(finding.limitations.join("\n"), /not a legal conclusion, certification, compliance determination/);
  assert.match(finding.limitations.join("\n"), /Manual review is needed/);
  assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /may be relevant to CPRA, opt-out, GPC, disclosure, consent, and vendor-governance review/);
  assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status, CPRA applicability, sale\/share status/);
  assert.match(getReferenceNotes(finding).join("\n"), /CPRA opt-out, Do Not Sell or Share, and privacy-choice obligations/);
  assert.doesNotMatch(getReferenceNotes(finding).join("\n"), /Automated accessibility evidence/);
  assert.equal(finding.sample.payload.observed, finding.observed);
  assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_HYGIENE_PATTERN);
  assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
  assert.match(source, /PRIVACY_CHOICE_RELATED_READING = \[[\s\S]*Cookie consent enforcement[\s\S]*Tracking before consent[\s\S]*Cookie banner requirements[\s\S]*Third-party cookies before consent[\s\S]*Privacy policy requirements[\s\S]*\]/);
  assert.match(source, /finding\.id === "cpra_cba_opt_out_missing"[\s\S]*PRIVACY_CHOICE_RELATED_READING/);

  const publicCopy = [
    finding.title,
    finding.observed,
    finding.detectionMethodology,
    finding.confidenceSemantics,
    ...finding.exampleEvidence.flatMap((example) => [example.title, example.code]),
    JSON.stringify(finding.evidenceStandard),
    ...finding.commonCauses,
    ...finding.reviewQuestions,
    ...finding.limitations,
    finding.regulatoryContext?.primaryConcern.displayCopy,
    finding.regulatoryContext?.displayCaution,
    JSON.stringify(finding.sample.payload)
  ].filter(Boolean).join("\n");
  const withoutNegativeCaveats = publicCopy
    .replace(/does not determine [^.]+\./gi, "")
    .replace(/not a legal conclusion, certification, compliance determination[^.]*\./gi, "");

  assert.doesNotMatch(publicCopy, /\bCBA\b/);
  assert.doesNotMatch(withoutNegativeCaveats, /\billegal\b|\bviolation\b|\bnon-compliant\b|\bproves\b|\bcertifies compliance\b|\bdetermines compliance\b|\bguaranteed\b|\bdefinitive\b/i);
  assert.doesNotMatch(withoutNegativeCaveats, /\bconfirms CCPA applicability\b|\bdetermines opt-out failure\b|\bGPC failure\b/i);
});

test("runtime tracking batch findings use sanitized evidence-first copy", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

  for (const findingId of RUNTIME_TRACKING_BATCH_FINDING_IDS) {
    const finding = findings.get(findingId);

    assert.ok(finding, `${findingId} should exist`);
    assert.equal(finding.id, findingId);
    assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
    assert.notEqual(finding.benchmark.sourceLabel, "Illustrative public evidence sample");
    assert.equal(finding.sample.payload.criticality, finding.criticality);
    assert.match(finding.observed, /Retained (?:runtime|network|outbound request) evidence/);
    assert.match(finding.detectionMethodology, /review signal/);
    assert.match(finding.confidenceSemantics, /Good when retained/);
    assert.match(finding.confidenceSemantics, /Manual review is still needed/);
    assert.ok(finding.evidenceStandard);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
    assert.match(finding.evidenceStandard.strong.join(" "), /Retained .*evidence/);
    assert.match(finding.evidenceStandard.good.join(" "), /manual review/);
    assert.match(finding.evidenceStandard.auditOnly.join(" "), /retained/);
    assert.match(finding.evidenceStandard.insufficient.join(" "), /Vendor name alone|Cookie name alone|Third-party request alone|Reject button exists/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /role=finding_supporting_artifact/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /https:\/\/example\.com\//);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /query_redacted=true|value_redacted=true|values_redacted=true/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /manual_review_needed=true|manual review should confirm/);
    assert.ok(finding.commonCauses.length >= 5);
    assert.ok(finding.reviewQuestions.length >= 9);
    assert.ok(finding.limitations.length >= 7);
    assert.match(finding.limitations.join("\n"), /not a legal conclusion, certification, compliance determination/);
    assert.match(finding.limitations.join("\n"), /Manual review is needed|require manual review|requires manual review/);
    assert.match(finding.limitations.join("\n"), /redacts or avoids retaining full query strings|redacts or avoids retaining full cookie values/);
    assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /may be relevant/);
    assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status/);
    assert.equal(finding.sample.payload.observed, finding.observed);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_HYGIENE_PATTERN);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
  }

  const thirdPartyCookie = findings.get("third_party_cookie_pre_consent");
  const crossDomain = findings.get("cross_domain_identifier_sharing_observed");

  assert.equal(thirdPartyCookie?.title, "Third-party cookie observed before consent");
  assert.notEqual(thirdPartyCookie?.title, "Tracking cookies set before consent");
  assert.equal(crossDomain?.title, "Identifier-like values observed across domains");
  assert.notEqual(crossDomain?.title, "Identifiers shared across domains");
});

test("runtime tracking public samples stay redacted and illustrative", () => {
  for (const findingId of RUNTIME_TRACKING_BATCH_FINDING_IDS) {
    const finding = getFindingReferenceItems().find((item) => item.id === findingId);

    assert.ok(finding);

    const serializedPayload = JSON.stringify(finding.sample.payload);

    assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
    assert.match(serializedPayload, /example\.com|\.example/);
    assert.match(serializedPayload, /query_redacted=true|value_redacted=true|values_redacted=true/);
    assert.doesNotMatch(serializedPayload, /marketwatch\.com|betterment\.com|abc\.com|doubleclick\.net|adnxs\.com|adsrvr\.org|demdex\.net|criteo\.com/i);
    assert.doesNotMatch(serializedPayload, /https?:\/\/[^"]+\?[^"]+/);
    assert.doesNotMatch(serializedPayload, /scan_id|fullQuery|full_query|cookieValue|cookie_value|payloadBody|sensitivePayload|personalData/i);
    assert.doesNotMatch(serializedPayload, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.doesNotMatch(serializedPayload, PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
  }
});

test("session replay and sensitive-surface batch uses sanitized evidence-first copy", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

  for (const findingId of SESSION_REPLAY_BATCH_FINDING_IDS) {
    const finding = findings.get(findingId);

    assert.ok(finding, `${findingId} should exist`);
    assert.equal(finding.id, findingId);
    assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
    assert.notEqual(finding.benchmark.sourceLabel, "Illustrative public evidence sample");
    assert.equal(finding.sample.payload.criticality, finding.criticality);
    assert.match(finding.observed, /Retained (?:runtime|page and runtime|runtime and page-surface) evidence/);
    assert.match(finding.detectionMethodology, /review signal/);
    assert.match(finding.confidenceSemantics, /Good when retained/);
    assert.match(finding.confidenceSemantics, /Manual review is still needed/);
    assert.ok(finding.evidenceStandard);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
    assert.match(finding.evidenceStandard.strong.join(" "), /Retained .*evidence/);
    assert.match(finding.evidenceStandard.good.join(" "), /manual review/);
    assert.match(finding.evidenceStandard.auditOnly.join(" "), /retained/);
    assert.match(finding.evidenceStandard.insufficient.join(" "), /Vendor name alone|Replay vendor name alone|Sensitive field label alone|Session replay vendor presence alone/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /role=finding_supporting_artifact/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /https:\/\/example\.com/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /query_redacted=true|values_not_retained|payload_values_retained=false/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /manual_review_needed=true|manual review should confirm/);
    assert.ok(finding.commonCauses.length >= 5);
    assert.ok(finding.reviewQuestions.length >= 9);
    assert.ok(finding.limitations.length >= 7);
    assert.match(finding.limitations.join("\n"), /not a legal conclusion, certification, compliance determination/);
    assert.match(finding.limitations.join("\n"), /Manual review is needed|requires manual review/);
    assert.match(finding.limitations.join("\n"), /redacts or avoids retaining full query strings|redacts or avoids retaining sensitive values/);
    assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /may be relevant/);
    assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status/);
    assert.equal(finding.sample.payload.observed, finding.observed);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_HYGIENE_PATTERN);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
  }

  assert.equal(findings.get("session_recording_services_detected")?.title, "Session replay service signal observed");
  assert.equal(
    findings.get("possible_session_replay_on_sensitive_input_surface")?.title,
    "Possible session replay near sensitive input surface"
  );
  assert.equal(
    findings.get("sensitive_data_collection_with_third_party_tracking_present")?.title,
    "Sensitive input surface with third-party tracking context"
  );
});

test("session replay and sensitive-surface copy avoids capture and legal overclaims", () => {
  for (const findingId of SESSION_REPLAY_BATCH_FINDING_IDS) {
    const finding = getFindingReferenceItems().find((item) => item.id === findingId);

    assert.ok(finding);

    const publicText = [
      finding.observed,
      finding.detectionMethodology,
      finding.confidenceSemantics,
      ...finding.exampleEvidence.flatMap((example) => [example.title, example.code]),
      JSON.stringify(finding.evidenceStandard ?? {}),
      ...finding.reviewQuestions,
      ...finding.limitations,
      finding.regulatoryContext?.primaryConcern.displayCopy,
      finding.regulatoryContext?.displayCaution,
      JSON.stringify(finding.sample.payload)
    ].filter(Boolean).join("\n");
    const withoutNegativeCaveats = publicText
      .replace(/does not determine [^.]+capture[^.]*\./gi, "")
      .replace(/does not show that [^.]+(?:captured|retained|transmitted|read)[^.]*\./gi, "")
      .replace(/Co-occurrence [^.]+does not determine [^.]+(?:captured|retained|transmitted|read)[^.]*\./gi, "")
      .replace(/Claims that [^.]+(?:captured|retained|transmitted|read)[^.]*\./gi, "");

    assert.doesNotMatch(withoutNegativeCaveats, /\b(?:proves?|confirms?|determines?) (?:keystroke|sensitive-value|screenshot|recording|form content|payload) capture\b/i);
    assert.doesNotMatch(withoutNegativeCaveats, /\b(?:sensitive values?|keystrokes?|screenshots?|full recordings?) (?:were|are) (?:captured|retained|transmitted|read)\b/i);
    assert.doesNotMatch(publicText, /\bunlawful tracking\b/i);
    assert.doesNotMatch(publicText, /\binvalid consent\b/i);
    assert.match(publicText, /does not determine|does not show|manual review/);
  }
});

test("session replay sensitive-surface micro-polish keeps visual capture wording precise", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));
  const possibleReplay = findings.get("possible_session_replay_on_sensitive_input_surface");
  const sensitiveTracking = findings.get("sensitive_data_collection_with_third_party_tracking_present");
  const browserSource = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.ok(possibleReplay);
  assert.ok(sensitiveTracking);

  const notDetectedLimitation = "Not detected means not observed in the scan scope; it is not proof of absence.";

  assert.equal(possibleReplay.limitations.filter((limitation) => limitation === notDetectedLimitation).length, 1);
  assert.equal(sensitiveTracking.limitations.filter((limitation) => limitation === notDetectedLimitation).length, 1);

  assert.match(browserSource, /visual-capture settings/);
  assert.doesNotMatch(
    browserSource,
    /Replay-related tooling near sensitive forms or flows can raise higher review priority because masking, event capture, screenshots, and page exclusions matter more/
  );

  const visibleExample = possibleReplay.exampleEvidence.map((example) => example.code).join("\n");
  const sampleJson = JSON.stringify(possibleReplay.sample.payload);
  const publicCopy = [
    possibleReplay.detectionMethodology,
    possibleReplay.limitations.join("\n"),
    possibleReplay.regulatoryContext?.displayCaution ?? ""
  ].join("\n");

  assert.match(visibleExample, /visual-capture settings/);
  assert.doesNotMatch(visibleExample, /masking, screenshots, keystroke capture/);
  assert.match(sampleJson, /visual-capture settings/);
  assert.doesNotMatch(sampleJson, /masking, screenshots, keystroke capture/);
  assert.match(publicCopy, /does not determine[^.]*screenshots|does not determine[^.]*screenshot capture/i);
  assert.match(publicCopy, /does not determine[^.]*keystrokes|does not determine[^.]*keystroke capture/i);
  assert.match(publicCopy, /does not determine[^.]*sensitive field values|does not determine[^.]*sensitive-value capture/i);
  assert.match(publicCopy, /does not determine[^.]*recordings|does not determine[^.]*recording retention/i);
});

test("fingerprinting batch findings use sanitized evidence-first copy", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));
  const browserSource = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  for (const findingId of FINGERPRINTING_BATCH_FINDING_IDS) {
    const finding = findings.get(findingId);

    assert.ok(finding, `${findingId} should exist`);
    assert.equal(finding.id, findingId);
    assert.equal(finding.category, "Fingerprinting");
    assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
    assert.notEqual(finding.benchmark.sourceLabel, "Illustrative public evidence sample");
    assert.equal(finding.sample.payload.criticality, finding.criticality);
    assert.match(finding.observed, /Retained runtime evidence/);
    assert.match(finding.detectionMethodology, /review signal/);
    assert.match(finding.confidenceSemantics, /Good when retained/);
    assert.match(finding.confidenceSemantics, /Manual review is still needed/);
    assert.ok(finding.evidenceStandard);
    assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
    assert.match(finding.evidenceStandard.strong.join(" "), /Retained runtime evidence/);
    assert.match(finding.evidenceStandard.good.join(" "), /manual review/);
    assert.match(finding.evidenceStandard.auditOnly.join(" "), /retained/);
    assert.match(finding.evidenceStandard.insufficient.join(" "), /Vendor name alone|Single generic browser or device attribute/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /role=finding_supporting_artifact/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /https:\/\/example\.com\//);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /raw_values_not_retained|query_redacted=true/);
    assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /manual_review_needed=true|manual review should confirm/);
    assert.ok(finding.commonCauses.length >= 5);
    assert.ok(finding.reviewQuestions.length >= 9);
    assert.ok(finding.limitations.length >= 6);
    assert.match(finding.limitations.join("\n"), /not a legal conclusion, certification, compliance determination/);
    assert.match(finding.limitations.join("\n"), /Manual review is needed/);
    assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /may be relevant|warrant probable fingerprinting review/);
    assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status/);
    assert.equal(finding.sample.payload.observed, finding.observed);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_HYGIENE_PATTERN);
    assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_PAYLOAD_LEAKAGE_PATTERN);
  }

  assert.equal(
    findings.get("fingerprinting_related_signals_observed")?.title,
    "Fingerprinting-related browser/device signals observed"
  );
  assert.equal(findings.get("probable_fingerprinting")?.title, "Probable browser/device fingerprinting review signal");
  assert.match(browserSource, /FINGERPRINTING_RELATED_READING = \[[\s\S]*Website fingerprinting[\s\S]*Tracking before consent[\s\S]*Third-party cookies before consent[\s\S]*Third-party cookies and RTB sync[\s\S]*\]/);
  const fingerprintingRelatedReading = browserSource.match(/const FINGERPRINTING_RELATED_READING = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.doesNotMatch(fingerprintingRelatedReading, /Accessibility signals|WCAG/i);
});

test("fingerprinting batch copy avoids identity and legal overclaims", () => {
  for (const findingId of FINGERPRINTING_BATCH_FINDING_IDS) {
    const finding = getFindingReferenceItems().find((item) => item.id === findingId);

    assert.ok(finding);

    const publicText = [
      finding.observed,
      finding.detectionMethodology,
      finding.confidenceSemantics,
      ...finding.exampleEvidence.flatMap((example) => [example.title, example.code]),
      JSON.stringify(finding.evidenceStandard ?? {}),
      ...finding.reviewQuestions,
      ...finding.limitations,
      finding.regulatoryContext?.primaryConcern.displayCopy,
      finding.regulatoryContext?.displayCaution,
      JSON.stringify(finding.sample.payload)
    ].filter(Boolean).join("\n");
    const withoutNegativeCaveats = publicText
      .replace(/does not determine [^.]+(?:identity|fingerprint|singling-out|graph|legal status|compliance status)[^.]*\./gi, "")
      .replace(/do not determine that [^.]+(?:identity|fingerprint|singling-out|graph)[^.]*\./gi, "")
      .replace(/does not by itself show [^.]+persistent fingerprint[^.]*\./gi, "")
      .replace(/without claiming persistent fingerprint creation/gi, "");

    assert.doesNotMatch(withoutNegativeCaveats, /\b(?:proves?|confirms?|determines?) (?:personal identity|identity resolution|persistent fingerprint|user singling-out|complete identity graph)\b/i);
    assert.doesNotMatch(withoutNegativeCaveats, /\b(?:personal identity|identity resolution|persistent fingerprint|user singling-out|complete identity graph) (?:was|were|is|are) (?:established|created|confirmed|determined)\b/i);
    assert.doesNotMatch(withoutNegativeCaveats, /\bunlawful tracking\b|\binvalid consent\b/i);
    assert.match(publicText, /does not determine|does not by itself show|manual review/);
  }
});

test("fingerprinting micro-polish keeps probable wording cautious", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));
  const browserSource = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");
  const related = findings.get("fingerprinting_related_signals_observed");
  const probable = findings.get("probable_fingerprinting");

  assert.ok(related);
  assert.ok(probable);

  assert.match(browserSource, /may warrant manual review/);
  assert.doesNotMatch(browserSource, /deserve manual review/);

  const probablePublicText = [
    probable.observed,
    probable.detectionMethodology,
    probable.confidenceSemantics,
    ...probable.exampleEvidence.flatMap((example) => [example.title, example.code]),
    JSON.stringify(probable.evidenceStandard ?? {}),
    ...probable.reviewQuestions,
    ...probable.limitations,
    probable.regulatoryContext?.primaryConcern.displayCopy,
    probable.regulatoryContext?.displayCaution,
    JSON.stringify(probable.sample.payload)
  ].filter(Boolean).join("\n");

  assert.doesNotMatch(probablePublicText, /strong enough to warrant probable fingerprinting review/);
  assert.match(
    probablePublicText,
    /clustered set of high-entropy browser or device collection signals that may warrant probable fingerprinting review/
  );
  assert.match(
    probable.regulatoryContext?.technicalStandards.find(
      (standard) => standard.id === "gdpr_data_minimization_purpose_limitation_review"
    )?.appliesWhen ?? "",
    /may warrant purpose, necessity, minimization, and default-setting review/
  );
  assert.doesNotMatch(probable.regulatoryContext?.technicalStandards.map((standard) => standard.appliesWhen).join("\n") ?? "", /require purpose, necessity, minimization/);
  assert.match(probablePublicText, /does not determine[^.]*persistent fingerprint creation/i);
  assert.match(probablePublicText, /does not determine[^.]*personal identity/i);
  assert.match(probablePublicText, /does not determine[^.]*identity resolution/i);
  assert.match(probablePublicText, /does not determine[^.]*user singling-out/i);
  assert.match(probablePublicText, /does not determine[^.]*complete identity graph/i);
  assert.match(probablePublicText, /does not determine[^.]*consent validity/i);
  assert.match(probablePublicText, /does not determine[^.]*compliance status/i);

  const relatedPublicText = [
    related.observed,
    related.detectionMethodology,
    ...related.limitations,
    related.regulatoryContext?.displayCaution,
    JSON.stringify(related.sample.payload)
  ].filter(Boolean).join("\n");

  assert.match(relatedPublicText, /does not determine[^.]*persistent fingerprint/i);
  assert.match(relatedPublicText, /does not determine[^.]*identity resolution/i);
});

test("fingerprinting sample user-data checks are scoped to actual sample payloads", () => {
  const cautionaryPublicCopy =
    "user singling-out, user terminal equipment, user region, user-facing context, and manual review of user impact";

  assert.doesNotMatch(cautionaryPublicCopy, PUBLIC_SAMPLE_USER_DATA_PATTERN);

  for (const findingId of FINGERPRINTING_BATCH_FINDING_IDS) {
    const finding = getFindingReferenceItems().find((item) => item.id === findingId);

    assert.ok(finding);

    const samplePayload = JSON.stringify(finding.sample.payload);
    const hiddenSampleJson = JSON.stringify(makePublicHiddenSampleJson(finding));

    assert.doesNotMatch(samplePayload, PUBLIC_SAMPLE_USER_DATA_PATTERN);
    assert.doesNotMatch(hiddenSampleJson, PUBLIC_SAMPLE_USER_DATA_PATTERN);
    assert.match(hiddenSampleJson, /vendor_name=|signal_categories=/);
  }
});

test("runtime tracking copy avoids identity and legal overclaims", () => {
  for (const findingId of RUNTIME_TRACKING_BATCH_FINDING_IDS) {
    const finding = getFindingReferenceItems().find((item) => item.id === findingId);

    assert.ok(finding);

    const publicText = [
      finding.observed,
      finding.detectionMethodology,
      finding.confidenceSemantics,
      ...finding.exampleEvidence.flatMap((example) => [example.title, example.code]),
      JSON.stringify(finding.evidenceStandard ?? {}),
      ...finding.reviewQuestions,
      ...finding.limitations,
      finding.regulatoryContext?.primaryConcern.displayCopy,
      finding.regulatoryContext?.displayCaution,
      JSON.stringify(finding.sample.payload)
    ].filter(Boolean).join("\n");

    assert.doesNotMatch(publicText, /\b(?:CertScore|scanner|evidence) infers? (?:a )?complete identity graph\b/i);
    assert.doesNotMatch(publicText, /\bproves? (?:a )?complete identity graph\b/i);
    assert.doesNotMatch(publicText, /\bpersonal identity proof\b/i);
    assert.doesNotMatch(publicText, /\bconfirms user identity\b/i);
    assert.doesNotMatch(publicText, /\bunlawful tracking\b/i);
    assert.doesNotMatch(publicText, /\binvalid consent\b/i);
    assert.doesNotMatch(publicText, /\bvendor fault\b/i);
    assert.match(publicText, /does not determine|does not infer|manual review/);
  }
});

test("runtime tracking hardening keeps titles and applicability copy cautious", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");
  const rtb = findings.get("rtb_cookie_sync_observed");
  const crossDomain = findings.get("cross_domain_identifier_sharing_observed");

  assert.ok(rtb);
  assert.ok(crossDomain);
  assert.equal(rtb.sample.payload.criticality, rtb.criticality);
  assert.equal(crossDomain.sample.payload.criticality, crossDomain.criticality);
  assert.doesNotMatch(source, /deserve consent/);
  assert.match(source, /may warrant review for consent state, disclosure, purpose, and data-flow context/);
  assert.doesNotMatch(source, /may require purpose, consent, disclosure, contract, or minimization review/);
  assert.match(source, /may warrant review for purpose, consent state, disclosure, contract, minimization, and vendor-governance context/);

  const rtbAppliesWhen = [
    ...(rtb.regulatoryContext?.technicalStandards ?? []).map((item) => item.appliesWhen),
    ...(rtb.regulatoryContext?.jurisdictionalContexts ?? []).map((item) => item.appliesWhen)
  ].join("\n");
  const crossDomainAppliesWhen = [
    ...(crossDomain.regulatoryContext?.technicalStandards ?? []).map((item) => item.appliesWhen),
    ...(crossDomain.regulatoryContext?.jurisdictionalContexts ?? []).map((item) => item.appliesWhen)
  ].join("\n");

  assert.doesNotMatch(rtbAppliesWhen, /EU\/EEA users and adtech cookie sync or identity matching are in scope/);
  assert.doesNotMatch(rtbAppliesWhen, /California users, advertising sharing, or cross-context behavioral advertising are in scope/);
  assert.match(rtbAppliesWhen, /identity-matching signals may be in scope/);
  assert.match(rtbAppliesWhen, /advertising-sharing signals, or cross-context behavioral advertising context may be in scope/);
  assert.doesNotMatch(crossDomainAppliesWhen, /identifiers are shared/);
  assert.match(crossDomainAppliesWhen, /identifier-like request signals may be relevant/);
});

test("public regulatory applicability copy avoids deterministic in-scope phrasing", () => {
  const appliesWhenCopy = getFindingReferenceItems().flatMap((finding) => [
    ...(finding.regulatoryContext?.technicalStandards ?? []).map((item) => item.appliesWhen),
    ...(finding.regulatoryContext?.jurisdictionalContexts ?? []).map((item) => item.appliesWhen)
  ]).join("\n");

  assert.doesNotMatch(appliesWhenCopy, /\b(?:are|is) in scope\./);
  assert.match(appliesWhenCopy, /may be in scope depending on/);
});

test("visual contrast atlas copy keeps automated evidence limits explicit", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "visual_contrast_accessibility_issue");

  assert.ok(finding);
  assert.equal(finding.id, "visual_contrast_accessibility_issue");
  assert.equal(finding.criticality, "medium");
  assert.match(finding.observed, /Retained automated accessibility evidence showed text or controls with contrast-related signals/);
  assert.match(finding.observed, /may fall below the applicable automated threshold for the detected element and state/);
  assert.doesNotMatch(finding.observed, /computed foreground\/background colors/);
  assert.match(finding.detectionMethodology, /retains representative automated accessibility evidence/);
  assert.match(finding.detectionMethodology, /may fall below the applicable automated contrast threshold/);
  assert.doesNotMatch(finding.detectionMethodology, /may not meet the applicable automated contrast threshold/);
  assert.match(finding.detectionMethodology, /does not infer full WCAG conformance or non-conformance/);
  assert.match(finding.detectionMethodology, /Reviewers should consider text size, font weight/);
  assert.match(finding.confidenceSemantics, /automated contrast-rule evidence/);
  assert.match(finding.confidenceSemantics, /computed color pairs/);
  assert.match(finding.confidenceSemantics, /Manual review is still needed/);
  assert.ok(finding.evidenceStandard);
  assert.match(finding.evidenceStandard.strong.join(" "), /rule ID, affected selector or element reference, page URL/);
  assert.match(finding.evidenceStandard.good.join(" "), /verify the contrast pair manually/);
  assert.match(finding.evidenceStandard.auditOnly.join(" "), /automated evidence is incomplete/);
  assert.match(finding.evidenceStandard.insufficient.join(" "), /without retained automated evidence/);
  assert.match(JSON.stringify(finding.evidenceStandard), /inactive component/);
  assert.doesNotMatch(JSON.stringify(finding.evidenceStandard), /inactive content/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /role=finding_supporting_artifact/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /selector=\[data-example-component="pricing-card"\] \.example-muted-copy/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /computed_color_pair=not_retained_in_public_sample/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /manual_review_needed=true/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /audit_only_without_affected_element/);
  assert.match(finding.exampleEvidence.map((example) => example.code).join("\n"), /insufficient_without_rule_and_page_context/);
  assert.ok(
    finding.limitations.some((limitation) => /Automated contrast checks can identify many computed color-contrast issues/i.test(limitation))
  );
  assert.ok(
    finding.limitations.some((limitation) => /WCAG conformance or non-conformance/i.test(limitation))
  );
  assert.match(finding.regulatoryContext?.primaryConcern.displayCopy ?? "", /WCAG-oriented accessibility review/);
  assert.match(finding.regulatoryContext?.displayCaution ?? "", /does not determine legal status or WCAG conformance/);
  assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
  assert.equal(finding.benchmark.sourceLabel, "Tranco top 1-2500 calibration set");
  assert.equal(finding.sample.payload.observed, finding.observed);
  assert.match(JSON.stringify(finding.sample.payload), /https:\/\/example\.com\/pricing/);
  assert.doesNotMatch(String(finding.sample.payload.observed), /computed foreground\/background colors/);
  assert.doesNotMatch(JSON.stringify(finding.sample.payload), PUBLIC_SAMPLE_HYGIENE_PATTERN);

  const notes = getReferenceNotes(finding).join("\n");
  assert.match(notes, /WCAG 2\.2 contrast guidance/);
  assert.match(notes, /ADA Title II, ADA Title III, Section 508, EN 301 549/);
  assert.doesNotMatch(notes, /EDPB consent guidance|CNIL cookie\/tracker/);

  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");
  assert.match(source, /retained accessibility artifacts/);
  assert.doesNotMatch(source, /computed color pair, contrast ratio, text-size classification, and visual state may require manual review or future retained-evidence enrichment/);
});

test("pre-consent pilot remains the canonical finding reference template", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "pre_consent_tracking_detected");
  const source = readFileSync("apps/web/components/marketing/findings/finding-atlas-browser.tsx", "utf8");

  assert.ok(finding);
  assert.equal(finding.id, "pre_consent_tracking_detected");
  assert.equal(finding.criticality, "high");
  assert.ok(finding.observed);
  assert.ok(finding.detectionMethodology);
  assert.ok(finding.evidenceStandard);
  assert.deepEqual(Object.keys(finding.evidenceStandard), ["strong", "good", "auditOnly", "insufficient"]);
  assert.ok(finding.evidenceStandard.strong.length > 0);
  assert.ok(finding.evidenceStandard.good.length > 0);
  assert.ok(finding.evidenceStandard.auditOnly.length > 0);
  assert.ok(finding.evidenceStandard.insufficient.length > 0);
  assert.ok(finding.exampleEvidence.length >= 3);
  assert.ok(finding.reviewQuestions.length >= 5);
  assert.ok(finding.limitations.length >= 5);
  assert.ok(finding.regulatoryContext);
  assert.equal(finding.sample.sourceLabel, "Illustrative public evidence sample");
  assert.doesNotMatch(JSON.stringify(finding.sample), PUBLIC_SAMPLE_HYGIENE_PATTERN);
  assert.match(source, /<details id=\{`\$\{finding\.id\}-example-json`\} className="group">/);
  assert.doesNotMatch(source, /<details id=\{`\$\{finding\.id\}-example-json`\}[^>]*open/);
});

test("pre-consent finding detail route has SEO and GEO-ready page copy", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "pre_consent_tracking_detected");
  const pageSource = readFileSync("apps/web/app/findings/findings-reference-page.tsx", "utf8");

  assert.ok(finding);
  assert.equal(getFindingReferencePath(finding.id), "/findings/pre_consent_tracking_detected");

  const copy = getFindingReferencePageCopy(finding);

  assert.equal(copy.pagePath, "/findings/pre_consent_tracking_detected");
  assert.equal(copy.pageTitle, "Third-party tracking observed before recorded consent finding reference");
  assert.match(copy.pageDescription, /classified non-essential/);
  assert.match(copy.pageDescription, /prior consent state associated with that purpose/);
  assert.match(pageSource, /const headingTitle = activeFinding\?\.title \?\? "CertScore findings reference"/);
  assert.match(pageSource, /<h1[\s\S]*\{headingTitle\}[\s\S]*<\/h1>/);
  assert.match(pageSource, /createPublicArticleSchema/);
  assert.match(pageSource, /createDefinedTermSchema/);
  assert.match(pageSource, /createDefinedTermSetSchema/);
});

test("finding atlas copy avoids prohibited legal overclaiming", () => {
  for (const finding of getFindingReferenceItems()) {
    const searchable = stripAllowedCaveats([
      finding.observed,
      finding.detectionMethodology,
      finding.confidenceSemantics,
      ...finding.exampleEvidence.flatMap((example) => [example.title, example.code]),
      ...finding.commonCauses,
      ...finding.reviewQuestions,
      ...finding.limitations,
      finding.regulatoryContext?.primaryConcern.displayCopy,
      finding.regulatoryContext?.displayCaution,
      JSON.stringify(finding.evidenceStandard ?? {}),
      JSON.stringify(finding.sample.payload)
    ].filter(Boolean).join("\n"));

    for (const pattern of PROHIBITED_OVERCLAIM_PATTERNS) {
      assert.doesNotMatch(searchable, pattern, `${finding.id} should not contain ${pattern}`);
    }
  }
});

test("pre-consent public copy avoids unsupported evidence terms", () => {
  const finding = getFindingReferenceItems().find((item) => item.id === "pre_consent_tracking_detected");

  assert.ok(finding);

  const publicText = [
    finding.observed,
    finding.detectionMethodology,
    finding.confidenceSemantics,
    ...finding.exampleEvidence.flatMap((example) => [example.title, example.code]),
    JSON.stringify(finding.evidenceStandard ?? {}),
    ...finding.reviewQuestions,
    ...finding.limitations,
    finding.regulatoryContext?.primaryConcern.displayCopy,
    finding.regulatoryContext?.displayCaution
  ].filter(Boolean).join("\n");

  assert.doesNotMatch(publicText, /authorizing that purpose/);
  assert.doesNotMatch(publicText, /vendor-attributed runtime event/);
  assert.match(publicText, /prior consent state/);
  assert.match(publicText, /vendor name is not enough by itself|vendor name alone/);
  assert.match(publicText, /Snapshot booleans/);
});
