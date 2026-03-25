import assert from "node:assert/strict";
import test from "node:test";
import { chunkPolicyText, selectPolicyChunksForLlm } from "./chunk";
import { buildPolicyEvidenceRecords } from "./evidence";
import { createPolicyLlmClient, getPolicyLlmAvailability, loadPolicyPrompt, POLICY_EXTRACTION_CONFIG, resolvePolicyPromptName } from "./llm-client";
import { mergePolicyChunkExtractions } from "./merge";
import { hashNormalizedPolicyText, normalizePolicyText } from "./normalize";
import { ruleBasedPolicyPreprocess } from "./rules";
import { enrichPolicyPages } from "./run-policy-enrichment";
import { validatePolicyChunkJson } from "./schema";
import { derivePolicyLlmTriggerReasons } from "./semantic-triggers";

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

test("selectPolicyChunksForLlm keeps a small high-signal subset for long policies", () => {
  const chunks = chunkPolicyText({
    text: [
      "intro words ".repeat(300),
      "request deletion through our privacy request form ".repeat(200),
      "standard contractual clauses and international transfer language ".repeat(200),
      "retain logs for 30 days and keep your data as long as necessary ".repeat(200),
      "children under 16 do not sell personal information privacy@company.com ".repeat(200),
      "closing words ".repeat(300)
    ].join(" "),
    chunkSizeTokens: 120,
    chunkOverlapTokens: 0
  });

  const selected = selectPolicyChunksForLlm({
    chunks,
    maxChunks: 5
  });

  assert.equal(selected.length, 5);
  assert.equal(selected[0]?.chunkId, "chunk-1");
  assert.equal(selected[selected.length - 1]?.chunkId, chunks[chunks.length - 1]?.chunkId);
  assert.ok(selected.some((chunk) => chunk.reason.includes("dsar")));
  assert.ok(selected.some((chunk) => chunk.score > 0 && !["chunk-1", chunks[chunks.length - 1]!.chunkId].includes(chunk.chunkId)));
});

test("selectPolicyChunksForLlm prioritizes governing law and arbitration chunks for terms pages", () => {
  const chunks = chunkPolicyText({
    text: [
      "welcome terms introduction ".repeat(250),
      "these terms are governed by the laws of washington and the united states ".repeat(180),
      "any dispute will be resolved by binding arbitration and class action waiver applies ".repeat(180),
      "effective date march 1 2026 last updated march 1 2026 ".repeat(120),
      "closing terms boilerplate ".repeat(220)
    ].join(" "),
    chunkSizeTokens: 120,
    chunkOverlapTokens: 0
  });

  const selected = selectPolicyChunksForLlm({
    chunks,
    maxChunks: 5,
    pageType: "terms_of_service"
  });

  assert.equal(selected.length, 5);
  assert.equal(selected[0]?.chunkId, "chunk-1");
  assert.ok(selected.some((chunk) => chunk.reason.includes("governing_law")));
  assert.ok(
    selected.filter((chunk) => /governing_law|arbitration|effective_date/.test(chunk.reason)).length >= 2
  );
});

test("selectPolicyChunksForLlm does not force the last chunk for long privacy pages with enough interior signal", () => {
  const chunks = chunkPolicyText({
    text: [
      "privacy policy introduction and overview ".repeat(220),
      "you may request deletion using our privacy request form and consumer privacy request portal ".repeat(180),
      "we retain logs for 30 days and keep account records as long as necessary ".repeat(180),
      "standard contractual clauses apply to international transfer disclosures ".repeat(180),
      "children under 16 and do not sell or share personal information ".repeat(180),
      "closing boilerplate and footer links ".repeat(220)
    ].join(" "),
    chunkSizeTokens: 120,
    chunkOverlapTokens: 0
  });

  const selected = selectPolicyChunksForLlm({
    chunks,
    maxChunks: 5,
    pageType: "privacy_policy"
  });

  assert.equal(selected[0]?.chunkId, "chunk-1");
  assert.ok(!selected.some((chunk) => chunk.chunkId === chunks[chunks.length - 1]?.chunkId));
  assert.ok(selected.some((chunk) => chunk.reason.includes("dsar")));
  assert.ok(
    selected.filter((chunk) => chunk.chunkId !== "chunk-1" && chunk.score >= 4).length >= 2
  );
});

