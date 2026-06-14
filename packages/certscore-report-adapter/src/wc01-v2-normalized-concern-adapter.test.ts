import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { projectWc01V2ShadowToAllowlistDryRun } from "./wc01-v2-allowlist-bridge";
import {
  wc01V2AllowlistExcerptFixture,
  wc01V2AllowlistShadowFixture,
  wc01V2AllowlistShadowRowFixture,
  wc01V2AllowlistVendorFixture,
} from "./wc01-v2-allowlist-fixtures";
import { projectAllowlistDryRunToConcernPolicyInputDraft } from "./wc01-v2-concern-policy-input-draft";
import {
  simulateConcernPolicyForInputDraft,
  type Wc01V2ConcernPolicySimulationDryRun,
  type Wc01V2SimulatedConcernOutcome,
} from "./wc01-v2-concern-policy-simulation";
import {
  projectSimulationJsonToNormalizedConcernCandidateDraft,
  projectSimulationToNormalizedConcernCandidateDraft,
} from "./wc01-v2-normalized-concern-adapter";
import {
  buildV2NormalizedConcernAdapterInspectionSummary,
  generateV2NormalizedConcernAdapterBatch,
  generateV2NormalizedConcernAdapterSingleFromFile,
  renderV2NormalizedConcernAdapterMarkdown,
} from "./wc01-v2-normalized-concern-adapter-output";

test("valid pre_consent_tracking candidate emits an internal draft", () => {
  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulationFixture());
  const candidate = candidateFor(adapterRun, "pre_consent_tracking");

  assert.equal(candidate.proposed.normalizedConcernKey, "v2.pre_consent_tracking.candidate");
  assert.equal(candidate.guardrails.productionEligible, false);
  assert.equal(candidate.guardrails.topFindingEligible, false);
  assert.equal(candidate.guardrails.gapEligible, false);
  assert.equal(candidate.guardrails.reviewOnly, true);
  assert.equal(candidate.evidence.sourceRefIds.length > 0, true);
  assert.equal(candidate.evidence.displaySafeExcerptIds.length > 0, true);
  assertNoForbiddenOutput(adapterRun);
});

test("analytics-only pre_consent_tracking candidate remains allowed", () => {
  const simulation = simulationFixture();
  simulation.simulatedConcernOutcomes = [withPurposes(outcomeFor(simulation, "pre_consent_tracking"), ["analytics"])];

  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulation);

  assert.equal(adapterRun.candidates.length, 1);
  assert.equal(adapterRun.candidates[0]?.evidence.vendorPurposeBasis[0]?.purpose, "analytics");
  assertNoForbiddenOutput(adapterRun);
});

test("advertising-only pre_consent_tracking candidate remains allowed", () => {
  const simulation = simulationFixture();
  simulation.simulatedConcernOutcomes = [withPurposes(outcomeFor(simulation, "pre_consent_tracking"), ["advertising"])];

  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulation);

  assert.equal(adapterRun.candidates.length, 1);
  assert.equal(adapterRun.candidates[0]?.evidence.vendorPurposeBasis[0]?.purpose, "advertising");
  assertNoForbiddenOutput(adapterRun);
});

test("mixed analytics and advertising candidate remains allowed", () => {
  const simulation = simulationFixture();
  simulation.simulatedConcernOutcomes = [withPurposes(outcomeFor(simulation, "pre_consent_tracking"), ["analytics", "advertising"])];

  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulation);

  assert.deepEqual(
    adapterRun.candidates[0]?.evidence.vendorPurposeBasis.map((basis) => basis.purpose).sort(),
    ["advertising", "analytics"],
  );
  assertNoForbiddenOutput(adapterRun);
});

test("missing consent-state context blocks pre-consent families", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_tracking", (outcome) => {
    outcome.adapterEvidence.preConsentOrConsentStateContext = [];
    outcome.sourceFindingKey = "runtime_tracking_detected";
  }));

  assert.equal(blocked.includes("missing_consent_state_context"), true);
});

test("missing refs and excerpts block candidates", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_tracking", (outcome) => {
    outcome.adapterEvidence.sourceRefIds = [];
    outcome.adapterEvidence.displaySafeExcerptIds = [];
    outcome.evidenceSummary.sourceRefCount = 0;
    outcome.evidenceSummary.displaySafeExcerptCount = 0;
  }));

  assert.equal(blocked.includes("missing_source_refs"), true);
  assert.equal(blocked.includes("missing_display_safe_excerpt_refs"), true);
});

