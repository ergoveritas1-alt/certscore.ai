import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  projectWc01V2ShadowToAllowlistDryRun,
} from "./wc01-v2-allowlist-bridge";
import {
  wc01V2AllowlistExcerptFixture,
  wc01V2AllowlistShadowFixture,
  wc01V2AllowlistShadowRowFixture,
  wc01V2AllowlistVendorFixture,
} from "./wc01-v2-allowlist-fixtures";
import {
  projectAllowlistDryRunToConcernPolicyInputDraft,
} from "./wc01-v2-concern-policy-input-draft";
import {
  simulateConcernPolicyForInputDraft,
  simulateConcernPolicyForInputDraftJson,
  type Wc01V2ConcernPolicySimulationDryRun,
} from "./wc01-v2-concern-policy-simulation";
import {
  buildWc01V2ConcernPolicySimulationInspectionSummary,
  generateWc01V2ConcernPolicySimulationBatch,
  generateWc01V2ConcernPolicySimulationSingleFromFile,
  renderWc01V2ConcernPolicySimulationMarkdown,
} from "./wc01-v2-concern-policy-simulation-output";

test("simulated outcomes remain internal and ineligible", () => {
  const simulation = simulateConcernPolicyForInputDraft(refinedDraftFixture());

  assert.equal(simulation.productionEligible, false);
  assert.equal(simulation.status, "simulation_review_only");
  assert.equal(simulation.simulatedConcernOutcomes.length, 3);
  assert.equal(simulation.blockedInputs.length, 0);
  for (const outcome of simulation.simulatedConcernOutcomes) {
    assert.equal(outcome.productionEligible, false);
    assert.equal(outcome.topFindingEligible, false);
    assert.equal(outcome.gapEligible, false);
    assert.equal(outcome.policyRequirements.requiresPolicyOwnerReview, true);
    assert.equal(outcome.policyRequirements.requiresEvidenceContractReview, true);
    assert.equal(outcome.policyRequirements.requiresCopyReview, true);
    assert.equal(outcome.policyRequirements.requiresProductionIntegrationProposal, true);
  }
  assertNoForbiddenOutput(simulation);
});

test("sensitive-context inputs become sensitive review candidates without promotion", () => {
  const draft = refinedDraftFixture({ url: "https://healthline.com" });
  const simulation = simulateConcernPolicyForInputDraft(draft);

  assert.equal(simulation.simulatedConcernOutcomes.length, 3);
  assert.equal(simulation.simulatedConcernOutcomes.every((outcome) =>
    outcome.simulatedPolicyStatus === "policy_review_candidate_sensitive_context"
  ), true);
  assert.equal(simulation.simulatedConcernOutcomes.every((outcome) =>
    outcome.policyRequirements.requiresSensitiveContextReview
  ), true);
  assert.equal(simulation.simulatedConcernOutcomes.every((outcome) =>
    outcome.productionEligible === false && outcome.topFindingEligible === false && outcome.gapEligible === false
  ), true);
  assertNoForbiddenOutput(simulation);
});

test("missing evidence becomes policy needs more evidence", () => {
  const draft = refinedDraftFixture();
  const [input] = draft.concernInputs;
  assert.ok(input);
  draft.concernInputs = [{
    ...input,
    evidenceRefs: {
      ...input.evidenceRefs,
      sourceRefIds: [],
      excerptIds: [],
      displaySafeExcerptCount: 0,
    },
  }];

  const simulation = simulateConcernPolicyForInputDraft(draft);
  const outcome = simulation.simulatedConcernOutcomes[0];

  assert.equal(outcome?.simulatedPolicyStatus, "policy_needs_more_evidence");
  assert.equal(outcome?.reasons.includes("missing_source_refs"), true);
  assert.equal(outcome?.reasons.includes("missing_display_safe_evidence"), true);
  assertNoForbiddenOutput(simulation);
});

test("unsupported or malformed input fails closed", () => {
  assert.throws(
    () => simulateConcernPolicyForInputDraftJson("{\"draftVersion\":\"bad\"}"),
    /Unsupported Wc01V2ConcernPolicyInputDraft version/,
  );

  const draft = refinedDraftFixture();
  const [input] = draft.concernInputs;
  assert.ok(input);
  draft.concernInputs = [{
    ...input,
    productionEligible: true as false,
  }];

  const simulation = simulateConcernPolicyForInputDraft(draft);
  assert.equal(simulation.simulatedConcernOutcomes.length, 0);
  assert.equal(simulation.blockedInputs.length, 1);
  assert.equal(simulation.blockedInputs[0]?.blockReasons.includes("input_production_eligible"), true);
  assertNoForbiddenOutput(simulation);
});

