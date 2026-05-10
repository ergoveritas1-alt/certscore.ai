import assert from "node:assert/strict";
import test from "node:test";

import { EXECUTIVE_SUMMARY_TOP_FINDING_IDS } from "../../lib/scans/rank-findings";
import { buildOpsInterruptionSummary } from "./ops-interruption-summary";
import { OPS_SCAN_STATUS_FINDING_IDS } from "./ops-status-finding-ids";

test("ops scan status finding counts cover every executive top-finding ID", () => {
  assert.deepEqual(OPS_SCAN_STATUS_FINDING_IDS, EXECUTIVE_SUMMARY_TOP_FINDING_IDS);
});

const cleanScan = {
  error_message: null,
  pages_scanned: 3,
  status: "completed"
};

test("ops interruption summary reports clean completed scans without not-reported fallback", () => {
  const summary = buildOpsInterruptionSummary({
    scan: cleanScan,
    snapshot: {
      access_posture_class: "tolerant",
      homepage_fetch_http_status: 200,
      homepage_fetch_status: "ok"
    }
  });

  assert.equal(summary.accessPostureClass, "tolerant");
  assert.equal(summary.hasInterruption, false);
  assert.deepEqual(summary.categories, []);
  assert.equal(summary.source, "snapshot");
});

test("ops interruption summary classifies captcha and challenge snapshots", () => {
  const summary = buildOpsInterruptionSummary({
    scan: {
      ...cleanScan,
      pages_scanned: 0
    },
    snapshot: {
      access_posture_class: "early_loss",
      block_page_classification: "captcha_probable",
      captcha_flag: true,
      homepage_fetch_http_status: 403,
      homepage_fetch_status: "forbidden",
      stop_reason_code: "reachability_blocked_captcha",
      stop_reason_detail: "Captcha challenge blocked homepage verification."
    }
  });

  assert.equal(summary.hasInterruption, true);
  assert.deepEqual(summary.categories, [
    "scans_with_any_interruption",
    "captcha_or_security_challenge",
    "bot_block_or_forbidden"
  ]);
  assert.equal(summary.stopReasonCode, "reachability_blocked_captcha");
});

test("ops interruption summary classifies auth walls", () => {
  const summary = buildOpsInterruptionSummary({
    scan: {
      ...cleanScan,
      pages_scanned: 0
    },
    snapshot: {
      access_posture_class: "early_loss",
      auth_wall_detected: true,
      homepage_fetch_http_status: 401,
      homepage_fetch_status: "blocked",
      stop_reason_code: "reachability_blocked_auth_wall"
    }
  });

  assert.equal(summary.hasInterruption, true);
  assert.deepEqual(summary.categories, [
    "scans_with_any_interruption",
    "authentication_wall",
    "bot_block_or_forbidden"
  ]);
});

test("ops interruption summary classifies robots and timeout snapshots", () => {
  const robots = buildOpsInterruptionSummary({
    scan: {
      ...cleanScan,
      pages_scanned: 0
    },
    snapshot: {
      access_posture_class: "robots_limited",
      robots_allowed: false,
      stop_reason_code: "robots_restricted"
    }
  });
  const timeout = buildOpsInterruptionSummary({
    scan: {
      ...cleanScan,
      pages_scanned: 0
    },
    snapshot: {
      access_posture_class: "early_loss",
      homepage_fetch_status: "timeout",
      stop_reason_code: "timeout_navigation"
    }
  });

  assert.deepEqual(robots.categories, ["scans_with_any_interruption", "robots_or_policy_block"]);
  assert.deepEqual(timeout.categories, ["scans_with_any_interruption", "timeout_or_navigation_failure"]);
});
