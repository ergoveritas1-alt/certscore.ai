import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  gdprTransparencyTopicCandidatesFromRetainedPolicySections,
  isFetchablePolicyCandidateForPolicySurface,
  isFetchablePolicyHrefForPolicySurface,
  isFetchablePolicyUrlForPolicySurface,
  type PolicyNanoAssistProvider,
  policySurfaceScanner,
  wwwFallbackUrlForPolicyFetch,
} from "./scanners/policy-surface-scanner.js";
import { startStaticFixtureServer, type StaticFixturePage } from "./test-fixtures/static-server.js";

test("policySurfaceScanner discovers footer privacy links and bounded policy facts", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.discoveryMethod, "footer_link");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
    assert.deepEqual(privacy?.mentionedVendors.sort(), ["Google Analytics", "Meta"]);
    assert.equal(privacy?.observedTopics.includes("analytics"), true);
    assert.equal(privacy?.observedTopics.includes("advertising"), true);
    assert.ok((privacy?.textExcerpt?.length ?? 0) <= 6_000);
    assert.equal(privacy?.sourceScanner, "policy_surface");
    assert.equal(privacy?.consentStateAtTime, "not_applicable");
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /Last updated: May 1, 2026/i);
    assert.match(retainedPolicySurfaceText, /Google Analytics and Meta/i);
    assert.doesNotMatch(retainedPolicySurfaceText, /<main|<script|<footer/i);
    assert.ok(retainedPolicySurfaceText.length <= 256_000);
  });
});

test("policySurfaceScanner strips script/config noise before retaining Article 13 policy evidence", async () => {
  await withPolicyScan("policy-google-script-noise", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "processing_purposes"), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "data_subject_rights"), true);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /this\.gbar_|Closure Library|Object\.defineProperties|CONFIG:\[\[\[/i);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /This policy explains how we collect, use, retain, share/i);
    assert.doesNotMatch(retainedPolicySurfaceText, /this\.gbar_|Closure Library|Object\.defineProperties|CONFIG:\[\[\[/i);
  });
});

test("policySurfaceScanner does not turn script-only policy pages into Article 13 evidence", async () => {
  await withPolicyScan("policy-google-script-only", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.deepEqual(privacy?.observedTopics, []);
  });
});

test("policySurfaceScanner does not retain access challenge pages as fetched policy surfaces", async () => {
  await withPolicyScan("policy-client-challenge", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/client-challenge`
    );

    assert.equal(privacy?.status, "failed");
    assert.equal(privacy?.title, "Client Challenge");
    assert.match(privacy?.textExcerpt ?? "", /required part of this site couldn/i);
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.deepEqual(privacy?.gdprTransparencyTopicCandidates, []);
  });
});

test("policySurfaceScanner treats localized CAPTCHA policy pages as access challenges", async () => {
  await withPolicyScan("policy-french-captcha-challenge", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/french-captcha-challenge`
    );

    assert.equal(privacy?.status, "failed");
    assert.match(privacy?.textExcerpt ?? "", /CAPTCHA audio/i);
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.deepEqual(privacy?.gdprTransparencyTopicCandidates, []);
  });
});

test("policySurfaceScanner does not retain security block pages as fetched policy surfaces", async () => {
  await withPolicyScan("policy-security-policy-block-page", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/security-policy-block`
    );

    assert.equal(privacy?.status, "failed");
    assert.equal(privacy?.httpStatus, 200);
    assert.match(privacy?.textExcerpt ?? "", /website has been blocked/i);
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.deepEqual(privacy?.gdprTransparencyTopicCandidates, []);
  });
});

test("policySurfaceScanner keeps document-backed policy extraction gaps diagnostic-only", async () => {
  await withPolicyScan("policy-document-backed-diagnostic", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/document-backed-fr`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(privacy?.status, "fetched");
    assert.deepEqual(privacy?.article13DisclosureSignals, []);
    assert.equal(
      diagnostics.documentBackedPolicySignals.some((signal) =>
        signal.url === `${baseUrl}/policies/document-backed-fr` &&
        signal.reason === "policy_document_linked_but_not_extracted"
      ),
      true,
    );
  });
});

test("policySurfaceScanner retains bounded blocked-policy diagnostics", async () => {
  await withPolicyScan("policy-blocked-surfaces", async ({ result }) => {
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(diagnostics.corePolicySurfaceRetained, false);
    assert.equal(diagnostics.failedCandidateCount >= 2, true);
    assert.equal(diagnostics.limitationKeys.includes("policy_access_blocked"), true);
    assert.equal(diagnostics.limitationKeys.includes("no_core_policy_surface_retained"), true);
    assert.equal(
      diagnostics.failureSummary.some((failure) =>
        failure.status === "failed" &&
        failure.httpStatus === 403 &&
        failure.surfaceType === "privacy_policy" &&
        failure.count >= 1
      ),
      true,
    );
    assert.equal(
      diagnostics.failureSummary.some((failure) =>
        failure.status === "failed" &&
        failure.httpStatus === 403 &&
        failure.surfaceType === "cookie_policy" &&
        failure.count >= 1
      ),
      true,
    );
  }, {
    discoveryMode: "fast",
    internalBudgetMs: 4_000,
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for blocked direct static policy links.");
      },
    },
  }, { expectCompleted: false });
});

test("policySurfaceScanner fast mode keeps rendered discovery when static links lack cookie settings controls", async () => {
  await withPolicyScan("policy-footer-privacy", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(labels.includes("rendered discovery"), true);
    assert.equal(labels.includes("rendered discovery skipped"), false);
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

test("policySurfaceScanner fast mode skips rendered discovery when static core surfaces are present", async () => {
  await withPolicyScan("policy-static-core-surfaces", async ({ result, baseUrl }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const cookie = observedSurface(result.policySurfaceObservations, "cookie_policy");
    const terms = observedSurface(result.policySurfaceObservations, "terms");
    const choices = observedSurface(result.policySurfaceObservations, "your_privacy_choices");

    assert.equal(privacy?.status, "fetched");
    assert.equal(cookie?.status, "fetched");
    assert.equal(terms?.status, "fetched");
    assert.equal(choices?.status, "fetched");
    assert.equal(terms?.normalizedUrl, `${baseUrl}/terms`);
    assert.equal(labels.includes("rendered discovery"), false);
    assert.equal(labels.includes("rendered discovery skipped"), true);
    assert.equal(labels.includes("deterministic link ranking"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run when static core surfaces are complete.");
      },
    },
  });
});

test("policySurfaceScanner standard mode skips Nano and rendered discovery when static core surfaces are high confidence", async () => {
  await withPolicyScan("policy-static-core-surfaces", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(observedSurface(result.policySurfaceObservations, "privacy_policy")?.status, "fetched");
    assert.equal(observedSurface(result.policySurfaceObservations, "cookie_policy")?.status, "fetched");
    assert.equal(labels.includes("rendered discovery"), false);
    assert.equal(labels.includes("rendered discovery skipped"), true);
    assert.equal(labels.includes("deterministic link ranking"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
    assert.equal(labels.some((label) => label.startsWith("secondary policy")), false);
    assert.equal(labels.some((label) => label.startsWith("privacy-only common-path policy")), false);
    assert.equal(diagnostics.corePolicySurfaceRetained, true);
    assert.deepEqual(diagnostics.limitationKeys, []);
  }, {
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run when direct static GDPR/ePrivacy surfaces are sufficient.");
      },
    },
  });
});

test("policySurfaceScanner standard mode trusts high-confidence first-party static privacy policy links", async () => {
  await withPolicyScan("policy-static-first-party-privacy-only", async ({ result, baseUrl }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/education-privacy`
    );

    assert.ok(privacy);
    assert.equal((privacy.article13DisclosureSignals ?? []).length > 0, true);
    assert.equal(labels.includes("rendered discovery"), false);
    assert.equal(labels.includes("rendered discovery skipped"), true);
    assert.equal(labels.includes("deterministic link ranking"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
    assert.equal(labels.some((label) => label.startsWith("secondary policy")), false);
    assert.equal(labels.some((label) => label.startsWith("privacy-only common-path policy")), false);
  }, {
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for high-confidence first-party static privacy policy links.");
      },
    },
  });
});

test("policySurfaceScanner skips guessed fetches after direct linked strong Article 13 policy evidence", async () => {
  const server = await startDirectLinkedStrongPolicyServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const targetUrl = server.baseUrl.replace("127.0.0.1", "localhost");
    const result = await policySurfaceScanner({
      url: `${targetUrl}/`,
      normalizedUrl: `${targetUrl}/`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(privacy?.status, "fetched");
    assert.equal((privacy?.article13DisclosureSignals ?? []).length >= 4, true);
    assert.equal(labels.some((label) => label.startsWith("common-path policy")), false);
    assert.equal(labels.some((label) => label.startsWith("privacy-only common-path policy")), false);
    assert.equal(
      result.policySurfaceObservations.some((observation) => observation.discoveryMethod === "guessed_common_path"),
      false,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner fast mode skips rendered discovery when static GDPR surfaces are fetchable", async () => {
  await withPolicyScan("policy-static-gdpr-surfaces", async ({ result, baseUrl }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const cookie = observedSurface(result.policySurfaceObservations, "cookie_policy");

    assert.equal(privacy?.status, "fetched");
    assert.equal(cookie?.status, "fetched");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
    assert.equal(cookie?.normalizedUrl, `${baseUrl}/policies/cookies`);
    assert.equal(labels.includes("rendered discovery"), false);
    assert.equal(labels.includes("rendered discovery skipped"), true);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run when static GDPR policy surfaces are sufficient.");
      },
    },
  });
});

test("policySurfaceScanner fast mode keeps rendered discovery for weak static policy shells", async () => {
  await withPolicyScan("policy-static-legacy-plus-rendered-canonical", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];

    assert.equal(labels.includes("rendered discovery"), true);
    assert.equal(labels.includes("rendered discovery skipped"), false);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run in fast static coverage mode.");
      },
    },
  });
});

test("policySurfaceScanner prunes equivalent policy URL variants before fetch", async () => {
  await withPolicyScan("policy-gold-privacy-duplicates", async ({ result, baseUrl }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const privacyFetches = labels.filter((label) => /^policy fetch \d+$/.test(label));
    const privacyObservations = result.policySurfaceObservations.filter((observation) =>
      observation.surfaceType === "privacy_policy" &&
      (observation.normalizedUrl === `${baseUrl}/privacy-policy` || observation.normalizedUrl === `${baseUrl}/privacy-policy/`)
    );

    assert.equal(privacyFetches.length, 1);
    assert.equal(privacyObservations.length, 1);
    assert.equal(observedSurface(result.policySurfaceObservations, "privacy_policy")?.status, "fetched");
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for deterministic duplicate policy candidates.");
      },
    },
  });
});

test("policySurfaceScanner follows URL-only policy stubs to retain canonical policy text", async () => {
  await withPolicyScan("policy-url-stub-canonical", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/canonical-privacy`);
    assert.ok(privacy?.textExcerpt?.includes("personal data"));
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "processing_purposes"), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) => signal.disclosureType === "legal_basis"), true);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /standard contractual clauses/i);
    assert.doesNotMatch(retainedPolicySurfaceText.trim(), /^https?:\/\//i);
    assert.equal(labels.some((label) => label.startsWith("policy url-stub follow")), true);
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run when deterministic fast discovery can follow URL-only policy stubs.");
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

test("policySurfaceScanner uses canonical privacy-surface classifier across supported locales", async () => {
  await withPolicyScan("policy-multilingual-surfaces", async ({ result }) => {
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const summaryByText = new Map(diagnostics.candidateSummary.map((candidate) => [candidate.linkText, candidate]));
    const expected = [
      ["Privacy Policy", "en", "privacy_policy", "direct"],
      ["Datenschutzerklärung", "de", "privacy_policy", "direct"],
      ["Politique de confidentialité", "fr", "privacy_policy", "direct"],
      ["Política de privacidad", "es", "privacy_policy", "direct"],
      ["Informativa sulla privacy", "it", "privacy_policy", "direct"],
      ["Privacybeleid", "nl", "privacy_policy", "direct"],
      ["Polityka prywatności", "pl", "privacy_policy", "direct"],
      ["Cookiebeleid", "nl", "cookie_policy", "direct"],
      ["Polityka plików cookie", "pl", "cookie_policy", "direct"],
    ] as const;

    for (const [linkText, matchedLocale, surfaceType, matchStrength] of expected) {
      const summary = summaryByText.get(linkText);
      assert.ok(summary, `${linkText} should be retained in policy candidate diagnostics`);
      assert.equal(summary.surfaceType, surfaceType, linkText);
      assert.equal(summary.matchedLocale, matchedLocale, linkText);
      assert.equal(summary.matchStrength, matchStrength, linkText);
      assert.equal(summary.classifierProvenance, "privacy_surface_classifier.v1", linkText);
      assert.equal(summary.classifierReasonCodes.some((code) => code === `matched_${surfaceType}`), true, linkText);
    }
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for deterministic multilingual surface coverage.");
      },
    },
  });
});

