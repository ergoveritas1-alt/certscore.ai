import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  normalizeResearchCandidate,
  writeConsentActionRecipeResearchArtifact,
} from "./scanners/consent-action-recipe-research.js";

test("recipe research candidate normalizes privacy choice routes", () => {
  const candidate = normalizeResearchCandidate({
    candidateId: "baseline_recipe_candidate_0",
    labelText: "Your Privacy Choices",
    href: "https://example.test/privacy/your-privacy-choices?token=secret#section",
    domLocation: "footer>a",
    frameKind: "main_frame",
    frameUrl: "https://example.test/",
  });

  assert.equal(candidate?.suggestedScenario, "privacy_opt_out_flow");
  assert.equal(candidate?.href, "https://example.test/privacy/your-privacy-choices");
  assert.equal(candidate?.reasonCodes.includes("privacy_choice_route_candidate"), true);
});

test("recipe research artifact links baseline route hypotheses to later outcomes", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-recipe-research-"));
  try {
    const writer = await createArtifactWriter(tempRoot);
    const ref = await writeConsentActionRecipeResearchArtifact({
      artifactWriter: writer,
      mode: "planned_parallel",
      sourceUrl: "https://example.test",
      normalizedUrl: "https://example.test/",
      captures: [{
        scenario: "baseline_pre_consent",
        recipeResearchCandidates: [normalizeResearchCandidate({
          candidateId: "baseline_recipe_candidate_0",
          labelText: "Your Privacy Choices",
          href: "https://example.test/privacy/your-privacy-choices",
        })!],
        actionAttempts: [],
      }, {
        scenario: "privacy_opt_out_flow",
        recipeResearchCandidates: [],
        actionAttempts: [{
          attemptId: "attempt_opt_out",
          actionType: "do_not_sell_share",
          attempted: true,
          succeeded: true,
          timestampMs: 1,
          scenario: "privacy_opt_out_flow",
          evidenceRefs: [],
          actionProof: {
            candidateObserved: true,
            attemptedStatus: "attempted_succeeded",
            proofAvailable: true,
            frameContext: {
              frameKind: "main_frame",
              frameUrl: "https://example.test/privacy/your-privacy-choices",
            },
            actionPath: "direct_action",
          },
        }],
      }],
      executionEntries: [{
        scenario: "privacy_opt_out_flow",
        actionType: "do_not_sell_share",
        reasonCodes: ["privacy_control_url_observed"],
        status: "completed",
        actionProofStatus: "attempted_succeeded",
        comparisonEligible: true,
        deadlineHit: false,
      }],
    });

    assert.equal(ref.artifactId, "consent_action_recipe_research");
    assert.equal(ref.sensitivity, "internal_only");
    assert.ok(ref.path);
    const artifact = JSON.parse(await readFile(ref.path, "utf8"));
    assert.equal(artifact.artifactVersion, "consent_action_recipe_research.v1");
    assert.equal(artifact.baseline.retainedCandidateCount, 1);
    assert.equal(artifact.hypotheses[0]?.scenario, "privacy_opt_out_flow");
    assert.equal(artifact.hindsightMatches[0]?.matched, true);
    assert.equal(
      artifact.hindsightMatches[0]?.reasonCodes.includes("direct_navigation_url_matched_action_frame"),
      true,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
