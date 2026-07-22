import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalShadowScoreProjectionComponents } from "./canonical-shadow-score-projection-fingerprint";

test("projection component fingerprints are stable across canonical input ordering", () => {
  const first = buildCanonicalShadowScoreProjectionComponents({
    coverageRows: [
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "row_b" },
      { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "row_a" }
    ],
    findings: [
      { family: "rights_gap", findingId: "finding_b", severity: "medium" },
      { family: "consent_tracking", findingId: "finding_a", severity: "high" }
    ]
  });
  const second = buildCanonicalShadowScoreProjectionComponents({
    coverageRows: [
      { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "row_a" },
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "row_b" }
    ],
    findings: [
      { family: "consent_tracking", findingId: "finding_a", severity: "high" },
      { family: "rights_gap", findingId: "finding_b", severity: "medium" }
    ]
  });

  assert.deepEqual(first, second);
  assert.match(first.coverageProjectionFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.findingProjectionFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.coverageRowCount, 2);
  assert.equal(first.findingCount, 2);
});

test("coverage and finding changes affect only their corresponding component fingerprint", () => {
  const baseline = buildCanonicalShadowScoreProjectionComponents({
    coverageRows: [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "row_a" }],
    findings: [{ family: "consent_tracking", findingId: "finding_a", severity: "high" }]
  });
  const coverageChanged = buildCanonicalShadowScoreProjectionComponents({
    coverageRows: [{ assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "row_a" }],
    findings: [{ family: "consent_tracking", findingId: "finding_a", severity: "high" }]
  });
  const findingChanged = buildCanonicalShadowScoreProjectionComponents({
    coverageRows: [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "row_a" }],
    findings: [{ family: "consent_tracking", findingId: "finding_a", severity: "medium" }]
  });

  assert.notEqual(baseline.coverageProjectionFingerprint, coverageChanged.coverageProjectionFingerprint);
  assert.equal(baseline.findingProjectionFingerprint, coverageChanged.findingProjectionFingerprint);
  assert.equal(baseline.coverageProjectionFingerprint, findingChanged.coverageProjectionFingerprint);
  assert.notEqual(baseline.findingProjectionFingerprint, findingChanged.findingProjectionFingerprint);
});