test("policySurfaceScanner keeps footer policy links from oversized publisher homepages", async () => {
  await withPolicyScan("policy-large-homepage-legal-footer", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/legal/page/politique-de-confidentialite`
    );
    const cookies = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "cookie_policy" &&
      observation.normalizedUrl === `${baseUrl}/legal/le-figaro/info-cookies-lefigaro`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.ok(cookies);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.linkText === "Confidentialité" &&
        candidate.normalizedUrl === `${baseUrl}/legal/page/politique-de-confidentialite`
      ),
      true,
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not be needed for oversized footer policy links.");
      },
    },
  });
});

test("policySurfaceScanner keeps middle footer policy links from oversized publisher homepages", async () => {
  await withPolicyScan("policy-large-homepage-middle-legal-footer", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/corporate-site/datenschutz/datenschutz/artikel-datenschutz-54485502.bild.html`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.equal(privacy.title, "Datenschutz");
    assert.equal(diagnostics.corePolicySurfaceRetained, true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.linkText === "Datenschutz" &&
        candidate.normalizedUrl === `${baseUrl}/corporate-site/datenschutz/datenschutz/artikel-datenschutz-54485502.bild.html`
      ),
      true,
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not be needed for middle oversized footer policy links.");
      },
    },
  });
});

test("policySurfaceScanner does not classify unrelated footer links from neighboring privacy text", async () => {
  await withPolicyScan("policy-neighboring-footer-privacy-noise", async ({ result, baseUrl }) => {
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const summaryByText = new Map(diagnostics.candidateSummary.map((candidate) => [candidate.linkText, candidate]));
    const contact = summaryByText.get("Contacto");
    const accessibility = summaryByText.get("Accesibilidad");
    const account = summaryByText.get("Konto");
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/politica-de-privacidad`
    );
    const cookie = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "cookie_policy" &&
      observation.normalizedUrl === `${baseUrl}/politica-de-cookies`
    );

    assert.equal(contact?.surfaceType ?? "unknown", "unknown");
    assert.equal(account?.surfaceType ?? "unknown", "unknown");
    assert.equal(accessibility?.surfaceType ?? "accessibility_statement", "accessibility_statement");
    assert.equal(privacy?.status, "fetched");
    assert.equal(cookie?.status, "fetched");
    assert.equal(
      result.policySurfaceObservations.some((observation) =>
        observation.surfaceType === "privacy_policy" &&
        /contacto|accesibilidad|auth\/v1\/sso/i.test(observation.normalizedUrl)
      ),
      false,
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for deterministic neighboring-footer regression coverage.");
      },
    },
  });
});

test("policySurfaceScanner promotes usable multilingual GDPR Transparency topic evidence into Article 13 signals", async () => {
  await withPolicyScan("policy-multilingual-article13-topics", async ({ result, baseUrl }) => {
    const expectedTopics = [
      "controller_contact",
      "dpo_contact",
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "supervisory_authority",
      "automated_decision_making_or_profiling",
    ] as const;
    const expectedPolicies = [
      ["en", "/policies/article13-en"],
      ["de", "/policies/article13-de"],
      ["fr", "/policies/article13-fr"],
      ["es", "/policies/article13-es"],
      ["it", "/policies/article13-it"],
      ["nl", "/policies/article13-nl"],
      ["pl", "/policies/article13-pl"],
    ] as const;

    for (const [locale, path] of expectedPolicies) {
      const privacy = result.policySurfaceObservations.find((observation) =>
        observation.status === "fetched" &&
        observation.surfaceType === "privacy_policy" &&
        observation.normalizedUrl === `${baseUrl}${path}`
      );
      assert.ok(privacy, `${locale} policy should be fetched`);

      for (const topic of expectedTopics) {
        const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
        assert.ok(
          candidate,
          `${locale} should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
        );
        assert.equal(candidate.status, "diagnostic_only", `${locale} ${topic}`);
        assert.equal(candidate.productionCredit, false, `${locale} ${topic}`);
        assert.equal(candidate.classifierProvenance, "gdpr_transparency_topic_classifier.v1", `${locale} ${topic}`);
        assert.equal(candidate.matchedLocale, locale, `${locale} ${topic}`);
        assert.ok(candidate.matchedTerm, `${locale} ${topic} should retain matched term`);
        assert.ok(candidate.matchStrength === "direct" || candidate.matchStrength === "equivalent", `${locale} ${topic}`);
        assert.equal(candidate.classifierReasonCodes?.includes(`matched_${topic}`), true, `${locale} ${topic}`);
        assert.ok(candidate.evidenceText.length <= 640, `${locale} ${topic} evidence should be bounded`);
      }

      const classifierSignals = privacy.article13DisclosureSignals.filter((signal) =>
        signal.classifierProvenance === "gdpr_transparency_topic_classifier.v1"
      );
      assert.ok(
        locale === "en" || classifierSignals.length >= 2,
        `${locale} should promote at least two usable classifier-backed Article 13 signals; got ${classifierSignals.map((signal) => signal.disclosureType).join(", ")}`,
      );
      assert.equal(
        classifierSignals.every((signal) =>
          signal.evidenceText !== undefined &&
          signal.evidenceText.length <= 640 &&
          (signal.status === "observed" || signal.status === "partial")
        ),
        true,
        `${locale} classifier Article 13 signals should stay bounded`,
      );

      if (locale !== "en") {
        const productionArticle13Topics = expectedTopics.map((topic) =>
          topic === "automated_decision_making_or_profiling" ? "profiling_or_automated_decision_making" : topic
        );
        assert.equal(
          privacy.observedTopics.some((topic) => productionArticle13Topics.includes(topic)),
          false,
          `${locale} classifier-only matches should not create Article 13 observed topics`,
        );
      } else {
        assert.equal(
          privacy.article13DisclosureSignals.some((signal) => signal.disclosureType === "legal_basis"),
          true,
          "English legacy Article 13 extraction should still run",
        );
      }
    }
  });
});

