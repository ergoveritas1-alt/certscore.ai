import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE,
  PRIVACY_RUNTIME_FINDINGS_DATASET_SEED,
  PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS,
  summarizePrivacyRuntimeFindingsDataset
} from "./privacy-runtime-findings.dataset";

test("privacy runtime seed corpus has the current v1.1 distribution", () => {
  const summary = summarizePrivacyRuntimeFindingsDataset(PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE);

  assert.ok(summary.currentExampleCount >= 180);
  assert.deepEqual(
    {
      borderlineCount: summary.borderlineCount,
      currentExampleCount: summary.currentExampleCount,
      negativeCount: summary.negativeCount,
      positiveCount: summary.positiveCount
    },
    {
      borderlineCount: 46,
      currentExampleCount: 210,
      negativeCount: 82,
      positiveCount: 82
    }
  );

  assert.deepEqual(
    {
      dark_pattern_consent: summary.groupCounts.dark_pattern_consent,
      disclosure_runtime_mismatch: summary.groupCounts.disclosure_runtime_mismatch,
      fingerprinting: summary.groupCounts.fingerprinting,
      preconsent_tracking: summary.groupCounts.preconsent_tracking
    },
    {
      dark_pattern_consent: 60,
      disclosure_runtime_mismatch: 30,
      fingerprinting: 45,
      preconsent_tracking: 75
    }
  );

  assert.deepEqual(
    {
      live_artifact: summary.sourceKindCounts.live_artifact,
      nano_review: summary.sourceKindCounts.nano_review,
      regression_case: summary.sourceKindCounts.regression_case,
      synthetic_fixture: summary.sourceKindCounts.synthetic_fixture
    },
    {
      live_artifact: 60,
      nano_review: 12,
      regression_case: 69,
      synthetic_fixture: 69
    }
  );
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

test("privacy runtime corpus covers the production top surfaced findings", () => {
  const counts = new Map<string, { borderline: number; negative: number; positive: number; total: number }>();

  for (const findingId of PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS) {
    counts.set(findingId, { borderline: 0, negative: 0, positive: 0, total: 0 });
  }

  for (const example of PRIVACY_RUNTIME_FINDINGS_DATASET_SEED) {
    const current = counts.get(example.findingId);
    if (!current) {
      continue;
    }

    current.total += 1;
    if (example.scenarioType === "negative_control") {
      current.negative += 1;
    } else if (example.scenarioType === "borderline_review" || example.scenarioType === "borderline_audit_only") {
      current.borderline += 1;
    } else {
      current.positive += 1;
    }
  }

  for (const [findingId, count] of counts) {
    assert.ok(count.total >= 30, `${findingId} should have at least 30 calibration examples`);
    assert.ok(count.positive >= 10, `${findingId} should have at least 10 positive examples`);
    assert.ok(count.negative >= 10, `${findingId} should have at least 10 negative examples`);
    assert.ok(count.borderline >= 10, `${findingId} should have at least 10 borderline examples`);
  }
});

test("production top surfaced examples retain explicit URL assessment rationale", () => {
  for (const example of PRIVACY_RUNTIME_FINDINGS_DATASET_SEED) {
    if (!PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS.includes(example.findingId as (typeof PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS)[number])) {
      continue;
    }

    if (!example.id.startsWith("prod-top-")) {
      continue;
    }

    assert.equal(typeof example.evidence.urlAssessment?.reviewedUrl, "string", `${example.id} needs reviewed URL`);
    assert.equal(typeof example.evidence.urlAssessment?.rationale, "string", `${example.id} needs URL assessment rationale`);
    assert.equal(typeof example.evidence.signalKey, "string", `${example.id} needs signal key`);
  }
});

test("positive context calibration expands behavioral analytics and cookie-policy controls", () => {
  const counts = new Map<string, { borderline: number; negative: number; positive: number; supportPositive: number; total: number }>();

  for (const findingId of ["behavioral_analytics_disclosure_present", "cookie_policy_present"]) {
    counts.set(findingId, { borderline: 0, negative: 0, positive: 0, supportPositive: 0, total: 0 });
  }

  for (const example of PRIVACY_RUNTIME_FINDINGS_DATASET_SEED) {
    const current = counts.get(example.findingId);
    if (!current || !example.id.startsWith("context-")) {
      continue;
    }

    current.total += 1;
    if (example.scenarioType === "negative_control") {
      current.negative += 1;
    } else if (example.scenarioType === "borderline_review" || example.scenarioType === "borderline_audit_only") {
      current.borderline += 1;
    } else {
      current.positive += 1;
    }
    if (example.findingId === "cookie_policy_present" && example.expected.presentationState === "support_only") {
      current.supportPositive += 1;
    }
  }

  assert.deepEqual(counts.get("behavioral_analytics_disclosure_present"), {
    borderline: 8,
    negative: 12,
    positive: 10,
    supportPositive: 0,
    total: 30
  });
  assert.deepEqual(counts.get("cookie_policy_present"), {
    borderline: 8,
    negative: 14,
    positive: 8,
    supportPositive: 16,
    total: 30
  });
});
