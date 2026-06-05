import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES } from "../../../../packages/shared/src/regulatory-review/california-privacy-runtime-fixtures";
import {
  loadCaliforniaPhase2Artifacts,
  replayCaliforniaPhase2Artifact,
  renderCaliforniaPhase2ReplayMarkdown,
  writeCaliforniaPhase2ReplayReports
} from "./california-phase2-validation-replay";

test("California Phase 2 replay reads WS01-style artifact exports through the canonical WC01 pipeline", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "california-phase2-replay-"));
  const artifactPath = path.join(tempDir, "example.test.runtime-artifacts.json");
  await writeFile(
    artifactPath,
    `${JSON.stringify({
      validationVersion: "california-phase2-validation.v1",
      domain: "example.test",
      scanId: "scan-example",
      runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.evidenceRichReviewSignal
    }, null, 2)}\n`,
    "utf8"
  );

  const [loaded] = await loadCaliforniaPhase2Artifacts(tempDir);
  assert.ok(loaded);
  const audit = replayCaliforniaPhase2Artifact(loaded.artifact);

  assert.equal(audit.domain, "example.test");
  assert.equal(audit.unifiedFindingIds.includes("cpra_cba_opt_out_missing"), true);
  assert.equal(audit.unifiedFindingIds.includes("gpc_signal_not_honored"), true);

  const optOutRow = audit.rowAudits.find((row) => row.rowId === "do_not_sell_share_availability");
  assert.equal(optOutRow?.status, "potential_gap");
  assert.equal(optOutRow?.selfSufficient, true);
  assert.equal(optOutRow?.evidenceFields.includes("choiceControlsInspected"), true);
  assert.equal(optOutRow?.evidenceFields.includes("targetedAdvertisingSignalsObserved"), true);

  const rightsRow = audit.rowAudits.find((row) => row.rowId === "consumer_rights_request_methods");
  assert.equal(rightsRow?.status, "observed");
  assert.equal(rightsRow?.selfSufficient, true);
  assert.equal(rightsRow?.evidenceFields.includes("consumerRightsRequestMethodUrls"), true);

  const notTestableRows = audit.rowAudits.filter((row) => row.status === "not_testable");
  assert.equal(
    notTestableRows.every((row) => row.selfSufficient && row.missingOrIncompleteSourceSignals.length > 0),
    true
  );

  const reportPaths = await writeCaliforniaPhase2ReplayReports({
    audits: [audit],
    outDir: path.join(tempDir, "out")
  });
  assert.match(reportPaths.jsonPath, /wc01-california-phase2-replay\.audit\.json$/);
  assert.match(renderCaliforniaPhase2ReplayMarkdown([audit]), /California Phase 2 Validation Replay/);
});

test("California Phase 2 replay treats retained collection-context gaps as self-sufficient", () => {
  const audit = replayCaliforniaPhase2Artifact({
    validationVersion: "california-phase2-validation.v1",
    domain: "collection-gap.example",
    scanId: "scan-collection-gap",
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: null,
        collectionContextObserved: true,
        collectionContextUrls: ["https://collection-gap.example/signup"],
        collectionContextTypes: ["pre_submit_urlencoded"],
        collectionEvidenceSources: ["pre_submit_capture"],
        collectionFieldContexts: [
          {
            fieldLabel: "Email",
            fieldName: "email",
            fieldType: "email",
            pageUrl: "https://collection-gap.example/signup",
            source: "pre_submit_capture"
          }
        ],
        collectionNoticeCueObserved: false
      }
    }
  });

  const row = audit.rowAudits.find((item) => item.rowId === "notice_at_collection");
  assert.equal(row?.status, "potential_gap");
  assert.equal(row?.selfSufficient, true);
  assert.equal(row?.evidenceFields.includes("collectionFieldContexts"), true);
  assert.equal(row?.evidenceFields.includes("collectionNoticeCueObserved"), true);
});