test("policySurfaceScanner derives diagnostic GDPR Transparency candidates from retained French policy sections", () => {
  const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections([
    {
      heading: "2. QUI EST LE RESPONSABLE DES TRAITEMENTS MENTIONNÉS DANS LE PRÉSENT DOCUMENT ?",
      textExcerpt: "Le responsable du traitement est la Société éditrice du Monde. La déléguée à la protection des données du Groupe Le Monde est indiquée dans cette politique de confidentialité."
    },
    {
      heading: "5. PENDANT COMBIEN DE TEMPS CONSERVONS-NOUS VOS DONNÉES ?",
      textExcerpt: "La durée de conservation des données personnelles est conforme aux dispositions légales et proportionnelle aux finalités pour lesquelles elles ont été enregistrées."
    },
    {
      heading: "7. VOS DONNÉES SONT-ELLES TRANSFÉRÉES EN DEHORS DE L’UNION EUROPÉENNE ?",
      textExcerpt: "Certains traitements impliquent des transferts internationaux de données personnelles vers des sous-traitants situés dans d’autres pays. En cas de transfert, le traitement est encadré par les clauses contractuelles types."
    }
  ]);

  assert.equal(
    candidates.some((candidate) => candidate.topic === "controller_contact"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.topic === "data_retention"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.topic === "international_transfers"),
    true
  );
  assert.equal(
    candidates.every((candidate) =>
      candidate.status === "diagnostic_only" &&
      candidate.productionCredit === false &&
      candidate.classifierProvenance === "gdpr_transparency_topic_classifier.v1"
    ),
    true
  );
});

test("policySurfaceScanner emits production-grade retained French Article 13 section evidence", async () => {
  const server = await startLequipeStyleFrenchPolicyServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: server.baseUrl,
      normalizedUrl: server.baseUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
      discoveryMode: "fast",
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${server.baseUrl}/privacy`
    );
    const sectionEvidence = privacy?.retainedArticle13SectionEvidence ?? [];
    const sectionEvidenceFor = (type: string) => sectionEvidence.find((evidence) => evidence.coverageArea === type);

    assert.ok(privacy, "French privacy policy should be fetched");
    for (const type of [
      "controller_contact",
      "dpo_contact",
      "processing_purposes",
      "recipients_or_vendor_categories",
      "data_subject_rights",
      "international_transfers",
    ]) {
      assert.equal(
        sectionEvidenceFor(type)?.signalObserved,
        "observed",
        `${type} should be observed: ${JSON.stringify(sectionEvidenceFor(type))}`,
      );
      assert.equal(sectionEvidenceFor(type)?.selectedEvidenceStrength, "strong", `${type} should be strong`);
    }
    assert.match(
      sectionEvidenceFor("recipients_or_vendor_categories")?.selectedPolicySectionExcerpt ?? "",
      /prestataires sous-traitants/i
    );
    assert.match(
      sectionEvidenceFor("international_transfers")?.selectedPolicySectionExcerpt ?? "",
      /clauses contractuelles types/i
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner retains diagnostic GDPR Transparency candidates from encoded fetched policy text", async () => {
  await withPolicyScan("policy-gdpr-transparency-encoded-it", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/article13-encoded-it`
    );
    assert.ok(privacy, "encoded Italian policy should be fetched");

    const expectedTopics = [
      "controller_contact",
      "processing_purposes",
      "recipients_or_vendor_categories",
    ] as const;
    for (const topic of expectedTopics) {
      const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
      assert.ok(
        candidate,
        `encoded Italian policy should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
      );
      assert.equal(candidate.status, "diagnostic_only");
      assert.equal(candidate.productionCredit, false);
      assert.equal(candidate.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
      assert.equal(candidate.matchedLocale, "it");
      assert.ok(candidate.evidenceText.length <= 640);
    }

    assert.equal(
      privacy.article13DisclosureSignals.some((signal) =>
        signal.classifierProvenance === "gdpr_transparency_topic_classifier.v1" &&
        signal.disclosureType === "controller_contact"
      ),
      true,
      "usable encoded classifier evidence should become bounded Article 13 signals",
    );
  });
});

test("policySurfaceScanner decodes declared non-UTF policy charsets before GDPR Transparency classification", async () => {
  await withPolicyScan("policy-gdpr-transparency-latin1-es", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/article13-latin1-es`
    );
    assert.ok(privacy, "Latin-encoded Spanish policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Política de protección de datos personales/);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /\uFFFD/);

    for (const topic of ["controller_contact", "dpo_contact", "processing_purposes", "legal_basis", "supervisory_authority"] as const) {
      const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
      assert.ok(
        candidate,
        `Latin-encoded Spanish policy should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
      );
      assert.equal(candidate.status, "diagnostic_only");
      assert.equal(candidate.productionCredit, false);
      assert.equal(candidate.matchedLocale, "es");
    }
  });
});

test("policySurfaceScanner treats compact Dutch privacy text as usable policy evidence", async () => {
  await withPolicyScan("policy-gdpr-transparency-compact-nl", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy-compact-nl`
    );
    assert.ok(privacy, "compact Dutch privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /omgaat met je persoonsgegevens/i);
    assert.match(privacy.textExcerpt ?? "", /\bAVG\b/);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /^Nieuws over de organisatie Journalistieke verantwoording/);
  });
});

test("policySurfaceScanner follows localized canonical policy links from thin privacy shells", async () => {
  await withPolicyScan("policy-localized-canonical-shell", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/datenschutz-shell`
    );
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.ok(privacy, "localized privacy shell should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Verantwortlicher für die Datenverarbeitung/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /^Datenschutzhinweis FOCUS online Webseite/);
    assert.ok(retainedPolicySurfaceTextRef?.path);

    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /Rechtsgrundlage für die Verarbeitung personenbezogener Daten/i);
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "controller_contact"),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
  });
});

test("policySurfaceScanner uses rendered document text when direct fetch retains only a thin shell", async () => {
  await withPolicyScan("policy-browser-hydrated-document", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/browser-hydrated-policy/privacy`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy, "browser-hydrated privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Verantwortlicher für die Datenverarbeitung/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /^Datenschutzhinweis FOCUS online Webseite/);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered low-quality text fallback")),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
    assert.equal(
      diagnostics.policySurfaceDiagnostics?.timingBuckets.some((bucket) =>
        bucket.bucket === "rendered_low_quality_text_fallback" &&
        bucket.durationMs >= 0
      ),
      true,
    );
  });
});

test("policySurfaceScanner extracts policy body text from structured article metadata", async () => {
  await withPolicyScan("policy-jsonld-article-body", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/metadata-policy/privacy`
    );
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.ok(privacy, "structured metadata privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Verantwortlicher für die Datenverarbeitung/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /News Politik Sport Kultur Abo Suche/);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /Rechtsgrundlage für die Verarbeitung personenbezogener Daten/i);
    assert.match(retainedPolicySurfaceText, /Beschwerde bei einer Aufsichtsbehörde/i);
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "legal_basis"),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
  });
});

test("policySurfaceScanner adopts rendered text when it adds canonical GDPR Transparency topics", async () => {
  await withPolicyScan("policy-rendered-article13-better", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/rendered-article13-better/privacy`
    );

    assert.ok(privacy, "rendered French privacy policy should be fetched");
    assert.match(privacy.textExcerpt ?? "", /responsable du traitement/i);
    assert.doesNotMatch(privacy.textExcerpt ?? "", /Centre de confidentialité\. Cette page présente des liens d'aide/i);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered low-quality text fallback")),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.some((candidate) => candidate.topic === "controller_contact"),
      true,
    );
    assert.equal(
      privacy.gdprTransparencyTopicCandidates.every((candidate) => candidate.productionCredit === false),
      true,
    );
  });
});

