import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE,
  PRIVACY_RUNTIME_FINDINGS_DATASET_SEED,
  summarizePrivacyRuntimeFindingsDataset
} from "./privacy-runtime-findings.dataset";

test("privacy runtime seed corpus has the planned v1 distribution", () => {
  const summary = summarizePrivacyRuntimeFindingsDataset(PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE);

  assert.equal(summary.currentExampleCount, 180);
  assert.equal(summary.positiveCount, 72);
  assert.equal(summary.negativeCount, 72);
  assert.equal(summary.borderlineCount, 36);

  assert.equal(summary.groupCounts.preconsent_tracking, 45);
  assert.equal(summary.groupCounts.fingerprinting, 45);
  assert.equal(summary.groupCounts.dark_pattern_consent, 60);
  assert.equal(summary.groupCounts.disclosure_runtime_mismatch, 30);
});

test("privacy runtime corpus keeps negatives and borderline cases in every finding group", () => {
  const groups = new Map<string, { borderline: number; negative: number; positive: number; total: number }>();

  for (const example of PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE) {
    const current = groups.get(example.findingGroup) ?? { borderline: 0, negative: 0, positive: 0, total: 0 };
    current.total += 1;
    if (example.scenarioType === "negative_control") {
      current.negative += 1;
    } else if (example.scenarioType === "borderline_review" || example.scenarioType === "borderline_audit_only") {
      current.borderline += 1;
    } else {
      current.positive += 1;
    }
    groups.set(example.findingGroup, current);
  }

  for (const [group, counts] of groups) {
    assert.ok(counts.total >= 30, `${group} should have at least 30 examples`);
    assert.ok(counts.negative >= counts.positive, `${group} should have at least as many negatives as positives`);
    assert.ok(counts.borderline / counts.total >= 0.2, `${group} should keep borderline coverage at or above 20%`);
  }
});

test("privacy runtime reviewed corpus can extend the seed set", () => {
  assert.ok(PRIVACY_RUNTIME_FINDINGS_DATASET_SEED.length >= PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE.length);
});

test("privacy runtime corpus records downgrade or negative reasons for non-positive rows", () => {
  for (const example of PRIVACY_RUNTIME_FINDINGS_DATASET_SEED) {
    if (example.scenarioType === "negative_control") {
      assert.equal(typeof example.negativeControlReason, "string", `${example.id} needs a negative-control reason`);
    }
    if (example.scenarioType === "borderline_review" || example.scenarioType === "borderline_audit_only") {
      assert.equal(typeof example.downgradeReason, "string", `${example.id} needs a downgrade reason`);
    }
  }
});