test("ruleBasedPolicyPreprocess extracts structured cookie disclosures from tables", () => {
  const result = ruleBasedPolicyPreprocess({
    html: `
      <table aria-label="cookie-table">
        <tr><th>Cookie Name</th><th>Provider</th><th>Purpose</th><th>Duration</th></tr>
        <tr><td>_ga</td><td>Google Analytics</td><td>Analytics</td><td>2 years</td></tr>
        <tr><td>_fbp</td><td>Meta</td><td>Advertising</td><td>90 days</td></tr>
      </table>
    `,
    pageType: "cookie_policy",
    text: "Cookie Name Provider Purpose Duration _ga Google Analytics Analytics 2 years _fbp Meta Advertising 90 days"
  });

  assert.equal(result.cookieDisclosures?.length, 2);
  assert.equal(result.cookieDisclosures?.[0]?.cookieName, "_ga");
  assert.equal(result.cookieDisclosures?.[0]?.provider, "Google Analytics");
  assert.equal(result.cookieDisclosures?.[0]?.purpose, "Analytics");
  assert.equal(result.cookieDisclosures?.[0]?.duration, "2 years");
});

test("ruleBasedPolicyPreprocess extracts semi-structured cookie disclosures", () => {
  const result = ruleBasedPolicyPreprocess({
    pageType: "cookie_policy",
    text: `
      Cookie Name: ajs_user_id
      Provider: Segment
      Purpose: Analytics
      Duration: 1 year
    `
  });

  assert.equal(result.cookieDisclosures?.length, 1);
  assert.equal(result.cookieDisclosures?.[0]?.cookieName, "ajs_user_id");
  assert.equal(result.cookieDisclosures?.[0]?.provider, "Segment");
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

  const sanitized = validatePolicyChunkJson({
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
  });

  assert.equal(sanitized.mentionsGdpr.snippet, null);
});

test("validatePolicyChunkJson fills missing fields with defaults", () => {
  const partial = validatePolicyChunkJson({
    chunkText: "We do not sell your personal information.",
    rawJson: JSON.stringify({
      do_not_sell: { value: "present_text", confidence: 0.9, snippet: "We do not sell your personal information." },
      summary: { text: "No-sale disclosure present.", confidence: 0.7 }
    })
  });

  assert.equal(partial.doNotSell.value, "present_text");
  assert.equal(partial.dsarMechanism.value, "unknown");
  assert.deepEqual(partial.dataCategories, []);
});

test("validatePolicyChunkJson normalizes broader minors thresholds into supported children enums", () => {
  const normalized = validatePolicyChunkJson({
    chunkText: "We do not knowingly sell or share Personal Information of individuals under 18.",
    rawJson: JSON.stringify({
      children_reference: {
        value: "under_18",
        confidence: 0.8,
        snippet: "individuals under 18"
      }
    })
  });

  assert.equal(normalized.childrenReference.value, "under_16");
  assert.equal(normalized.childrenReference.confidence, 0.8);
});

test("ruleBasedPolicyPreprocess ignores exclusionary under-13 boilerplate", () => {
  const result = ruleBasedPolicyPreprocess({
    pageType: "privacy_policy",
    text:
      "Parents and guardians should observe children's activity. We do not knowingly collect Personal Information from children under the age of 13."
  });

  assert.equal(result.childrenReference, "none");
  assert.ok(result.mentions.some((mention) => mention.topic === "children"));
  assert.match(result.evidenceSnippets["topic:children"] ?? "", /children under the age of 13/i);
});

test("validatePolicyChunkJson normalizes unsupported retention categories into other", () => {
  const normalized = validatePolicyChunkJson({
    chunkText: "We retain customer data for as long as needed to provide the service.",
    rawJson: JSON.stringify({
      retention_statements: [
        {
          category: "customer data",
          period_text: "for as long as needed",
          confidence: 0.7,
          snippet: "retain customer data for as long as needed"
        }
      ]
    })
  });

  assert.equal(normalized.retentionStatements[0]?.category, "other");
  assert.equal(normalized.retentionStatements[0]?.periodText, "for as long as needed");
});

test("validatePolicyChunkJson drops retention statements with null period text", () => {
  const normalized = validatePolicyChunkJson({
    chunkText: "We may retain some customer data.",
    rawJson: JSON.stringify({
      retention_statements: [
        {
          category: "other",
          period_text: null,
          confidence: 0.5,
          snippet: "retain some customer data"
        }
      ]
    })
  });

  assert.deepEqual(normalized.retentionStatements, []);
});

test("validatePolicyChunkJson normalizes unknown retention disclosure to null", () => {
  const normalized = validatePolicyChunkJson({
    chunkText: "No clear retention disclosure is provided.",
    rawJson: JSON.stringify({
      retention_disclosure: {
        value: "unknown",
        confidence: 0.2,
        snippet: null
      }
    })
  });

  assert.equal(normalized.retentionDisclosure.value, null);
});

