import assert from "node:assert/strict";
import test from "node:test";
import { REJECT_CLICK_TRACKING_COPY } from "./consent-action-copy";

test("Care and Bologna cookie-only after-click evidence is not described as network tracking", () => {
  // Retained scans bd4c00ae-7d56-4d4d-9d67-c9d01675e8f7 and
  // d9af96c9-1dde-4497-ac5d-f5d93fa25040: zero requests, positive storage,
  // completed click/window, unconfirmed registration.
  assert.match(REJECT_CLICK_TRACKING_COPY.label, /cookies or services/);
  assert.match(REJECT_CLICK_TRACKING_COPY.label, /click/);
  assert.doesNotMatch(REJECT_CLICK_TRACKING_COPY.description, /requests started/);
  assert.match(REJECT_CLICK_TRACKING_COPY.description, /registration is reported separately/);
});
