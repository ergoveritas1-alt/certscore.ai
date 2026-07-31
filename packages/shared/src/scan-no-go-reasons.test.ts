import assert from "node:assert/strict";
import test from "node:test";
import {
  SCAN_NO_GO_REASON_CODES,
  SCAN_NO_GO_REASON_PRESENTATIONS,
  SCAN_NO_GO_SNAPSHOT_OUTCOMES,
  isScanNoGoSnapshotOutcome,
  resolveScanNoGoPresentation,
  projectExternalScanNoGo,
} from "./scan-no-go-reasons";

test("every canonical scan no-go reason has complete customer and snapshot presentation", () => {
  assert.deepEqual(Object.keys(SCAN_NO_GO_REASON_PRESENTATIONS).sort(), [...SCAN_NO_GO_REASON_CODES].sort());
  for (const code of SCAN_NO_GO_REASON_CODES) {
    const presentation = SCAN_NO_GO_REASON_PRESENTATIONS[code];
    assert.equal(presentation.code, code);
    assert.ok(presentation.customerTitle.length > 10, code);
    assert.ok(presentation.explanation.length > 20, code);
    assert.ok(presentation.reportSummary.length > 20, code);
    assert.ok(presentation.recommendedNextAction.length > 20, code);
    assert.ok(presentation.snapshotStopReasonCode.length > 5, code);
    assert.ok(presentation.snapshotStopReasonLabel.length > 5, code);
    assert.ok(presentation.snapshotStopReasonDetail.length > 20, code);
    assert.ok(!presentation.customerTitle.includes("_"), code);
  }
});

test("canonical no-go detection covers every persisted reason-specific outcome", () => {
  for (const presentation of Object.values(SCAN_NO_GO_REASON_PRESENTATIONS)) {
    assert.ok(SCAN_NO_GO_SNAPSHOT_OUTCOMES.includes(presentation.snapshotScanOutcome));
    assert.equal(isScanNoGoSnapshotOutcome(presentation.snapshotScanOutcome), true);
    assert.equal(
      resolveScanNoGoPresentation(presentation.snapshotScanOutcome).limitationKind,
      presentation.limitationKind,
    );
  }
  assert.equal(isScanNoGoSnapshotOutcome("no_go"), true);
  assert.equal(isScanNoGoSnapshotOutcome("completed_successfully"), false);
  assert.equal(isScanNoGoSnapshotOutcome(null), false);
});

test("legacy reachability outcomes remain visible as no-go", () => {
  for (const outcome of [
    "reachability_blocked_homepage_403",
    "reachability_blocked_homepage_401",
    "reachability_blocked_challenge_suspected",
    "reachability_blocked_captcha",
    "reachability_blocked_auth_wall",
    "reachability_blocked_geo_or_reputation",
    "transport_failure",
    "timeout_navigation",
    "unknown_access_limitation",
    "domain_inactive_or_unstable",
    "verification_incomplete"
  ]) {
    assert.equal(isScanNoGoSnapshotOutcome(outcome), true, outcome);
  }
});

test("projects a public-safe structured no-go result without diagnostic codes", () => {
  const projection = projectExternalScanNoGo({
    scan_no_go_assessment: { decision: "no_go", reasonCodes: ["site_not_ready", "scan_no_go_corroborated"] },
    visual_access_review: {
      page_state: "parked_or_placeholder",
      reason_code: "site_not_ready",
      key_visual_evidence: ["Your browser cannot render the visitor. Check back at launch."]
    }
  });
  assert.equal(projection?.resultDisposition, "no_go");
  assert.equal(projection?.noGo.reasonCode, "site_not_ready");
  assert.equal(projection?.noGo.title, "The site is not ready for scanning");
  assert.equal(projection?.noGo.evidenceExcerpt, "Your browser cannot render the visitor. Check back at launch.");
  assert.doesNotMatch(JSON.stringify(projection), /scan_no_go_corroborated/);
});

test("public no-go evidence excerpts are bounded and do not surface code-only diagnostics", () => {
  const projection = projectExternalScanNoGo({
    scan_no_go_assessment: { decision: "no_go", reasonCodes: ["not_found_404"] },
    visual_access_review: {
      reason_code: "not_found_404",
      key_visual_evidence: ["not_found_404", `Page not found ${"x".repeat(500)}`]
    }
  });
  assert.match(projection?.noGo.evidenceExcerpt ?? "", /^Page not found/);
  assert.ok((projection?.noGo.evidenceExcerpt?.length ?? 0) <= 360);
});

test("external no-go projection uses unknown fallback without exposing the internal reason", () => {
  const projection = projectExternalScanNoGo({
    scan_no_go_assessment: { decision: "no_go", reasonCodes: ["future_private_classifier", "scan_no_go_corroborated"] },
    visual_access_review: { page_state: "future_state", reason_code: "future_private_classifier" }
  });
  assert.equal(projection?.noGo.reasonCode, "unknown");
  assert.equal(projection?.noGo.title, "The public site could not be verified");
  assert.doesNotMatch(JSON.stringify(projection), /future_private_classifier/);
});

test("Cerebras site-not-ready presentation identifies prelaunch state and launch retry guidance", () => {
  const presentation = resolveScanNoGoPresentation("site_not_ready", "parked_or_placeholder");
  assert.equal(presentation.customerTitle, "The site is not ready for scanning");
  assert.match(presentation.explanation, /prelaunch/i);
  assert.match(presentation.recommendedNextAction, /after the public website launches/i);
  assert.doesNotMatch(presentation.customerTitle, /capture failed/i);
  assert.equal(presentation.snapshotStopReasonCode, "homepage_site_not_ready");
});

test("legacy page-state reasons resolve to friendly canonical copy", () => {
  const presentation = resolveScanNoGoPresentation("maintenance_recharging_page", "maintenance_or_unavailable");
  assert.equal(presentation.code, "maintenance_or_unavailable");
  assert.equal(presentation.internalReasonCode, "maintenance_recharging_page");
  assert.equal(presentation.usedFallback, true);
  assert.doesNotMatch(presentation.customerTitle, /maintenance_recharging_page/);
});

test("unknown no-go reasons use generic customer copy while retaining the internal code", () => {
  const presentation = resolveScanNoGoPresentation("future_unknown_reason", "future_state");
  assert.equal(presentation.customerTitle, "The public site could not be verified");
  assert.equal(presentation.internalReasonCode, "future_unknown_reason");
  assert.equal(presentation.usedFallback, true);
  assert.doesNotMatch(presentation.customerTitle, /future_unknown_reason/);
  assert.doesNotMatch(presentation.explanation, /future_unknown_reason/);
});