test("mergePolicyChunkExtractions deterministically merges enums and lists", () => {
  const merged = mergePolicyChunkExtractions({
    highThreshold: 0.8,
    moderateThreshold: 0.6,
    ruleResult: {
      actionableFlags: [],
      arbitrationPresent: null,
      cancellationOrRefundPresent: null,
      childrenReference: "unknown",
      dataCategories: ["email"],
      dataAccessRequestPresent: false,
      dataDeletionRequestPresent: false,
      doNotSell: "unknown",
      dsarMechanism: "partial",
      evidenceSnippets: {},
      governingLaw: null,
      mentions: [],
      needLlm: true,
      normalizedPolicyHash: "hash",
      normalizedText: "Policy text",
      noticeContactPresent: null,
      policyClaimNoSale: null,
      policyClaimNoTracking: null,
      policyClaimPrivacyProtective: null,
      privacyContactChannelType: "none",
      retentionStatements: [],
      retentionDisclosure: "none",
      semanticConfidence: 0.58,
      summary: "Fallback summary",
      terminationOrSuspensionPresent: null,
      transferMechanisms: [],
      updateDate: null
    },
    chunkExtractions: [
      {
        effectiveDate: { value: "2026-01-01", confidence: 0.8, snippet: "Effective date: January 1, 2026" },
        governingLaw: { value: "Delaware", confidence: 0.77, snippet: "governed by the laws of Delaware." },
        arbitrationPresent: { value: true, confidence: 0.82, snippet: "binding arbitration" },
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
        effectiveDate: { value: "2026-01-01", confidence: 0.72, snippet: "Effective date: January 1, 2026" },
        governingLaw: { value: "Delaware", confidence: 0.69, snippet: "laws of Delaware" },
        arbitrationPresent: { value: true, confidence: 0.71, snippet: "binding arbitration" },
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
  assert.equal(merged.policyEffectiveDate, "2026-01-01");
  assert.equal(merged.policyGoverningLaw, "Delaware");
  assert.equal(merged.policyArbitrationPresent, true);
});

test("mergePolicyChunkExtractions derives arbitration flag from merged terms verdict", () => {
  const merged = mergePolicyChunkExtractions({
    pageType: "terms_of_service",
    highThreshold: 0.8,
    moderateThreshold: 0.6,
    ruleResult: {
      actionableFlags: ["arbitration_clause_present"],
      arbitrationPresent: true,
      cancellationOrRefundPresent: null,
      childrenReference: "unknown",
      dataCategories: [],
      dataAccessRequestPresent: false,
      dataDeletionRequestPresent: false,
      doNotSell: "unknown",
      dsarMechanism: "unknown",
      evidenceSnippets: {},
      governingLaw: "California",
      mentions: [],
      needLlm: true,
      normalizedPolicyHash: "hash",
      normalizedText: "Terms text",
      noticeContactPresent: null,
      policyClaimNoSale: null,
      policyClaimNoTracking: null,
      policyClaimPrivacyProtective: null,
      privacyContactChannelType: "none",
      retentionStatements: [],
      retentionDisclosure: "none",
      semanticConfidence: 0.7,
      summary: "Terms summary",
      terminationOrSuspensionPresent: null,
      transferMechanisms: [],
      updateDate: "2025-12-01"
    },
    chunkExtractions: [
      {
        effectiveDate: { value: "2025-12-01", confidence: 0.86, snippet: "Effective date" },
        governingLaw: { value: "California", confidence: 0.85, snippet: "laws of California" },
        arbitrationPresent: { value: false, confidence: 0.84, snippet: null },
        mentionsGdpr: { value: null, confidence: 0, snippet: null },
        doNotSell: { value: "unknown", confidence: 0, snippet: null },
        dsarMechanism: { value: "unknown", confidence: 0, snippet: null },
        dataAccessRequestPresent: { value: false, confidence: 0, snippet: null },
        dataDeletionRequestPresent: { value: false, confidence: 0, snippet: null },
        privacyContactChannelType: { value: "none", confidence: 0, snippet: null },
        retentionDisclosure: { value: null, confidence: 0, snippet: null },
        policyClaimNoSale: { value: null, confidence: 0, snippet: null },
        policyClaimNoTracking: { value: null, confidence: 0, snippet: null },
        policyClaimPrivacyProtective: { value: null, confidence: 0, snippet: null },
        dataCategories: [],
        retentionStatements: [],
        transferMechanisms: [],
        childrenReference: { value: "unknown", confidence: 0, snippet: null },
        summary: { text: "Terms summary", confidence: 0.8 }
      }
    ]
  });

  assert.equal(merged.policyArbitrationPresent, false);
  assert.ok(!merged.policyActionableFlags.includes("arbitration_clause_present"));
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

test("ruleBasedPolicyPreprocess extracts governing law and arbitration from terms text", () => {
  const result = ruleBasedPolicyPreprocess({
    pageType: "terms_of_service",
    text: "These Terms are governed by the laws of Delaware. Any dispute will be resolved by binding arbitration and you waive any class action rights."
  });

  assert.equal(result.governingLaw, "Delaware");
  assert.equal(result.arbitrationPresent, true);
  assert.ok(result.actionableFlags.includes("arbitration_clause_present"));
  assert.ok(!result.actionableFlags.includes("missing_dsar"));
  assert.ok(!result.actionableFlags.includes("vague_retention"));
  assert.ok(!result.actionableFlags.includes("vague_policy_language"));
});

test("ruleBasedPolicyPreprocess extracts notice, termination, and cancellation terms from terms text", () => {
  const result = ruleBasedPolicyPreprocess({
    pageType: "terms_of_service",
    text: "You may send written notice to legal@example.com. We may suspend or terminate your account for cause. Subscription fees are non-refundable after cancellation."
  });

  assert.equal(result.noticeContactPresent, true);
  assert.equal(result.terminationOrSuspensionPresent, true);
  assert.equal(result.cancellationOrRefundPresent, true);
});

test("ruleBasedPolicyPreprocess clamps overly long summaries", () => {
  const result = ruleBasedPolicyPreprocess({
    text: `${"This privacy policy explains our practices and disclosures in extensive detail ".repeat(8)}. Second sentence.`
  });

  assert.ok((result.summary?.length ?? 0) <= 280);
});

test("derivePolicyLlmTriggerReasons narrows semantic enrichment to high-value cases", () => {
  assert.deepEqual(
    derivePolicyLlmTriggerReasons({
      aiAssistantWidgetDetected: true,
      aiDisclosureTextPresent: false,
      autoRenewDisclosurePresent: false,
      freeTrialDetected: true,
      highSensitivityDataCollectionDetected: true,
      policyBehaviorConflictCandidate: true,
      sessionReplayWithoutDisclosureCandidate: true,
      subscriptionTermsPresent: true
    }),
    [
      "ai_disclosure_review",
      "policy_behavior_conflict_candidate",
      "sensitive_collection_review",
      "session_replay_undisclosed",
      "subscription_disclosure_review"
    ]
  );

  assert.deepEqual(
    derivePolicyLlmTriggerReasons({
      aiAssistantWidgetDetected: false,
      aiDisclosureTextPresent: false,
      autoRenewDisclosurePresent: true,
      freeTrialDetected: false,
      highSensitivityDataCollectionDetected: false,
      policyBehaviorConflictCandidate: false,
      sessionReplayWithoutDisclosureCandidate: false,
      subscriptionTermsPresent: true
    }),
    []
  );
});

test("createPolicyLlmClient returns null unless enrichment is enabled with an API key", () => {
  assert.equal(createPolicyLlmClient({}), null);
  assert.equal(createPolicyLlmClient({ LLM_ENRICHMENT_ENABLED: "1" }), null);
  assert.ok(createPolicyLlmClient({ POLICY_ENRICHMENT_MOCK_LLM: "1" }));
  assert.ok(createPolicyLlmClient({ LLM_ENRICHMENT_ENABLED: "1", OPENAI_API_KEY: "test-key" }));
});

test("getPolicyLlmAvailability reports env-driven provider state", () => {
  assert.deepEqual(getPolicyLlmAvailability({}), {
    enabled: false,
    hasApiKey: false,
    mock: false,
    timeoutMs: 5000
  });

  assert.deepEqual(
    getPolicyLlmAvailability({
      LLM_ENRICHMENT_ENABLED: "1",
      LLM_ENRICHMENT_TIMEOUT_MS: "9000",
      OPENAI_API_KEY: "test-key"
    }),
    {
      enabled: true,
      hasApiKey: true,
      mock: false,
      timeoutMs: 9000
    }
  );
});

test("resolvePolicyPromptName uses a terms-specific prompt for terms pages", () => {
  assert.equal(resolvePolicyPromptName("terms_of_service"), "terms_extraction_v1.txt");
  assert.equal(resolvePolicyPromptName("privacy_policy"), "policy_extraction_v1.txt");
});

test("OpenAI policy LLM client posts JSON-only extraction requests", async () => {
  const client = createPolicyLlmClient({
    LLM_ENRICHMENT_ENABLED: "1",
    OPENAI_API_KEY: "test-key",
    LLM_ENRICHMENT_TIMEOUT_MS: "5000"
  });

  assert.ok(client);

  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  let authorizationHeader = "";

  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/chat/completions");
    authorizationHeader = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        model: POLICY_EXTRACTION_CONFIG.model,
        choices: [
          {
            message: {
              content: JSON.stringify({
                mentions_gdpr: { value: true, confidence: 0.91, snippet: "GDPR applies" },
                do_not_sell: { value: "unknown", confidence: 0, snippet: null },
                dsar_mechanism: { value: "absent", confidence: 0.7, snippet: null },
                data_access_request_present: { value: false, confidence: 0.7, snippet: null },
                data_deletion_request_present: { value: false, confidence: 0.7, snippet: null },
                privacy_contact_channel_type: { value: "none", confidence: 0.6, snippet: null },
                retention_disclosure: { value: "none", confidence: 0.6, snippet: null },
                policy_claim_no_sale: { value: false, confidence: 0.6, snippet: null },
                policy_claim_no_tracking: { value: false, confidence: 0.6, snippet: null },
                policy_claim_privacy_protective: { value: false, confidence: 0.6, snippet: null },
                data_categories: [],
                retention_statements: [],
                transfer_mechanisms: [],
                children_reference: { value: "unknown", confidence: 0, snippet: null },
                summary: { text: "Policy mentions GDPR.", confidence: 0.8 }
              })
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const result = await client!.extractPolicyChunk({
      chunk: {
        chunkId: "chunk-1",
        offsetStart: 0,
        offsetEnd: 42,
        text: "GDPR applies to our processing."
      },
      promptName: "policy_extraction_v1.txt",
      promptText: loadPolicyPrompt("policy_extraction_v1.txt")
    });

    assert.equal(authorizationHeader, "Bearer test-key");
    assert.equal(result.model, POLICY_EXTRACTION_CONFIG.model);
    assert.equal(result.promptVersion, "policy_extraction_v1");
    assert.match(result.rawJson, /mentions_gdpr/);
    assert.ok(requestBody);
    const body = requestBody as { model?: string; response_format?: { type?: string } };
    assert.equal(body.model, POLICY_EXTRACTION_CONFIG.model);
    assert.equal(body.response_format?.type ?? null, "json_object");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI policy LLM client surfaces timeout errors distinctly", async () => {
  const client = createPolicyLlmClient({
    LLM_ENRICHMENT_ENABLED: "1",
    OPENAI_API_KEY: "test-key",
    LLM_ENRICHMENT_TIMEOUT_MS: "5000"
  });

  assert.ok(client);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch;

  try {
    await assert.rejects(
      client!.extractPolicyChunk({
        chunk: {
          chunkId: "chunk-timeout",
          offsetStart: 0,
          offsetEnd: 10,
          text: "Policy text"
        },
        promptName: "policy_extraction_v1.txt",
        promptText: loadPolicyPrompt("policy_extraction_v1.txt")
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "PolicyLlmError" &&
        "code" in error &&
        error.code === "timeout"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("enrichPolicyPages does not surface conflict candidates without exact claim snippet support", async () => {
  const bundle = await enrichPolicyPages({
    scanId: "scan-no-claim-snippet",
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
        textContent: "We describe privacy rights and data practices in general terms without a no-sale statement.",
        title: "Privacy Policy",
        forms: []
      }
    ],
    advertisingTrackerCount: 3,
    sessionReplayTrackerCount: 0,
    euExposureLikely: false,
    californiaExposureLikely: true,
    allowLlm: false
  });

  assert.equal(bundle.enrichments[0]!.policyBehaviorConflictCandidate, false);
  assert.ok(!bundle.reviewQueueItems.some((item) => item.reason === "policy_behavior_conflict_candidate"));
});

test("enrichPolicyPages falls back when the total LLM budget is exhausted", async () => {
  const originalEnv = {
    LLM_ENRICHMENT_ENABLED: process.env.LLM_ENRICHMENT_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    LLM_ENRICHMENT_TOTAL_BUDGET_MS: process.env.LLM_ENRICHMENT_TOTAL_BUDGET_MS,
    LLM_ENRICHMENT_TIMEOUT_MS: process.env.LLM_ENRICHMENT_TIMEOUT_MS,
    LLM_ENRICHMENT_MAX_ATTEMPTS: process.env.LLM_ENRICHMENT_MAX_ATTEMPTS
  };
  const originalFetch = globalThis.fetch;

  process.env.LLM_ENRICHMENT_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.LLM_ENRICHMENT_TOTAL_BUDGET_MS = "1";
  process.env.LLM_ENRICHMENT_TIMEOUT_MS = "5000";
  process.env.LLM_ENRICHMENT_MAX_ATTEMPTS = "1";

  globalThis.fetch = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(
      JSON.stringify({
        model: POLICY_EXTRACTION_CONFIG.model,
        choices: [
          {
            message: {
              content: JSON.stringify({
                mentions_gdpr: { value: true, confidence: 0.9, snippet: "GDPR applies to our processing" },
                do_not_sell: { value: "unknown", confidence: 0, snippet: null },
                dsar_mechanism: {
                  value: "present",
                  confidence: 0.9,
                  snippet: "request access deletion and correction through our privacy request form"
                },
                data_access_request_present: {
                  value: true,
                  confidence: 0.9,
                  snippet: "request access deletion and correction through our privacy request form"
                },
                data_deletion_request_present: {
                  value: true,
                  confidence: 0.9,
                  snippet: "request access deletion and correction through our privacy request form"
                },
                privacy_contact_channel_type: { value: "form", confidence: 0.8, snippet: "privacy request form" },
                retention_disclosure: { value: "specific", confidence: 0.8, snippet: "retain logs for 30 days" },
                policy_claim_no_sale: { value: false, confidence: 0.6, snippet: null },
                policy_claim_no_tracking: { value: false, confidence: 0.6, snippet: null },
                policy_claim_privacy_protective: { value: false, confidence: 0.6, snippet: null },
                data_categories: [],
                retention_statements: [],
                transfer_mechanisms: [],
                children_reference: { value: "unknown", confidence: 0, snippet: null },
                summary: { text: "Policy mentions GDPR and privacy request rights.", confidence: 0.8 }
              })
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const bundle = await enrichPolicyPages({
      scanId: "scan-budget",
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
          textContent: [
            "Privacy Policy overview and general disclosures ".repeat(150),
            "GDPR applies to our processing and you may request access deletion and correction through our privacy request form ".repeat(150),
            "We retain logs for 30 days and maintain account records as long as necessary ".repeat(150),
            "We use Standard Contractual Clauses for international transfers ".repeat(150)
          ].join(" "),
          title: "Privacy Policy",
          forms: []
        }
      ],
      advertisingTrackerCount: 0,
      sessionReplayTrackerCount: 0,
      euExposureLikely: true,
      californiaExposureLikely: false,
      forceLlm: true
    });

    assert.equal(bundle.enrichments.length, 1);
    assert.ok(bundle.enrichments[0]!.policyActionableFlags.includes("llm_budget_exhausted"));
    assert.ok(bundle.diagnostics[0]?.chunkDiagnostics.some((entry) => entry.failureCode === "timeout"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env.LLM_ENRICHMENT_ENABLED = originalEnv.LLM_ENRICHMENT_ENABLED;
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    process.env.LLM_ENRICHMENT_TOTAL_BUDGET_MS = originalEnv.LLM_ENRICHMENT_TOTAL_BUDGET_MS;
    process.env.LLM_ENRICHMENT_TIMEOUT_MS = originalEnv.LLM_ENRICHMENT_TIMEOUT_MS;
    process.env.LLM_ENRICHMENT_MAX_ATTEMPTS = originalEnv.LLM_ENRICHMENT_MAX_ATTEMPTS;
  }
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

test("enrichPolicyPages carries semantic trigger reasons into actionable flags", async () => {
  const bundle = await enrichPolicyPages({
    scanId: "scan-triggered",
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
        textContent: "We may collect information as necessary from time to time where appropriate.",
        title: "Privacy Policy",
        forms: []
      }
    ],
    advertisingTrackerCount: 0,
    sessionReplayTrackerCount: 0,
    euExposureLikely: false,
    californiaExposureLikely: false,
    allowLlm: false,
    llmTriggerReasons: ["ai_disclosure_review", "subscription_disclosure_review"]
  });

  assert.ok(bundle.enrichments[0]!.policyActionableFlags.includes("ai_disclosure_review"));
  assert.ok(bundle.enrichments[0]!.policyActionableFlags.includes("subscription_disclosure_review"));
});

test("enrichPolicyPages flags insufficient fetched policy content and skips LLM", async () => {
  const bundle = await enrichPolicyPages({
    scanId: "scan-thin-policy",
    organizationId: "org-1",
    domainId: "domain-1",
    pages: [
      {
        pageUrl: "https://example.com/privacy",
        pageType: "privacy_policy",
        fetchStatus: "ok",
        finalUrl: "https://example.com/privacy",
        headers: {},
        html: '<html><body><div id="__next"></div><script type="module" src="/app.js"></script></body></html>',
        language: "en",
        links: [],
        redirected: false,
        scripts: [],
        statusCode: 200,
        textContent: "Loading...",
        title: "Privacy Policy",
        forms: []
      }
    ],
    advertisingTrackerCount: 0,
    sessionReplayTrackerCount: 0,
    euExposureLikely: true,
    californiaExposureLikely: false,
    allowLlm: true,
    llmTriggerReasons: ["subscription_disclosure_review"]
  });

  assert.equal(bundle.enrichments[0]!.policyAiModel, null);
  assert.ok(bundle.enrichments[0]!.policyActionableFlags.includes("policy_fetch_insufficient_content"));
  assert.equal(bundle.enrichments[0]!.policySummaryShort, "Insufficient policy content fetched for semantic review.");
  assert.ok((bundle.enrichments[0]!.policySemanticConfidence ?? 1) <= 0.2);
});

test("enrichPolicyPages retries transient provider failures before falling back", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnabled = process.env.LLM_ENRICHMENT_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAttempts = process.env.LLM_ENRICHMENT_MAX_ATTEMPTS;
  let attempts = 0;

  process.env.LLM_ENRICHMENT_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.LLM_ENRICHMENT_MAX_ATTEMPTS = "2";
  globalThis.fetch = (async () => {
    attempts += 1;

    if (attempts === 1) {
      return new Response("upstream busy", { status: 500 });
    }

    return new Response(
      JSON.stringify({
        model: POLICY_EXTRACTION_CONFIG.model,
        choices: [
          {
            message: {
              content: JSON.stringify({
                mentions_gdpr: { value: true, confidence: 0.91, snippet: "We comply with GDPR" },
                do_not_sell: { value: "unknown", confidence: 0, snippet: null },
                dsar_mechanism: { value: "present", confidence: 0.85, snippet: "You may request deletion of your data through our privacy form." },
                data_access_request_present: {
                  value: true,
                  confidence: 0.82,
                  snippet: "You may request deletion of your data through our privacy form."
                },
                data_deletion_request_present: {
                  value: true,
                  confidence: 0.82,
                  snippet: "You may request deletion of your data through our privacy form."
                },
                privacy_contact_channel_type: { value: "form", confidence: 0.8, snippet: "privacy form" },
                retention_disclosure: { value: "none", confidence: 0.5, snippet: null },
                policy_claim_no_sale: { value: false, confidence: 0.5, snippet: null },
                policy_claim_no_tracking: { value: false, confidence: 0.5, snippet: null },
                policy_claim_privacy_protective: { value: true, confidence: 0.6, snippet: "We comply with GDPR" },
                data_categories: [],
                retention_statements: [],
                transfer_mechanisms: [],
                children_reference: { value: "unknown", confidence: 0, snippet: null },
                summary: { text: "Policy includes GDPR and privacy request rights.", confidence: 0.8 }
              })
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const bundle = await enrichPolicyPages({
      scanId: "scan-retry-provider",
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
            "We comply with GDPR. You may request deletion of your data through our privacy form. We describe our practices in this privacy policy in detail.".repeat(
              12
            ),
          title: "Privacy Policy",
          forms: []
        }
      ],
      advertisingTrackerCount: 0,
      sessionReplayTrackerCount: 0,
      euExposureLikely: true,
      californiaExposureLikely: false,
      allowLlm: true,
      llmTriggerReasons: ["sensitive_collection_review"]
    });

    assert.equal(attempts, 2);
    assert.equal(bundle.enrichments[0]!.policyAiModel, POLICY_EXTRACTION_CONFIG.model);
    assert.ok(!bundle.enrichments[0]!.policyActionableFlags.includes("invalid_llm_json"));
    assert.ok(!bundle.enrichments[0]!.policyActionableFlags.includes("llm_provider_error"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env.LLM_ENRICHMENT_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
    process.env.LLM_ENRICHMENT_MAX_ATTEMPTS = originalAttempts;
  }
});

test("enrichPolicyPages keeps successful chunk extractions when a later chunk returns invalid JSON", async () => {
  const originalEnabled = process.env.LLM_ENRICHMENT_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.LLM_ENRICHMENT_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";

  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    const content =
      attempts === 2
        ? '{"mentions_gdpr":'
        : JSON.stringify({
            mentions_gdpr: { value: true, confidence: 0.9, snippet: "GDPR" },
            do_not_sell: { value: "unknown", confidence: 0, snippet: null },
            dsar_mechanism: { value: "present", confidence: 0.8, snippet: "privacy request form" },
            data_access_request_present: { value: true, confidence: 0.8, snippet: "access request" },
            data_deletion_request_present: { value: true, confidence: 0.8, snippet: "deletion request" },
            privacy_contact_channel_type: { value: "form", confidence: 0.8, snippet: "privacy request form" },
            retention_disclosure: { value: "specific", confidence: 0.8, snippet: "retain logs for 30 days" },
            policy_claim_no_sale: { value: false, confidence: 0.6, snippet: null },
            policy_claim_no_tracking: { value: false, confidence: 0.6, snippet: null },
            policy_claim_privacy_protective: { value: true, confidence: 0.7, snippet: "GDPR" },
            data_categories: [],
            retention_statements: [],
            transfer_mechanisms: [],
            children_reference: { value: "unknown", confidence: 0, snippet: null },
            summary: { text: "Policy includes privacy rights.", confidence: 0.8 }
          });

    return new Response(
      JSON.stringify({
        model: POLICY_EXTRACTION_CONFIG.model,
        choices: [
          {
            message: {
              content
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const bundle = await enrichPolicyPages({
      scanId: "scan-partial-coverage",
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
            [
              "Privacy policy introduction. ".repeat(240),
              "You may submit an access request or deletion request through our privacy request form. ".repeat(220),
              "We retain logs for 30 days and honor GDPR rights. ".repeat(220),
              "We discuss analytics and advertising disclosures. ".repeat(220),
              "Contact our privacy office if you have questions. ".repeat(220)
            ].join(" "),
          title: "Privacy Policy",
          forms: []
        }
      ],
      advertisingTrackerCount: 0,
      sessionReplayTrackerCount: 0,
      euExposureLikely: true,
      californiaExposureLikely: false,
      allowLlm: true,
      llmTriggerReasons: ["sensitive_collection_review"]
    });

    assert.ok(attempts >= 2);
    assert.equal(bundle.enrichments[0]!.policyAiModel, POLICY_EXTRACTION_CONFIG.model);
    assert.equal(bundle.enrichments[0]!.policyDsarMechanism, "present");
    assert.ok(bundle.enrichments[0]!.policyActionableFlags.includes("invalid_llm_json"));
    assert.ok(bundle.enrichments[0]!.policyActionableFlags.includes("llm_partial_coverage"));
    assert.ok(bundle.diagnostics[0]!.chunkDiagnostics.some((chunk) => chunk.success));
    const failedChunk = bundle.diagnostics[0]!.chunkDiagnostics.find((chunk) => chunk.failureCode === "invalid_json");
    assert.ok(failedChunk);
    assert.match(failedChunk!.failureDetail ?? "", /Unexpected end of JSON input|Invalid policy chunk JSON/i);
    assert.match(failedChunk!.rawPreview ?? "", /\{\"mentions_gdpr\":/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.LLM_ENRICHMENT_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
  }
});

test("enrichPolicyPages records chunk diagnostics for selected policy chunks", async () => {
  const bundle = await enrichPolicyPages({
    scanId: "scan-diagnostics",
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
          [
            "Intro text ".repeat(300),
            "You may request deletion through our privacy request form. ".repeat(220),
            "We retain logs for 30 days. ".repeat(220),
            "We use Standard Contractual Clauses for international transfers. ".repeat(220),
            "We do not sell personal information of consumers under 16. privacy@example.com ".repeat(220),
            "Closing text ".repeat(300)
          ].join(" "),
        title: "Privacy Policy",
        forms: []
      }
    ],
    advertisingTrackerCount: 0,
    sessionReplayTrackerCount: 0,
    euExposureLikely: true,
    californiaExposureLikely: false,
    allowLlm: false,
    llmTriggerReasons: ["sensitive_collection_review"]
  });

  assert.equal(bundle.diagnostics.length, 1);
  assert.ok(bundle.diagnostics[0]!.totalChunkCount > bundle.diagnostics[0]!.selectedChunkCount);
  assert.equal(bundle.diagnostics[0]!.chunkDiagnostics.length, 0);
});