test("tag_management-only support blocks candidates", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_tracking", (outcome) => {
    outcome.evidenceSummary.supportingPurposes = ["tag_management"];
    outcome.evidenceSummary.diagnosticPurposes = [];
    outcome.adapterEvidence.vendors = [{
      name: "Tag Manager",
      supportingPurposes: ["tag_management"],
      diagnosticPurposes: [],
    }];
  }));

  assert.equal(blocked.includes("tag_or_consent_management_only_non_supporting"), true);
});

test("consent_management-only support blocks candidates", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_tracking", (outcome) => {
    outcome.evidenceSummary.supportingPurposes = ["consent_management"];
    outcome.evidenceSummary.diagnosticPurposes = [];
    outcome.adapterEvidence.vendors = [{
      name: "CMP",
      supportingPurposes: ["consent_management"],
      diagnosticPurposes: [],
    }];
  }));

  assert.equal(blocked.includes("tag_or_consent_management_only_non_supporting"), true);
});

test("Tier C mixed candidate blocks before concern policy", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_tracking", (outcome) => {
    outcome.evidenceSummary.supportingPurposes = ["advertising", "security"];
    outcome.adapterEvidence.vendors = [
      {
        name: "Ad Vendor",
        supportingPurposes: ["advertising"],
        diagnosticPurposes: [],
      },
      {
        name: "Security Vendor",
        supportingPurposes: ["security"],
        diagnosticPurposes: [],
      },
    ];
  }));

  assert.equal(blocked.includes("tier_c_supporting_purpose"), true);
});

test("sensitive health candidate emits extra review metadata only", () => {
  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulationFixture({ url: "https://healthline.com" }));
  const candidate = candidateFor(adapterRun, "pre_consent_tracking");

  assert.equal(candidate.sensitiveContext?.requiresExtraReview, true);
  assert.equal(candidate.sensitiveContext?.categories.includes("health"), true);
  assert.equal(candidate.guardrails.productionEligible, false);
  assertNoForbiddenOutput(adapterRun);
});

test("sensitive children/education candidate emits extra review metadata only", () => {
  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulationFixture({ url: "https://pbskids.org" }));
  const candidate = candidateFor(adapterRun, "pre_consent_tracking");

  assert.equal(candidate.sensitiveContext?.requiresExtraReview, true);
  assert.equal(candidate.sensitiveContext?.categories.includes("children_education"), true);
  assert.equal(candidate.guardrails.topFindingEligible, false);
  assertNoForbiddenOutput(adapterRun);
});

test("valid third-party cookie/storage candidate emits a separate draft", () => {
  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulationFixture());
  const candidate = candidateFor(adapterRun, "pre_consent_cookie_storage");

  assert.equal(candidate.proposed.normalizedConcernKey, "v2.pre_consent_cookie_storage.candidate");
  assert.equal(candidate.evidence.cookieStorageContext?.party, "third_party");
  assert.equal(candidate.guardrails.gapEligible, false);
});

test("first-party-only cookie/storage blocks", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_cookie_storage", (outcome) => {
    outcome.sourceFindingKey = "first_party_cookie_pre_consent";
  }));

  assert.equal(blocked.includes("first_party_only_storage"), true);
});

test("CMP/security/necessary cookie blocks without exclusion caveat", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_cookie_storage", (outcome) => {
    outcome.adapterEvidence.familySpecificCaveats = [];
  }));

  assert.equal(blocked.includes("necessary_security_or_cmp_storage_excluded"), true);
});

test("session replay collection endpoint emits a candidate", () => {
  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulationFixture());
  const candidate = candidateFor(adapterRun, "session_replay_behavioral_analytics");

  assert.equal(candidate.evidence.sessionReplayContext?.collectionEvidence, "collection_endpoint");
  assert.equal(candidate.guardrails.productionEligible, false);
});

test("session replay library-only blocks", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("session_replay_behavioral_analytics", (outcome) => {
    outcome.adapterEvidence.sourceMatchedCriteria = ["session_replay_library_observed", "library_loaded_only"];
  }));

  assert.equal(blocked.includes("library_only_without_collection"), true);
});

