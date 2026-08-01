import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPolicyReviewCacheKey,
  buildPolicyReviewInput,
  buildPolicyReviewPacket,
  buildPolicyReviewPacketFromCanonicalBundle,
  buildPolicyStaticContentHash,
  buildStaticPolicyReviewPacket,
  deriveDeterministicLegalFrameworkSignals,
  deriveDeterministicPolicyReviewSignals,
  reviewPolicyPacketWithMini,
  STATIC_POLICY_REVIEW_TOPICS,
  selectBoundedPolicyReviewText
} from "./model-policy-review";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";

function completeRows(overrides?: Partial<Record<string, Record<string, unknown>>>) {
  const topics = [
    "processing_purposes",
    "legal_basis",
    "data_retention",
    "international_transfers",
    "vendor_disclosures",
    "data_subject_rights",
    "cookie_inventory",
    "policy_runtime_consistency"
  ];
  return Object.fromEntries(topics.map((topic) => [
    topic,
    {
      status: "insufficient_retained_evidence",
      confidence: 0.6,
      sourceDocumentIds: [],
      sourceUrls: [],
      evidenceExcerpts: [],
      conflictingExcerpts: [],
      reasonCodes: ["bounded_fixture"],
      rationale: "The retained fixture does not establish this topic.",
      ...(overrides?.[topic] ?? {})
    }
  ]));
}

function buildFixturePacket(text: string) {
  const packet = buildPolicyReviewPacket({
    documentSources: [{
      id: "11111111-1111-4111-8111-111111111111",
      canonical_url: "https://www.oxfam.org/en/privacy-policy",
      document_type: "privacy_policy",
      document_text: text,
      content_coverage: {
        status: "complete",
        sourceTextChars: text.length,
        extractedSectionCount: 1,
        retainedSectionCount: 1,
        retainedTableRowCount: 0,
        limitationKeys: []
      },
      document_evaluation_state: "usable",
      document_fetch_state: "fetched",
      document_owner_entity: "Oxfam",
      ownership_confidence: 0.98,
      ownership_reason_codes: ["same_registrable_domain_as_scan_target"],
      target_relationship: "target_controller",
      extraction_status: "ready",
      source_status: "ready",
      extracted_fields_json: {
        policy_mentions: [{ topic: "international_transfers" }]
      }
    }],
    evidenceCoverage: {
      coverageLimitations: [],
      policySurfaceInspection: { coverageStatus: "complete" },
      runtimeCoverage: { coverageStatus: "usable" }
    },
    policyCandidates: [{
      page_type: "privacy_policy",
      policy_summary_short: "Candidate extraction"
    }],
    runtimeArtifacts: {
      sessionReplay: {
        firstSeenMs: 5300,
        vendor: "Microsoft Clarity"
      }
    },
    scanContext: {
      region: "eu-west-1",
      targetUrl: "https://www.oxfam.org/"
    },
    scanDate: "2026-07-25T10:00:00.000Z",
    scanId: "22222222-2222-4222-8222-222222222222"
  });
  assert.ok(packet);
  return packet;
}

test("policy packet retains named Oxfam cookies and compact runtime contradiction context", () => {
  const packet = buildFixturePacket(
    "Cookies include _ga, _gid, _gat, __stripe_mid, __stripe_sid, fundraiseup_cid, fundraiseup_session, and oxfamint-cookie-agreed."
  );
  assert.match(packet.documents[0]?.text ?? "", /fundraiseup_session/);
  assert.equal(
    (packet.runtimeContext.sessionReplay as { vendor?: string }).vendor,
    "Microsoft Clarity"
  );
});

test("bounded policy review text retains late transfer, rights, recipient, and privacy-contact sections", () => {
  const filler = "General policy introduction and service description. ".repeat(520);
  const text = [
    "US PRIVACY POLICY. This policy explains our information practices.",
    filler,
    "SHARING PERSONAL INFORMATION. We share Personal Information with service providers, corporate affiliates, analytics providers, advertising networks, social networks, platforms, and governmental authorities.",
    "RETENTION. We retain Personal Information as long as necessary or permitted for the purposes for which it was obtained, considering legal obligations and the sensitivity of the information.",
    "US STATE PRIVACY RIGHTS. California and other state residents may request access, correction, deletion, portability, opt out, appeal, and nondiscrimination.",
    "INTERNATIONAL TRANSFER. Personal Information may be transferred to and processed in the United States or other jurisdictions, where courts, law enforcement, and national security authorities may access it.",
    "CONTACT US. Example Media Group Inc. operates the services. Contact us through our privacy request form or write to 100 Example Avenue, Example City, California, Attention: Privacy Officer."
  ].join("\n\n");

  const retained = selectBoundedPolicyReviewText(text);

  assert.equal(retained.length <= 18_000, true);
  assert.match(retained, /service providers.*advertising networks/i);
  assert.match(retained, /US STATE PRIVACY RIGHTS/i);
  assert.match(retained, /transferred to and processed in the United States or other jurisdictions/i);
  assert.match(retained, /Example Media Group Inc/i);
  assert.match(retained, /Attention: Privacy Officer/i);
});

