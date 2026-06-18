import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  type PolicyNanoAssistProvider,
  policySurfaceScanner,
  wwwFallbackUrlForPolicyFetch,
} from "./scanners/policy-surface-scanner.js";
import { startStaticFixtureServer, type StaticFixturePage } from "./test-fixtures/static-server.js";

test("policySurfaceScanner discovers footer privacy links and bounded policy facts", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.discoveryMethod, "nano_assisted_link_classification");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
    assert.deepEqual(privacy?.mentionedVendors.sort(), ["Google Analytics", "Meta"]);
    assert.equal(privacy?.observedTopics.includes("analytics"), true);
    assert.equal(privacy?.observedTopics.includes("advertising"), true);
    assert.ok((privacy?.textExcerpt?.length ?? 0) <= 6_000);
    assert.equal(privacy?.sourceScanner, "policy_surface");
    assert.equal(privacy?.consentStateAtTime, "not_applicable");
  });
});

test("policySurfaceScanner fast mode skips rendered discovery and Nano link ranking when static links are sufficient", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(labels.includes("rendered discovery skipped"), true);
    assert.equal(labels.includes("deterministic link ranking"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run in fast static coverage mode.");
      },
    },
  });
});

test("policySurfaceScanner classifies expected policy and control surfaces", async () => {
  const cases = [
    ["policy-cookie-link", "cookie_policy", "cookies"],
    ["policy-privacy-choices-link", "your_privacy_choices", "global_privacy_control"],
    ["policy-state-privacy-rights-link", "california_notice", "california_privacy_rights"],
    ["policy-do-not-sell-link", "do_not_sell_or_share", "do_not_sell_or_share"],
    ["policy-notice-at-collection-link", "notice_at_collection", "notice_at_collection"],
    ["policy-gpc-disclosure", "privacy_policy", "global_privacy_control"],
    ["policy-session-replay-disclosure", "privacy_policy", "session_replay_or_behavioral_analytics"],
    ["policy-ai-disclosure", "ai_disclosure", "ai_features"],
  ] as const;

  for (const [page, surfaceType, topic] of cases) {
    await withPolicyScan(page, async ({ result }) => {
      const surface = result.policySurfaceObservations.find((observation) =>
        observation.surfaceType === surfaceType &&
        observation.status === "fetched" &&
        observation.observedTopics.includes(topic),
      );
      assert.ok(surface, `${page} should observe ${surfaceType} with ${topic}`);
    });
  }
});

test("policySurfaceScanner anchors bounded excerpts on high-value detected policy topics", async () => {
  await withPolicyScan("policy-gpc-disclosure-late", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.observedTopics.includes("global_privacy_control"), true);
    assert.match(privacy?.textExcerpt ?? "", /Global Privacy Control/);
    assert.ok((privacy?.textExcerpt?.length ?? 0) <= 6_000);
  });
});

test("policySurfaceScanner discovers delayed and accessible-attribute policy links", async () => {
  for (const page of ["policy-footer-privacy-delayed", "policy-link-aria-title"] as const) {
    await withPolicyScan(page, async ({ result, baseUrl }) => {
      const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

      assert.equal(privacy?.status, "fetched");
      assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
      assert.equal(privacy?.fetchable, true);
    });
  }
});