test("RUM/live-chat-only support blocks session replay family", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("session_replay_behavioral_analytics", (outcome) => {
    outcome.evidenceSummary.supportingPurposes = ["rum", "live_chat"];
    outcome.evidenceSummary.diagnosticPurposes = [];
    outcome.adapterEvidence.vendors = [{
      name: "RUM Live Chat",
      supportingPurposes: ["rum", "live_chat"],
      diagnosticPurposes: [],
    }];
  }));

  assert.equal(blocked.includes("tier_c_supporting_purpose"), true);
  assert.equal(blocked.includes("rum_or_live_chat_only_non_supporting"), true);
});

test("coverage limitation or partial module blocks", () => {
  const blocked = blockedReasonFor(mutatedSingleOutcome("pre_consent_tracking", (outcome) => {
    outcome.adapterEvidence.coverageLimitations = ["preConsentRuntimeScanner_failed"];
  }));

  assert.equal(blocked.includes("required_source_module_incomplete"), true);
});

test("unsupported contract version and malformed artifact fail closed", () => {
  assert.throws(
    () => projectSimulationJsonToNormalizedConcernCandidateDraft(JSON.stringify({
      ...simulationFixture(),
      simulationVersion: "unsupported",
    })),
    /Unsupported Wc01V2ConcernPolicySimulationDryRun version/,
  );
  assert.throws(
    () => projectSimulationJsonToNormalizedConcernCandidateDraft("{not-json"),
    /Unexpected token|Expected property name/,
  );
});