test("canonical v2 policy surfaces become bounded review documents without raw runtime values", () => {
  const packet = buildPolicyReviewPacketFromCanonicalBundle({
    scanId: "22222222-2222-4222-8222-222222222222",
    completedAt: "2026-07-25T10:00:00.000Z",
    url: "https://oxfam.org",
    policySurfaceObservations: [{
      observationId: "policy_surface_oxfam_privacy",
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://www.oxfam.org/en/privacy-policy",
      textExcerpt: "Our payment provider is certified under the EU-US Privacy Shield.",
      observedTopics: ["international_transfers"],
      policyCookieDisclosures: [],
      mentionedRights: [],
      confidence: 0.98
    }, {
      observationId: "policy_surface_oxfam_cookies",
      surfaceType: "cookie_policy",
      status: "fetched",
      url: "https://www.oxfam.org/en/cookies",
      textExcerpt: "Cookies include _ga, _gid, __stripe_mid, and fundraiseup_session.",
      observedTopics: ["cookies"],
      policyCookieDisclosures: [],
      mentionedRights: [],
      confidence: 0.97
    }],
    cmpRuntimeObservations: [],
    consentUiObservations: [],
    cookieEvents: [{
      cookieName: "_ga",
      cookieDomain: "oxfam.org",
      cookieParty: "first_party",
      cookiePurpose: "analytics",
      timestampMs: 1950
    }],
    normalizedVendorObservations: [],
    storageSnapshots: [{
      localStorageKeys: ["oxfam-consent-state"],
      sessionStorageKeys: []
    }],
    derivedRuntimeSignals: {}
  } as unknown as CanonicalEvidenceBundle, {
    scanId: "33333333-3333-4333-8333-333333333333"
  });

  assert.ok(packet);
  assert.equal(packet.scanId, "33333333-3333-4333-8333-333333333333");
  assert.deepEqual(
    packet.documents.map((document) => document.documentId),
    ["policy_surface_oxfam_privacy", "policy_surface_oxfam_cookies"]
  );
  assert.deepEqual(
    packet.documents.map((document) => document.targetRelationship),
    ["target_controller", "target_controller"]
  );
  assert.ok(
    packet.documents.every((document) =>
      document.ownershipReasonCodes.includes("same_canonical_hostname_as_scan_target")
    )
  );
  assert.match(packet.documents[1]?.text ?? "", /fundraiseup_session/);
  assert.equal((packet.runtimeContext.cookies as Array<{ cookieName?: string }>)[0]?.cookieName, "_ga");
  assert.deepEqual(packet.runtimeContext.storageKeys, ["oxfam-consent-state"]);
  assert.deepEqual(
    deriveDeterministicLegalFrameworkSignals(packet).map((signal) => signal.frameworkId),
    ["eu_us_privacy_shield"]
  );
});

test("canonical policy transport deduplicates identical retained content without mutating evidence", () => {
  const duplicatePolicyText = [
    "Privacy Notice",
    "We use personal information to provide services and process orders.",
    "You may request access, correction, or deletion of your information."
  ].join("\n\n");
  const bundle = {
    scanId: "22222222-2222-4222-8222-222222222222",
    completedAt: "2026-07-25T10:00:00.000Z",
    url: "https://example.com",
    policySurfaceObservations: [{
      observationId: "policy_primary",
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://example.com/privacy?ref=footer",
      textExcerpt: duplicatePolicyText,
      observedTopics: ["processing_purposes", "data_subject_rights"],
      policyCookieDisclosures: [],
      mentionedRights: ["access", "deletion"],
      confidence: 0.98
    }, {
      observationId: "policy_redirect_variant",
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://www.example.com/privacy",
      textExcerpt: duplicatePolicyText,
      observedTopics: ["processing_purposes", "data_subject_rights"],
      policyCookieDisclosures: [],
      mentionedRights: ["access", "deletion"],
      confidence: 0.98
    }, {
      observationId: "cookie_policy",
      surfaceType: "cookie_policy",
      status: "fetched",
      url: "https://example.com/cookies",
      textExcerpt: "We use cookies named consent_preferences and session_id.",
      observedTopics: ["cookies"],
      policyCookieDisclosures: [],
      mentionedRights: [],
      confidence: 0.97
    }],
    cmpRuntimeObservations: [],
    consentUiObservations: [],
    cookieEvents: [],
    normalizedVendorObservations: [],
    storageSnapshots: [],
    derivedRuntimeSignals: {}
  } as unknown as CanonicalEvidenceBundle;

  const packet = buildPolicyReviewPacketFromCanonicalBundle(bundle);

  assert.ok(packet);
  assert.equal(bundle.policySurfaceObservations.length, 3);
  assert.equal(packet.documents.length, 2);
  assert.equal(packet.policyCandidates.length, 2);
  assert.deepEqual(
    packet.documents.map((document) => document.documentId),
    ["policy_primary", "cookie_policy"]
  );
});