test("policySurfaceScanner extracts bounded Dutch GDPR Transparency evidence from privacy PDF surfaces", async () => {
  await withPolicyScan("policy-gdpr-transparency-pdf-nl", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy-reglement-nl.pdf`
    );
    const retainedPolicySurfaceTextRef = privacy?.artifactRefs.find((ref) =>
      ref.artifactId.startsWith("policy_surface_text_")
    );

    assert.ok(privacy, "Dutch privacy PDF should be fetched");
    assert.match(privacy.textExcerpt ?? "", /Privacy Reglement/i);
    assert.match(privacy.textExcerpt ?? "", /persoonsgegevens/i);
    assert.ok(retainedPolicySurfaceTextRef?.path);
    const retainedPolicySurfaceText = await readFile(retainedPolicySurfaceTextRef.path, "utf8");
    assert.match(retainedPolicySurfaceText, /functionaris voor gegevensbescherming/i);
    assert.ok(retainedPolicySurfaceText.length <= 256_000);

    for (const topic of ["controller_contact", "dpo_contact", "processing_purposes", "supervisory_authority"] as const) {
      const candidate = privacy.gdprTransparencyTopicCandidates.find((item) => item.topic === topic);
      assert.ok(
        candidate,
        `Dutch privacy PDF should retain diagnostic ${topic}; got ${privacy.gdprTransparencyTopicCandidates.map((item) => item.topic).join(", ")}`,
      );
      assert.equal(candidate.status, "diagnostic_only");
      assert.equal(candidate.productionCredit, false);
      assert.equal(candidate.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
      assert.equal(candidate.matchedLocale, "nl");
      assert.ok(candidate.evidenceText.length <= 640);
    }

    for (const topic of ["supervisory_authority"] as const) {
      assert.equal(
        privacy.article13DisclosureSignals.some((signal) =>
          signal.classifierProvenance === "gdpr_transparency_topic_classifier.v1" &&
          signal.disclosureType === topic
        ),
        true,
        `Dutch privacy PDF should promote usable classifier evidence for ${topic}`,
      );
    }
    assert.deepEqual(privacy.observedTopics, [], "PDF classifier evidence must not create default observed topics");
  });
});

test("policySurfaceScanner keeps classifier-only TOC navigation and non-policy snippets diagnostic-only", async () => {
  await withPolicyScan("policy-gdpr-transparency-diagnostic-negatives", async ({ result, baseUrl }) => {
    const expectedPolicies = [
      `${baseUrl}/policies/article13-toc-de`,
      `${baseUrl}/policies/article13-nav-fr`,
      `${baseUrl}/policies/article13-support-pl`,
    ];

    for (const url of expectedPolicies) {
      const privacy = result.policySurfaceObservations.find((observation) =>
        observation.status === "fetched" &&
        observation.surfaceType === "privacy_policy" &&
        observation.normalizedUrl === url
      );
      assert.ok(privacy, `${url} should be fetched`);
      assert.equal(privacy.gdprTransparencyTopicCandidates.length > 0, true, `${url} should retain diagnostic candidates`);
      assert.equal(
        privacy.gdprTransparencyTopicCandidates.every((candidate) =>
          candidate.status === "diagnostic_only" &&
          candidate.productionCredit === false &&
          candidate.classifierProvenance === "gdpr_transparency_topic_classifier.v1" &&
          candidate.evidenceText.length <= 640
        ),
        true,
        `${url} candidates should be bounded diagnostic-only classifier evidence`,
      );
      assert.deepEqual(privacy.article13DisclosureSignals, [], `${url} should not promote classifier-only candidates to Article 13 signals`);
      assert.deepEqual(privacy.observedTopics, [], `${url} should not promote classifier-only candidates to observed topics`);
    }
  });
});

test("policySurfaceScanner treats external terms links as fetchable policy surfaces", () => {
  const baseUrl = "https://www.nbcnews.com/";

  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://www.nbcuniversal.com/terms-of-service",
      "terms",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://www.nbcuniversal.com/privacy",
      "privacy_policy",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://polityka-prywatnosci.onet.pl/index.html",
      "privacy_policy",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://static.lefigaro.fr/confidentialite",
      "privacy_policy",
    ),
    true,
  );
  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl: "https://www.antena3.com/",
      href: "https://statics.atresmedia.com/sites/assets/legal/proteccion.html",
      normalizedUrl: "https://statics.atresmedia.com/sites/assets/legal/proteccion.html",
      surfaceType: "privacy_policy",
      matchStrength: "direct",
      linkText: "Política de privacidad",
    }),
    true,
    "direct localized policy labels should keep static external legal assets fetchable",
  );
  assert.equal(
    isFetchablePolicyUrlForPolicySurface(
      baseUrl,
      "https://www.nbcuniversal.com/about",
      "terms",
    ),
    false,
  );
});

test("policySurfaceScanner treats external localized policy hash links as fetchable", () => {
  const baseUrl = "https://www.se.pl/";
  const href = "https://rodo.grupazpr.pl/#time-polityka-prywatnosci-cookies";
  const normalizedUrl = "https://rodo.grupazpr.pl/";

  assert.equal(
    isFetchablePolicyUrlForPolicySurface(baseUrl, normalizedUrl, "privacy_policy"),
    false,
    "normalized URL alone loses the privacy signal in the fragment",
  );
  assert.equal(
    isFetchablePolicyHrefForPolicySurface(baseUrl, href, normalizedUrl, "privacy_policy"),
    true,
    "original href fragment should preserve localized privacy/cookie evidence for fetchability",
  );
});

test("policySurfaceScanner treats direct localized policy labels as fetchable for opaque external URLs", () => {
  const baseUrl = "https://www.gazeta.pl/";
  const href = "https://pomoc.gazeta.pl/pomoc/7,192131,30837106,zgody-2.html#e=AFootLink#s=StLinks";
  const normalizedUrl = "https://pomoc.gazeta.pl/pomoc/7,192131,30837106,zgody-2.html";

  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: "privacy_policy",
      matchStrength: "direct",
      linkText: "Polityka Prywatności",
    }),
    true,
  );
  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: "privacy_policy",
      matchStrength: "equivalent",
      linkText: "Prywatność",
    }),
    false,
  );
  assert.equal(
    isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: "privacy_policy",
      matchStrength: "direct",
      linkText: "https://pomoc.gazeta.pl/pomoc/7,192131,30837106,zgody-2.html",
    }),
    false,
  );
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

test("policySurfaceScanner discovers late-rendered localized privacy policy links", async () => {
  await withPolicyScan("policy-late-rendered-pl-privacy-links", async ({ result, baseUrl }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const cookie = observedSurface(result.policySurfaceObservations, "cookie_policy");
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const privacySummary = diagnostics.candidateSummary.find((candidate) =>
      candidate.normalizedUrl === `${baseUrl}/policies/privacy`
    );
    const cookieSummary = diagnostics.candidateSummary.find((candidate) =>
      candidate.normalizedUrl === `${baseUrl}/policies/cookies`
    );

    assert.equal(privacy?.status, "fetched");
    assert.equal(privacy?.normalizedUrl, `${baseUrl}/policies/privacy`);
    assert.equal(privacy?.discoveryMethod, "footer_link");
    assert.equal(cookie?.status, "fetched");
    assert.equal(cookie?.normalizedUrl, `${baseUrl}/policies/cookies`);
    assert.equal(privacySummary?.linkText, "Polityka Prywatności Gazeta.pl");
    assert.equal(privacySummary?.matchedLocale, "pl");
    assert.equal(privacySummary?.surfaceType, "privacy_policy");
    assert.equal(privacySummary?.classifierProvenance, "privacy_surface_classifier.v1");
    assert.equal(cookieSummary?.linkText, "Cookie Policy");
    assert.equal(cookieSummary?.fetchable, true);
    assert.equal(cookieSummary?.surfaceType, "cookie_policy");
  }, {
    internalBudgetMs: 8_000,
  });
});

test("policySurfaceScanner ranks delayed global footer core links deterministically before Nano", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks() {
      throw new Error("Nano link ranking should not run when rendered footer GDPR/ePrivacy core links are high-confidence.");
    },
  };

  await withPolicyScan("policy-global-footer-delayed", async ({ result, baseUrl }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];

    assert.equal(labels.includes("rendered discovery"), true);
    assert.equal(labels.includes("deterministic link ranking"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
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

test("policySurfaceScanner retains footer terms as a secondary policy surface alongside privacy links", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const privacy = input.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/privacy-policy"),
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

  await withPolicyScan("policy-latimes-footer-surfaces", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/privacy-policy` &&
      observation.surfaceType === "privacy_policy" &&
      observation.status === "fetched"
    );
    const terms = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/terms` &&
      observation.surfaceType === "terms" &&
      observation.status === "fetched"
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.ok(terms);
    assert.equal(diagnostics.candidateSummary.some((candidate) =>
      candidate.surfaceType === "terms" &&
      candidate.normalizedUrl === `${baseUrl}/terms`
    ), true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner retains localized privacy policies as high-value supplements when Nano ranks secondary surfaces", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      const secondary = input.candidates.filter((candidate) =>
        candidate.normalizedUrl.endsWith("/politica-de-cookies") ||
        candidate.normalizedUrl.endsWith("/terms")
      );
      return {
        assistId: input.assistId,
        rankedCandidates: secondary.map((candidate, index) => ({
          candidateId: candidate.candidateId,
          likelySurfaceType: candidate.deterministicSurfaceType,
          shouldFetch: true,
          priorityRank: index + 1,
          confidence: 0.9,
          reason: "Mock Nano selected secondary localized policy links only.",
        })),
      };
    },
  };

  await withPolicyScan("policy-localized-privacy-supplement", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/politica-de-privacidad` &&
      observation.surfaceType === "privacy_policy" &&
      observation.status === "fetched"
    );
    const cookie = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/politica-de-cookies` &&
      observation.surfaceType === "cookie_policy" &&
      observation.status === "fetched"
    );
    const terms = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/terms` &&
      observation.surfaceType === "terms" &&
      observation.status === "fetched"
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(privacy);
    assert.ok(cookie);
    assert.ok(terms);
    assert.equal(diagnostics.candidateSummary.some((candidate) =>
      candidate.normalizedUrl === `${baseUrl}/politica-de-privacidad` &&
      candidate.surfaceType === "privacy_policy" &&
      candidate.matchedLocale === "es" &&
      candidate.matchStrength === "direct"
    ), true);
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

test("policySurfaceScanner records footer Manage Cookies+ controls as cookie settings", async () => {
  await withPolicyScan("policy-manage-cookies-footer-control", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");

    assert.equal(settings?.status, "observed");
    assert.match(settings?.linkText ?? "", /Manage Cookies\+/);
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-manage-cookies-footer-control`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, true);
    assert.equal(settings?.mayLeadToConsentControls, true);
  });
});

test("policySurfaceScanner records placeholder footer Manage Cookies anchors as cookie settings", async () => {
  await withPolicyScan("policy-manage-cookies-footer-anchor", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(settings?.status, "observed");
    assert.match(settings?.linkText ?? "", /Manage Cookies/);
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-manage-cookies-footer-anchor`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, true);
    assert.equal(settings?.mayLeadToConsentControls, true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.surfaceType === "cookie_settings" &&
        /Manage Cookies/.test(candidate.linkText) &&
        candidate.observationOnly === true
      ),
      true,
    );
  });
});

test("policySurfaceScanner records embedded consent config Manage Cookies labels as cookie settings", async () => {
  await withPolicyScan("policy-manage-cookies-embedded-config", async ({ result, baseUrl }) => {
    const settings = observedSurface(result.policySurfaceObservations, "cookie_settings");
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(settings?.status, "observed");
    assert.match(settings?.linkText ?? "", /Manage Cookies\+/);
    assert.equal(settings?.normalizedUrl, `${baseUrl}/f/policy-manage-cookies-embedded-config`);
    assert.equal(settings?.fetchable, false);
    assert.equal(settings?.clickable, false);
    assert.equal(settings?.mayLeadToConsentControls, true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.surfaceType === "cookie_settings" &&
        /Manage Cookies\+/.test(candidate.linkText) &&
        candidate.observationOnly === true
      ),
      true,
    );
  }, { discoveryMode: "fast" });
});

