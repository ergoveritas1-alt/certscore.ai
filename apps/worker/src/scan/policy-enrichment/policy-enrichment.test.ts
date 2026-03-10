import assert from "node:assert/strict";
import test from "node:test";
import { chunkPolicyText } from "./chunk";
import { buildPolicyEvidenceRecords } from "./evidence";
import { mergePolicyChunkExtractions } from "./merge";
import { hashNormalizedPolicyText, normalizePolicyText } from "./normalize";
import { ruleBasedPolicyPreprocess } from "./rules";
import { enrichPolicyPages } from "./run-policy-enrichment";
import { validatePolicyChunkJson } from "./schema";

test("normalizePolicyText and hashNormalizedPolicyText are deterministic", () => {
  const sourceA = " Privacy   Policy \n\n We collect email addresses. ";
  const sourceB = "Privacy Policy We collect email addresses.";

  assert.equal(normalizePolicyText(sourceA), normalizePolicyText(sourceB));
  assert.equal(hashNormalizedPolicyText(sourceA), hashNormalizedPolicyText(sourceB));
});

test("chunkPolicyText creates overlapping chunks", () => {
  const text = Array.from({ length: 120 }, (_, index) => `token${index + 1}`).join(" ");
  const chunks = chunkPolicyText({
    text,
    chunkSizeTokens: 40,
    chunkOverlapTokens: 10
  });

  assert.ok(chunks.length >= 3);
  assert.match(chunks[0]!.text, /token1/);
  assert.match(chunks[1]!.text, /token31/);
});

test("validatePolicyChunkJson accepts valid JSON and rejects invented snippets", () => {
  const chunkText = "We comply with GDPR and you may request deletion of your data through our privacy form.";

  const valid = validatePolicyChunkJson({
    chunkText,
    rawJson: JSON.stringify({
      mentions_gdpr: { value: true, confidence: 0.92, snippet: "We comply with GDPR" },
      do_not_sell: { value: "unknown", confidence: 0.1, snippet: null },
      dsar_mechanism: { value: "present", confidence: 0.91, snippet: "request deletion of your data through our privacy form" },
      data_access_request_present: { value: true, confidence: 0.88, snippet: "request deletion of your data through our privacy form" },
      data_deletion_request_present: { value: true, confidence: 0.9, snippet: "request deletion of your data through our privacy form" },
      privacy_contact_channel_type: { value: "form", confidence: 0.82, snippet: "privacy form" },
      retention_disclosure: { value: "none", confidence: 0.4, snippet: null },
      policy_claim_no_sale: { value: false, confidence: 0.3, snippet: null },
      policy_claim_no_tracking: { value: false, confidence: 0.3, snippet: null },
      policy_claim_privacy_protective: { value: false, confidence: 0.3, snippet: null },
      data_categories: [],
      retention_statements: [],
      transfer_mechanisms: [],
      children_reference: { value: "unknown", confidence: 0, snippet: null },
      summary: { text: "The policy references GDPR and a deletion request form.", confidence: 0.8 }
    })
  });

  assert.equal(valid.mentionsGdpr.value, true);

  assert.throws(() =>
    validatePolicyChunkJson({
      chunkText,
      rawJson: JSON.stringify({
        mentions_gdpr: { value: true, confidence: 0.92, snippet: "This exact phrase does not exist" },
        do_not_sell: { value: "unknown", confidence: 0.1, snippet: null },
        dsar_mechanism: { value: "unknown", confidence: 0.1, snippet: null },
        data_access_request_present: { value: false, confidence: 0.1, snippet: null },
        data_deletion_request_present: { value: false, confidence: 0.1, snippet: null },
        privacy_contact_channel_type: { value: "none", confidence: 0.1, snippet: null },
        retention_disclosure: { value: "none", confidence: 0.1, snippet: null },
        policy_claim_no_sale: { value: false, confidence: 0.1, snippet: null },
        policy_claim_no_tracking: { value: false, confidence: 0.1, snippet: null },
        policy_claim_privacy_protective: { value: false, confidence: 0.1, snippet: null },
        data_categories: [],
        retention_statements: [],
        transfer_mechanisms: [],
        children_reference: { value: "unknown", confidence: 0, snippet: null },
        summary: { text: "Bad output", confidence: 0.1 }
      })
    })
  );
});

