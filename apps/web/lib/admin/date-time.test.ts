import assert from "node:assert/strict";
import test from "node:test";
import { formatAdminCompactDateTime, formatAdminDateTime } from "./date-time";

test("admin date-time formats include seconds", () => {
  const timestamp = "2026-08-25T03:06:07.000Z";

  assert.equal(formatAdminDateTime(timestamp), "Aug 24, 2026, 8:06:07 PM PDT");
  assert.equal(formatAdminCompactDateTime(timestamp), "Aug 24, 8:06:07 PM");
});

test("admin date-time formats preserve their fallbacks", () => {
  assert.equal(formatAdminDateTime(null), "Not available");
  assert.equal(formatAdminCompactDateTime(null), "Never");
});