test("policySurfaceScanner records visible French policy labels as observation-only surfaces", async () => {
  await withPolicyScan("policy-visible-fr-observation-labels", async ({ result, baseUrl }) => {
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "privacy_policy" &&
      /Données personnelles/i.test(observation.linkText ?? "")
    );
    const cookie = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "cookie_policy" &&
      /Politique Cookie/i.test(observation.linkText ?? "")
    );
    const settings = result.policySurfaceObservations.find((observation) =>
      observation.surfaceType === "cookie_settings" &&
      /Paramétrage des cookies/i.test(observation.linkText ?? "")
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);
    const observedSummary = JSON.stringify(result.policySurfaceObservations.map((observation) => ({
      surfaceType: observation.surfaceType,
      status: observation.status,
      linkText: observation.linkText,
      fetchable: observation.fetchable,
      clickable: observation.clickable,
      mayLeadToConsentControls: observation.mayLeadToConsentControls,
    })), null, 2);

    for (const observation of [privacy, cookie, settings]) {
      assert.ok(observation, observedSummary);
      assert.equal(observation?.status, "observed");
      assert.equal(observation?.normalizedUrl, `${baseUrl}/f/policy-visible-fr-observation-labels`);
      assert.equal(observation?.fetchable, false);
      assert.equal(observation?.clickable, false);
      assert.deepEqual(observation?.article13DisclosureSignals, []);
    }
    assert.equal(settings?.mayLeadToConsentControls, true);
    assert.equal(
      diagnostics.candidateSummary.filter((candidate) =>
        candidate.observationOnly === true &&
        candidate.matchedLocale === "fr" &&
        ["privacy_policy", "cookie_policy", "cookie_settings"].includes(candidate.surfaceType)
      ).length,
      3,
    );
    assert.equal(diagnostics.limitationKeys.includes("visible_policy_label_only"), true);
    assert.equal(diagnostics.policySurfaceDiagnostics?.summary.observationCounts.observedOnly, 3);
    assert.equal(
      diagnostics.policySurfaceDiagnostics?.failureClasses.some((entry) =>
        entry.failureClass === "visible_non_link_policy_control_label_only" &&
        entry.count === 3
      ),
      true,
    );
  }, { discoveryMode: "fast" });
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
      observation.discoveryMethod === "guessed_common_path" &&
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`,
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
    assert.equal(diagnostics.observedCandidateCount > 0, true);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.discoveryMethod === "guessed_common_path" &&
        candidate.normalizedUrl === `${baseUrl}/privacy`
      ),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label === "deterministic common-path ranking"),
      true,
    );
  }, {
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for guessed common-path fallback.");
      },
    },
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

test("policySurfaceScanner bounds slow homepage fetches so common-path fallback can retain policy evidence", async () => {
  const server = await startSlowHomepagePolicyServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/`,
      normalizedUrl: `${server.baseUrl}/`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      nanoAssistProvider: {
        async classifyLinks() {
          throw new Error("Nano link ranking should not run for guessed common-path fallback.");
        },
      },
    });
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${server.baseUrl}/privacy`
    );
    const homepageFetch = result.moduleRun.timingBreakdown?.find((timing) => timing.label === "homepage fetch");

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(fallback, JSON.stringify({
      timing: result.moduleRun.timingBreakdown,
      observations: result.policySurfaceObservations.map((observation) => ({
        status: observation.status,
        normalizedUrl: observation.normalizedUrl,
        surfaceType: observation.surfaceType,
        httpStatus: observation.httpStatus,
        error: observation.error,
      })),
    }, null, 2));
    assert.equal(fallback.surfaceType, "privacy_policy");
    assert.equal((homepageFetch?.durationMs ?? 0) < 4_000, true);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed common-path")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner keeps blocked common-path fallback bounded", async () => {
  const server = await startBlockedPolicyServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/`,
      normalizedUrl: `${server.baseUrl}/`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const blockedCommonPathFailures = result.policySurfaceObservations.filter((observation) =>
      observation.discoveryMethod === "guessed_common_path" &&
      observation.status === "failed" &&
      observation.httpStatus === 403
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(blockedCommonPathFailures.length, 6);
    assert.equal(diagnostics.limitationKeys.includes("policy_access_blocked"), true);
    assert.equal(diagnostics.limitationKeys.includes("common_path_blocked_curtailed"), true);
    assert.equal(diagnostics.limitationKeys.includes("common_path_fallback_retained_no_core_surface"), true);
    assert.equal(diagnostics.policySurfaceDiagnostics?.schemaVersion, "certscore.policy_surface_diagnostics.v2");
    assert.equal(
      diagnostics.policySurfaceDiagnostics?.failureClasses.some((entry) =>
        entry.failureClass === "blocked_access" &&
        entry.count === 6 &&
        entry.httpStatuses.includes(403)
      ),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed common-path")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner curtails repeated not-found common-path fallback", async () => {
  const server = await startNotFoundPolicyServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/`,
      normalizedUrl: `${server.baseUrl}/`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      nanoAssistProvider: {
        async classifyLinks() {
          throw new Error("Nano link ranking should not run for guessed common-path fallback.");
        },
      },
    });
    const notFoundCommonPathFailures = result.policySurfaceObservations.filter((observation) =>
      observation.discoveryMethod === "guessed_common_path" &&
      observation.status === "failed" &&
      observation.httpStatus === 404
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(notFoundCommonPathFailures.length, 6);
    assert.equal(diagnostics.limitationKeys.includes("policy_candidate_not_found"), true);
    assert.equal(diagnostics.limitationKeys.includes("common_path_not_found_curtailed"), true);
    assert.equal(diagnostics.limitationKeys.includes("common_path_fallback_retained_no_core_surface"), true);
    assert.equal(
      diagnostics.policySurfaceDiagnostics?.failureClasses.some((entry) =>
        entry.failureClass === "repeated_404_common_path_miss" &&
        entry.count === 6 &&
        entry.httpStatuses.includes(404)
      ),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner keeps transport-failed common-path fallback bounded", async () => {
  const server = await startTransportFailedPolicyServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/`,
      normalizedUrl: `${server.baseUrl}/`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      nanoAssistProvider: {
        async classifyLinks() {
          throw new Error("Nano link ranking should not run for guessed common-path fallback.");
        },
      },
    });
    const transportCommonPathFailures = result.policySurfaceObservations.filter((observation) =>
      observation.discoveryMethod === "guessed_common_path" &&
      observation.status === "failed" &&
      observation.httpStatus === undefined
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(transportCommonPathFailures.length, 6);
    assert.equal(diagnostics.limitationKeys.includes("common_path_transport_curtailed"), true);
    assert.equal(diagnostics.limitationKeys.includes("common_path_fallback_retained_no_core_surface"), true);
    assert.equal(
      diagnostics.policySurfaceDiagnostics?.failureClasses.some((entry) =>
        entry.failureClass === "common_path_transport_failure" &&
        entry.count >= 4
      ),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label === "deterministic common-path ranking"),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered fetch fallback")),
      false,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner curtails repeated common-path app shells", async () => {
  const server = await startCommonPathAppShellPolicyServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/`,
      normalizedUrl: `${server.baseUrl}/`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      nanoAssistProvider: {
        async classifyLinks() {
          throw new Error("Nano link ranking should not run for guessed common-path fallback.");
        },
      },
    });
    const appShellFetches = result.policySurfaceObservations.filter((observation) =>
      observation.discoveryMethod === "guessed_common_path" &&
      observation.status === "fetched" &&
      observation.title === "Doctolib : Prenez rendez-vous en ligne chez un soignant"
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(appShellFetches.length, 3);
    assert.equal(diagnostics.commonPathFallbackUsed, true);
    assert.equal(diagnostics.limitationKeys.includes("common_path_app_shell_curtailed"), true);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label === "deterministic common-path ranking"),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner ranks homepage-failed common paths deterministically", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks() {
      throw new Error("Nano link ranking should not run for guessed common-path fallback.");
    },
  };

  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/blocked-homepage`,
      normalizedUrl: `${server.baseUrl}/blocked-homepage`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 5_000,
      artifactWriter,
      nanoAssistProvider,
    });

    const fetchedCorePolicy = result.policySurfaceObservations
      .filter((observation) => observation.status === "fetched")
      .some((observation) =>
        observation.surfaceType === "privacy_policy" &&
        observation.discoveryMethod === "guessed_common_path"
      );

    assert.equal(fetchedCorePolicy, true);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed common-path")),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed common-path deterministic ranking")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner uses rendered footer links before common-path fallback when homepage fetch is blocked", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/browser-visible-policy-homepage`,
      normalizedUrl: `${server.baseUrl}/browser-visible-policy-homepage`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 7_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${server.baseUrl}/browser-visible-policy-homepage/privacy`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(privacy);
    assert.equal(privacy.surfaceType, "privacy_policy");
    assert.equal(diagnostics.renderedCandidateCount > 0, true);
    assert.equal(diagnostics.commonPathFallbackUsed, false);
    assert.equal(
      diagnostics.candidateSummary.some((candidate) =>
        candidate.normalizedUrl === `${server.baseUrl}/browser-visible-policy-homepage/privacy`
      ),
      true,
    );
    assert.equal(privacy.httpStatus, 200);
    assert.equal(privacy.observedTopics.includes("data_retention"), true);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("homepage-failed rendered discovery")),
      true,
    );
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered fetch fallback")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner uses rendered policy document fallback when direct policy fetch times out", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-scan-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await policySurfaceScanner({
      url: `${server.baseUrl}/browser-timeout-policy-homepage`,
      normalizedUrl: `${server.baseUrl}/browser-timeout-policy-homepage`,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 12_000,
      artifactWriter,
      nanoAssistProvider: createDefaultMockNanoPolicyAssistProvider(),
    });
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${server.baseUrl}/browser-timeout-policy-homepage/privacy`
    );

    assert.ok(privacy);
    assert.equal(privacy.surfaceType, "privacy_policy");
    assert.equal(privacy.httpStatus, 200);
    assert.match(privacy.textExcerpt ?? "", /controller for this service/i);
    assert.equal(
      result.moduleRun.timingBreakdown?.some((timing) => timing.label.includes("policy rendered fetch fallback")),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("policySurfaceScanner falls back to deterministic common paths when Nano declines observed generic links", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifyCalls += 1;
      if (input.candidates.some((candidate) => candidate.discoveryMethod === "guessed_common_path")) {
        throw new Error("Nano link ranking should not run for guessed common-path fallback.");
      }
      return { assistId: input.assistId, rankedCandidates: [] };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result, baseUrl }) => {
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`,
    );

    assert.equal(classifyCalls, 1);
    assert.ok(fallback);
    assert.equal(fallback.surfaceType, "privacy_policy");
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner does not let Nano upgrade generic links without direct policy evidence", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifyCalls += 1;
      const generic = input.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/products")
      );
      if (generic) {
        return {
          assistId: input.assistId,
          rankedCandidates: [{
            candidateId: generic.candidateId,
            likelySurfaceType: "privacy_policy",
            shouldFetch: true,
            priorityRank: 1,
            confidence: 0.96,
            reason: "Mock Nano incorrectly upgraded a generic product link.",
          }],
        };
      }

      if (input.candidates.some((candidate) => candidate.discoveryMethod === "guessed_common_path")) {
        throw new Error("Nano link ranking should not run for guessed common-path fallback.");
      }
      return { assistId: input.assistId, rankedCandidates: [] };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result, baseUrl }) => {
    const genericUpgrade = result.policySurfaceObservations.find((observation) =>
      observation.normalizedUrl === `${baseUrl}/products` &&
      observation.surfaceType === "privacy_policy"
    );
    const fallback = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy` &&
      observation.surfaceType === "privacy_policy"
    );

    assert.equal(classifyCalls, 1);
    assert.equal(genericUpgrade, undefined);
    assert.ok(fallback);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner ignores external powered-by attribution links as policy surfaces", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      return {
        assistId: input.assistId,
        rankedCandidates: input.candidates
          .filter((candidate) => candidate.deterministicSurfaceType !== "unknown")
          .map((candidate, index) => ({
            candidateId: candidate.candidateId,
            likelySurfaceType: candidate.deterministicSurfaceType,
            shouldFetch: true,
            priorityRank: index + 1,
            confidence: Math.max(0.8, candidate.deterministicScore),
            reason: "Rank deterministic policy candidates.",
          })),
      };
    },
  };

  await withPolicyScan("policy-powered-by-attribution", async ({ result, baseUrl }) => {
    const attribution = result.policySurfaceObservations.find((observation) =>
      (observation.normalizedUrl ?? observation.url).includes("onetrust.com/products/cookie-consent")
    );
    const privacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy`
    );

    assert.equal(attribution, undefined);
    assert.ok(privacy);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner does not follow third-party privacy policy links from fetched policy pages", async () => {
  await withPolicyScan("policy-secondary-third-party-links", async ({ result, baseUrl }) => {
    const firstPartyCookie = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "cookie_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/cookies`
    );
    const thirdPartyPolicies = result.policySurfaceObservations.filter((observation) =>
      /facebook\.com\/privacy|linkedin\.com\/legal\/privacy-policy/i.test(observation.normalizedUrl ?? observation.url)
    );

    assert.ok(firstPartyCookie);
    assert.deepEqual(thirdPartyPolicies, []);
  }, { enableNanoPolicyAssist: true, internalBudgetMs: 8_000 });
});