test("content deduplication keeps the strongest retained source metadata", () => {
  const duplicatePolicyText = "We process account information to provide requested services.";
  const packet = buildPolicyReviewPacketFromCanonicalBundle({
    scanId: "22222222-2222-4222-8222-222222222222",
    completedAt: "2026-07-25T10:00:00.000Z",
    url: "https://example.com",
    policySurfaceObservations: [{
      observationId: "weaker_source",
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://example.com/privacy?source=footer",
      textExcerpt: duplicatePolicyText,
      observedTopics: ["processing_purposes"],
      policyCookieDisclosures: [],
      mentionedRights: [],
      confidence: 0.72,
      ownershipConfidence: 0.7
    }, {
      observationId: "verified_source",
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://www.example.com/privacy",
      textExcerpt: duplicatePolicyText,
      observedTopics: ["processing_purposes"],
      policyCookieDisclosures: [],
      mentionedRights: [],
      confidence: 0.99,
      documentEvaluationState: "usable",
      documentFetchState: "fetched",
      ownershipConfidence: 0.99
    }],
    cmpRuntimeObservations: [],
    consentUiObservations: [],
    cookieEvents: [],
    normalizedVendorObservations: [],
    storageSnapshots: [],
    derivedRuntimeSignals: {}
  } as unknown as CanonicalEvidenceBundle);

  assert.ok(packet);
  assert.equal(packet.documents.length, 1);
  assert.equal(packet.documents[0]?.documentId, "verified_source");
  assert.equal(packet.policyCandidates[0]?.canonical_url, "https://www.example.com/privacy");
});

test("Mini transport removes repeated prose while the canonical packet retains it", () => {
  const packet = buildFixturePacket(
    "We use personal data to provide services. You may request access or deletion."
  );
  packet.policyCandidates = [{
    page_type: "privacy_policy",
    retained_article13_section_evidence: [{
      topic: "processing_purposes",
      selectedPolicySectionExcerpt: "We use personal data to provide services."
    }, {
      topic: "international_transfers",
      selectedPolicySectionExcerpt: "Data may be transferred to another jurisdiction."
    }]
  }];

  const reviewInput = buildPolicyReviewInput(packet);
  const transportedDocument = reviewInput.documents[0] as Record<string, unknown>;
  const transportedCandidate = reviewInput
    .deterministicAndExtractionCandidates[0] as Record<string, unknown>;
  const transportedArticle13Evidence = transportedCandidate
    .retained_article13_section_evidence as Array<Record<string, unknown>>;

  assert.equal("extractedCandidates" in transportedDocument, false);
  assert.equal(transportedCandidate.retained_article13_section_evidence_count, 2);
  assert.equal(transportedArticle13Evidence[0]?.excerptRetainedInDocument, true);
  assert.equal("selectedPolicySectionExcerpt" in transportedArticle13Evidence[0]!, false);
  assert.equal(transportedArticle13Evidence[1]?.excerptRetainedInDocument, false);
  assert.equal(
    transportedArticle13Evidence[1]?.selectedPolicySectionExcerpt,
    "Data may be transferred to another jurisdiction."
  );
  assert.equal(
    Array.isArray(packet.policyCandidates[0]?.retained_article13_section_evidence),
    true
  );
  assert.equal(
    Array.isArray(packet.documents[0]?.extractedCandidates.policy_mentions),
    true
  );
});