test("tracking and cookie storage remain separate families", () => {
  const simulation = simulateConcernPolicyForInputDraft(refinedDraftFixture());

  assert.equal(
    simulation.simulatedConcernOutcomes.some((outcome) =>
      outcome.concernFamily === "pre_consent_tracking" &&
      outcome.suggestedConcernKey === "v2_draft.pre_consent_tracking.review_only"
    ),
    true,
  );
  assert.equal(
    simulation.simulatedConcernOutcomes.some((outcome) =>
      outcome.concernFamily === "pre_consent_cookie_storage" &&
      outcome.suggestedConcernKey === "v2_draft.pre_consent_cookie_storage.review_only"
    ),
    true,
  );
});

test("session replay requires collection or equivalent strong runtime evidence", () => {
  const draft = refinedDraftFixture();
  const sessionReplay = draft.concernInputs.find((input) =>
    input.proposedConcernFamily === "session_replay_behavioral_analytics"
  );
  assert.ok(sessionReplay);
  draft.concernInputs = [{
    ...sessionReplay,
    evidenceAssessment: {
      ...sessionReplay.evidenceAssessment,
      sourceMatchedCriteria: ["session_replay_library_observed", "library_loaded_only"],
    },
  }];

  const simulation = simulateConcernPolicyForInputDraft(draft);
  const outcome = simulation.simulatedConcernOutcomes[0];

  assert.equal(outcome?.simulatedPolicyStatus, "policy_needs_more_evidence");
  assert.equal(
    outcome?.reasons.includes("missing_session_replay_collection_or_equivalent_strong_runtime_evidence"),
    true,
  );
});

test("single-file simulation generator writes JSON and markdown summaries", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-policy-sim-"));
  try {
    const inputPath = join(tmp, "Wc01V2ConcernPolicyInputDraft.json");
    const outPath = join(tmp, "Wc01V2ConcernPolicySimulationDryRun.json");
    await writeFile(inputPath, `${JSON.stringify(refinedDraftFixture({ url: "https://healthline.com" }), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ConcernPolicySimulationSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as Wc01V2ConcernPolicySimulationDryRun;
    const summary = buildWc01V2ConcernPolicySimulationInspectionSummary(saved);
    const markdown = renderWc01V2ConcernPolicySimulationMarkdown(summary);

    assert.equal(generated.summary.simulatedOutcomeCount, 3);
    assert.equal(summary.sensitiveContextOutcomeCount, 3);
    assert.equal(summary.outcomesBySimulatedPolicyStatus.policy_review_candidate_sensitive_context, 3);
    assert.match(markdown, /Dry run only\. Not production concern policy\. Not persisted normalized concerns\. Not customer-facing report output\./);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("batch simulation continues on malformed inputs", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-policy-sim-batch-"));
  try {
    const inputDir = join(tmp, "input");
    const outDir = join(tmp, "out");
    await mkdir(join(inputDir, "good"), { recursive: true });
    await mkdir(join(inputDir, "bad"), { recursive: true });
    await writeFile(
      join(inputDir, "good", "Wc01V2ConcernPolicyInputDraft.json"),
      `${JSON.stringify(refinedDraftFixture(), null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(inputDir, "bad", "Wc01V2ConcernPolicyInputDraft.json"), "{not-json", "utf8");

    const summary = await generateWc01V2ConcernPolicySimulationBatch({ inputDir, outDir });

    assert.equal(summary.totalInputFilesFound, 2);
    assert.equal(summary.succeededCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.totalInputs, 3);
    assert.equal(summary.totalSimulatedOutcomes, 3);
    assert.equal(summary.totalBlockedInputs, 0);
    assert.equal(summary.malformedArtifacts.length, 1);
    assert.equal(summary.sitesWithOutcomes.includes("good"), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("simulation modules do not import production policy, finding, checklist, or report builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-simulation.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-simulation-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-concern-policy-simulation-dry-run.ts"), "utf8"),
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
  assert.doesNotMatch(sources, /shared-scan-detail-view/);
});

function refinedDraftFixture(input: { url?: string } = {}) {
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
  return projectAllowlistDryRunToConcernPolicyInputDraft(projectWc01V2ShadowToAllowlistDryRun(shadow));
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /gap_observed/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
}