test("policySurfaceScanner suppresses third-party CMP vendor-panel privacy links before ranking and fetch", async () => {
  await withPolicyScan("policy-vendor-panel-privacy-links", async ({ result, baseUrl }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const firstPartyPrivacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/education-privacy`
    );
    const vendorPanelPolicies = result.policySurfaceObservations.filter((observation) =>
      /example-(?:provider|aanbieder|fornitore|partner|vendor|anbieter|fournisseur|proveedor|leverancier|dostawca)/i.test(observation.normalizedUrl ?? observation.url)
    );

    assert.ok(firstPartyPrivacy);
    assert.deepEqual(vendorPanelPolicies, []);
    assert.equal(labels.includes("rendered discovery"), false);
    assert.equal(labels.includes("rendered discovery skipped"), true);
    assert.equal(labels.includes("Nano link ranking"), false);
  }, {
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run when third-party vendor-panel links are suppressed and first-party privacy is direct.");
      },
    },
  });
});

test("policySurfaceScanner ignores external URL-only body privacy links as policy surfaces", async () => {
  await withPolicyScan("policy-homepage-external-url-only-policy-links", async ({ result, baseUrl }) => {
    const firstPartyPrivacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/policies/privacy`
    );
    const rawExternalPolicies = result.policySurfaceObservations.filter((observation) =>
      /facebook\.com\/privacy|linkedin\.com\/legal\/privacy-policy/i.test(observation.normalizedUrl ?? observation.url)
    );

    assert.ok(firstPartyPrivacy);
    assert.deepEqual(rawExternalPolicies, []);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner skips Nano ranking and fetch work when policy budget is exhausted", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks() {
      classifyCalls += 1;
      return new Promise(() => undefined);
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result }) => {
    const labels = result.moduleRun.timingBreakdown?.map((timing) => timing.label) ?? [];
    const skipped = result.policySurfaceObservations.filter((observation) =>
      observation.status === "skipped_budget"
    );

    assert.equal(result.moduleRun.status, "completed");
    assert.equal(classifyCalls, 0);
    assert.equal(labels.includes("Nano link ranking"), true);
    assert.equal(skipped.length > 0, true);
  }, {
    discoveryMode: "fast",
    enableNanoPolicyAssist: true,
    internalBudgetMs: 1,
    nanoAssistProvider,
  });
});

test("policySurfaceScanner keeps deterministic common paths without speculative Nano common-path ranking", async () => {
  let classifyCalls = 0;
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      classifyCalls += 1;
      if (input.candidates.some((candidate) => candidate.discoveryMethod === "guessed_common_path")) {
        throw new Error("Nano link ranking should not run for guessed common-path fallback.");
      }
      return { assistId: input.assistId, rankedCandidates: [] };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result, baseUrl }) => {
    const retained = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.normalizedUrl === `${baseUrl}/privacy`
    );
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(classifyCalls, 1);
    assert.ok(retained);
    assert.equal(retained.surfaceType, "privacy_policy");
    assert.equal(diagnostics.corePolicySurfaceRetained, true);
    assert.equal(diagnostics.commonPathFallbackUsed, true);
  }, { discoveryMode: "fast", enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner keeps core common paths when observed links are declined", async () => {
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    async classifyLinks(input) {
      if (input.candidates.some((candidate) => candidate.discoveryMethod === "guessed_common_path")) {
        throw new Error("Nano link ranking should not run for guessed common-path fallback.");
      }
      return { assistId: input.assistId, rankedCandidates: [] };
    },
  };

  await withPolicyScan("policy-generic-links", async ({ result }) => {
    const fetchedCorePolicy = result.policySurfaceObservations
      .filter((observation) => observation.status === "fetched")
      .some((observation) =>
        observation.surfaceType === "privacy_policy" &&
        observation.discoveryMethod === "guessed_common_path"
      );

    assert.equal(fetchedCorePolicy, true);
  }, { enableNanoPolicyAssist: true, nanoAssistProvider });
});