test("Mini request uses bounded output limits and the compact transport view", async () => {
  const packet = buildFixturePacket(
    "We use personal data to provide services. You may request access or deletion."
  );
  packet.policyCandidates = [{
    page_type: "privacy_policy",
    retained_article13_section_evidence: [{
      topic: "processing_purposes",
      selectedPolicySectionExcerpt: "We use personal data to provide services."
    }]
  }];
  let requestBody: Record<string, unknown> | undefined;

  await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        model: "gpt-5.4-mini",
        choices: [{ message: { content: JSON.stringify({ rows: completeRows() }) } }]
      }), { status: 200 });
    },
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });

  assert.equal(requestBody?.max_completion_tokens, 6_000);
  const messages = requestBody?.messages as Array<{ content?: string }>;
  const transportedInput = JSON.parse(messages[1]?.content ?? "{}") as {
    documents?: Array<Record<string, unknown>>;
    deterministicAndExtractionCandidates?: Array<Record<string, unknown>>;
  };
  assert.equal("extractedCandidates" in (transportedInput.documents?.[0] ?? {}), false);
  const transportedCandidate = transportedInput
    .deterministicAndExtractionCandidates?.[0] ?? {};
  const transportedArticle13Evidence = transportedCandidate
    .retained_article13_section_evidence as Array<Record<string, unknown>>;
  assert.equal(
    "selectedPolicySectionExcerpt" in transportedArticle13Evidence[0]!,
    false
  );
  const responseFormat = requestBody?.response_format as {
    json_schema?: {
      schema?: {
        properties?: {
          rows?: {
            properties?: {
              processing_purposes?: {
                properties?: {
                  evidenceExcerpts?: { maxItems?: number };
                  rationale?: { maxLength?: number };
                };
              };
            };
          };
        };
      };
    };
  };
  const rowProperties = responseFormat.json_schema?.schema?.properties?.rows
    ?.properties?.processing_purposes?.properties;
  assert.equal(rowProperties?.evidenceExcerpts?.maxItems, 2);
  assert.equal(rowProperties?.rationale?.maxLength, 320);
});

test("static policy review requests only policy-stable topics with a smaller output bound", async () => {
  const packet = buildFixturePacket(
    "We use personal data to provide services and retain it only as long as necessary."
  );
  let requestBody: Record<string, unknown> | undefined;
  const staticRows = Object.fromEntries(
    STATIC_POLICY_REVIEW_TOPICS.map((topic) => [topic, completeRows()[topic]])
  );

  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        model: "gpt-5.4-mini",
        choices: [{ message: { content: JSON.stringify({ rows: staticRows }) } }]
      }), { status: 200 });
    },
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet: { ...packet, contentHash: buildPolicyStaticContentHash(packet) },
    reviewPhase: "static",
    topics: STATIC_POLICY_REVIEW_TOPICS,
  });
  const responseFormat = requestBody?.response_format as {
    json_schema?: { schema?: { properties?: { rows?: { required?: string[] } } } };
  };

  assert.equal(requestBody?.max_completion_tokens, 4_500);
  assert.deepEqual(
    responseFormat.json_schema?.schema?.properties?.rows?.required,
    [...STATIC_POLICY_REVIEW_TOPICS],
  );
  assert.equal(artifact.rows.length, 6);
  assert.equal(artifact.productionEligible, false);
});

test("static policy review hash joins same-day packets but changes across scan dates", () => {
  const packet = buildFixturePacket("We use personal data to provide requested services.");
  const sameDayPacket = {
    ...packet,
    scanDate: "2026-07-25T10:00:29.000Z",
  };
  const nextDayPacket = {
    ...packet,
    scanDate: "2026-07-26T00:00:01.000Z",
  };

  assert.equal(
    buildPolicyStaticContentHash(packet),
    buildPolicyStaticContentHash(sameDayPacket),
  );
  assert.notEqual(
    buildPolicyStaticContentHash(packet),
    buildPolicyStaticContentHash(nextDayPacket),
  );
});