test("mergePolicyChunkExtractions deterministically merges enums and lists", () => {
  const merged = mergePolicyChunkExtractions({
    highThreshold: 0.8,
    moderateThreshold: 0.6,
    ruleResult: {
      actionableFlags: [],
      childrenReference: "unknown",
      dataCategories: ["email"],
      dataAccessRequestPresent: false,
      dataDeletionRequestPresent: false,
      doNotSell: "unknown",
      dsarMechanism: "partial",
      evidenceSnippets: {},
      mentions: [],
      needLlm: true,
      normalizedPolicyHash: "hash",
      normalizedText: "Policy text",
      policyClaimNoSale: null,
      policyClaimNoTracking: null,
      policyClaimPrivacyProtective: null,
      privacyContactChannelType: "none",
      retentionStatements: [],
      retentionDisclosure: "none",
      semanticConfidence: 0.58,
      summary: "Fallback summary",
      transferMechanisms: [],
      updateDate: null
    },
    chunkExtractions: [
      {
        mentionsGdpr: { value: true, confidence: 0.9, snippet: "GDPR" },
        doNotSell: { value: "present_text", confidence: 0.84, snippet: "we do not sell personal data" },
        dsarMechanism: { value: "present", confidence: 0.83, snippet: "request access" },
        dataAccessRequestPresent: { value: true, confidence: 0.82, snippet: "request access" },
        dataDeletionRequestPresent: { value: false, confidence: 0.62, snippet: null },
        privacyContactChannelType: { value: "form", confidence: 0.77, snippet: "privacy form" },
        retentionDisclosure: { value: "specific", confidence: 0.81, snippet: "retain logs for 30 days" },
        policyClaimNoSale: { value: true, confidence: 0.83, snippet: "we do not sell personal data" },
        policyClaimNoTracking: { value: false, confidence: 0.4, snippet: null },
        policyClaimPrivacyProtective: { value: true, confidence: 0.68, snippet: null },
        dataCategories: [{ value: "email", confidence: 0.7, snippet: "email address" }],
        retentionStatements: [{ category: "logs", confidence: 0.72, periodText: "retain logs for 30 days", snippet: "retain logs for 30 days" }],
        transferMechanisms: [{ mechanism: "SCC", confidence: 0.88, snippet: "Standard Contractual Clauses" }],
        childrenReference: { value: "under_13", confidence: 0.8, snippet: "under 13" },
        summary: { text: "Policy references GDPR rights.", confidence: 0.82 }
      },
      {
        mentionsGdpr: { value: true, confidence: 0.77, snippet: "GDPR" },
        doNotSell: { value: "present_text", confidence: 0.72, snippet: "we do not sell personal data" },
        dsarMechanism: { value: "present", confidence: 0.74, snippet: "request access" },
        dataAccessRequestPresent: { value: true, confidence: 0.74, snippet: "request access" },
        dataDeletionRequestPresent: { value: false, confidence: 0.58, snippet: null },
        privacyContactChannelType: { value: "form", confidence: 0.7, snippet: "privacy form" },
        retentionDisclosure: { value: "specific", confidence: 0.72, snippet: "retain logs for 30 days" },
        policyClaimNoSale: { value: true, confidence: 0.72, snippet: "we do not sell personal data" },
        policyClaimNoTracking: { value: false, confidence: 0.38, snippet: null },
        policyClaimPrivacyProtective: { value: true, confidence: 0.62, snippet: null },
        dataCategories: [{ value: "ip", confidence: 0.68, snippet: "IP address" }],
        retentionStatements: [{ category: "logs", confidence: 0.63, periodText: "retain logs for 30 days", snippet: "retain logs for 30 days" }],
        transferMechanisms: [{ mechanism: "SCC", confidence: 0.79, snippet: "Standard Contractual Clauses" }],
        childrenReference: { value: "under_13", confidence: 0.62, snippet: "under 13" },
        summary: { text: "It also describes log retention.", confidence: 0.71 }
      }
    ]
  });

  assert.equal(merged.policyDsarMechanism, "present");
  assert.equal(merged.policyDoNotSell, "present_text");
  assert.equal(merged.policyChildrenReference, "under_13");
  assert.deepEqual(merged.policyDataCategories, ["email", "ip"]);
  assert.equal(merged.policyTransferMechanisms[0]?.mechanism, "SCC");
});