test("policySurfaceScanner gold corpus retains core GDPR policy surfaces through bounded fallback", async () => {
  const cases = [
    {
      page: "policy-gold-ford-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-notice",
    },
    {
      page: "policy-gold-ikea-common-path",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/legal/privacy-cookie-statement",
    },
    {
      page: "policy-gold-nvidia-secondary-only",
      expectedSurfaceType: "privacy_policy",
      expectedPath: "/privacy-policy",
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
      assert.ok(fallbackObservations.length <= 18, `${fixture.page} should keep common-path fallback bounded`);
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

test("policySurfaceScanner retains IKEA privacy-cookie statement as both privacy and cookie surfaces", async () => {
  await withPolicyScan("policy-gold-ikea-common-path", async ({ result, baseUrl }) => {
    const expectedUrl = `${baseUrl}/legal/privacy-cookie-statement`;
    const retainedTypes = new Set(result.policySurfaceObservations
      .filter((observation) =>
        observation.status === "fetched" &&
        observation.normalizedUrl === expectedUrl
      )
      .map((observation) => observation.surfaceType));

    assert.equal(retainedTypes.has("privacy_policy"), true);
    assert.equal(retainedTypes.has("cookie_policy"), true);
  });
});

test("policySurfaceScanner common-path fallback excludes site-specific brand paths", async () => {
  await withPolicyScan("policy-no-links", async ({ result }) => {
    const commonPathUrls = result.policySurfaceObservations
      .filter((observation) => observation.discoveryMethod === "guessed_common_path")
      .map((observation) => observation.normalizedUrl ?? observation.url);

    assert.ok(commonPathUrls.length > 0);
    assert.equal(commonPathUrls.some((url) => /about-nvidia|customer-service\/privacy-policy|global\/en\/customer-service/.test(url)), false);
    assert.equal(commonPathUrls.some((url) => /\/privacy(?:-policy|-notice)?\/?$/.test(new URL(url).pathname)), true);
  });
});

test("policySurfaceScanner does not let secondary-only surfaces satisfy core GDPR policy availability", async () => {
  await withPolicyScan("policy-gold-latimes-secondary-only", async ({ result }) => {
    const fetchedBeforeFallback = result.policySurfaceObservations.filter((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod !== "guessed_common_path" &&
      observation.directVsInferred !== "mixed"
    );
    const secondaryOnlyTypes = new Set(fetchedBeforeFallback.map((observation) => observation.surfaceType));
    const fallbackPrivacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod === "guessed_common_path" &&
      observation.surfaceType === "privacy_policy"
    );

    assert.equal(secondaryOnlyTypes.has("privacy_policy"), false);
    assert.ok(fallbackPrivacy);
  });
});

test("policySurfaceScanner follows bounded privacy common paths when only cookie policy was retained", async () => {
  await withPolicyScan("policy-cookie-link", async ({ result, baseUrl }) => {
    const directlyFetchedCookie = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod !== "guessed_common_path" &&
      observation.surfaceType === "cookie_policy"
    );
    const fallbackPrivacy = result.policySurfaceObservations.find((observation) =>
      observation.status === "fetched" &&
      observation.discoveryMethod === "guessed_common_path" &&
      observation.surfaceType === "privacy_policy" &&
      observation.normalizedUrl === `${baseUrl}/privacy`
    );

    assert.ok(directlyFetchedCookie);
    assert.ok(fallbackPrivacy);
  });
});

test("policySurfaceScanner common-path fallback includes localized privacy policy paths", async () => {
  await withPolicyScan("policy-no-links", async ({ result, baseUrl }) => {
    const fetchedPrivacyPaths = new Set(result.policySurfaceObservations
      .filter((observation) =>
        observation.discoveryMethod === "guessed_common_path" &&
        observation.status === "fetched" &&
        observation.surfaceType === "privacy_policy"
      )
      .map((observation) => observation.normalizedUrl));

    for (const expectedPath of [
      "/datenschutz",
      "/privacy-statement",
      "/politica-de-privacidad",
      "/politica-privacidad",
      "/informativa-privacy",
      "/privacybeleid",
    ]) {
      assert.equal(
        fetchedPrivacyPaths.has(`${baseUrl}${expectedPath}`),
        true,
        `expected localized fallback ${expectedPath}; retained=${JSON.stringify([...fetchedPrivacyPaths])}`,
      );
    }
  });
});

test("policySurfaceScanner retains visible terms links across policy gold corpus", async () => {
  const cases = [
    ["policy-gold-caltech-common-path", ["/terms"]],
    ["policy-gold-ford-secondary-only", ["/terms"]],
    ["policy-gold-ikea-common-path", ["/terms"]],
    ["policy-gold-latimes-secondary-only", ["/gift-subscription-terms", "/subscriber-terms-and-conditions"]],
    ["policy-latimes-footer-surfaces", ["/terms"]],
  ] as const;

  for (const [page, expectedPaths] of cases) {
    await withPolicyScan(page, async ({ result, baseUrl }) => {
      const retainedTermsUrls = new Set(result.policySurfaceObservations
        .filter((observation) =>
          observation.surfaceType === "terms" &&
          observation.status === "fetched"
        )
        .map((observation) => observation.normalizedUrl));

      for (const expectedPath of expectedPaths) {
        assert.equal(
          retainedTermsUrls.has(`${baseUrl}${expectedPath}`),
          true,
          `${page} should retain ${expectedPath} as a terms surface`,
        );
      }
    });
  }
});

test("policySurfaceScanner dedupes slash variants before applying common-path fallback cap", async () => {
  await withPolicyScan("policy-gold-ford-secondary-only", async ({ result, baseUrl }) => {
    const commonPathUrls = result.policySurfaceObservations
      .filter((observation) => observation.discoveryMethod === "guessed_common_path")
      .map((observation) => observation.normalizedUrl ?? observation.url);

    assert.ok(commonPathUrls.length <= 18);
    assert.equal(commonPathUrls.includes(`${baseUrl}/privacy-notice`), true);
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
      assert.ok(input.excerpt.length <= 40_000);
      assert.doesNotMatch(input.excerpt, /<main|<script|<footer/i);
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
  await withPolicyScan("policy-ambiguous-choices", async ({ result }) => {
    assert.equal(result.moduleRun.status, "failed");
    assert.equal(
      result.moduleRun.errors.some((error) => error.includes("Nano policy assist is required")),
      true,
    );
    assert.deepEqual(result.policySurfaceObservations, []);
  }, {}, { expectCompleted: false, useDefaultNanoProvider: false });
});

test("policySurfaceScanner escalates when Nano assist is explicitly disabled", async () => {
  await withPolicyScan("policy-ambiguous-choices", async ({ result }) => {
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
    assert.ok(nanoExcerpt.length <= 40_000);
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

test("policySurfaceScanner confirms international transfer disclosure from recipient geography and safeguards", async () => {
  await withPolicyScan("policy-international-transfer-recipient-safeguards", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const transferSignal = privacy?.article13DisclosureSignals.find((signal) =>
      signal.disclosureType === "international_transfers"
    );

    assert.equal(privacy?.observedTopics.includes("international_transfers"), true);
    assert.equal(transferSignal?.status, "observed");
    assert.equal((transferSignal?.confidence ?? 0) >= 0.9, true);
    assert.match(transferSignal?.evidenceText ?? "", /Sometimes they may also be outside the EEA/i);
    assert.match(
      transferSignal?.evidenceText ?? "",
      /personal information is protected, both within and outside the EEA/i
    );
  }, {
    discoveryMode: "fast",
    nanoAssistProvider: {
      async classifyLinks() {
        throw new Error("Nano link ranking should not run for static privacy policy fixture.");
      },
    },
  });
});

test("policySurfaceScanner extracts late mature-policy GDPR transparency signals without promoting legal basis", async () => {
  let nanoExcerpt = "";
  const nanoAssistProvider: PolicyNanoAssistProvider = {
    ...createDefaultMockNanoPolicyAssistProvider(),
    async extractTopics(input) {
      nanoExcerpt = input.excerpt;
      return {
        assistId: input.assistId,
        observedTopics: [
          "controller_contact",
          "data_retention",
          "data_subject_rights",
          "international_transfers",
          "supervisory_authority",
          "automated_decision_making_or_profiling",
        ],
        article13DisclosureSignals: [],
        mentionedControls: [],
        mentionedPurposes: ["personalized ads"],
        mentionedRights: ["export", "delete"],
        mentionedVendors: [],
        confidence: 0.82,
      };
    },
  };

  await withPolicyScan("policy-google-like-late-sections", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const signals = privacy?.article13DisclosureSignals ?? [];
    const signalFor = (type: string) => signals.find((signal) => signal.disclosureType === type);
    const sectionHeadings = privacy?.retainedPolicySections?.map((section) => section.heading) ?? [];
    const sectionEvidence = privacy?.retainedArticle13SectionEvidence ?? [];
    const sectionEvidenceFor = (type: string) => sectionEvidence.find((evidence) => evidence.coverageArea === type);

    assert.ok(privacy);
    assert.match(nanoExcerpt, /Retaining your information/i);
    assert.match(nanoExcerpt, /Data transfers/i);
    assert.match(nanoExcerpt, /Compliance and cooperation with regulators/i);
    assert.equal(sectionHeadings.includes("Your privacy controls"), true);
    assert.equal(sectionHeadings.includes("Exporting and deleting your information"), true);
    assert.equal(sectionHeadings.includes("Retaining your information"), true);
    assert.equal(sectionHeadings.includes("Data transfers"), true);
    assert.equal(sectionHeadings.includes("Compliance and cooperation with regulators"), true);
    assert.equal(sectionEvidenceFor("data_retention")?.selectedPolicySectionHeading, "Retaining your information");
    assert.match(sectionEvidenceFor("data_retention")?.selectedPolicySectionExcerpt ?? "", /deleted or anonymized|retained as long as necessary/i);
    assert.equal(sectionEvidenceFor("data_subject_rights")?.signalObserved, "observed");
    assert.match(sectionEvidenceFor("data_subject_rights")?.selectedPolicySectionHeading ?? "", /privacy controls|exporting and deleting/i);
    assert.match(sectionEvidenceFor("data_subject_rights")?.selectedPolicySectionExcerpt ?? "", /update important privacy controls|Google Takeout|delete your information/i);
    assert.equal(sectionEvidenceFor("international_transfers")?.selectedPolicySectionHeading, "Data transfers");
    assert.equal(sectionEvidenceFor("supervisory_authority")?.selectedPolicySectionHeading, "Compliance and cooperation with regulators");
    assert.equal(sectionEvidenceFor("legal_basis")?.signalObserved, "not_confirmed");
    assert.equal(signalFor("data_retention")?.status, "observed");
    assert.equal(signalFor("data_retention")?.confidence, 0.9);
    assert.equal(signalFor("data_retention")?.selectedPolicySectionHeading, "Retaining your information");
    assert.match(signalFor("data_retention")?.evidenceText ?? "", /deleted or anonymized|retained as long as necessary/i);
    assert.equal(signalFor("data_subject_rights")?.status, "observed");
    assert.equal(signalFor("data_subject_rights")?.confidence, 0.8);
    assert.match(signalFor("data_subject_rights")?.selectedPolicySectionHeading ?? "", /privacy controls|exporting and deleting/i);
    assert.match(signalFor("data_subject_rights")?.evidenceText ?? "", /privacy controls|activity controls|ad settings|personalization settings|Google Takeout|delete your information|My Activity/i);
    assert.equal(signalFor("international_transfers")?.status, "observed");
    assert.equal(signalFor("international_transfers")?.confidence, 0.84);
    assert.equal(signalFor("international_transfers")?.selectedPolicySectionHeading, "Data transfers");
    assert.match(signalFor("international_transfers")?.evidenceText ?? "", /servers around the world|outside the country where you live|data privacy frameworks/i);
    assert.equal(signalFor("supervisory_authority")?.status, "partial");
    assert.equal(signalFor("supervisory_authority")?.confidence, 0.62);
    assert.equal(signalFor("supervisory_authority")?.selectedPolicySectionHeading, "Compliance and cooperation with regulators");
    assert.match(signalFor("supervisory_authority")?.evidenceText ?? "", /regulatory authorities|local data protection authorities|formal written complaints/i);
    assert.equal(signalFor("automated_decision_making_or_profiling")?.status, "partial");
    assert.equal(signalFor("automated_decision_making_or_profiling")?.confidence, 0.56);
    assert.equal(signalFor("automated_decision_making_or_profiling")?.selectedPolicySectionHeading, "Automated systems");
    assert.match(signalFor("automated_decision_making_or_profiling")?.evidenceText ?? "", /automated systems|algorithms|personalized ads/i);
    assert.equal(signalFor("controller_contact")?.status, "partial");
    assert.equal(signalFor("controller_contact")?.confidence, 0.62);
    assert.equal(signalFor("controller_contact")?.selectedPolicySectionHeading, "European requirements");
    assert.match(signalFor("controller_contact")?.evidenceText ?? "", /Google LLC|Google Ireland Limited|contact Google/i);
    assert.equal(signalFor("legal_basis"), undefined);
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
    assert.equal(rights?.confidence, 0.9);
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

test("policySurfaceScanner extracts rendered policy body instead of nav and footer noise", async () => {
  await withPolicyScan("policy-noisy-policy-body", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.match(privacy?.textExcerpt ?? "", /legal obligation, and legitimate interests/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /Repeated header noise/i);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /Repeated footer noise/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner retains accordion policy disclosures from static DOM", async () => {
  await withPolicyScan("policy-article13-accordions", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");

    assert.equal(privacy?.status, "fetched");
    assert.match(privacy?.textExcerpt ?? "", /lawful bases for processing/i);
    assert.match(privacy?.textExcerpt ?? "", /retain personal data only as long as necessary/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "data_retention" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "international_transfers" &&
      signal.status === "observed"
    ), true);
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner prefers a canonical policy document linked from a privacy-center shell", async () => {
  await withPolicyScan("policy-canonical-near-privacy-center", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(privacy?.status, "fetched");
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /^Privacy Center/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "controller_contact" &&
      signal.status === "observed"
    ), true);
    assert.equal(privacy?.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.status === "observed"
    ), true);
    assert.equal(
      diagnostics.policySurfaceDiagnostics?.failureClasses.some((entry) =>
        entry.failureClass === "privacy_center_shell_with_canonical_doc"
      ),
      true,
    );
  }, { enableNanoPolicyAssist: true });
});

test("policySurfaceScanner follows canonical privacy document metadata from a privacy-center shell", async () => {
  await withPolicyScan("policy-privacy-center-metadata-canonical", async ({ result }) => {
    const privacy = observedSurface(result.policySurfaceObservations, "privacy_policy");
    const diagnostics = await readPolicyCaptureDiagnostics(result);

    assert.equal(privacy?.status, "fetched");
    assert.equal((privacy?.normalizedUrl ?? "").endsWith("/privacy-center-metadata-shell"), true);
    assert.doesNotMatch(privacy?.textExcerpt ?? "", /^Privacy Center/i);
    assert.match(privacy?.textExcerpt ?? "", /standard contractual clauses/i);
    assert.equal(
      privacy?.article13DisclosureSignals.some((signal) =>
        signal.disclosureType === "legal_basis" &&
        signal.status === "observed"
      ),
      true,
    );
    assert.equal(
      diagnostics.policySurfaceDiagnostics?.failureClasses.some((entry) =>
        entry.failureClass === "privacy_center_shell_with_canonical_doc"
      ),
      true,
    );
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
  failureSummary: Array<{
    surfaceType: string;
    status: "failed" | "skipped_budget";
    httpStatus?: number;
    count: number;
  }>;
  documentBackedPolicySignals: Array<{
    url: string;
    surfaceType: string;
    reason: string;
  }>;
  limitationKeys: string[];
  candidateSummary: Array<{
    classifierProvenance: string;
    classifierReasonCodes: string[];
    discoveryMethod: string;
    linkText: string;
    matchedLocale?: string;
    matchStrength?: string;
    normalizedUrl: string;
    observationOnly: boolean;
    surfaceType: string;
  }>;
  winningSurfaceUrls: string[];
  policySurfaceDiagnostics?: {
    schemaVersion: string;
    summary: {
      corePolicySurfaceRetained: boolean;
      commonPathFallbackUsed: boolean;
      observationCounts: {
        total: number;
        fetched: number;
        failed: number;
        observedOnly: number;
        skippedBudget: number;
      };
      candidateCounts: {
        total: number;
        retainedInDiagnostics: number;
        observationOnly: number;
        guessedCommonPath: number;
      };
      limitationKeys: string[];
    };
    failureClasses: Array<{
      failureClass: string;
      count: number;
      representativeUrls: string[];
      httpStatuses: number[];
    }>;
    attemptedUrls: Array<{
      normalizedUrl: string;
      surfaceType: string;
      discoveryMethod: string;
      status: string;
      httpStatus?: number;
      failureClass?: string;
    }>;
    candidateSummary: Array<{
      normalizedUrl: string;
      surfaceType: string;
      discoveryMethod: string;
      observationOnly: boolean;
    }>;
    timingBuckets: Array<{
      bucket: string;
      durationMs: number;
      rows: number;
    }>;
    selectedCanonicalPolicyUrls: string[];
    truncation: {
      attemptedUrlCount: number;
      candidateCount: number;
      attemptedUrlsTruncated: boolean;
      candidatesTruncated: boolean;
      failureClassesTruncated: boolean;
      timingBucketsTruncated: boolean;
    };
  };
  policyCaptureDurationMs: number;
}> {
  const ref = result.artifactRefs.find((artifactRef) => artifactRef.artifactId === "policy_surface_capture_diagnostics");
  assert.ok(ref?.path, "policy capture diagnostics artifact should be retained");
  return JSON.parse(await readFile(ref.path, "utf8"));
}

async function startBlockedPolicyServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><main>Access blocked</main></body></html>");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function startNotFoundPolicyServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    if (url.pathname === "/" || url.pathname === "") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><body><main>Sports homepage without policy links</main></body></html>");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function startDirectLinkedStrongPolicyServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let port = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    if (url.pathname === "/" || url.pathname === "") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><body>
        <main>Sports federation homepage.</main>
        <footer><a href="http://127.0.0.1:${port}/parent/privacy">Privacy Policy</a></footer>
      </body></html>`);
      return;
    }
    if (url.pathname === "/parent/privacy") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><body>
        <main>
          <h1>Privacy Policy</h1>
          <p>The controller can be contacted through the privacy office and the data protection officer can be contacted by email.</p>
          <p>We process personal data to provide services, manage accounts, personalize content, measure performance, and operate support.</p>
          <p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>
          <p>Recipients include processors, service providers, analytics providers, advertising partners, affiliates, and public authorities where required.</p>
          <p>We retain personal data only as long as necessary for the purposes described in this notice or as required by law.</p>
          <p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>
          <p>We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.</p>
          <p>You may complain to a supervisory authority about our handling of personal data.</p>
        </main>
      </body></html>`);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  port = address.port;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function startSlowHomepagePolicyServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    if (url.pathname === "/" || url.pathname === "") {
      const timer = setTimeout(() => {
        if (!response.destroyed) {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><html><body><main>Slow homepage</main></body></html>");
        }
      }, 6_000);
      request.once("close", () => clearTimeout(timer));
      return;
    }
    if (url.pathname === "/privacy") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><body>
        <main>
          <h1>Privacy Policy</h1>
          <p>The controller for this service can be contacted at privacy@example.test.</p>
          <p>We process personal data to provide hospitality services and manage bookings.</p>
          <p>We retain personal data only as long as necessary and as required by law.</p>
        </main>
      </body></html>`);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function startLequipeStyleFrenchPolicyServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (url.pathname === "/" || url.pathname === "") {
      response.end(`<!doctype html><html><body>
        <main>Sport homepage</main>
        <footer><a href="/privacy">Politique de confidentialité</a></footer>
      </body></html>`);
      return;
    }
    if (url.pathname === "/privacy") {
      response.end(`<!doctype html><html><body>
        <main>
          <h1>Politique de confidentialité</h1>
          <h2>Qui sommes-nous ?</h2>
          <p>Les supports numériques L'Équipe sont édités par L'Équipe 24/24, responsable du traitement des données personnelles collectées sur le site et l'application.</p>
          <h2>Délégué à la protection des données</h2>
          <p>Vous pouvez contacter le délégué à la protection des données à l'adresse dpo@example.test pour toute question relative au traitement de vos données personnelles.</p>
          <h2>Pourquoi collectons-nous des données vous concernant ?</h2>
          <p>Nous collectons et utilisons vos données personnelles afin de gérer votre compte, personnaliser les contenus, mesurer l'audience et fournir les services demandés.</p>
          <h2>Quels sont les destinataires de vos données ?</h2>
          <p>Sont destinataires des données l'éditeur, les sociétés de son groupe, les prestataires sous-traitants, les partenaires commerciaux et les autorités compétentes.</p>
          <h2>De quels droits disposez-vous sur vos données ?</h2>
          <p>Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition, de limitation, de portabilité et du droit de retirer votre consentement.</p>
          <h2>En cas de transferts des données hors Union Européenne</h2>
          <p>Les transferts internationaux de données personnelles sont encadrés par des clauses contractuelles types et des garanties appropriées.</p>
        </main>
      </body></html>`);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function startTransportFailedPolicyServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.url === "/" || request.url === "") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><body><main>Retail homepage without policy links</main></body></html>");
      return;
    }
    response.destroy();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function startCommonPathAppShellPolicyServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (url.pathname === "/") {
      response.end(`<!doctype html><html><head><title>Healthcare app</title></head><body>
        <main>Book appointments and manage care. No footer policy links are rendered in this shell.</main>
      </body></html>`);
      return;
    }
    response.end(`<!doctype html><html><head>
      <title>Doctolib : Prenez rendez-vous en ligne chez un soignant</title>
    </head><body>
      <main>
        <h1>Trouvez un rendez-vous médical</h1>
        <p>Recherchez un praticien, prenez rendez-vous en ligne et gérez vos consultations depuis votre compte.</p>
        <form><input aria-label="Rechercher un professionnel de santé"><button>Rechercher</button></form>
      </main>
    </body></html>`);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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