test("static policy projection ignores non-semantic handoff drift without losing retained policy evidence", () => {
  const earlyPacket = buildFixturePacket(
    "We use personal data to provide requested services and retain it only as needed.",
  );
  earlyPacket.evidenceCoverage.policySurfaceInspection = {
    outcome: "privacy_policy_observed",
    coverageStatus: "complete",
    linkDiscoveryCoverageStatus: "complete",
    documentRetrievalCoverageStatus: "usable",
    inspectionCompleted: true,
    privacyPolicyObserved: true,
    observedSurfaceTypes: ["privacy_policy", "cookie_policy"],
    limitationKeys: [],
  };
  const terminalPacket = {
    ...earlyPacket,
    evidenceCoverage: {
      ...earlyPacket.evidenceCoverage,
      policySurfaceInspection: {
        ...earlyPacket.evidenceCoverage.policySurfaceInspection,
        observedSurfaceTypes: [
          "privacy_policy",
          "cookie_policy",
          "accessibility_statement",
        ],
      },
      runtimeCoverage: {
        coverageStatus: "usable",
        observationCounts: { cookies: 4, vendors: 2 },
      },
    },
    runtimeContext: {
      cookies: [{ cookieName: "runtime-only" }],
    },
    scanContext: {
      ...earlyPacket.scanContext,
      region: "local",
    },
    scanDate: "2026-07-25T10:00:00.141Z",
  };

  const earlyStatic = buildStaticPolicyReviewPacket(earlyPacket);
  const terminalStatic = buildStaticPolicyReviewPacket(terminalPacket);

  assert.deepEqual(earlyStatic, terminalStatic);
  assert.equal(earlyStatic.documents, earlyPacket.documents);
  assert.equal(earlyStatic.policyCandidates, earlyPacket.policyCandidates);
  assert.equal(earlyStatic.scanContext.region, null);
  assert.equal(earlyStatic.scanDate, "2026-07-25");
  assert.deepEqual(earlyStatic.runtimeContext, {});
  assert.deepEqual(earlyStatic.evidenceCoverage.runtimeCoverage, {});
  assert.equal(
    "observedSurfaceTypes" in earlyStatic.evidenceCoverage.policySurfaceInspection,
    false,
  );
  assert.equal(
    buildPolicyStaticContentHash(earlyPacket),
    buildPolicyStaticContentHash(terminalPacket),
  );
});

test("deterministic framework validity detects obsolete and current transfer mechanisms independently of Mini", () => {
  const packet = buildFixturePacket(
    "Our payment provider is certified under the EU-US Privacy Shield. We also rely on the EU-US Data Privacy Framework."
  );
  const signals = deriveDeterministicLegalFrameworkSignals(packet);
  assert.deepEqual(
    signals.map((signal) => [signal.frameworkId, signal.validityStatus]),
    [
      ["eu_us_privacy_shield", "invalidated"],
      ["eu_us_data_privacy_framework", "current"]
    ]
  );
  assert.deepEqual(
    deriveDeterministicPolicyReviewSignals(packet).map((signal) => [
      signal.findingKey,
      signal.frameworkId,
      signal.validityStatus
    ]),
    [[
      "outdated_transfer_framework_referenced",
      "eu_us_privacy_shield",
      "invalidated"
    ]]
  );
});

