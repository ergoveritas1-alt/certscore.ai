import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import {
  buildPersistedFirstLayerConsentEvidence,
  projectFirstLayerConsentChoices,
  withPersistedFirstLayerConsentEvidence
} from "./scan-report-consent-projection";

const projectionPath = "apps/web/server/scans/scan-report-projection.ts";

test("scan report projection requires the canonical v2 consent assessment", async () => {
  const source = await readFile(projectionPath, "utf8");

  assert.match(source, /SCAN_REPORT_PROJECTION_VERSION = "scan-report-projection-v4"/);
  assert.match(source, /Refusing to mark scan .* report projection ready before ConsentControlAssessment v2 is materialized/);
  assert.match(source, /assessment\.controls\.accept\.state === "observed"/);
  assert.match(source, /assessment\.controls\.reject\.state === "observed"/);
  assert.match(source, /assessment\.controls\.options\.state === "observed"/);
  assert.match(source, /consent_control_assessment/);
  assert.match(source, /consent_coverage_status/);
  assert.match(source, /consent_surface_status/);
});

test("Oxfam retained controls survive the persisted report boundary", () => {
  const evidence = buildPersistedFirstLayerConsentEvidence({
    acceptControlObserved: true,
    actionableControlInventoryRetained: true,
    controls: [
      {
        actionType: "manage_preferences",
        classifierReasonCodes: ["matched_options"],
        label: "Cookie Settings",
        matchedTerm: "cookie settings",
        semanticRole: "preferences"
      },
      {
        actionType: "accept_all",
        classifierReasonCodes: ["matched_accept"],
        label: "Accept all cookies",
        matchedTerm: "accept all",
        semanticRole: "explicit_accept"
      },
      {
        actionType: "reject_all",
        classifierReasonCodes: ["matched_reject"],
        classifierVariant: "necessary_only",
        label: "Accept only essential cookies",
        matchedTerm: "only essential",
        semanticRole: "necessary_only"
      }
    ],
    layerInspected: "first_layer",
    managePreferencesControlObserved: true,
    rejectControlObserved: true,
    visibleChoiceLabels: [
      "Cookie Settings",
      "Accept all cookies",
      "Accept only essential cookies"
    ]
  });
  assert.ok(evidence);

  const hydrated = withPersistedFirstLayerConsentEvidence(
    { consentSurfaceObserved: true },
    { consent_control_evidence: evidence }
  );
  assert.deepEqual(
    (hydrated?.firstLayerConsentChoices as { controls: unknown[] }).controls,
    evidence.controls
  );
  assert.equal(
    ((hydrated?.hybridRuntimeEvidence as Record<string, unknown>)
      .firstLayerConsentChoices as { rejectControlObserved: boolean })
      .rejectControlObserved,
    true
  );

  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: hydrated,
    scanCompleted: true,
    snapshot: {
      consent_control_evidence: evidence,
      cookie_banner_present: true
    }
  });
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.match(
    outcomes.reject_all_path_availability?.evidenceRefs.join(" ") ?? "",
    /Accept only essential cookies/
  );
});

test("Oxfam first-layer controls project canonically to A/R/O", () => {
  assert.deepEqual(projectFirstLayerConsentChoices({
    acceptControlObserved: true,
    actionableControlInventoryRetained: true,
    controls: [
      { actionType: "manage_preferences", label: "Cookie Settings" },
      { actionType: "accept_all", label: "Accept all cookies" },
      { actionType: "reject_all", label: "Accept only essential cookies" }
    ],
    layerInspected: "first_layer",
    managePreferencesControlObserved: true,
    rejectControlObserved: true
  }), {
    accept: true,
    options: true,
    reject: true,
    retained: true
  });
});

test("incomplete control inventory remains unknown instead of projecting false", () => {
  assert.deepEqual(projectFirstLayerConsentChoices({
    acceptControlObserved: false,
    actionableControlInventoryRetained: false,
    geometryAssessment: "incomplete",
    layerInspected: "unknown",
    managePreferencesControlObserved: false,
    rejectControlObserved: false
  }), {
    accept: false,
    options: false,
    reject: false,
    retained: false
  });
});