test("policySurfaceScanner sends delayed global footer links to Nano before common-path fallback", async () => {
  const classifiedBatches: string[][] = [];
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifiedBatches.push(input.candidates.map((candidate) =>
        `${candidate.discoveryMethod}:${candidate.normalizedUrl}`,
      ));
      const rankedCandidates = input.candidates
        .filter((candidate) =>
          candidate.discoveryMethod !== "guessed_common_path" &&
          candidate.deterministicSurfaceType !== "unknown",
        )
        .map((candidate, index) => ({
          candidateId: candidate.candidateId,
          likelySurfaceType: candidate.deterministicSurfaceType,
          shouldFetch: true,
          priorityRank: index + 1,
          confidence: 0.9,
          reason: "Mock Nano selected hydrated global footer link.",
        }));
      return { assistId: input.assistId, rankedCandidates };
    },
  };

  await withPolicyScan("policy-global-footer-delayed", async ({ result, baseUrl }) => {
    const firstBatch = classifiedBatches[0] ?? [];

    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/policies/privacy`)), true);
    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/policies/cookies`)), true);
    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/privacy-center`)), true);
    assert.equal(firstBatch.some((entry) => entry.includes(`${baseUrl}/do-not-sell-or-share`)), true);
    assert.equal(firstBatch.some((entry) => entry.startsWith("guessed_common_path:")), false);
    assert.equal(observedSurface(result.policySurfaceObservations, "privacy_policy")?.status, "fetched");
    assert.equal(observedSurface(result.policySurfaceObservations, "cookie_policy")?.status, "fetched");
    assert.equal(observedSurface(result.policySurfaceObservations, "consent_preferences")?.status, "observed");
    assert.equal(observedSurface(result.policySurfaceObservations, "do_not_sell_or_share")?.status, "fetched");
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner retains secondary CCPA and GPC policy surfaces when Nano only ranks privacy policy", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const privacy = input.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/policies/webmd-like-privacy"),
      );
      return {
        assistId: input.assistId,
        rankedCandidates: privacy
          ? [{
            candidateId: privacy.candidateId,
            likelySurfaceType: "privacy_policy",
            shouldFetch: true,
            priorityRank: 1,
            confidence: 0.94,
            reason: "Mock Nano under-selected the primary privacy policy only.",
          }]
          : [],
      };
    },
  };

  await withPolicyScan("policy-webmd-like-secondary-surfaces", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/webmd-like-privacy` &&
      observation.status === "fetched"
    );
    const cookie = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/webmd-like-cookie-policy` &&
      observation.surfaceType === "cookie_policy" &&
      observation.status === "fetched"
    );
    const statePrivacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/policies/webmd-like-state-privacy` &&
      observation.surfaceType === "california_notice" &&
      observation.status === "fetched"
    );

    assert.ok(privacy);
    assert.ok(cookie);
    assert.ok(statePrivacy);
    assert.equal(statePrivacy.observedTopics.includes("notice_at_collection"), true);
    assert.equal(statePrivacy.observedTopics.includes("global_privacy_control"), true);
    assert.equal(statePrivacy.observedTopics.includes("do_not_sell_or_share"), true);
    assert.match(statePrivacy.textExcerpt ?? "", /Information we collect|opt-out preference signal/);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner records preference center controls as observation-only", async () => {
  await withPolicyScan("policy-cmp-preference-control", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");

    assert.equal(settings?.status, "observed");
    assert.equal(settings?.selector, "#ot-sdk-btn");
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-cmp-preference-control`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, true);
    assert.equal(settings?.mayLeadToConsentControls, true);
    assert.equal(settings?.evidenceRefs.length, 0);
  });
});

test("policySurfaceScanner records privacy center links without clicking preference flows", async () => {
  await withPolicyScan("policy-privacy-center-link", async ({ result, baseUrl }) => {
    const center = observedSurface(result.policySurfaceObservations, "consent_preferences");

    assert.equal(center?.status, "observed");
    assert.equal(center?.normalizedUrl, `${baseUrl}/privacy-center`);
    assert.equal(center?.fetchable, true);
    assert.equal(center?.clickable, true);
    assert.equal(center?.mayLeadToConsentControls, true);
  });
});

test("policySurfaceScanner uses common-path fallback when no homepage policy links exist", async () => {
  await withPolicyScan("policy-no-links", async ({ result, baseUrl }) => {
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.discoveryMethod === "nano_assisted_link_classification" &&
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`,
    );

    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
  });
});