test("absence labels fail closed when retained source coverage is incomplete", async () => {
  const packet = buildFixturePacket("Privacy center navigation and marketing links.");
  packet.documents[0]!.contentCoverage.status = "truncated";
  packet.documents[0]!.contentCoverage.limitationKeys = ["policy_section_text_bounded"];
  const rows = completeRows({
    legal_basis: {
      status: "not_observed_with_sufficient_coverage",
      confidence: 0.96,
      reasonCodes: ["no_legal_basis_found"],
      rationale: "No legal basis was found."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const legalBasis = artifact.rows.find((row) => row.topic === "legal_basis");
  assert.equal(legalBasis?.status, "insufficient_retained_evidence");
  assert.ok(legalBasis?.reasonCodes.includes("sufficient_coverage_precondition_not_met"));
});

test("truncated retention headings remain insufficient instead of receiving credit", async () => {
  const packet = buildFixturePacket("How long do we keep your data");
  packet.documents[0]!.contentCoverage.status = "truncated";
  packet.documents[0]!.contentCoverage.limitationKeys = ["policy_section_text_bounded"];
  const rows = completeRows({
    data_retention: {
      status: "observed",
      confidence: 0.93,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["How long do we keep your data"],
      reasonCodes: ["retention_heading"],
      rationale: "A retention heading was retained."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const retention = artifact.rows.find((row) => row.topic === "data_retention");
  assert.equal(retention?.status, "insufficient_retained_evidence");
  assert.ok(retention?.reasonCodes.includes("retention_evidence_truncated_or_incomplete"));
});

test("retention-shaped text cannot receive processing-purpose credit", async () => {
  const packet = buildFixturePacket(
    "We keep personal data for seven years and delete it after the applicable retention period."
  );
  const rows = completeRows({
    processing_purposes: {
      status: "observed",
      confidence: 0.94,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["We keep personal data for seven years."],
      reasonCodes: ["processing_language"],
      rationale: "Processing language was retained."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const purposes = artifact.rows.find((row) => row.topic === "processing_purposes");
  assert.equal(purposes?.status, "ambiguous");
  assert.ok(
    purposes?.reasonCodes.includes(
      "processing_purposes_topic_relevance_not_deterministically_confirmed"
    )
  );
});

test("a directly relevant purpose excerpt is not vetoed by unrelated policy text", async () => {
  const packet = buildFixturePacket(
    "How long do we keep your data? We retain it for seven years. We use the information for the purposes for which it was collected."
  );
  const rows = completeRows({
    processing_purposes: {
      status: "observed",
      confidence: 0.94,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: [
        "We use the information for the purposes for which it was collected."
      ],
      reasonCodes: ["processing_purpose_statement"],
      rationale: "A directly relevant processing-purpose statement was retained."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });

  assert.equal(
    artifact.rows.find((row) => row.topic === "processing_purposes")?.status,
    "observed"
  );
});

test("strong typed retained evidence confirms an observed topic when literal phrase matching is too narrow", async () => {
  const retainedExcerpt =
    "For What Purposes Does Example Use Your Personal Information? We use your personal information to operate, provide, develop, and improve the services we offer.";
  const packet = buildFixturePacket(retainedExcerpt);
  packet.documents[0]!.extractedCandidates = {
    retained_article13_section_evidence: [{
      coverageArea: "processing_purposes",
      selectedPolicySectionExcerpt: retainedExcerpt,
      selectedPolicySectionHeading: "For What Purposes Does Example Use Your Personal Information?",
      selectedPolicySectionUrl: packet.documents[0]!.canonicalUrl,
      selectedEvidenceStrength: "strong",
      signalObserved: "observed"
    }]
  };
  const rows = completeRows({
    processing_purposes: {
      status: "observed",
      confidence: 0.94,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: [retainedExcerpt],
      reasonCodes: ["processing_purpose_statement"],
      rationale: "A directly relevant processing-purpose statement was retained."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });

  const purposes = artifact.rows.find((row) => row.topic === "processing_purposes");
  assert.equal(purposes?.status, "observed");
  assert.ok(purposes?.reasonCodes.includes("verified_retained_topic_evidence"));
  assert.equal(purposes?.evidenceExcerpts[0], retainedExcerpt);
});

test("typed retained topic evidence cannot rescue a model row without a matching document reference", async () => {
  const retainedExcerpt =
    "For What Purposes Does Example Use Your Personal Information? We use your personal information to improve our services.";
  const packet = buildFixturePacket(retainedExcerpt);
  packet.documents[0]!.extractedCandidates = {
    retained_article13_section_evidence: [{
      coverageArea: "processing_purposes",
      selectedPolicySectionExcerpt: retainedExcerpt,
      selectedPolicySectionUrl: packet.documents[0]!.canonicalUrl,
      selectedEvidenceStrength: "strong",
      signalObserved: "observed"
    }]
  };
  const rows = completeRows({
    processing_purposes: {
      status: "observed",
      confidence: 0.94,
      sourceDocumentIds: [],
      sourceUrls: [],
      evidenceExcerpts: [retainedExcerpt],
      reasonCodes: ["processing_purpose_statement"],
      rationale: "A processing-purpose statement was retained."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });

  const purposes = artifact.rows.find((row) => row.topic === "processing_purposes");
  assert.equal(purposes?.status, "ambiguous");
  assert.ok(!purposes?.reasonCodes.includes("verified_retained_topic_evidence"));
});

test("a retained numeric retention range receives credit", async () => {
  const packet = buildFixturePacket(
    "In Europe, the retention periods are generally between 6 and 10 years."
  );
  const rows = completeRows({
    data_retention: {
      status: "observed",
      confidence: 0.96,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: [
        "In Europe, the retention periods are generally between 6 and 10 years."
      ],
      reasonCodes: ["retention_range"],
      rationale: "A numeric retention range was retained."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });

  assert.equal(
    artifact.rows.find((row) => row.topic === "data_retention")?.status,
    "observed"
  );
});

test("service-provider policy passages cannot establish target policy findings", async () => {
  const packet = buildFixturePacket(
    "Cloudflare processes personal data to provide security and content-delivery services."
  );
  packet.documents[0]!.documentOwnerEntity = "Cloudflare";
  packet.documents[0]!.targetRelationship = "service_provider";
  packet.documents[0]!.ownershipConfidence = 0.95;
  const rows = completeRows({
    processing_purposes: {
      status: "observed",
      confidence: 0.97,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["Cloudflare processes personal data to provide security services."],
      reasonCodes: ["purpose_statement"],
      rationale: "Processing purposes were retained."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const purposes = artifact.rows.find((row) => row.topic === "processing_purposes");
  assert.equal(purposes?.status, "insufficient_retained_evidence");
  assert.ok(purposes?.reasonCodes.includes("cited_policy_sources_not_attributed_to_target"));
});

test("framework validity does not turn transfer disclosure into a conflicting row", async () => {
  const packet = buildFixturePacket(
    "We transfer personal data internationally using Standard Contractual Clauses. Our payment provider is also certified under the EU-US Privacy Shield."
  );
  const rows = completeRows({
    international_transfers: {
      status: "conflicting",
      confidence: 0.94,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["We use Standard Contractual Clauses."],
      conflictingExcerpts: ["Our payment provider is certified under the EU-US Privacy Shield."],
      reasonCodes: ["current_and_invalid_frameworks"],
      rationale: "Current and invalid frameworks coexist."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const transfers = artifact.rows.find((row) => row.topic === "international_transfers");
  assert.equal(transfers?.status, "observed");
  assert.ok(transfers?.reasonCodes.includes("framework_validity_reported_separately"));
  assert.equal(artifact.deterministicPolicyReviewSignals.length, 1);
});

test("policy/runtime comparison carries a dedicated comparison outcome", async () => {
  const packet = buildFixturePacket(
    "Analytics storage is used only after a visitor consents."
  );
  const rows = completeRows({
    policy_runtime_consistency: {
      status: "conflicting",
      confidence: 0.97,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["Analytics storage is used only after consent."],
      conflictingExcerpts: ["Runtime cookie _ga was observed before consent."],
      reasonCodes: ["preconsent_runtime_contradiction"],
      rationale: "A directly comparable runtime observation contradicts the retained promise."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const comparison = artifact.rows.find((row) => row.topic === "policy_runtime_consistency");
  assert.equal(comparison?.comparisonOutcome, "material_contradiction_retained");
});

test("Mini policy review can reject retention text as purposes evidence while retaining retention", async () => {
  const packet = buildFixturePacket(
    "How long do we keep your data? We retain personal data for seven years."
  );
  const rows = completeRows({
    processing_purposes: {
      status: "not_observed_with_sufficient_coverage",
      confidence: 0.94,
      reasonCodes: ["retention_is_not_purpose"],
      rationale: "The passage addresses duration, not why data is processed."
    },
    data_retention: {
      status: "observed",
      confidence: 0.98,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["We retain personal data for seven years."],
      rationale: "A specific retention period is disclosed."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini-2026-07-01",
      choices: [{ message: { content: JSON.stringify({ rows }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  assert.equal(artifact.status, "completed");
  assert.equal(
    artifact.rows.find((row) => row.topic === "processing_purposes")?.status,
    "not_observed_with_sufficient_coverage"
  );
  assert.equal(
    artifact.rows.find((row) => row.topic === "data_retention")?.status,
    "observed"
  );
  assert.equal(artifact.productionEligible, false);
  assert.equal(artifact.provenance.usedForProductionProjection, false);
});

test("Mini policy review recognizes a substantive multilingual purpose statement", async () => {
  const packet = buildFixturePacket(
    "Utilizamos sus datos personales para procesar sus donaciones, emitir recibos y responder a sus solicitudes."
  );
  const rows = completeRows({
    processing_purposes: {
      status: "observed",
      confidence: 0.96,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["Utilizamos sus datos personales para procesar sus donaciones."],
      rationale: "The passage directly states why personal data is processed."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  assert.equal(
    artifact.rows.find((row) => row.topic === "processing_purposes")?.status,
    "observed"
  );
});

test("runtime cookie names establish observed cookie/storage names", async () => {
  const packet = buildFixturePacket(
    "We use functional, preference, analytics, and marketing cookie categories. Manage them in cookie settings. ".repeat(8)
  );
  packet.documents[0]!.documentType = "cookie_policy";
  packet.policyCandidates = [{
    page_type: "cookie_policy",
    policy_summary_short: "A complete category-based cookie statement without named cookie identifiers."
  }];
  packet.runtimeContext.cookies = [{ cookieName: "_ga" }, { cookieName: "OptanonConsent" }];
  const rows = completeRows({
    cookie_inventory: {
      status: "observed",
      confidence: 0.98,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["Runtime cookies include _ga and OptanonConsent."],
      reasonCodes: ["runtime_cookie_names"],
      rationale: "Runtime names were observed."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const cookieInventory = artifact.rows.find((row) => row.topic === "cookie_inventory");
  assert.equal(cookieInventory?.status, "observed");
  assert.ok(cookieInventory?.reasonCodes.includes("retained_cookie_storage_name_observed"));
  assert.ok(cookieInventory?.reasonCodes.includes("runtime_cookie_storage_name_observed"));
  assert.match(cookieInventory?.rationale ?? "", /runtime evidence/i);
});

test("runtime storage keys establish observed cookie/storage names", async () => {
  const packet = buildFixturePacket("This policy describes our use of browser storage.");
  packet.runtimeContext.storageKeys = ["consent-preferences"];
  const rows = completeRows();
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const cookieInventory = artifact.rows.find((row) => row.topic === "cookie_inventory");
  assert.equal(cookieInventory?.status, "observed");
  assert.match(cookieInventory?.evidenceExcerpts[0] ?? "", /consent-preferences/);
  assert.ok(cookieInventory?.reasonCodes.includes("runtime_cookie_storage_name_observed"));
});

test("category-only cookie policy without retained names does not establish observed cookie/storage names", async () => {
  const packet = buildFixturePacket(
    "We use functional, preference, analytics, and marketing cookie categories. Manage them in cookie settings. ".repeat(8)
  );
  packet.documents[0]!.documentType = "cookie_policy";
  packet.policyCandidates = [{
    page_type: "cookie_policy",
    policy_summary_short: "A complete category-based cookie statement without named cookie identifiers."
  }];
  const rows = completeRows({
    cookie_inventory: {
      status: "observed",
      confidence: 0.98,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["The policy lists functional and analytics cookie categories."],
      reasonCodes: ["cookie_categories"],
      rationale: "Cookie categories were observed."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  const cookieInventory = artifact.rows.find((row) => row.topic === "cookie_inventory");
  assert.equal(cookieInventory?.status, "not_observed_with_sufficient_coverage");
  assert.equal(cookieInventory?.evidenceExcerpts.length, 0);
  assert.ok(cookieInventory?.reasonCodes.includes("deterministic_cookie_storage_name_required"));
});

test("directly named policy cookies satisfy the deterministic inventory invariant", async () => {
  const packet = buildFixturePacket(
    "The cookies we use include __stripe_mid, _ga, _gid, and fundraiseup_session."
  );
  const rows = completeRows({
    cookie_inventory: {
      status: "observed",
      confidence: 0.98,
      sourceDocumentIds: [packet.documents[0]!.documentId],
      sourceUrls: [packet.documents[0]!.canonicalUrl],
      evidenceExcerpts: ["The cookies we use include __stripe_mid and _ga."],
      reasonCodes: ["named_cookie_identifiers"],
      rationale: "Specific policy cookie identifiers are named."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  assert.equal(
    artifact.rows.find((row) => row.topic === "cookie_inventory")?.status,
    "observed"
  );
});

test("generic retention and preference opt-outs cannot become substantive retention or rights credit", async () => {
  const packet = buildFixturePacket(
    "This notice describes how we collect, use, process, disclose and retain information. You may unsubscribe from email or opt out of interest-based advertising."
  );
  const rows = completeRows({
    data_retention: {
      status: "observed",
      confidence: 0.95,
      evidenceExcerpts: ["We retain information."],
      reasonCodes: ["retention_mentioned"],
      rationale: "Retention is mentioned."
    },
    data_subject_rights: {
      status: "observed",
      confidence: 0.92,
      evidenceExcerpts: ["You may unsubscribe or opt out of advertising."],
      reasonCodes: ["opt_out_language"],
      rationale: "Opt-out language was found."
    }
  });
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      model: "gpt-5.4-mini",
      choices: [{ message: { content: JSON.stringify({ rows }) } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  assert.equal(
    artifact.rows.find((row) => row.topic === "data_retention")?.status,
    "ambiguous"
  );
  assert.equal(
    artifact.rows.find((row) => row.topic === "data_subject_rights")?.status,
    "ambiguous"
  );
});

test("malformed Mini output fails closed with an explicit non-production artifact", async () => {
  const packet = buildFixturePacket("We process data to provide donation services.");
  const artifact = await reviewPolicyPacketWithMini({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{\"rows\":[]}" } }]
    }), { status: 200 }),
    mode: "shadow",
    model: "gpt-5.4-mini",
    packet
  });
  assert.equal(artifact.status, "failed");
  assert.match(artifact.failureReason ?? "", /required topic map/i);
  assert.equal(artifact.rows.length, 0);
  assert.equal(artifact.productionEligible, false);
});

test("policy cache key changes with model or content", () => {
  const first = buildPolicyReviewCacheKey({
    contentHash: "a".repeat(64),
    model: "gpt-5.4-mini"
  });
  const second = buildPolicyReviewCacheKey({
    contentHash: "b".repeat(64),
    model: "gpt-5.4-mini"
  });
  const third = buildPolicyReviewCacheKey({
    contentHash: "a".repeat(64),
    model: "gpt-5.4-mini-new"
  });
  assert.notEqual(first, second);
  assert.notEqual(first, third);
});
