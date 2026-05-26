import assert from "node:assert/strict";
import test from "node:test";
import { getFullScanQueueErrorCode } from "./full-scan-errors";

test("full scan queue errors preserve active scan specificity", () => {
  assert.equal(
    getFullScanQueueErrorCode("A scan is already queued or running for this website."),
    "active_scan_exists"
  );
});

test("full scan queue errors distinguish recent scan cooldowns", () => {
  assert.equal(
    getFullScanQueueErrorCode(
      "Scan requests are limited to one request every 5 minutes. Try again after 10:45 AM."
    ),
    "rescan_cooldown"
  );
});

test("full scan queue errors distinguish monthly usage limits", () => {
  assert.equal(getFullScanQueueErrorCode("You’ve already used the Trial plan scan allowance for this month."), "monthly_usage_limit");
  assert.equal(
    getFullScanQueueErrorCode("You’ve reached the Pro manual scan limit of 100 for this billing period."),
    "monthly_usage_limit"
  );
});

test("full scan queue errors distinguish domain limits", () => {
  assert.equal(getFullScanQueueErrorCode("You’ve reached the Trial plan website limit."), "domain_limit");
  assert.equal(
    getFullScanQueueErrorCode("This domain is already connected to your workspace."),
    "domain_already_connected"
  );
});

test("full scan queue errors keep queue and domain failures separate", () => {
  assert.equal(getFullScanQueueErrorCode("Full scan queue availability is degraded."), "scan_queue_unavailable");
  assert.equal(getFullScanQueueErrorCode("Enter a valid website domain."), "invalid_domain");
});
