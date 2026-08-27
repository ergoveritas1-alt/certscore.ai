import assert from "node:assert/strict";
import test from "node:test";

import { isReportableGdprEprivacyCoverageRowId } from "./gdpr-eprivacy-reportable-rows";

test("production Reject-path outcome is reportable through the canonical checklist projection", () => {
  assert.equal(isReportableGdprEprivacyCoverageRowId("post_reject_tracking_reduction"), true);
});

test("unapproved deferred rows remain outside production report projection", () => {
  assert.equal(isReportableGdprEprivacyCoverageRowId("preference_withdrawal_control"), false);
  assert.equal(isReportableGdprEprivacyCoverageRowId("analytics_vendor_observed"), false);
});
