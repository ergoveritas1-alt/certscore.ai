import assert from "node:assert/strict";
import test from "node:test";
import { buildScanEvidenceTriage } from "./scan-evidence-triage";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

function checklistItem(label: string): GdprEprivacyCoverageChecklistItem {
  return {
    assessmentStatus: "coverage_limitation",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "gdpr_transparency",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "policy_surface",
        ws01EvidenceRole: "policy_surface"
      },
      projectedFindings: [],
      retainedEvidence: {},
      statusBasis: "Retained policy evidence did not confirm this row."
    },
    evidenceRefs: [],
    evidenceState: "not_testable",
    explanation: "Not testable from retained evidence.",
    id: label.toLowerCase().replace(/\W+/g, "_"),
    label,
    note: "Not testable from retained evidence.",
    status: "Not testable",
    tone: "muted"
  };
}

test("buildScanEvidenceTriage summarizes policy, consent, and timing diagnostics", () => {
  const triage = buildScanEvidenceTriage({
    gdprEprivacyCoverageItems: [
      checklistItem("Retention disclosure"),
      checklistItem("Recipients/vendor categories disclosed")
    ],
    runtimeArtifacts: {
      consentControlInventoryDiagnostics: {
        schemaVersion: "certscore.consent_control_inventory_triage.v1",
        candidateControlCount: 4,
        candidateLabels: ["Akceptuję", "Ustawienia zaawansowane"],
        geometry: { candidateCount: 5, firstLayerAccept: true, firstLayerOptions: true, firstLayerReject: false },
        rejectionReasons: ["no_consent_context"],
        retainedControlCount: 2
      },
      consentSurfaceObserved: true,
      firstLayerConsentChoices: {
        acceptControlObserved: true,
        actionableControlInventoryRetained: true,
        managePreferencesControlObserved: true,
        rejectControlObserved: false
      },
      local_v2_dag_scan_core_duration_ms: 49_018,
      policyDisclosureSummary: {
        gdprTransparencyProductionEvidenceDiagnostics: {
          productionCreditSignalCount: 3
        }
      },
      policySurfaceDiagnostics: {
        schemaVersion: "certscore.policy_surface_diagnostics.v2",
        policyCaptureDurationMs: 19_800,
        selectedCanonicalPolicyUrls: ["https://example.test/privacy"],
        summary: {
          corePolicySurfaceRetained: true,
          candidateCounts: {
            guessedCommonPath: 2
          },
          limitationKeys: ["common_path_not_found_curtailed"],
          observationCounts: {
            failed: 1,
            fetched: 2
          }
        },
        failureClasses: [
          { count: 1, failureClass: "repeated_404_common_path_miss" }
        ],
        timingBuckets: [
          { bucket: "policy fetch group", durationMs: 18_000, rows: 3 }
        ]
      },
      scanTimingSummary: {
        schemaVersion: "certscore.scan_timing_summary.v1",
        handoffTimings: {
          artifactMirrorDurationMs: 1200,
          lambdaToWc01ResultRecordedMs: 1800
        },
        moduleTimings: [
          { durationMs: 29_000, moduleName: "policy-surface" },
          { durationMs: 8_000, moduleName: "pre-consent-runtime" }
        ]
      }
    }
  });

  assert.equal(triage.hasAnySignal, true);
  assert.ok(triage.policy.rows.some((row) => row.label === "Production Article 13 signals" && row.value === "3"));
  assert.deepEqual(triage.policy.notTestableRows, ["Retention disclosure", "Recipients/vendor categories disclosed"]);
  assert.deepEqual(triage.policy.selectedUrls, ["https://example.test/privacy"]);
  assert.ok(triage.policy.failureClasses.some((row) => row.label === "repeated_404_common_path_miss"));
  assert.deepEqual(triage.consent.candidateLabels, ["Akceptuję", "Ustawienia zaawansowane"]);
  assert.deepEqual(triage.consent.rejectionReasons, ["no_consent_context"]);
  assert.equal(triage.timing.slowestBuckets[0]?.label, "policy-surface");
});

test("buildScanEvidenceTriage stays bounded and handles missing diagnostics", () => {
  const triage = buildScanEvidenceTriage({
    gdprEprivacyCoverageItems: [],
    runtimeArtifacts: {
      consentControlInventoryDiagnostics: {
        candidateLabels: Array.from({ length: 20 }, (_, index) => `label-${index}`),
        rejectionReasons: Array.from({ length: 20 }, (_, index) => `reason-${index}`)
      }
    }
  });

  assert.equal(triage.consent.candidateLabels.length, 10);
  assert.equal(triage.consent.rejectionReasons.length, 10);
  assert.equal(triage.policy.selectedUrls.length, 0);
});