test("buildPolicyEvidenceRecords deduplicates identical snippets", () => {
  const result = buildPolicyEvidenceRecords({
    pageUrl: "https://example.com/privacy",
    snippets: {
      gdpr: "We comply with GDPR.",
      dsar: "We comply with GDPR."
    }
  });

  assert.equal(result.evidences.length, 1);
  assert.equal(result.references.gdpr, result.references.dsar);
});

test("ruleBasedPolicyPreprocess sanitizes noisy update dates", () => {
  const result = ruleBasedPolicyPreprocess({
    text: "Effective date: January 1, 2026 To download and/or print this policy, use your browser controls."
  });

  assert.equal(result.updateDate, "2026-01-01");
});

test("ruleBasedPolicyPreprocess clamps overly long summaries", () => {
  const result = ruleBasedPolicyPreprocess({
    text: `${"This privacy policy explains our practices and disclosures in extensive detail ".repeat(8)}. Second sentence.`
  });

  assert.ok((result.summary?.length ?? 0) <= 280);
});

test("enrichPolicyPages marks GDPR-heavy policy with DSAR present", async () => {
  const bundle = await enrichPolicyPages({
    scanId: "scan-gdpr",
    organizationId: "org-1",
    domainId: "domain-1",
    pages: [
      {
        pageUrl: "https://example.com/privacy",
        pageType: "privacy_policy",
        fetchStatus: "ok",
        finalUrl: "https://example.com/privacy",
        headers: {},
        html: "<html><body>Privacy policy</body></html>",
        language: "en",
        links: [],
        redirected: false,
        scripts: [],
        statusCode: 200,
        textContent:
          "Privacy Policy. GDPR applies to our processing. You may request access, deletion, and correction through our privacy request form. We retain logs for 30 days. We use Standard Contractual Clauses for transfers.",
        title: "Privacy Policy",
        forms: []
      }
    ],
    advertisingTrackerCount: 0,
    sessionReplayTrackerCount: 0,
    euExposureLikely: true,
    californiaExposureLikely: false
  });

  assert.equal(bundle.enrichments.length, 1);
  assert.equal(bundle.enrichments[0]!.policyDsarMechanism, "present");
  assert.equal(bundle.snapshotOverrides.mentionsGdpr, true);
  assert.equal(bundle.snapshotOverrides.dsarRequestMechanismPresent, true);
});

test("enrichPolicyPages flags no-sale policy with adtech conflict and queues review", async () => {
  const bundle = await enrichPolicyPages({
    scanId: "scan-conflict",
    organizationId: "org-1",
    domainId: "domain-1",
    pages: [
      {
        pageUrl: "https://example.com/privacy",
        pageType: "privacy_policy",
        fetchStatus: "ok",
        finalUrl: "https://example.com/privacy",
        headers: {},
        html: "<html><body>Privacy policy</body></html>",
        language: "en",
        links: [],
        redirected: false,
        scripts: [],
        statusCode: 200,
        textContent: "We do not sell personal data. Contact privacy@example.com for privacy questions.",
        title: "Privacy Policy",
        forms: []
      }
    ],
    advertisingTrackerCount: 3,
    sessionReplayTrackerCount: 0,
    euExposureLikely: false,
    californiaExposureLikely: true
  });

  assert.equal(bundle.enrichments[0]!.policyBehaviorConflictCandidate, true);
  assert.ok(bundle.reviewQueueItems.some((item) => item.reason === "policy_behavior_conflict_candidate"));
});

test("enrichPolicyPages queues ambiguous low-confidence policy for review", async () => {
  const bundle = await enrichPolicyPages({
    scanId: "scan-ambiguous",
    organizationId: "org-1",
    domainId: "domain-1",
    pages: [
      {
        pageUrl: "https://example.com/privacy",
        pageType: "privacy_policy",
        fetchStatus: "ok",
        finalUrl: "https://example.com/privacy",
        headers: {},
        html: "<html><body>Privacy policy</body></html>",
        language: "en",
        links: [],
        redirected: false,
        scripts: [],
        statusCode: 200,
        textContent:
          "We may collect information as necessary from time to time where appropriate. We could use data globally and retain it as needed.",
        title: "Privacy Policy",
        forms: []
      }
    ],
    advertisingTrackerCount: 0,
    sessionReplayTrackerCount: 0,
    euExposureLikely: true,
    californiaExposureLikely: false
  });

  assert.ok((bundle.enrichments[0]!.policySemanticConfidence ?? 1) < 0.6);
  assert.ok(bundle.reviewQueueItems.some((item) => item.reason === "low_confidence_critical_fields"));
});
