import assert from "node:assert/strict";
import test from "node:test";
import { getAdminScanThrottleMs } from "../scan-access";
import { getRescanAvailability } from "./rescan-policy";

test("rescan availability uses the public one-minute throttle by default", () => {
  const availability = getRescanAvailability({
    activeScanExists: false,
    lastScannedAt: "2026-05-29T12:00:00.000Z",
    now: new Date("2026-05-29T12:00:30.000Z"),
    planCode: "free"
  });

  assert.equal(availability.allowed, false);
  assert.equal(availability.nextAllowedAt, "2026-05-29T12:01:00.000Z");
});

test("rescan availability accepts a shorter admin-only cooldown override", () => {
  const availability = getRescanAvailability({
    activeScanExists: false,
    lastScannedAt: "2026-05-29T12:00:00.000Z",
    now: new Date("2026-05-29T12:00:30.000Z"),
    planCode: "free",
    rescanCooldownMs: getAdminScanThrottleMs()
  });

  assert.equal(availability.allowed, true);
  assert.equal(availability.nextAllowedAt, "2026-05-29T12:00:30.000Z");
});