test("forbidden phrase and raw field injection fail closed", () => {
  assert.throws(
    () => projectSimulationJsonToNormalizedConcernCandidateDraft(JSON.stringify({
      ...simulationFixture(),
      requestBody: "blocked",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => projectSimulationJsonToNormalizedConcernCandidateDraft(JSON.stringify({
      ...simulationFixture(),
      note: "gap_observed",
    })),
    /forbidden gap status token/,
  );
});

test("single-file adapter generator writes JSON and markdown summaries", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-normalized-adapter-"));
  try {
    const inputPath = join(tmp, "Wc01V2ConcernPolicySimulationDryRun.json");
    const outPath = join(tmp, "V2NormalizedConcernCandidateDraft.json");
    await writeFile(inputPath, `${JSON.stringify(simulationFixture({ url: "https://healthline.com" }), null, 2)}\n`, "utf8");

    const generated = await generateV2NormalizedConcernAdapterSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8"));
    const summary = buildV2NormalizedConcernAdapterInspectionSummary(saved);
    const markdown = renderV2NormalizedConcernAdapterMarkdown(summary);

    assert.equal(generated.summary.candidateCount, 3);
    assert.equal(summary.sensitiveContextCandidateCount, 3);
    assert.match(markdown, /Dry run only\. Not production concern policy\. Not persisted normalized concerns\. Not customer-facing report output\./);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("batch adapter continues on malformed simulation artifacts", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-normalized-adapter-batch-"));
  try {
    const inputDir = join(tmp, "input");
    const outDir = join(tmp, "out");
    await mkdir(join(inputDir, "good"), { recursive: true });
    await mkdir(join(inputDir, "bad"), { recursive: true });
    await writeFile(
      join(inputDir, "good", "Wc01V2ConcernPolicySimulationDryRun.json"),
      `${JSON.stringify(simulationFixture(), null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(inputDir, "bad", "Wc01V2ConcernPolicySimulationDryRun.json"), "{not-json", "utf8");

    const summary = await generateV2NormalizedConcernAdapterBatch({ inputDir, outDir });

    assert.equal(summary.totalInputFilesFound, 2);
    assert.equal(summary.succeededCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.totalCandidates, 3);
    assert.equal(summary.totalBlockedCandidates, 0);
    assert.equal(summary.malformedArtifacts.length, 1);
    assert.equal(summary.sitesWithCandidates.includes("good"), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("adapter modules do not import production policy, report, checklist, executive, top-finding, scoring, or regulatory-lens builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-normalized-concern-adapter.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-normalized-concern-adapter-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-normalized-concern-adapter-dry-run.ts"), "utf8"),
  ].join("\n")
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");

  assert.doesNotMatch(sources, /apps\/web\/.*concern-policy/);
  assert.doesNotMatch(sources, /normalized-concerns/);
  assert.doesNotMatch(sources, /unified-findings/);
  assert.doesNotMatch(sources, /coverage-checklist/);
  assert.doesNotMatch(sources, /executive-summary/);
  assert.doesNotMatch(sources, /top-finding/);
  assert.doesNotMatch(sources, /scoring/);
  assert.doesNotMatch(sources, /regulatory-lens/);
  assert.doesNotMatch(sources, /shared-scan-detail-view/);
});

function simulationFixture(input: { url?: string } = {}) {
  const shadow = wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "advertising" })],
      policy: {
        reviewOnlyReasons: ["shadow_projection_only"],
        matchedCriteria: ["collection_endpoint_observed", "pre_consent_tracking_signal_true"],
        missingCorroborators: [],
        demotionReasons: [],
      },
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_cookie_pre_consent",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "analytics" })],
      evidence: {
        excerptIds: ["excerpt_cookie"],
        sourceRefIds: ["ref_cookie"],
        displaySafeExcerpts: [wc01V2AllowlistExcerptFixture({
          evidenceKind: "cookie",
          displayLabel: "Cookie observed",
          cookieNames: ["_ga"],
          hostname: "analytics.vendor.test",
        })],
        capped: false,
        omittedCount: 0,
      },
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "session_replay_or_behavioral_analytics_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "session_replay" })],
      evidence: {
        excerptIds: ["excerpt_session_replay_collect"],
        sourceRefIds: ["ref_session_replay_collect"],
        displaySafeExcerpts: [wc01V2AllowlistExcerptFixture({
          evidenceKind: "network_request",
          displayLabel: "Session replay collection endpoint",
          hostname: "collector.session-replay.test",
        })],
        capped: false,
        omittedCount: 0,
      },
      policy: {
        reviewOnlyReasons: ["shadow_projection_only"],
        matchedCriteria: ["session_replay_collection_observed"],
        missingCorroborators: [],
        demotionReasons: [],
      },
    }),
  ]);
  if (input.url) {
    shadow.source = { ...shadow.source, url: input.url };
  }
  return simulateConcernPolicyForInputDraft(
    projectAllowlistDryRunToConcernPolicyInputDraft(projectWc01V2ShadowToAllowlistDryRun(shadow)),
  );
}

function mutatedSingleOutcome(
  family: Wc01V2SimulatedConcernOutcome["concernFamily"],
  mutate: (outcome: Wc01V2SimulatedConcernOutcome) => void,
) {
  const simulation = simulationFixture();
  const outcome = structuredClone(outcomeFor(simulation, family));
  mutate(outcome);
  simulation.simulatedConcernOutcomes = [outcome];
  return simulation;
}

function outcomeFor(
  simulation: Wc01V2ConcernPolicySimulationDryRun,
  family: Wc01V2SimulatedConcernOutcome["concernFamily"],
) {
  const outcome = simulation.simulatedConcernOutcomes.find((item) => item.concernFamily === family);
  assert.ok(outcome);
  return outcome;
}

function withPurposes(outcome: Wc01V2SimulatedConcernOutcome, purposes: string[]) {
  const clone = structuredClone(outcome);
  clone.evidenceSummary.supportingPurposes = purposes;
  clone.evidenceSummary.diagnosticPurposes = [];
  clone.adapterEvidence.vendors = purposes.map((purpose) => ({
    name: `${purpose} Vendor`,
    supportingPurposes: [purpose],
    diagnosticPurposes: [],
  }));
  return clone;
}

function candidateFor(
  adapterRun: ReturnType<typeof projectSimulationToNormalizedConcernCandidateDraft>,
  family: string,
) {
  const candidate = adapterRun.candidates.find((item) => item.proposed.concernFamily === family);
  assert.ok(candidate);
  return candidate;
}

function blockedReasonFor(simulation: Wc01V2ConcernPolicySimulationDryRun) {
  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(simulation);
  assert.equal(adapterRun.candidates.length, 0);
  assert.equal(adapterRun.blockedCandidates.length, 1);
  assertNoForbiddenOutput(adapterRun);
  return adapterRun.blockedCandidates[0]?.blockReasons ?? [];
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /gap_observed/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
}