test("policySurfaceScanner uses common-path fallback when homepage fetch fails", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/blocked-homepage`,
      normalizedUrl: `${server.baseUrl}/blocked-homepage`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${server.baseUrl}/privacy`
    );

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
    assert.equal(result.moduleRun.errors.length, 0);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed common-path")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner falls back to common paths when Nano declines observed generic links", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifyCalls += 1;
      const fallback = input.candidates.find((candidate) =>
        candidate.discoveryMethod === "guessed_common_path" &&
        candidate.normalizedUrl.endsWith("/privacy"),
      );
      if (!fallback) {
        return { assistId: input.assistId, rankedCandidates: [] };
      }
      return {
        assistId: input.assistId,
        rankedCandidates: [{
          candidateId: fallback.candidateId,
          likelySurfaceType: "privacy_policy",
          shouldFetch: true,
          priorityRank: 1,
          confidence: 0.94,
          reason: "Fallback common privacy path after generic observed links were declined.",
        }],
      };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result, baseUrl }) => {
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`,
    );

    assert.equal(classifyCalls, 2);
    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner gold corpus retains core GDPR policy surfaces through bounded fallback", async () => {
  const cases = [
    {
      page: "policy-gold-ford-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/help/privacy",
    },
    {
      page: "policy-gold-ikea-common-path",
      expectedSurfaceType: "cookie_policy",
      expectedPath: "/global/en/legal/privacy-cookie-statement",
    },
    {
      page: "policy-gold-nvidia-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/en-us/about-nvidia/privacy-policy",
    },
    {
      page: "policy-gold-latimes-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-policy",
    },
    {
      page: "policy-gold-caltech-common-path",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-notice",
    },
  ] as const;

  for (const fixture of cases) {
    await withPolicyScan(fixture.page, async ({ result, baseUrl }) => {
      const fallbackObservations = result.policySurfaceObservations.filter((observation) =>
        observation.discoveryMethod === "guessed_common_path"
      );
      const retained = result.policySurfaceObservations.find((observation) =>
        observation.status === "fetched" &&
        observation.surfaceType === fixture.expectedSurfaceType &&
        observation.normalizedUrl === `${baseUrl}${fixture.expectedPath}`
      );

      assert.ok(retained, `${fixture.page} should retain ${fixture.expectedPath}`);
      assert.ok((retained.textExcerpt?.length ?? 0) > 80, `${fixture.page} should retain usable policy text`);
      assert.ok(fallbackObservations.length <= 8, `${fixture.page} should keep common-path fallback bounded`);
      assert.equal(
        result.moduleRun.timingBreakdown?.some((timing) => timing.label === "common-path policy fetch group"),
        true,
        `${fixture.page} should record fallback timing diagnostics`,
      );
      const diagnostics = await readPolicyCaptureDiagnostics(result);
      assert.equal(diagnostics.corePolicySurfaceRetained, true);
      assert.equal(diagnostics.commonPathFallbackUsed, true);
      assert.ok(diagnostics.coreSurfaceTypes.includes(fixture.expectedSurfaceType));
      assert.ok(diagnostics.observedCandidateCount >= 1);
      assert.ok(diagnostics.fetchedCount >= 1);
      assert.ok(diagnostics.policyCaptureDurationMs >= 0);
    });
  }
});

test("policySurfaceScanner does not let secondary-only surfaces satisfy core GDPR policy availability", async () => {
  await withPolicyScan("policy-gold-latimes-secondary-only", async ({ result }) => {
    const fetchedBeforeFallback = result.policySurfaceObservations.filter((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod !== "guessed_common_path"
    );
    const secondaryOnlyTypes = new Set(fetchedBeforeFallback.map((observation) => observation.surfaceType));
    const fallbackPrivacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod === "guessed_common_path" &&
      observation.surfaceType === "privacy_policy"
    );

    assert.deepEqual([...secondaryOnlyTypes].sort(), ["ai_disclosure", "terms"]);
    assert.ok(fallbackPrivacy);
  });
});

test("policySurfaceScanner dedupes slash variants before applying common-path fallback cap", async () => {
  await withPolicyScan("policy-gold-ford-secondary-only", async ({ result, baseUrl }) => {
    const commonPathUrls = result.policySurfaceObservations
      .filter((observation) => observation.discoveryMethod === "guessed_common_path")
      .map((observation) => observation.normalizedUrl ?? observation.url);

    assert.ok(commonPathUrls.length <= 8);
    assert.equal(commonPathUrls.includes(`${baseUrl}/help/privacy`), true);
    assert.equal(commonPathUrls.includes(`${baseUrl}/help/privacy/`), false);
    assert.equal(new Set(commonPathUrls.map((value) => value.replace(/\/$/, ""))).size, commonPathUrls.length);
  });
});

test("policySurfaceScanner preserves failed policy link attempts without marking them observed", async () => {
  await withPolicyScan("policy-broken-link", async ({ result }) => {
    const broken = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl?.endsWith("/policies/missing-privacy"),
    );

    assert.equal(broken?.status, "failed");
    assert.equal(broken?.httpStatus, 404);
    assert.equal(broken?.evidenceRefs.length, 0);
  });
});

test("policy surface fetch fallback only maps apex HTTPS URLs to same-site www URLs", () => {
  assert.equal(
    wwwFallbackUrlForPolicyFetch("https://caltech.edu/privacy-notice"),
    "https://www.caltech.edu/privacy-notice",
  );
  assert.equal(
    wwwFallbackUrlForPolicyFetch("https://caltech.edu/privacy-notice?source=footer#rights"),
    "https://www.caltech.edu/privacy-notice?source=footer#rights",
  );
  assert.equal(wwwFallbackUrlForPolicyFetch("https://www.caltech.edu/privacy-notice"), null);
  assert.equal(wwwFallbackUrlForPolicyFetch("https://privacy.caltech.edu/notice"), null);
  assert.equal(wwwFallbackUrlForPolicyFetch("http://caltech.edu/privacy-notice"), null);
});

test("policySurfaceScanner records mock Nano link ranking and topic extraction metadata", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const ambiguous = input.candidates.find((candidate) => candidate.linkText === "Your Choices");
      assert.ok(ambiguous);
      return {
        assistId: input.assistId,
        rankedCandidates: [{
          candidateId: ambiguous.candidateId,
          likelySurfaceType: "your_privacy_choices",
          shouldFetch: true,
          priorityRank: 1,
          confidence: 0.91,
          reason: "Ambiguous choices link likely maps to privacy choices.",
          uncertaintyNotes: ["Fixture ambiguity only."],
        }],
      };
    },
    async extractTopics(input) {
      assert.ok(input.excerpt.length <= 6_000);
      if (input.surfaceType !== "your_privacy_choices") {
        return {
          assistId: input.assistId,
          observedTopics: [],
          mentionedVendors: [],
          mentionedPurposes: [],
          mentionedRights: [],
          mentionedControls: [],
          confidence: 0.5,
        };
      }
      return {
        assistId: input.assistId,
        observedTopics: ["global_privacy_control", "sale_or_share"],
        mentionedVendors: ["LiveRamp"],
        mentionedPurposes: ["targeted_advertising"],
        mentionedRights: ["do_not_sell_or_share"],
        mentionedControls: ["global_privacy_control"],
        confidence: 0.84,
        uncertaintyNotes: ["Alias detection came from bounded excerpt only."],
      };
    },
  };

  await withPolicyScan("policy-ambiguous-choices", async ({ result }) => {
    const choices = observedSurface(result.policySurfaceObservations, "your_privacy_choices");

    assert.equal(choices?.discoveryMethod, "nano_assisted_link_classification");
    assert.equal(choices?.directVsInferred, "mixed");
    assert.equal(choices?.assistMetadata.some((meta) => meta.assistType === "link_classification"), true);
    assert.equal(choices?.assistMetadata.some((meta) => meta.assistType === "topic_extraction"), true);
    assert.equal(choices?.assistMetadata.every((meta) => meta.usedForFinalFinding === false), true);
    assert.equal(choices?.mentionedVendors.includes("LiveRamp"), true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner escalates when Nano provider is unavailable", async () => {
  await withPolicyScan("policy-vendor-mentions", async ({ result }) => {
    assert.equal(result.moduleRun.status, "failed");
    assert.equal(
      result.moduleRun.errors.some((error) => error.includes("Nano policy assist is required")),
      true,
    );
    assert.deepEqual(result.policySurfaceObservations, []);
  }, {}, { expectCompleted: false, useDefaultNanoProvider: false });
});

test("policySurfaceScanner escalates when Nano assist is explicitly disabled", async () => {
  await withPolicyScan("policy-vendor-mentions", async ({ result }) => {
    assert.equal(result.moduleRun.status, "failed");
    assert.equal(
      result.moduleRun.errors.some((error) => error.includes("cannot be disabled")),
      true,
    );
  }, { enableNanoPolicyAssist: false }, { expectCompleted: false });
});

test("policySurfaceScanner retains Nano Article 13 disclosure signals as bounded evidence", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async extractTopics(input) {
      return {
        assistId: input.assistId,
        observedTopics: ["legal_basis", "data_subject_rights", "international_transfers"],
        article13DisclosureSignals: [
          {
            disclosureType: "legal_basis",
            status: "observed",
            evidenceText: "We rely on consent, contract, and legitimate interests as lawful bases.",
            confidence: 0.91,
            source: "nano",
          },
          {
            disclosureType: "international_transfers",
            status: "partial",
            evidenceText: "We may transfer personal data outside your country.",
            confidence: 0.67,
            source: "nano",
          },
        ],
        mentionedControls: [],
        mentionedPurposes: ["analytics"],
        mentionedRights: ["access", "delete"],
        mentionedVendors: [],
        confidence: 0.9,
      };
    },
  };

  await withPolicyScan("policy-simple", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    assert.ok(privacy);
    assert.equal(privacy.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed" &&
      signal.source === "nano"
    ), true);
    assert.equal(privacy.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "partial" &&
      signal.source === "nano"
    ), true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner gives Nano enough bounded text for distant Article 13 disclosures", async () => {
  let nanoExcerpt = "";
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async extractTopics(input) {
      nanoExcerpt = input.excerpt;
      return {
        assistId: input.assistId,
        observedTopics: ["data_retention", "data_subject_rights", "international_transfers"],
        article13DisclosureSignals: [
          {
            disclosureType: "data_retention",
            status: "observed",
            evidenceText: "We retain personal data only as long as necessary.",
            confidence: 0.91,
            source: "nano",
          },
          {
            disclosureType: "data_subject_rights",
            status: "observed",
            evidenceText: "You may exercise rights to access, rectification, erasure, restriction, portability, and objection.",
            confidence: 0.9,
            source: "nano",
          },
          {
            disclosureType: "international_transfers",
            status: "observed",
            evidenceText: "We may transfer personal data outside the European Economic Area using standard contractual clauses.",
            confidence: 0.89,
            source: "nano",
          },
        ],
        mentionedControls: [],
        mentionedPurposes: [],
        mentionedRights: ["access", "erasure", "objection"],
        mentionedVendors: [],
        confidence: 0.9,
      };
    },
  };

  await withPolicyScan("policy-article13-long", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.ok((privacy?.textExcerpt?.length ?? 0) > 1_000);
    assert.ok((privacy?.textExcerpt?.length ?? 0) <= 6_000);
    assert.ok(nanoExcerpt.length > 1_000);
    assert.match(nanoExcerpt, /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_retention" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_subject_rights" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "observed"
    ), true);
    assert.match(
      privacy?.article13DisclosureSignals.find((signal) => signal.disclosureType === "legal_basis")?.evidenceText ?? "",
      /lawful bases|legitimate interests/i,
    );
    assert.match(
      privacy?.article13DisclosureSignals.find((signal) => signal.disclosureType === "data_retention")?.evidenceText ?? "",
      /retain personal data only as long as necessary/i,
    );
    assert.match(
      privacy?.article13DisclosureSignals.find((signal) => signal.disclosureType === "international_transfers")?.evidenceText ?? "",
      /standard contractual clauses|European Economic Area/i,
    );
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner does not classify deletion rights alone as retention disclosure", async () => {
  await withPolicyScan("policy-retention-rights-only", async ({ result }) => {
    const article13Signals = result.policySurfaceObservations.flatMap((observation) =>
      observation.surfaceType === "privacy_policy" ? observation.article13DisclosureSignals : []
    );
    const retention = article13Signals.find((signal) => signal.disclosureType === "data_retention");
    const rights = article13Signals.find((signal) => signal.disclosureType === "data_subject_rights");

    assert.equal(retention, undefined);
    assert.equal(rights?.status, "observed");
    assert.match(rights?.evidenceText ?? "", /right to access, delete, erase/i);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner resolves OneTrust notice JSON when privacy page is an error shell", async () => {
  await withPolicyScan("policy-onetrust-notice-json", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /^Processing Error/i);
    assert.match(privacy?.textExcerpt ?? "", /legal bases for processing/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "controller_contact" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_retention" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_subject_rights" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner follows OneTrust index JSON to the final privacy notice", async () => {
  await withPolicyScan("policy-onetrust-index-json", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /^Processing Error/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_subject_rights" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

interface ScanContext {
  result: Awaited<ReturnType<typeof policySurfaceScanner>>;
  baseUrl: string;
}

async function withPolicyScan(
  page: StaticFixturePage,
  run: (context: ScanContext) => Promise<void> | void,
  options: Partial<Parameters<typeof policySurfaceScanner>[0]> = {},
  expectations: { expectCompleted?: boolean; useDefaultNanoProvider?: boolean } = {},
): Promise<void> {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const targetUrl = server.urlFor(page);
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider: expectations.useDefaultNanoProvider === false
        ? undefined
        : createDefaultMockNanoPolicyAssistProvider(),
      ...options,
    });
    if (expectations.expectCompleted !== false) {
      assert.equal(result.moduleRun.status, "completed");
    }
    await run({ result, baseUrl: server.baseUrl });
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function observedSurface(
  observations: Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"],
  surfaceType: string,
): Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number] | undefined {
  return observations.find((observation) =>
    observation.surfaceType === surfaceType &&
    (observation.status === "observed" || observation.status === "fetched"),
  );
}

async function readPolicyCaptureDiagnostics(
  result: Awaited<ReturnType<typeof policySurfaceScanner>>,
): Promise<{
  corePolicySurfaceRetained: boolean;
  coreSurfaceTypes: string[];
  observedCandidateCount: number;
  commonPathFallbackUsed: boolean;
  fetchedCount: number;
  failedCandidateCount: number;
  winningSurfaceUrls: string[];
  policyCaptureDurationMs: number;
}> {
  const ref = result.artifactRefs.find((artifactRef) => artifactRef.artifactId === "policy_surface_capture_diagnostics");
  assert.ok(ref?.path, "policy capture diagnostics artifact should be retained");
  return JSON.parse(await readFile(ref.path, "utf8"));
}

function createDefaultMockNanoPolicyAssistProvider(): PolicyNanoAssistProvider {
  return {
    async classifyLinks(input) {
      const rankedCandidates = input.candidates
        .map((candidate) => {
          const surfaceType = candidate.deterministicSurfaceType !== "unknown"
            ? candidate.deterministicSurfaceType
            : mockSurfaceType(`${candidate.linkText} ${candidate.normalizedUrl}`);
          return {
            candidateId: candidate.candidateId,
            likelySurfaceType: surfaceType,
            shouldFetch: surfaceType !== "unknown",
            priorityRank: mockDiscoveryPriority(candidate.domLocation, candidate.discoveryMethod) + mockSurfacePriority(surfaceType),
            confidence: surfaceType === "unknown" ? 0.1 : 0.88,
            reason: "Mock Nano selected from observed link/url evidence.",
            uncertaintyNotes: [] as string[],
          };
        })
        .filter((candidate) => candidate.shouldFetch)
        .sort((left, right) =>
          left.priorityRank - right.priorityRank ||
          right.confidence - left.confidence ||
          left.candidateId.localeCompare(right.candidateId),
        )
        .slice(0, 8)
        .map((candidate, index) => ({
          ...candidate,
          priorityRank: index + 1,
        }));
      return {
        assistId: input.assistId,
        rankedCandidates,
      };
    },
  };
}

function mockSurfaceType(value: string): Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number]["surfaceType"] {
  const lower = value.toLowerCase();
  if (/do not sell|do-not-sell|do not sell or share/.test(lower)) {
    return "do_not_sell_or_share";
  }
  if (/your privacy choices|privacy choices|your choices/.test(lower)) {
    return "your_privacy_choices";
  }
  if (/preference center|privacy center|privacy settings|consent settings/.test(lower)) {
    return "consent_preferences";
  }
  if (/notice at collection/.test(lower)) {
    return "notice_at_collection";
  }
  if (/california privacy|state privacy rights/.test(lower)) {
    return "california_notice";
  }
  if (/cookie settings|cookie preferences|manage preferences/.test(lower)) {
    return "cookie_settings";
  }
  if (/cookie policy|cookies\b/.test(lower)) {
    return "cookie_policy";
  }
  if (/privacy policy|privacy notice|privacy\b/.test(lower)) {
    return "privacy_policy";
  }
  if (/\bai\b|artificial intelligence/.test(lower)) {
    return "ai_disclosure";
  }
  if (/accessibility/.test(lower)) {
    return "accessibility_statement";
  }
  if (/terms/.test(lower)) {
    return "terms";
  }
  return "unknown";
}

function mockDiscoveryPriority(
  domLocation: "footer" | "header" | "nav" | "body",
  discoveryMethod: Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number]["discoveryMethod"],
): number {
  if (domLocation === "footer") {
    return 0;
  }
  if (domLocation === "header" || domLocation === "nav") {
    return 20;
  }
  return discoveryMethod === "guessed_common_path" ? 80 : 40;
}

function mockSurfacePriority(
  surfaceType: Awaited<ReturnType<typeof policySurfaceScanner>>["policySurfaceObservations"][number]["surfaceType"],
): number {
  const priority = [
    "privacy_policy",
    "cookie_policy",
    "your_privacy_choices",
    "consent_preferences",
    "do_not_sell_or_share",
    "notice_at_collection",
    "california_notice",
    "ai_disclosure",
    "accessibility_statement",
    "terms",
  ].indexOf(surfaceType);
  return priority >= 0 ? priority : 99;
}