test("California Phase 2 replay keeps confirmed post-opt-out reduction evidence self-sufficient", () => {
  const audit = replayCaliforniaPhase2Artifact({
    validationVersion: "california-phase2-validation.v1",
    domain: "observed-post-opt-out.example",
    scanId: "scan-observed-post-opt-out",
    runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.observedPostOptOutReduction
  });

  const postOptOutRow = audit.rowAudits.find((row) => row.rowId === "post_opt_out_tracking_behavior");
  assert.equal(postOptOutRow?.status, "observed");
  assert.equal(postOptOutRow?.selfSufficient, true);
  assert.equal(postOptOutRow?.evidenceFields.includes("postOptOutTrackingReductionObserved"), true);
  assert.equal(postOptOutRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.removedTrackerVendors"), true);

  const frictionRow = audit.rowAudits.find((row) => row.rowId === "opt_out_friction_dark_patterns");
  assert.equal(frictionRow?.status, "review_signal");
  assert.equal(frictionRow?.selfSufficient, true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceCenterProbeUrl"), true);
});

test("California Phase 2 replay preserves limited privacy-choice probe diagnostics without upgrading post-opt-out tracking", () => {
  const audit = replayCaliforniaPhase2Artifact({
    validationVersion: "california-phase2-validation.v1",
    domain: "privacy-choice-limited.example",
    scanId: "scan-privacy-choice-limited",
    runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.privacyChoiceProbeLimited
  });

  const optOutRow = audit.rowAudits.find((row) => row.rowId === "do_not_sell_share_availability");
  assert.equal(optOutRow?.status, "observed");
  assert.equal(optOutRow?.selfSufficient, true);

  const frictionRow = audit.rowAudits.find((row) => row.rowId === "opt_out_friction_dark_patterns");
  assert.equal(frictionRow?.status, "review_signal");
  assert.equal(frictionRow?.selfSufficient, true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceCenterProbeAttempts"), true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceCenterProbeErrorCategory"), true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceCenterProbeFinalUrl"), true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceCenterProbeReason"), true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceActionCandidateCount"), true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceSaveCandidateCount"), true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.preferenceToggleCandidateCount"), true);
  assert.equal(frictionRow?.evidenceFields.includes("privacyChoiceInteractionEvidence.visibleTextSnippets"), true);

  const postOptOutRow = audit.rowAudits.find((row) => row.rowId === "post_opt_out_tracking_behavior");
  assert.equal(postOptOutRow?.status, "not_testable");
  assert.equal(postOptOutRow?.selfSufficient, true);
  assert.equal(postOptOutRow?.missingOrIncompleteSourceSignals.some((signal) => signal.field === "californiaPrivacyEvidence.optOutInteractionConfirmed"), true);
});

test("California Phase 2 replay retains sensitive-surface and Limit Use evidence as canonical row postures", () => {
  const audit = replayCaliforniaPhase2Artifact({
    validationVersion: "california-phase2-validation.v1",
    domain: "sensitive-runtime.example",
    scanId: "scan-sensitive-runtime",
    runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.sensitiveInputRuntimeSignal
  });

  const noticeRow = audit.rowAudits.find((row) => row.rowId === "notice_at_collection");
  assert.equal(noticeRow?.status, "potential_gap");
  assert.equal(noticeRow?.selfSufficient, true);
  assert.equal(noticeRow?.evidenceFields.includes("collectionContextUrls"), true);
  assert.equal(noticeRow?.evidenceFields.includes("collectionNoticeCueObserved"), true);

  const sensitiveRow = audit.rowAudits.find((row) => row.rowId === "sensitive_forms_third_party_tracking");
  assert.equal(sensitiveRow?.status, "review_signal");
  assert.equal(sensitiveRow?.selfSufficient, true);
  assert.equal(sensitiveRow?.evidenceFields.includes("sensitiveThirdPartyTrackingVendors"), true);

  const limitUseRow = audit.rowAudits.find((row) => row.rowId === "limit_use_sensitive_pi");
  assert.equal(limitUseRow?.status, "potential_gap");
  assert.equal(limitUseRow?.selfSufficient, true);
  assert.equal(limitUseRow?.evidenceFields.includes("sensitivePiCategories"), true);
  assert.equal(limitUseRow?.evidenceFields.includes("limitUsePathObserved"), true);

  const potentialGaps = audit.rowAudits.filter((row) => row.status === "potential_gap");
  assert.equal(
    potentialGaps.every((row) => row.normalizedConcernKeys.length > 0),
    true
  );
});
