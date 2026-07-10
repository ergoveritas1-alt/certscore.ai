import assert from "node:assert/strict";
import test from "node:test";
import {
  SCAN_NO_GO_REASON_CODES,
  SCAN_NO_GO_REASON_PRESENTATIONS,
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

test("projects a public-safe structured no-go result without diagnostic codes", () => {
  const projection = projectExternalScanNoGo({
    scan_no_go_assessment: { decision: "no_go", reasonCodes: ["site_not_ready", "scan_no_go_corroborated"] },
    visual_access_review: { page_state: "parked_or_placeholder", reason_code: "site_not_ready" }
  });
  assert.equal(projection?.resultDisposition, "no_go");
  assert.equal(projection?.noGo.reasonCode, "site_not_ready");
  assert.equal(projection?.noGo.title, "The site is not ready for scanning");
  assert.doesNotMatch(JSON.stringify(projection), /scan_no_go_corroborated/);
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
